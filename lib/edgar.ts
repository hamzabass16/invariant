import "server-only";

import { cache } from "react";

import { companyProfileOf, companyRows, factsTable, findCompany, searchCompanies, type CompanyProfile, type CompanyRow, type FactsTable } from "@/lib/edgar-facts";
import { geographyFilingOf, geographyRead, instanceFileOf, mergeSegmentSeries, mixedNote, SEGMENT_HISTORY_VERSION, periodicFilingsOf, revenueGeographyOf, segmentHistoryFilings, segmentRead, segmentSeriesOf, type LatestFiling, type SegmentHistory, type SegmentRead, type SegmentSeriesRead } from "@/lib/edgar-segments";
import { htmlToText, MAX_RELEASE_CHARS, releaseDocumentsOf } from "@/lib/earnings";
import { latestAnnualOf, type AnnualFiling } from "@/lib/ecosystem";
import type { RevenueGeography } from "@/lib/holdings";
import { infoTableName, issuerCompany, parseInfoTable, thirteenFsOf, type FilingRef, type InfoRow } from "@/lib/funds";
import { FORMS_PER_RUN, form4sOf, parseForm4, type Form4, type Form4Ref } from "@/lib/insiders";
import { fundTickersOf, nportFilingsOf, type NportRef } from "@/lib/etf-flows";
import { latestNportOf, parseNport, type NportFiling, type NportReport } from "@/lib/nport";
import { edgarUserAgent, type EdgarContact } from "@/lib/preferences";
import { SyncError } from "@/lib/sync-error";

/**
 * SEC EDGAR, read-only: the ticker list and a company's XBRL facts. The SEC
 * asks every client to identify itself in the User-Agent with a name and a
 * contact address, so every call carries the contact the person confirmed on
 * the Research screen (lib/preferences.ts) and nothing is fetched before they
 * do. The deployment holds no address of its own. Nothing else about the
 * person is sent: the company's CIK alone goes in the URL. Errors are sentences,
 * never bodies.
 */

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const FACTS_URL = (cik: number) => `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, "0")}.json`;
const SUBMISSIONS_URL = (cik: number) => `https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`;
const FILING_URL = (cik: number, accession: string, file: string) => `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}/${file}`;
/** The largest XBRL instance read, in bytes; a 10-K of a large filer is a few megabytes. */
const MAX_INSTANCE_BYTES = 60 * 1024 * 1024;

export const NO_CONTACT = "Filings are read only once you confirm the contact address the SEC will see, on the Research screen.";

function headers(contact: EdgarContact): HeadersInit {
  return { "user-agent": edgarUserAgent(contact), accept: "application/json" };
}

/** How long to wait before asking the SEC again after it answered with its rate limit or a passing error; the waits run in turn. */
const RETRY_WAITS_MS = [2_000, 6_000];
/** The longest Retry-After the SEC is taken at its word for, so one read never holds a run for minutes. */
const MAX_RETRY_AFTER_MS = 15_000;

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function getJson(url: string, what: string, contact: EdgarContact | null): Promise<unknown> {
  if (!contact) throw new SyncError(NO_CONTACT, `edgar ${what} no contact`);
  let res: Response;
  // A 429 or a 5xx is the SEC's rate limit or a passing fault: asked again after a wait, twice at most (24 Oct 2026: one 429 on the company list failed a morning's filings).
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, { headers: headers(contact), cache: "no-store", signal: AbortSignal.timeout(25_000) });
    } catch {
      throw new SyncError(`SEC EDGAR could not be reached for the ${what}. Try again in a moment.`, `edgar ${what} unreachable`);
    }
    const passing = res.status === 429 || res.status >= 500;
    if (!passing || attempt >= RETRY_WAITS_MS.length) break;
    const after = Number(res.headers.get("retry-after"));
    await pause(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, MAX_RETRY_AFTER_MS) : RETRY_WAITS_MS[attempt]);
  }
  if (res.status === 404) throw new SyncError(`SEC EDGAR has no ${what} for this company.`, `edgar ${what} 404`);
  if (res.status === 403 || res.status === 429) throw new SyncError("SEC EDGAR refused the request: its rate limit, or it did not accept the contact address. Try again in a minute, or confirm another address on the Research screen.", `edgar ${what} ${res.status}`);
  if (!res.ok) throw new SyncError(`SEC EDGAR returned an error for the ${what}.`, `edgar ${what} ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new SyncError(`SEC EDGAR's ${what} could not be read.`, `edgar ${what} bad json`);
  }
}

/**
 * The deployment's own contact for the SEC, for reads no one person asked for
 * (the public research server, the shared company figures): SEC_CONTACT, else
 * the app's inbox address; null when neither is set.
 */
export function operatorContact(): EdgarContact | null {
  const address = (process.env.SEC_CONTACT ?? process.env.INBOX_ADDRESS ?? "").trim();
  return address.length >= 3 ? { address, consentedAt: "operator" } : null;
}

/**
 * The company behind a ticker or a name (lib/edgar-facts.ts findCompany);
 * null when the SEC lists none (a foreign listing, an ETF, a theme, a typo).
 * The subject goes nowhere: the list is fetched whole and matched here.
 */
export async function lookupCompany(subject: string, contact: EdgarContact | null): Promise<CompanyRow | null> {
  return findCompany(await companyList(contact), subject);
}

/** A 13F position's company by the issuer's name (lib/funds.ts issuerCompany), in the SEC's list fetched once per request. */
export async function findIssuer(name: string, contact: EdgarContact | null): Promise<CompanyRow | null> {
  return issuerCompany(await companyList(contact), name);
}

/** The companies matching what a person typed on the Companies screen (lib/edgar-facts.ts searchCompanies); the words typed go nowhere. */
export async function searchCompanyList(typed: string, contact: EdgarContact | null): Promise<CompanyRow[]> {
  return searchCompanies(await companyList(contact), typed);
}

/** How long a read of the SEC's company list serves this instance; the list changes as companies list and delist, not by the hour. */
const LIST_KEEP_MS = 12 * 60 * 60 * 1000;
/** The last good read of the company list on this instance: the SEC's public list, no one's data. */
let keptList: { at: number; rows: CompanyRow[] } | null = null;

/**
 * The SEC's company list, fetched once per request however many holdings are
 * looked up, and kept on the instance for `LIST_KEEP_MS`. A read that fails
 * falls back to the last good one, so one refusal never fails every company
 * read after it.
 */
const companyList = cache(async (contact: EdgarContact | null): Promise<CompanyRow[]> => {
  if (!contact) throw new SyncError(NO_CONTACT, "edgar company list no contact");
  if (keptList && Date.now() - keptList.at < LIST_KEEP_MS) return keptList.rows;
  try {
    const json = await getJson(TICKERS_URL, "company list", contact);
    let rows: CompanyRow[];
    try {
      rows = companyRows(json);
    } catch {
      throw new SyncError("SEC EDGAR's company list could not be read.", "edgar tickers shape");
    }
    keptList = { at: Date.now(), rows };
    return rows;
  } catch (e) {
    if (keptList) return keptList.rows;
    throw e;
  }
});

/** The company's facts as a table. */
export async function companyFacts(cik: number, contact: EdgarContact | null): Promise<FactsTable> {
  const json = await getJson(FACTS_URL(cik), "company facts", contact);
  try {
    return factsTable(json);
  } catch (e) {
    // The detail is the SEC document's shape, never the person's data; it names what the parser tripped on.
    throw new SyncError("SEC EDGAR's company facts could not be read into a table.", `edgar facts shape: ${e instanceof Error ? e.message.slice(0, 200) : "unknown"}`);
  }
}

/** The submissions document, fetched once per request: the profile and the latest filing both read it. */
const submissions = cache(async (cik: number, contact: EdgarContact | null): Promise<unknown> => getJson(SUBMISSIONS_URL(cik), "company profile", contact));

/** The company's profile from its submissions: the industry code and its description, the fiscal year end. */
export async function companyProfile(cik: number, contact: EdgarContact | null): Promise<CompanyProfile> {
  try {
    return companyProfileOf(await submissions(cik, contact));
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError("SEC EDGAR's company profile could not be read.", "edgar submissions shape");
  }
}

/** The tickers on the SEC's company list, upper case, for checking a ticker a reading names (lib/ecosystem.ts). */
export async function knownTickers(contact: EdgarContact | null): Promise<Set<string>> {
  return new Set((await companyList(contact)).map((r) => r.ticker.toUpperCase().replace(/\./g, "-")));
}

/**
 * The company's latest annual report (a 10-K, 20-F or 40-F, lib/ecosystem.ts
 * latestAnnualOf) as text: its primary document fetched from the SEC and
 * stripped (htmlToText). Null when the submissions list none. The CIK and the
 * accession alone in the URL.
 */
export async function annualReport(cik: number, contact: EdgarContact | null, known?: string | null): Promise<{ filing: AnnualFiling; url: string; text: string | null } | null> {
  if (!contact) throw new SyncError(NO_CONTACT, "edgar annual report no contact");
  const filing = latestAnnualOf(await submissions(cik, contact));
  if (!filing) return null;
  const url = FILING_URL(cik, filing.accession.replace(/-/g, ""), filing.primary);
  // The report already read is not fetched again: only whether a newer one is filed.
  if (known && known === filing.accession) return { filing, url, text: null };
  return { filing, url, text: htmlToText(await getText(url, "annual report", contact)) };
}

/** A filing's page at the SEC: its primary document, or its folder when none is named. */
export function filingLink(cik: number, accession: string, doc: string | undefined): string {
  const a = accession.replace(/-/g, "");
  return doc ? FILING_URL(cik, a, doc) : `https://www.sec.gov/Archives/edgar/data/${cik}/${a}/`;
}

/** The submissions document as it came, for a reader that picks its own filings (lib/earnings.ts filingsAround). */
export async function companySubmissions(cik: number, contact: EdgarContact | null): Promise<unknown> {
  return submissions(cik, contact);
}

async function getText(url: string, what: string, contact: EdgarContact): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "user-agent": edgarUserAgent(contact), accept: "application/xml, text/xml, */*" }, cache: "no-store", signal: AbortSignal.timeout(40_000) });
  } catch {
    throw new SyncError(`SEC EDGAR could not be reached for the ${what}. Try again in a moment.`, `edgar ${what} unreachable`);
  }
  if (res.status === 404) throw new SyncError(`SEC EDGAR has no ${what} for this filing.`, `edgar ${what} 404`);
  if (res.status === 403 || res.status === 429) throw new SyncError("SEC EDGAR refused the request: its rate limit, or it did not accept the contact address. Try again in a minute.", `edgar ${what} ${res.status}`);
  if (!res.ok) throw new SyncError(`SEC EDGAR returned an error for the ${what}.`, `edgar ${what} ${res.status}`);
  const size = Number(res.headers.get("content-length") ?? 0);
  if (size > MAX_INSTANCE_BYTES) throw new SyncError(`The ${what} is too large to read here.`, `edgar ${what} ${size} bytes`);
  try {
    const text = await res.text();
    if (text.length > MAX_INSTANCE_BYTES) throw new Error("too large");
    return text;
  } catch {
    throw new SyncError(`SEC EDGAR's ${what} could not be read.`, `edgar ${what} bad body`);
  }
}

/**
 * The segment and revenue lines of the company's latest 10-Q, 10-K, 20-F or
 * 40-F, from the filing's own XBRL instance (lib/edgar-segments.ts): the
 * submissions name the filing, its index names the instance, the instance
 * gives the lines. Null when the instance has no line. When the latest
 * filing's instance is missing or cannot be read, the one before is read
 * instead and the result says so (the failover stays inside EDGAR: the same
 * document family, the same format, for every filer). A refusal or an
 * unreachable SEC is not retried on an older filing. Three documents per
 * filing, the CIK and the accession alone in the URL.
 */
export async function segmentLines(cik: number, contact: EdgarContact | null): Promise<SegmentRead | null> {
  if (!contact) throw new SyncError(NO_CONTACT, "edgar segments no contact");
  let filings: LatestFiling[];
  try {
    filings = periodicFilingsOf(await submissions(cik, contact), 2);
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError("SEC EDGAR's filing list could not be read.", "edgar submissions shape");
  }
  if (!filings.length) throw new SyncError("SEC EDGAR lists no 10-Q, 10-K, 20-F or 40-F for this company.", "edgar no periodic filing");
  let first: SyncError | null = null;
  for (const [i, filing] of filings.entries()) {
    try {
      const read = await segmentLinesOf(cik, filing, contact, i === 0 ? "latest" : "previous");
      if (i > 0 && read) read.fallback = `read from the previous ${filing.form} (${read.period}) because the latest filing could not be: ${first!.message.replace(/\.$/, "")}`;
      return read;
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      // Only a filing that has no instance or an unreadable one is worth a second filing; a refusal or a dead network would fail the same way.
      if (!/no instance|instance shape|filing index|404/.test(e.logDetail ?? "")) throw e;
      first ??= e;
    }
  }
  throw first!;
}

/**
 * The last few instances fetched, by filing, so the segment lines and the
 * geography read one download when they read the same filing (the latest
 * filing is the annual one for a quarter of the year). Bounded; a failed
 * fetch is not kept.
 */
const instances = new Map<string, Promise<string>>();
const MAX_KEPT_INSTANCES = 5;

async function instanceText(cik: number, filing: LatestFiling, contact: EdgarContact, which: string, what: string): Promise<string> {
  const key = `${cik}/${filing.accession}`;
  const kept = instances.get(key);
  if (kept) return kept;
  const p = (async () => {
    const index = await getJson(FILING_URL(cik, filing.accession, "index.json"), "filing index", contact);
    let file: string | null;
    try {
      file = instanceFileOf(index);
    } catch {
      throw new SyncError("SEC EDGAR's filing index could not be read.", "edgar filing index shape");
    }
    if (!file) throw new SyncError(`The ${which} ${filing.form} carries no XBRL instance to read ${what} from.`, "edgar no instance");
    return getText(FILING_URL(cik, filing.accession, file), "filing instance", contact);
  })();
  instances.set(key, p);
  while (instances.size > MAX_KEPT_INSTANCES) instances.delete(instances.keys().next().value!);
  p.catch(() => instances.delete(key));
  return p;
}

async function segmentLinesOf(cik: number, filing: LatestFiling, contact: EdgarContact, which: "latest" | "previous"): Promise<SegmentRead | null> {
  const xml = await instanceText(cik, filing, contact, which, "segments");
  try {
    return segmentRead(xml, filing.form);
  } catch (e) {
    throw new SyncError(`The ${which} ${filing.form}'s instance could not be read as XBRL.`, `edgar instance shape: ${e instanceof Error ? e.message.slice(0, 120) : "unknown"}`);
  }
}

/**
 * Revenue by segment and by product over the last quarters and years
 * (lib/edgar-segments.ts segmentSeriesOf, mergeSegmentSeries), from the
 * latest annual report and the three latest 10-Qs, newest first. The same
 * filings as the history kept (`kept.accessions`) are not read again. A
 * filing whose instance cannot be read is left out and named; the history
 * read before stays when none can be. The CIK and the accession alone in the
 * URL.
 */
export async function segmentHistory(cik: number, contact: EdgarContact | null, kept: SegmentHistory | null, now: Date = new Date()): Promise<SegmentHistory | null> {
  if (!contact) throw new SyncError(NO_CONTACT, "edgar segment history no contact");
  let filings: LatestFiling[];
  try {
    filings = segmentHistoryFilings(periodicFilingsOf(await submissions(cik, contact), 8));
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError("SEC EDGAR's filing list could not be read.", "edgar submissions shape");
  }
  if (!filings.length) return null;
  const accessions = filings.map((f) => f.accession.slice(0, 25));
  if (kept && kept.version >= SEGMENT_HISTORY_VERSION && kept.accessions.length === accessions.length && kept.accessions.every((a, i) => a === accessions[i])) return kept;
  const reads: SegmentSeriesRead[] = [];
  const missed: string[] = [];
  for (const [i, filing] of filings.entries()) {
    try {
      reads.push(segmentSeriesOf(await instanceText(cik, filing, contact, i === 0 ? "latest" : "earlier", "segments")));
    } catch (e) {
      if (!(e instanceof SyncError) && !(e instanceof Error)) throw e;
      // A refusal or a dead network fails every filing the same way; the history read before stays.
      if (e instanceof SyncError && !/no instance|filing index|404|too large|bytes/.test(e.logDetail ?? "")) {
        if (kept) return kept;
        throw e;
      }
      missed.push(`${filing.form} filed ${filing.filingDate ?? "earlier"}`);
    }
  }
  if (!reads.length) return kept;
  const merged = mergeSegmentSeries(reads);
  const mixed = mixedNote(reads.flatMap((r) => r.mixed));
  if (!merged.segment && !merged.product && !merged.geography) return { segment: null, product: null, geography: null, accessions, currency: reads[0].currency, readAt: now.toISOString(), note: mixed ?? "The filings give no revenue split by segment, product or place.", version: SEGMENT_HISTORY_VERSION };
  const note = [mixed, missed.length ? `Not read: ${missed.join(", ")}.` : null].filter(Boolean).join(" ").slice(0, 300) || null;
  return { ...merged, accessions, currency: reads.find((r) => r.currency)?.currency ?? null, readAt: now.toISOString(), note, version: SEGMENT_HISTORY_VERSION };
}

/**
 * The company's revenue by geography from its latest 10-K, 20-F or 40-F
 * (else its latest 10-Q), from the filing's own XBRL instance
 * (lib/edgar-segments.ts geographyRead), kept as the filings file keeps it.
 * Null when the filing gives no revenue by place. The CIK and the accession
 * alone in the URL.
 */
export async function revenueGeography(cik: number, contact: EdgarContact | null): Promise<RevenueGeography | null> {
  if (!contact) throw new SyncError(NO_CONTACT, "edgar geography no contact");
  let filing: LatestFiling | null;
  try {
    filing = geographyFilingOf(await submissions(cik, contact));
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError("SEC EDGAR's filing list could not be read.", "edgar submissions shape");
  }
  if (!filing) throw new SyncError("SEC EDGAR lists no 10-K, 20-F, 40-F or 10-Q for this company.", "edgar no periodic filing");
  const xml = await instanceText(cik, filing, contact, "latest annual", "revenue by geography");
  try {
    const read = geographyRead(xml, filing.form);
    return read ? revenueGeographyOf(read, filing.accession.replace(/^(\d{10})(\d{2})(\d{6})$/, "$1-$2-$3")) : null;
  } catch (e) {
    throw new SyncError(`The ${filing.form}'s instance could not be read as XBRL.`, `edgar instance shape: ${e instanceof Error ? e.message.slice(0, 120) : "unknown"}`);
  }
}

/**
 * A results release (an 8-K or a 6-K) as text, document by document: the
 * filing's index names its documents (lib/earnings.ts releaseDocumentsOf:
 * the primary document, then the exhibits), each HTML document is fetched
 * and stripped to text (htmlToText), and the reading stops once the text
 * the model is given is full. The CIK and the accession alone in the URL.
 */
export async function releaseDocuments(cik: number, accession: string, primary: string | null, contact: EdgarContact | null): Promise<{ name: string; text: string }[]> {
  if (!contact) throw new SyncError(NO_CONTACT, "edgar release no contact");
  const acc = accession.replace(/-/g, "");
  const index = await getJson(FILING_URL(cik, acc, "index.json"), "filing index", contact);
  let names: string[];
  try {
    names = releaseDocumentsOf(index, primary);
  } catch {
    throw new SyncError("SEC EDGAR's filing index could not be read.", "edgar filing index shape");
  }
  if (!names.length) throw new SyncError("The release carries no document that can be read as text.", "edgar release no html");
  const out: { name: string; text: string }[] = [];
  let length = 0;
  for (const name of names) {
    if (length >= MAX_RELEASE_CHARS) break;
    const text = htmlToText(await getText(FILING_URL(cik, acc, name), "release document", contact));
    out.push({ name, text });
    length += text.length;
  }
  return out;
}

/**
 * A fund's latest public holdings: its newest NPORT-P from the submissions,
 * then that filing's primary XML document (lib/nport.ts). The fund's CIK and
 * the accession alone in the URL; nothing of the person but the contact the
 * SEC asks every client for.
 */
export async function latestFundHoldings(cik: number, contact: EdgarContact | null): Promise<{ filing: NportFiling; report: NportReport }> {
  if (!contact) throw new SyncError(NO_CONTACT, "edgar nport no contact");
  let filing: NportFiling | null;
  try {
    filing = latestNportOf(await submissions(cik, contact));
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError("SEC EDGAR's filing list for the fund could not be read.", "edgar nport submissions shape");
  }
  if (!filing) throw new SyncError("SEC EDGAR lists no N-PORT holdings report for the fund.", "edgar no nport");
  const xml = await getText(FILING_URL(cik, filing.accession.replaceAll("-", ""), filing.document), "fund holdings report", contact);
  try {
    return { filing, report: parseNport(xml) };
  } catch (e) {
    throw new SyncError("The fund's N-PORT holdings report could not be read.", `edgar nport shape: ${e instanceof Error ? e.message.slice(0, 120) : "unknown"}`);
  }
}

const FUND_TICKERS_URL = "https://www.sec.gov/files/company_tickers_mf.json";

/** The SEC's fund list as ticker to trust and series (lib/etf-flows.ts fundTickersOf); fetched whole, so no ticker goes anywhere. */
export async function fundTickers(contact: EdgarContact | null): Promise<Map<string, { cik: number; seriesId: string | null }>> {
  const json = await getJson(FUND_TICKERS_URL, "fund list", contact);
  try {
    return fundTickersOf(json);
  } catch {
    throw new SyncError("SEC EDGAR's fund list could not be read.", "edgar fund tickers shape");
  }
}

/** A trust's NPORT-P filings since `since`, newest first (lib/etf-flows.ts). */
export async function nportFilings(cik: number, contact: EdgarContact | null, since: string): Promise<NportRef[]> {
  try {
    return nportFilingsOf(await submissions(cik, contact), since);
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError("SEC EDGAR's filing list for the fund could not be read.", "edgar nport list shape");
  }
}

/** The most of an N-PORT read before giving up on finding the marker: its general and fund information sit well inside it. */
const MAX_NPORT_HEAD_BYTES = 4 * 1024 * 1024;

/**
 * The start of an NPORT-P's primary document, read until `marker` (the end of
 * its general or fund information), never the holdings after it, so a bond
 * fund's report of many megabytes costs a few kilobytes. The CIK and the
 * accession alone in the URL. A 429 or a 5xx is asked again after a wait.
 */
export async function nportStart(cik: number, ref: NportRef, marker: string, contact: EdgarContact): Promise<string> {
  const url = FILING_URL(cik, ref.accession.replaceAll("-", ""), ref.document);
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, { headers: { "user-agent": edgarUserAgent(contact), accept: "application/xml, text/xml, */*" }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    } catch {
      throw new SyncError("SEC EDGAR could not be reached for the fund's report. Try again in a moment.", "edgar nport head unreachable");
    }
    const passing = res.status === 429 || res.status >= 500;
    if (!passing || attempt >= RETRY_WAITS_MS.length) break;
    await res.body?.cancel().catch(() => undefined);
    await pause(RETRY_WAITS_MS[attempt]);
  }
  if (res.status === 404) throw new SyncError("SEC EDGAR has no report at the place its list names.", "edgar nport head 404");
  if (res.status === 403 || res.status === 429) throw new SyncError("SEC EDGAR refused the request: its rate limit, or it did not accept the contact address. Try again in a minute.", `edgar nport head ${res.status}`);
  if (!res.ok || !res.body) throw new SyncError("SEC EDGAR returned an error for the fund's report.", `edgar nport head ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) text += decoder.decode(value, { stream: true });
      if (done || text.includes(marker) || text.length > MAX_NPORT_HEAD_BYTES) break;
    }
  } catch {
    throw new SyncError("The fund's report could not be read.", "edgar nport head body");
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text;
}

/**
 * The Form 4s filed on the company since `since` that are not in `read`,
 * newest first, at most FORMS_PER_RUN of them read (lib/insiders.ts): each
 * form's XML from its folder, the CIK and the accession alone in the URL. A
 * form that cannot be read comes back with no form, so it is tried again next
 * run; `waiting` counts those left for the next run.
 */
export async function insiderForms(cik: number, contact: EdgarContact, since: string, read: readonly string[]): Promise<{ forms: { ref: Form4Ref; form: Form4 | null }[]; waiting: number }> {
  let refs: Form4Ref[];
  try {
    refs = form4sOf(await submissions(cik, contact), since, read);
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError("SEC EDGAR's list of the company's filings could not be read.", "edgar submissions shape (form 4)");
  }
  const now = refs.slice(0, FORMS_PER_RUN);
  const forms: { ref: Form4Ref; form: Form4 | null }[] = [];
  for (const ref of now) {
    try {
      forms.push({ ref, form: parseForm4(await getText(FILING_URL(cik, ref.accession.replace(/-/g, ""), ref.document), "insider form", contact), ref) });
    } catch (e) {
      if (!(e instanceof SyncError) && !(e instanceof Error)) throw e;
      forms.push({ ref, form: null });
    }
  }
  return { forms, waiting: refs.length - now.length };
}

/** A manager's 13F-HR filings, newest first, from its submissions (lib/funds.ts). The manager's CIK alone in the URL. */
export async function thirteenFs(cik: number, contact: EdgarContact | null): Promise<FilingRef[]> {
  if (!contact) throw new SyncError(NO_CONTACT, "edgar 13f no contact");
  try {
    return thirteenFsOf(await submissions(cik, contact));
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError("SEC EDGAR's filing list for the fund could not be read.", "edgar 13f submissions shape");
  }
}

/** A 13F's information table: the filing's index names it, then its XML is read (lib/funds.ts parseInfoTable). The CIK and the accession alone in the URL. */
export async function thirteenFTable(cik: number, accession: string, contact: EdgarContact): Promise<InfoRow[]> {
  const acc = accession.replace(/-/g, "");
  let name: string | null;
  try {
    name = infoTableName(await getJson(FILING_URL(cik, acc, "index.json"), "filing index", contact));
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError("SEC EDGAR's filing index could not be read.", "edgar 13f index shape");
  }
  if (!name) throw new SyncError("The 13F carries no information table.", "edgar 13f no table");
  try {
    return parseInfoTable(await getText(FILING_URL(cik, acc, name), "13F information table", contact));
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError("The 13F's information table could not be read.", `edgar 13f table shape: ${e instanceof Error ? e.message.slice(0, 120) : "unknown"}`);
  }
}

/**
 * A file the SEC publishes whole (a quarterly data set, a statistics
 * workbook), as bytes, with the deployment's contact: a 429 or a 5xx asked
 * again as `getJson` does, a 404 null so the caller can try the address
 * before, anything over `maxBytes` refused.
 */
export async function secFile(url: string, what: string, contact: EdgarContact, maxBytes = 40 * 1024 * 1024): Promise<Uint8Array | null> {
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, { headers: { "user-agent": edgarUserAgent(contact), accept: "*/*" }, cache: "no-store", signal: AbortSignal.timeout(60_000) });
    } catch {
      throw new SyncError(`SEC EDGAR could not be reached for the ${what}. Try again in a moment.`, `edgar ${what} unreachable`);
    }
    const passing = res.status === 429 || res.status >= 500;
    if (!passing || attempt >= RETRY_WAITS_MS.length) break;
    await pause(RETRY_WAITS_MS[attempt]);
  }
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) throw new SyncError("SEC EDGAR refused the request: its rate limit, or it did not accept the contact address.", `edgar ${what} ${res.status}`);
  if (!res.ok) throw new SyncError(`SEC EDGAR returned an error for the ${what}.`, `edgar ${what} ${res.status}`);
  if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw new SyncError(`The ${what} is too large to read here.`, `edgar ${what} too large`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > maxBytes) throw new SyncError(`The ${what} is too large to read here.`, `edgar ${what} too large`);
  return bytes;
}

/** The SEC's quarterly insider transactions data sets; the path moved once, so both are asked. */
export function insiderZipUrls(quarter: string): string[] {
  return [`https://www.sec.gov/files/datastandardsinnovation/data/insider-transactions-data-sets/${quarter}_form345.zip`, `https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets/${quarter}_form345.zip`];
}
