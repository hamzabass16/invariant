import { z } from "zod";

/**
 * Where the money in US ETFs went (Hamza, 20 Nov 2026, after The ETF
 * Tracker's chart, "SEC filings" over the issuers' files): each fund's own
 * monthly flows from its N-PORT reports to the SEC (Part B, Item B.6: the
 * value of shares sold, sold on reinvested distributions, and redeemed in
 * each of the report's three months), summed by bucket over the latest three
 * months most of the funds have filed. A fund's N-PORT is public only for the
 * last month of its fiscal quarter, about sixty days after it, so the chart
 * runs months behind and says which months. What left the buckets that lost
 * money and the new money are spread over the buckets that gained it, in
 * proportion, since money is not labelled. Gold, silver and bitcoin trusts
 * are not investment companies and file no N-PORT. Pure; lib/etf-flows-run.ts
 * reads the filings through lib/edgar.ts.
 */

/** `short` is the name a phone draws when the label would not fit beside the chart. */
export type FlowBucket = { id: string; label: string; short?: string };

/** The buckets, in the order the table lists them. */
export const BUCKETS: readonly FlowBucket[] = [
  { id: "sp500", label: "S&P 500" },
  { id: "total_us", label: "Total US market" },
  { id: "us_large", label: "US large-cap" },
  { id: "nasdaq100", label: "Nasdaq-100" },
  { id: "growth", label: "US growth" },
  { id: "value", label: "US value" },
  { id: "mid_small", label: "Mid and small caps", short: "Mid and small" },
  { id: "dividend", label: "Dividend stocks" },
  { id: "factor", label: "Factor" },
  { id: "options_income", label: "Options income" },
  { id: "technology", label: "Technology" },
  { id: "financials", label: "Financials" },
  { id: "health", label: "Health care" },
  { id: "energy", label: "Energy" },
  { id: "real_estate", label: "Real estate" },
  { id: "other_sectors", label: "Other sectors" },
  { id: "ex_us", label: "Ex-US broad" },
  { id: "developed", label: "Developed markets", short: "Developed" },
  { id: "emerging", label: "Emerging markets" },
  { id: "countries", label: "Single countries" },
  { id: "leveraged", label: "Leveraged and inverse", short: "Leveraged" },
  { id: "treasuries", label: "Treasuries" },
  { id: "bills", label: "Cash and T-bills" },
  { id: "ultra_short", label: "Ultra-short bonds", short: "Ultra-short" },
  { id: "core_bonds", label: "Core bonds" },
  { id: "corporate", label: "Corporate bonds" },
  { id: "high_yield", label: "High yield" },
  { id: "munis", label: "Munis" },
  { id: "mortgage", label: "Mortgage bonds" },
  { id: "tips", label: "Inflation-linked bonds", short: "TIPS" },
  { id: "intl_bonds", label: "International bonds", short: "Intl bonds" },
];

/**
 * A fund followed: its ticker and bucket. The SEC's fund list (company_tickers_mf.json)
 * gives a series fund's trust and series; a unit investment trust with no
 * series (SPY, QQQ, DIA) carries its own CIK here and the words its filing's
 * name must hold, so a wrong number never reads another fund.
 */
export type FlowFund = { symbol: string; bucket: string; cik?: number; named?: string };

const f = (bucket: string, ...symbols: string[]): FlowFund[] => symbols.map((symbol) => ({ symbol, bucket }));

/** The largest US-listed ETFs by bucket, at most a few per bucket; the read is spread over the runs. */
export const FLOW_FUNDS: readonly FlowFund[] = [
  { symbol: "SPY", bucket: "sp500", cik: 884394, named: "S&P 500" },
  ...f("sp500", "IVV", "VOO", "SPYM"),
  ...f("total_us", "VTI", "ITOT", "SCHB"),
  { symbol: "DIA", bucket: "us_large", cik: 1041130, named: "Dow" },
  ...f("us_large", "IWB", "SCHX", "VV", "MGC"),
  { symbol: "QQQ", bucket: "nasdaq100", cik: 1067839, named: "QQQ" },
  ...f("nasdaq100", "QQQM"),
  ...f("growth", "VUG", "IWF", "SCHG", "SPYG", "IVW", "MGK"),
  ...f("value", "VTV", "IWD", "SCHV", "IVE"),
  ...f("mid_small", "IJH", "VO", "IWM", "IJR", "VB", "VXF"),
  ...f("dividend", "SCHD", "VIG", "VYM", "DGRO", "DVY", "SDY", "NOBL"),
  ...f("factor", "QUAL", "MTUM", "USMV", "RSP"),
  ...f("options_income", "JEPI", "JEPQ", "QYLD"),
  ...f("technology", "XLK", "VGT", "SMH"),
  ...f("financials", "XLF", "VFH"),
  ...f("health", "XLV", "VHT"),
  ...f("energy", "XLE", "VDE"),
  ...f("real_estate", "VNQ", "XLRE"),
  ...f("other_sectors", "XLI", "XLY", "XLP", "XLU", "XLC", "XLB"),
  ...f("ex_us", "VXUS", "IXUS", "VEU"),
  ...f("developed", "VEA", "IEFA", "EFA", "SCHF"),
  ...f("emerging", "VWO", "IEMG", "EEM"),
  ...f("countries", "EWJ", "INDA", "MCHI", "EWZ", "EWY", "EWT"),
  ...f("leveraged", "TQQQ", "SQQQ", "SOXL"),
  ...f("treasuries", "GOVT", "IEF", "TLT", "SHY", "VGIT", "VGSH", "SCHR"),
  ...f("bills", "SGOV", "BIL", "SHV", "USFR", "TFLO"),
  ...f("ultra_short", "JPST", "MINT", "PULS", "ICSH"),
  ...f("core_bonds", "AGG", "BND", "SCHZ", "IUSB"),
  ...f("corporate", "LQD", "VCIT", "VCSH", "IGSB", "IGIB"),
  ...f("high_yield", "HYG", "JNK", "USHY"),
  ...f("munis", "MUB", "VTEB", "SUB"),
  ...f("mortgage", "MBB", "VMBS"),
  ...f("tips", "TIP", "SCHP", "VTIP"),
  ...f("intl_bonds", "BNDX", "IAGG"),
];

/** How long a fund's read serves before its filings are looked at again; a new report lands once a quarter. */
export const FLOW_REFRESH_DAYS = 7;
/** How long after a failed read it is tried again. */
export const FLOW_RETRY_DAYS = 1;
/** The months a window spans. */
export const WINDOW_MONTHS = 3;
/** The reports read per fund: two give six months, so funds with different fiscal quarters share a window. */
export const REPORTS_PER_FUND = 2;
/** How far back a report is looked for, in days from today: two quarters, the sixty days before they are public, and a margin. */
export const REPORT_LOOKBACK_DAYS = 300;
/** The share of the funds read, by net assets, that must report a month for it to be in the window. */
export const MIN_COVERED_SHARE = 0.8;
/** The buckets drawn on each side before the rest are folded into one. */
export const SHOWN_PER_SIDE = 8;

const money = z.number().finite();
export const flowMonthSchema = z.object({
  /** YYYY-MM. */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  sales: money.nullable(),
  reinvestment: money.nullable(),
  redemption: money.nullable(),
});
export type FlowMonth = z.infer<typeof flowMonthSchema>;

/** One fund's read, kept for everyone in the registry's company_figures (kind `etf_flow`, by ticker). */
export const fundFlowSchema = z.object({
  symbol: z.string(),
  bucket: z.string(),
  name: z.string().nullable(),
  /** The reports read, newest first: the accession, the period's last day, net assets. */
  reports: z.array(z.object({ accession: z.string(), reportDate: z.string(), netAssets: z.number().nullable() })),
  months: z.array(flowMonthSchema),
  readAt: z.string(),
  /** Why the last read failed; the months kept are the last good read's. */
  error: z.string().nullable().optional(),
});
export type FundFlow = z.infer<typeof fundFlowSchema>;

/** A trust's NPORT-P filings by the series each reports, read once (kind `nport_index`, by CIK); a filing reports one series. */
export const seriesIndexSchema = z.object({ cik: z.number(), bySeries: z.record(z.string(), z.string()), readAt: z.string() });
export type SeriesIndex = z.infer<typeof seriesIndexSchema>;

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").trim();

/** The text of the first element with this local name (any namespace prefix), or null. */
function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`).exec(xml);
  return m ? decode(m[1]) : null;
}

/** The attributes of the first element with this local name, or null. */
function attrs(xml: string, name: string): Record<string, string> | null {
  const m = new RegExp(`<(?:[\\w-]+:)?${name}(\\s[^>]*?)/?>`).exec(xml);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const a of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) out[a[1]] = decode(a[2]);
  return out;
}

const amount = (v: string | undefined): number | null => {
  if (v === undefined || v === "" || /^n\/?a$/i.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** The month `n` months from YYYY-MM. */
export function shiftYm(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Where the general information ends; the series is in it, so a reader looking only for the series stops here. */
export const GEN_INFO_END = "</genInfo>";
/** Where the fund's own figures end, before its holdings, so a large bond fund's report is never read whole. */
export const FUND_INFO_END = "</fundInfo>";

/** The series an N-PORT reports and the period, from its general information; throws when it is not an N-PORT. */
export function nportSeriesOf(xml: string): { seriesId: string | null; reportDate: string; name: string | null } {
  const reportDate = tag(xml, "repPdDate");
  if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new Error("no report date: not an N-PORT document");
  const series = tag(xml, "seriesId");
  return { seriesId: series && /^S\d{9}$/.test(series) ? series : null, reportDate, name: tag(xml, "seriesName") || tag(xml, "regName") };
}

export type NportFlows = { seriesId: string | null; reportDate: string; name: string | null; netAssets: number | null; months: FlowMonth[] };

/**
 * A report's flows (Item B.6): `mon1Flow` to `mon3Flow` under fundInfo, each
 * with `sales`, `reinvestment` and `redemption` in the fund's dollars, month 3
 * being the report's own month. "N/A" is no figure; a month with none is left
 * out. Throws when the document is not an N-PORT or carries no flows, so a
 * report that cannot be read never looks like a quiet quarter.
 */
export function parseNportFlows(xml: string): NportFlows {
  const head = nportSeriesOf(xml);
  const info = tag(xml, "fundInfo");
  if (info === null) throw new Error("no fund information");
  const last = head.reportDate.slice(0, 7);
  const months: FlowMonth[] = [];
  for (const k of [1, 2, 3]) {
    const a = attrs(info, `mon${k}Flow`);
    if (!a) continue;
    const m = { month: shiftYm(last, k - 3), sales: amount(a.sales), reinvestment: amount(a.reinvestment), redemption: amount(a.redemption) };
    if (m.sales !== null || m.redemption !== null || m.reinvestment !== null) months.push(m);
  }
  if (!months.length) throw new Error("no flow information");
  const net = Number(tag(info, "netAssets"));
  return { ...head, netAssets: Number.isFinite(net) && net > 0 ? net : null, months };
}

/** A month's net flow: shares sold and reinvested less redeemed; none when neither side is given. */
export function netOf(m: FlowMonth): number | null {
  if (m.sales === null && m.redemption === null) return null;
  return (m.sales ?? 0) + (m.reinvestment ?? 0) - (m.redemption ?? 0);
}

/** The SEC's fund list (company_tickers_mf.json: `fields` naming the columns of `data`) as ticker to trust and series. */
export function fundTickersOf(json: unknown): Map<string, { cik: number; seriesId: string | null }> {
  const j = json as { fields?: unknown; data?: unknown };
  if (!Array.isArray(j?.data)) throw new Error("no data in the fund list");
  const fields = Array.isArray(j.fields) ? (j.fields as string[]) : ["cik", "seriesId", "classId", "symbol"];
  const at = (name: string) => fields.findIndex((x) => x.toLowerCase() === name.toLowerCase());
  const [ci, si, yi] = [at("cik"), at("seriesId"), at("symbol")];
  if (ci < 0 || yi < 0) throw new Error("the fund list names no cik or symbol");
  const out = new Map<string, { cik: number; seriesId: string | null }>();
  for (const row of j.data as unknown[][]) {
    if (!Array.isArray(row)) continue;
    const symbol = String(row[yi] ?? "").toUpperCase();
    const cik = Number(row[ci]);
    if (!symbol || !Number.isInteger(cik) || cik <= 0 || out.has(symbol)) continue;
    const s = si >= 0 ? String(row[si] ?? "") : "";
    out.set(symbol, { cik, seriesId: /^S\d{9}$/.test(s) ? s : null });
  }
  return out;
}

export type NportRef = { accession: string; filed: string; reportDate: string | null; document: string };

/** Every NPORT-P in a submissions document filed on or after `since`, newest first; the raw XML document, not its styled view. */
export function nportFilingsOf(submissions: unknown, since: string): NportRef[] {
  const recent = (submissions as { filings?: { recent?: Record<string, unknown[]> } })?.filings?.recent;
  if (!recent || !Array.isArray(recent.form)) throw new Error("no recent filings in the submissions document");
  const out: NportRef[] = [];
  (recent.form as string[]).forEach((form, i) => {
    if (form !== "NPORT-P") return;
    const filed = String(recent.filingDate?.[i] ?? "");
    const accession = String(recent.accessionNumber?.[i] ?? "");
    if (!/^\d{10}-\d{2}-\d{6}$/.test(accession) || filed < since) return;
    const doc = String(recent.primaryDocument?.[i] ?? "primary_doc.xml");
    out.push({ accession, filed, reportDate: (recent.reportDate?.[i] as string | undefined) || null, document: doc.split("/").pop() || "primary_doc.xml" });
  });
  return out.sort((a, b) => (b.reportDate ?? b.filed).localeCompare(a.reportDate ?? a.filed) || b.filed.localeCompare(a.filed));
}

/** A fund's two latest reports: of its series when it has one, else the trust's own; one report per period, the later filing kept. */
export function reportsFor(filings: readonly NportRef[], index: Record<string, string>, seriesId: string | null): NportRef[] {
  const mine = seriesId ? filings.filter((x) => index[x.accession] === seriesId) : filings;
  const seen = new Set<string>();
  const out: NportRef[] = [];
  for (const x of mine) {
    const period = x.reportDate ?? x.filed;
    if (seen.has(period)) continue;
    seen.add(period);
    out.push(x);
    if (out.length >= REPORTS_PER_FUND) break;
  }
  return out;
}

/** The months of several reports as one list, each month once, the newer report's figure winning. */
export function mergeMonths(reports: readonly NportFlows[]): FlowMonth[] {
  const by = new Map<string, FlowMonth>();
  for (const r of [...reports].sort((a, b) => a.reportDate.localeCompare(b.reportDate))) for (const m of r.months) by.set(m.month, m);
  return [...by.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** The funds due a read, never read first, then the oldest read; a failed read after `FLOW_RETRY_DAYS`. */
export function fundsDue(funds: readonly FlowFund[], kept: Record<string, FundFlow>, now: Date): FlowFund[] {
  const age = (iso: string) => (now.getTime() - new Date(iso).getTime()) / 86_400_000;
  return funds
    .filter((x) => {
      const k = kept[x.symbol];
      if (!k) return true;
      return age(k.readAt) >= (k.error ? FLOW_RETRY_DAYS : FLOW_REFRESH_DAYS);
    })
    .sort((a, b) => (kept[a.symbol]?.readAt ?? "").localeCompare(kept[b.symbol]?.readAt ?? ""));
}

export type BucketFlow = { id: string; label: string; short?: string; net: number; funds: { symbol: string; net: number }[] };

export type EtfFlows = {
  /** The window's months, oldest first; empty when no window is covered. */
  months: string[];
  buckets: BucketFlow[];
  /** What left the buckets that lost money, as a positive sum. */
  pulled: number;
  /** What reached the buckets that gained money. */
  landed: number;
  /** Landed less pulled: new money when above zero, money that left the funds when below. */
  newMoney: number;
  /** The funds counted, and those followed. */
  counted: number;
  followed: number;
  /** Funds read that do not cover every month of the window. */
  outside: string[];
  /** Funds not read yet, or whose last read failed. */
  unread: string[];
  /** The newest read among the funds counted. */
  readAt: string | null;
};

/**
 * The window and the buckets: the latest `WINDOW_MONTHS` consecutive months
 * each reported by funds holding `MIN_COVERED_SHARE` of the read funds' net
 * assets; a fund counted only when it reports every one of them, the rest
 * named. Each bucket's net is its funds' flows summed over the window.
 */
export function etfFlows(funds: readonly FlowFund[], kept: Record<string, FundFlow>): EtfFlows {
  const read = funds.map((x) => kept[x.symbol]).filter((k): k is FundFlow => !!k && k.months.length > 0);
  const unread = funds.filter((x) => !kept[x.symbol]?.months.length).map((x) => x.symbol);
  const weight = (k: FundFlow) => k.reports[0]?.netAssets ?? 0;
  const total = read.reduce((s, k) => s + weight(k), 0);
  const covered = (month: string) => read.filter((k) => k.months.some((m) => m.month === month && netOf(m) !== null)).reduce((s, k) => s + weight(k), 0);
  const all = [...new Set(read.flatMap((k) => k.months.map((m) => m.month)))].sort().reverse();
  let months: string[] = [];
  for (const end of all) {
    const span = Array.from({ length: WINDOW_MONTHS }, (_, i) => shiftYm(end, i - WINDOW_MONTHS + 1));
    if (total > 0 && span.every((m) => covered(m) >= MIN_COVERED_SHARE * total)) {
      months = span;
      break;
    }
  }
  const inWindow = (k: FundFlow) => months.length > 0 && months.every((mo) => k.months.some((m) => m.month === mo && netOf(m) !== null));
  const counted = read.filter(inWindow);
  const outside = read.filter((k) => !inWindow(k)).map((k) => k.symbol);
  const bucketOf = new Map(funds.map((x) => [x.symbol, x.bucket]));
  const buckets: BucketFlow[] = [];
  for (const b of BUCKETS) {
    const mine = counted.filter((k) => bucketOf.get(k.symbol) === b.id);
    if (!mine.length) continue;
    const list = mine.map((k) => ({ symbol: k.symbol, net: k.months.filter((m) => months.includes(m.month)).reduce((s, m) => s + (netOf(m) ?? 0), 0) })).sort((a, c) => Math.abs(c.net) - Math.abs(a.net));
    buckets.push({ id: b.id, label: b.label, short: b.short, net: list.reduce((s, x) => s + x.net, 0), funds: list });
  }
  const pulled = -buckets.filter((b) => b.net < 0).reduce((s, b) => s + b.net, 0);
  const landed = buckets.filter((b) => b.net > 0).reduce((s, b) => s + b.net, 0);
  const readAt = counted.map((k) => k.readAt).sort().pop() ?? null;
  return { months, buckets, pulled, landed, newMoney: landed - pulled, counted: counted.length, followed: funds.length, outside, unread, readAt };
}

export type SankeyNode = { id: string; label: string; short?: string; value: number; tickers: string[]; kind: "out" | "in" | "new" | "left"; folded?: number };

/**
 * The two sides: on the left the buckets that lost money, the largest first
 * and the rest folded past `SHOWN_PER_SIDE`, then the new money; on the right
 * the buckets that gained it, folded the same way, then, when more left than
 * landed, the money that left the funds.
 */
export function sankeySides(flows: EtfFlows, shown = SHOWN_PER_SIDE): { left: SankeyNode[]; right: SankeyNode[] } {
  const side = (list: BucketFlow[], kind: "out" | "in"): SankeyNode[] => {
    const sorted = [...list].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    const head = sorted.length > shown ? sorted.slice(0, shown - 1) : sorted;
    const rest = sorted.slice(head.length);
    const nodes: SankeyNode[] = head.map((b) => ({ id: b.id, label: b.label, short: b.short, value: Math.abs(b.net), tickers: b.funds.filter((x) => (kind === "in" ? x.net > 0 : x.net < 0)).slice(0, 2).map((x) => x.symbol), kind }));
    if (rest.length) nodes.push({ id: `${kind}-rest`, label: `${rest.length} other buckets`, value: rest.reduce((s, b) => s + Math.abs(b.net), 0), tickers: [], kind, folded: rest.length });
    return nodes;
  };
  const left = side(flows.buckets.filter((b) => b.net < 0), "out");
  const right = side(flows.buckets.filter((b) => b.net > 0), "in");
  if (flows.newMoney > 0) left.push({ id: "new", label: "New money", value: flows.newMoney, tickers: [], kind: "new" });
  if (flows.newMoney < 0) right.push({ id: "left", label: "Left the funds", value: -flows.newMoney, tickers: [], kind: "left" });
  return { left, right };
}

export type SankeyBox = SankeyNode & { x: number; y: number; h: number; labelY: number };
export type SankeyLink = { from: string; to: string; value: number; path: string; kind: SankeyNode["kind"] };
export type SankeyLayout = { width: number; height: number; bar: number; labelW: number; compact: boolean; left: SankeyBox[]; right: SankeyBox[]; links: SankeyLink[] };

/** Narrower than this the labels lose their tickers and shrink (a phone's card). */
export const SANKEY_COMPACT_WIDTH = 560;
const GAP = 6;
const BAR = 8;

/**
 * The geometry: each node a band at least one label's pitch tall with its bar
 * inside, the bars scaled to one total, so a small bucket keeps a readable
 * label; every left node spread over the right nodes in proportion to their
 * size (money is not labelled), each ribbon a curve from its share of the
 * left bar to its share of the right one.
 */
export function sankeyLayout(sides: { left: SankeyNode[]; right: SankeyNode[] }, width: number): SankeyLayout {
  const compact = width < SANKEY_COMPACT_WIDTH;
  const pitch = compact ? 30 : 34;
  const labelW = compact ? Math.min(118, Math.round(width * 0.31)) : Math.min(190, Math.round(width * 0.24));
  const total = Math.max(sides.left.reduce((s, n) => s + n.value, 0), sides.right.reduce((s, n) => s + n.value, 0));
  const height = compact ? 380 : 440;
  // The scale that makes the taller side fill the height with its bands, found by halving.
  const fill = (nodes: SankeyNode[], k: number) => nodes.reduce((s, n) => s + Math.max(n.value * k, pitch), 0) + GAP * Math.max(0, nodes.length - 1);
  let lo = 0;
  let hi = total > 0 ? height / total : 0;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (Math.max(fill(sides.left, mid), fill(sides.right, mid)) > height) hi = mid;
    else lo = mid;
  }
  const k = lo;
  const place = (nodes: SankeyNode[], x: number): SankeyBox[] => {
    const used = fill(nodes, k);
    let y = (height - used) / 2;
    return nodes.map((n) => {
      const band = Math.max(n.value * k, pitch);
      const h = Math.max(n.value * k, 2);
      const box = { ...n, x, y: y + (band - h) / 2, h, labelY: y + band / 2 };
      y += band + GAP;
      return box;
    });
  };
  const left = place(sides.left, labelW);
  const right = place(sides.right, width - labelW - BAR);
  const rightTotal = sides.right.reduce((s, n) => s + n.value, 0);
  const links: SankeyLink[] = [];
  const outAt = new Map(left.map((b) => [b.id, b.y]));
  const inAt = new Map(right.map((b) => [b.id, b.y]));
  const x0 = labelW + BAR;
  const x1 = width - labelW - BAR;
  const mx = (x0 + x1) / 2;
  for (const l of left) {
    for (const r of right) {
      const value = rightTotal > 0 ? (l.value * r.value) / rightTotal : 0;
      if (value <= 0) continue;
      const lh = l.value > 0 ? (value / l.value) * l.h : 0;
      // Each side takes the link's share of its own bar; the two sides add to the same total, so both bars fill exactly.
      const rShare = r.value > 0 ? (value / r.value) * r.h : 0;
      const ya = outAt.get(l.id) as number;
      const yb = inAt.get(r.id) as number;
      outAt.set(l.id, ya + lh);
      inAt.set(r.id, yb + rShare);
      const p = (n: number) => Math.round(n * 10) / 10;
      const path = `M${p(x0)},${p(ya)} C${p(mx)},${p(ya)} ${p(mx)},${p(yb)} ${p(x1)},${p(yb)} L${p(x1)},${p(yb + rShare)} C${p(mx)},${p(yb + rShare)} ${p(mx)},${p(ya + lh)} ${p(x0)},${p(ya + lh)} Z`;
      links.push({ from: l.id, to: r.id, value, path, kind: l.kind });
    }
  }
  return { width, height, bar: BAR, labelW, compact, left, right, links };
}

/** Dollars shortened, signed when asked: "+$79.5B", "−$7.7B". */
export function flowDollars(v: number, signed = false): string {
  const a = Math.abs(v);
  const [n, unit] = a >= 1e12 ? [a / 1e12, "T"] : a >= 1e9 ? [a / 1e9, "B"] : a >= 1e6 ? [a / 1e6, "M"] : [a / 1e3, "K"];
  const body = `$${n >= 100 ? n.toFixed(0) : n.toFixed(1)}${unit}`;
  if (!signed) return body;
  return v < 0 ? `−${body}` : `+${body}`;
}

const MONTH_WORDS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The window in words: "Jul to Sep 2026", "Nov 2025 to Jan 2026". */
export function windowWords(months: readonly string[]): string {
  if (!months.length) return "";
  const w = (m: string) => MONTH_WORDS[Number(m.slice(5, 7)) - 1];
  const [a, b] = [months[0], months[months.length - 1]];
  return a.slice(0, 4) === b.slice(0, 4) ? `${w(a)} to ${w(b)} ${b.slice(0, 4)}` : `${w(a)} ${a.slice(0, 4)} to ${w(b)} ${b.slice(0, 4)}`;
}

/** What the chart rests on, in one or two sentences, with the funds left out named. */
export function flowsNote(flows: EtfFlows): string {
  const parts = [`${flows.counted} of ${flows.followed} of the largest US ETFs, from their N-PORT reports to the SEC: shares sold and reinvested less shares redeemed, by month. A report is public only for the last month of a fund's quarter, about sixty days after it, so these are the latest three months most funds have filed.`];
  if (flows.outside.length) parts.push(`Not yet filed for these months: ${flows.outside.slice(0, 8).join(", ")}${flows.outside.length > 8 ? ` and ${flows.outside.length - 8} more` : ""}.`);
  if (flows.unread.length) parts.push(`Not read yet: ${flows.unread.slice(0, 8).join(", ")}${flows.unread.length > 8 ? ` and ${flows.unread.length - 8} more` : ""}.`);
  parts.push("Gold, silver and bitcoin trusts file no N-PORT and are not in it.");
  return parts.join(" ");
}

/** How many ETFs each side of the fund-by-fund card lists. */
export const FUNDS_PER_SIDE = 8;

export type FundMoved = { symbol: string; bucket: string; net: number };

/**
 * The window fund by fund: the ETFs that took in the most and those that
 * lost the most, largest first, at most `per` a side; a fund at zero is on
 * neither.
 */
export function fundsMoved(flows: EtfFlows, per = FUNDS_PER_SIDE): { inflows: FundMoved[]; outflows: FundMoved[] } {
  const all = flows.buckets.flatMap((b) => b.funds.map((f) => ({ symbol: f.symbol, bucket: b.short ?? b.label, net: f.net })));
  return {
    inflows: all.filter((f) => f.net > 0).sort((a, b) => b.net - a.net).slice(0, per),
    outflows: all.filter((f) => f.net < 0).sort((a, b) => a.net - b.net).slice(0, per),
  };
}
