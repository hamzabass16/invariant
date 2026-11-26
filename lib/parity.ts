/**
 * Parity: how close a methodology written in recipes gets to a dashboard an
 * investor already approved, or says they would want. Given a target (what
 * that dashboard shows: figures, rules with limits, classes, panels) and a
 * methodology in the recipe language, each target item is scored:
 *
 *   computes    a recipe or rule exists and yields a number on the given book
 *               (or is a panel or class that is present);
 *   expressed   a recipe or rule exists, but gives no number on this book;
 *   waiting     expressed, but reads a field no connection supplies yet;
 *   missing     nothing in the methodology covers it: the ontology or the
 *               recipe language cannot say it yet, or the drafter missed it.
 *
 * The same scoring serves the HCMP parity check (its files stay outside this
 * repository) and the synthetic personas in data/synthetic/. Pure.
 */
import { z } from "zod";

import type { Book } from "@/lib/holdings";
import { computeFigure, contextFor, evaluate, type Methodology } from "@/lib/methodology";
import { PANEL_IDS } from "@/lib/ontology";
import type { InputId } from "@/lib/setup";

export const targetSchema = z.object({
  name: z.string(),
  /** What the approved dashboard shows, in the owner's words, with the ids the methodology is expected to use. */
  figures: z.array(z.object({ id: z.string(), label: z.string(), weight: z.number().default(1), note: z.string().optional() })),
  rules: z.array(z.object({ id: z.string(), label: z.string(), section: z.string().optional(), testable: z.boolean().default(true), weight: z.number().default(1), note: z.string().optional() })),
  classes: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
  panels: z.array(z.enum(PANEL_IDS)).default([]),
  /** The lowest score (0 to 100) the hand-written methodology must reach; the synthetic check fails below it. */
  floor: z.number().min(0).max(100).default(0),
});
export type Target = z.infer<typeof targetSchema>;

export type ParityStatus = "computes" | "expressed" | "waiting" | "missing";
export type ParityRow = { kind: "figure" | "rule" | "class" | "panel"; id: string; label: string; status: ParityStatus; weight: number; note: string };
export type Parity = { rows: ParityRow[]; score: number; counts: Record<ParityStatus, number> };

export const parityScore = (s: ParityStatus) => (s === "computes" ? 1 : s === "expressed" || s === "waiting" ? 0.5 : 0);

/**
 * Scores `m` against `target`. With a book, figures and rules are computed on
 * it; without one, anything expressed counts as expressed only.
 */
export function scoreParity(target: Target, m: Methodology, book: Book | null, inputs: readonly InputId[], today: string): Parity {
  const ctx = book ? contextFor(book, today, m) : null;
  const findings = book ? evaluate(m, book, today, inputs) : [];
  const rows: ParityRow[] = [];

  for (const t of target.figures) {
    const f = m.figures.find((x) => x.id === t.id);
    if (!f) {
      rows.push({ kind: "figure", id: t.id, label: t.label, status: "missing", weight: t.weight, note: t.note ?? "" });
      continue;
    }
    if (!ctx) {
      rows.push({ kind: "figure", id: t.id, label: t.label, status: "expressed", weight: t.weight, note: "" });
      continue;
    }
    const r = computeFigure(f, ctx, inputs);
    const has = r.kind === "scalar" ? r.value !== null : r.points.length > 0;
    rows.push({ kind: "figure", id: t.id, label: t.label, status: r.needs.length ? "waiting" : has ? "computes" : "expressed", weight: t.weight, note: r.needs.length ? `needs ${r.needs.map((n) => n.label).join(", ")}` : "" });
  }
  for (const t of target.rules) {
    const r = m.rules.find((x) => x.id === t.id);
    if (!r) {
      rows.push({ kind: "rule", id: t.id, label: t.label, status: "missing", weight: t.weight, note: t.note ?? "" });
      continue;
    }
    if (!r.test) {
      rows.push({ kind: "rule", id: t.id, label: t.label, status: t.testable ? "expressed" : "computes", weight: t.weight, note: t.testable ? "recorded, but only as the owner's to check" : "the owner's to check, as in the target" });
      continue;
    }
    if (!book) {
      rows.push({ kind: "rule", id: t.id, label: t.label, status: "expressed", weight: t.weight, note: "" });
      continue;
    }
    const f = findings.find((x) => x.rule.id === r.id);
    const status: ParityStatus = !f ? "expressed" : f.status === "n/a" && f.needs.length ? "waiting" : f.status === "n/a" ? "expressed" : "computes";
    rows.push({ kind: "rule", id: t.id, label: t.label, status, weight: t.weight, note: f && f.status !== "n/a" ? `${f.status}${f.actual ? ` at ${f.actual}` : ""}` : f?.needs.length ? `needs ${f.needs.map((n) => n.label).join(", ")}` : "" });
  }
  for (const t of target.classes) rows.push({ kind: "class", id: t.id, label: t.label, status: m.classes.some((c) => c.id === t.id) ? "computes" : "missing", weight: 1, note: "" });
  for (const p of target.panels) rows.push({ kind: "panel", id: p, label: p, status: m.dashboard.sections.some((s) => s.kind === "panel" && s.id === p) ? "computes" : "missing", weight: 1, note: "" });

  const total = rows.reduce((a, r) => a + r.weight, 0) || 1;
  const got = rows.reduce((a, r) => a + r.weight * parityScore(r.status), 0);
  const counts = { computes: 0, expressed: 0, waiting: 0, missing: 0 } as Record<ParityStatus, number>;
  for (const r of rows) counts[r.status] += 1;
  return { rows, score: Math.round((got / total) * 100), counts };
}

const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));

/** The parity as the checks print it. */
export function parityReport(p: Parity, title: string): string {
  const lines = [title, ""];
  for (const r of p.rows) lines.push(`${pad(r.status.toUpperCase(), 10)} ${pad(r.kind, 7)} ${pad(r.label, 60)} ${r.note}`);
  lines.push("", `${p.rows.length} items: ${p.counts.computes} compute, ${p.counts.expressed} expressed only, ${p.counts.waiting} waiting for data, ${p.counts.missing} missing.`);
  lines.push(`Score ${p.score}% (computes 1, expressed or waiting 0.5, missing 0; weighted).`);
  if (p.counts.missing) {
    lines.push("", "Missing, by cause (from the target's notes):");
    for (const r of p.rows.filter((x) => x.status === "missing")) lines.push(`  - ${r.label}${r.note ? `: ${r.note}` : ""}`);
  }
  return lines.join("\n");
}
