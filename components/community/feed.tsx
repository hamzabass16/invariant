import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { companyHref } from "@/lib/company";
import { ageWords, hueOf, initialsOf, streakWeeks, topHoldings, type CommunityProfile, type FeedChip, type FeedItem, type WeightMove, badgeOf, BADGE_MIN_WEEKS, BADGE_MIN_RULES_PCT } from "@/lib/community";
import { longDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const HUES = ["var(--series-hcmp)", "var(--series-qqq)", "var(--series-spy)", "var(--arch-tr)", "var(--arch-cm)", "var(--arch-dg)", "var(--arch-ph)"];

/** A person's initials in a circle tinted by their handle's hue. */
export function Avatar({ name, handle, size = "md" }: { name: string; handle: string; size?: "md" | "lg" }) {
  const hue = HUES[hueOf(handle, HUES.length)];
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-text", size === "lg" ? "size-16 text-title3" : "size-10 text-subhead")}
      style={{ background: `color-mix(in oklab, ${hue} 30%, var(--surface))`, boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${hue} 70%, var(--surface))` }}
    >
      {initialsOf(name, handle)}
    </span>
  );
}

/** A ticker chip with the share of the book it is, in percent; it opens the company's page outside the demo. */
export function Chip({ chip, link }: { chip: FeedChip; link: boolean }) {
  const body = (
    <>
      <span className="data font-semibold">{chip.symbol}</span>
      {chip.weightPct !== null ? <span className="data text-text-tertiary">{chip.weightPct.toFixed(1)}% held</span> : null}
    </>
  );
  const cls = "inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2.5 py-1 text-caption";
  return link ? (
    <Link href={companyHref(chip.symbol) as Route} className={cn(cls, "hover:border-accent-text")}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

const moveWords = (m: WeightMove) => (m.from === null ? `in at ${m.to!.toFixed(1)}%` : m.to === null ? `out from ${m.from.toFixed(1)}%` : `${m.from.toFixed(1)}% → ${m.to.toFixed(1)}%`);

function Head({ item, today, kind }: { item: FeedItem; today: string; kind: string }) {
  return (
    <div className="flex items-start gap-3">
      <Link href={`/community/${encodeURIComponent(item.handle)}` as Route} aria-label={`@${item.handle}`}>
        <Avatar name={item.name} handle={item.handle} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <Link href={`/community/${encodeURIComponent(item.handle)}` as Route} className="font-semibold hover:text-accent-text">
            {item.name}
          </Link>
          <span className="data text-caption text-text-tertiary">@{item.handle}</span>
        </p>
        <p className="text-caption text-text-tertiary">
          {kind} · {ageWords(item.at, today)}
        </p>
      </div>
    </div>
  );
}

/**
 * One item of the feed, after Blossom's posts: who, when, what, the
 * companies it touches as chips with their share of the book, and the way to
 * read it in full on the person's page.
 */
export function FeedCard({ item, today, link }: { item: FeedItem; today: string; link: boolean }) {
  let body: ReactNode;
  let kind: string;
  if (item.kind === "thesis") {
    kind = item.symbol ? "Stock thesis" : "Market thesis";
    body = (
      <>
        <p className="mt-3 font-semibold">{item.symbol ? <span className="data">{item.title}</span> : item.title}</p>
        {item.excerpt ? <p className="mt-1 text-body text-text-secondary">{item.excerpt}</p> : null}
        <p className="mt-2 text-caption text-text-tertiary">{item.pillars ? `${item.pillars} ${item.pillars === 1 ? "pillar" : "pillars"}, each with its test` : "No pillars yet"}</p>
      </>
    );
  } else if (item.kind === "moves") {
    kind = "Portfolio";
    body = (
      <>
        <p className="mt-3 text-body">{item.moves.length ? "Moved their weights" : "Moved their weights by a point or more"}{item.theses.length ? ` and changed ${item.theses.length === 1 ? "a thesis" : "theses"}: ${item.theses.slice(0, 4).join(", ")}` : ""}.</p>
        {item.moves.length ? (
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {item.moves.slice(0, 8).map((m) => (
              <li key={m.symbol} className="flex items-center justify-between gap-3 rounded-[10px] bg-surface-2 px-3 py-1.5 text-footnote">
                <span className="data font-semibold">{m.symbol}</span>
                <span className={cn("data", m.to === null || (m.from !== null && m.to < m.from) ? "text-text-secondary" : "text-text")}>{moveWords(m)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </>
    );
  } else {
    kind = "Shares their card";
    body = (
      <>
        {item.about ? <p className="mt-3 text-body text-text-secondary">{item.about}</p> : null}
        {item.methodology ? <p className="mt-1 text-caption text-text-tertiary">Invests by {item.methodology}</p> : null}
      </>
    );
  }
  return (
    <article className="card px-4 py-4">
      <Head item={item} today={today} kind={kind} />
      {body}
      {item.chips.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.chips.map((c) => (
            <Chip key={c.symbol} chip={c} link={link} />
          ))}
        </div>
      ) : null}
      <p className="mt-3">
        <Link href={item.href as Route} className="text-subhead text-accent-text">
          {item.kind === "thesis" ? "Read the thesis" : item.kind === "moves" ? "See the portfolio" : "Open the card"}
        </Link>
      </p>
    </article>
  );
}

/** A person in the rail, after Blossom's profiles: avatar, name, handle, what they share and their largest holdings. */
export function PersonCard({ p, you, action, link }: { p: CommunityProfile; you: boolean; action?: ReactNode; link: boolean }) {
  const shares = [p.stocks.length + p.markets.length ? `${p.stocks.length + p.markets.length} ${p.stocks.length + p.markets.length === 1 ? "thesis" : "theses"}` : null, p.weights.length ? `${p.weights.length} holdings` : null].filter(Boolean).join(" · ");
  return (
    <div className="card px-4 py-3">
      <div className="flex items-center gap-3">
        <Link href={`/community/${encodeURIComponent(p.handle)}` as Route} aria-label={`@${p.handle}`}>
          <Avatar name={p.name} handle={p.handle} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/community/${encodeURIComponent(p.handle)}` as Route} className="block truncate font-semibold hover:text-accent-text">
            {p.name}
            {you ? <span className="ml-1.5 text-caption font-normal text-accent-text">You</span> : null}
          </Link>
          <p className="data truncate text-caption text-text-tertiary">
            @{p.handle}
            {shares ? ` · ${shares}` : ""}
          </p>
        </div>
        {action}
      </div>
      {p.about ? <p className="mt-2 text-footnote text-text-secondary">{p.about}</p> : null}
      {p.record ? <RecordLine record={p.record} compact /> : null}
      {p.weights.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {topHoldings(p, 3).map((c) => (
            <Chip key={c.symbol} chip={c} link={link} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A track record the app read from the statement (lib/community.ts,
 * `trackRecordFrom`): the time-weighted return since the first day against
 * SPY over the same days, and the rules kept today; percent alone, marked as
 * read by the app.
 */
export function RecordLine({ record: r, compact = false }: { record: NonNullable<CommunityProfile["record"]>; compact?: boolean }) {
  const lead = r.spyPct === null ? null : r.twrPct - r.spyPct;
  const streak = streakWeeks(r);
  const sign = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
  return (
    <div className={compact ? "mt-2 rounded-control bg-surface-2 px-2.5 py-1.5 text-caption" : "card mt-3 px-4 py-3 text-footnote"}>
      <span className="font-medium">Track record, read by the app</span>
      {badgeOf(r).verified ? <span className="ml-2 rounded-full bg-accent-subtle px-2 py-0.5 text-caption font-medium text-accent-text" title={`A record of a year or more, ${BADGE_MIN_WEEKS} weeks or more without a breach and ${BADGE_MIN_RULES_PCT}% or more of the rules kept, read from the statement`}>Verified analyst</span> : null}
      <span className="data ml-2">{sign(r.twrPct)}%</span>
      {r.spyPct !== null ? <span className="text-text-secondary"> against SPY {sign(r.spyPct)}%{lead !== null ? ` (${sign(lead)} pts)` : ""}</span> : null}
      <span className="text-text-secondary"> since {longDate(r.since)}</span>
      {r.rulesKeptPct !== null ? <span className="text-text-secondary"> · {r.rulesKeptPct}% of {r.rulesMeasured} rules kept today</span> : null}
      {streak !== null ? <span className="text-text-secondary"> · {streak === 0 ? (r.breaches ? `${r.breaches} ${r.breaches === 1 ? "breach" : "breaches"} open` : "no breach, a streak begins") : `${streak} ${streak === 1 ? "week" : "weeks"} without a breach`}</span> : null}
      {compact ? null : <p className="mt-1 text-caption text-text-tertiary">Time-weighted, deposits and withdrawals taken out, from the broker&apos;s statement through {longDate(r.through)}; never typed, never an amount.</p>}
    </div>
  );
}
