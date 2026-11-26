import "server-only";

import type { DecisionsFile } from "@/lib/decisions";
import type { Book } from "@/lib/holdings";
import { calibrationOf, CALIBRATION_DAYS, decidingLetter, plannedTrades, POSTMORTEM_DAYS, POSTMORTEM_KEEP_DAYS, postMortems, reasonedTrades } from "@/lib/judgement";
import { loadCloses } from "@/lib/markets-feed";
import { evaluate, type Methodology } from "@/lib/methodology";
import type { Records } from "@/lib/preferences";
import type { Setup } from "@/lib/setup";
import { addDaysTo } from "@/lib/time";

/** The monthly letter's parts, read from the book, the Decision Log, the records' valuations and the closes since (lib/judgement.ts). */
export async function letterFor(book: Book, methodology: Methodology | null, inputs: Setup["inputs"], decisions: DecisionsFile | null, records: Records, today: string) {
  const valuations = Object.fromEntries(Object.entries(records.bySymbol).map(([s, r]) => [s.toUpperCase(), r.ownValuation ?? null]));
  const due = Object.entries(valuations).filter(([, v]) => v && addDaysTo(v.asOf, CALIBRATION_DAYS) <= today).map(([s]) => s);
  const traded = [...new Set(book.transactions.filter((t) => t.kind === "buy" || t.kind === "sell").map((t) => t.symbol.trim().toUpperCase()))];
  const symbols = [...new Set([...traded, ...due])].slice(0, 60);
  const closes = symbols.length ? await loadCloses([...symbols, "SPY"].join(","), today, "budget", Math.max(POSTMORTEM_DAYS + POSTMORTEM_KEEP_DAYS, CALIBRATION_DAYS * 2) + 30).catch(() => null) : null;
  const series = closes?.series ?? {};
  const findings = methodology ? evaluate(methodology, book, today, inputs) : [];
  const measured = findings.filter((f) => f.status === "pass" || f.status === "near" || f.status === "fail");
  const kept = measured.filter((f) => f.status !== "fail").length;
  return decidingLetter({
    month: today.slice(0, 7),
    entries: decisions?.entries ?? [],
    reasoned: reasonedTrades(book, decisions, series, today),
    planned: plannedTrades(book, decisions, series, today),
    calibration: calibrationOf(valuations, series, today),
    rules: methodology ? { score: measured.length ? Math.round((kept / measured.length) * 100) : null, measured: measured.length, breaches: measured.length - kept } : null,
    postMortems: postMortems(book, decisions, series, today),
  });
}
