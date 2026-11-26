import { ChevronDown, Mic } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { chevron, summaryRow } from "@/components/markets/disclosure";
import { episodeUrl, type Episode, type PodcastShow } from "@/lib/podcasts";
import { shortDate } from "@/lib/time";

function Chips({ items, tone = "accent" }: { items: readonly string[]; tone?: "accent" | "neutral" }) {
  if (!items.length) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {items.map((s) => (
        <span key={s} className={tone === "accent" ? "data rounded-full bg-accent-subtle px-1.5 py-px text-[11px] leading-4 text-accent-text" : "data rounded-full bg-surface-2 px-1.5 py-px text-[11px] leading-4 text-text-secondary"}>
          {s}
        </span>
      ))}
    </span>
  );
}

/**
 * Podcasts on At the Close (Hamza, 20 Oct 2026): the past fortnight's
 * episodes of the shows the person follows, newest first, each a row that
 * opens on what was said and on what it means for their book, written on
 * their own model from the transcript on podscripts.co. The newest is open.
 */
export function PodcastEpisodes({ shows, episodes, failed, hasModel, demo, error }: { shows: readonly PodcastShow[]; episodes: readonly Episode[]; failed: readonly Episode[]; hasModel: boolean; demo: boolean; error: string | null }) {
  const title = new Map(shows.map((s) => [s.slug, s.title]));
  return (
    <section id="podcasts" className="mb-8 scroll-mt-20" data-tour="podcasts">
      <h2 className="section-header mb-2 px-1">Podcasts</h2>
      <div className="card overflow-hidden">
        {error ? <p className="px-4 py-3 text-subhead text-danger">{error}</p> : null}
        {episodes.length ? (
          episodes.map((e, i) => {
            const r = e.reading!;
            return (
              <details key={e.id} className={`group ${i ? "border-t border-hairline" : ""}`} open={i === 0}>
                <summary className={summaryRow}>
                  <Mic className="size-4 shrink-0 text-text-tertiary" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                      <span className="text-body font-medium">{e.title}</span>
                      <span className="data shrink-0 text-footnote text-text-tertiary">{shortDate(e.date)}</span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-footnote text-text-secondary">
                      <span>{title.get(e.show) ?? e.show}</span>
                      <Chips items={r.perspective.symbols.slice(0, 6)} />
                    </span>
                  </span>
                  <ChevronDown className={chevron} aria-hidden />
                </summary>
                <div className="px-4 pb-4">
                  <p className="text-subhead">{r.summary}</p>
                  {r.points.length ? (
                    <ul className="mt-3 space-y-2 text-subhead">
                      {r.points.map((p, j) => (
                        <li key={j} className="flex gap-2">
                          <span className="mt-[0.55rem] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <b className="font-medium">{p.headline}.</b> {p.line} <Chips items={p.symbols} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-4 rounded-[10px] bg-accent-subtle/50 px-3 py-3">
                    <p className="text-footnote font-medium text-accent-text">For your book</p>
                    <p className="mt-1 text-subhead">{r.perspective.text}</p>
                    {r.perspective.sections.length ? (
                      <p className="mt-2 flex flex-wrap items-center gap-1 text-caption text-text-secondary">
                        Rules it touches: <Chips items={r.perspective.sections} tone="neutral" />
                      </p>
                    ) : null}
                  </div>
                  <p className="mt-3 text-caption text-text-tertiary">
                    {demo ? (
                      "Fictional in the demo."
                    ) : (
                      <>
                        Written with the AI from the{" "}
                        <a href={episodeUrl(e.show, e.id.split("/")[1] ?? "")} target="_blank" rel="noreferrer noopener" className="text-accent-text underline underline-offset-2">
                          transcript on podscripts.co
                        </a>
                        {e.cut ? ", its first part; the rest was too long to send" : ""}.
                      </>
                    )}
                  </p>
                </div>
              </details>
            );
          })
        ) : (
          <p className="px-4 py-3 text-subhead text-text-secondary">
            {!shows.length ? (
              <>
                You follow no podcast. Add one on <Link href={"/setup#podcasts" as Route} className="text-accent-text">Setup</Link>.
              </>
            ) : !hasModel ? (
              <>
                New episodes of {shows.map((s) => s.title).join(", ")} are written up by the AI once it is set up on this deployment.
              </>
            ) : (
              `No episode of ${shows.map((s) => s.title).join(", ")} in the past fortnight is written up yet. New ones are read each morning and when you open the app.`
            )}
          </p>
        )}
        {failed.length ? (
          <p className="border-t border-hairline px-4 py-2 text-footnote text-text-tertiary">
            {failed.length === 1 ? "One episode of the fortnight is" : `${failed.length} episodes of the fortnight are`} not written up yet. The latest read said: {(failed[0]!.error ?? "it could not be read").replace(/[;.]\s*tried again on the next run\.?$/i, "")}. Each is tried again the next morning and when you open the app.
          </p>
        ) : null}
      </div>
      <p className="mt-2 px-1 text-footnote text-text-tertiary">A podcast is its hosts&apos; argument. The perspective is the AI reading it against your holdings, watchlist, theses and methodology; the verdict on a holding stays your methodology&apos;s. Not investment advice.</p>
    </section>
  );
}
