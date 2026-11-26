/**
 * The person's own time. Every day and clock time the app shows or counts on
 * is read in the person's zone (Hamza, 28 Oct 2026: never a city written
 * into the code): in the browser, the zone the device reports; on the
 * server, the zone the browser last reported in the `pos_tz` cookie, else
 * the one the network places the request in (lib/zone.ts), else the zone a
 * scheduled run holds for that person (`withZone`). The server runs on UTC,
 * so a day is never `new Date().toISOString().slice(0, 10)`.
 */

/** The cookie the browser keeps its zone in, for the server to read. */
export const ZONE_COOKIE = "pos_tz";
/** The zone when nothing says one: a run with no person and no request. */
export const FALLBACK_ZONE = "UTC";

type ZoneSource = () => string | null | undefined;
const SOURCE_KEY = "__portfolioOsZone";

/** Sets where the server reads the person's zone from (lib/zone.ts, once per process; every bundle shares it through the global). */
export function setZoneSource(source: ZoneSource): void {
  (globalThis as Record<string, unknown>)[SOURCE_KEY] = source;
}

export function zoneValid(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The device's own zone, where there is a device. */
export function deviceZone(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** The zone this request, run or page is read in. */
export function currentZone(): string {
  const source = (globalThis as Record<string, unknown>)[SOURCE_KEY] as ZoneSource | undefined;
  let zone: string | null | undefined = null;
  try {
    zone = source?.();
  } catch {
    zone = null;
  }
  zone = zone || deviceZone();
  return zone && zoneValid(zone) ? zone : FALLBACK_ZONE;
}

/** A zone as a person names it: "Athens" for Europe/Athens, "New York" for America/New_York. */
export function zonePlace(zone: string = currentZone()): string {
  const last = zone.split("/").pop() ?? zone;
  return last.replace(/_/g, " ");
}

/** Today's date in the person's zone, as YYYY-MM-DD. */
export function localDay(now: Date = new Date(), zone: string = currentZone()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // en-CA formats as YYYY-MM-DD
}

/** Whole calendar days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string) {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** The date `n` days after `date` (before it when negative), both YYYY-MM-DD. */
export function addDaysTo(date: string, n: number) {
  return new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + n)).toISOString().slice(0, 10);
}

export function daysUntil(date: string, now: Date = new Date()) {
  return daysBetween(localDay(now), date);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDate(iso: string) {
  const d = Number(iso.slice(8, 10));
  return `${d} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

/** "Oct 2026": a tick on a chart that spans years. */
export function monthYear(iso: string) {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

export function longDate(iso: string) {
  return `${shortDate(iso)} ${iso.slice(0, 4)}`;
}

export function countdown(days: number) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 0) return `${-days}d overdue`;
  return `In ${days}d`;
}

/** "22:00": a moment's clock time in the person's zone. */
export function localTime(iso: string | Date, zone: string = currentZone()) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/** "09:00": the person's clock time at a whole UTC hour (a scheduled run's), today. */
export function atUtcHour(hour: number, zone: string = currentZone()) {
  const now = new Date();
  return localTime(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour)), zone);
}

/** "18 Oct, 15:21" in the person's zone, for a moment the app recorded. */
export function localMoment(iso: string | Date, zone: string = currentZone()) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${shortDate(localDay(d, zone))}, ${localTime(d, zone)}`;
}

/** The Monday of the week a day falls in. */
export function mondayOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDaysTo(date, dow === 0 ? -6 : 1 - dow);
}

/** One week from its Monday, Monday to Friday, or to Sunday with `weekends`. */
export function weekDays(monday: string, weekends = false): string[] {
  return Array.from({ length: weekends ? 7 : 5 }, (_, i) => addDaysTo(monday, i));
}

export function shiftMonth(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}`;
}

/**
 * The month as weeks of weekdays, Monday to Friday: each week five cells,
 * a cell a date in the month or null. Reports fall on weekdays, so a weekend
 * column would only take room on a phone; `weekends` adds Saturday and Sunday
 * for a month with something on them (an election).
 */
export function monthGrid(month: string, weekends = false): (string | null)[][] {
  const first = `${month}-01`;
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const width = weekends ? 7 : 5;
  const blank = () => Array<string | null>(width).fill(null);
  const weeks: (string | null)[][] = [];
  let week = blank();
  let started = false;
  for (let d = 0; d < days; d++) {
    const date = addDaysTo(first, d);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (!weekends && (dow === 0 || dow === 6)) continue;
    if (dow === 1 && started) {
      weeks.push(week);
      week = blank();
    }
    week[(dow + 6) % 7] = date;
    started = true;
  }
  if (week.some(Boolean)) weeks.push(week);
  return weeks;
}
