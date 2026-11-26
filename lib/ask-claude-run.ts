import "server-only";

import { ASK_CLAUDE_SENTENCE } from "@/lib/ask-claude";
import { SyncError } from "@/lib/sync-error";
import type { Workspace } from "@/lib/workspace";

/**
 * The server side of "Ask your Claude" (the beta's hybrid AI, Hamza, 9 Nov
 * 2026): whether a screen draws the card and whether the person's connector
 * is added, and the refusal an on-demand action gives anyone whose AI runs on
 * their own Claude, so a stale page or a crafted post never spends the
 * deployment's key.
 */
export async function askState(ws: Pick<Workspace, "askClaude" | "mode" | "operator">): Promise<{ ask: boolean; connected: boolean | null }> {
  if (!ws.askClaude) return { ask: false, connected: null };
  if (ws.mode !== "drive") return { ask: true, connected: null };
  const { connectorAdded } = await import("@/lib/beta-run");
  return { ask: true, connected: await connectorAdded(ws.operator.email) };
}

/** Throws the card's sentence when the AI asked for on demand runs on the person's own Claude. */
export function assertHostedOnDemand(ws: Pick<Workspace, "askClaude">): void {
  if (ws.askClaude) throw new SyncError(ASK_CLAUDE_SENTENCE, "on demand on own claude");
}
