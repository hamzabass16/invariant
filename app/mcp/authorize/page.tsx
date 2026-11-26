import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";

import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { isLoopback, readAuthorize, redirectWith, resourceOf } from "@/lib/mcp-auth";
import { mayConnect, mcpOpen, originOf, serverKey } from "@/lib/mcp-run";
import { sessionTokens } from "@/lib/session-tokens";
import { linkedDriveRefresh } from "@/lib/vault";

import { answerAction } from "./actions";

export const metadata = { title: "Connect your assistant · Invariant" };
export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="reveal-stack mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <p className="section-header">Your own Claude or ChatGPT</p>
      <h1 className="mt-2 text-large-title font-bold tracking-[-0.02em]">Invariant</h1>
      <span className="gilt-rule mt-3" aria-hidden />
      {children}
    </main>
  );
}

const Note = ({ children }: { children: React.ReactNode }) => <p className="mt-6 rounded-card bg-surface-2 px-4 py-3 text-subhead text-text-secondary">{children}</p>;

/**
 * The consent page Claude sends a person to when they connect Invariant:
 * signed in with the same account as the app, they see which client asks,
 * where the answer goes, and that it can only read. Nothing is granted
 * without Allow.
 */
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (mcpOpen()) return <Shell><Note>The demo&apos;s server needs no sign-in. Add its address in Claude and choose no sign-in.</Note></Shell>;
  const key = serverKey();
  if (!key) return <Shell><Note>This deployment cannot sign Claude in yet: its AUTH_SECRET is missing. Tell whoever runs it.</Note></Shell>;
  const raw = await searchParams;
  const p = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const origin = originOf(await headers());
  const read = readAuthorize(key, p, resourceOf(origin));
  if (!read.ok) {
    if ("show" in read.problem) return <Shell><Note>{read.problem.show}</Note></Shell>;
    const pr = read.problem;
    redirect(redirectWith(pr.redirect, { error: pr.error, error_description: pr.description, state: pr.state, iss: origin }) as Route);
  }
  const req = read.req;
  const query = new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email || !(await mayConnect(email))) redirect(`/sign-in?next=${encodeURIComponent(`/mcp/authorize?${query}`)}` as Route);
  const tokens = await sessionTokens();
  const usable = (!!tokens?.tokens.refresh && !!tokens.tokens.folder) || !!(await linkedDriveRefresh());
  const host = new URL(req.redirect).host;
  const local = isLoopback(req.redirect);

  return (
    <Shell>
      <p className="mt-3 text-subhead text-text-secondary">
        <span className="font-medium text-text-primary">{req.client.name}</span> asks to read your Invariant as <span className="data">{email}</span>.
      </p>
      <ul className="mt-6 space-y-2 text-subhead text-text-secondary">
        <li>It can read your holdings, figures, methodology and its checks, alerts, to-do, Decision Log, last review and research.</li>
        <li>It cannot change anything: no order, no file, no email, no setting.</li>
        <li>What it reads goes to {req.client.claude ? "Claude" : req.client.chatgpt ? "ChatGPT" : "that client"} under your own account there, and nowhere else.</li>
      </ul>
      <p className="mt-4 text-footnote text-text-tertiary">
        Sends you back to <span className="data">{host}</span>.{local ? " That is a program on this computer (Claude Code); allow it only if you started it yourself." : ""}
      </p>
      {usable ? (
        <form action={answerAction} className="mt-8 flex flex-col gap-3">
          {Object.entries(p).map(([k, v]) => (typeof v === "string" ? <input key={k} type="hidden" name={k} value={v} /> : null))}
          <Button type="submit" name="answer" value="allow" size="lg">
            Allow read-only access
          </Button>
          <Button type="submit" name="answer" value="cancel" size="lg" variant="secondary">
            Cancel
          </Button>
        </form>
      ) : (
        <Note>Your sign-in carries no lasting access to your Portfolio OS folder. Sign out of Invariant, sign in again with the folder box ticked, then connect again from {req.client.chatgpt ? "ChatGPT" : "Claude"}.</Note>
      )}
      <p className="mt-6 text-footnote text-text-tertiary">{req.client.chatgpt ? "To stop it later, delete Invariant under Settings, Apps in ChatGPT." : "To stop it later, remove Invariant under Customize, Connectors in Claude."} Not investment advice.</p>
    </Shell>
  );
}
