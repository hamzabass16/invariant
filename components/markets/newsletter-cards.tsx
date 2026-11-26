"use client";

import { ChevronDown, Cpu, Globe, Landmark, Layers, Newspaper, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { markNewsletterReadAction } from "@/app/(app)/newsletters/actions";
import { quietly } from "@/components/app/reach";
import { chevron, summaryRow } from "@/components/markets/disclosure";
import { NewsletterImages, NewsletterPictures } from "@/components/newsletters/newsletter-images";
import { recapNewslettersFor } from "@/lib/market-recap";
import { byTheme, rankDigests, unplacedStories, unreadOf, digestDate, type Digest, type NewsletterImage, type NewsletterTopic, type RankedDigest, type Theme } from "@/lib/newsletters";
import { localTime, longDate, shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const ICON: Record<NewsletterTopic, LucideIcon> = { holdings: Layers, macro: Landmark, tech: Cpu, geopolitics: Globe, other: Newspaper };


/** The holdings a newsletter or a theme touches, as chips, the heaviest first. */
function Chips({ symbols, max = 5 }: { symbols: readonly string[]; max?: number }) {
  if (!symbols.length) return null;
  const shown = symbols.slice(0, max);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((s) => (
        <span key={s} className="data rounded-full bg-accent-subtle px-1.5 py-px text-[11px] leading-4 text-accent-text">
          {s}
        </span>
      ))}
      {symbols.length > shown.length ? <span className="data text-[11px] text-text-tertiary">+{symbols.length - shown.length}</span> : null}
    </span>
  );
}

/** What a newsletter or a theme bears on, in a few words: the holdings' share of the book and the theses among them. */
function touchLine(touched: readonly string[], share: number, theses: number): string {
  if (!touched.length) return "Touches none of your holdings";
  const parts = [`${Math.round(share)}% of the book`];
  if (theses) parts.push(`${theses} ${theses === 1 ? "thesis" : "theses"}`);
  return parts.join(" · ");
}

const timeOf = (iso: string) => localTime(iso);

/** A teal dot: not opened yet. */
function UnreadDot({ className = "" }: { className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full bg-accent", className)} aria-label="Unread" title="Not opened yet" />;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Which newsletters the person has opened: the ids kept in their preferences
 * plus those opened on this page, written back as each is opened (the demo
 * keeps them in the page alone). One mark per newsletter, never twice.
 */
function useReadMarks(readIds: readonly string[], demo: boolean) {
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const [, start] = useTransition();
  const read = useMemo(() => new Set([...readIds, ...opened]), [readIds, opened]);
  const mark = useCallback(
    (id: string) => {
      setOpened((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      if (!demo && !readIds.includes(id)) start(() => void quietly(() => markNewsletterReadAction(id)));
    },
    [demo, readIds],
  );
  return { read, mark };
}

/** One newsletter inside its theme: the sender, the subject and what it touches on the row; the summary, the points and the pictures when opened. Opening it marks it read. */
function DigestCard({ r, rank, open, unread, mark }: { r: RankedDigest; rank: number | null; open: boolean; unread: boolean; mark: (id: string) => void }) {
  const d = r.digest;
  const reading = d.reading!;
  const at = digestDate(d);
  return (
    <details className="group/d border-t border-hairline" open={open} onToggle={(e) => e.currentTarget.open && unread && mark(d.id)}>
      <summary className={summaryRow}>
        {rank === null ? null : <span className="data inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] text-text-secondary">{rank}</span>}
        <span className="min-w-0 flex-1">
          <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <span className="flex min-w-0 items-center gap-2">
              {unread ? <UnreadDot /> : null}
              <span className={cn("truncate text-body", unread ? "font-semibold" : "font-medium")}>{d.sender}</span>
            </span>
            <span className="data shrink-0 text-footnote text-text-tertiary">
              {shortDate(at.slice(0, 10))} {timeOf(at)}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-text-secondary">
            <span className="min-w-0 truncate">{d.subject || "No subject"}</span>
            <Chips symbols={r.touched} max={4} />
            {picturesShown(d) ? <span className="data text-text-tertiary">{plural(picturesShown(d), "picture")}</span> : null}
          </span>
        </span>
        <ChevronDown className={`${chevron} group-open/d:rotate-180`} aria-hidden />
      </summary>
      <div className={cn("px-4 pb-4", rank === null ? "" : "pl-[3.25rem]")}>
        <p className="text-subhead">{reading.summary}</p>
        {r.touched.length ? <p className="mt-1 text-footnote text-text-secondary">{touchLine(r.touched, r.share, r.theses)}</p> : null}
        <PointsWithPictures digest={d} />
      </div>
    </details>
  );
}

/** A theme: closed until pressed, its row saying how many newsletters, how many unread and which holdings they touch. Opening it opens, and marks read, its first newsletter. */
function ThemeCard({ theme, rank, read, mark }: { theme: Theme; rank: number; read: ReadonlySet<string>; mark: (id: string) => void }) {
  const Icon = ICON[theme.topic];
  const n = theme.digests.length;
  const unread = theme.digests.filter((r) => !read.has(r.digest.id)).length;
  return (
    <details className="group border-t border-hairline" onToggle={(e) => e.currentTarget.open && !read.has(theme.digests[0].digest.id) && mark(theme.digests[0].digest.id)}>
      <summary className={summaryRow}>
        <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-subtle text-accent-text">
          <Icon size={18} aria-hidden />
          {unread ? <UnreadDot className="absolute -top-0.5 -right-0.5 ring-2 ring-surface" /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <span className="text-body font-medium">{theme.label}</span>
            <span className="data shrink-0 text-footnote text-text-secondary">
              {plural(n, "newsletter")}
              {unread ? ` · ${unread} unread` : ""}
              {theme.images ? ` · ${plural(theme.images, "picture")}` : ""}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-text-secondary">
            <span>{rank === 1 && theme.touched.length ? `Bears most on your theses · ${touchLine(theme.touched, theme.share, theme.theses)}` : touchLine(theme.touched, theme.share, theme.theses)}</span>
            <Chips symbols={theme.touched} />
          </span>
        </span>
        <ChevronDown className={chevron} aria-hidden />
      </summary>
      <div className="bg-surface-2/40">
        {theme.digests.map((r, i) => (
          <DigestCard key={r.digest.id} r={r} rank={i + 1} open={i === 0} unread={!read.has(r.digest.id)} mark={mark} />
        ))}
      </div>
    </details>
  );
}

export type NewsletterSpan = "week" | "day";

/**
 * The week's newsletters by theme, or the day's on the switch (Hamza, 18 Oct
 * 2026: the week by default, since newsletters do not come every day; each
 * theme ranked by how close it is to the theses, then the newest; a
 * newsletter not opened yet marked unread). `week` and `day` are the digests
 * of each span, the daily recap left to its own section.
 */
export function ThemedNewsletters({ week, day, weights, theses, readIds, demo, session, since }: { week: Digest[]; day: Digest[]; weights: Record<string, number>; theses: readonly string[]; readIds: readonly string[]; demo: boolean; session: string | null; since: "close" | "latest" }) {
  const [span, setSpan] = useState<NewsletterSpan>("week");
  const { read, mark } = useReadMarks(readIds, demo);
  const withThesis = new Set(theses);
  const digests = span === "week" ? week : day;
  const ranked = rankDigests(digests, weights, withThesis);
  const themes = byTheme(ranked, weights, withThesis);
  const unread = unreadOf(ranked.map((r) => r.digest), [...read]).length;
  const touchedAll = new Set(ranked.flatMap((r) => r.touched));
  const weekUnread = unreadOf(week, [...read]).length;
  const dayUnread = unreadOf(day, [...read]).length;
  const meta = ranked.length ? [plural(ranked.length, "newsletter"), unread ? `${unread} unread` : null, touchedAll.size ? `${plural(touchedAll.size, "holding")} touched` : null].filter(Boolean).join(" · ") : null;
  const spanLabel = span === "week" ? "the last seven days" : since === "close" && session ? `since the close of ${longDate(session)}` : "the latest day";
  return (
    <div>
      <div className="flex flex-col gap-2 border-b border-hairline px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Newsletters from" className="inline-flex self-start rounded-[10px] bg-surface-2 p-0.5">
          {(["week", "day"] as const).map((s) => {
            const n = s === "week" ? weekUnread : dayUnread;
            return (
              <button key={s} type="button" role="tab" aria-selected={span === s} onClick={() => setSpan(s)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-subhead transition-colors", span === s ? "bg-surface text-text shadow-sm" : "text-text-secondary")}>
                {s === "week" ? "This week" : "Today"}
                {n ? <span className="data rounded-full bg-accent-subtle px-1.5 text-[11px] leading-4 text-accent-text">{n}</span> : null}
              </button>
            );
          })}
        </div>
        <p className="data text-footnote text-text-tertiary">{meta ?? `None ${spanLabel}`}</p>
      </div>
      {themes.length ? (
        <div className="[&>details:first-child]:border-t-0">
          {themes.map((t, i) => (
            <ThemeCard key={t.topic} theme={t} rank={i + 1} read={read} mark={mark} />
          ))}
        </div>
      ) : (
        <div className="px-4 py-3">
          <p className="text-subhead">{span === "week" ? "No newsletter forwarded in the last seven days." : `No newsletter ${spanLabel}.`}</p>
          <p className="mt-1 text-footnote text-text-secondary">{span === "week" ? "Each one you forward is read with the AI into a digest with its pictures, filed under a theme and ranked by how much it bears on your theses." : week.length ? "The week's are under This week." : "Each one you forward is read with the AI into a digest with its pictures."}</p>
        </div>
      )}
    </div>
  );
}

/** The pictures a digest draws: the ones its reading placed, else all it kept (a digest read before 19 Oct 2026). */
function picturesShown(d: Digest, recap = false): number {
  if (!d.images?.length) return 0;
  if (!d.reading?.placed) return d.images.length;
  const placed = d.reading.points.reduce((n, p) => n + (p.images ?? []).filter((i) => i < d.images!.length).length, 0);
  return placed + (recap ? unplacedStories(d.images, d.reading.points).length : 0);
}

/** The recap's other story pictures, under its points, so none of the day's screenshots is hidden. */
function OtherStories({ images, sender }: { images: NewsletterImage[]; sender: string }) {
  if (!images.length) return null;
  return (
    <div className="mt-5">
      <p className="mb-2 text-footnote font-medium text-text-secondary">More from the issue · {plural(images.length, "picture")}</p>
      <NewsletterPictures images={images} sender={sender} />
    </div>
  );
}

/**
 * A digest's points, each with the pictures the person's model placed under
 * it (Hamza, 19 Oct 2026: not every picture, the ads left out, each where it
 * belongs). A digest read before that keeps its pictures under the points as
 * one run, grouped by the newsletter's own headings.
 */
function PointsWithPictures({ digest: d, recap = false }: { digest: Digest; recap?: boolean }) {
  const reading = d.reading!;
  const placed = !!reading.placed;
  const pictures = d.images ?? [];
  return (
    <>
      {reading.points.length ? (
        <ul className={cn("mt-3 text-subhead", placed && pictures.length ? "space-y-4" : "space-y-2")}>
          {reading.points.map((p, i) => {
            const own = placed ? (p.images ?? []).map((n) => pictures[n]).filter((im): im is NonNullable<typeof im> => !!im) : [];
            return (
              <li key={i} className="flex gap-2">
                <span className="mt-[0.55rem] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span>
                    <b className="font-medium">{p.headline}.</b> {p.line} <Chips symbols={p.symbols} />
                  </span>
                  {own.length ? <NewsletterImages images={own} sender={d.sender} columns={own.length > 1 ? 2 : 1} className={cn("mt-2", own.length === 1 ? "max-w-xl" : "")} /> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {placed ? null : <NewsletterPictures images={d.images} sender={d.sender} recap={recap} className={recap ? "mt-4" : "mt-3"} />}
      {placed && recap ? <OtherStories images={unplacedStories(pictures, reading.points)} sender={d.sender} /> : null}
    </>
  );
}

/**
 * The day's recap newsletter (Hamza, 18 Oct 2026: the StockMKTNewz Daily
 * Recap, its screenshots of the day's stories first, the opening performance
 * pictures folded away since the Dashboard draws the session): open from the
 * start, so showing it marks it read. The week's earlier recaps sit under a
 * closed row.
 */
export function RecapNewsletter({ today, earlier, weights, theses, readIds, demo }: { today: Digest; earlier: Digest[]; weights: Record<string, number>; theses: readonly string[]; readIds: readonly string[]; demo: boolean }) {
  const { read, mark } = useReadMarks(readIds, demo);
  const withThesis = new Set(theses);
  const [r] = rankDigests([today], weights, withThesis);
  const earlierRanked = rankDigests(earlier, weights, withThesis).sort((a, b) => digestDate(b.digest).localeCompare(digestDate(a.digest)));
  const unreadEarlier = earlierRanked.filter((x) => !read.has(x.digest.id)).length;
  useEffect(() => {
    if (!read.has(today.id)) mark(today.id);
    // Shown open, so it is read once it is on the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today.id]);
  const reading = today.reading!;
  const at = digestDate(today);
  const pictures = picturesShown(today, true);
  // A known recap carries its writer's name and sign-up page however it came (Hamza, 18 and 20 Oct 2026: the source is always named and linked).
  const known = recapNewslettersFor(demo).find((n) => new RegExp(n.id, "i").test(`${today.sender} ${today.subject}`));
  const signUp = known ? { by: known.by, url: known.signUp } : null;
  return (
    <>
      <div className="px-4 pt-3 pb-4">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <p className="text-body font-medium">{today.sender}</p>
          <p className="data shrink-0 text-footnote text-text-tertiary">
            {shortDate(at.slice(0, 10))} {timeOf(at)}
            {pictures ? ` · ${plural(pictures, "picture")}` : ""}
          </p>
        </div>
        <p className="mt-0.5 text-footnote text-text-secondary">
          {today.subject || "No subject"}
          {signUp ? (
            <>
              {" · "}by {signUp.by};{" "}
              <a href={signUp.url} target="_blank" rel="noreferrer" className="text-accent-text underline underline-offset-2">
                subscribe
              </a>
            </>
          ) : null}
        </p>
        <p className="mt-2 text-subhead">{reading.summary}</p>
        {r?.touched.length ? <p className="mt-1 text-footnote text-text-secondary">{touchLine(r.touched, r.share, r.theses)}</p> : null}
        <PointsWithPictures digest={today} recap />
      </div>
      {earlierRanked.length ? (
        <details className="group border-t border-hairline">
          <summary className={summaryRow}>
            <span className="min-w-0 flex-1">
              <span className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                <span className="flex items-center gap-2 text-body font-medium">
                  {unreadEarlier ? <UnreadDot /> : null}
                  Earlier this week
                </span>
                <span className="data shrink-0 text-footnote text-text-secondary">
                  {plural(earlierRanked.length, "recap")}
                  {unreadEarlier ? ` · ${unreadEarlier} unread` : ""}
                </span>
              </span>
              <span className="mt-0.5 block text-footnote text-text-secondary">{earlierRanked.map((x) => shortDate(digestDate(x.digest).slice(0, 10))).join(", ")}</span>
            </span>
            <ChevronDown className={chevron} aria-hidden />
          </summary>
          <div className="bg-surface-2/40">
            {earlierRanked.map((x) => (
              <DigestCard key={x.digest.id} r={x} rank={null} open={false} unread={!read.has(x.digest.id)} mark={mark} />
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}
