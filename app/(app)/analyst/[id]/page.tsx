import { notFound } from "next/navigation";

import { AskForm, KeepFigures, ThreadControls, Trace } from "@/components/analyst/forms";
import { Markdown } from "@/components/research/markdown";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { screen } from "@/lib/workspace";

export const metadata = { title: "Conversation · Invariant" };
// A follow-up is one agent run on the person's key.
export const maxDuration = 300;

/** One conversation: the questions and answers in order, each answer with its trace and the figures it computed. */
export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await screen("analyst");
  const thread = ws.analyst.threads.find((t) => t.id === id);
  if (!thread) notFound();
  const kept = new Set(ws.preferences.figures.map((f) => f.label));

  return (
    <>
      <PageHeader title={thread.title} subtitle={`${thread.messages.length} ${thread.messages.length === 1 ? "message" : "messages"} · started ${thread.createdAt.slice(0, 10)}`} />
      <PageBody>
        <ol className="mb-8 space-y-3">
          {thread.messages.map((msg, i) =>
            msg.role === "person" ? (
              <li key={i} className="ml-6 rounded-card border border-accent/40 bg-accent-subtle px-4 py-3 sm:ml-16">
                <p className="text-footnote text-text-tertiary">You · {msg.at.slice(0, 16).replace("T", " ")}</p>
                <p className="mt-1 whitespace-pre-wrap text-body">{msg.text}</p>
              </li>
            ) : (
              <li key={i} className="mr-6 card px-4 py-3 sm:mr-16">
                <p className="text-footnote text-text-tertiary">Analyst · {msg.at.slice(0, 16).replace("T", " ")}</p>
                <div className="mt-1">
                  <Markdown text={msg.text} />
                </div>
                {ws.mode === "drive" ? <KeepFigures thread={thread.id} message={i} figures={msg.figures} kept={kept} /> : null}
                <Trace steps={msg.trace} />
              </li>
            ),
          )}
        </ol>

        {ws.mode === "drive" ? (
          <div className="mb-8">
            {ws.askClaude ? <p className="px-1 text-footnote text-text-tertiary">Follow-up questions go to your own Claude: the Analyst screen has the prompt.</p> : <AskForm thread={thread.id} hasKey={ws.hasModelKey} placeholder="And against the cap in 3.1?" />}
          </div>
        ) : null}

        {ws.mode === "drive" ? <ThreadControls id={thread.id} /> : null}
        <p className="mt-6 px-1 text-footnote text-text-tertiary">Every figure above was computed by the app from a recipe; every verdict ran your methodology&apos;s own rules. Not investment advice.</p>
      </PageBody>
    </>
  );
}
