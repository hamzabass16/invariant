/**
 * The major developed economies side by side: each one's policy rate,
 * current account, government debt, growth, the growth of what its
 * government pays in interest against the growth of its economy, and broad
 * money. Public sources, keyless: the OECD's Economic Outlook (annual, with
 * its projection for the current year), the IMF's World Economic Outlook and
 * Fiscal Monitor behind it for what the OECD did not give, the BIS's central
 * bank policy rates (daily) and the OECD's monetary aggregates (monthly). Pure: the parsers, the derived figures and the shape; the fetch
 * lives in lib/markets-feed.ts. A figure no source gave is null and named in
 * `problems`, never a zero.
 */
import { z } from "zod";

/** The economies on the map. The euro members share the euro area's policy rate and money. */
export const ECONOMIES = [
  { code: "USA", name: "United States", bis: "US", oecd: "USA" },
  { code: "DEU", name: "Germany", bis: "XM", oecd: "EA20" },
  { code: "FRA", name: "France", bis: "XM", oecd: "EA20" },
  { code: "ITA", name: "Italy", bis: "XM", oecd: "EA20" },
  { code: "GBR", name: "United Kingdom", bis: "GB", oecd: "GBR" },
  { code: "JPN", name: "Japan", bis: "JP", oecd: "JPN" },
  { code: "CAN", name: "Canada", bis: "CA", oecd: "CAN" },
  { code: "AUS", name: "Australia", bis: "AU", oecd: "AUS" },
  { code: "CHE", name: "Switzerland", bis: "CH", oecd: "CHE" },
] as const;

/** The IMF indicators read, by the job each does. */
export const IMF = {
  debt: "GGXWDG_NGDP",
  currentAccount: "BCA_NGDPD",
  realGrowth: "NGDP_RPCH",
  inflation: "PCPIPCH",
  primaryBalance: "GGXONLB_G01_GDP_PT",
  overallBalance: "GGXCNL_G01_GDP_PT",
} as const;
export type ImfKey = keyof typeof IMF;

/** What each annual figure is called in a sentence about it. */
export const ECONOMY_FIGURE: Record<ImfKey, string> = {
  debt: "Government debt",
  currentAccount: "Current account",
  realGrowth: "Real growth",
  inflation: "Inflation",
  primaryBalance: "Primary balance",
  overallBalance: "Overall balance",
};

/** The annual figures the OECD Economic Outlook gives beyond the IMF's: nominal growth itself, the harmonised inflation the euro members and the UK report, and what the government pays in interest. */
export type AnnualKey = ImfKey | "nominalGrowth" | "inflationHarmonised" | "interestPaid";

/**
 * The figures in the OECD Economic Outlook, by job: real and nominal GDP
 * growth, consumer price inflation (headline, or harmonised where that is
 * what the economy reports), the current account, general government gross
 * financial liabilities (the OECD's measure of gross debt), the primary
 * balance and net lending as shares of GDP, and the general government's
 * gross interest payments in its own currency.
 */
export const OECD_OUTLOOK: Record<AnnualKey, string> = {
  debt: "GGFLQ",
  currentAccount: "CBGDPR",
  realGrowth: "GDPV_ANNPCT",
  nominalGrowth: "GDP_ANNPCT",
  inflation: "CPI_YTYPCT",
  inflationHarmonised: "CPIH_YTYPCT",
  primaryBalance: "NLGXQ",
  overallBalance: "NLGQ",
  interestPaid: "GGINTP",
};

/** One IMF indicator: values by economy by year. */
export type ImfTable = Record<string, Record<string, number>>;

/** An IMF DataMapper answer: values, then the indicator, then the economy, then the year. Throws when it is not one, or carries none of the economies. */
export function parseImf(text: string, indicator: string): ImfTable {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error("not an IMF DataMapper answer");
  }
  const values = (j as { values?: Record<string, unknown> })?.values?.[indicator];
  if (!values || typeof values !== "object") throw new Error("not an IMF DataMapper answer");
  const out: ImfTable = {};
  for (const e of ECONOMIES) {
    const years = (values as Record<string, unknown>)[e.code];
    if (!years || typeof years !== "object") continue;
    const row: Record<string, number> = {};
    for (const [y, v] of Object.entries(years as Record<string, unknown>)) if (/^\d{4}$/.test(y) && typeof v === "number" && Number.isFinite(v)) row[y] = v;
    if (Object.keys(row).length) out[e.code] = row;
  }
  if (!Object.keys(out).length) throw new Error("the IMF answer has none of the economies");
  return out;
}

/** One CSV line into cells, quotes and commas inside quotes kept. */
export function csvCells(line: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cell);
      cell = "";
    } else cell += c;
  }
  out.push(cell);
  return out;
}

export type Dated = { value: number; date: string };

/** The BIS policy rates CSV: the latest observation per area (REF_AREA, TIME_PERIOD, OBS_VALUE), in percent. Throws when it is not that file. */
export function parseBisRates(text: string): Record<string, Dated> {
  const lines = text.trim().split(/\r?\n/);
  const head = csvCells(lines[0] ?? "").map((h) => h.trim().toUpperCase());
  const [a, t, v] = ["REF_AREA", "TIME_PERIOD", "OBS_VALUE"].map((h) => head.indexOf(h));
  if (a < 0 || t < 0 || v < 0) throw new Error("not the BIS policy rates file");
  const out: Record<string, Dated> = {};
  for (const line of lines.slice(1)) {
    const cells = csvCells(line);
    const area = cells[a]?.trim();
    const date = cells[t]?.trim();
    const value = Number(cells[v]);
    if (!area || !date || cells[v]?.trim() === "" || !Number.isFinite(value)) continue;
    if (!out[area] || out[area].date < date) out[area] = { value, date };
  }
  if (!Object.keys(out).length) throw new Error("the BIS file has no rates");
  return out;
}

type SdmxValue = { id: string };
type SdmxDim = { id: string; values: SdmxValue[] };

/**
 * An OECD SDMX-JSON answer with every dimension at the observation: the
 * series per area (REF_AREA) by month (TIME_PERIOD). Throws when it is not
 * one, so a refused or changed answer is a sentence.
 */
export function parseOecdSeries(text: string): Record<string, { date: string; value: number }[]> {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("not an OECD answer");
  }
  const data = (j.data ?? j) as Record<string, unknown>;
  const structure = ((data.structures as unknown[] | undefined)?.[0] ?? data.structure ?? j.structure) as { dimensions?: { observation?: SdmxDim[] } } | undefined;
  const dims = structure?.dimensions?.observation;
  const obs = ((data.dataSets as { observations?: Record<string, unknown[]> }[] | undefined)?.[0] ?? (j.dataSets as { observations?: Record<string, unknown[]> }[] | undefined)?.[0])?.observations;
  if (!dims || !obs) throw new Error("not an OECD answer");
  const ai = dims.findIndex((d) => d.id === "REF_AREA");
  const ti = dims.findIndex((d) => d.id === "TIME_PERIOD");
  if (ai < 0 || ti < 0) throw new Error("not an OECD answer");
  const out: Record<string, { date: string; value: number }[]> = {};
  for (const [key, cell] of Object.entries(obs)) {
    const idx = key.split(":").map(Number);
    const area = dims[ai].values[idx[ai]]?.id;
    const period = dims[ti].values[idx[ti]]?.id;
    const value = Array.isArray(cell) ? cell[0] : null;
    if (!area || !period || !/^\d{4}-\d{2}$/.test(period) || typeof value !== "number" || !Number.isFinite(value)) continue;
    // One series per area: where the answer carries two for a month, the first stands.
    const list = (out[area] ??= []);
    if (!list.some((p) => p.date === `${period}-01`)) list.push({ date: `${period}-01`, value });
  }
  for (const k of Object.keys(out)) out[k].sort((x, y) => x.date.localeCompare(y.date));
  if (!Object.keys(out).length) throw new Error("the OECD answer has no months");
  return out;
}

/**
 * The OECD Economic Outlook as SDMX-JSON with every dimension at the
 * observation: each figure by economy (REF_AREA) and year (TIME_PERIOD),
 * filed under the job it does. Throws when it is not one, or carries none of
 * the economies.
 */
export function parseOecdOutlook(text: string): Partial<Record<AnnualKey, ImfTable>> {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("not an OECD Economic Outlook answer");
  }
  const data = (j.data ?? j) as Record<string, unknown>;
  const structure = ((data.structures as unknown[] | undefined)?.[0] ?? data.structure ?? j.structure) as { dimensions?: { observation?: SdmxDim[] } } | undefined;
  const dims = structure?.dimensions?.observation;
  const obs = ((data.dataSets as { observations?: Record<string, unknown[]> }[] | undefined)?.[0] ?? (j.dataSets as { observations?: Record<string, unknown[]> }[] | undefined)?.[0])?.observations;
  if (!dims || !obs) throw new Error("not an OECD Economic Outlook answer");
  const [ai, mi, ti] = ["REF_AREA", "MEASURE", "TIME_PERIOD"].map((id) => dims.findIndex((d) => d.id === id));
  if (ai < 0 || mi < 0 || ti < 0) throw new Error("not an OECD Economic Outlook answer");
  const jobOf = new Map(Object.entries(OECD_OUTLOOK).map(([k, m]) => [m, k as AnnualKey]));
  const codes = new Set<string>(ECONOMIES.map((e) => e.code));
  const out: Partial<Record<AnnualKey, ImfTable>> = {};
  for (const [key, cell] of Object.entries(obs)) {
    const idx = key.split(":").map(Number);
    const area = dims[ai].values[idx[ai]]?.id;
    const job = jobOf.get(dims[mi].values[idx[mi]]?.id ?? "");
    const year = dims[ti].values[idx[ti]]?.id;
    const value = Array.isArray(cell) ? cell[0] : null;
    if (!area || !codes.has(area) || !job || !year || !/^\d{4}$/.test(year) || typeof value !== "number" || !Number.isFinite(value)) continue;
    ((out[job] ??= {})[area] ??= {})[year] = value;
  }
  if (!Object.keys(out).length) throw new Error("the OECD Economic Outlook answer has none of the economies");
  return out;
}

/** The latest month's level against the same month a year before, in percent; null without that base. */
export function growthOnYear(pts: readonly { date: string; value: number }[]): Dated | null {
  const last = pts[pts.length - 1];
  if (!last) return null;
  const base = pts.find((p) => p.date === `${Number(last.date.slice(0, 4)) - 1}${last.date.slice(4)}`);
  if (!base || base.value === 0) return null;
  return { value: Math.round(((last.value - base.value) / Math.abs(base.value)) * 1e4) / 100, date: last.date.slice(0, 7) };
}

const num = z.number().nullable();
const dated = z.object({ value: z.number(), date: z.string() }).nullable();

export const economyRowSchema = z.object({
  code: z.string(),
  name: z.string(),
  /** The central bank's policy rate, percent, with its date; the euro members carry the ECB's. */
  policyRate: dated,
  policyArea: z.string(),
  /** Current account balance, percent of GDP. */
  currentAccount: num,
  /** General government gross debt, percent of GDP. */
  debt: num,
  /** Real GDP growth, percent. */
  realGrowth: num,
  /** Nominal GDP growth, percent: the OECD's own, else real growth and consumer inflation compounded. */
  nominalGrowth: num,
  /** General government net interest paid, percent of GDP: the primary balance less the overall balance. */
  interest: num,
  /** Growth of the government's gross interest payments in money, percent, this year on last; where none is given, the net interest share against the year before, carried by nominal growth. */
  interestGrowth: num,
  /** Nominal growth less interest growth, percentage points: below zero, interest outgrows the economy. */
  growthLessInterest: num,
  /** Broad money (M3) on a year before, percent, with its month; the euro members carry the euro area's. */
  money: dated,
  moneyArea: z.string(),
});
export type EconomyRow = z.infer<typeof economyRowSchema>;

export const economiesSchema = z.object({
  /** The year the annual columns show (the current year: a projection). */
  year: z.string(),
  /** Who gave the annual columns, in words ("the OECD Economic Outlook", "the IMF", or both). */
  annualSource: z.string().default("the IMF"),
  readAt: z.string(),
  source: z.string(),
  rows: z.array(economyRowSchema),
  problems: z.array(z.string()),
});
export type Economies = z.infer<typeof economiesSchema>;

export type EconomyInputs = { annual: Partial<Record<AnnualKey, ImfTable>>; annualSource?: string; rates: Record<string, Dated> | null; money: Record<string, { date: string; value: number }[]> | null };

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The map from what the sources returned, for a year (the current calendar
 * year: the publisher's projection). Nominal growth is the OECD's own, else
 * (1 + real)(1 + inflation) less one. Interest growth is this year's gross
 * interest payments over last year's, less one; with no payments given, (1 +
 * nominal) times this year's net interest share over last year's, less one,
 * when last year's was above zero.
 */
export function buildEconomies(inputs: EconomyInputs, year: string, readAt: string, source: string, problems: string[] = []): Economies {
  const prev = String(Number(year) - 1);
  const at = (k: AnnualKey, code: string, y = year) => inputs.annual[k]?.[code]?.[y] ?? null;
  const rows = ECONOMIES.map((e): EconomyRow => {
    const real = at("realGrowth", e.code);
    const infl = at("inflation", e.code) ?? at("inflationHarmonised", e.code);
    const given = at("nominalGrowth", e.code);
    const nominal = given !== null ? r2(given) : real !== null && infl !== null ? r2(((1 + real / 100) * (1 + infl / 100) - 1) * 100) : null;
    const pb = at("primaryBalance", e.code);
    const ob = at("overallBalance", e.code);
    const pbPrev = at("primaryBalance", e.code, prev);
    const obPrev = at("overallBalance", e.code, prev);
    const interest = pb !== null && ob !== null ? r2(pb - ob) : null;
    const interestPrev = pbPrev !== null && obPrev !== null ? pbPrev - obPrev : null;
    const paid = at("interestPaid", e.code);
    const paidPrev = at("interestPaid", e.code, prev);
    const interestGrowth =
      paid !== null && paidPrev !== null && paidPrev > 0 ? r2((paid / paidPrev - 1) * 100) : interest !== null && interestPrev !== null && interestPrev > 0 && nominal !== null ? r2(((1 + nominal / 100) * (interest / interestPrev) - 1) * 100) : null;
    const money = inputs.money?.[e.oecd] ? growthOnYear(inputs.money[e.oecd]) : null;
    return {
      code: e.code,
      name: e.name,
      policyRate: inputs.rates?.[e.bis] ?? null,
      policyArea: e.bis === "XM" ? "euro area" : e.name,
      currentAccount: at("currentAccount", e.code),
      debt: at("debt", e.code),
      realGrowth: real,
      nominalGrowth: nominal,
      interest,
      interestGrowth,
      growthLessInterest: nominal !== null && interestGrowth !== null ? r2(nominal - interestGrowth) : null,
      money,
      moneyArea: e.oecd === "EA20" ? "euro area" : e.name,
    };
  });
  return { year, annualSource: inputs.annualSource ?? "the IMF", readAt, source, rows, problems };
}

/** The map's columns: what each shows, its unit, and which way is the stronger reading (null where neither way is). */
export const ECONOMY_COLUMNS = [
  { key: "policyRate", label: "Policy rate", unit: "%", better: null, about: "The central bank's rate, latest (BIS)." },
  { key: "currentAccount", label: "Current account", unit: "% GDP", better: "higher", about: "What the economy earns from abroad less what it pays." },
  { key: "debt", label: "Government debt", unit: "% GDP", better: "lower", about: "General government gross debt (the OECD counts gross financial liabilities)." },
  { key: "realGrowth", label: "Real growth", unit: "%", better: "higher", about: "Real GDP growth, the projection for the year." },
  { key: "nominalGrowth", label: "Nominal growth", unit: "%", better: "higher", about: "GDP growth in money: real growth and inflation together." },
  { key: "interestGrowth", label: "Interest growth", unit: "%", better: "lower", about: "Growth of the government's gross interest payments in money, this year on last." },
  { key: "growthLessInterest", label: "Growth less interest", unit: "pts", better: "higher", about: "Nominal growth less interest growth; below zero, interest outgrows the economy." },
  { key: "money", label: "Broad money", unit: "% a year", better: null, about: "M3 against a year before (OECD)." },
] as const;
export type EconomyColumn = (typeof ECONOMY_COLUMNS)[number];

/** A cell's figure, whatever its shape; null when no source gave it. */
export function cellValue(row: EconomyRow, key: EconomyColumn["key"]): number | null {
  const v = row[key];
  return v === null ? null : typeof v === "number" ? v : v.value;
}

/**
 * Where a cell sits among the economies in its column, from -1 (the weakest
 * reading) to 1 (the strongest), by rank; 0 for a column with no direction or
 * fewer than two readings. Rank, not distance, so one outlier (Japan's debt)
 * does not wash out the rest.
 */
export function cellStrength(rows: readonly EconomyRow[], key: EconomyColumn["key"], row: EconomyRow): number {
  const col = ECONOMY_COLUMNS.find((c) => c.key === key);
  const v = cellValue(row, key);
  if (!col?.better || v === null) return 0;
  const vals = rows.map((r) => cellValue(r, key)).filter((x): x is number => x !== null);
  if (vals.length < 2) return 0;
  const below = vals.filter((x) => x < v).length;
  const equal = vals.filter((x) => x === v).length;
  const rank = (below + (equal - 1) / 2) / (vals.length - 1);
  const s = rank * 2 - 1;
  return Math.round((col.better === "higher" ? s : -s) * 100) / 100;
}
