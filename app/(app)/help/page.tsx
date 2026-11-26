import { BookOpen, Compass, Mail, PlugZap, ShieldCheck } from "lucide-react";
import type { Route } from "next";

import { contactAddress } from "@/lib/deployment";
import { ListLinkRow, ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { getWorkspace } from "@/lib/workspace";

export const metadata = { title: "Help and support · Invariant" };

const QUESTIONS: [string, string][] = [
  ["Why does a figure say what it needs instead of a number?", "A figure the methodology asks for reads data no input supplies yet. It names the input; once that input is on Setup the figure appears. It never shows a zero in the meantime."],
  ["Why is a rule marked as mine to check?", "The app cannot measure that rule from the data it reads, so it never shows it as passing. It stays yours to check until the methodology names a figure for it."],
  ["Can the app trade or move money?", "No. It reads your broker with read-only keys and never places, changes or cancels an order."],
  ["Where are my figures kept?", "In the Portfolio OS folder in your own Drive. The deployment keeps no copy of them."],
  ["How do I see one portfolio, or several together?", "Use the portfolio menu at the top of the page. With more than one portfolio it lists each one, all of them together, and a choice of the ones to put together."],
];

/**
 * Help and support (Hamza, 19 Oct 2026: in the menu under the person's
 * initials): where each guide is, the tour, a few plain answers, and the one
 * address to write to.
 */
export default async function HelpPage() {
  const ws = await getWorkspace();
  const tour = (ws.showcase ? "/try" : "/setup?tour=1") as Route;
  const contact = contactAddress();
  return (
    <>
      <PageHeader title="Help and support" subtitle="Guides, the tour, plain answers, and where to write." />
      <PageBody>
        <div className="flow-cols">
          <div className="flow-col">
            <ListSection grid header="Start here" className="mb-8">
              <ListLinkRow href={tour} label="Take the tour" detail="A few steps through the screens, from Setup to Customise." leading={<Compass className="size-5 shrink-0 text-text-secondary" aria-hidden />} />
              <ListLinkRow href={"/setup" as Route} label="Connection guides" detail="Each input on Setup carries its own step-by-step guide, in the broker's own words." leading={<PlugZap className="size-5 shrink-0 text-text-secondary" aria-hidden />} />
              <ListLinkRow href={"/methodology" as Route} label="Your methodology" detail="What the app checks, each rule with its section and the figure it tests." leading={<BookOpen className="size-5 shrink-0 text-text-secondary" aria-hidden />} />
              <ListLinkRow href={"/privacy" as Route} label="Privacy and your data" detail="Where your money stays, what is kept and what goes out." leading={<ShieldCheck className="size-5 shrink-0 text-text-secondary" aria-hidden />} />
            </ListSection>
            {contact ? (
              <ListSection header="Write to us" className="mb-8" footer="Never send a password, a key or a statement by email.">
                <ListRow wrap label={<a href={`mailto:${contact}`} className="text-accent-text">{contact}</a>} detail="Questions, a figure that looks wrong, a broker the app does not read yet. It is also the address your reports come from." leading={<Mail className="size-5 shrink-0 text-text-secondary" aria-hidden />} />
              </ListSection>
            ) : null}
          </div>
          <div className="flow-col">
            <ListSection header="Common questions" className="mb-8">
              {QUESTIONS.map(([q, a]) => (
                <ListRow key={q} wrap label={q} detail={a} />
              ))}
            </ListSection>
          </div>
        </div>
        <p className="px-1 text-caption text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
