import { ActionForm } from "@/components/app/action-form";
import { FigureChartView } from "@/components/theses/figure-grid";
import { StatusPill } from "@/components/ui/status";
import { FROM_LABEL, shownFinds, STANCE_LABEL, type Find, type Hunt } from "@/lib/thesis-hunter";
import { longDate } from "@/lib/time";

import { dismissFindAction, huntNowAction } from "@/app/(app)/theses/actions";

const STANCE_TONE = { backs: "ok", challenges: "warn", update: "info" } as const;

/**
 * Added by Thesis Hunter (Hamza, 20 Oct 2026): what the AI
 * found for this thesis on the web, in their newsletters and in their
 * podcasts, newest first, each with whether it backs or challenges the
 * thesis, the pillar it bears on, its source with its page and its chart or
 * picture. A list; nothing here changes the thesis. Dismiss takes one away
 * for good; Hunt now runs the hunter on this thesis at once.
 */
export function HunterFinds({ hunt, subject, editable, hasModel }: { hunt: Hunt; subject: { kind: "stock" | "market"; id: string }; editable: boolean; hasModel: boolean }) {
  const finds = shownFinds(hunt);
  const hidden = hunt.finds.length - finds.length;
  return (
    <section id="hunter" className="mb-8 scroll-mt-20">
      <h2 className="section-header mb-2 px-4">Added by Thesis Hunter{finds.length ? ` · ${finds.length}` : ""}</h2>
      <div className="card mb-3 px-4 py-3">
        <p className="text-subhead text-text-secondary">
          Once a week the AI hunts for what bears on this thesis: research, data, news, charts and pictures on the web, in the newsletters you forward and in the podcasts you follow. Each find says whether it backs the thesis or challenges it, and where it came from. It never changes the thesis; that stays yours.
        </p>
        <p className="mt-2 text-footnote text-text-tertiary">
          {hunt.huntedAt ? `Last hunted ${longDate(hunt.huntedAt.slice(0, 10))}. ${hunt.sentence ?? ""}` : "Not hunted yet; the first hunt runs tomorrow morning, then once a week."}
          {hidden ? ` ${hidden} dismissed.` : ""}
        </p>
        {editable ? (
          hasModel ? (
            <ActionForm action={huntNowAction} label="Hunt now" pendingLabel="Hunting" doneLabel="Hunted" variant="secondary" size="sm" className="mt-3" note="Searching with the AI; this takes up to a minute.">
              <input type="hidden" name="kind" value={subject.kind} />
              <input type="hidden" name="subject" value={subject.id} />
            </ActionForm>
          ) : (
            <p className="mt-2 text-footnote text-text-tertiary">The AI is not set up on this deployment yet.</p>
          )
        ) : null}
      </div>
      {finds.length ? (
        <ul className="flex flex-col gap-3">
          {finds.map((f) => (
            <FindRow key={f.id} f={f} subject={subject} editable={editable} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function FindRow({ f, subject, editable }: { f: Find; subject: { kind: "stock" | "market"; id: string }; editable: boolean }) {
  const dismiss = editable ? (
    <ActionForm action={dismissFindAction} label="Dismiss" variant="ghost" size="sm" className="ml-auto">
      <input type="hidden" name="kind" value={subject.kind} />
      <input type="hidden" name="subject" value={subject.id} />
      <input type="hidden" name="find" value={f.id} />
    </ActionForm>
  ) : null;
  return (
    <li className="card min-w-0 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={STANCE_TONE[f.stance]}>{STANCE_LABEL[f.stance]}</StatusPill>
        {f.pillar ? <span className="text-caption text-text-secondary">{f.pillar}</span> : null}
        <span className="data ml-auto text-caption text-text-tertiary">{longDate(f.date ?? f.found)}</span>
      </div>
      <p className="mt-2 font-semibold">{f.title}</p>
      <p className="mt-1 text-subhead text-text-secondary">{f.summary}</p>
      {f.figure?.chart ? (
        <div className="mt-3">
          <FigureChartView f={f.figure} after={null} />
        </div>
      ) : f.figure?.image ? (
        <a href={f.figure.image.url} target="_blank" rel="noreferrer noopener" className="mt-3 block overflow-hidden rounded-[10px] bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- a picture from its own public host, at whatever size it is */}
          <img src={f.figure.image.url} alt={f.figure.image.alt || f.title} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="block h-auto w-full" />
        </a>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-text-tertiary">
        <span>
          {FROM_LABEL[f.from]}:{" "}
          {f.sourceUrl ? (
            <a href={f.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-accent-text">
              {f.source}
            </a>
          ) : (
            f.source
          )}
        </span>
        <span>Found {longDate(f.found)}</span>
        {dismiss}
      </div>
    </li>
  );
}
