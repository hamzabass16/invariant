import { FileText, Newspaper, ScrollText } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { DroppedList, FindingCard } from "@/components/agents/finding-card";
import { FreshBadge } from "@/components/ui/freshness";
import { ratingFor, type AgentFeedback } from "@/lib/agents";
import { NEWS_DAYS, NEWS_SHOWN, whenWords, type NewsItem } from "@/lib/company-news";
import type { Fresh } from "@/lib/freshness";
import { DROP_LABEL, droppedOfItem, findingOfItem, type ResearchCache } from "@/lib/research-agent";
import { cn } from "@/lib/utils";

/** The Research Agent's reading of the feed (Hamza, 23 Oct 2026): its findings, and each item marked kept or left out with why. */
export type NewsResearch = { file: ResearchCache; feedback: AgentFeedback | null; editable: boolean; symbols: readonly string[] };
type Mark = { kind: "kept" | "dropped"; label: string } | null;

function markOf(r: NewsResearch | undefined, item: NewsItem): Mark {
  const c = r?.file.companies[item.symbol];
  if (!c) return null;
  const f = findingOfItem(c, item);
  if (f) return { kind: "kept", label: f.bearsOn ? `Bears on ${f.bearsOn}` : "In a finding" };
  const d = droppedOfItem(c, item);
  return d ? { kind: "dropped", label: `Left out: ${DROP_LABEL[d.reason].toLowerCase()}` } : null;
}

function Card({ item, today, held, mark = null }: { item: NewsItem; today: string; held: boolean; mark?: Mark }) {
  const own = item.url.startsWith("/");
  const Icon = item.kind === "news" ? Newspaper : own ? ScrollText : FileText;
  const badge = item.kind === "news" ? "News" : own ? "Results report" : item.form ?? "Filing";
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className={cn("data rounded-md px-1.5 py-0.5 text-caption font-semibold", held ? "bg-accent-subtle text-accent-text" : "bg-surface-2 text-text-secondary")} title={held ? "A holding" : "On your watchlist"}>
          {item.symbol}
        </span>
        <span className={cn("inline-flex items-center gap-1 text-caption", item.kind === "report" ? "text-accent-text" : "text-text-tertiary")}>
          <Icon className="size-3.5" aria-hidden />
          {badge}
        </span>
      </div>
      <p className="mt-2 line-clamp-3 flex-1 text-subhead font-medium text-text">{item.title}</p>
      {mark ? <p className={cn("mt-2 text-caption", mark.kind === "kept" ? "font-medium text-accent-text" : "text-text-tertiary")}>{mark.label}</p> : null}
      <p className="mt-2.5 flex items-center justify-between gap-2 text-caption text-text-tertiary">
        <span className="truncate">{item.source}</span>
        <span className="data shrink-0">{whenWords(item.at, today)}</span>
      </p>
    </>
  );
  const className = cn(
    "group/news flex h-full min-w-0 flex-col rounded-[14px] border bg-surface px-3.5 py-3 transition-[transform,border-color,box-shadow,opacity] duration-150 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.18)]",
    item.kind === "report" || mark?.kind === "kept" ? "border-accent-text/30 hover:border-accent-text/60" : "border-hairline hover:border-text-tertiary/50",
    mark?.kind === "dropped" && "opacity-60 hover:opacity-100",
  );
  return own ? (
    <Link href={item.url as Route} className={className}>
      {body}
    </Link>
  ) : (
    <a href={item.url} target="_blank" rel="noreferrer noopener" className={className}>
      {body}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/**
 * Company news and reports (Hamza, 19 Oct 2026): the past week's headlines,
 * SEC filings and the app's own results reports for the holdings and the
 * watchlist, a grid of cards, the newest first; each opens the article, the
 * filing at the SEC or the report. A source that could not be read is a
 * sentence under the grid, never an empty week.
 */
function NewsGrid({ items, today, held, research }: { items: NewsItem[]; today: string; held: ReadonlySet<string>; research?: NewsResearch }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((i) => (
        <li key={i.url} className="min-w-0">
          <Card item={i} today={today} held={held.has(i.symbol)} mark={markOf(research, i)} />
        </li>
      ))}
    </ul>
  );
}

export function CompanyNews({ items, problems, today, held, companies, fresh, demo, intro, research }: { items: NewsItem[]; problems: string[]; today: string; held: ReadonlySet<string>; companies: number; fresh: Fresh | null; demo: boolean; intro?: string; research?: NewsResearch }) {
  return (
    <section className="mb-8" aria-labelledby="company-news" data-public="">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 id="company-news" className="section-header">
          Company news and reports
        </h2>
        {fresh ? <FreshBadge compact fresh={fresh} /> : null}
      </div>
      <p className="mb-3 px-1 text-footnote text-text-secondary">
        {intro ?? (companies ? `Your holdings and watchlist, ${companies} ${companies === 1 ? "company" : "companies"}, over the past ${NEWS_DAYS} days, the newest first.` : "Your holdings and watchlist appear here once the book or a watchlist record is in.")}
        {demo ? " Fictional in the demo." : ""}
      </p>
      {research ? <AgentFindings research={research} /> : null}
      {items.length ? (
        <>
          <NewsGrid items={items.slice(0, NEWS_SHOWN)} today={today} held={held} research={research} />
          {items.length > NEWS_SHOWN ? (
            <details className="group mt-3" data-news-more>
              <summary className="card flex cursor-pointer list-none items-center justify-center gap-2 px-4 py-2.5 text-subhead font-semibold text-accent-text marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Show all {items.length}</span>
                <span className="hidden group-open:inline">Show fewer</span>
              </summary>
              <div className="mt-3">
                <NewsGrid items={items.slice(NEWS_SHOWN)} today={today} held={held} research={research} />
              </div>
            </details>
          ) : null}
        </>
      ) : companies ? (
        <p className="card px-4 py-3 text-subhead">{problems.length ? "Nothing could be read this time; see below." : `No news or reports for your companies in the past ${NEWS_DAYS} days.`}</p>
      ) : null}
      {problems.length ? (
        <ul className="mt-2 space-y-1 px-1">
          {problems.map((p) => (
            <li key={p} className="text-footnote text-text-secondary">
              {p}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 px-1 text-caption text-text-tertiary">Headlines from Yahoo Finance or Google News, filings from SEC EDGAR. A headline is its writer&rsquo;s, not a verdict on the holding.</p>
    </section>
  );
}

const STANCE_ORDER = { challenges: 0, backs: 1, update: 2 } as const;

/**
 * What the Research Agent found in the feed against the person's theses and
 * methodology (Hamza, 23 Oct 2026): each company's latest findings, the
 * challenges first, each with its pillar, its sources and the rating; then
 * the companies not read yet and everything it left out, with why.
 */
function AgentFindings({ research }: { research: NewsResearch }) {
  const { file, feedback, editable, symbols } = research;
  const read = symbols.filter((s) => file.companies[s]);
  const unread = symbols.filter((s) => !file.companies[s]);
  const findings = read.flatMap((s) => file.companies[s].findings).sort((a, b) => STANCE_ORDER[a.stance] - STANCE_ORDER[b.stance] || b.day.localeCompare(a.day));
  const dropped = read.flatMap((s) => file.companies[s].dropped);
  const failed = read.filter((s) => file.companies[s].failed);
  return (
    <div className="mb-5">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h3 className="text-subhead font-semibold">What bears on your theses{findings.length ? ` · ${findings.length}` : ""}</h3>
        <Link href="/agents/company_news" className="text-footnote text-accent-text">
          How the Research Agent reads this
        </Link>
      </div>
      {findings.length ? (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {findings.map((f) => (
            <FindingCard key={f.id} f={f} agent="company_news" rating={ratingFor(feedback, "company_news", f.id)} editable={editable} showSymbol />
          ))}
        </ul>
      ) : (
        <p className="card px-4 py-3 text-footnote text-text-secondary">{read.length ? "Nothing in the week's news bears on a pillar, a rule or a kill signal of yours." : "The Research Agent has not read your companies yet. It reads them each morning and a few each time the app opens, with the AI."}</p>
      )}
      {unread.length && read.length ? <p className="mt-2 px-1 text-caption text-text-tertiary">Not read by the Research Agent yet: {unread.join(", ")}. A few are read each time the app opens; the morning refresh reads the rest.</p> : null}
      {failed.length ? <p className="mt-1 px-1 text-caption text-text-tertiary">{failed.map((s) => `${s}: ${file.companies[s].sentence}`).join(" ")}</p> : null}
      <DroppedList dropped={dropped} />
    </div>
  );
}
