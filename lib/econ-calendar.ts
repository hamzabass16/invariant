/**
 * The economic calendar (Hamza, 21 Oct 2026, after Unusual Whales): the US
 * releases that move markets, on the dates their publishers set a year
 * ahead: the Federal Reserve's rate decisions, the BLS's jobs report, CPI,
 * PPI and job openings, and the BEA's GDP with personal income and outlays
 * (PCE prices). A table, like MARKET_HOLIDAYS, from the publishers' own
 * schedules, extended each year; nothing is fetched and no consensus or
 * forecast is shown. Where the app reads the figure itself (CPI on a year,
 * unemployment, the fed funds rate), the event names the indicator, so the
 * last reading stands beside the next date.
 *
 * Sources (read 21 Oct 2026):
 *   FOMC  https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
 *   BLS   https://www.bls.gov/schedule/news_release/cpi.htm, .../empsit.htm,
 *         https://www.bls.gov/schedule/2026/11_sched_list.htm, .../12_sched_list.htm,
 *         https://www.bls.gov/schedule/2027/home.htm
 *   BEA   https://www.bea.gov/news/schedule
 *
 * Pure.
 */
import type { MarketSymbol } from "@/lib/markets";
import type { Notice } from "@/lib/screens";
import { addDaysTo, daysBetween } from "@/lib/time";

export type EconKind = "fomc" | "jobs" | "cpi" | "ppi" | "jolts" | "gdp" | "pce" | "ecb" | "boe" | "boj" | "boc" | "snb" | "election" | "summit" | "opec" | "deadline" | "earnings";

/** Where an event's decision lands: the economy whose rates, prices or government it sets. */
export type EconArea = "us" | "euro" | "uk" | "japan" | "canada" | "switzerland" | "france" | "mexico" | "israel" | "argentina" | "china" | "world";

export type EconEvent = { date: string; kind: EconKind; name: string; time: string; about: string; source: string; indicator: MarketSymbol | null; area: EconArea; /** A summit's or deadline's name on its chip (G20, Funding); a company's ticker for its results. */ short?: string; /** The company, for results. */ symbol?: string; /** The FOMC meetings with the Summary of Economic Projections (the dot plot). */ projections?: boolean };

/** An event's key for what it links to (its report once read): its day, kind and name. */
export const linkKey = (e: Pick<EconEvent, "date" | "kind" | "name">) => `${e.date}|${e.kind}|${e.name}`;

/** Where an event opens: the earnings report after results, the event's report after a macro event. */
export type EventLink = { href: string; label: string };

const FED = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
const BLS_CPI = "https://www.bls.gov/schedule/news_release/cpi.htm";
const BLS_JOBS = "https://www.bls.gov/schedule/news_release/empsit.htm";
const BLS_PPI = "https://www.bls.gov/schedule/news_release/ppi.htm";
const BLS_JOLTS = "https://www.bls.gov/schedule/news_release/jolts.htm";
const BEA = "https://www.bea.gov/news/schedule";
const ECB = "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html";
const BOE = "https://www.bankofengland.co.uk/monetary-policy/upcoming-mpc-dates";
const BOJ = "https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm";
const BOC = "https://www.bankofcanada.ca/2026/07/bank-canada-publishes-2027-schedule-policy-interest-rate-announcements-other-major-publications/";
const SNB = "https://www.snb.ch/en/services-events/digital-services/event-schedule";
const FEC = "https://www.fec.gov/help-candidates-and-committees/dates-and-deadlines/2026-reporting-dates/electioneering-communications-periods-general-election-2026/";
const FRANCE = "https://www.info.gouv.fr/actualite/election-presidentielle-2027";
const INE = "https://www.ine.mx/voto-y-elecciones/elecciones-2027/";
const ISRAEL = "https://www.gov.il/en/pages/knesset-elections-2026";
const ARGENTINA = "https://servicios.infoleg.gob.ar/infolegInternet/anexos/15000-19999/19442/texact.htm";

export const ECON_KIND: Record<EconKind, { name: string; time: string; about: string; source: string; indicator: MarketSymbol | null; area: EconArea }> = {
  fomc: { name: "Fed rate decision", time: "14:00 ET", about: "The Federal Open Market Committee's decision on the federal funds rate, with the statement; the chair's press conference follows at 14:30.", source: FED, area: "us", indicator: "EFFR" },
  jobs: { name: "Jobs report", time: "08:30 ET", about: "The BLS's Employment Situation: payrolls, the unemployment rate and wages for the month before.", source: BLS_JOBS, area: "us", indicator: "UNRATE" },
  cpi: { name: "Consumer prices (CPI)", time: "08:30 ET", about: "The BLS's consumer price index for the month before: inflation as households meet it.", source: BLS_CPI, area: "us", indicator: "CPIYOY" },
  ppi: { name: "Producer prices (PPI)", time: "08:30 ET", about: "The BLS's producer price index for the month before: prices at the factory gate, ahead of the shelf.", source: BLS_PPI, area: "us", indicator: null },
  jolts: { name: "Job openings (JOLTS)", time: "10:00 ET", about: "The BLS's job openings and labor turnover for two months before: openings, hires and quits.", source: BLS_JOLTS, area: "us", indicator: null },
  gdp: { name: "GDP", time: "08:30 ET", about: "The BEA's estimate of the economy's growth in the last quarter (advance, second, third).", source: BEA, area: "us", indicator: null },
  pce: { name: "Personal income and outlays (PCE)", time: "08:30 ET", about: "The BEA's spending and income for the month before, with the PCE price index the Fed targets.", source: BEA, area: "us", indicator: null },
  ecb: { name: "ECB rate decision", time: "14:15 CET", about: "The European Central Bank's decision on the euro area's rates; the president's press conference follows at 14:45.", source: ECB, area: "euro", indicator: null },
  boe: { name: "Bank of England rate decision", time: "12:00 London", about: "The Monetary Policy Committee's decision on Bank Rate, with its summary and minutes.", source: BOE, area: "uk", indicator: null },
  boj: { name: "Bank of Japan rate decision", time: "Tokyo, after the meeting", about: "The Bank of Japan's decision on its policy rate, announced when the two-day meeting ends; no fixed time.", source: BOJ, area: "japan", indicator: null },
  boc: { name: "Bank of Canada rate decision", time: "09:45 ET", about: "The Bank of Canada's decision on its policy interest rate.", source: BOC, area: "canada", indicator: null },
  snb: { name: "Swiss National Bank rate decision", time: "09:30 CET", about: "The Swiss National Bank's quarterly assessment and its policy rate; the news conference follows at 10:00.", source: SNB, area: "switzerland", indicator: null },
  election: { name: "Election", time: "All day", about: "A national election in a major economy, on the date its government or electoral body set.", source: FEC, area: "us", indicator: null },
  summit: { name: "Summit", time: "All day", about: "A meeting of heads of government whose decisions on trade, security or sanctions can move markets.", source: FEC, area: "world", indicator: null },
  deadline: { name: "Deadline", time: "23:59 ET", about: "A date set in law or a published order on which spending, tariffs or fees change unless it is extended.", source: FEC, area: "us", indicator: null },
  earnings: { name: "Results", time: "Time not given", about: "A company you follow reports its results.", source: "/earnings", area: "us", indicator: null },
  opec: { name: "OPEC+ meeting", time: "All day", about: "OPEC and its partners decide how much oil they pump; their quotas move the price of crude.", source: "https://www.opec.org/opec_web/en/press_room/28.htm", area: "world", indicator: "WTI" },
};

/** The kinds that are not a publisher's release or a rate decision. */
export const GEOPOLITICS: ReadonlySet<EconKind> = new Set<EconKind>(["election", "summit", "deadline"]);

const ev = (date: string, kind: EconKind, extra: Partial<EconEvent> = {}): EconEvent => ({ date, kind, ...ECON_KIND[kind], ...extra });
const election = (date: string, area: EconArea, name: string, about: string, source: string) => ev(date, "election", { area, name, about, source });
const summit = (date: string, short: string, name: string, about: string, source: string, area: EconArea = "world") => ev(date, "summit", { short, name, about, source, area });
const deadline = (date: string, short: string, area: EconArea, name: string, about: string, source: string) => ev(date, "deadline", { short, area, name, about, source });
const fomc = (date: string, projections = false) => ev(date, "fomc", { projections, about: `${ECON_KIND.fomc.about}${projections ? " With the Summary of Economic Projections (the dot plot)." : ""}` });

/** The table, by date. The last date it reaches is ECON_THROUGH; past it the screens say the table needs extending. */
export const ECON_EVENTS: readonly EconEvent[] = [
  // 2026, from 21 Oct
  fomc("2026-10-28"),
  election("2026-10-27", "israel", "Israeli Knesset election", "Israel elects its 120-seat Knesset, after the Knesset dissolved itself in July; the coalition that forms decides the government, its budget and its security policy.", ISRAEL),
  ev("2026-10-28", "boc", { about: `${ECON_KIND.boc.about} With the Monetary Policy Report.` }),
  ev("2026-10-29", "ecb"),
  ev("2026-10-30", "boj", { about: `${ECON_KIND.boj.about} With the Outlook Report.` }),
  election("2026-11-03", "us", "US midterm elections", "The US general election: every House seat, a third of the Senate and most governors. Control of Congress decides what spending and tax law can pass.", FEC),
  ev("2026-11-05", "boe"),
  ev("2026-12-09", "boc"),
  ev("2026-12-10", "snb"),
  ev("2026-12-17", "ecb"),
  ev("2026-12-17", "boe"),
  ev("2026-12-18", "boj"),
  ev("2026-10-29", "gdp", { name: "GDP, third quarter (advance)" }),
  ev("2026-10-29", "pce", { name: "Personal income and outlays, September" }),
  ev("2026-11-03", "jolts"),
  ev("2026-11-06", "jobs"),
  ev("2026-11-10", "cpi"),
  ev("2026-11-13", "ppi"),
  ev("2026-11-25", "gdp", { name: "GDP, third quarter (second)" }),
  ev("2026-11-25", "pce", { name: "Personal income and outlays, October" }),
  ev("2026-12-01", "jolts"),
  ev("2026-12-04", "jobs"),
  fomc("2026-12-09", true),
  ev("2026-12-10", "cpi"),
  ev("2026-12-15", "ppi"),
  ev("2026-12-23", "gdp", { name: "GDP, third quarter (third)" }),
  ev("2026-12-23", "pce", { name: "Personal income and outlays, November" }),
  // 2027: the BEA's schedule (bea.gov/news/schedule/next-year, 28 Oct 2026)
  ev("2027-01-28", "gdp", { name: "GDP, fourth quarter (advance)" }),
  ev("2027-01-28", "pce", { name: "Personal income and outlays, December" }),
  ev("2027-02-25", "gdp", { name: "GDP, fourth quarter (second)" }),
  ev("2027-02-25", "pce", { name: "Personal income and outlays, January" }),
  ev("2027-03-31", "gdp", { name: "GDP, fourth quarter (third)" }),
  ev("2027-03-31", "pce", { name: "Personal income and outlays, February" }),
  ev("2027-04-29", "gdp", { name: "GDP, first quarter (advance)" }),
  ev("2027-04-29", "pce", { name: "Personal income and outlays, March" }),
  ev("2027-05-27", "gdp", { name: "GDP, first quarter (second)" }),
  ev("2027-05-27", "pce", { name: "Personal income and outlays, April" }),
  ev("2027-06-25", "gdp", { name: "GDP, first quarter (third)" }),
  ev("2027-06-25", "pce", { name: "Personal income and outlays, May" }),
  ev("2027-07-29", "gdp", { name: "GDP, second quarter (advance)" }),
  ev("2027-07-29", "pce", { name: "Personal income and outlays, June" }),
  ev("2027-08-25", "gdp", { name: "GDP, second quarter (second)" }),
  ev("2027-08-25", "pce", { name: "Personal income and outlays, July" }),
  ev("2027-09-30", "gdp", { name: "GDP, second quarter (third)" }),
  ev("2027-09-30", "pce", { name: "Personal income and outlays, August" }),
  ev("2027-10-28", "gdp", { name: "GDP, third quarter (advance)" }),
  ev("2027-10-28", "pce", { name: "Personal income and outlays, September" }),
  ev("2027-11-24", "gdp", { name: "GDP, third quarter (second)" }),
  ev("2027-11-24", "pce", { name: "Personal income and outlays, October" }),
  ev("2027-12-22", "gdp", { name: "GDP, third quarter (third)" }),
  ev("2027-12-22", "pce", { name: "Personal income and outlays, November" }),
  // 2027: the Fed's meetings and the BLS's schedule (the BLS has not set JOLTS's 2027 dates yet)
  ev("2027-01-08", "jobs"),
  ev("2027-01-13", "cpi"),
  ev("2027-01-14", "ppi"),
  fomc("2027-01-27"),
  ev("2027-02-05", "jobs"),
  ev("2027-02-11", "cpi"),
  ev("2027-02-12", "ppi"),
  ev("2027-03-05", "jobs"),
  ev("2027-03-10", "cpi"),
  ev("2027-03-12", "ppi"),
  fomc("2027-03-17", true),
  ev("2027-04-02", "jobs"),
  ev("2027-04-13", "cpi"),
  ev("2027-04-14", "ppi"),
  fomc("2027-04-28"),
  ev("2027-05-07", "jobs"),
  ev("2027-05-12", "cpi"),
  ev("2027-05-13", "ppi"),
  ev("2027-06-04", "jobs"),
  fomc("2027-06-09", true),
  ev("2027-06-10", "cpi"),
  ev("2027-06-11", "ppi"),
  ev("2027-07-02", "jobs"),
  ev("2027-07-14", "cpi"),
  ev("2027-07-15", "ppi"),
  fomc("2027-07-28"),
  ev("2027-08-06", "jobs"),
  ev("2027-08-10", "ppi"),
  ev("2027-08-11", "cpi"),
  ev("2027-09-03", "jobs"),
  ev("2027-09-10", "ppi"),
  ev("2027-09-14", "cpi"),
  fomc("2027-09-15", true),
  ev("2027-10-08", "jobs"),
  ev("2027-10-14", "cpi"),
  ev("2027-10-15", "ppi"),
  fomc("2027-10-27"),
  ev("2027-11-05", "jobs"),
  ev("2027-11-10", "cpi"),
  ev("2027-11-12", "ppi"),
  ev("2027-12-03", "jobs"),
  fomc("2027-12-08", true),
  ev("2027-12-10", "cpi"),
  ev("2027-12-15", "ppi"),
  // Summits, OPEC+, and dates set in law or published orders (read 27 Oct 2026).
  summit("2026-10-26", "CCP plenum", "CCP Central Committee plenum, to 29 October", "The fifth plenary session of the Chinese Communist Party's 20th Central Committee, in Beijing; plenums set economic policy and leadership.", "https://news.cgtn.com/news/2026-09-21/CPC-leadership-stresses-Party-self-governance-sets-Party-plenum-dates-1QCkqPyd3qg/share_amp.html", "china"),
  summit("2026-11-09", "COP31", "UN climate conference COP31, to 20 November", "The UN climate conference in Antalya, Türkiye: emissions targets and climate finance.", "https://unfccc.int/cop31"),
  deadline("2026-11-09", "Tariffs", "china", "US Section 301 exclusions on Chinese products expire", "The product exclusions from the US tariffs on Chinese goods under Section 301 end at 23:59 ET unless the US Trade Representative extends them.", "https://ustr.gov/sites/default/files/files/Press/Releases/2025/Extending%20Exclusions%20to%20Nov%202026%20-%20Final%20FRN%20for%20Posting.pdf"),
  deadline("2026-11-09", "Port fees", "china", "US suspension of port fees on Chinese ships ends", "The one-year suspension of the Section 301 port fees and crane duties on Chinese shipping ends at 23:59 ET unless extended.", "https://www.federalregister.gov/documents/2025/11/13/2025-19873/notice-of-modification-of-section-301-action-chinas-targeting-of-the-maritime-logistics-and"),
  summit("2026-11-12", "EPC", "European Political Community summit", "European leaders, in and out of the EU, in Ireland: security, energy and migration. An informal meeting of EU leaders follows on 13 November.", "https://www.consilium.europa.eu/media/x41pvfn5/leaders-agenda_2026.pdf", "euro"),
  summit("2026-11-18", "APEC", "APEC Economic Leaders' Meeting, to 19 November", "The Asia-Pacific leaders in Shenzhen: trade across the Pacific.", "https://www.sz.gov.cn/en_szgov/news/infocus/APEC2026/News/content/post_12678985.html", "china"),
  summit("2026-11-26", "EU Council", "Special European Council, to 27 November", "EU leaders in Brussels on the Union's long-term budget.", "https://www.consilium.europa.eu/en/meetings/european-council/2026/11/26-27/", "euro"),
  ev("2026-11-29", "opec", { name: "OPEC and non-OPEC Ministerial Meeting", source: "https://spa.gov.sa/en/N2608060" }),
  deadline("2026-12-11", "Funding", "us", "US government funding runs out", "The stopgap law (H.R. 6500) funds federal agencies through 11 December; without a new law the government shuts down.", "https://www.whitehouse.gov/briefings-statements/2026/09/congressional-bill-h-r-6500-signed-into-law/"),
  summit("2026-12-14", "G20", "G20 Leaders' Summit, to 15 December", "The G20 leaders in Miami under the US presidency: trade, debt and the world economy.", "https://g20.org/"),
  summit("2026-12-17", "EU Council", "European Council, to 18 December", "EU leaders in Brussels.", "https://www.consilium.europa.eu/media/x41pvfn5/leaders-agenda_2026.pdf", "euro"),
  summit("2027-01-18", "Davos", "World Economic Forum, to 22 January", "The World Economic Forum's annual meeting in Davos.", "https://www.davos.ch/en/experience/events/world-economic-forum-annual-meeting-2027"),
  summit("2027-04-12", "IMF/WB", "IMF and World Bank Spring Meetings, to 18 April", "Finance ministers and central bankers in Washington; the IMF's World Economic Outlook comes with them.", "https://www.worldbank.org/en/meetings/splash/about"),
  summit("2027-10-04", "IMF/WB", "IMF and World Bank Annual Meetings, to 9 October", "Finance ministers and central bankers in Washington; the IMF's World Economic Outlook comes with them.", "https://www.worldbank.org/en/meetings/splash/about"),
  summit("2027-11-27", "G20", "G20 Leaders' Summit, to 28 November", "The G20 leaders in Manchester under the UK presidency.", "https://www.gov.uk/government/news/manchester-to-host-world-leaders-at-the-2027-g20-summit"),
  // The other major central banks and the elections, from their own schedules (read 27 Oct 2026).
  ev("2027-01-22", "boj", { about: `${ECON_KIND.boj.about} With the Outlook Report.` }),
  ev("2027-01-27", "boc", { about: `${ECON_KIND.boc.about} With the Monetary Policy Report.` }),
  ev("2027-02-04", "ecb"),
  ev("2027-02-04", "boe"),
  ev("2027-03-03", "boc"),
  ev("2027-03-18", "ecb"),
  ev("2027-03-18", "boe"),
  ev("2027-03-18", "boj"),
  ev("2027-03-18", "snb"),
  election("2027-04-18", "france", "French presidential election, first round", "France votes for its president; the two leading candidates meet in a second round two weeks later unless one wins a majority. Overseas territories vote the day before.", FRANCE),
  ev("2027-04-28", "boj", { about: `${ECON_KIND.boj.about} With the Outlook Report.` }),
  ev("2027-04-28", "boc", { about: `${ECON_KIND.boc.about} With the Monetary Policy Report.` }),
  ev("2027-04-29", "ecb"),
  ev("2027-04-29", "boe"),
  election("2027-05-02", "france", "French presidential election, second round", "The run-off between the first round's two leading candidates. Overseas territories vote the day before.", FRANCE),
  ev("2027-06-02", "boc"),
  election("2027-06-06", "mexico", "Mexican mid-term elections", "Mexico elects all 500 seats of its Chamber of Deputies, with governorships and local offices.", INE),
  ev("2027-06-10", "ecb"),
  ev("2027-06-11", "boj"),
  ev("2027-06-17", "boe"),
  ev("2027-06-24", "snb"),
  ev("2027-07-21", "boc", { about: `${ECON_KIND.boc.about} With the Monetary Policy Report.` }),
  ev("2027-07-22", "ecb"),
  ev("2027-07-22", "boj", { about: `${ECON_KIND.boj.about} With the Outlook Report.` }),
  ev("2027-07-29", "boe"),
  ev("2027-09-08", "boc"),
  ev("2027-09-09", "ecb"),
  ev("2027-09-16", "boe"),
  ev("2027-09-22", "boj"),
  ev("2027-09-23", "snb"),
  ev("2027-10-27", "boc", { about: `${ECON_KIND.boc.about} With the Monetary Policy Report.` }),
  election("2027-10-24", "argentina", "Argentine general election", "Argentina elects its president, vice president and part of Congress, on the fourth Sunday of October its electoral code sets; a run-off follows if no candidate wins outright.", ARGENTINA),
  ev("2027-10-28", "ecb"),
  ev("2027-10-29", "boj", { about: `${ECON_KIND.boj.about} With the Outlook Report.` }),
  ev("2027-11-04", "boe"),
  ev("2027-12-08", "boc"),
  ev("2027-12-16", "ecb"),
  ev("2027-12-16", "boe"),
  ev("2027-12-16", "snb"),
  ev("2027-12-17", "boj"),
];

/** The last date the table holds for each kind of release; an election, summit, deadline or OPEC+ meeting (which the Calendar agent finds as they are set) counts for none. */
export const ECON_LAST: Readonly<Partial<Record<EconKind, string>>> = ECON_EVENTS.reduce<Partial<Record<EconKind, string>>>((a, e) => {
  if (!GEOPOLITICS.has(e.kind) && e.kind !== "opec" && e.kind !== "earnings" && e.date > (a[e.kind] ?? "")) a[e.kind] = e.date;
  return a;
}, {});

/** The last day every kind of release still reaches: the earliest of the kinds' last dates, so one kind running out is never hidden by another set further ahead. */
export const ECON_THROUGH = Object.values(ECON_LAST).reduce((a, d) => (!a || d < a ? d : a), "");

/** The furthest day the table reaches, for the month grid's range. */
export const ECON_FURTHEST = ECON_EVENTS.reduce((a, e) => (e.date > a ? e.date : a), "");

/** How far ahead the screens list. */
export const ECON_AHEAD_DAYS = 45;

/** The events from `today` to `days` ahead, in date order. */
export function econAhead(today: string, days = ECON_AHEAD_DAYS, events: readonly EconEvent[] = ECON_EVENTS): EconEvent[] {
  const to = addDaysTo(today, days);
  return events.filter((e) => e.date >= today && e.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

/** The next Fed decision on or after `today`, for the odds card. */
export function nextFomc(today: string, events: readonly EconEvent[] = ECON_EVENTS): EconEvent | null {
  return events.filter((e) => e.kind === "fomc" && e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

/** A sentence when the table runs out within the window, so a stale table is never a quiet calendar. */
export function econTableNote(today: string, days = ECON_AHEAD_DAYS): string | null {
  const to = addDaysTo(today, days);
  const out = (Object.entries(ECON_LAST) as [EconKind, string][]).filter(([, last]) => last < to).sort((a, b) => a[1].localeCompare(b[1]));
  if (!out.length) return null;
  const words = out.map(([k, last]) => `${ECON_KIND[k].name} to ${last}`).join(", ");
  return `The calendar's table holds ${words}; later dates are added when the publishers set them.`;
}

/** The key an event's reach in the book is kept under: one per kind of event in one economy. */
export const reachKey = (e: Pick<EconEvent, "kind" | "area" | "symbol">) => (e.kind === "earnings" ? `earnings:${(e.symbol ?? "").toUpperCase()}` : `${e.kind}:${e.area}`);

export const ECON_PREFIX = "econ:";

/**
 * The calendar's events as alerts (Hamza, 27 Oct 2026): one per day that has
 * any, firing the day before so the morning check emails it, holding through
 * the day and clearing after. The table is fixed, so the alert is the same
 * for everyone and needs nothing read; what the Calendar agent found is
 * alerted apart under its own prefix (lib/calendar-agent.ts).
 */
export function econNotices(today: string, events: readonly EconEvent[] = ECON_EVENTS, reach: Readonly<Record<string, readonly string[]>> = {}, prefix = ECON_PREFIX): Notice[] {
  const byDay = new Map<string, EconEvent[]>();
  for (const e of events) {
    const days = daysBetween(today, e.date);
    if (days === 0 || days === 1) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  }
  return [...byDay.entries()].map(([date, evs]) => {
    const when = date === today ? "Today" : "Tomorrow";
    const sorted = [...evs].sort((a, b) => a.time.localeCompare(b.time));
    return {
      key: `${prefix}${date}`,
      date: date === today ? today : addDaysTo(date, -1),
      tone: "info" as const,
      title: `${when}: ${sorted.map((e) => e.name).join(", ")}`,
      detail: sorted.map((e) => [`${e.name}, ${e.time}. ${e.about}`, ...(reach[reachKey(e)] ?? [])].join(" ")).join(" "),
      href: "/calendar#econ-calendar",
    };
  });
}
