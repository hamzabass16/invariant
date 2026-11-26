import type { AlertsEmail } from "@/lib/alerts";
import { figureChange, reportKey, type EarningsReport } from "@/lib/earnings";
import { BEARING_WORD, beatsOf, CHANGE_WORD, RESULT_WORD } from "@/lib/earnings-call";

/** A figure's change on a year as a cell: green when it rose, red when it fell, plain when flat. */
function changeCell(f: EarningsReport["figures"][number]): string {
  const c = figureChange(f);
  if (!c) return "";
  return c.up === null ? esc(c.text) : `<span style="color:${c.up ? "#1a7f4b" : "#b3261e"}">${esc(c.text)}</span>`;
}

/**
 * A report after a company's results as its own email (Hamza, 23 Oct 2026:
 * "Why were the Meta and spotify earning reports not emailed to me with their
 * reports and decks"): the app's headline, the quarter's figures against a
 * year before, the class tests, the rules and the kill signals on the new
 * figures, how the stock took them, the commentary when the person's model
 * wrote one, and the decks, linked where the vault keeps them as Google
 * Slides and attached as PowerPoint by the caller. Built from the kept report
 * alone. Pure: nothing fetched or sent here.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const INK = "#15171d";
const SOFT = "#5a5e68";
const LINE = "#ece9e0";
const TEAL = "#0f7b75";

export type ReportDeckLink = { label: string; url: string };

/** The decks kept in the vault as Google Slides, as links. */
export function deckLinks(r: EarningsReport, appUrl: string | null = null): ReportDeckLink[] {
  const base = appUrl && /^https:\/\/[^/\s]+$/.test(appUrl.replace(/\/$/, "")) ? appUrl.replace(/\/$/, "") : null;
  return r.doc?.ready && base ? [{ label: "The earnings report", url: `${base}/api/earnings/deck?key=${encodeURIComponent(reportKey(r))}` }] : [];
}

/** The stock's move since the results came out, read at the moment the email is sent. */
export type SinceRelease = { pct: number; basis: "release" | "close"; session: "pre" | "regular" | "post" | "closed"; at: string; benchmarkPct?: number | null };

const SESSION_WORD: Record<SinceRelease["session"], string> = { pre: "before the open", regular: "in the session", post: "after hours", closed: "at the close" };

/** The move since the release in one line. */
export function sinceWords(r: EarningsReport, s: SinceRelease): string {
  return `${r.symbol} ${signed(s.pct)} since ${s.basis === "release" ? "the results came out" : "the close before the results"}, ${SESSION_WORD[s.session]} as this was sent (${s.at} New York)${typeof s.benchmarkPct === "number" ? `; SPY ${signed(s.benchmarkPct)} over the same time` : ""}.`;
}

/**
 * `deck` is the email that brings the earnings deck once it is made (the
 * figures, the call, the study and its words in; Hamza, 4 Nov 2026); the
 * results email goes at once without it, and `waiting` says what the deck
 * waits for.
 */
export function earningsReportEmail(r: EarningsReport, appUrl: string | null, attached: readonly string[], opts: { deck?: boolean; waiting?: string | null; since?: SinceRelease | null } = {}): AlertsEmail {
  const base = appUrl && /^https:\/\/[^/\s]+$/.test(appUrl.replace(/\/$/, "")) ? appUrl.replace(/\/$/, "") : null;
  const page = base ? `${base}/earnings?report=${encodeURIComponent(reportKey(r))}#report` : null;
  const company = `${r.symbol}${r.name && r.name !== r.symbol ? ` (${r.name})` : ""}`;
  const quarter = r.quarter ? ` ${r.quarter.replace("/", " ")}` : "";
  const stage = opts.deck ? "earnings report" : r.status === "complete" ? "results" : "results release";
  const subject = `${r.symbol}${quarter} ${stage}: ${r.headline}`.slice(0, 160);
  const ccy = r.currency ? ` ${r.currency}` : "";
  const links = deckLinks(r, appUrl);
  const since = opts.since ? sinceWords(r, opts.since) : null;
  // A rule or a signal with no figure to read it on is not a row of blanks: it is named once, at the end (Hamza, 4 Nov 2026: no "n/a").
  const rules = r.rules.filter((x) => x.actual !== null);
  const kills = r.triggers.filter((t) => t.kind === "kill" && t.met !== null);
  const triggers = r.triggers.filter((t) => t.kind === "trigger" && t.met !== null);
  const unread = [...r.rules.filter((x) => x.actual === null).map((x) => `${x.section} ${x.text}`), ...r.triggers.filter((t) => t.met === null).map((t) => t.label)];
  const unreadLine = unread.length ? `Not tested this quarter, since the filings give no figure for ${unread.length === 1 ? "it" : "them"}: ${unread.join("; ")}.` : null;
  const met = (m: boolean | null) => (m ? "met" : "not met");
  const reaction = r.reaction ? `${r.symbol} ${signed(r.reaction.movePct)} from ${r.reaction.from.date} to the close of ${r.reaction.to.date}${r.reaction.benchmark && r.reaction.benchmarkPct !== null ? `, ${r.reaction.benchmark} ${signed(r.reaction.benchmarkPct)}` : ""}.${r.reaction.why ? ` ${r.reaction.why}` : ""}` : null;
  const source = r.filing ?? r.release;
  const beats = beatsOf(r);
  const guided = r.call?.guidance ?? [];

  const text = [
    `${company}${quarter}: ${r.headline}`,
    r.sentence ?? "",
    ...(since ? ["", since] : []),
    "",
    ...(r.figures.length ? [`The quarter${r.period ? ` (${r.period})` : ""}${ccy}, against a year before:`, ...r.figures.map((f) => `  ${f.label}: ${f.now}${f.before ? ` (was ${f.before})` : ""}${figureChange(f) ? `, ${figureChange(f)!.text}` : ""}`), ""] : []),
    ...(r.tests.length ? ["Your classes on the new figures:", ...r.tests.map((t) => `  ${t.label}: ${t.passes} of ${t.of}${t.holds ? ", holds" : `, needs ${t.needed}`}`), ""] : []),
    ...(rules.length ? ["Rules that fail or come near:", ...rules.map((x) => `  ${x.section} ${x.text} (${x.actual} against ${x.limit})`), ""] : []),
    ...(kills.length ? ["Kill signals:", ...kills.map((t) => `  ${t.label}: ${met(t.met)}${t.reading ? `, reads ${t.reading}` : ""}`), ""] : []),
    ...(triggers.length ? ["Triggers:", ...triggers.map((t) => `  ${t.label}: ${met(t.met)}${t.reading ? `, reads ${t.reading}` : ""}`), ""] : []),
    ...(reaction ? ["How the stock took it:", `  ${reaction}`, ""] : []),
    ...(beats.length ? ["Beats and misses:", ...beats.map((b) => `  ${RESULT_WORD[b.result]}: ${b.line} ${b.actual} against ${b.expected} (${b.against === "consensus" ? "the analysts'" : "the company's guidance"})${b.by ? `, ${b.by}` : ""}`), ""] : []),
    ...(guided.length ? ["Guidance:", ...guided.map((g) => `  ${g.change ? `${CHANGE_WORD[g.change]}: ` : ""}${g.metric}${g.period ? ` (${g.period})` : ""}: ${g.said}${g.bearsOn && g.reading ? ` ${BEARING_WORD[g.reading]} ${g.bearsOn === "pathway" ? "the pathway" : g.bearsOn}.` : ""}`), ""] : []),
    ...(r.commentary ? ["Your Claude, from the release and the call:", `  ${r.commentary.summary}`, ...(r.commentary.guidance && !guided.length ? [`  Guidance: ${r.commentary.guidance}`] : []), ...r.commentary.points.map((p) => `  - ${p.line} (${p.source.url})`), ""] : r.commentaryNote ? [r.commentaryNote, ""] : []),
    ...(unreadLine ? [unreadLine, ""] : []),
    ...links.map((l) => `${l.label}: ${l.url}`),
    attached.length ? `Attached: ${attached.join(", ")}.` : opts.deck ? "The PDF could not be attached; the report is on the Earnings screen." : (opts.waiting ?? "The earnings report comes in its own email once it is whole."),
    page ? `The report: ${page}` : "The report is on the Earnings screen.",
    source ? `From the ${source.form} filed ${source.filed}: ${source.url}` : "",
    "The headline, the classes and the signals are the app's, from your methodology; nothing here is a forecast. Not investment advice.",
  ]
    .filter((l, i, all) => !(l === "" && all[i - 1] === ""))
    .join("\n");

  const td = `padding:8px 12px;border-bottom:1px solid ${LINE};font:14px/20px Arial,sans-serif;color:${INK}`;
  const num = `${td};font-family:Menlo,Consolas,monospace;text-align:right;white-space:nowrap`;
  const section = (title: string, body: string) => `<p style="margin:20px 0 6px;font:600 12px/16px Arial,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:${SOFT}">${esc(title)}</p>${body}`;
  const table = (head: string[], rows: string[][], right: number[]) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px"><tr>${head.map((h, i) => `<td style="${right.includes(i) ? num : td};font-weight:600;color:${SOFT}">${esc(h)}</td>`).join("")}</tr>${rows.map((row) => `<tr>${row.map((c, i) => `<td style="${right.includes(i) ? num : td}">${c}</td>`).join("")}</tr>`).join("")}</table>`;
  const tone = (m: boolean | null, kill: boolean) => (m === null ? SOFT : m ? (kill ? "#b3261e" : "#9a6b00") : "#1a7f4b");
  const signals = (title: string, list: typeof kills, kill: boolean) => (list.length ? section(title, table(["Signal", "Today", ""], list.map((t) => [esc(t.label), esc(t.reading ?? ""), `<span style="color:${tone(t.met, kill)};font-weight:600">${met(t.met)}</span>`]), [1])) : "");
  const button = (l: ReportDeckLink) => `<a href="${esc(l.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 14px;border-radius:8px;background:${TEAL};color:#fff;text-decoration:none;font:600 14px/18px Arial,sans-serif">${esc(l.label)}</a>`;

  const html =
    `<div style="background:#f4f1ea;padding:24px 16px"><div style="max-width:680px;margin:0 auto">` +
    `<p style="margin:0 0 4px;font:600 12px/16px Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${TEAL}">Invariant · Earnings</p>` +
    `<h1 style="margin:0 0 6px;font:700 22px/28px Arial,sans-serif;color:${INK}">${esc(company)}${esc(quarter)}</h1>` +
    `<p style="margin:0 0 4px;font:600 16px/22px Arial,sans-serif;color:${INK}">${esc(r.headline)}</p>` +
    (r.sentence ? `<p style="margin:0;font:14px/20px Arial,sans-serif;color:${SOFT}">${esc(r.sentence)}</p>` : "") +
    (since && opts.since ? `<p style="margin:12px 0 0;padding:10px 12px;border-radius:8px;background:#fff;font:14px/20px Arial,sans-serif;color:${INK}"><b style="font-family:Menlo,Consolas,monospace;color:${opts.since.pct >= 0 ? "#1a7f4b" : "#b3261e"}">${esc(signed(opts.since.pct))}</b> ${esc(since.replace(/^\S+ \S+ /, ""))}</p>` : "") +
    (links.length || page ? `<div style="margin:16px 0 0">${links.map(button).join("")}${page ? `<a href="${esc(page)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 14px;border-radius:8px;border:1px solid ${TEAL};color:${TEAL};text-decoration:none;font:600 14px/18px Arial,sans-serif">The report in the app</a>` : ""}</div>` : "") +
    (r.figures.length ? section(`The quarter${r.period ? `, ${r.period}` : ""}${ccy}`, table(["", "Now", "A year before", "Change"], r.figures.map((f) => [esc(f.label), esc(f.now), esc(f.before ?? ""), changeCell(f)]), [1, 2, 3])) : "") +
    (r.tests.length ? section("Your classes on the new figures", table(["Class", "Passes", ""], r.tests.map((t) => [esc(t.label), `${t.passes} of ${t.of}`, t.holds ? `<span style="color:#1a7f4b;font-weight:600">holds</span>` : `needs ${t.needed}`]), [1])) : "") +
    (rules.length ? section("Rules that fail or come near", table(["Rule", "Reads", "Limit"], rules.map((x) => [`<b>${esc(x.section)}</b> ${esc(x.text)}`, esc(x.actual ?? ""), esc(x.limit)]), [1, 2])) : "") +
    signals("Kill signals", kills, true) +
    signals("Triggers", triggers, false) +
    (reaction ? section("How the stock took it", `<p style="margin:0;font:14px/20px Arial,sans-serif;color:${INK}">${esc(reaction)}</p>`) : "") +
    (beats.length ? section("Beats and misses", table(["Line", "Reported", "Expected", ""], beats.map((b) => [esc(b.line), esc(b.actual), `${esc(b.expected)} <span style="color:${SOFT}">${b.against === "consensus" ? "analysts" : "guidance"}</span>`, `<span style="color:${b.result === "beat" ? "#1a7f4b" : b.result === "miss" ? "#b3261e" : SOFT};font-weight:600">${RESULT_WORD[b.result]}${b.by ? ` ${esc(b.by)}` : ""}</span>`]), [1, 2])) : "") +
    (guided.length ? section("Guidance, against your thesis", `<ul style="margin:0;padding-left:18px;font:14px/20px Arial,sans-serif;color:${INK}">${guided.map((g) => `<li style="margin:0 0 6px">${g.change ? `<b>${CHANGE_WORD[g.change]}.</b> ` : ""}${esc(g.metric)}${g.period ? ` (${esc(g.period)})` : ""}: ${esc(g.said)}${g.bearsOn && g.reading ? ` <span style="color:${SOFT}">${BEARING_WORD[g.reading]} ${esc(g.bearsOn === "pathway" ? "the pathway" : g.bearsOn)}${g.why ? `: ${esc(g.why)}` : ""}</span>` : ""}</li>`).join("")}</ul>`) : "") +
    (r.commentary
      ? section(
          "Your Claude, from the release and the call",
          `<p style="margin:0 0 8px;font:14px/20px Arial,sans-serif;color:${INK}">${esc(r.commentary.summary)}</p>` +
            (r.commentary.guidance && !guided.length ? `<p style="margin:0 0 8px;font:14px/20px Arial,sans-serif;color:${INK}"><b>Guidance.</b> ${esc(r.commentary.guidance)}</p>` : "") +
            (r.commentary.points.length ? `<ul style="margin:0;padding-left:18px;font:14px/20px Arial,sans-serif;color:${INK}">${r.commentary.points.map((p) => `<li style="margin:0 0 4px">${esc(p.line)} <a href="${esc(p.source.url)}" style="color:${TEAL}">${esc(p.source.title)}</a></li>`).join("")}</ul>` : ""),
        )
      : r.commentaryNote
        ? `<p style="margin:16px 0 0;font:13px/18px Arial,sans-serif;color:${SOFT}">${esc(r.commentaryNote)}</p>`
        : "") +
    (unreadLine ? `<p style="margin:16px 0 0;font:13px/18px Arial,sans-serif;color:${SOFT}">${esc(unreadLine)}</p>` : "") +
    `<p style="margin:20px 0 0;font:13px/18px Arial,sans-serif;color:${SOFT}">${attached.length ? `Attached: ${esc(attached.join(", "))}.` : opts.deck ? "The PDF could not be attached; the report is on the Earnings screen." : esc(opts.waiting ?? "The earnings report comes in its own email once it is whole.")}${source ? ` From the <a href="${esc(source.url)}" style="color:${TEAL}">${esc(source.form)}</a> filed ${esc(source.filed)}.` : ""} The headline, the classes and the signals are the app's, from your methodology; nothing here is a forecast. Not investment advice.</p>` +
    `</div></div>`;
  return { subject, text, html };
}
