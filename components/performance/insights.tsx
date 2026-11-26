import { Sparkles } from "lucide-react";

import { perfInsightsAction } from "@/app/(app)/performance/actions";
import { ActionForm } from "@/components/app/action-form";
import { CARD_WORDS, TONE_WORDS, type InsightCard, type InsightTone, type PerfInsight, type PerfInsightsFile } from "@/lib/perf-insights";
import type { WindowKey } from "@/lib/performance";
import { longDate } from "@/lib/time";
import { cn } from "@/lib/utils";

const TONE_INK: Record<InsightTone, string> = { in_line: "text-ok", watch: "text-warn", against: "text-danger", noise: "text-text-tertiary" };
const TONE_DOT: Record<InsightTone, string> = { in_line: "bg-ok", watch: "bg-warn", against: "bg-danger", noise: "bg-text-tertiary" };

function Tone({ t }: { t: InsightTone }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-caption font-medium", TONE_INK[t])}>
      <span className={cn("size-1.5 rounded-full", TONE_DOT[t])} aria-hidden />
      {TONE_WORDS[t]}
    </span>
  );
}

/**
 * One card's reading, set right under the card it reads (Hamza, 23 Oct 2026:
 * beside each metric, never cluttered): a line in the accent's wash with the
 * verdict word and the sections it bears on. Drawn only once the person has
 * asked for the readings.
 */
export function InsightNote({ insights, card }: { insights: readonly PerfInsight[] | null | undefined; card: InsightCard }) {
  const it = insights?.find((x) => x.card === card);
  if (!it) return null;
  return (
    <aside className="-mt-5 mb-8 flex gap-2.5 rounded-xl border border-accent/25 bg-accent-subtle/60 px-4 py-3" aria-label={`${CARD_WORDS[card]} in your methodology`}>
      <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-caption font-medium text-accent-text">In your methodology</span>
          <Tone t={it.tone} />
          {it.sections.map((s) => (
            <span key={s} className="data rounded-md border border-hairline-strong px-1.5 text-caption text-text-secondary">
              {s}
            </span>
          ))}
        </p>
        <p className="mt-1 text-footnote text-text">{it.reading}</p>
      </div>
    </aside>
  );
}

/**
 * The page's one control for the readings: what they are before the first,
 * then the reading of the page as a whole, when it was made and on which
 * figures, and Read again. Each card's own reading sits under that card.
 */
export function InsightsBar({ file, methodology, asOf, windows, current, canRead, demo, error }: { file: PerfInsightsFile | null; methodology: string; asOf: string; windows: { window: WindowKey; irr: WindowKey; alpha: WindowKey }; current: boolean; canRead: boolean; demo: boolean; error: string | null }) {
  const action = canRead ? (
    <ActionForm action={perfInsightsAction} label={file ? "Read again" : "Read through my methodology"} pendingLabel="Reading" variant={file ? "secondary" : "primary"} size="sm" doneLabel="Read" note="The AI reads the figures on this page; a minute at most.">
      <input type="hidden" name="window" value={windows.window} />
      <input type="hidden" name="irr" value={windows.irr} />
      <input type="hidden" name="alpha" value={windows.alpha} />
    </ActionForm>
  ) : null;
  return (
    <section className="card mb-8 px-4 py-4 lg:px-5" aria-labelledby="insights-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="insights-title" className="inline-flex items-center gap-1.5 section-header text-accent-text">
            <Sparkles className="size-4" aria-hidden /> In your methodology
          </h2>
          {file?.overall ? <p className={cn("mt-2 text-subhead", current ? "text-text" : "text-text-secondary")}>{file.overall}</p> : null}
          {!file ? (
            <p className="mt-2 text-subhead text-text-secondary">
              Read every figure on this page through {methodology}: whether it matters to how you invest, which way it points and the section it bears on. One line under each card.
            </p>
          ) : null}
          <p className="mt-2 text-caption text-text-tertiary">
            {file
              ? `${demo ? "Sample readings, made by no model; in your app the AI writes them from your figures. " : ""}Read ${longDate(file.at.slice(0, 10))} on the figures of ${longDate(file.asOf)} (returns ${file.windows.window}, IRR ${file.windows.irr}, alpha ${file.windows.alpha})${current || demo ? "." : `; the page now shows ${longDate(asOf)} at ${windows.window}, so read again for these.`} The app computes every figure; the readings are words, never advice.`
              : canRead
                ? "Written with the AI from the figures the app computed, with your methodology's words; no amount is sent, and holdings go by symbol, class and weight in percent."
                : "The AI is not set up on this deployment yet."}
          </p>
          {file?.dropped.length ? <p className="mt-1 text-caption text-text-tertiary">Left out: {file.dropped.join(" ")}</p> : null}
          {error ? <p className="mt-2 text-footnote text-danger">{error}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </section>
  );
}
