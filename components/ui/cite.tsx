import { sectionMark } from "@/lib/cite";
import { cn } from "@/lib/utils";

/** One citation: the rule's section as the methodology writes it, and what it tests beneath. */
export type Citation = { section: string; about?: string | null };

/**
 * The citation margin (Hamza, 4 Nov 2026): from 1024px a verdict card cites
 * the rule it comes from in a narrow column at its right, behind a gilt
 * hairline, like a footnote on a bank statement: "§3.1" in Plex Mono with
 * the figure it tests under it (`sectionMark` in lib/cite.ts); `compact`
 * puts the sections side by side for a one-line card. Below 1024px the
 * margin is not drawn and the card keeps its own inline section (mark that
 * one `cite-inline`, so the laptop shows it once). A card with nothing to
 * cite is drawn as it is.
 */
export function Cited({ cites, children, className, compact = false }: { cites: readonly Citation[]; children: React.ReactNode; className?: string; compact?: boolean }) {
  const shown = cites.filter((c, i) => c.section && cites.findIndex((d) => d.section === c.section) === i);
  if (!shown.length) return <div className={className}>{children}</div>;
  return (
    <div className={cn("cite-row", className)}>
      <div className="min-w-0">{children}</div>
      <aside className="cite-margin" aria-label={`Cites ${shown.map((c) => `section ${c.section}`).join(", ")}`}>
        {compact ? (
          // A one-line card cites its sections side by side, so the margin is never taller than the card.
          <p className="flex flex-wrap gap-x-2">
            {shown.slice(0, 6).map((c) => (
              <span key={c.section} title={c.about ?? undefined}>{sectionMark(c.section)}</span>
            ))}
            {shown.length > 6 ? <span>+{shown.length - 6}</span> : null}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {shown.slice(0, 4).map((c) => (
              <li key={c.section}>
                <span className="block">{sectionMark(c.section)}</span>
                {c.about ? <span className="line-clamp-2 block break-words" title={c.about}>{c.about}</span> : null}
              </li>
            ))}
            {shown.length > 4 ? <li>and {shown.length - 4} more</li> : null}
          </ul>
        )}
      </aside>
    </div>
  );
}
