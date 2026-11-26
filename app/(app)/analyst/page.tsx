import { MessageSquareText } from "lucide-react";
import type { Route } from "next";

import { AskClaudeCard } from "@/components/app/ask-claude";
import { AskForm, LessonRow } from "@/components/analyst/forms";
import { EmptyState } from "@/components/ui/empty-state";
import { ListLinkRow, ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { askState } from "@/lib/ask-claude-run";
import { familyOf, FAMILY_LABEL } from "@/lib/research";
import { screen } from "@/lib/workspace";

export const metadata = { title: "Analyst · Invariant" };
// A question is one agent run on the person's key: several model calls and the app's own computations.
export const maxDuration = 300;

const PLACEHOLDER = {
  fundamentals: "Which holdings are over their class cap, and by how much? Where does ASML sit against the Classification Test today?",
  options: "What is my delta-adjusted exposure by underlying, and which contracts expire inside the next ten days?",
  quant: "What are the drawdown and the beta against the benchmark this year, and which rules does that trip?",
  macro: "How far is each asset class from its policy band, and what does the look-through say about country exposure?",
} as const;

/**
 * The analyst: conversations in which every number is computed by the app from
 * a recipe the model wrote, every verdict comes from the methodology's own
 * rules, and lessons the model proposes take effect only once approved.
 */
export default async function AnalystPage() {
  const ws = await screen("analyst");
  const m = ws.setup.methodology!;
  const family = familyOf(m).family;
  const threads = ws.analyst.threads;
  const proposed = ws.analyst.lessons.filter((l) => l.status === "proposed");
  const approved = ws.analyst.lessons.filter((l) => l.status === "approved");
  const ask = await askState(ws);

  return (
    <>
      <PageHeader title="Analyst" subtitle={`Questions about your portfolio, answered from ${m.name} and your own figures.`} />
      <PageBody>
        {ask.ask ? (
          <AskClaudeCard feature="analyst" connected={ask.connected} demo={ws.mode === "demo"} open />
        ) : ws.mode === "demo" ? (
          <p className="mb-6 rounded-card border border-hairline bg-surface-1 px-4 py-3 text-subhead text-text-secondary">
            The demo runs no analyst. Signed in, a question is planned by the AI and every figure is computed by the app from your methodology&apos;s recipes.
          </p>
        ) : (
          <div className="mb-8">
            <h2 className="section-header mb-2 px-1">New conversation</h2>
            <AskForm thread={null} hasKey={ws.hasModelKey} placeholder={PLACEHOLDER[family]} />
          </div>
        )}

        {threads.length ? (
          <ListSection grid header={`${threads.length} ${threads.length === 1 ? "conversation" : "conversations"}`} footer="Kept in your vault, with how each answer was worked out.">
            {threads.map((t) => {
              const last = t.messages.at(-1);
              return <ListLinkRow key={t.id} href={`/analyst/${t.id}` as Route} label={t.title} detail={`${t.messages.length} ${t.messages.length === 1 ? "message" : "messages"} · ${t.updatedAt.slice(0, 10)}${last && last.role === "analyst" ? ` · ${last.text.replace(/\s+/g, " ").slice(0, 90)}${last.text.length > 90 ? "…" : ""}` : ""}`} />;
            })}
          </ListSection>
        ) : ws.mode === "drive" ? (
          <div className="mb-8 card">
            <EmptyState icon={MessageSquareText} title="No conversations yet" instruction="Ask about a holding, a rule, a cap or a figure. The answer names what was computed and which section of your methodology it rests on." action={null} />
          </div>
        ) : null}

        {proposed.length || approved.length ? (
          <ListSection grid header="Lessons" footer="A lesson is a standing instruction the analyst proposed when your methodology did not say how to judge something. Approved lessons go into every later answer; proposed ones do nothing until you approve them. Your methodology itself is never changed.">
            {proposed.map((l) => (
              <LessonRow key={l.id} lesson={l} />
            ))}
            {approved.map((l) => (
              <LessonRow key={l.id} lesson={l} />
            ))}
          </ListSection>
        ) : null}

        <ListSection header="How an answer is made" footer="Not investment advice.">
          <ListRow wrap label="The plan is the analysis" detail="The model decides which figures answer the question and writes each as a recipe over the ontology. The app validates the recipe and computes it the way the Dashboard does; the model never does arithmetic, and a number that did not come from a computation does not appear." />
          <ListRow wrap label="Verdicts from your methodology" detail="Rules, caps and classes run with your methodology's own recipes on your book, and every verdict cites its section. A rule the app cannot measure is yours to check, never called passing." />
          <ListRow wrap label="Your vault is the context" detail={`What the analyst knows is what your vault holds: ${FAMILY_LABEL[family].toLowerCase()} methodology, research studies, past reports, your records. It searches them; it does not recall.`} />
          <ListRow wrap label="Outputs become inputs" detail="A figure the analyst computed can be kept as one of your own figures and shows on the Dashboard from then on. A lesson it proposes takes effect only when you approve it." trailing={<StatusPill tone="info">On your key</StatusPill>} />
        </ListSection>
      </PageBody>
    </>
  );
}
