import { ChevronDown, FlaskConical } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { ActionButton } from "@/components/app/action-button";
import { ActionForm } from "@/components/app/action-form";
import { chevron, summaryRow } from "@/components/markets/disclosure";
import { FamilyPicker, NewStudyForm, TemplateSectionRow, TemplateUpload } from "@/components/research/forms";
import { EmptyState } from "@/components/ui/empty-state";
import { ListLinkRow, ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { LIBRARY } from "@/lib/library";
import { FAMILY_ABOUT, FAMILY_LABEL, templateFor, templateSchema, type Template } from "@/lib/research";
import { SyncError } from "@/lib/sync-error";
import { screen } from "@/lib/workspace";

import { resetTemplateAction, useLibraryTemplateAction } from "./actions";

export const metadata = { title: "Research · Invariant" };
// Starting a study reads the filings and writes every section in the background of the request.
export const maxDuration = 300;

const STATUS_PILL = {
  queued: <StatusPill tone="info">Queued</StatusPill>,
  running: <StatusPill tone="info">Writing</StatusPill>,
  done: <StatusPill tone="ok">Done</StatusPill>,
  failed: <StatusPill tone="danger">Stopped</StatusPill>,
} as const;

/**
 * Research: studies in the shape the methodology asks for. The template
 * follows the methodology's family and is amended by its classes and rules;
 * a person can keep their own template in their vault. Studies read SEC
 * filings, run the methodology's checks and are written on the person's key.
 * The demo shows the template for its sample methodology and runs nothing.
 */
export default async function ResearchPage() {
  const ws = await screen("research");
  const m = ws.setup.methodology!;
  let own: Template | null = null;
  let templateError: string | null = null;
  if (ws.mode === "drive") {
    try {
      const { openVault } = await import("@/lib/vault");
      own = await (await openVault()).readJson("research_template", templateSchema);
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      templateError = e.message;
    }
  }
  const applied = templateFor(m, own, ws.setup.baseCurrency);
  const studies = ws.research.studies;
  const editable = ws.mode === "drive";
  const contact = ws.preferences.edgarContact;

  return (
    <>
      <PageHeader title="Research" subtitle={`${FAMILY_LABEL[applied.template.family]} studies, in the shape ${m.name} asks for.`} />
      <PageBody>
        {ws.mode === "demo" ? (
          <p className="mb-6 rounded-card border border-hairline bg-surface-1 px-4 py-3 text-subhead text-text-secondary">
            The demo shows the template the sample methodology would get and runs no research. Signed in, a study reads SEC filings, runs your methodology&apos;s checks and is written with the AI.
          </p>
        ) : (
          <>
            {/* The SEC contact is confirmed on Setup's Company filings card (Hamza, 19 Oct 2026: no section of its own here). */}
            {contact ? null : (
              <p className="mb-6 rounded-card bg-surface-2 px-4 py-3 text-subhead text-text-secondary">
                No filing is read until you confirm the contact the SEC sees, on{" "}
                <Link href={"/setup#filings" as Route} className="text-accent-text underline underline-offset-2">
                  Setup, under Company filings
                </Link>
                . A study of a theme or a market needs none.
              </p>
            )}
            <div className="mb-8">
              <h2 className="section-header mb-2 px-1">New study</h2>
              <NewStudyForm hasKey={ws.hasModelKey} needsContact={!contact} ownClaude={ws.askClaude} />
            </div>
          </>
        )}

        {studies.length ? (
          <ListSection grid header={`${studies.length} ${studies.length === 1 ? "study" : "studies"}`} footer="Kept in your vault. Finished studies lay their figures on the matching holding, so the methodology's checks can read them.">
            {studies.map((s) => (
              <ListLinkRow
                key={s.id}
                href={`/research/${s.id}` as Route}
                label={
                  <>
                    <span className="data mr-2">{s.subject}</span>
                    {s.question ? <span className="text-text-secondary">{s.question.slice(0, 80)}{s.question.length > 80 ? "…" : ""}</span> : null}
                  </>
                }
                detail={`${s.forResults ? `After the results of ${s.forResults}` : s.templateTitle} · ${s.requestedAt.slice(0, 10)}${s.verdict?.classLabel ? ` · ${s.verdict.classLabel}` : ""}${s.error ? ` · ${s.error}` : ""}`}
                value={STATUS_PILL[s.status]}
              />
            ))}
          </ListSection>
        ) : ws.mode === "drive" ? (
          <div className="mb-8 card">
            <EmptyState icon={FlaskConical} title="No studies yet" instruction="Name a ticker or a subject above. The study follows the template below and your methodology's checks." action={null} />
          </div>
        ) : null}

        <ListSection
          header="Template"
          footer={
            <>
              {applied.template.origin === "canonical" ? `The canonical ${FAMILY_LABEL[applied.template.family].toLowerCase()} template, chosen because the methodology ${applied.family.reasons.join("; ")}.` : applied.template.origin === "library" ? `${applied.template.title}, adopted from the library.` : `Your own template (${applied.template.origin}), ${applied.template.title}.`} {FAMILY_ABOUT[applied.template.family]}
              {applied.notes.length ? ` ${applied.notes.join(" ")}` : ""}
              {templateError ? ` ${templateError}` : ""}
            </>
          }
        >
          {/* Folded until opened (Hamza, 19 Oct 2026): the template's name and size on the row, its sections and choices inside. */}
          <details className="group">
            <summary className={`${summaryRow} text-subhead`}>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{applied.template.title}</span>
                <span className="block text-footnote text-text-secondary">
                  {applied.sections.length} sections{editable ? ", which you can change or replace" : ""}
                </span>
              </span>
              <ChevronDown className={chevron} aria-hidden />
            </summary>
            <div className="border-t border-hairline">
          {applied.sections.map((s, i) => (
            <TemplateSectionRow key={s.id} s={s} index={i} family={applied.template.family} editable={editable} />
          ))}
          {editable ? (
            <>
              {LIBRARY.filter((e) => e.template && e.template.family === applied.template.family && applied.template.title !== e.template.title).map((e) => (
                <div key={e.id} className="px-4 pb-2">
                  <ActionForm action={useLibraryTemplateAction} label={`Use the ${e.template!.title}`} variant="secondary" size="sm">
                    <input type="hidden" name="library" value={e.id} />
                    <p className="mb-2 text-footnote text-text-secondary">{e.template!.sections.length} sections, from {e.credit}. It replaces the template above.</p>
                  </ActionForm>
                </div>
              ))}
              <TemplateUpload family={applied.template.family} />
              <FamilyPicker current={applied.template.family} />
              {own ? (
                <div className="px-4 pb-4">
                  <ActionButton action={resetTemplateAction} label="Back to the canonical template" variant="ghost" />
                </div>
              ) : null}
            </>
          ) : null}
            </div>
          </details>
        </ListSection>

        <ListSection header="How a study is made" footer="Not investment advice.">
          <ListRow wrap label="Figures from filings" detail="A company the SEC lists, named by ticker or by name, is read from its XBRL company facts: five calendar years and the trailing twelve months of revenue, income, cash flow, shares, dividends and balances. Nothing is estimated; a missing concept is named as missing." />
          <ListRow wrap label="Verdicts from your methodology" detail="Your classes and every rule that reads the family's fields run on those figures with the same recipes as on your holdings. The writer explains the verdict; it never decides it." />
          <ListRow wrap label="Prose with the AI" detail="Sections are written a few at a time with the AI, each figure traceable to the facts, anything from general knowledge marked as not verified." />
        </ListSection>
      </PageBody>
    </>
  );
}
