import { CopyButton } from "@/components/app/copy-button";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import { ReadStatements, StatementDocuments } from "@/components/statements/documents";
import { ForwardingWatch } from "@/components/statements/forwarding-watch";
import { InboxCheck } from "@/components/statements/inbox-check";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { INPUTS } from "@/lib/setup";
import { confirmationOf } from "@/lib/inbox";
import { forwardingFor, screen, statementsAddress } from "@/lib/workspace";

export const metadata = { title: "Statements · Invariant" };

/** A few long fund reports read side by side can take minutes. */
export const maxDuration = 300;

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-center gap-3 px-1">
        <span className="data inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-subhead text-white">{n}</span>
        <h2 className="text-title-3 font-semibold">{title}</h2>
      </div>
      <div className="card px-4 py-4 text-body leading-relaxed">{children}</div>
    </section>
  );
}

/**
 * The owner's whole setup, in the fewest steps a non-technical person can
 * follow. Everything technical happens on the operator's side.
 */
export default async function StatementsPage() {
  const ws = await screen("statements");
  const c = confirmationOf(await forwardingFor(ws), "statements");
  const kept = c ? { confirmedAt: c.confirmedAt, how: c.how } : null;
  const inbox = statementsAddress(ws.operator.email);
  const op = ws.setup.helperName ?? "the person who runs Invariant";
  const kinds = ws.setup.inputs.filter((i) => INPUTS[i].group === "email").map((i) => INPUTS[i].label.toLowerCase());
  const hasProperty = ws.setup.inputs.includes("property");

  return (
    <>
      <PageHeader fresh={<ScreenFreshness kind="daily" />} title="Statements" subtitle="Bank statements and fund reports, read with the AI and checked against each document" />
      <PageBody>
        <ReadStatements demo={ws.mode === "demo"} hasKey={ws.hasModelKey} />
        <StatementDocuments file={ws.statements} notes={ws.statementNotes} demo={ws.mode === "demo"} />
        <h2 className="section-header mb-4 px-4">Every statement by email</h2>
        <Step n={1} title="You are signed in">
          <p>That was the hardest part. Everything you send here is kept in your own vault, with the rest of your files.</p>
        </Step>

        <Step n={2} title="Send your statements here automatically (on a computer, once)">
          <p className="mb-3">
            Your {kinds.join(" and ")} will be copied here as soon as they arrive. Gmail only allows this from a computer, so do it once at a desk, or ask {op} to sit with you. It takes about five
            minutes.
          </p>
          <ol className="mb-4 list-decimal space-y-2 pl-5">
            <li>
              Open Gmail on a computer. Click the gear at the top right, then <b>See all settings</b>, then the <b>Forwarding and POP/IMAP</b> tab.
            </li>
            <li>
              Click <b>Add a forwarding address</b>, paste this address, then <b>Next</b> and <b>Proceed</b>. Gmail sends a confirmation request to it.
            </li>
          </ol>
          {inbox ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-[10px] bg-surface-2 px-3 py-2">
              <span className="data min-w-0 truncate text-subhead">{inbox}</span>
              <CopyButton text={inbox} />
            </div>
          ) : (
            <p className="mb-4 rounded-[10px] bg-surface-2 px-3 py-2 text-subhead text-text-secondary">Your statements address is not set up yet. {op} adds it once; it appears here.</p>
          )}
          <ol start={3} className="mb-4 list-decimal space-y-2 pl-5">
            <li>
              Leave this page open: it confirms Gmail&rsquo;s request by itself within a minute, pressing Google&rsquo;s Confirm for you, and says so below once Google agrees. Should
              Google want the click from you, a Confirm in Google button appears here: one press on Google&rsquo;s page finishes it. Leave forwarding itself off: only the filters below send anything.
            </li>
          </ol>
          {inbox && ws.mode === "drive" ? (
            <div className="mb-4">
              <ForwardingWatch kind="statements" kept={kept} next="Go on to the filters below." />
            </div>
          ) : null}
          {inbox && ws.mode === "drive" ? (
            <div className="mb-4">
              <InboxCheck />
            </div>
          ) : null}
          <ol start={4} className="mb-4 list-decimal space-y-2 pl-5">
            <li>
              For each bank or fund that emails you statements: in the Gmail search bar, type its email address, click the sliders icon at the right of the search bar, click <b>Create filter</b>, tick{" "}
              <b>Forward it to</b>, choose the address above, and click <b>Create filter</b>.
            </li>
          </ol>
        </Step>

        <Step n={3} title="When a bank only says “your statement is ready”">
          <p>
            Some banks send a notice instead of the statement. Download the PDF from the bank as usual, then share it by email to the address in step 2. On a phone: open the PDF, tap Share, choose
            Mail, paste the address, send from your own account. Or upload it with Read at the top of this screen. A notice that arrives without a PDF is listed here, so you can see which statement to fetch.
          </p>
        </Step>

        {hasProperty ? (
          <Step n={4} title="Tell us about your properties">
            <p>
              For each property: the area or address, roughly its size, whether it is rented long-term, rented short-stay or for your own use, what you think it is worth, and any mortgage. Tell {op};
              they are entered for you. Each one is then watched every week for rents nearby and local news that could move its price.
            </p>
          </Step>
        ) : null}

        <p className="px-1 text-footnote text-text-secondary">
          That is all. What arrives is read every morning, or at once with Check the inbox now. Only mail sent or forwarded from your own account is read; a document whose figures do not all check
          waits here for you.
        </p>
      </PageBody>
    </>
  );
}
