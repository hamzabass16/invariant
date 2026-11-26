import { companyHref } from "@/lib/company";
import { linkKey, type EconEvent, type EventLink } from "@/lib/econ-calendar";
import { reportKey, TIME_LABEL, type EarningsReport } from "@/lib/earnings";
import { macroKey, type MacroReport } from "@/lib/macro-report";

/**
 * What each event on the Calendar opens (Hamza, 6 Nov 2026). Pure, so the
 * check reads it.
 */

/** How far back a past result or event is drawn with its report. */
export const REPORTS_BACK_DAYS = 400;

/** A kept earnings report as a past results event. */
export function reportEvent(r: EarningsReport): EconEvent {
  const symbol = r.symbol.toUpperCase();
  return { date: r.date, kind: "earnings", area: "us", symbol, short: symbol, name: `${symbol} results`, time: r.time === "unknown" ? "Time not given" : TIME_LABEL[r.time], about: `${r.name ?? symbol}${r.quarter ? `, for ${r.quarter.replace("/", " ")}` : ""}. ${r.headline}`, source: companyHref(symbol), indicator: null };
}

/**
 * Each event with a report, what it opens (Hamza, 6 Nov 2026: "click a past
 * earnings and see the report page for it and the same for the other macro
 * events"): a company's results their earnings report, the newest kept for
 * that day; a macro event its report on the Calendar.
 */
export function eventLinks(events: readonly EconEvent[], reports: readonly EarningsReport[], macro: readonly MacroReport[]): Record<string, EventLink> {
  const links: Record<string, EventLink> = {};
  for (const e of events) {
    if (e.kind === "earnings") {
      const r = reports.filter((x) => x.symbol.toUpperCase() === e.symbol && x.date === e.date && (x.status === "release" || x.status === "complete")).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (r) links[linkKey(e)] = { href: `/earnings?report=${encodeURIComponent(reportKey(r))}#report`, label: "The earnings report" };
    } else if (macro.some((m) => m.key === macroKey(e))) links[linkKey(e)] = { href: `/calendar?event=${encodeURIComponent(macroKey(e))}#event-reports`, label: "The report after it" };
  }
  return links;
}
