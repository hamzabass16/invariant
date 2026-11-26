import type * as React from "react";
import { Sparkles } from "lucide-react";

import { ActionButton } from "@/components/app/action-button";
import { ActionForm } from "@/components/app/action-form";
import { Stat } from "@/components/methodology/views";
import { StatusPill } from "@/components/ui/status";
import {
  ADHERENCE_WORDS,
  OVERALL_WORDS,
  SOURCE_WORDS,
  VERDICT_WORDS,
  type AdherenceVerdict,
  type Evaluation,
  type EvaluationFile,
  type OverallVerdict,
  type TestResult,
  type TestVerdict,
} from "@/lib/methodology-evaluation";
import type { Methodology } from "@/lib/methodology";
import { longDate } from "@/lib/time";
import { cn } from "@/lib/utils";

import { confirmEvaluationAction, dismissEvaluationAction, resetEvaluationTestsAction, setEvaluationStartAction, suggestEvaluationAction } from "@/app/(app)/methodology/actions";

/**
 * The Evaluation view on Methodology (Hamza, 23 Oct 2026): is the
 * methodology any good, and is the person investing under it. One verdict
 * up top with the period, then whether they follow it and since when, then
 * each test as a card: the claim, the source, the verdict and the figures,
 * with the holdings side by side where a test reads them one by one.
 */

const VERDICT_TONE: Record<TestVerdict, "ok" | "warn" | "danger" | "neutral"> = { supports: "ok", mixed: "warn", against: "danger", no_data: "neutral" };
const OVERALL_TONE: Record<OverallVerdict, string> = { holding_up: "text-ok", mixed: "text-warn", not_holding_up: "text-danger", no_data: "text-text-secondary" };
const ADHERENCE_TONE: Record<AdherenceVerdict, "ok" | "warn" | "danger" | undefined> = { following: "ok", partly: "warn", drifting: "danger", unread: undefined };
const DOT: Record<TestVerdict, string> = { supports: "bg-ok", mixed: "bg-warn", against: "bg-danger", no_data: "bg-surface-3" };

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";

function Section({ s }: { s: string }) {
  return <span className="data inline-flex h-6 shrink-0 items-center rounded-md border border-hairline-strong px-1.5 text-caption text-text-secondary">{s}</span>;
}

/** The verdict and the period, the book against its benchmark, and every test as a dot. */
function Verdict({ e }: { e: Evaluation }) {
  const book = e.results.find((r) => r.test.kind === "beats_benchmark" && r.verdict !== "no_data");
  return (
    <section className="reveal mb-6 card px-4 py-5 lg:px-6" aria-labelledby="eval-verdict">
      <div className="flex flex-wrap items-center gap-2">
        <p className="section-header">Is it working</p>
        {e.early ? <StatusPill tone="neutral">Too early to judge</StatusPill> : null}
      </div>
      <h2 id="eval-verdict" className={cn("mt-2 text-large-title font-semibold tracking-tight", OVERALL_TONE[e.verdict])}>
        {OVERALL_WORDS[e.verdict]}
      </h2>
      <p className="mt-2 max-w-[70ch] text-body text-text-secondary">{e.headline}</p>
      {book ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {book.figures.map((f) => (
            <Stat key={f.label} label={f.label} value={f.value} />
          ))}
        </div>
      ) : null}
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2" aria-label="Each test">
        {e.results.map((r, i) => (
          <li key={i} className="inline-flex items-center gap-1.5 text-footnote text-text-secondary">
            <span className={cn("size-2 rounded-full", DOT[r.verdict])} aria-hidden />
            {r.title}
            <span className="sr-only">: {VERDICT_WORDS[r.verdict]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AdherenceCard({ e }: { e: Evaluation }) {
  const a = e.adherence;
  const judged = a.buys.placed + a.buys.unplaced.length;
  return (
    <section className="card px-4 py-4 lg:px-5">
      <p className="section-header">Are you investing under it</p>
      <p className={cn("mt-2 text-title-2 font-semibold", ADHERENCE_TONE[a.verdict] === "ok" ? "text-ok" : ADHERENCE_TONE[a.verdict] === "warn" ? "text-warn" : ADHERENCE_TONE[a.verdict] === "danger" ? "text-danger" : "text-text-secondary")}>{ADHERENCE_WORDS[a.verdict]}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Of the book in its classes" value={a.placedPct === null ? "–" : `${a.placedPct.toFixed(0)}%`} tone={a.placedPct !== null && a.placedPct >= 80 ? "ok" : a.placedPct !== null && a.placedPct < 50 ? "danger" : undefined} />
        <Stat label="Rules broken today" value={a.breaches} tone={a.breaches ? "danger" : a.tested ? "ok" : undefined} />
        <Stat label="Buys since placed by a class" value={judged ? `${a.buys.placed} of ${judged}` : "none"} />
        {a.sales ? <Stat label="Sales with a reason logged" value={a.sales.count ? `${a.sales.logged} of ${a.sales.count}` : "none"} /> : <Stat label="Companies bought since" value={a.buys.companies} />}
      </div>
      <ul className="mt-3 space-y-1 text-footnote text-text-secondary">
        {a.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
        {a.buys.gone ? <li>{a.buys.gone} bought since and sold again, so no class today to read.</li> : null}
      </ul>
      <p className="mt-3 text-caption text-text-tertiary">Read from the class each holding&apos;s tests give it today; the app&apos;s reading, never a verdict on you.</p>
    </section>
  );
}

function StartCard({ e, file, editable, canSuggest, m, ask }: { e: Evaluation; file: EvaluationFile; editable: boolean; canSuggest: boolean; m: Methodology; ask?: React.ReactNode }) {
  const p = file.proposal;
  return (
    <section className="card px-4 py-4 lg:px-5">
      <p className="section-header">Since when</p>
      <p className="mt-2 text-subhead">{e.start.words}</p>
      {file.advice && e.source === "confirmed" ? <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5 text-footnote text-text-secondary">{file.advice}</p> : null}
      {editable ? (
        <>
          <ActionForm action={setEvaluationStartAction} label="Measure from this day" variant="secondary" size="sm" doneLabel="Saved" className="mt-4">
            <label className="block text-footnote text-text-secondary">
              The day you began investing this way
              <input name="since" type="date" className={cn(field, "data")} defaultValue={file.since ?? ""} max={e.asOf} />
            </label>
          </ActionForm>
          <div className="mt-4 border-t border-hairline pt-4">
            {p ? (
              <div className="rounded-xl border border-accent bg-accent-subtle px-3 py-3">
                <p className="inline-flex items-center gap-1.5 text-footnote font-medium text-accent-text">
                  <Sparkles className="size-4" aria-hidden /> The AI suggests
                </p>
                <p className="mt-1 text-subhead">{p.advice}</p>
                {p.since ? (
                  <p className="mt-2 text-footnote text-text-secondary">
                    From {longDate(p.since)}.{p.sinceWhy ? ` ${p.sinceWhy}` : ""}
                  </p>
                ) : null}
                <ul className="mt-2 space-y-1 text-footnote">
                  {p.tests.map((t, i) => (
                    <li key={i} className="flex gap-2">
                      {t.section ? <Section s={t.section} /> : null}
                      <span>{t.claim}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-caption text-text-tertiary">
                  Against {p.against}, {longDate(p.at.slice(0, 10))}. The app computes each test; nothing counts until you confirm.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton action={confirmEvaluationAction} label="Confirm" size="sm" doneLabel="Confirmed" />
                  <ActionButton action={dismissEvaluationAction} label="Dismiss" size="sm" variant="ghost" doneLabel="Dismissed" />
                </div>
              </div>
            ) : canSuggest ? (
              <>
                <p className="text-footnote text-text-secondary">{e.source === "methodology" ? "Your methodology states its own proofs. The AI can still suggest the day to read from." : "Your methodology states no proof of its own, so the app's tests are below. The AI can read it and suggest how to judge it, and since when."}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <ActionButton action={suggestEvaluationAction} label="Suggest how to judge it" size="sm" variant="secondary" doneLabel="Suggested" />
                  {e.source === "confirmed" ? <ActionButton action={resetEvaluationTestsAction} label="Back to the app's tests" size="sm" variant="ghost" doneLabel="Done" /> : null}
                </div>
                <p className="mt-2 text-caption text-text-tertiary">Sent to the AI: {m.name}&apos;s summary, classes and rules, and the dates of your record. Never an amount.</p>
              </>
            ) : ask ? (
              ask
            ) : (
              <p className="text-footnote text-text-secondary">Once the AI is set up on this deployment, it suggests how to judge {e.source === "methodology" ? "the day to read from" : "this methodology"}.</p>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

const fmt = (v: number | null) => (v === null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`);

/** The holdings side by side: two bars each from a zero line, on one scale, with the values beside them, and the same as a table. */
function PairedBars({ r }: { r: TestResult }) {
  if (!r.rows.length || !r.series) return null;
  const max = Math.max(1, ...r.rows.flatMap((x) => [x.a, x.b]).filter((v): v is number => v !== null).map(Math.abs));
  const [sa, sb] = r.series;
  const bar = (v: number | null, color: string) => {
    if (v === null) return <div className="h-2" />;
    const w = `${(Math.abs(v) / max) * 50}%`;
    return (
      <div className="relative h-2">
        <div className={cn("absolute top-0 h-2 rounded-[2px]", color)} style={v >= 0 ? { left: "50%", width: w } : { right: "50%", width: w }} />
      </div>
    );
  };
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-series-hcmp" />
          {sa}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", r.test.kind === "earnings_track_price" ? "bg-series-qqq" : "bg-series-spy")} />
          {sb}
        </span>
      </div>
      <ul className="mt-2 space-y-2.5" role="img" aria-label={`${sa} against ${sb}, by holding`}>
        {r.rows.map((x) => (
          <li key={x.symbol} className="grid grid-cols-[4rem_1fr_4.5rem] items-center gap-2" title={x.note ?? undefined}>
            <span className="data text-footnote font-medium">{x.symbol}</span>
            <div className="relative space-y-1">
              <div className="absolute inset-y-0 left-1/2 w-px bg-hairline-strong" aria-hidden />
              {bar(x.a, "bg-series-hcmp")}
              {bar(x.b, r.test.kind === "earnings_track_price" ? "bg-series-qqq" : "bg-series-spy")}
            </div>
            <span className="data text-right text-caption leading-tight text-text-secondary">
              {fmt(x.a)}
              <br />
              {fmt(x.b)}
            </span>
          </li>
        ))}
      </ul>
      <details className="mt-3">
        <summary className="cursor-pointer text-caption text-text-tertiary">Table</summary>
        <table className="mt-2 w-full text-caption">
          <thead>
            <tr className="text-left text-text-tertiary">
              <th className="py-1 font-normal">Holding</th>
              <th className="py-1 text-right font-normal">{sa}</th>
              <th className="py-1 text-right font-normal">{sb}</th>
              <th className="py-1 pl-2 font-normal">Over</th>
            </tr>
          </thead>
          <tbody>
            {r.rows.map((x) => (
              <tr key={x.symbol} className="border-t border-hairline">
                <td className="data py-1">{x.symbol}</td>
                <td className="data py-1 text-right">{fmt(x.a)}</td>
                <td className="data py-1 text-right">{fmt(x.b)}</td>
                <td className="py-1 pl-2 text-text-secondary">
                  {x.label}
                  {x.note ? ` · ${x.note}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function TestCard({ r, source }: { r: TestResult; source: Evaluation["source"] }) {
  return (
    <article className="card flex flex-col px-4 py-4 lg:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={VERDICT_TONE[r.verdict]}>{VERDICT_WORDS[r.verdict]}</StatusPill>
        {r.test.section ? <Section s={r.test.section} /> : null}
        <span className="text-caption text-text-tertiary">{SOURCE_WORDS[source]}</span>
      </div>
      <h3 className="mt-3 text-title-3 font-semibold">{r.title}</h3>
      <p className="mt-1 text-footnote italic text-text-secondary">&ldquo;{r.test.claim}&rdquo;</p>
      <p className="mt-3 text-subhead">{r.headline}</p>
      {r.figures.length ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          {r.figures.map((f) => (
            <div key={f.label}>
              <dt className="text-caption text-text-tertiary">{f.label}</dt>
              <dd className="data text-subhead">{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <PairedBars r={r} />
      {r.notes.length ? (
        <ul className="mt-auto space-y-1 pt-3 text-caption text-text-tertiary">
          {r.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function EvaluationView({ e, file, m, editable, canSuggest, error, ask }: { e: Evaluation; file: EvaluationFile; m: Methodology; editable: boolean; canSuggest: boolean; error: string | null; ask?: React.ReactNode }) {
  return (
    <div>
      <Verdict e={e} />
      {error ? <p className="mb-4 text-footnote text-danger">{error}</p> : null}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <AdherenceCard e={e} />
        <StartCard e={e} file={file} editable={editable} canSuggest={canSuggest} m={m} ask={ask} />
      </div>
      <h2 className="section-header mb-3 px-1">The tests</h2>
      <p className="mb-4 max-w-[70ch] px-1 text-footnote text-text-secondary">
        {e.source === "methodology" ? "The proofs your methodology gives that it works," : e.source === "confirmed" ? "The tests the AI suggested and you confirmed," : "The app's own tests, since your methodology states no proof of its own:"} each read against {e.benchmark} from {longDate(e.start.day)} to {longDate(e.asOf)}. A class is read in the order your methodology ranks it.
      </p>
      <div className="pair-grid grid gap-4">
        {e.results.map((r, i) => (
          <TestCard key={i} r={r} source={e.source} />
        ))}
      </div>
      <ul className="mt-6 space-y-1 px-1 text-footnote text-text-tertiary">
        {e.caveats.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}
