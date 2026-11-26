/**
 * What the person's own Claude proposes to a thesis through write_thesis,
 * waiting for them (Hamza, 9 Nov 2026: the beta's write-back tools; "write_thesis
 * would land as a pending proposal with Approve, Deny and Amend"). The write
 * is checked against the thesis as kept when it arrives, then kept whole in
 * the vault's `thesis_writes` file, one per thesis, a newer write replacing an
 * older one. The person keeps the parts they tick, may amend the text and the
 * pathway, and only then is it applied through the same path write_thesis
 * always took (`writeThesisInto`). An evidence entry alone (what a document or
 * a results call said, marked as added by Claude) changes none of their words
 * and is added at once. Pure.
 */
import { z } from "zod";

import { marketThesisFor, marketThesisId, thesisFor, thesisWriteSchema, type ThesesFile, type ThesisWrite } from "@/lib/theses";

/** The parts of a write the person keeps or leaves, in the order the card lists them. */
export const WRITE_PARTS = ["title", "text", "pathway", "pillars", "watch", "basket", "figures", "triggers", "levels", "valuation", "evidence"] as const;
export type WritePart = (typeof WRITE_PARTS)[number];
export const PART_WORDS: Record<WritePart, string> = {
  title: "Title",
  text: "The thesis",
  pathway: "Pathway",
  pillars: "Pillars",
  watch: "What to watch",
  basket: "Basket",
  figures: "Charts and pictures",
  triggers: "Kill signals and triggers",
  levels: "Price levels",
  valuation: "Valuation",
  evidence: "Evidence entry",
};

/** The parts a write carries. */
export function partsOf(w: ThesisWrite): WritePart[] {
  const has: Record<WritePart, boolean> = {
    title: w.kind === "market" && w.title !== undefined,
    text: w.text !== undefined,
    pathway: w.kind === "stock" && w.pathway !== undefined,
    pillars: w.pillars !== undefined,
    watch: w.watch !== undefined,
    basket: w.kind === "market" && w.basket !== undefined,
    figures: !!(w.figures?.length || w.removeFigures?.length),
    triggers: w.kind === "stock" && w.triggers !== undefined,
    levels: w.kind === "stock" && w.levels !== undefined,
    valuation: w.kind === "stock" && w.valuation !== undefined,
    evidence: w.evidence !== undefined,
  };
  return WRITE_PARTS.filter((p) => has[p]);
}

/** A write that only adds an evidence entry: applied at once, since it replaces none of the person's words. */
export const evidenceOnly = (w: ThesisWrite) => partsOf(w).join() === "evidence";

/** The thesis a write names: a stock by symbol, a market thesis by the id it has or will have. */
export type WriteSubject = { kind: "stock"; symbol: string } | { kind: "market"; id: string; title: string };

export function subjectOfWrite(file: ThesesFile | null, w: ThesisWrite): WriteSubject {
  if (w.kind === "stock") return { kind: "stock", symbol: w.symbol.toUpperCase() };
  const prev = marketThesisFor(file, w.thesis);
  const title = (w.title ?? prev?.title ?? w.thesis).trim();
  return { kind: "market", id: prev?.id ?? marketThesisId(title), title };
}

export const writeKeyOf = (s: WriteSubject) => (s.kind === "stock" ? `stock:${s.symbol}` : `market:${s.id}`);

export const pendingWriteSchema = z.object({
  id: z.string().max(40),
  key: z.string().max(60),
  /** The symbol, or the market thesis's title, as the card names it. */
  name: z.string().max(120),
  /** Whether the thesis was on file when it came; a new market thesis has no page until it is kept. */
  isNew: z.boolean(),
  at: z.string(),
  parts: z.array(z.enum(WRITE_PARTS)).max(WRITE_PARTS.length),
  write: thesisWriteSchema,
});
export type PendingWrite = z.infer<typeof pendingWriteSchema>;

export const MAX_PENDING_WRITES = 40;
export const thesisWritesFileSchema = z.object({ version: z.literal(1), pending: z.array(pendingWriteSchema).max(MAX_PENDING_WRITES), updated: z.string() });
export type ThesisWritesFile = z.infer<typeof thesisWritesFileSchema>;
export const EMPTY_THESIS_WRITES: ThesisWritesFile = { version: 1, pending: [], updated: "" };

/** The file with a write kept pending: one per thesis, the newer replacing the older; the oldest fall off past the limit. */
export function withPendingWrite(file: ThesisWritesFile | null, theses: ThesesFile | null, w: ThesisWrite, now: Date): { file: ThesisWritesFile; entry: PendingWrite } {
  const s = subjectOfWrite(theses, w);
  const key = writeKeyOf(s);
  const at = now.toISOString();
  const isNew = s.kind === "stock" ? !thesisFor(theses, s.symbol) : !marketThesisFor(theses, s.id);
  const entry = pendingWriteSchema.parse({ id: `w${at.replace(/\D/g, "").slice(2, 16)}`, key, name: s.kind === "stock" ? s.symbol : s.title.slice(0, 120), isNew, at, parts: partsOf(w), write: w });
  const pending = [entry, ...(file?.pending ?? []).filter((p) => p.key !== key)].slice(0, MAX_PENDING_WRITES);
  return { file: thesisWritesFileSchema.parse({ version: 1, pending, updated: at }), entry };
}

/** The thesis page a pending write belongs on, from its key. */
export const claudeWriteHref = (p: PendingWrite) => (p.key.startsWith("stock:") ? `/theses/${encodeURIComponent(p.key.slice(6))}` : `/theses/market/${encodeURIComponent(p.key.slice(7))}`);

export function pendingWriteFor(file: ThesisWritesFile | null, s: WriteSubject): PendingWrite | null {
  return file?.pending.find((p) => p.key === writeKeyOf(s)) ?? null;
}

export function withoutPendingWrite(file: ThesisWritesFile | null, id: string, now: string): ThesisWritesFile {
  return thesisWritesFileSchema.parse({ version: 1, pending: (file?.pending ?? []).filter((p) => p.id !== id), updated: now });
}

/**
 * The write the person approved: the parts ticked, the text and the pathway
 * as amended; null when nothing is kept. The subject (symbol, thesis) stays as
 * Claude named it.
 */
export function chosenWrite(p: PendingWrite, keep: ReadonlySet<WritePart>, amended: { text?: string; pathway?: string | null } = {}): ThesisWrite | null {
  const w = p.write;
  const on = (part: WritePart) => p.parts.includes(part) && keep.has(part);
  const base = { evidence: on("evidence") ? w.evidence : undefined, text: on("text") ? (amended.text ?? w.text) : undefined, pillars: on("pillars") ? w.pillars : undefined, watch: on("watch") ? w.watch : undefined, figures: on("figures") ? w.figures : undefined, removeFigures: on("figures") ? w.removeFigures : undefined };
  const next: ThesisWrite =
    w.kind === "stock"
      ? { kind: "stock", symbol: w.symbol, ...base, pathway: on("pathway") ? (amended.pathway !== undefined ? amended.pathway : w.pathway) : undefined, triggers: on("triggers") ? w.triggers : undefined, levels: on("levels") ? w.levels : undefined, valuation: on("valuation") ? w.valuation : undefined }
      : { kind: "market", thesis: w.thesis, ...base, title: on("title") ? w.title : undefined, basket: on("basket") ? w.basket : undefined };
  const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) as ThesisWrite;
  return partsOf(clean).length ? thesisWriteSchema.parse(clean) : null;
}

/** One part of a pending write as the card draws it: the words before and after where it has words, else what it does in a line. */
export type PartView = { part: WritePart; words: string; before: string | null; after: string | null; line: string | null };

const lines = (xs: readonly string[]) => xs.join("\n");
const pillarLine = (p: { name: string; text: string; test: { field: string; is: "gte" | "lte"; value: number } | null }) => `${p.name}${p.text ? `: ${p.text}` : ""}${p.test ? ` (${p.test.field} ${p.test.is === "gte" ? "at or above" : "at or below"} ${p.test.value})` : ""}`;

export function partViews(theses: ThesesFile | null, p: PendingWrite): PartView[] {
  const w = p.write;
  const s = subjectOfWrite(theses, w);
  const stock = s.kind === "stock" ? thesisFor(theses, s.symbol) : null;
  const market = s.kind === "market" ? marketThesisFor(theses, s.id) : null;
  const kept = stock ?? market;
  const words = (part: WritePart, before: string | null, after: string | null): PartView => ({ part, words: PART_WORDS[part], before, after, line: null });
  const line = (part: WritePart, l: string): PartView => ({ part, words: PART_WORDS[part], before: null, after: null, line: l });
  return p.parts.map((part) => {
    switch (part) {
      case "title":
        return words(part, market?.title ?? "", w.kind === "market" ? (w.title ?? "") : "");
      case "text":
        return words(part, kept?.text ?? "", w.text ?? "");
      case "pathway":
        return words(part, stock?.pathway ?? "", w.kind === "stock" ? (w.pathway ?? "") : "");
      case "pillars":
        return words(part, lines((kept?.pillars ?? []).map(pillarLine)), lines((w.pillars ?? []).map((x) => pillarLine({ name: x.name, text: x.text ?? "", test: x.test ?? null }))));
      case "watch":
        return words(part, lines(kept?.watch ?? []), lines(w.watch ?? []));
      case "basket":
        return words(part, (market?.basket ?? []).join(", "), w.kind === "market" ? (w.basket ?? []).map((x) => x.toUpperCase()).join(", ") : "");
      case "figures":
        return line(part, [...(w.figures ?? []).map((f) => `Adds "${f.title}" (${f.image ? "a picture" : "a chart"}, from ${f.source})`), ...(w.removeFigures ?? []).map((t) => `Takes off "${t}"`)].join("; "));
      case "triggers":
        return line(part, w.kind === "stock" && w.triggers ? (w.triggers.length ? w.triggers.map((t) => `${t.kind === "kill" ? "Kill signal" : "Trigger"}: ${t.field} ${t.is === "gte" ? "at or above" : "at or below"} ${t.value}${t.note ? ` (${t.note})` : ""}`).join("; ") : "Clears them") : "");
      case "levels":
        return line(part, w.kind === "stock" ? (w.levels ? [w.levels.below !== null ? `At or below ${w.levels.below}` : null, w.levels.above !== null ? `At or above ${w.levels.above}` : null].filter(Boolean).join("; ") || "Clears them" : "Clears them") : "");
      case "valuation": {
        const v = w.kind === "stock" ? w.valuation : undefined;
        return line(part, v ? [v.method ? `Method ${v.method}` : null, v.cases ? `bear ${v.cases.bear}, base ${v.cases.base}, bull ${v.cases.bull} per share` : null, v.note ?? null].filter(Boolean).join("; ") || "The calculator's inputs" : "");
      }
      case "evidence":
        return line(part, w.evidence ? `${w.evidence.source}: ${w.evidence.summary}` : "");
    }
  });
}
