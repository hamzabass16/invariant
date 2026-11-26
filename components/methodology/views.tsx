import { AlertTriangle, Binoculars, CheckCircle2, CircleDashed, ClipboardCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { CopyButton } from "@/components/app/copy-button";
import { RemoveButton } from "@/components/methodology/builder";
import { Cited, type Citation } from "@/components/ui/cite";
import { StatusPill } from "@/components/ui/status";
import type { Book } from "@/lib/holdings";
import { classWaiting, computeFigure, contextFor, figureLinks, testedAs, type Finding, type Methodology } from "@/lib/methodology";
import { PANELS } from "@/lib/ontology";
import { criterionLabel, exprWords, formatUnit } from "@/lib/recipes";
import type { InputId } from "@/lib/setup";
import { cn } from "@/lib/utils";

/**
 * The Methodology screen's views, one at a time behind tabs: the checks
 * grouped by what they need from you, the classes as cards with their tests
 * and holdings, the rules grouped by section, the figures as tiles with
 * their links, the dashboard's shape and the gaps. Every element still cites
 * its section; in the builder each can be removed.
 */

export const VIEWS = ["checks", "evaluation", "shadow", "classes", "rules", "figures", "layout", "versions", "gaps"] as const;
export type View = (typeof VIEWS)[number];
const VIEW_LABEL: Record<View, string> = { checks: "Checks", evaluation: "Evaluation", shadow: "Shadow", versions: "Versions", classes: "Classes", rules: "Rules", figures: "Figures", layout: "Dashboard", gaps: "Gaps" };

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A segmented control of the views, each with its count; a link per view so the back button works. */
export function ViewTabs({ current, counts, base }: { current: View; counts: Partial<Record<View, number | null>>; base: string }) {
  const views = VIEWS.filter((v) => counts[v] !== undefined && (v !== "gaps" || (counts.gaps ?? 0) > 0));
  return (
    <nav aria-label="Parts of the methodology" className="-mx-4 mb-6 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <ul className="inline-flex min-w-max gap-1 rounded-xl bg-surface-2 p-1">
        {views.map((v) => (
          <li key={v}>
            <Link
              href={`${base}${base.includes("?") ? "&" : "?"}view=${v}` as Route}
              scroll={false}
              aria-current={v === current ? "page" : undefined}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-subhead transition-colors", v === current ? "bg-surface text-text shadow-[0_1px_0_var(--edge)_inset] font-medium" : "text-text-secondary hover:text-text")}
            >
              {VIEW_LABEL[v]}
              {counts[v] !== null ? <span className={cn("data text-caption", v === current ? "text-accent-text" : "text-text-tertiary")}>{counts[v]}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** One number with its label, for the summary rows. */
export function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "danger" | "warn" | "ok" | "info" | "accent" }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <p className={cn("data text-title-2 font-semibold", tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : tone === "info" ? "text-info" : tone === "accent" ? "text-accent-text" : "text-text")}>{value}</p>
      <p className="text-caption text-text-tertiary">{label}</p>
    </div>
  );
}

function Section({ s, className }: { s: string; className?: string }) {
  return <span className={cn("data inline-flex h-6 shrink-0 items-center rounded-md border border-hairline-strong px-1.5 text-caption text-text-secondary", className)}>{s}</span>;
}

/** What a finding's margin cites: its section and the figure it tests (components/ui/cite.tsx). */
const citeOf = (f: Finding): Citation[] => [{ section: f.rule.section, about: f.figure?.label ?? (f.status === "manual" ? "Checked by you" : null) }];

function Chip({ children, tone }: { children: React.ReactNode; tone?: "accent" | "muted" | "warn" }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-caption", tone === "accent" ? "bg-accent-subtle text-accent-text" : tone === "warn" ? "bg-warn/15 text-warn" : "bg-surface-3 text-text-secondary")}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Checks

type Group = { id: string; title: string; about: string; icon: LucideIcon; tone: string; bar: string; match: (f: Finding) => boolean };

const GROUPS: Group[] = [
  { id: "breach", title: "Broken", about: "A hard limit or a guideline the book is outside of.", icon: AlertTriangle, tone: "text-danger", bar: "bg-danger", match: (f) => f.status === "fail" && f.rule.severity !== "watch" },
  { id: "watch", title: "Tripped or near", about: "A level you asked to be told about, or a limit the book is close to.", icon: Binoculars, tone: "text-info", bar: "bg-info", match: (f) => (f.status === "fail" && f.rule.severity === "watch") || f.status === "near" },
  { id: "pass", title: "Within", about: "Tested on your figures and holding.", icon: CheckCircle2, tone: "text-ok", bar: "bg-ok", match: (f) => f.status === "pass" },
  { id: "manual", title: "Yours to check", about: "The app cannot measure these from your data, so it never shows them as passing.", icon: ClipboardCheck, tone: "text-accent-text", bar: "bg-accent", match: (f) => f.status === "manual" },
  { id: "na", title: "Waiting for data", about: "Measurable once an input supplies what they read.", icon: CircleDashed, tone: "text-text-tertiary", bar: "bg-hairline-strong", match: (f) => f.status === "n/a" },
];

function pill(f: Finding) {
  if (f.status === "fail") return f.rule.severity === "breach" ? <StatusPill tone="danger">Breach</StatusPill> : f.rule.severity === "watch" ? <StatusPill tone="info">Watch tripped</StatusPill> : <StatusPill tone="warn">Outside guideline</StatusPill>;
  if (f.status === "near") return <StatusPill tone="info">Near limit</StatusPill>;
  if (f.status === "pass") return <StatusPill tone="ok">{f.rule.severity === "watch" ? "Watching" : "Within"}</StatusPill>;
  if (f.status === "manual") return <StatusPill tone="neutral">Yours to check</StatusPill>;
  return <StatusPill tone="neutral">{f.needs.length ? "Needs data" : "Not yet"}</StatusPill>;
}

/** The checks: a count per group, then each group as a card, the worst first; the rule's own words lead, the figure and the reading follow. */
export function ChecksView({ findings, m, ccy }: { findings: Finding[]; m: Methodology; ccy: string }) {
  const groups = GROUPS.map((g) => ({ g, rows: findings.filter(g.match) }));
  return (
    <div data-view="checks">
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {groups.map(({ g, rows }) => (
          <Stat key={g.id} label={g.title} value={rows.length} tone={rows.length ? (g.id === "breach" ? "danger" : g.id === "watch" ? "info" : g.id === "pass" ? "ok" : g.id === "manual" ? "accent" : undefined) : undefined} />
        ))}
      </div>
      {groups
        .filter(({ rows }) => rows.length)
        .map(({ g, rows }) => (
          <section key={g.id} className="mb-8" aria-labelledby={`checks-${g.id}`}>
            <div className="mb-2 flex items-center gap-2 px-1">
              <g.icon className={cn("size-4", g.tone)} aria-hidden />
              <h2 id={`checks-${g.id}`} className="section-header scroll-mt-24">
                {g.title} · {rows.length}
              </h2>
            </div>
            <p className="mb-3 px-1 text-footnote text-text-tertiary">{g.about}</p>
            {g.id === "manual" ? (
              // Cards in two columns with the accent, so a long list reads as items, not a block (Hamza, 15 Oct 2026).
              <ul className="grid gap-2 lg:grid-cols-2">
                {rows.map((f) => (
                  <li key={f.rule.id} id={`rule-${f.rule.id}`} className="scroll-mt-24">
                    <Cited cites={citeOf(f)} className="h-full">
                      <div className="relative h-full overflow-hidden card py-3 pr-4 pl-5">
                        <span className={cn("absolute inset-y-0 left-0 w-1", g.bar)} aria-hidden />
                        <div className="flex items-center justify-between gap-3">
                          <Section s={f.rule.section} className="cite-inline" />
                          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-accent-subtle px-2 py-0.5 text-caption font-medium text-accent-text">
                            <ClipboardCheck className="size-3.5" aria-hidden /> By hand
                          </span>
                        </div>
                        <p className="mt-2 text-subhead">{f.rule.text}</p>
                      </div>
                    </Cited>
                  </li>
                ))}
              </ul>
            ) : g.id === "na" ? (
              <ul className="overflow-hidden card">
                {rows.map((f) => (
                  <li key={f.rule.id} id={`rule-${f.rule.id}`} className="scroll-mt-24 border-b border-hairline px-4 py-3 last:border-0">
                    <Cited cites={citeOf(f)}>
                      <Section s={f.rule.section} className="cite-inline" />
                      <p className="mt-1.5 text-subhead lg:mt-0">{f.rule.text}</p>
                      {f.detail ? <p className="mt-1 text-footnote text-warn">{f.detail}</p> : null}
                    </Cited>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-2">
                {rows.map((f) => (
                  <li key={f.rule.id} id={`rule-${f.rule.id}`} className="scroll-mt-24">
                   <Cited cites={citeOf(f)}>
                   <div className="relative overflow-hidden card py-3 pr-4 pl-5">
                    <span className={cn("absolute inset-y-0 left-0 w-1", g.bar)} aria-hidden />
                    <div className="flex items-center justify-between gap-3">
                      <Section s={f.rule.section} className="cite-inline" />
                      <span className="ml-auto">{pill(f)}</span>
                    </div>
                    <p className="mt-2 text-subhead">{f.rule.text}</p>
                    {f.actual !== null ? (
                      <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                        <span className="text-footnote text-text-tertiary">
                          Now <span className="data text-body font-semibold text-text">{f.actual}</span>
                        </span>
                        {f.limit ? (
                          <span className="text-footnote text-text-tertiary">
                            Limit <span className="data text-body text-text-secondary">{f.limit}</span>
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <p className="mt-1 text-footnote text-text-tertiary">{testedAs(f.rule, m, ccy)}.</p>
                    {f.offenders.length ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {f.offenders.slice(0, 8).map((o) => (
                          <Chip key={o.key} tone={g.id === "breach" ? "warn" : undefined}>
                            {o.label} <span className="data ml-1">{o.value}</span>
                          </Chip>
                        ))}
                      </div>
                    ) : null}
                   </div>
                   </Cited>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Classes

/** Each class as a card: what it is, the gate, the tests with how many must hold, and the holdings its tests place in it now. */
export function ClassesView({ m, book, today, inputs, editable }: { m: Methodology; book: Book | null; today: string; inputs: readonly InputId[]; editable: boolean }) {
  const ctx = book ? contextFor(book, today, m) : null;
  return (
    <div className="pair-grid grid gap-4 lg:grid-cols-2" data-view="classes">
      {m.classes.map((c, i) => {
        const members = ctx ? ctx.book.holdings.filter((h) => ctx.classOf(h) === c.id) : [];
        const waiting = classWaiting(c, inputs, ctx?.supplied);
        const need = c.minimum !== undefined && c.minimum < c.criteria.length ? `${c.minimum} of ${c.criteria.length} must hold` : c.minimumShare !== undefined ? `${c.minimumShare}% of those measurable must hold` : `All ${c.criteria.length} must hold`;
        return (
          <article key={c.id} className="flex flex-col card px-4 py-4">
            <div className="flex items-start gap-3">
              <span className="data flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-subtle text-subhead font-semibold text-accent-text" aria-hidden>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-title-3 font-semibold">{c.label}</h3>
                {c.about ? <p className="mt-0.5 text-footnote text-text-secondary">{c.about}</p> : null}
              </div>
              {editable ? <RemoveButton id={c.id} label={c.label} /> : null}
            </div>
            {c.required?.length ? (
              <div className="mt-4">
                <p className="mb-1.5 text-caption text-text-tertiary">First, every one of these</p>
                <ul className="space-y-1">
                  {c.required.map((cr, j) => (
                    <li key={j} className="flex items-start gap-2 text-footnote">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                      {capital(criterionLabel(cr))}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-4">
              <p className="mb-1.5 text-caption text-text-tertiary">Then the tests · {need}</p>
              <ol className="space-y-1">
                {c.criteria.map((cr, j) => (
                  <li key={j} className="flex items-start gap-2 text-footnote">
                    <span className="data mt-px w-4 shrink-0 text-text-tertiary">{j + 1}</span>
                    {capital(criterionLabel(cr))}
                  </li>
                ))}
              </ol>
            </div>
            {waiting ? <p className="mt-3 text-footnote text-warn">{waiting}</p> : null}
            <div className="mt-auto border-t border-hairline pt-3">
              <p className="mb-1.5 text-caption text-text-tertiary">{ctx ? `In it now · ${members.length}` : "Holdings appear here once figures arrive"}</p>
              {members.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {members.map((h) => (
                    <Chip key={h.id} tone="accent">
                      {h.symbol}
                    </Chip>
                  ))}
                </div>
              ) : ctx ? (
                <p className="text-footnote text-text-tertiary">None of your holdings passes its tests today.</p>
              ) : null}
            </div>
          </article>
        );
      })}
      <p className="px-1 text-footnote text-text-tertiary lg:col-span-2">A holding is in the first class whose test holds: every required filter, then the criteria in at least the number the class asks for. A criterion with no reading does not hold.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rules

/** The rules grouped by the first part of their section, each with its kind, how the app tests it and the figure it reads. */
export function RulesView({ m, ccy, editable }: { m: Methodology; ccy: string; editable: boolean }) {
  const groups = new Map<string, typeof m.rules>();
  for (const r of m.rules) {
    // A numbered section groups by its first part (3.1 under 3, D.1(c) under D); a section the methodology names ("Section 0", "Section 2 summary") is its own group, headed as written.
    const head = /^\d/.test(r.section) ? r.section.split(".")[0] : /^[A-Za-z]{3,}/.test(r.section) ? r.section : (r.section.match(/^[A-Za-z]+/)?.[0] ?? r.section.split(" ")[0]);
    groups.set(head, [...(groups.get(head) ?? []), r]);
  }
  const tested = m.rules.filter((r) => r.test).length;
  return (
    <div data-view="rules">
      <div className="mb-6 grid grid-cols-3 gap-2">
        <Stat label="Rules" value={m.rules.length} />
        <Stat label="The app tests" value={tested} tone="ok" />
        <Stat label="Yours to check" value={m.rules.length - tested} />
      </div>
      {[...groups.entries()].map(([head, rules]) => (
        <section key={head} className="mb-6">
          <h2 className="section-header mb-2 px-1">{/^[A-Za-z]{3,}/.test(head) ? head : `Section ${head}`}</h2>
          <ul className="overflow-hidden card">
            {rules.map((r) => {
              const figure = r.test ? m.figures.find((f) => f.id === r.test!.figure) : null;
              return (
                <li key={r.id} id={`rule-${r.id}`} className="flex scroll-mt-24 items-start gap-3 border-b border-hairline px-4 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-subhead">{r.text}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Section s={r.section} />
                      <StatusPill tone={r.severity === "breach" ? "danger" : r.severity === "watch" ? "info" : "neutral"}>{r.severity === "breach" ? "Hard limit" : r.severity === "watch" ? "Alert level" : "Guideline"}</StatusPill>
                      {figure ? <Chip tone="accent">Tests {figure.label}</Chip> : <Chip>Yours to check</Chip>}
                    </div>
                    {r.test ? <p className="mt-1.5 text-footnote text-text-tertiary">{testedAs(r, m, ccy)}.</p> : null}
                  </div>
                  {editable ? <RemoveButton id={r.id} label={r.text} /> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Figures

const VIEW_WORD = { tile: "Tile", bars: "Bars", line: "Line", donut: "Donut", table: "Table" } as const;

/** Each figure as a tile: its value now, the recipe in words, then its links as chips. */
export function FiguresView({ m, book, today, inputs, editable }: { m: Methodology; book: Book | null; today: string; inputs: readonly InputId[]; editable: boolean }) {
  const ccy = book?.fx.base ?? "USD";
  const ctx = book ? contextFor(book, today, m) : null;
  const headline = new Set(m.dashboard.headline);
  return (
    <div className="pair-grid-sm trio-grid grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-view="figures">
      {m.figures.map((f) => {
        const r = ctx ? computeFigure(f, ctx, inputs) : null;
        const now = r && r.kind === "scalar" && !r.needs.length ? formatUnit(r.value, f.unit, ccy) : r && r.kind === "series" && !r.needs.length ? `${r.points.length} ${f.by ?? "group"}${r.points.length === 1 ? "" : "s"}` : null;
        const l = figureLinks(m, f, inputs);
        return (
          <article key={f.id} className="flex flex-col card px-4 py-3.5">
            <div className="flex items-start gap-2">
              <h3 className="min-w-0 flex-1 text-subhead font-medium">{f.label}</h3>
              {headline.has(f.id) ? <Chip tone="accent">Headline</Chip> : null}
              {editable ? <RemoveButton id={f.id} label={f.label} /> : null}
            </div>
            <p className={cn("data mt-1 text-title-2 font-semibold", now ? "text-text" : "text-text-tertiary")}>{now ?? VIEW_WORD[f.view]}</p>
            <p className="mt-1 text-footnote text-text-secondary">
              {capital(exprWords(f.expr))}
              {f.by ? `, by ${f.by.replace("_", " ")}` : ""}.
            </p>
            {l.waits ? <p className="mt-1 text-footnote text-warn">{l.waits}</p> : null}
            <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
              {l.testedBy.map((sec) => (
                <Chip key={sec}>Tested by {sec}</Chip>
              ))}
              {l.shownIn.filter((x) => x !== "the headline").map((x) => (
                <Chip key={x}>In {x}</Chip>
              ))}
              {!l.testedBy.length && !l.shownIn.length ? <Chip>Not shown</Chip> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The dashboard's shape and the gaps

export function LayoutView({ m }: { m: Methodology }) {
  const label = (id: string) => m.figures.find((f) => f.id === id)?.label ?? id;
  return (
    <div data-view="layout">
      <section className="mb-6 card px-4 py-4">
        <p className="section-header mb-2">Leads with</p>
        <div className="flex flex-wrap gap-1.5">
          {m.dashboard.headline.map((id) => (
            <Chip key={id} tone="accent">
              {label(id)}
            </Chip>
          ))}
        </div>
        {m.dashboard.themes.length ? <p className="mt-3 text-footnote text-text-tertiary">Themes tracked by name: {m.dashboard.themes.join(", ")}.</p> : null}
      </section>
      <ol className="space-y-2">
        {m.dashboard.sections.map((s, i) => (
          <li key={`${s.kind === "figures" ? s.label : s.id}-${i}`} className="flex items-start gap-3 card px-4 py-3">
            <span className="data mt-0.5 w-6 shrink-0 text-footnote text-text-tertiary">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1">
              <p className="text-subhead font-medium">{s.kind === "figures" ? s.label : PANELS[s.id].label}</p>
              <p className="mt-0.5 text-footnote text-text-secondary">{s.kind === "figures" ? s.figures.map(label).join(", ") : PANELS[s.id].about}</p>
            </div>
            <span className="flex shrink-0 items-center gap-1.5">
              {s.from ? <Section s={s.from} /> : null}
              <Chip>{s.kind === "figures" ? "Figures" : s.view === "chart" ? "Chart" : "Table"}</Chip>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function GapsView({ m }: { m: Methodology }) {
  const text = [`Ontology gaps from "${m.name}":`, ...m.gaps.map((g, i) => `${i + 1}. Section ${g.section}: ${g.asks} Needs: ${g.missing}`)].join("\n");
  return (
    <div data-view="gaps">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
        <p className="text-footnote text-text-secondary">What the document asks for that the app has no name for yet. Copy the list into the Invariant project and it becomes a change for everyone; nothing of your figures is in it.</p>
        <CopyButton text={text} label="Copy the list" />
      </div>
      <ul className="space-y-2">
        {m.gaps.map((g, i) => (
          <li key={`${g.section}-${i}`} className="flex items-start gap-3 card px-4 py-3">
            <Section s={g.section} />
            <div className="min-w-0">
              <p className="text-subhead">{g.asks}</p>
              <p className="mt-0.5 text-footnote text-text-tertiary">Needs {g.missing}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
