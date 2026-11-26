import "server-only";

import { providerFor } from "@/lib/hosted-model";
import type { Book } from "@/lib/holdings";
import { callModel } from "@/lib/methodology-draft";
import type { Methodology } from "@/lib/methodology";
import { modelFor, type ModelRequest } from "@/lib/model-provider";
import type { LookThrough } from "@/lib/look-through";
import { INSIGHT_MODEL, insightsRequestBody, lookFacts, methodologyLens, parseInsights, perfFacts, type PerfInsightsFile } from "@/lib/perf-insights";
import type { WindowKey } from "@/lib/performance";
import { SyncError } from "@/lib/sync-error";
import type { Vault } from "@/lib/vault";

/**
 * The Performance page read through the methodology, on the person's own
 * model, when they ask (lib/perf-insights.ts): the page's figures card by
 * card and the methodology in words go to the model (the look-through's
 * holdings by symbol, class and weight in percent), never an amount of money; the checked readings are kept in the vault's
 * `perf_insights` file, replacing the last.
 */
export async function readPerfInsights(vault: Vault, m: Methodology, book: Book, benchmarks: readonly string[], windows: { window: WindowKey; irr: WindowKey; alpha: WindowKey }, now: Date, look: LookThrough | null = null): Promise<PerfInsightsFile> {
  const provider = await providerFor(vault);
  if (!provider) throw new SyncError("The AI is not set up on this deployment yet.", "insights no provider");
  const facts = [...perfFacts(book, benchmarks, windows), ...lookFacts(look, m.classes, benchmarks)];
  if (!facts.length) throw new SyncError("Nothing on this page to read yet: it needs the account value by day.", "insights no facts");
  const lens = methodologyLens(m, benchmarks);
  const parsed = parseInsights(await callModel(provider, insightsRequestBody(facts, lens, modelFor(provider, INSIGHT_MODEL)) as ModelRequest, { agent: "perf_insights", step: "read", subject: "performance" }), facts, lens);
  if (!parsed.ok) throw new SyncError(parsed.reason, parsed.log);
  const file: PerfInsightsFile = { version: 1, at: now.toISOString(), asOf: book.asOf, windows, against: m.name, overall: parsed.overall, items: parsed.items, dropped: parsed.dropped };
  await vault.writeJson("perf_insights", file);
  return file;
}
