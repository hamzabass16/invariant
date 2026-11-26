import { RateFinding } from "@/components/agents/rate-finding";
import { StatusPill } from "@/components/ui/status";
import type { Rating } from "@/lib/agents";
import { CONFIDENCE_LABEL, DROP_LABEL, STANCE_LABEL, TIER_LABEL, type Dropped, type Finding } from "@/lib/research-agent";
import { longDate } from "@/lib/time";

const STANCE_TONE = { backs: "ok", challenges: "warn", update: "info" } as const;

/**
 * One finding of the Research Agent: the headline, whether it backs the
 * thesis, challenges it or updates it, the pillar or rule it bears on, how
 * sure the agent is in words, the two lines, every source with its page and
 * its tier, and the rating.
 */
export function FindingCard({ f, agent, rating, editable, showSymbol = false }: { f: Finding; agent: string; rating: Rating | null; editable: boolean; showSymbol?: boolean }) {
  return (
    <li className="card min-w-0 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {showSymbol ? <span className="data text-footnote font-semibold">{f.symbol}</span> : null}
        <StatusPill tone={STANCE_TONE[f.stance]}>{STANCE_LABEL[f.stance]}</StatusPill>
        {f.bearsOn ? <StatusPill tone="neutral">{f.bearsOn}</StatusPill> : null}
        <span className="text-caption text-text-tertiary">{CONFIDENCE_LABEL[f.confidence]}</span>
        <span className="ml-auto text-caption text-text-tertiary">{longDate(f.day)}</span>
      </div>
      <p className="mt-2 text-subhead font-semibold">{f.headline}</p>
      <p className="mt-1 text-footnote text-text-secondary">{f.lines}</p>
      <ul className="mt-2 space-y-0.5 text-caption">
        {f.sources.map((s, i) => (
          <li key={`${s.url ?? s.title}-${i}`} className="text-text-tertiary">
            {s.url ? (
              <a href={s.url} target={s.url.startsWith("/") ? undefined : "_blank"} rel="noreferrer" className="text-accent-text">
                {s.title}
              </a>
            ) : (
              s.title
            )}{" "}
            · {s.source}, {longDate(s.at.slice(0, 10))} · {TIER_LABEL[s.tier]}
          </li>
        ))}
      </ul>
      <RateFinding agent={agent} target={f.id} subject={f.symbol} title={f.headline} rating={rating} editable={editable} />
    </li>
  );
}

/** What the agent left out, with why, folded shut. */
export function DroppedList({ dropped, title = "Left out by the Research Agent" }: { dropped: readonly Dropped[]; title?: string }) {
  if (!dropped.length) return null;
  return (
    <details className="card mt-3 px-4 py-3">
      <summary className="cursor-pointer text-footnote font-medium text-text-secondary">
        {title} · {dropped.length}
      </summary>
      <ul className="mt-2 space-y-1.5 text-footnote">
        {dropped.map((d, i) => (
          <li key={`${d.url ?? d.title}-${i}`} className="min-w-0">
            <span className="mr-2">
              <StatusPill tone="neutral">{DROP_LABEL[d.reason]}</StatusPill>
            </span>
            {d.url ? (
              <a href={d.url} target="_blank" rel="noreferrer" className="text-text-secondary underline decoration-hairline-strong underline-offset-2">
                {d.title}
              </a>
            ) : (
              <span className="text-text-secondary">{d.title}</span>
            )}
            <span className="text-caption text-text-tertiary">
              {" "}
              · {d.source}
              {d.why ? `. ${d.why}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
