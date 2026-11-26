import { Info } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { RuleBand, strandsOf } from "@/components/dashboard/rule-band";
import { Cited } from "@/components/ui/cite";
import { sectionMark } from "@/lib/cite";
import { counted, RESONANCE_ABOUT, type Resonance } from "@/lib/resonance";
import { cn } from "@/lib/utils";

/** The line's state: the reading, or what it waits for, said in words (never a zero). */
export type ResonanceState =
  | { kind: "read"; r: Resonance; owedHref: string }
  | { kind: "waits"; words: string; href?: string; action?: string };

/**
 * The verdict first (Hamza, 4 Nov 2026): one line at the very top of the
 * Dashboard, before the year strip. "Resonance 88 · 14 of 16 rules kept ·
 * 2 breaches · 3 decisions owed", each part a link to where it is answered:
 * the rules to Methodology's checks, the decisions to the to-do or
 * Notifications. From 1024px the rules not kept are cited in the margin;
 * on a phone their sections sit under the line.
 */
export function ResonanceLine({ state }: { state: ResonanceState }) {
  const word = (
    <span className="group relative inline-flex items-center gap-1">
      <span className="section-header text-text-secondary">Resonance</span>
      <button type="button" className="inline-flex size-5 items-center justify-center rounded-full text-text-tertiary hover:text-text focus-visible:text-text" aria-label="What Resonance means" aria-describedby="resonance-about">
        <Info className="size-3.5" aria-hidden />
      </button>
      <span id="resonance-about" role="tooltip" className="invisible absolute top-full left-0 z-30 mt-2 w-72 rounded-xl border border-hairline bg-surface-2 px-3 py-2 text-footnote text-text-secondary opacity-0 shadow-[var(--shadow-float)] transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        {RESONANCE_ABOUT}
      </span>
    </span>
  );

  if (state.kind === "waits") {
    return (
      <section aria-label="Resonance" className="mb-6 card flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3" data-tour="resonance">
        {word}
        <span className="text-subhead text-text-secondary">{state.words}</span>
        {state.href && state.action ? (
          <Link href={state.href as Route} className="text-subhead text-accent-text">
            {state.action}
          </Link>
        ) : null}
      </section>
    );
  }

  const { r } = state;
  const checks = "/methodology?view=checks" as Route;
  const parts: { key: string; text: string; href: Route; tone?: string }[] = [];
  if (r.measured) parts.push({ key: "kept", text: `${r.kept} of ${counted(r.measured, "rule", "rules")} kept`, href: checks });
  else parts.push({ key: "kept", text: "No rule the app can measure yet", href: checks });
  if (r.breaches) parts.push({ key: "breaches", text: counted(r.breaches, "breach", "breaches"), href: `${checks}#checks-breach` as Route, tone: "text-danger" });
  if (r.outside) parts.push({ key: "outside", text: `${r.outside} outside guideline`, href: `${checks}#checks-breach` as Route, tone: "text-warn" });
  if (r.tripped) parts.push({ key: "tripped", text: counted(r.tripped, "watch tripped", "watches tripped"), href: `${checks}#checks-watch` as Route, tone: "text-info" });
  if (r.manual) parts.push({ key: "manual", text: `${r.manual} yours to check`, href: `${checks}#checks-manual` as Route });
  if (r.waiting) parts.push({ key: "waiting", text: `${r.waiting} waiting for data`, href: `${checks}#checks-na` as Route });
  parts.push({ key: "owed", text: r.owed ? counted(r.owed, "decision owed", "decisions owed") : "No decision owed", href: state.owedHref as Route, tone: r.owed ? "text-warn" : undefined });

  const cites = r.unkept.map((u) => ({ section: u.section, about: u.text }));
  return (
    <Cited cites={cites} compact className="mb-6">
      <section aria-label="Resonance" className="card px-5 py-4" data-tour="resonance">
        {word}
        {/* One link: the score and the band of every rule beside it (components/dashboard/rule-band.tsx), both to the checks. */}
        {r.score !== null || strandsOf(r).length ? (
          <Link href={checks} className="mt-2 grid items-center gap-x-6 gap-y-3 rounded-control sm:grid-cols-[auto_minmax(0,1fr)]" aria-label={r.score !== null ? `Resonance ${r.score}: ${r.kept} of ${r.measured} rules kept` : "The checks"}>
            {r.score !== null ? (
              <span className="figure-in font-display text-[3rem] leading-none font-medium tracking-[-0.02em] text-text tabular-nums">{r.score}</span>
            ) : null}
            <span className={cn("block min-w-0", r.score === null && "sm:col-span-2")}>
              <RuleBand r={r} className="hidden sm:block" />
              <RuleBand r={r} width={340} className="sm:hidden" />
            </span>
          </Link>
        ) : null}
        <div className={cn(r.score !== null || strandsOf(r).length ? "mt-3 border-t border-hairline pt-3" : "mt-1.5")}>
          <ul className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-subhead sm:gap-x-2">
            {parts.map((p, i) => (
              <li key={p.key} className="inline-flex items-baseline gap-2">
                {/* The dots only from 640px: on a phone the parts wrap, and a line never starts with one. */}
                {i ? <span className="hidden text-text-tertiary sm:inline" aria-hidden>·</span> : null}
                <Link href={p.href} className={cn("hover:underline hover:underline-offset-2", p.tone ?? "text-text-secondary")}>
                  <span className="data">{p.text.match(/^[\d,]+/)?.[0] ?? ""}</span>
                  {p.text.replace(/^[\d,]+/, "")}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {r.unkept.length ? (
          <p className="cite-inline mt-1.5 text-footnote text-text-tertiary">
            Not kept: {r.unkept.slice(0, 4).map((u) => <span key={u.id} className="data mr-2">{sectionMark(u.section)}</span>)}
            {r.unkept.length > 4 ? `and ${r.unkept.length - 4} more` : null}
          </p>
        ) : null}
      </section>
    </Cited>
  );
}
