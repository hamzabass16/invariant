import { agentById, WRONG_LABEL, WRONG_REASONS, type WrongReason } from "@/lib/agents";
import type { Gap } from "@/lib/methodology";
import { FIELDS } from "@/lib/ontology";
import { maskMoney } from "@/lib/stealth";

/**
 * What the app learns from everyone, aggregated (Hamza, 4 Nov 2026: the
 * software fixes itself; "you merge"): the methodology gaps a confirmed
 * methodology carries, and the reasons a person gives when they rate an
 * agent's finding not useful. Each is a signal: its kind, its words, how
 * many people raised it and when. A weekly routine reads the signals and
 * opens a pull request for the commonest; the operator merges or closes it
 * on /ops. Never a figure of anyone's book, never a finding's text, a
 * ticker, an account or who raised it: a gap's words with any amount
 * masked and long numbers taken out, a rating's agent, step and reason
 * alone. A person can switch it off on Account settings (`improve` in the
 * preferences), which deletes what they raised. Pure: no network, no key.
 */

export const SIGNAL_KINDS = ["gap", "rating", "reader"] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

/** At most this many characters of a signal's words. */
export const MAX_SIGNAL_WORDS = 300;
/** At most this many signals from one confirmed methodology. */
export const MAX_GAP_SIGNALS = 12;
/** At most this many reader signals from one company's report. */
export const MAX_READER_SIGNALS = 12;
/** How many signals /ops shows. */
export const OPS_SIGNALS = 30;

export type Signal = { key: string; kind: SignalKind; words: string; agent: string | null; step: string | null; reason: WrongReason | null };
export type SignalRow = Signal & { people: number; firstSeen: string; lastSeen: string };

/** The words as compared: lower case, letters and digits, single spaces. */
export function normaliseWords(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();
}

/**
 * The words as kept: any amount of money masked, a run of five digits or
 * more (an account, a share count, a value) taken out, single spaces, cut
 * at a whole word within MAX_SIGNAL_WORDS.
 */
export function scrubWords(s: string): string {
  const out = maskMoney(s)
    .replace(/\d[\d,.]{4,}\d/g, "#")
    .replace(/\s+/g, " ")
    .trim();
  if (out.length <= MAX_SIGNAL_WORDS) return out;
  const cut = out.slice(0, MAX_SIGNAL_WORDS);
  const space = cut.lastIndexOf(" ");
  return (space > MAX_SIGNAL_WORDS / 2 ? cut.slice(0, space) : cut).trim();
}

/** FNV-1a over the normalised words, twice with different seeds, so the key is short and stable on every instance. */
function hash(s: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

export const signalKey = (kind: SignalKind, words: string) => `${kind}:${hash(normaliseWords(words))}`;

/** A confirmed methodology's gaps as signals: what the ontology would need, then what the document asked for, one each, repeats and a gap that names nothing missing taken out. */
export function gapSignals(gaps: readonly Gap[]): Signal[] {
  const out = new Map<string, Signal>();
  for (const g of gaps.slice(0, MAX_GAP_SIGNALS)) {
    if (!g.missing.trim()) continue;
    const words = scrubWords(`${g.missing.trim().replace(/\.$/, "")}. Asked for: ${g.asks.trim()}`);
    if (normaliseWords(words).length < 6) continue;
    const key = signalKey("gap", words);
    out.set(key, { key, kind: "gap", words, agent: null, step: null, reason: null });
  }
  return [...out.values()];
}

const READER_MISS = /^([a-z0-9_]+):.*?the filings carry (.+?) under a name the app does not read yet/;
const fieldName = (id: string): string => (FIELDS as Record<string, { label: string } | undefined>)[id]?.label ?? id.replace(/_/g, " ");

/**
 * A figure the filings reader could not derive although the filings carry
 * the line under a concept it does not read (the earnings report's end
 * note, "not read by the app"; Hamza, 4 Nov 2026), as one signal per field
 * and concepts: the field and the standard concept names alone (SEC company
 * facts carry only the public taxonomies, never a company's own), so the
 * routine can teach the reader the concept. Never the company, a figure or
 * the reason's other words.
 */
export function readerSignals(notes: readonly string[]): Signal[] {
  const out = new Map<string, Signal>();
  for (const n of notes) {
    const m = READER_MISS.exec(n.trim());
    if (!m) continue;
    const names = [...new Set(m[2].split(/,\s*/).map((x) => x.trim()).filter((x) => /^[A-Za-z][\w-]*(?::[A-Za-z]\w*)?$/.test(x)))].sort();
    if (!names.length) continue;
    const words = scrubWords(`Filings reader: ${fieldName(m[1])} (${m[1]}) not derived; the filings carry ${names.join(", ")}, which the reader does not read`);
    const key = signalKey("reader", `${m[1]} ${names.join(" ")}`);
    out.set(key, { key, kind: "reader", words, agent: null, step: m[1], reason: null });
    if (out.size >= MAX_READER_SIGNALS) break;
  }
  return [...out.values()];
}

/** The step a rating is about: the agent's last step on a model (the one that wrote the finding), else none. */
export function ratedStep(agent: string): string | null {
  const steps = agentById(agent)?.steps ?? [];
  return [...steps].reverse().find((s) => s.tier !== "none")?.id ?? null;
}

/** A finding rated not useful, as one signal per reason: the agent, its step and the reason; never the finding, the note or the company. */
export function ratingSignals(r: { agent: string; verdict: string; reasons: readonly string[] }): Signal[] {
  if (r.verdict !== "not_useful") return [];
  const a = agentById(r.agent);
  if (!a) return [];
  const step = ratedStep(a.id);
  return [...new Set(r.reasons)]
    .filter((x): x is WrongReason => (WRONG_REASONS as readonly string[]).includes(x))
    .map((reason) => {
      const words = `${a.name}${step ? `, ${step}` : ""}: ${WRONG_LABEL[reason]}`;
      return { key: signalKey("rating", `${a.id} ${step ?? ""} ${reason}`), kind: "rating" as const, words, agent: a.id, step, reason };
    });
}

/** The order /ops and the routine read them in: most people first, then the most recent, then the oldest raised. */
export function rankSignals<T extends Pick<SignalRow, "people" | "lastSeen" | "firstSeen" | "key">>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => b.people - a.people || b.lastSeen.localeCompare(a.lastSeen) || a.firstSeen.localeCompare(b.firstSeen) || a.key.localeCompare(b.key));
}

/** Whether a person's signals are recorded: on unless they switched it off, never in the demo. */
export const recordsSignals = (prefs: { improve?: boolean } | null | undefined, demo: boolean) => !demo && prefs?.improve !== false;

/** The label a self-fix pull request carries; the routine adds it and /ops lists only those. */
export const SELF_FIX_LABEL = "self-fix";

export type CheckRun = { status?: string; conclusion?: string | null };
export type ChecksWord = "passing" | "failing" | "pending" | "none";

/** A commit's checks as one word for /ops: failing when any failed, pending while any runs, passing when all passed. */
export function checksWord(runs: readonly CheckRun[] | undefined): ChecksWord {
  const list = runs ?? [];
  if (!list.length) return "none";
  if (list.some((r) => r.status === "completed" && ["failure", "timed_out", "cancelled", "action_required", "startup_failure"].includes(r.conclusion ?? ""))) return "failing";
  if (list.some((r) => r.status !== "completed")) return "pending";
  return "passing";
}
