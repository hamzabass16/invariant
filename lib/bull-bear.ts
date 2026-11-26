import type { PillarReading } from "@/lib/theses";
import type { Find } from "@/lib/thesis-hunter";

/**
 * Bull and bear on a company's page (Hamza, 23 Oct 2026, after Rallies.AI),
 * built from what the person already keeps, never written by a model: their
 * own bear, base and bull per share against the price, their pillars as
 * today's figures read them, their kill signals, and what the Thesis Hunter
 * found that backs or challenges the thesis. Each line names where it comes
 * from; a side with nothing on file says what would fill it. Pure.
 */

export const CASE_LINES = 6;

export type CaseFrom = "valuation" | "pillar" | "signal" | "hunter";
export const CASE_FROM_LABEL: Record<CaseFrom, string> = { valuation: "Your valuation", pillar: "Pillar", signal: "Kill signal", hunter: "Thesis Hunter" };

export type CaseLine = { from: CaseFrom; text: string; detail: string | null; href: string | null; date: string | null };

export type BullBear = { bull: CaseLine[]; bear: CaseLine[]; owed: string[] };

const n2 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (to: number, from: number) => ((to / from - 1) * 100).toFixed(1);

export function bullBear(i: {
  price: number | null;
  ccy: string;
  ownValuation: { low: number | null; base: number; high: number | null; asOf: string; basis: string | null } | null;
  pillars: readonly PillarReading[];
  signals: readonly { kind: "trigger" | "kill"; label: string; met: boolean | null; note: string | null }[];
  finds: readonly Pick<Find, "stance" | "title" | "summary" | "source" | "sourceUrl" | "date" | "found" | "pillar" | "dismissed">[];
  hasThesis: boolean;
}): BullBear {
  const bull: CaseLine[] = [];
  const bear: CaseLine[] = [];
  const v = i.ownValuation;
  const p = i.price;
  if (v && p && p > 0) {
    const basis = v.basis ? `${v.basis}, kept ${v.asOf}` : `kept ${v.asOf}`;
    if (v.high !== null) bull.push({ from: "valuation", text: `Your bull case, ${n2(v.high)} ${i.ccy} a share, is ${pct(v.high, p)}% from the price.`, detail: basis, href: null, date: v.asOf });
    if (v.base >= p) bull.push({ from: "valuation", text: `Your base case, ${n2(v.base)}, is ${pct(v.base, p)}% above the price.`, detail: basis, href: null, date: v.asOf });
    else bear.push({ from: "valuation", text: `The price is ${pct(p, v.base)}% above your base case of ${n2(v.base)}.`, detail: basis, href: null, date: v.asOf });
    if (v.low !== null) bear.push({ from: "valuation", text: `Your bear case, ${n2(v.low)} ${i.ccy} a share, is ${pct(v.low, p)}% from the price.`, detail: basis, href: null, date: v.asOf });
  }
  for (const r of i.pillars) {
    if (r.tag === "supported") bull.push({ from: "pillar", text: `${r.pillar.name} holds: ${r.words}`, detail: r.pillar.text || null, href: null, date: null });
    else if (r.tag === "risk") bear.push({ from: "pillar", text: `${r.pillar.name} fails: ${r.words}`, detail: r.pillar.text || null, href: null, date: null });
    else if (r.tag === "mixed") bear.push({ from: "pillar", text: `${r.pillar.name} is close to its level: ${r.words}`, detail: r.pillar.text || null, href: null, date: null });
  }
  const kills = i.signals.filter((s) => s.kind === "kill");
  for (const s of kills.filter((s) => s.met)) bear.push({ from: "signal", text: `Met: ${s.label}.`, detail: s.note, href: null, date: null });
  if (kills.length && kills.every((s) => s.met === false)) bull.push({ from: "signal", text: `None of your ${kills.length} kill signal${kills.length === 1 ? "" : "s"} is met on today's figures.`, detail: null, href: null, date: null });
  const finds = i.finds.filter((f) => !f.dismissed).slice().sort((a, b) => (b.date ?? b.found).localeCompare(a.date ?? a.found));
  for (const f of finds) {
    const line: CaseLine = { from: "hunter", text: f.title, detail: `${f.summary}${f.pillar ? ` (${f.pillar})` : ""}`, href: f.sourceUrl, date: f.date ?? f.found };
    if (f.stance === "backs") bull.push(line);
    else if (f.stance === "challenges") bear.push(line);
  }
  const owed: string[] = [];
  if (!v) owed.push("Keep a valuation on the thesis, and your bull, base and bear per share are set against the price here.");
  if (!i.hasThesis) owed.push("Write a thesis with its pillars, each tested by a figure, and each is read here every day.");
  else if (!i.pillars.some((r) => r.tag !== "unread")) owed.push("Give the pillars a figure that tests them, and each is read here every day.");
  if (!kills.length) owed.push("Record the kill signals on the company, and each is read here.");
  return { bull: bull.slice(0, CASE_LINES), bear: bear.slice(0, CASE_LINES), owed };
}
