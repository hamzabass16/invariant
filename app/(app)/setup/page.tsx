import { redirect } from "next/navigation";

import { AssetsCard, ClaudeCard, FilingsCard, IbkrCard, MethodologyCard, ModelCard, MorningCard, NewslettersCard, OtherBrokersCard, PodcastsCard, PortfoliosCard, ProfileCard, StatementsCard, ThesesCard, VaultCard } from "@/components/setup/input-cards";
import { SetupOverview } from "@/components/setup/overview";
import { SetupGroup } from "@/components/setup/setup-card";
import { setupData } from "@/components/setup/setup-data";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { registryAvailable } from "@/lib/registry";
import { inputsWithoutData } from "@/lib/setup";
import { getWorkspace } from "@/lib/workspace";

export const metadata = { title: "Setup · Invariant" };
// Keep and fetch waits for IBKR to make the statement, which can take most of a minute; a methodology document takes longer.
export const maxDuration = 800;

/**
 * The one place every input lives, after Welcome's first telling. Everything
 * at a glance, then one card per input in five groups (your rules, your
 * money, what the app reads for you, how you see it, your account), each
 * saying what the app holds now and since when, with its actions and its
 * guide folded away. The cards' reading is shared with Welcome
 * (components/setup/setup-data.ts).
 */
export default async function SetupPage({ searchParams }: { searchParams: Promise<{ connected?: string; built?: string }> }) {
  const [ws, sp] = await Promise.all([getWorkspace(), searchParams]);
  // The first answers are given on Welcome; this page lists the inputs once there is a setup to list them for.
  if (!ws.setup) redirect("/welcome");
  const d = await setupData({ ...ws, setup: ws.setup }, sp);
  const { setup, demo, has, helper, url, methodology, model, showIbkr, ibkr, brokers, showStatements, statements, filings, morning, realEstate, otherAssets, overview } = d;
  const registry = registryAvailable();
  // The prompts name a held company with a thesis, else any held one; the person changes the ticker.

  return (
    <>
      <PageHeader title="Setup" subtitle={demo ? "Everything the app reads from a person, in one place. In the demo it shows what the snapshot holds; nothing here is kept." : "Everything the app reads from you, in one place: what it holds now, since when, and how to change it."} />
      <PageBody>
        {ws.error ? <p className="mb-6 rounded-card bg-danger/15 px-4 py-3 text-subhead text-danger">{ws.error}</p> : null}
        {sp.built ? <p className="reveal mb-6 rounded-card border border-ok/40 bg-ok/10 px-4 py-3 text-subhead text-ok">Your app is set up. Everything you gave it is here, card by card, and this is where to change any of it.</p> : null}
        <div data-tour="setup-overview">
          <SetupOverview items={overview} demo={demo} />
        </div>

        <SetupGroup n={1} title="Your rules" about="What the app judges your portfolio against, the AI that reads it, and your thesis and valuation on each holding.">
          <div data-tour="setup-methodology">
            <MethodologyCard {...methodology} />
          </div>
          <div data-tour="setup-model">
            <ModelCard {...model} />
          </div>
          <div data-tour="setup-theses">
            <ThesesCard {...d.theses} />
          </div>
        </SetupGroup>
        {/* The tour of a person's own app points at the groups (lib/tour.ts TOUR_APP). */}
        <div data-tour="setup-money">
          <SetupGroup n={2} title="Your money" about="Where your holdings come from. Each says what the app has now and when it last changed.">
          {showIbkr ? (
            <div data-tour="setup-ibkr">
              <IbkrCard {...ibkr} />
            </div>
          ) : null}
          <div data-tour="setup-brokers">
            <OtherBrokersCard {...brokers} />
          </div>
          {showStatements ? (
            <div data-tour="setup-statements">
              <StatementsCard {...statements} />
            </div>
          ) : null}
          {has("property") ? <AssetsCard kind="property" helper={helper} count={realEstate} /> : null}
          {has("other_assets") ? <AssetsCard kind="other_assets" helper={helper} count={otherAssets} /> : null}
          </SetupGroup>
        </div>

        <SetupGroup n={3} title="What the app reads for you" about="Filings and the morning refresh run by themselves; the newsletters you forward and the podcasts you follow are read with the AI.">
          <div data-tour="setup-automatic">
            <FilingsCard {...filings} />
            <MorningCard {...morning} />
          </div>
          <div data-tour="setup-newsletters">
            <NewslettersCard {...d.newsletters} />
            <PodcastsCard {...d.podcasts} />
          </div>
        </SetupGroup>

        <SetupGroup n={4} title="How you see it" about="Optional. Split your accounts into portfolios, or ask about them in your own Claude.">
          <div data-tour="setup-portfolios">
            <PortfoliosCard file={ws.portfolios} demo={demo} shared={ws.baseSetup?.methodology?.name ?? null} />
          </div>
          <div data-tour="setup-claude">
            <ClaudeCard url={url} demo={demo} />
          </div>
        </SetupGroup>

        <SetupGroup n={5} title="Your account" about="Your answers to the four steps, and where your files are kept.">
          <div data-tour="setup-account">
            <ProfileCard setup={setup}>
              <SetupWizard mode={ws.mode} initial={setup} waiting={ws.setup ? inputsWithoutData(ws.setup, ws.book) : []} />
            </ProfileCard>
          </div>
          {demo ? null : <VaultCard vault={ws.vault} buckets={registry} />}
        </SetupGroup>
        <p className="px-1 text-footnote text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
