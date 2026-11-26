import { BellRing, Sparkles } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { TurnOnRecap, WriteRecapNow } from "@/components/markets/recap-controls";
import { RefreshWhilePending } from "@/components/live/refresh";
import { MarketHoursGate } from "@/components/today/market-gate";
import { MovePill } from "@/components/markets/session";
import { ListSection } from "@/components/ui/list";
import { MOVE_ALERT_PCT, type Recap, type RecapChoice } from "@/lib/market-recap";
import { FreshBadge } from "@/components/ui/freshness";
import { freshness } from "@/lib/freshness";
import { localDay, longDate } from "@/lib/time";

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * After the close, first on At the Close (the screen after
 * Notifications; Hamza, 18 Oct 2026): what drove the last US session and why
 * each listed holding rose, fell or held flat, written by the person's own
 * Claude from the web. Every move is the app's own read of the close; a move
 * of the person's alert (MOVE_ALERT_PCT unless they set their own) or more is marked, since it is also an alert in the app
 * and by email. Says how to turn it on, or when it is written, rather than
 * looking empty. While the US market is open it says today's is written
 * after the close, folds the last close's away behind a button, and offers
 * to write the last close's now when it is missing (Hamza, 15 Oct 2026).
 * After the bell, until the session's own is written, it says that one is
 * being written (the run at 16:35 New York, or the open of the app), asks
 * the page again for a few minutes, and keeps the last one folded away
 * rather than showing it as the day's (Hamza, 17 Oct 2026). Each holding is
 * a card in a grid, the largest move first (Hamza, 19 Oct 2026).
 */
export function CloseBrief({
  choice,
  lastClose,
  recap,
  error,
  held,
  claudeReady,
  demo,
  showcase = false,
  alertPct = MOVE_ALERT_PCT,
}: {
  choice: RecapChoice;
  /** The last closed US session, so the open-market view can name it. */
  lastClose: string;
  recap: { since: "close" | "latest"; recap: Recap } | null;
  error: string | null;
  held: ReadonlySet<string>;
  claudeReady: boolean;
  demo: boolean;
  /** The demo's anonymized snapshot: its recap is a fictional sample laid on the book's own closes. */
  showcase?: boolean;
  /** The move, either way, that is an alert: the person's own, from Notifications. */
  alertPct?: number;
}) {
  const reading = recap?.recap.reading ?? null;
  const session = recap?.recap.session ?? null;
  const fresh = session ? freshness("close", session, localDay()) : null;
  const header = fresh ? (
    <span className="flex flex-wrap items-center gap-2">
      After the close <FreshBadge fresh={demo ? { ...fresh, stale: false } : fresh} />
    </span>
  ) : (
    "After the close"
  );
  const rows = (reading?.holdings ?? []).filter((h) => held.has(h.symbol.toUpperCase()));
  const alerted = rows.filter((h) => Math.abs(h.changePct) >= alertPct).length;

  // The recap as written: the summary, each holding's move and why, and Write it now when the last close's is missing or failed.
  const lastWritten = !!recap && recap.since === "close" && recap.recap.status === "written";
  // After the bell, the session's own recap that failed: its sentence is the card, not "being written".
  const failedSentence = recap && recap.since === "close" && recap.recap.status !== "written" ? (recap.recap.sentence ?? "The recap could not be written; the next run tries again.") : null;
  const written = (
    <>
          {error ? <p className="px-4 pt-3 text-footnote text-danger">{error}</p> : null}
          {reading ? (
            <div className="px-4 py-3">
              {demo ? <p className="mb-1 text-footnote text-text-secondary">{showcase ? `A fictional sample of the recap written after the close of ${longDate(recap!.recap.session)}: the outlets, stories and reasons are invented; the moves are the book's own closes.` : "Fictional in the demo."}</p> : recap?.since === "latest" ? <p className="mb-1 text-footnote text-text-secondary">The last recap written, for {longDate(recap.recap.session)}.</p> : null}
              {/* The AI, from the web, first (Hamza, 19 Oct 2026): the summary and every point with its page, in place of the overview line. */}
              <p className="flex items-center gap-1.5 text-caption font-medium text-text-tertiary">
                <Sparkles size={14} aria-hidden /> The AI, from the web
              </p>
              <p className="mt-1.5 border-l-2 border-accent-text/60 pl-3 text-body">{reading.summary}</p>
              {reading.points.length ? (
                <ul className="mt-3 grid grid-cols-1 gap-2 text-subhead lg:grid-cols-2">
                  {reading.points.map((p, i) => (
                    <li key={i} className="flex min-w-0 gap-2 rounded-[12px] bg-surface-2/60 px-3 py-2.5">
                      <span className="mt-[0.55rem] size-1.5 shrink-0 rounded-full bg-accent-text/70" aria-hidden />
                      <span className="min-w-0">
                        <b className="font-medium">{p.headline}.</b> {p.line}
                        {p.symbols.length ? <span className="data">{p.symbols.map((s) => <span key={s} className={held.has(s.toUpperCase()) ? "text-accent-text" : "text-text-secondary"}>{` ${s}`}</span>)}</span> : null}{" "}
                        <a href={p.source.url} target="_blank" rel="noreferrer" title={p.source.title} className="text-footnote text-accent-text underline underline-offset-2 [overflow-wrap:anywhere]">
                          {hostOf(p.source.url)}
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="px-4 py-3 text-subhead">{recap?.recap.sentence ?? "Written each weekday after the close, from 16:35 in New York, with the AI with a few web searches."}</p>
          )}

          {rows.length ? (
            <div className="border-t border-hairline">
              <p className="px-4 pt-3 text-footnote text-text-secondary">
                Your holdings{alerted ? ` · ${alerted} moved ${alertPct}% or more` : ""}
              </p>
              <ul className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
                {[...rows].sort((x, y) => Math.abs(y.changePct) - Math.abs(x.changePct)).map((h) => {
                  const big = Math.abs(h.changePct) >= alertPct;
                  const tone = h.changePct > 0 ? "var(--ok)" : h.changePct < 0 ? "var(--danger)" : "var(--text-tertiary)";
                  return (
                    <li key={h.symbol} className={`relative flex min-w-0 flex-col overflow-hidden rounded-[14px] border bg-surface px-3.5 pt-3.5 pb-3 ${big ? "border-accent-text/40 shadow-[0_0_0_1px_color-mix(in_oklab,var(--accent-text)_25%,transparent)]" : "border-hairline"}`}>
                      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${tone}, transparent)` }} aria-hidden />
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="data block text-title-3 font-semibold leading-tight">{h.symbol}</span>
                          {h.name ? <span className="block truncate text-caption text-text-secondary">{h.name}</span> : null}
                        </span>
                        <MovePill pct={h.changePct} />
                      </div>
                      <p className="mt-2 flex-1 text-subhead">{h.why}</p>
                      <div className="mt-2.5 flex items-center justify-between gap-2 text-caption text-text-tertiary">
                        {h.source ? (
                          <a href={h.source.url} target="_blank" rel="noreferrer" title={h.source.title} className="truncate text-accent-text underline underline-offset-2">
                            {hostOf(h.source.url)}
                          </a>
                        ) : (
                          <span>No page for that day</span>
                        )}
                        {big ? (
                          <span className="flex shrink-0 items-center gap-1" title="Also an alert, in the app and by email">
                            <BellRing className="size-3.5 text-accent-text" aria-hidden />
                            Alerted
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : reading ? (
            <p className="border-t border-hairline px-4 py-3 text-footnote text-text-secondary">This recap was written before it explained each holding, or none of your listed holdings traded that session.</p>
          ) : null}

          {!demo && (!recap || recap.since !== "close" || recap.recap.status !== "written") ? (
            <div className="border-t border-hairline px-4 py-3">{claudeReady ? <WriteRecapNow label="Write the last session's recap now" /> : <p className="text-footnote text-text-secondary">The AI is not set up on this deployment yet.</p>}</div>
          ) : null}
    </>
  );

  return (
    <ListSection
      header={header}
      trailing={
        <Link href={"/#session" as Route} className="text-footnote text-accent-text">
          The session
        </Link>
      }
      footer={`The AI's reading of the day's news, written after the close with the AI; the moves are the app's read of the close. A holding that moves ${MOVE_ALERT_PCT}% or more either way is also an alert, here and by email. Not investment advice.`}
    >
      {!choice.claude ? (
        <div className="px-4 py-3">
          <p className="text-subhead">The AI can write this after each close: what moved the market, and why each of your holdings rose, fell or held flat. A holding that moves {MOVE_ALERT_PCT}% or more is explained from that day&rsquo;s news and sent as an alert.</p>
          {demo ? null : <div className="mt-3">{claudeReady ? <TurnOnRecap newsletter={choice.newsletter} /> : <p className="text-footnote text-text-secondary">The AI is not set up on this deployment yet.</p>}</div>}
        </div>
      ) : demo ? (
        written
      ) : (
        <MarketHoursGate
          open={
            <>
              <div className="px-4 py-3">
                <p className="text-subhead">Today&rsquo;s is written by itself after the close, from 16:35 in New York, and lands here with an alert for any holding that moves {MOVE_ALERT_PCT}% or more.</p>
                {lastWritten ? null : claudeReady ? (
                  <div className="mt-3">
                    <WriteRecapNow label={`Write the last close's recap now (${longDate(lastClose)})`} />
                  </div>
                ) : (
                  <p className="mt-2 text-footnote text-text-secondary">The AI is not set up on this deployment yet.</p>
                )}
              </div>
              {recap ? (
                <details className="group border-t border-hairline">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-subhead text-accent-text marker:hidden [&::-webkit-details-marker]:hidden">
                    <span>Show the last close, {longDate(recap.recap.session)}</span>
                    <span className="text-caption text-text-tertiary group-open:hidden">Open</span>
                    <span className="hidden text-caption text-text-tertiary group-open:inline">Close</span>
                  </summary>
                  {written}
                </details>
              ) : null}
            </>
          }
          closed={
            lastWritten ? (
              written
            ) : (
              <>
                <div className="px-4 py-3">
                  <p className="text-subhead">
                    {failedSentence ??
                      (claudeReady
                        ? `The recap of ${longDate(lastClose)} is being written with the AI: the close is read at 16:20 in New York and the recap follows, by itself. It lands here with an alert for any holding that moved ${alertPct}% or more.`
                        : `The recap of ${longDate(lastClose)} needs the AI, which is not set up on this deployment yet.`)}
                  </p>
                  {claudeReady ? (
                    <div className="mt-3">
                      <WriteRecapNow label={`Write it now (${longDate(lastClose)})`} />
                    </div>
                  ) : null}
                  {claudeReady && !failedSentence ? <RefreshWhilePending every={30} times={10} /> : null}
                </div>
                {recap && recap.since === "latest" ? (
                  <details className="group border-t border-hairline">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-subhead text-accent-text marker:hidden [&::-webkit-details-marker]:hidden">
                      <span>Show the close before, {longDate(recap.recap.session)}</span>
                      <span className="text-caption text-text-tertiary group-open:hidden">Open</span>
                      <span className="hidden text-caption text-text-tertiary group-open:inline">Close</span>
                    </summary>
                    {written}
                  </details>
                ) : null}
              </>
            )
          }
        />
      )}
    </ListSection>
  );
}
