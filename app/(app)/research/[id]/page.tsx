import { Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AskClaudeCard } from "@/components/app/ask-claude";
import { StudyControls } from "@/components/research/forms";
import { Markdown } from "@/components/research/markdown";
import { StudyRunner } from "@/components/research/runner";
import { buttonStyles } from "@/components/ui/button";
import { ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { askState } from "@/lib/ask-claude-run";
import { FAMILY_LABEL, stalled } from "@/lib/research";
import { screen } from "@/lib/workspace";

export const metadata = { title: "Study · Invariant" };
// Continue reads the filings and writes the rest of the study in the background of the request.
export const maxDuration = 300;

const CHECK_PILL = {
  pass: <StatusPill tone="ok">Passes</StatusPill>,
  near: <StatusPill tone="info">Near limit</StatusPill>,
  fail: <StatusPill tone="danger">Fails</StatusPill>,
  "n/a": <StatusPill tone="neutral">Not testable</StatusPill>,
} as const;

/** One study: the methodology's verdict first, then the sections as they are written, then the figures they rest on. */
export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await screen("research");
  const study = ws.research.studies.find((s) => s.id === id);
  if (!study) notFound();
  const total = study.sections.length;
  const pending = study.pending.length;
  const cut = stalled(study, new Date().toISOString());
  const ask = await askState(ws);

  return (
    <>
      <PageHeader
        title={study.subject}
        subtitle={`${study.templateTitle} · ${FAMILY_LABEL[study.family]} · requested ${study.requestedAt.slice(0, 10)}${study.finishedAt ? `, finished ${study.finishedAt.slice(0, 10)}` : ""}`}
        action={
          study.status === "done" ? (
            <span className="flex gap-2">
              <Link href={`/research/${study.id}/pdf`} className={buttonStyles({ variant: "primary", size: "sm" })} prefetch={false}>
                <Download className="size-4" aria-hidden /> PDF
              </Link>
              <Link href={`/research/${study.id}/file`} className={buttonStyles({ variant: "secondary", size: "sm" })} prefetch={false}>
                Markdown
              </Link>
            </span>
          ) : undefined
        }
      />
      <PageBody>
        {ask.ask && study.status !== "done" ? <AskClaudeCard feature="study" subject={study.subject} connected={ask.connected} demo={ws.mode === "demo"} open /> : ws.mode === "drive" ? <StudyRunner pending={pending} total={total} status={study.status} stalled={cut} /> : null}
        {study.status === "failed" && study.error ? <p className="mb-4 rounded-card border border-danger/40 bg-danger/10 px-4 py-3 text-subhead text-danger">{study.error}</p> : null}
        {study.question ? <p className="mb-6 px-1 text-body">{study.question}</p> : null}

        {study.verdict ? (
          <ListSection header="Methodology checks" footer={study.verdict.checks.length ? "Each rule cites its section and runs with the methodology's own recipe on the figures below. Not testable means the filings give no figure for it." : "The methodology has no rule the app can test on this subject; the sections still follow its template."}>
            <ListRow wrap label="Class" value={study.verdict.classLabel ?? "No class fits"} />
            {study.verdict.checks.map((c) => (
              <ListRow
                key={c.ruleId}
                wrap
                label={
                  <>
                    <span className="data mr-2 text-text-tertiary">{c.section}</span>
                    {c.text}
                  </>
                }
                detail={`Limit ${c.limit}${c.actual !== null ? ` · now ${c.actual}` : ""}${c.detail ? ` · ${c.detail}` : ""}`}
                trailing={CHECK_PILL[c.status]}
              />
            ))}
          </ListSection>
        ) : null}

        {study.sections.map((s) => (
          <section key={s.id} className="mb-8">
            <h2 className="section-header mb-2 px-1">{s.title}</h2>
            <div className="card px-4 py-4">{study.written[s.id] ? <Markdown text={study.written[s.id]} /> : <p className="text-subhead text-text-tertiary">{study.pending.includes(s.id) ? "Not written yet." : "Nothing written."}</p>}</div>
          </section>
        ))}

        {study.facts ? (
          <ListSection header="Figures from the filings" footer={study.fundamentalsNotes.length ? `Could not be derived: ${study.fundamentalsNotes.join("; ")}.` : "Every figure the study cites is here."}>
            <div className="px-4 py-3">
              <pre className="data overflow-x-auto text-footnote leading-relaxed">{study.facts}</pre>
            </div>
          </ListSection>
        ) : study.factsNote ? (
          <p className="mb-6 px-1 text-footnote text-text-secondary">{study.factsNote}</p>
        ) : null}

        {ws.mode === "drive" ? <StudyControls id={study.id} status={study.status} pending={pending} stalled={cut} /> : null}
        <p className="mt-6 px-1 text-footnote text-text-tertiary">Written from the figures above and the methodology&apos;s own checks. Not investment advice.</p>
      </PageBody>
    </>
  );
}
