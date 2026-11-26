import { createHmac } from "node:crypto";

/**
 * One JSON line per event, for the log drain (docs/ARCHITECTURE.md §6, ADR
 * 0005). A line carries an event name, counts, durations, an outcome and a
 * keyed fingerprint of the person (`who`), never an address, a figure, a
 * symbol, a token or a URL: the fields are typed so that a figure has
 * nowhere to go, and a string field is cut at `MAX_TEXT`.
 */

export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, number | boolean | string | null | undefined>;

/** The longest string a field keeps; a sentence or an error code, never a body. */
export const MAX_TEXT = 160;

/**
 * A short keyed fingerprint of a sign-in address, the same on every instance
 * and every line, so one person's jobs can be followed without the address.
 * Keyed on AUTH_SECRET, so the fingerprint cannot be computed from an address
 * by anyone without it.
 */
export function who(email: string): string {
  const key = process.env.AUTH_SECRET ?? "portfolio-os";
  return createHmac("sha256", key).update(`log\n${email.trim().toLowerCase()}`).digest("hex").slice(0, 12);
}

/** The line as written: the event, its level, the instant and the fields given, strings cut. */
export function logLine(level: LogLevel, event: string, fields: LogFields = {}, at: Date = new Date()): string {
  const out: Record<string, number | boolean | string | null> = { ts: at.toISOString(), level, event };
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    out[k] = typeof v === "string" ? v.slice(0, MAX_TEXT) : v;
  }
  return JSON.stringify(out);
}

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = logLine(level, event, fields);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
