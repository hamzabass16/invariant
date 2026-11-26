/**
 * Sealed methodology versions (Hamza, 9 Nov 2026, the twenty further ways):
 * every methodology the person confirms gets its own fingerprint, sealed in
 * the registry like a thesis receipt (the hash and the time, never the
 * words), and a word-for-word account of what changed since the version
 * before, kept as a Decision Log entry in their own vault. So the record of
 * how their rules evolved can be shown to have existed when it says. Pure.
 */
import { createHash } from "node:crypto";

import type { Decision } from "@/lib/decisions";
import type { Methodology } from "@/lib/methodology";

export const METHODOLOGY_VERSION = "invariant-methodology-1";
/** The Decision Log entry a version is kept as answers this key, so the versions can be listed. */
export const VERSION_ON = "methodology-version";
/** A version's account of what changed is cut to fit a Decision Log entry. */
export const VERSION_TEXT_MAX = 3800;

/** What a version is made of, in a fixed order: the name, the summary, every class's test, every rule's section, words and test, every figure's recipe. */
export function canonicalMethodology(m: Pick<Methodology, "name" | "summary" | "classes" | "rules" | "figures">): string {
  const sortById = <T extends { id: string }>(xs: readonly T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({
    v: METHODOLOGY_VERSION,
    name: m.name.trim(),
    summary: m.summary.trim(),
    classes: sortById(m.classes).map((c) => ({ id: c.id, label: c.label, about: c.about, required: c.required ?? [], criteria: c.criteria, minimum: c.minimum ?? null, minimumShare: c.minimumShare ?? null })),
    rules: sortById(m.rules).map((r) => ({ id: r.id, section: r.section, text: r.text.trim(), severity: r.severity, test: r.test ?? null })),
    figures: sortById(m.figures).map((f) => ({ id: f.id, label: f.label, unit: f.unit, expr: f.expr, by: f.by ?? null })),
  });
}

export const methodologyFingerprint = (m: Pick<Methodology, "name" | "summary" | "classes" | "rules" | "figures">) => createHash("sha256").update(canonicalMethodology(m)).digest("hex");

export type VersionChange = { kind: "added" | "removed" | "changed"; what: "rule" | "class" | "figure" | "name" | "summary"; id: string; before: string | null; after: string | null };

const ruleWords = (r: Methodology["rules"][number]) => `§${r.section} ${r.text.trim()} (${r.severity}${r.test ? `, tests ${r.test.figure} ${r.test.is} ${r.test.limit}` : ", checked by you"})`;
const classWords = (c: Methodology["classes"][number]) => `${c.label}: ${c.about}${c.criteria.length ? ` [${c.criteria.map((x) => `${x.field} ${x.is} ${JSON.stringify(x.value ?? null)}`).join("; ")}]` : ""}`;
const figureWords = (f: Methodology["figures"][number]) => `${f.label} (${f.unit}${f.by ? `, by ${f.by}` : ""})`;

/** Every rule, class and figure added, removed or reworded between two versions, with the words before and after; the first version is all added. */
export function methodologyDiff(before: Pick<Methodology, "name" | "summary" | "classes" | "rules" | "figures"> | null, after: Pick<Methodology, "name" | "summary" | "classes" | "rules" | "figures">): VersionChange[] {
  const out: VersionChange[] = [];
  if (before && before.name.trim() !== after.name.trim()) out.push({ kind: "changed", what: "name", id: "name", before: before.name, after: after.name });
  if (before && before.summary.trim() !== after.summary.trim()) out.push({ kind: "changed", what: "summary", id: "summary", before: before.summary, after: after.summary });
  const pass = <T extends { id: string }>(what: VersionChange["what"], a: readonly T[], b: readonly T[], words: (x: T) => string) => {
    const was = new Map(a.map((x) => [x.id, x]));
    const now = new Map(b.map((x) => [x.id, x]));
    for (const [id, x] of now) {
      const old = was.get(id);
      if (!old) out.push({ kind: "added", what, id, before: null, after: words(x) });
      else if (words(old) !== words(x)) out.push({ kind: "changed", what, id, before: words(old), after: words(x) });
    }
    for (const [id, x] of was) if (!now.has(id)) out.push({ kind: "removed", what, id, before: words(x), after: null });
  };
  pass("rule", before?.rules ?? [], after.rules, ruleWords);
  pass("class", before?.classes ?? [], after.classes, classWords);
  pass("figure", before?.figures ?? [], after.figures, figureWords);
  return out;
}

/** The changes as the entry's text: one line each, "+" added, "-" removed, "~" changed with the words before and after, cut at a whole line. */
export function diffText(changes: readonly VersionChange[]): string {
  if (!changes.length) return "No rule, class or figure changed; the version is the same words confirmed again.";
  const lines = changes.map((c) => (c.kind === "added" ? `+ ${c.what} ${c.id}: ${c.after}` : c.kind === "removed" ? `- ${c.what} ${c.id}: ${c.before}` : `~ ${c.what} ${c.id}: ${c.before}\n  now: ${c.after}`));
  const out: string[] = [];
  let n = 0;
  for (const l of lines) {
    if (n + l.length + 1 > VERSION_TEXT_MAX) {
      out.push(`… and ${lines.length - out.length} more changes.`);
      break;
    }
    out.push(l);
    n += l.length + 1;
  }
  return out.join("\n");
}

/** The fingerprint a version entry carries, from its action's reading. */
export const versionFingerprint = (d: Pick<Decision, "action">): string | null => {
  const r = d.action?.on === VERSION_ON ? d.action.reading : null;
  return r && /^sha256:[a-f0-9]{64}$/.test(r) ? r.slice(7) : null;
};

/** The versions on file, newest first: the Decision Log's methodology entries that carry a fingerprint. */
export function versionsOf(entries: readonly Decision[]): (Decision & { fingerprint: string })[] {
  return entries.flatMap((d) => {
    const fp = d.kind === "methodology" ? versionFingerprint(d) : null;
    return fp ? [{ ...d, fingerprint: fp }] : [];
  }).sort((a, b) => b.filedAt.localeCompare(a.filedAt));
}

/** The Decision Log entry for a confirmed version: its words, its changes and its fingerprint. */
export function versionEntry(i: { id: string; m: Methodology; prev: Methodology | null; today: string; now: string }): Decision {
  const changes = methodologyDiff(i.prev, i.m);
  const fp = methodologyFingerprint(i.m);
  const counts = (["added", "removed", "changed"] as const).map((k) => [k, changes.filter((c) => c.kind === k).length] as const).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ");
  return {
    id: i.id,
    date: i.today,
    kind: "methodology",
    symbol: null,
    title: `Confirmed ${i.m.name.slice(0, 80)}${counts ? ` (${counts})` : ""}`.slice(0, 120),
    text: diffText(changes),
    filedAt: i.now,
    action: { on: VERSION_ON, outcome: "accepted", targetPct: null, by: null, votedClass: null, reading: `sha256:${fp}` },
  };
}
