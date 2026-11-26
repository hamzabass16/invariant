/**
 * Data a person adds to the app themselves: "Add data" names a figure or a
 * series, how it is shown (a number, a line, bars, a pie, a table), how often
 * it is read again, the screen it sits on, and where it comes from: a public
 * API they point at (the address, where the rows are, which field is the
 * date or label and which the number, and a key when the API needs one), or
 * their own Claude, which searches the web on their key and names the page
 * every figure came from. Never a methodology: a methodology's figures stay
 * recipes over the ontology; this is the person's own shelf beside them.
 *
 * Definitions and readings are kept in the vault's `custom_data` file, an
 * API key in its own `data_keys` file, read only to make the call and never
 * shown again. A reading that fails keeps the last good one and says why,
 * never a zero. Only a public https address is ever read (checkAddress, and
 * again by DNS in lib/custom-data-run.ts). Pure: the fetch and the model call
 * live in lib/custom-data-run.ts.
 */
import { z } from "zod";

import { csvCells } from "@/lib/economies";
import { localDay } from "@/lib/time";
import { MODELS } from "@/lib/models";

export const MAX_DATA = 12;
/** A line keeps this many dated points; bars, a pie and a table this many rows. */
export const MAX_SERIES_POINTS = 1000;
export const MAX_ROWS = 24;
/** An API answer larger than this is refused rather than read. */
export const MAX_ANSWER_BYTES = 1_000_000;
export const DATA_MODEL = MODELS.standard;
export const DATA_MAX_SEARCHES = 4;

export const DATA_FORMATS = ["number", "line", "bar", "pie", "table"] as const;
export type DataFormat = (typeof DATA_FORMATS)[number];
export const DATA_FORMAT_LABEL: Record<DataFormat, string> = { number: "A number", line: "A time series (line chart)", bar: "A bar chart", pie: "A pie chart", table: "A table" };

export const DATA_REFRESH = ["daily", "weekly", "monthly"] as const;
export type DataRefresh = (typeof DATA_REFRESH)[number];
export const DATA_REFRESH_LABEL: Record<DataRefresh, string> = { daily: "Every morning", weekly: "Once a week", monthly: "Once a month" };

/** The screens a person's own data can sit on, each with a slot of its own in lib/ontology.ts. */
export const DATA_SCREENS = ["today", "holdings", "performance", "markets"] as const;
export type DataScreen = (typeof DATA_SCREENS)[number];
export const DATA_SCREEN_LABEL: Record<DataScreen, string> = { today: "Dashboard", holdings: "Holdings", performance: "Performance", markets: "Macro" };

const field = z.string().trim().max(80).regex(/^[\w$@.\-[\] ]*$/, "letters, digits and . [ ] _ - only");

export const apiSourceSchema = z.object({
  kind: z.literal("api"),
  url: z.string().trim().min(10).max(500),
  answer: z.enum(["json", "csv"]),
  /** Where the rows are in a JSON answer, as a dotted path ("data.observations"); empty for the top level. Not used for CSV. */
  rows: field,
  /** In each row, the field naming the point: a date for a line, a label for bars, a pie or a table. Empty numbers the rows. */
  x: field,
  /** In each row, the field holding the number; empty when the path above leads to the number itself. */
  value: field,
  /** How the key goes with the request, when the API needs one. The key itself is in data_keys. */
  keyIn: z.enum(["none", "header", "query"]),
  keyName: z.string().trim().max(60).regex(/^[A-Za-z0-9_-]*$/),
});
export type ApiSource = z.infer<typeof apiSourceSchema>;

export const claudeSourceSchema = z.object({
  kind: z.literal("claude"),
  /** What to fetch, in the person's words: "Copper's price per tonne on the LME, monthly, the last two years". */
  ask: z.string().trim().min(10).max(600),
});

export const dataDefSchema = z.object({
  id: z.string().regex(/^data-[a-z0-9-]{1,48}$/),
  name: z.string().trim().min(1).max(60),
  about: z.string().trim().max(200),
  format: z.enum(DATA_FORMATS),
  /** Shown after each figure: "%", "$bn", "pts", "bbl"; empty for none. */
  unit: z.string().trim().max(12),
  refresh: z.enum(DATA_REFRESH),
  screen: z.enum(DATA_SCREENS),
  source: z.discriminatedUnion("kind", [apiSourceSchema, claudeSourceSchema]),
  added: z.string(),
});
export type DataDef = z.infer<typeof dataDefSchema>;

const httpsUrl = z
  .string()
  .max(500)
  .refine((u) => /^https:\/\/[^\s/]+\.[^\s/]+/.test(u), "an https address");
export const dataPointSchema = z.object({ x: z.string().max(60), value: z.number().finite() });
export type DataPoint = z.infer<typeof dataPointSchema>;
const pageSchema = z.object({ title: z.string().min(1).max(160), url: httpsUrl });

export const dataReadingSchema = z.object({
  /** When it was last tried. */
  readAt: z.string(),
  /** When the points below were read; null before the first good read. */
  goodAt: z.string().nullable(),
  points: z.array(dataPointSchema).max(MAX_SERIES_POINTS),
  /** The pages a Claude reading came from; empty for an API. */
  pages: z.array(pageSchema).max(6),
  /** A line from the reader: what the figure is as of, or what it could not find. */
  note: z.string().max(300).nullable(),
  /** Why the last try failed; the points above are then the last good ones. */
  problem: z.string().max(400).nullable(),
});
export type DataReading = z.infer<typeof dataReadingSchema>;

export const customDataFileSchema = z.object({
  version: z.literal(1),
  defs: z.array(dataDefSchema).max(MAX_DATA),
  readings: z.record(z.string(), dataReadingSchema),
  updated: z.string(),
});
export type CustomDataFile = z.infer<typeof customDataFileSchema>;
export const EMPTY_CUSTOM_DATA: CustomDataFile = { version: 1, defs: [], readings: {}, updated: "" };

/** API keys by definition id: read only to make the call, never shown, logged or sent anywhere but to that API. */
export const dataKeysSchema = z.object({ version: z.literal(1), keys: z.record(z.string(), z.string().max(400)) });
export type DataKeys = z.infer<typeof dataKeysSchema>;
export const EMPTY_DATA_KEYS: DataKeys = { version: 1, keys: {} };

/** A new definition's id from its name, never one already taken. */
export function dataIdFor(name: string, taken: readonly string[]): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "data";
  let id = `data-${slug}`;
  for (let n = 2; taken.includes(id); n++) id = `data-${slug}-${n}`;
  return id;
}

// ---------------------------------------------------------------------------
// Only public addresses

/** Whether an IP address (v4 or v6) is private, loopback, link-local or otherwise not on the public internet. */
export function isPrivateIp(ip: string): boolean {
  const a = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  const v4 = a.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [p, q] = [Number(v4[1]), Number(v4[2])];
    return p === 0 || p === 10 || p === 127 || (p === 100 && q >= 64 && q <= 127) || (p === 169 && q === 254) || (p === 172 && q >= 16 && q <= 31) || (p === 192 && q === 168) || (p === 192 && q === 0) || (p === 198 && (q === 18 || q === 19)) || p >= 224;
  }
  if (a.includes(":")) return a === "::" || a === "::1" || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || a.startsWith("64:ff9b:") || a.startsWith("2001:db8");
  return false;
}

/** Null when the address may be read: https, a public name, no credentials and no port but 443. Else the sentence saying why not. */
export function checkAddress(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return "That is not a web address. Paste the API's whole address, starting with https://.";
  }
  if (u.protocol !== "https:") return "Only https addresses are read, so the request and its key travel encrypted.";
  if (u.username || u.password) return "Leave the name and password out of the address; put a key in the key field instead.";
  if (u.port && u.port !== "443") return "Only the standard https port is read.";
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || /(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(host) || isPrivateIp(host)) return "Only public addresses on the internet are read, never a private network.";
  return null;
}

/** The address with the key added as a query parameter, when that is how the API takes it. */
export function addressWithKey(src: ApiSource, key: string | null): string {
  if (src.keyIn !== "query" || !key || !src.keyName) return src.url;
  const u = new URL(src.url);
  u.searchParams.set(src.keyName, key);
  return u.toString();
}

/** The host alone, for the screen: never the path or the query, which may carry a key. */
export function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return "the address given";
  }
}

// ---------------------------------------------------------------------------
// Reading an answer

/** The value at a dotted path ("data.items.0.price", "series[0]"); the whole object for an empty path; undefined when it is not there. */
export function pickPath(obj: unknown, path: string): unknown {
  const parts = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
  let at: unknown = obj;
  for (const p of parts) {
    if (at === null || typeof at !== "object") return undefined;
    at = (at as Record<string, unknown>)[p];
  }
  return at;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim().replace(/[,%$€£\s]/g, "");
    if (!t || t === "." || t === "-") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** A date for a line: an ISO date or timestamp, a year and month, a year, or seconds or milliseconds since 1970. */
export function toDate(v: unknown): string | null {
  if (typeof v === "number" || (typeof v === "string" && /^\d{9,13}$/.test(v.trim()))) {
    const n = Number(v);
    if (n >= 1e9) {
      const d = new Date(n >= 1e12 ? n : n * 1000);
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-01`;
  m = s.match(/^(\d{4})-?Q([1-4])$/i);
  if (m) return `${m[1]}-${String((Number(m[2]) - 1) * 3 + 1).padStart(2, "0")}-01`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

/** Points in the shape the format needs: a line by date, oldest first, one per date; the rest in the answer's order, up to MAX_ROWS. */
export function shapePoints(points: DataPoint[], format: DataFormat): DataPoint[] {
  if (format === "line") {
    const byDate = new Map<string, number>();
    for (const p of points) {
      const d = toDate(p.x);
      if (d) byDate.set(d, p.value);
    }
    return [...byDate].map(([x, value]) => ({ x, value })).sort((a, b) => a.x.localeCompare(b.x)).slice(-MAX_SERIES_POINTS);
  }
  if (format === "number") {
    const dated = points.map((p) => ({ p, d: toDate(p.x) }));
    if (dated.length && dated.every((x) => x.d)) {
      const last = dated.sort((a, b) => (a.d as string).localeCompare(b.d as string))[dated.length - 1];
      return [{ x: last.d as string, value: last.p.value }];
    }
    return points.slice(0, 1);
  }
  return points.slice(0, MAX_ROWS).map((p) => ({ x: p.x.slice(0, 60), value: p.value }));
}

/**
 * Reads the rows of an API answer into points. Throws a sentence that names
 * the field it could not find, so the person can fix the path, never an
 * empty reading.
 */
export function pointsFromAnswer(text: string, src: ApiSource, format: DataFormat, today: string): DataPoint[] {
  const rows = src.answer === "csv" ? csvRows(text) : jsonRows(text, src);
  if (typeof rows === "number") return [{ x: today, value: rows }];
  // Rows made from an object of label to number carry their own fields.
  const pairs = !src.x && !src.value && rows.every((r) => r !== null && typeof r === "object" && "label" in (r as object) && "value" in (r as object));
  const xField = pairs ? "label" : src.x;
  const valueField = pairs ? "value" : src.value;
  const out: DataPoint[] = [];
  rows.forEach((row, i) => {
    const value = toNumber(valueField ? pickPath(row, valueField) : row);
    if (value === null) return;
    const rawX = xField ? pickPath(row, xField) : String(i + 1);
    const x = typeof rawX === "string" || typeof rawX === "number" ? String(rawX).trim() : "";
    if (!x) return;
    out.push({ x, value });
  });
  if (!out.length) throw new Error(`No number was found at "${src.value || "the row itself"}"${src.x ? ` beside "${src.x}"` : ""} in ${rows.length} row${rows.length === 1 ? "" : "s"}. Check the field names against the API's answer.`);
  const shaped = shapePoints(out, format);
  if (!shaped.length) throw new Error(`The rows held numbers but no date at "${src.x}". A line needs a date in each row.`);
  return shaped;
}

function jsonRows(text: string, src: ApiSource): unknown[] | number {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("The answer is not JSON. Choose CSV if the API sends a table, or check the address.");
  }
  const at = pickPath(json, src.rows);
  if (at === undefined || at === null) throw new Error(`Nothing was found at "${src.rows}" in the answer. Check where the rows are.`);
  const single = toNumber(at);
  if (single !== null && !src.value) return single;
  if (Array.isArray(at)) return at;
  if (typeof at === "object") {
    // An object of label to number ({"Energy": 4.2, "Tech": 31.0}) reads as one row per label when no fields are named.
    if (!src.x && !src.value) return Object.entries(at as Record<string, unknown>).map(([label, value]) => ({ label, value }));
    return [at];
  }
  throw new Error(`What is at "${src.rows || "the top"}" is neither rows nor a number.`);
}

function csvRows(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("The CSV answer has no rows under its header.");
  const head = csvCells(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = csvCells(l);
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}

// ---------------------------------------------------------------------------
// Reading through the person's Claude

const recordSchema = z.object({
  points: z.array(z.object({ x: z.string().min(1).max(60), value: z.number().finite() })).max(60),
  note: z.string().max(300),
  pages: z.array(pageSchema).max(6),
});

const SHAPE_WORDS: Record<DataFormat, string> = {
  number: "one point: x is the date the figure is as of (YYYY-MM-DD) and value the figure",
  line: "a dated series: x is each date (YYYY-MM-DD), oldest first, up to 60 points",
  bar: "rows to compare as bars: x is each row's label, up to 24 rows",
  pie: "the parts of a whole: x is each part's label and value its size, up to 12 parts",
  table: "rows: x is each row's label, up to 24 rows",
};

/** One reading by the person's Claude: it searches the web, then records the figures through record_data, each from a page it names. */
export function dataRequestBody(def: DataDef, today: string, model = DATA_MODEL): Record<string, unknown> {
  if (def.source.kind !== "claude") throw new Error("not a Claude source");
  const schema = z.toJSONSchema(recordSchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return {
    model,
    max_tokens: 3000,
    system: `You fetch one figure or series for a person's portfolio app by searching the web, at most ${DATA_MAX_SEARCHES} searches. Today is ${today}.

Rules:
- Record ${SHAPE_WORDS[def.format]}${def.unit ? `, in ${def.unit}` : ""}.
- Every value is one a page you found states; copy it as the page prints it. Never estimate, interpolate, convert or round a guess into a figure.
- pages: the pages the values came from, each with its real https URL and title.
- note: one line on what the figure is as of and its source, or what you could not find. When nothing reliable was found, record no points and say so.
- Your whole answer is one call to record_data; write nothing outside it. No opinion, no advice.`,
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: DATA_MAX_SEARCHES },
      { name: "record_data", description: "Record the figures found.", input_schema: schema },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [{ type: "text", text: `${def.name}${def.about ? `: ${def.about}` : ""}.\n\nWhat to fetch: ${def.source.ask}` }] }],
  };
}

export type DataParse = { ok: true; points: DataPoint[]; pages: DataReading["pages"]; note: string } | { ok: false; reason: string; called: boolean };

/** Reads Claude's answer: the one record_data call, shaped for the format; figures without a page are refused. */
export function parseDataResponse(body: unknown, def: DataDef): DataParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_data");
  if (!call) return { ok: false, reason: "the model answered in words instead of recording the figures", called: false };
  const parsed = recordSchema.safeParse(call.input);
  if (!parsed.success) return { ok: false, reason: `the answer did not fit (${parsed.error.issues.length} issues)`, called: true };
  const points = shapePoints(parsed.data.points, def.format);
  if (!points.length) return { ok: false, reason: parsed.data.note ? `nothing was recorded: ${parsed.data.note.replace(/\.$/, "")}` : "nothing was recorded", called: true };
  if (!parsed.data.pages.length) return { ok: false, reason: "figures came back without the page they came from, so they were not kept", called: true };
  return { ok: true, points, pages: parsed.data.pages, note: parsed.data.note };
}

// ---------------------------------------------------------------------------
// Keeping

/** Whether a definition is due: never read, or older than its refresh by the person's calendar. */
export function dataDue(def: DataDef, reading: DataReading | undefined, now: Date): boolean {
  if (!reading) return true;
  const last = new Date(reading.readAt);
  if (Number.isNaN(last.getTime())) return true;
  if (def.refresh === "daily") return localDay(last) !== localDay(now);
  const days = (now.getTime() - last.getTime()) / 86_400_000;
  return def.refresh === "weekly" ? days >= 6.5 : days >= 27.5;
}

/** The reading after a try: new points replace the old; a failure keeps the last good points and says why. */
export function nextReading(prev: DataReading | undefined, tried: { points: DataPoint[]; pages?: DataReading["pages"]; note?: string | null } | { problem: string }, now: Date): DataReading {
  const at = now.toISOString();
  if ("problem" in tried) return { readAt: at, goodAt: prev?.goodAt ?? null, points: prev?.points ?? [], pages: prev?.pages ?? [], note: prev?.note ?? null, problem: tried.problem.slice(0, 400) };
  return { readAt: at, goodAt: at, points: tried.points, pages: tried.pages ?? [], note: tried.note?.slice(0, 300) ?? null, problem: null };
}

/** The definitions on one screen, in the order they were added, each with its reading. */
export function dataOn(file: CustomDataFile | null, screen: DataScreen): { def: DataDef; reading: DataReading | null }[] {
  return (file?.defs ?? []).filter((d) => d.screen === screen).map((def) => ({ def, reading: file?.readings[def.id] ?? null }));
}

/** A figure with its unit: "4.25%", "1,204 $bn", "12.5". */
export function formatData(v: number, unit: string): string {
  const abs = Math.abs(v);
  const n = abs >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 0 }) : abs >= 10 ? v.toLocaleString("en-US", { maximumFractionDigits: 1 }) : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (!unit) return n;
  return unit === "%" ? `${n}%` : `${n} ${unit}`;
}

/** Where a definition reads from, in words for the screen; an API by its host alone. */
export function sourceWords(def: DataDef): string {
  return def.source.kind === "api" ? `From ${hostOf(def.source.url)}` : "Fetched by the AI from the web";
}
