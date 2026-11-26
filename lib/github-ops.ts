import "server-only";

import { checksWord, SELF_FIX_LABEL, type CheckRun, type ChecksWord } from "@/lib/improvements";
import { SyncError } from "@/lib/sync-error";

/**
 * The self-fix pull requests, for /ops alone (Hamza, 4 Nov 2026: "you
 * merge"): the open pull requests the weekly routine labelled `self-fix`,
 * each with its checks, and Merge (squash, at the head the operator saw) or
 * Close. The one file that calls GitHub, on the deployment's
 * `OPS_GITHUB_TOKEN` (a fine-grained token on the one repository: pull
 * requests and contents read and write, actions and commit statuses read;
 * GitHub offers such a token no checks permission, so a pull request's
 * checks are read from its workflow runs and commit statuses when the
 * check runs are refused) and `OPS_GITHUB_REPO` (owner/name);
 * the guard holds both here. The token is never logged, echoed or shown;
 * a failure is a sentence and the status alone.
 */

const API = "https://api.github.com";
const BUDGET_MS = 10_000;
const REPO = /^[\w.-]+\/[\w.-]+$/;

export type OpsRepo = { repo: string; token: string | null };
export type SelfFixPull = { number: number; title: string; url: string; author: string; sha: string; createdAt: string; draft: boolean; checks: ChecksWord };

/** The repository /ops reads, and the token when one is set. Null without a repository written owner/name. */
export function githubOpsConfig(): OpsRepo | null {
  const repo = (process.env.OPS_GITHUB_REPO ?? "").trim();
  if (!REPO.test(repo)) return null;
  const token = (process.env.OPS_GITHUB_TOKEN ?? "").trim() || null;
  return { repo, token };
}

/** The repository's own list of self-fix pull requests, for when there is no token. */
export const pullsLink = (repo: string) => `https://github.com/${repo}/pulls?q=${encodeURIComponent(`is:pr is:open label:${SELF_FIX_LABEL}`)}`;

async function call(cfg: OpsRepo, path: string, init: { method?: string; body?: unknown } = {}): Promise<unknown> {
  if (!cfg.token) throw new SyncError("No GitHub token is set for this deployment.");
  let res: Response;
  try {
    res = await fetch(`${API}/repos/${cfg.repo}${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${cfg.token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(init.body ? { "content-type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(BUDGET_MS),
    });
  } catch {
    throw new SyncError("GitHub could not be reached.", "github_unreachable");
  }
  if (res.status === 401 || res.status === 403) throw new SyncError("GitHub refused the token. It needs pull requests and contents read and write on the repository.", `github_${res.status}`);
  if (res.status === 404) throw new SyncError("GitHub does not know that repository or pull request, or the token cannot see it.", "github_404");
  if (res.status === 405 || res.status === 409) throw new SyncError("GitHub would not merge it: the branch moved, a check is required or it conflicts. Look at it on GitHub.", `github_${res.status}`);
  if (res.status === 422) throw new SyncError("GitHub would not take that change. Look at it on GitHub.", "github_422");
  if (!res.ok) throw new SyncError(`GitHub answered ${res.status}.`, `github_${res.status}`);
  return res.status === 204 ? null : res.json();
}

type RawPull = { number: number; title: string; html_url: string; user?: { login?: string }; head?: { sha?: string }; created_at: string; draft?: boolean; labels?: { name?: string }[] };
type RawRuns = { check_runs?: CheckRun[] };
type RawWorkflowRuns = { workflow_runs?: CheckRun[] };
type RawStatus = { statuses?: { state?: string }[] };

/** A commit status read as a check run: pending is running, success passed, anything else failed. */
const statusRun = (state = ""): CheckRun => (state === "pending" ? { status: "in_progress", conclusion: null } : { status: "completed", conclusion: state === "success" ? "success" : "failure" });

/**
 * A head's checks: its check runs, else (a fine-grained token cannot read
 * them) its workflow runs and its commit statuses together; none read is
 * "none", never passing.
 */
async function checksOf(cfg: OpsRepo, sha: string): Promise<ChecksWord> {
  if (!sha) return "none";
  const runs = await call(cfg, `/commits/${sha}/check-runs?per_page=100`).then((r) => (r as RawRuns).check_runs ?? null).catch(() => null);
  if (runs) return checksWord(runs);
  const [actions, statuses] = await Promise.all([
    call(cfg, `/actions/runs?head_sha=${sha}&per_page=100`).then((r) => (r as RawWorkflowRuns).workflow_runs ?? []).catch(() => [] as CheckRun[]),
    call(cfg, `/commits/${sha}/status`).then((r) => ((r as RawStatus).statuses ?? []).map((x) => statusRun(x.state))).catch(() => [] as CheckRun[]),
  ]);
  return checksWord([...actions, ...statuses]);
}

/** The open pull requests labelled self-fix, the newest first, each with its checks. */
export async function selfFixPulls(cfg: OpsRepo): Promise<SelfFixPull[]> {
  const pulls = ((await call(cfg, "/pulls?state=open&per_page=50&sort=created&direction=desc")) as RawPull[]).filter((p) => (p.labels ?? []).some((l) => l.name === SELF_FIX_LABEL));
  return Promise.all(
    pulls.map(async (p) => {
      const sha = p.head?.sha ?? "";
      const checks = await checksOf(cfg, sha);
      return { number: p.number, title: p.title, url: p.html_url, author: p.user?.login ?? "", sha, createdAt: p.created_at, draft: Boolean(p.draft), checks };
    }),
  );
}

const asNumber = (n: number) => {
  if (!Number.isInteger(n) || n <= 0) throw new SyncError("That is not a pull request number.");
  return n;
};

/** Squash-merges one self-fix pull request at the head the operator saw; GitHub refuses when the branch has moved since. */
export async function mergePull(cfg: OpsRepo, number: number, sha: string): Promise<void> {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new SyncError("The pull request's head is not known; open /ops again.");
  const pull = (await call(cfg, `/pulls/${asNumber(number)}`)) as RawPull & { state?: string };
  if (!(pull.labels ?? []).some((l) => l.name === SELF_FIX_LABEL)) throw new SyncError("Only a pull request labelled self-fix is merged from here.");
  await call(cfg, `/pulls/${number}/merge`, { method: "PUT", body: { merge_method: "squash", sha } });
}

/** Closes one self-fix pull request without merging it. */
export async function closePull(cfg: OpsRepo, number: number): Promise<void> {
  const pull = (await call(cfg, `/pulls/${asNumber(number)}`)) as RawPull;
  if (!(pull.labels ?? []).some((l) => l.name === SELF_FIX_LABEL)) throw new SyncError("Only a pull request labelled self-fix is closed from here.");
  await call(cfg, `/pulls/${number}`, { method: "PATCH", body: { state: "closed" } });
}
