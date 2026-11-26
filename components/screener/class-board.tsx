import type { Route } from "next";
import Link from "next/link";

import { StatusPill } from "@/components/ui/status";

/** One company on the board, as the page names it (the demo hides a fictional company's symbol). */
export type BoardTile = {
  key: string;
  symbol: string | null;
  name: string;
  /** Sector and market value, in words. */
  sub: string | null;
  href: string | null;
  badge: "Held" | "Watched" | null;
  passes: number;
  of: number;
  needed: number;
  /** For a near miss: the class it is short of, and the first criterion that did not hold. */
  short?: { label: string; color: string; first: string; more: number };
};

export type BoardClass = { id: string; label: string; words: string; color: string; tiles: BoardTile[] };

/** Tiles drawn before Show all. */
const SHOWN = 12;

/** How many of a class's criteria held, as a row of pips: filled for held, the needed count marked by the pip's ring. */
function Pips({ passes, of, needed, color }: { passes: number; of: number; needed: number; color: string }) {
  if (of < 2) return null;
  return (
    <span className="flex items-center gap-[3px]" aria-hidden>
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className="size-[7px] rounded-full" style={i < passes ? { background: color } : { boxShadow: `inset 0 0 0 1px ${i < needed ? color : "var(--hairline-strong)"}` }} />
      ))}
    </span>
  );
}

function Tile({ t, color }: { t: BoardTile; color: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2">
            {t.symbol ? <span className="data text-subhead font-semibold">{t.symbol}</span> : null}
            <span className={`truncate ${t.symbol ? "text-footnote text-text-secondary" : "text-subhead font-semibold"}`}>{t.name}</span>
          </p>
          {t.sub ? <p className="mt-0.5 truncate text-caption text-text-tertiary">{t.sub}</p> : null}
        </div>
        {t.badge ? <StatusPill tone={t.badge === "Held" ? "info" : "neutral"}>{t.badge}</StatusPill> : null}
      </div>
      {t.short ? (
        <p className="mt-2 text-caption text-text-secondary">
          <span className="font-medium" style={{ color: t.short.color }}>
            Short of {t.short.label}:
          </span>{" "}
          {t.short.first}
          {t.short.more ? ` (and ${t.short.more} more)` : ""}
        </p>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <Pips passes={t.passes} of={t.of} needed={t.needed} color={t.short?.color ?? color} />
        <span className="data text-caption text-text-secondary">
          {t.passes} of {t.of}
          {t.needed < t.of ? `, ${t.needed} needed` : ""}
        </span>
      </div>
    </>
  );
  const cls = "block rounded-[12px] border border-hairline bg-surface-2 px-3 py-2.5 transition-colors";
  return t.href ? (
    <Link href={t.href as Route} className={`${cls} hover:border-hairline-strong hover:bg-surface-3`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A grid of company tiles, the first twelve and the rest under Show all. */
export function CompanyTiles({ tiles, color, empty }: { tiles: BoardTile[]; color: string; empty: string }) {
  if (!tiles.length) return <p className="px-1 py-2 text-footnote text-text-secondary">{empty}</p>;
  const grid = "grid gap-2 sm:grid-cols-2 lg:grid-cols-3";
  return (
    <>
      <div className={grid}>
        {tiles.slice(0, SHOWN).map((t) => (
          <Tile key={t.key} t={t} color={color} />
        ))}
      </div>
      {tiles.length > SHOWN ? (
        <details className="group mt-2">
          <summary className="cursor-pointer list-none px-1 py-1.5 text-footnote text-accent-text [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show all {tiles.length}</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <div className={`${grid} mt-1`}>
            {tiles.slice(SHOWN).map((t) => (
              <Tile key={t.key} t={t} color={color} />
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}

/**
 * The person's classes on the S&P 500 and the Nasdaq-100 (Hamza, 23 Oct 2026:
 * "more visually appealing"): first the whole list in one bar, each class its
 * hue and count, then the companies one criterion short and the rest; then
 * each class as a card in its hue with its test in words and its companies as
 * tiles, the largest first, each tile's pips the criteria that held.
 */
export function ClassBoard({ classes, near, read }: { classes: BoardClass[]; near: BoardTile[]; read: number }) {
  const placed = classes.reduce((n, c) => n + c.tiles.length, 0);
  const rest = Math.max(0, read - placed - near.length);
  const parts = [
    ...classes.map((c) => ({ key: c.id, label: c.label, n: c.tiles.length, color: c.color, href: `#class-${c.id}` })),
    ...(near.length ? [{ key: "near", label: "One criterion short", n: near.length, color: "var(--text-tertiary)", href: "#class-near" }] : []),
  ];
  return (
    <>
      <section className="card mb-6 px-4 py-4" aria-label="Where the companies fall">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${parts.map((p) => `${p.label} ${p.n}`).join(", ")}, ${rest} in no class, of ${read} read`}>
          {parts.map((p) =>
            p.n ? <span key={p.key} className="h-full border-r-2 border-surface last:border-r-0" style={{ width: `${(p.n / Math.max(1, read)) * 100}%`, background: p.key === "near" ? `repeating-linear-gradient(135deg, ${p.color} 0 3px, transparent 3px 6px)` : p.color }} /> : null,
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {parts.map((p) => (
            <a key={p.key} href={p.href} className="rounded-[10px] px-2 py-1.5 hover:bg-surface-2">
              <span className="flex items-center gap-1.5 text-caption text-text-secondary">
                <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: p.key === "near" ? `repeating-linear-gradient(135deg, ${p.color} 0 2px, transparent 2px 4px)` : p.color }} />
                <span className="truncate">{p.label}</span>
              </span>
              <span className="data mt-0.5 block text-title3 font-semibold">{p.n}</span>
            </a>
          ))}
          <div className="px-2 py-1.5">
            <span className="flex items-center gap-1.5 text-caption text-text-secondary">
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px] bg-surface-3" />
              In no class
            </span>
            <span className="data mt-0.5 block text-title3 font-semibold text-text-secondary">{rest}</span>
          </div>
        </div>
      </section>
      {classes.map((c) => (
        <section key={c.id} id={`class-${c.id}`} className="card mb-6 scroll-mt-24 overflow-hidden" aria-labelledby={`class-${c.id}-title`}>
          <div className="border-l-4 px-4 pb-4 pt-3" style={{ borderColor: c.color }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`class-${c.id}-title`} className="section-header" style={{ color: c.color }}>
                {c.label}
              </h2>
              <span className="data text-footnote text-text-secondary">
                {c.tiles.length} {c.tiles.length === 1 ? "company" : "companies"}
              </span>
            </div>
            <p className="mb-3 mt-1 text-caption text-text-tertiary">{c.words}</p>
            <CompanyTiles tiles={c.tiles} color={c.color} empty="No company on file passes this class yet." />
          </div>
        </section>
      ))}
      {near.length ? (
        <section id="class-near" className="card mb-6 scroll-mt-24 px-4 pb-4 pt-3" aria-labelledby="class-near-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="class-near-title" className="section-header text-text-secondary">
              One criterion short
            </h2>
            <span className="data text-footnote text-text-secondary">{near.length}</span>
          </div>
          <p className="mb-3 mt-1 text-caption text-text-tertiary">Every required filter holds, and one more criterion would place it in the class named.</p>
          <CompanyTiles tiles={near} color="var(--text-tertiary)" empty="" />
        </section>
      ) : null}
    </>
  );
}
