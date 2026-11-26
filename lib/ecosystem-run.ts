import "server-only";

import { operatorEmails } from "@/lib/deployment";
import { annualReport, knownTickers, lookupCompany, operatorContact } from "@/lib/edgar";
import { businessSections, ecoCandidate, ecoNeedsRead, ecoRequestBody, ecosystemSchema, ECO_MODEL, ECO_VERSION, failedEco, parseEcoResponse, type Ecosystem } from "@/lib/ecosystem";
import { providerFor } from "@/lib/hosted-model";
import { loadMarketDay } from "@/lib/markets-feed";
import { callModel } from "@/lib/methodology-draft";
import { modelFor, type ModelProvider, type ModelRequest } from "@/lib/model-provider";
import type { EdgarContact } from "@/lib/preferences";
import { keepSharedFigures, registryAvailable, sharedFigures } from "@/lib/registry";
import { universeOf } from "@/lib/screener";
import { SyncError } from "@/lib/sync-error";
import type { Vault } from "@/lib/vault";

export type EcoRun = { read: number; failed: number; checked: number; sentence: string };

/** The ecosystems kept for everyone, by symbol (all, or those named); one that fails its schema is left out. Empty with no registry. */
export async function keptEcosystems(symbols?: readonly string[]): Promise<Record<string, Ecosystem>> {
  if (!registryAvailable()) return {};
  const rows = await sharedFigures("eco", symbols?.map((s) => s.toUpperCase()));
  const out: Record<string, Ecosystem> = {};
  for (const r of rows) {
    const e = ecosystemSchema.safeParse(r.entry);
    if (e.success) out[r.symbol] = e.data;
  }
  return out;
}

/** The ecosystem kept for one company, or null; a registry that cannot be read is null too, so the page never fails on it. */
export async function ecosystemFor(symbol: string): Promise<Ecosystem | null> {
  try {
    return (await keptEcosystems([symbol]))[symbol.toUpperCase()] ?? null;
  } catch {
    return null;
  }
}

type Outcome = "read" | "failed" | "checked" | "none";

/**
 * One company: its latest annual report from the SEC, read again only when
 * it is newer than the one kept; its business section to the model, every
 * relation checked against the text (lib/ecosystem.ts); kept for everyone.
 * A failed read keeps the last good one, marked to be tried again.
 */
async function readOne(symbol: string, name: string, kept: Ecosystem | null, provider: ModelProvider, model: string, contact: EdgarContact, tickers: ReadonlySet<string> | null): Promise<Outcome> {
  const at = new Date().toISOString();
  const keep = (entry: Ecosystem) => keepSharedFigures("eco", [{ symbol, entry, readAt: at }]);
  let filing: Awaited<ReturnType<typeof annualReport>> = null;
  try {
    const row = await lookupCompany(symbol, contact);
    if (!row) {
      await keep(failedEco(kept, symbol, null, at, "The SEC's list carries no company under this ticker."));
      return "failed";
    }
    filing = await annualReport(row.cik, contact, kept && !kept.error && (kept.version ?? 0) >= ECO_VERSION ? kept.accession : null);
    if (!filing) {
      await keep(failedEco(kept, symbol, null, at, "The SEC lists no annual report (10-K, 20-F or 40-F) for this company."));
      return "failed";
    }
    if (kept && !ecoNeedsRead(kept, filing.filing)) {
      await keep({ ...kept, checkedAt: at });
      return "checked";
    }
    if (!filing.text) return "none";
    const part = businessSections(filing.text, filing.filing.form);
    const answer = await callModel(provider, ecoRequestBody({ symbol, name: row.title || name }, filing.filing, part.text, model) as ModelRequest, { agent: "ecosystem", step: "read", subject: symbol });
    const parsed = parseEcoResponse(answer, part.text, symbol, tickers);
    if (!parsed.ok) {
      await keep(failedEco(kept, symbol, filing.filing, at, `Not read: ${parsed.reason}; tried again in two weeks.`));
      return "failed";
    }
    const notes = [parsed.note, part.cut ? "The report is long, so its business section was read to a limit." : null, part.found ? null : "The report's business section could not be found, so its start was read."].filter(Boolean).join(" ");
    await keep(
      ecosystemSchema.parse({
        symbol,
        form: filing.filing.form,
        accession: filing.filing.accession,
        filed: filing.filing.filed,
        url: filing.url,
        readAt: at,
        checkedAt: at,
        model,
        relations: parsed.relations,
        dropped: parsed.dropped,
        note: notes ? notes.slice(0, 400) : null,
        error: null,
        failedAt: null,
        version: ECO_VERSION,
      }),
    );
    return "read";
  } catch (e) {
    if (!(e instanceof SyncError)) throw e;
    console.error(`[ecosystem] a company: ${e.logDetail ?? "failed"}`);
    await keep(failedEco(kept, symbol, filing?.filing ?? null, at, `${e.message} Tried again in two weeks.`));
    return "failed";
  }
}

const tally = (outs: Outcome[]) => ({ read: outs.filter((o) => o === "read").length, failed: outs.filter((o) => o === "failed").length, checked: outs.filter((o) => o === "checked").length });

/**
 * The ecosystems read for everyone at the 05:00 UTC run (Hamza, 21 Nov
 * 2026): the S&P 500's and the Nasdaq-100's companies due (lib/ecosystem.ts
 * ecoCandidate), the largest first, `max` at most and none started past
 * `budgetMs`, each one call on the deployment's key metered to the operator
 * (the first of OPERATOR_EMAILS), with the deployment's own SEC contact.
 * Public filings alone; nothing of anyone's book goes in the call.
 */
export async function readEcosystems(now: Date, max: number, budgetMs: number): Promise<EcoRun> {
  const started = Date.now();
  if (!registryAvailable()) return { read: 0, failed: 0, checked: 0, sentence: "The registry is not set up, so the companies' ecosystems are not read." };
  const contact = operatorContact();
  if (!contact) return { read: 0, failed: 0, checked: 0, sentence: "This deployment names no contact for the SEC (SEC_CONTACT), so the companies' ecosystems are not read." };
  const owner = operatorEmails()[0] ?? null;
  const provider = owner ? await providerFor({ owner }) : null;
  if (!provider) return { read: 0, failed: 0, checked: 0, sentence: owner ? "The AI is not set up on this deployment yet, so the companies' ecosystems are not read." : "This deployment names no operator (OPERATOR_EMAILS), so the companies' ecosystems are not read." };
  const { day } = await loadMarketDay(now, "full");
  if (!day?.moves.length) return { read: 0, failed: 0, checked: 0, sentence: "The S&P 500's list could not be read, so the ecosystems wait for the next run." };
  const kept = await keptEcosystems();
  const due = universeOf(day).filter((u) => ecoCandidate(kept[u.symbol], now)).slice(0, max);
  const model = modelFor(provider, process.env.ANTHROPIC_ECO_MODEL || ECO_MODEL);
  const tickers = await knownTickers(contact).catch(() => null);
  const outs: Outcome[] = [];
  for (const u of due) {
    if (Date.now() - started > budgetMs) break;
    outs.push(await readOne(u.symbol, u.name ?? u.symbol, kept[u.symbol] ?? null, provider, model, contact, tickers));
  }
  const t = tally(outs);
  return { ...t, sentence: due.length ? `Ecosystems: ${t.read} read${t.failed ? `, ${t.failed} not` : ""}${t.checked ? `, ${t.checked} unchanged` : ""}.` : "Ecosystems: none due." };
}

/**
 * On opening the app, the first company the person holds or watches whose
 * ecosystem is due (`symbols`, in their order), one at most, on the
 * deployment's key metered to them, with their own SEC contact; kept for
 * everyone, so the next person who holds it reads it at once. The ticker
 * alone leaves the vault.
 */
export async function ecosystemOnOpen(vault: Vault, symbols: readonly string[], contact: EdgarContact, now: Date): Promise<EcoRun | null> {
  if (!registryAvailable() || !symbols.length) return null;
  const list = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const kept = await keptEcosystems(list);
  const symbol = list.find((s) => ecoCandidate(kept[s], now));
  if (!symbol) return null;
  const provider = await providerFor(vault);
  if (!provider) return null;
  const tickers = await knownTickers(contact).catch(() => null);
  const out = await readOne(symbol, symbol, kept[symbol] ?? null, provider, modelFor(provider, process.env.ANTHROPIC_ECO_MODEL || ECO_MODEL), contact, tickers);
  const t = tally([out]);
  return { ...t, sentence: t.read ? "Ecosystem: one read." : "Ecosystem: none read." };
}
