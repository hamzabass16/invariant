import "server-only";

import type { Vault } from "@/lib/vault";
import { earningsFileSchema } from "@/lib/earnings";
import { EMPTY_RECORDS, recordsSchema } from "@/lib/preferences";
import type { Holding } from "@/lib/holdings";
import { EMPTY_THESES, latestReportFor, ownValuationOf, recordFromWrite, stageToday, thesesFileSchema, thesisFor, ThesisWriteProblem, valuationFromWrite, valuationSeedOf, withValuationInputs, writeThesis, writesRecord, type ThesisWrite, type ThesisWriteOutcome } from "@/lib/theses";
import { valuationDefaults } from "@/lib/valuation";
import { listingRate } from "@/lib/markets-feed";
import { localDay } from "@/lib/time";
import { EMPTY_THESIS_WRITES, evidenceOnly, PART_WORDS, thesisWritesFileSchema, withPendingWrite } from "@/lib/thesis-writes";

/**
 * Applies what the person's own Claude wrote through the connector
 * (write_thesis) to their theses file: the file is read, the write applied by
 * the pure `writeThesis` (which refuses anything that does not fit), and the
 * file written back. A stock write may also carry the record's part (Hamza,
 * 19 Oct 2026): the kill signals and triggers, the price levels and the
 * Valuation calculator's inputs, laid on what the filings seed from the
 * latest report (`valuationFromWrite`), whose chosen cases become the own
 * valuation on the record (`recordFromWrite`); a symbol not held gets a
 * record, which puts it on the watchlist. The second of the MCP server's two
 * writes, both to the person's own vault alone (Hamza, 18 Oct 2026); nothing
 * else moves: no DCF, class, alert or order. With `email`, the Community
 * card the person shares is rebuilt from the new file (lib/community-run.ts).
 */
export async function writeThesisInto(vault: Vault, write: ThesisWrite, now: Date, holdings: readonly Holding[] = [], email: string | null = null): Promise<ThesisWriteOutcome> {
  const today = localDay(now);
  const iso = now.toISOString();
  const file = (await vault.readJson("theses", thesesFileSchema)) ?? EMPTY_THESES;
  const outcome = writeThesis(file, write, now, today);
  let theses = outcome.file;
  const changed = [...outcome.changed];
  if (write.kind === "stock") {
    const symbol = write.symbol.toUpperCase();
    const holding = holdings.find((h) => h.symbol.toUpperCase() === symbol) ?? null;
    const records = (await vault.readJson("records", recordsSchema)) ?? EMPTY_RECORDS;
    const key = Object.keys(records.bySymbol).find((k) => k.toUpperCase() === symbol) ?? holding?.symbol ?? symbol;
    const prev = records.bySymbol[key] ?? null;
    let ownValuation: ReturnType<typeof ownValuationOf> | undefined;
    if (write.valuation) {
      const readings: Record<string, number | null | undefined> = { price: holding?.price ?? null, ...(holding?.fundamentals ?? {}) };
      const thesis = thesisFor(theses, symbol);
      const earnings = await vault.readJson("earnings", earningsFileSchema).catch(() => null);
      const seed = valuationSeedOf(latestReportFor(earnings, symbol));
      const fx = seed && holding ? (await listingRate(holding.currency, seed.currency, today)).fx : null;
      const seeded = seed ? valuationDefaults(seed, thesis?.valuation?.stage ?? stageToday(readings), holding?.price ?? null, holding?.currency ?? null, today, !!thesis?.dcf, fx) : null;
      const inputs = valuationFromWrite(write.valuation, thesis?.valuation ?? null, seeded, today);
      if (inputs) {
        theses = withValuationInputs(theses, symbol, inputs, iso);
        ownValuation = ownValuationOf(inputs, thesis?.dcf ?? null, readings, holding?.price ?? null, holding?.currency ?? null, today);
        changed.push(ownValuation ? `calculator (${inputs.method})` : `calculator (${inputs.method}, which the figures cannot value yet)`);
      }
      const c = write.valuation.cases;
      if (c) ownValuation = { low: Math.min(c.bear, c.base), base: c.base, high: Math.max(c.bull, c.base), asOf: today, basis: `Claude's estimate, per share${holding?.currency ? ` in ${holding.currency}` : ""}` };
      if (!inputs && !c) throw new ThesisWriteProblem(`The calculator has nothing to seed for ${symbol}: no post-earnings report is on file yet, so the filings' per-share figures are not read. Give cases (bear, base and bull per share) instead, or have the person read the results on Earnings first.`);
    }
    const rw = recordFromWrite(prev, { triggers: write.triggers, levels: write.levels, ownValuation }, iso);
    const watchlisted = !holding && !prev;
    if (rw.changed.length || watchlisted) {
      await vault.writeJson("records", { ...records, bySymbol: { ...records.bySymbol, [key]: rw.record }, updated: iso });
      changed.push(...rw.changed, ...(watchlisted ? ["added to the watchlist"] : []));
    }
    if (!writesRecord(write) && !outcome.changed.length) throw new ThesisWriteProblem("Nothing to write.");
  }
  await vault.writeJson("theses", theses);
  // The Community card, when the person shares one, carries the new words at once (Hamza, 19 Oct 2026).
  if (email) await (await import("@/lib/community-run")).republishQuietly(vault, email, now);
  return { ...outcome, file: theses, changed };
}

export type ThesisProposalOutcome = { applied: true; outcome: ThesisWriteOutcome } | { applied: false; subject: string; parts: string[]; isNew: boolean; replaced: boolean };

/**
 * What write_thesis does since the beta (Hamza, 9 Nov 2026): the write is
 * checked against the thesis as kept (`writeThesis` refuses what does not
 * fit, so Claude hears at once) and kept pending in `thesis_writes` for the
 * person to approve, part by part, on the Theses screen; an evidence entry
 * alone is added at once, since it replaces none of their words.
 */
export async function proposeThesisWriteInto(vault: Vault, write: ThesisWrite, now: Date, holdings: readonly Holding[] = [], email: string | null = null): Promise<ThesisProposalOutcome> {
  if (evidenceOnly(write)) return { applied: true, outcome: await writeThesisInto(vault, write, now, holdings, email) };
  const theses = (await vault.readJson("theses", thesesFileSchema)) ?? EMPTY_THESES;
  writeThesis(theses, write, now, localDay(now));
  const prev = (await vault.readJson("thesis_writes", thesisWritesFileSchema)) ?? EMPTY_THESIS_WRITES;
  const { file, entry } = withPendingWrite(prev, theses, write, now);
  await vault.writeJson("thesis_writes", file);
  return { applied: false, subject: entry.name, parts: entry.parts.map((p) => PART_WORDS[p]), isNew: entry.isNew, replaced: prev.pending.some((p) => p.key === entry.key) };
}
