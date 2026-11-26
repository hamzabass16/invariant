import "server-only";

import { insiderZipUrls, operatorContact, secFile } from "@/lib/edgar";
import { EMPTY_FLOW_SOURCES, flowSourceRowSchema, flowSourcesDue, insidersOf, quartersBefore, type FlowSource, type FlowSourceRow, type Insiders } from "@/lib/flows";
import { loadCot, loadMmf, loadTic } from "@/lib/markets-feed";
import { keepSharedFigures, registryAvailable, sharedFigures } from "@/lib/registry";
import { screenCompanySchema } from "@/lib/screener";
import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";
import { unzip } from "@/lib/zip-read";

/** The one shared row the four sources are kept in. */
const ROW = "sources";

/** The Flows screen's four sources as kept for everyone (lib/flows.ts); empty with no registry or no read yet. */
export async function keptFlowSources(): Promise<FlowSourceRow> {
  if (!registryAvailable()) return EMPTY_FLOW_SOURCES;
  const [r] = await sharedFigures("flow", [ROW]);
  const k = r ? flowSourceRowSchema.safeParse(r.entry) : null;
  return k?.success ? k.data : EMPTY_FLOW_SOURCES;
}

/** Symbol to sector for the S&P 500 and the Nasdaq-100, from the screener's shared rows. */
async function sectorsOfIndex(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const r of await sharedFigures("screen")) {
    const c = screenCompanySchema.safeParse(r.entry);
    if (c.success && c.data.sector) out.set(c.data.symbol.toUpperCase(), c.data.sector);
  }
  return out;
}

/**
 * The quarter's insider trades: the newest of the last two quarters' data
 * sets the SEC has published, read only when it is not the one kept. Null
 * when the kept one is still the newest.
 */
async function readInsiders(kept: Insiders | null, now: Date): Promise<Insiders | null> {
  const contact = operatorContact();
  if (!contact) throw new SyncError("This deployment names no SEC contact (SEC_CONTACT), so insiders' trades are not read.", "flows insiders no contact");
  const sectors = await sectorsOfIndex();
  if (!sectors.size) throw new SyncError("The screener has not read the S&P 500 and the Nasdaq-100 yet, so insiders' trades cannot be laid by sector.", "flows insiders no sectors");
  for (const q of quartersBefore(localDay(now), 2)) {
    if (kept?.quarter === q) return null;
    for (const url of insiderZipUrls(q)) {
      const bytes = await secFile(url, "insider transactions data set", contact);
      if (!bytes) continue;
      let files: Map<string, Uint8Array>;
      try {
        files = unzip(bytes, (n) => /(^|\/)(SUBMISSION|NONDERIV_TRANS)\.tsv$/i.test(n));
      } catch {
        throw new SyncError("The SEC's insider transactions data set could not be opened.", "flows insiders bad zip");
      }
      const text = (name: string) => {
        const e = [...files.entries()].find(([n]) => new RegExp(`(^|/)${name}\\.tsv$`, "i").test(n));
        return e ? new TextDecoder().decode(e[1]) : null;
      };
      const sub = text("SUBMISSION");
      const trans = text("NONDERIV_TRANS");
      if (!sub || !trans) throw new SyncError("The SEC's insider transactions data set lacks its submission or transaction table.", "flows insiders tables");
      try {
        return insidersOf(q, sub, trans, sectors, now.toISOString());
      } catch {
        throw new SyncError("The SEC's insider transactions data set held no Form 4 that could be read.", "flows insiders parse");
      }
    }
  }
  throw new SyncError("The SEC has not published an insider transactions data set for the last two quarters.", "flows insiders none");
}

export type FlowSourcesRun = { read: FlowSource[]; failed: FlowSource[]; sentence: string };

/**
 * The Flows screen's four sources, read at the screener's 05:00 UTC run for
 * everyone, each only when due (lib/flows.ts flowSourcesDue), none started
 * past `budgetMs`. A source that fails keeps its last good copy and its
 * sentence; nothing replaces a good copy with an empty one.
 */
export async function readFlowSources(now: Date, budgetMs: number): Promise<FlowSourcesRun> {
  if (!registryAvailable()) return { read: [], failed: [], sentence: "The registry is not set up, so the flows are not read." };
  const started = Date.now();
  const row: FlowSourceRow = structuredClone(await keptFlowSources());
  const due = flowSourcesDue(row, now);
  if (!due.length) return { read: [], failed: [], sentence: "Every flow source is current." };
  const read: FlowSource[] = [];
  const failed: FlowSource[] = [];
  const at = () => new Date().toISOString();
  const fail = (s: FlowSource, sentence: string) => {
    row.tried[s] = { at: at(), error: sentence };
    failed.push(s);
  };
  for (const s of due) {
    if (Date.now() - started > budgetMs) break;
    try {
      if (s === "positioning") {
        const { markets, problems } = await loadCot();
        if (!Object.keys(markets).length) fail(s, `The CFTC's Commitments of Traders could not be read: ${problems[0] ?? "no market answered"}.`);
        else row.positioning = { markets, problems, readAt: at() };
      } else if (s === "foreign") {
        const a = await loadTic();
        if ("problem" in a) fail(s, `Foreign buying could not be read: ${a.problem}.`);
        else row.foreign = { months: a.months, readAt: at() };
      } else if (s === "cash") {
        const a = await loadMmf();
        if ("problem" in a) fail(s, `Money market fund holdings could not be read: ${a.problem}.`);
        else row.cash = { series: a.series, readAt: at() };
      } else {
        const next = await readInsiders(row.insiders, now);
        if (next) row.insiders = next;
      }
      if (!failed.includes(s)) {
        row.tried[s] = { at: at(), error: null };
        read.push(s);
      }
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      console.error(`[flows] ${s}: ${e.logDetail ?? "failed"}`);
      fail(s, e.message);
    }
  }
  await keepSharedFigures("flow", [{ symbol: ROW, entry: row, readAt: at() }]);
  return { read, failed, sentence: `${read.length} flow sources read${failed.length ? `, ${failed.length} not` : ""}.` };
}
