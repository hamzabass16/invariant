import { ChevronDown } from "lucide-react";

import { pictureGroups, recapParts, type NewsletterImage } from "@/lib/newsletters";

/**
 * A newsletter's own pictures (Hamza, 18 Oct 2026: the StockMKTNewz recap is
 * its screenshots of the day's headlines), each drawn from the newsletter's
 * host at its own size and opened there on a press. The address and the alt
 * text are all the app keeps; no referrer goes with the request.
 */
export function NewsletterImages({ images, sender, className = "", columns = 2 }: { images: readonly NewsletterImage[] | undefined; sender: string; className?: string; columns?: 1 | 2 }) {
  if (!images?.length) return null;
  return (
    <div className={`grid grid-cols-1 gap-2 ${columns === 2 ? "sm:grid-cols-2" : ""} ${className}`}>
      {images.map((im, i) => (
        <a key={im.url} href={im.url} target="_blank" rel="noreferrer noopener" title={im.alt ?? `${sender}, picture ${i + 1}`} className="block overflow-hidden rounded-[10px] bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- the newsletter's own picture from its own host, at whatever size it was sent */}
          <img src={im.url} alt={im.alt ?? `Picture ${i + 1} from ${sender}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="block h-auto w-full" />
        </a>
      ))}
    </div>
  );
}

/**
 * The pictures under the newsletter's own words (its heading or caption
 * before each run of pictures). For a daily recap the opening performance
 * pictures (the heat map, the indices, the movers) are folded away, since
 * the Dashboard draws the session itself, and the day's stories come first
 * (Hamza, 18 Oct 2026).
 */
export function NewsletterPictures({ images, sender, recap = false, className = "" }: { images: readonly NewsletterImage[] | undefined; sender: string; recap?: boolean; className?: string }) {
  if (!images?.length) return null;
  const { lead, stories } = recap ? recapParts(images) : { lead: [], stories: [...images] };
  const groups = pictureGroups(stories);
  return (
    <div className={className}>
      {groups.map((g, i) => (
        <div key={`${g.section ?? ""}-${i}`} className={i ? "mt-4" : ""}>
          {g.section && groups.length > 1 ? <p className="mb-2 text-footnote font-medium text-text-secondary">{g.section}</p> : null}
          <NewsletterImages images={g.images} sender={sender} />
        </div>
      ))}
      {lead.length ? (
        <details className="group/l mt-3 rounded-[10px] bg-surface-2/60">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-footnote text-text-secondary marker:hidden [&::-webkit-details-marker]:hidden">
            <span className="flex-1">
              The day&rsquo;s performance in {lead.length === 1 ? "its picture" : `${lead.length} pictures`} · the Dashboard draws the session itself
            </span>
            <ChevronDown className="size-4 shrink-0 text-text-tertiary transition-transform duration-200 group-open/l:rotate-180" aria-hidden />
          </summary>
          <div className="px-3 pb-3">
            <NewsletterImages images={lead} sender={sender} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
