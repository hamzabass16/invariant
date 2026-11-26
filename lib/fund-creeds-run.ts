import "server-only";

import { operatorEmails } from "@/lib/deployment";
import { creedRequestBody, creedsDue, creedSchema, CREED_MODEL, failedCreed, parseCreedResponse, type Creeds } from "@/lib/fund-creeds";
import { FUNDS } from "@/lib/funds";
import { providerFor } from "@/lib/hosted-model";
import { callModel } from "@/lib/methodology-draft";
import { modelFor, type ModelRequest } from "@/lib/model-provider";
import { keepSharedFigures, registryAvailable, sharedFigures } from "@/lib/registry";
import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";

export type CreedsRun = { read: number; failed: number; sentence: string };

/** The creeds kept for everyone, by fund id; one that fails its schema is left out. Empty with no registry. */
export async function keptCreeds(): Promise<Creeds> {
  if (!registryAvailable()) return {};
  const rows = await sharedFigures("fund");
  const out: Creeds = {};
  for (const r of rows) {
    const c = creedSchema.safeParse(r.entry);
    if (c.success) out[r.symbol] = c.data;
  }
  return out;
}

/**
 * What the top funds say they do (lib/fund-creeds.ts), read once a quarter
 * for everyone at the 05:00 UTC run: `max` funds due, none started past
 * `budgetMs`, each one call with web search on the deployment's key, metered
 * to the operator (the first of OPERATOR_EMAILS), who runs the deployment.
 * Public pages alone: no person's book, theses or methodology goes in the
 * call, and the creed is kept in the registry's shared company_figures
 * (kind `fund`); a failed read keeps the last good one.
 */
export async function readFundCreeds(now: Date, max: number, budgetMs: number): Promise<CreedsRun> {
  const started = Date.now();
  if (!registryAvailable()) return { read: 0, failed: 0, sentence: "The registry is not set up, so the funds' own words are not read." };
  const owner = operatorEmails()[0] ?? null;
  const provider = owner ? await providerFor({ owner }) : null;
  if (!provider) return { read: 0, failed: 0, sentence: owner ? "The AI is not set up on this deployment yet, so the funds' own words are not read." : "This deployment names no operator (OPERATOR_EMAILS), so the funds' own words are not read." };
  const kept = await keptCreeds();
  const due = creedsDue(FUNDS, kept, now).slice(0, max);
  const model = modelFor(provider, process.env.ANTHROPIC_CREED_MODEL || CREED_MODEL);
  const today = localDay(now);
  let read = 0;
  let failed = 0;
  for (const d of due) {
    if (Date.now() - started > budgetMs) break;
    const readAt = new Date().toISOString();
    let entry;
    try {
      const answer = await callModel(provider, creedRequestBody(d, today, model) as ModelRequest, { agent: "fund_creeds", step: "read", subject: d.id });
      const parsed = parseCreedResponse(answer, d.id, readAt, model);
      entry = parsed.ok ? parsed.creed : failedCreed(kept[d.id], d.id, readAt, `Not read: ${parsed.reason}; tried again in a week.`);
      if (parsed.ok) read += 1;
      else failed += 1;
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      console.error(`[fund-creeds] a fund: ${e.logDetail ?? "failed"}`);
      entry = failedCreed(kept[d.id], d.id, readAt, `${e.message} Tried again in a week.`);
      failed += 1;
    }
    // A failed read over a good one keeps the good one, marked to be tried again; the registry never lets an error replace a good one.
    await keepSharedFigures("fund", [{ symbol: d.id, entry, readAt }]);
  }
  return { read, failed, sentence: due.length ? `Funds' own words: ${read} read${failed ? `, ${failed} not` : ""}.` : "Funds' own words: none due." };
}
