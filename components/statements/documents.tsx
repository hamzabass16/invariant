import { confirmStatementAction, removeStatementAction, uploadStatementsAction } from "@/app/(app)/statements/actions";
import { ActionButton } from "@/components/app/action-button";
import { FileAction } from "@/components/app/file-action";
import { ListRow, ListSection } from "@/components/ui/list";
import { StatusPill } from "@/components/ui/status";
import { money } from "@/lib/holdings";
import { describeDocument, type StatementDoc, type StatementsFile } from "@/lib/statements";

const STATUS: Record<StatementDoc["status"], { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  applied: { label: "In use", tone: "ok" },
  review: { label: "Check", tone: "warn" },
  failed: { label: "Not read", tone: "danger" },
  ignored: { label: "Set aside", tone: "neutral" },
};

/** Money as the document prints it, in its own currency; a currency code the formatter does not know falls back to the plain figure. */
function amount(n: number, ccy: string): string {
  try {
    return money(n, ccy, Math.abs(n) < 1000 ? 2 : 0);
  } catch {
    return `${n.toLocaleString("en-US")} ${ccy}`;
  }
}

/** The upload: one to six PDFs, read on the person's own key. */
export function ReadStatements({ demo, hasKey }: { demo: boolean; hasKey: boolean }) {
  return (
    <ListSection
      header="Read a statement"
      footer="Each PDF is read with the AI. Every figure is checked against the document's printed text; a document whose figures do not all check waits below for you to look at. Only what each document says is kept in your vault, never the document."
    >
      {demo ? (
        <ListRow wrap label="The demo reads no statements" detail="Its bank and fund figures are fictional. Sign in to read your own." />
      ) : !hasKey ? (
        <ListRow wrap label="The AI is not set up yet" detail="Statements are read by the AI, which this deployment does not run yet." />
      ) : (
        <div className="px-4 py-3">
          <p className="mb-3 text-footnote text-text-secondary">Bank statements, portfolio reports or fund reports (PDF). Up to six at a time, 4 MB each. The same PDF twice is read once.</p>
          <FileAction action={uploadStatementsAction} name="documents" multiple accept=".pdf,application/pdf" label="Choose PDFs and read them" pendingLabel="Reading" note="A long fund report can take a minute." doneLabel="Read" />
        </div>
      )}
    </ListSection>
  );
}

/** A document waiting for the person: its figures beside what the check found, and the two ways forward. */
function Review({ d }: { d: StatementDoc }) {
  const x = d.extraction!;
  const missing = new Set(d.unchecked.map((u) => u.split(":")[0]));
  return (
    <ListSection header={d.name} footer={d.sentence ?? undefined}>
      <ListRow wrap label={describeDocument(d)} trailing={<StatusPill tone="warn">Check</StatusPill>} />
      {x.totalValue !== null ? <ListRow label="Total, as printed" value={amount(x.totalValue, x.currency)} trailing={missing.has("Total") ? <StatusPill tone="warn">Not found</StatusPill> : undefined} /> : null}
      {x.positions.map((p, i) => (
        <ListRow
          key={`${p.name}-${i}`}
          label={p.name}
          detail={[p.isin, p.quantity !== null ? `${p.quantity.toLocaleString("en-US")} units` : null].filter(Boolean).join(" · ") || undefined}
          value={amount(p.value, p.currency)}
          trailing={missing.has(p.name.slice(0, 60)) ? <StatusPill tone="warn">Not found</StatusPill> : undefined}
        />
      ))}
      {x.fund ? (
        <>
          <ListRow label={`${x.fund.name}: your value`} value={x.fund.nav === null ? "Not in this report" : amount(x.fund.nav, x.fund.currency)} trailing={missing.has("Fund NAV") ? <StatusPill tone="warn">Not found</StatusPill> : undefined} />
          {x.fund.companies.map((c, i) => (
            <ListRow key={`${c.name}-${i}`} label={c.name} detail={[c.sector, c.stage, c.country].filter(Boolean).join(" · ") || undefined} value={c.fairValue === null ? "n/a" : amount(c.fairValue, x.fund!.currency)} />
          ))}
        </>
      ) : null}
      <div className="flex flex-wrap gap-2 px-4 py-3">
        <ActionButton action={confirmStatementAction.bind(null, d.id)} label="Use these figures" variant="secondary" />
        <ActionButton action={removeStatementAction.bind(null, d.id)} label="Remove" variant="ghost" />
      </div>
    </ListSection>
  );
}

/** Every document read, newest first; those waiting for the person first of all. */
export function StatementDocuments({ file, notes, demo }: { file: StatementsFile; notes: string[]; demo: boolean }) {
  const waiting = file.documents.filter((d) => d.status === "review" && d.extraction);
  const rest = file.documents.filter((d) => !(d.status === "review" && d.extraction));
  return (
    <>
      {notes.length ? (
        <ListSection grid header="Not on the books">
          {notes.map((n) => (
            <ListRow key={n} wrap label={n} />
          ))}
        </ListSection>
      ) : null}
      {waiting.map((d) => (
        <Review key={d.id} d={d} />
      ))}
      {rest.length ? (
        <ListSection grid header="Read">
          {rest.map((d) => (
            <div key={d.id}>
              <ListRow wrap label={d.name} detail={d.extraction ? [describeDocument(d), d.sentence].filter(Boolean).join(" ") : (d.sentence ?? undefined)} trailing={<StatusPill tone={STATUS[d.status].tone}>{STATUS[d.status].label}</StatusPill>} />
              {demo ? null : (
                <div className="-mt-2 px-4 pb-3">
                  <ActionButton action={removeStatementAction.bind(null, d.id)} label="Remove" variant="ghost" />
                </div>
              )}
            </div>
          ))}
        </ListSection>
      ) : null}
    </>
  );
}
