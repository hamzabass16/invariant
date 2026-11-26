import "server-only";

import { meterKey } from "@/lib/model-meter";
import type { ModelProvider } from "@/lib/model-provider";
import type { Vault } from "@/lib/vault";

/**
 * The one model provider every call runs on (Hamza, 4 Nov 2026: "host all of
 * the AI"): Claude on the deployment's own key, `ANTHROPIC_API_KEY`, which
 * this file alone reads (`npm run check:guard` holds it). The key goes to the
 * call and nowhere else: never a log, a screen, a response or a vault.
 *
 * Each provider carries its person's meter (a fingerprint of the sign-in,
 * `meterKey` in lib/model-meter.ts), so `callModel` and the analyst can hold
 * the month to its cap. There is no provider, and so no call, in the demo,
 * without the key, or for a vault with no sign-in behind it.
 */

/** Whether this deployment can run the AI at all: the key is set and this is not the demo. */
export function hostedAvailable(): boolean {
  return process.env.STORAGE !== "demo" && !!hostedKey();
}

function hostedKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key && /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key) ? key : null;
}

/** The provider for one person's calls, metered under their sign-in; null when the deployment cannot run the AI. */
export function hostedProvider(owner: string | null | undefined): ModelProvider | null {
  const key = hostedKey();
  if (process.env.STORAGE === "demo" || !key || !owner) return null;
  return { kind: "anthropic", apiKey: key, baseUrl: null, model: null, meter: meterKey(owner) };
}

/** The provider for the person whose vault this is, held to their plan's cap. */
export async function providerFor(vault: Pick<Vault, "owner">): Promise<ModelProvider | null> {
  const provider = hostedProvider(vault.owner);
  if (!provider || !vault.owner) return provider;
  const { capFor } = await import("@/lib/beta-run");
  return { ...provider, cap: await capFor(vault.owner) };
}

/** The sentence a screen gives when the AI cannot run here. */
export const NO_HOSTED_AI = "The AI is not set up on this deployment yet.";
