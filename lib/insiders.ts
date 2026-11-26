/**
 * Insider trades from the SEC's Form 4 (Hamza, 21 Oct 2026, after Unusual
 * Whales): what the company's directors, officers and holders of a tenth or
 * more bought and sold on the open market, read from the filings themselves.
 * A Form 4 is filed on the issuer's own submissions list, so the read needs
 * the company's CIK alone; each form's XML (the ownershipDocument) is read
 * once, by its accession, and only the open-market purchases (code P) and
 * sales (code S) are kept. Awards, option exercises, shares withheld for tax
 * and gifts say nothing about what an insider thinks of the price, so they
 * are counted and left out.
 *
 * Two fields of the ontology come from it, over the past twelve months:
 * `insider_net_buying` (the purchases less the sales, in US dollars) and
 * `insider_buyers` (how many insiders bought). A purchase is an alert for
 * INSIDER_NOTICE_DAYS. A sale under a Rule 10b5-1 plan is marked: it was
 * set up in advance.
 *
 * Pure: lib/edgar.ts fetches, lib/filings-run.ts keeps the trades on the
 * filings file.
 */
import { z } from "zod";

import type { FilingsFile } from "@/lib/filings";
import type { Notice } from "@/lib/screens";
import { addDaysTo, daysBetween } from "@/lib/time";

/** Peter Lynch, One Up on Wall Street (1989); shown over the trades. */
export const LYNCH_QUOTE = { words: "Insiders might sell their shares for any number of reasons, but they buy them for only one: they think the price will rise.", by: "Peter Lynch" } as const;

/** The window the fields and the page read. */
export const INSIDER_DAYS = 365;
/** How far back a first read goes for forms. */
export const INSIDER_READ_DAYS = 400;
/** Forms read per company per run; the rest wait for the next run. */
export const FORMS_PER_RUN = 15;
/** Trades kept per company, newest first. */
export const MAX_TRADES = 120;
/** Accessions remembered per company, so a form is never read twice. */
export const MAX_READ = 400;
/** How long an insider's purchase stays an alert after it is filed. */
export const INSIDER_NOTICE_DAYS = 14;
export const INSIDER_PREFIX = "insider:";

export const insiderTradeSchema = z.object({
  accession: z.string().max(25),
  /** The day the form was filed, and the day of the trade. */
  filed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().max(120),
  /** Who they are to the company, in words: "Chief Executive Officer", "Director", "10% owner". */
  role: z.string().max(120),
  code: z.enum(["P", "S"]),
  shares: z.number(),
  /** The price a share, as filed; null when the form gives none (a weighted average is filed as one price). */
  price: z.number().nullable(),
  /** Shares times the price, in US dollars; null without a price. */
  value: z.number().nullable(),
  /** Shares held after the trade, as filed. */
  ownedAfter: z.number().nullable(),
  /** Held directly, or through a trust, a fund or a family member. */
  direct: z.boolean(),
  /** Made under a Rule 10b5-1 plan, set up in advance (the form's box, or a footnote saying so). */
  plan: z.boolean(),
});
export type InsiderTrade = z.infer<typeof insiderTradeSchema>;

export const insidersSchema = z.object({
  /** When the forms were last read. */
  readAt: z.string(),
  /** The accessions read, newest first, so none is read twice. */
  read: z.array(z.string().max(25)).max(MAX_READ),
  trades: z.array(insiderTradeSchema).max(MAX_TRADES),
  /** Forms on the list not yet read (more than FORMS_PER_RUN new ones). */
  waiting: z.number().int().min(0),
  /** Other transactions in the forms read: awards, exercises, tax withholding, gifts. */
  others: z.number().int().min(0),
});
export type Insiders = z.infer<typeof insidersSchema>;

// ---------------------------------------------------------------------------
// The submissions list

const submissionsSchema = z.object({
  filings: z.object({ recent: z.object({ accessionNumber: z.array(z.string()), form: z.array(z.string()), filingDate: z.array(z.string()), primaryDocument: z.array(z.string()).optional() }).loose() }).loose(),
});

export type Form4Ref = { accession: string; filed: string; document: string };

/**
 * The Form 4s on a company's submissions list filed since `since`, newest
 * first, those already read left out. The primary document is the form's
 * rendering (xslF345X05/form4.xml); the XML itself is the same name without
 * the stylesheet's folder.
 */
export function form4sOf(json: unknown, since: string, read: readonly string[] = []): Form4Ref[] {
  const r = submissionsSchema.safeParse(json);
  if (!r.success) throw new Error("not a submissions document with recent filings");
  const f = r.data.filings.recent;
  const seen = new Set(read);
  const out: Form4Ref[] = [];
  for (let i = 0; i < f.form.length; i++) {
    if (f.form[i] !== "4") continue;
    const filed = f.filingDate[i];
    const accession = f.accessionNumber[i];
    const doc = f.primaryDocument?.[i];
    if (!filed || filed < since || !accession || seen.has(accession) || !doc) continue;
    const document = doc.replace(/^xsl[^/]*\//i, "");
    if (!/\.xml$/i.test(document)) continue;
    out.push({ accession, filed, document });
  }
  return out.sort((a, b) => b.filed.localeCompare(a.filed));
}

// ---------------------------------------------------------------------------
// The form itself

const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/\s+/g, " ").trim();

/** The text of the first <tag> in `xml`, or of its <value> child when it has one. */
function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return null;
  const v = m[1].match(/<value\b[^>]*>([\s\S]*?)<\/value>/i);
  return unescape(v ? v[1] : m[1].replace(/<[^>]+>/g, " "));
}

function blocks(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "gi"))].map((m) => m[1]);
}

const flag = (v: string | null) => v === "1" || v?.toLowerCase() === "true";

const numberOf = (v: string | null) => {
  if (v === null || v === "") return null;
  const n = Number(v.replace(/[,$\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** "COOK TIMOTHY D" as the SEC files it, written "Timothy D Cook". */
export function ownerName(filed: string): string {
  const parts = filed.replace(/\s+/g, " ").trim().split(" ");
  if (parts.length < 2 || /,|\b(inc|llc|lp|ltd|trust|fund|capital|partners|holdings|corp)\b/i.test(filed)) return titleCase(filed);
  const [last, ...rest] = parts;
  return titleCase([...rest, last].join(" "));
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Ii|Iii|Iv)\b/g, (r) => r.toUpperCase());

function roleOf(rel: string): string {
  const out: string[] = [];
  const title = tag(rel, "officerTitle");
  if (flag(tag(rel, "isOfficer"))) out.push(title ? titleCase(title).replace(/\bCeo\b/, "CEO").replace(/\bCfo\b/, "CFO").replace(/\bCoo\b/, "COO").replace(/\bEvp\b/, "EVP").replace(/\bSvp\b/, "SVP") : "Officer");
  if (flag(tag(rel, "isDirector"))) out.push("Director");
  if (flag(tag(rel, "isTenPercentOwner"))) out.push("10% owner");
  if (!out.length) out.push(tag(rel, "otherText") ? titleCase(tag(rel, "otherText")!) : "Insider");
  return out.join(", ").slice(0, 120);
}

export type Form4 = { trades: InsiderTrade[]; others: number; issuer: string | null };

/**
 * One Form 4's open-market purchases and sales (the non-derivative table,
 * codes P and S), with who made them and whether under a 10b5-1 plan; the
 * other transactions counted. Throws when the text is not an ownership
 * document.
 */
export function parseForm4(xml: string, ref: { accession: string; filed: string }): Form4 {
  if (!/<ownershipDocument\b/i.test(xml)) throw new Error("not an ownership document");
  const owners = blocks(xml, "reportingOwner");
  const names = owners.map((o) => tag(o, "rptOwnerName")).filter((n): n is string => !!n);
  const name = (names.length ? names.map(ownerName).join(" and ") : "An insider").slice(0, 120);
  const role = owners.length ? roleOf(owners[0]) : "Insider";
  const footnotes = blocks(xml, "footnotes").join(" ");
  const planBox = flag(tag(xml, "aff10b5One"));
  const issuer = tag(xml, "issuerTradingSymbol");
  const trades: InsiderTrade[] = [];
  let others = 0;
  for (const t of blocks(xml, "nonDerivativeTransaction")) {
    const code = tag(t, "transactionCode")?.toUpperCase() ?? "";
    if (code !== "P" && code !== "S") {
      others++;
      continue;
    }
    const shares = numberOf(tag(t, "transactionShares"));
    const date = tag(t, "transactionDate")?.slice(0, 10) ?? ref.filed;
    if (shares === null || shares <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const price = numberOf(tag(t, "transactionPricePerShare"));
    // A footnote on this transaction that names a 10b5-1 plan counts as the box.
    const ids = [...t.matchAll(/footnoteId\s+id="([^"]+)"/gi)].map((m) => m[1]);
    const noted = ids.some((id) => new RegExp(`<footnote\\s+id="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>[\\s\\S]*?10b5-?1[\\s\\S]*?</footnote>`, "i").test(footnotes));
    trades.push({
      accession: ref.accession.slice(0, 25),
      filed: ref.filed,
      date,
      name,
      role,
      code,
      shares,
      price: price !== null && price > 0 ? price : null,
      value: price !== null && price > 0 ? Math.round(shares * price) : null,
      ownedAfter: numberOf(tag(t, "sharesOwnedFollowingTransaction")),
      direct: (tag(t, "directOrIndirectOwnership") ?? "D").toUpperCase() !== "I",
      plan: planBox || noted,
    });
  }
  return { trades, others, issuer };
}

/** The forms read laid on the kept ones: the trades newest first within the window, the accessions remembered. */
export function withForms(prev: Insiders | null | undefined, read: readonly { ref: Form4Ref; form: Form4 | null }[], waiting: number, readAt: string): Insiders {
  const since = addDaysTo(readAt.slice(0, 10), -INSIDER_READ_DAYS);
  const keptTrades = (prev?.trades ?? []).filter((t) => t.filed >= since);
  const fresh = read.flatMap((r) => r.form?.trades ?? []);
  const seen = new Set(keptTrades.map((t) => `${t.accession}|${t.date}|${t.code}|${t.shares}|${t.price}`));
  const trades = [...keptTrades, ...fresh.filter((t) => !seen.has(`${t.accession}|${t.date}|${t.code}|${t.shares}|${t.price}`))].sort((a, b) => b.date.localeCompare(a.date) || b.filed.localeCompare(a.filed)).slice(0, MAX_TRADES);
  // A form that could not be read is tried again next run, so only those read are remembered.
  const done = read.filter((r) => r.form).map((r) => r.ref.accession);
  return {
    readAt,
    read: [...new Set([...done, ...(prev?.read ?? [])])].slice(0, MAX_READ),
    trades,
    waiting,
    others: (prev?.others ?? 0) + read.reduce((s, r) => s + (r.form?.others ?? 0), 0),
  };
}

// ---------------------------------------------------------------------------
// What the screens read

export type InsiderSide = { value: number; shares: number; trades: number; people: number };
export type InsiderView = {
  buys: InsiderSide;
  sales: InsiderSide;
  /** Purchases less sales, in US dollars. */
  net: number;
  /** The share of the sales' value made under a 10b5-1 plan, 0 to 100; null with no sales. */
  plannedPct: number | null;
  trades: InsiderTrade[];
};

const side = (ts: readonly InsiderTrade[]): InsiderSide => ({ value: ts.reduce((s, t) => s + (t.value ?? 0), 0), shares: ts.reduce((s, t) => s + t.shares, 0), trades: ts.length, people: new Set(ts.map((t) => t.name)).size });

/** The past `days` of trades to `today`: purchases, sales, the net and the trades themselves, newest first. */
export function insiderView(insiders: Insiders | null | undefined, today: string, days = INSIDER_DAYS): InsiderView | null {
  if (!insiders) return null;
  const from = addDaysTo(today, -days);
  const trades = insiders.trades.filter((t) => t.date >= from && t.date <= today);
  const buys = side(trades.filter((t) => t.code === "P"));
  const salesT = trades.filter((t) => t.code === "S");
  const sales = side(salesT);
  const planned = salesT.filter((t) => t.plan).reduce((s, t) => s + (t.value ?? 0), 0);
  return { buys, sales, net: buys.value - sales.value, plannedPct: sales.value > 0 ? (planned / sales.value) * 100 : null, trades };
}

/** The windows the company page offers (Hamza, 23 Oct 2026: "over the last year, year to date, the last 6 months?"); the forms read reach back INSIDER_READ_DAYS, so each is whole. */
export const INSIDER_PERIODS = [
  { key: "1y", label: "Past year" },
  { key: "ytd", label: "Year to date" },
  { key: "6m", label: "6 months" },
  { key: "3m", label: "3 months" },
] as const;
export type InsiderPeriod = (typeof INSIDER_PERIODS)[number]["key"];

/** The days a window covers to `today`: a year, the days since 1 January, half a year or a quarter. */
export function insiderPeriodDays(period: InsiderPeriod, today: string): number {
  if (period === "ytd") return Math.max(0, daysBetween(`${today.slice(0, 4)}-01-01`, today));
  return period === "6m" ? 182 : period === "3m" ? 91 : INSIDER_DAYS;
}

/** The ontology's two insider fields over the past twelve months. */
export function insiderFields(insiders: Insiders | null | undefined, today: string): { insider_net_buying: number | null; insider_buyers: number | null } {
  const v = insiderView(insiders, today);
  if (!v) return { insider_net_buying: null, insider_buyers: null };
  return { insider_net_buying: v.net, insider_buyers: v.buys.people };
}

const money = (n: number) => (Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(1)}bn` : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}m` : Math.abs(n) >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`);

/** A trade in words: "Bought 5,000 shares at $41.20 ($206k)". */
export function tradeWords(t: InsiderTrade): string {
  const verb = t.code === "P" ? "Bought" : "Sold";
  return `${verb} ${Math.round(t.shares).toLocaleString("en-US")} shares${t.price !== null ? ` at $${t.price.toFixed(2)}` : ""}${t.value !== null ? ` (${money(t.value)})` : ""}${t.plan ? ", under a 10b5-1 plan" : ""}${t.direct ? "" : ", held indirectly"}`;
}

/**
 * Each open-market purchase by an insider of a company the person holds or
 * watches, filed in the last INSIDER_NOTICE_DAYS: one alert per form, keyed
 * by the symbol and the accession.
 */
export function insiderNotices(filings: FilingsFile | null | undefined, today: string): Notice[] {
  const out: Notice[] = [];
  for (const [symbol, e] of Object.entries(filings?.bySymbol ?? {})) {
    const byForm = new Map<string, InsiderTrade[]>();
    for (const t of e.insiders?.trades ?? []) {
      if (t.code !== "P" || daysBetween(t.filed, today) > INSIDER_NOTICE_DAYS || t.filed > today) continue;
      byForm.set(t.accession, [...(byForm.get(t.accession) ?? []), t]);
    }
    for (const [accession, ts] of byForm) {
      const value = ts.reduce((s, t) => s + (t.value ?? 0), 0);
      const shares = ts.reduce((s, t) => s + t.shares, 0);
      out.push({
        key: `${INSIDER_PREFIX}${symbol}:${accession}`,
        date: ts[0].filed,
        tone: "info",
        title: `${symbol}: ${ts[0].name} bought shares`,
        detail: `${ts[0].role}. ${Math.round(shares).toLocaleString("en-US")} shares on the open market${value ? `, ${money(value)}` : ""}, filed ${ts[0].filed} (Form 4).`,
        href: `/company/${encodeURIComponent(symbol)}#insiders`,
      });
    }
  }
  return out;
}
