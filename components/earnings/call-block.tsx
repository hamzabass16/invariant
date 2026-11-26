import { StatusPill } from "@/components/ui/status";
import { BEARING_WORD, beatsOf, CHANGE_WORD, RESULT_WORD, type BeatRow } from "@/lib/earnings-call";
import type { EarningsReport } from "@/lib/earnings";
import { longDate } from "@/lib/time";

const RESULT_TONE: Record<BeatRow["result"], "ok" | "danger" | "neutral"> = { beat: "ok", miss: "danger", inline: "neutral" };
const BEARING_TONE = { supports: "ok", challenges: "warn", neutral: "neutral" } as const;

/**
 * The call on a report (Hamza, 29 Oct 2026): every beat and miss, the
 * guidance with what it changed and the part of the thesis it bears on, and
 * the analysts' questions with management's answers, as the person's own
 * Claude wrote them back or their model read them.
 */
export function CallBlock({ r }: { r: EarningsReport }) {
  const beats = beatsOf(r);
  const c = r.call;
  const guidance = c?.guidance ?? [];
  const qa = c?.qa ?? [];
  if (!beats.length && !guidance.length && !qa.length && !c?.remarks.length) return c?.note ? <p className="mt-5 text-footnote text-text-secondary">{c.note}</p> : null;
  return (
    <div className="mt-5 space-y-5">
      {beats.length ? (
        <div>
          <h3 className="section-header mb-2">Beats and misses</h3>
          <ul className="space-y-1.5">
            {beats.map((b, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-footnote">
                <StatusPill tone={RESULT_TONE[b.result]}>{RESULT_WORD[b.result]}</StatusPill>
                <span>{b.line}</span>
                <span className="data">{b.actual}</span>
                <span className="text-text-secondary">
                  against <span className="data">{b.expected}</span> {b.against === "consensus" ? (b.app ? "(the analysts' consensus on Nasdaq)" : "(the analysts')") : "(the company's guidance)"}
                  {b.by ? <span className="data">, {b.by}</span> : null}
                </span>
                {b.source ? (
                  <a href={b.source.url} target="_blank" rel="noreferrer" className="text-accent-text">
                    {b.source.title}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-text-tertiary">What was expected is the analysts&rsquo; or the company&rsquo;s own, never the app&rsquo;s; the rules judge the business.</p>
        </div>
      ) : null}
      {guidance.length ? (
        <div>
          <h3 className="section-header mb-2">Guidance, against your thesis</h3>
          <ul className="space-y-3">
            {guidance.map((g, i) => (
              <li key={i}>
                <p className="flex flex-wrap items-baseline gap-2 text-subhead">
                  {g.change ? <StatusPill tone={g.change === "raised" ? "ok" : g.change === "lowered" || g.change === "withdrawn" ? "warn" : "neutral"}>{CHANGE_WORD[g.change]}</StatusPill> : null}
                  <span>
                    {g.metric}
                    {g.period ? ` (${g.period})` : ""}: {g.said}
                  </span>
                </p>
                {g.before ? <p className="mt-1 text-footnote text-text-secondary">Before: {g.before}</p> : null}
                {g.bearsOn ? (
                  <p className="mt-1 flex flex-wrap items-baseline gap-2 text-footnote">
                    {g.reading ? <StatusPill tone={BEARING_TONE[g.reading]}>{BEARING_WORD[g.reading]}</StatusPill> : null}
                    <span className="text-text-secondary">
                      {g.bearsOn === "pathway" ? "The pathway" : g.bearsOn}
                      {g.why ? `: ${g.why}` : ""}
                    </span>
                  </p>
                ) : g.why ? (
                  <p className="mt-1 text-footnote text-text-secondary">{g.why}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {c?.remarks.length || qa.length ? (
        <div>
          <h3 className="section-header mb-2">The call</h3>
          {c?.remarks.length ? (
            <ul className="mb-3 list-disc space-y-1 pl-5 text-footnote">
              {c.remarks.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          ) : null}
          {qa.length ? (
            <ul className="space-y-3">
              {qa.map((q, i) => (
                <li key={i}>
                  <p className="text-caption text-text-tertiary">{q.analyst}</p>
                  <p className="text-subhead">{q.asked}</p>
                  <p className="mt-1 text-footnote text-text-secondary">{q.answered}</p>
                  {q.bearsOn && q.reading ? (
                    <p className="mt-1 flex items-baseline gap-2 text-caption">
                      <StatusPill tone={BEARING_TONE[q.reading]}>{BEARING_WORD[q.reading]}</StatusPill>
                      <span className="text-text-secondary">{q.bearsOn === "pathway" ? "The pathway" : q.bearsOn}</span>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {c ? (
        <p className="text-caption text-text-tertiary">
          {c.from === "notes" ? "Written back by your own Claude" : "Read with the AI"} from {c.source}, {longDate(c.at.slice(0, 10))}; in its own words, never the transcript.
        </p>
      ) : null}
    </div>
  );
}
