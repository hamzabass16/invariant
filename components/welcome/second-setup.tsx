import { Check } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { finishWelcomeAction } from "@/app/welcome/actions";
import { AssetsCard, FilingsCard, IbkrCard, MethodologyCard, ModelCard, MorningCard, NewslettersCard, OtherBrokersCard, PodcastsCard, StatementsCard, ThesesCard } from "@/components/setup/input-cards";
import { SetupOverview } from "@/components/setup/overview";
import type { SetupData } from "@/components/setup/setup-data";
import { Button, buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WELCOME_STEPS, type WelcomeStep } from "@/lib/welcome";

/**
 * Welcome's second part, once the app is built: Setup's own cards, one group
 * per step, with why each matters. Every step can be skipped; the answers
 * land in the same place Setup changes them later. The last step opens the
 * app with the tour.
 */
export function SecondSetup({ d, step }: { d: SetupData; step: WelcomeStep }) {
  const i = WELCOME_STEPS.findIndex((s) => s.id === step.id);
  const prev = WELCOME_STEPS[i - 1] ?? null;
  const next = WELCOME_STEPS[i + 1] ?? null;
  const href = (s: WelcomeStep) => `/welcome?step=${s.id}` as Route;
  const equities = d.theses.folders.length;

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-10">
      {/* The rail: every step, the current one lit, the ones before checked. */}
      <ol className="mb-6 flex gap-2 overflow-x-auto lg:mb-0 lg:block lg:space-y-1" aria-label="Steps">
        {WELCOME_STEPS.map((s, j) => {
          const done = j < i;
          const now = j === i;
          return (
            <li key={s.id} className="shrink-0">
              <Link href={href(s)} className={cn("flex items-start gap-3 rounded-xl px-3 py-2 transition-colors lg:py-2.5", now ? "bg-accent-subtle" : "hover:bg-surface-2")} aria-current={now ? "step" : undefined}>
                <span className={cn("data mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold", done ? "bg-ok text-white" : now ? "bg-accent text-white" : "bg-surface-3 text-text-tertiary")} aria-hidden>
                  {done ? <Check className="size-3.5" strokeWidth={3} /> : j + 1}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-subhead font-medium", now ? "text-text" : "text-text-secondary")}>{s.label}</span>
                  <span className="hidden text-caption text-text-tertiary lg:block">{s.why}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      <div className="min-w-0">
        <p className="section-header">
          {i + 1}. {step.label}
        </p>
        <h2 className="mt-2 text-title-2 font-semibold">{step.title}</h2>
        <p className="mt-2 mb-6 max-w-2xl text-subhead text-text-secondary">{step.why}</p>

        {step.id === "rules" ? (
          <>
            <MethodologyCard {...d.methodology} />
            <ModelCard {...d.model} />
          </>
        ) : null}

        {step.id === "money" ? (
          <>
            {d.showIbkr ? <IbkrCard {...d.ibkr} /> : null}
            {d.brokers.showSnapTrade || d.brokers.showEtoro ? <OtherBrokersCard {...d.brokers} /> : null}
            {d.showStatements ? <StatementsCard {...d.statements} /> : null}
            {d.has("property") ? <AssetsCard kind="property" helper={d.helper} count={d.realEstate} /> : null}
            {d.has("other_assets") ? <AssetsCard kind="other_assets" helper={d.helper} count={d.otherAssets} /> : null}
          </>
        ) : null}

        {step.id === "holdings" ? (
          equities ? (
            <ThesesCard {...d.theses} />
          ) : (
            <section className="card px-4 py-5 lg:px-6">
              <p className="text-title-3 font-semibold">No listed holding yet</p>
              <p className="mt-2 text-subhead text-text-secondary">
                Once your holdings are in, each listed company gets a folder: your thesis in your own words, your bear, base and bull per share, and on Theses its pillars, kill signals and the Valuation calculator. {d.demo ? "The demo's theses are fictional." : "Add a statement or a broker on the step before, or write them later on Theses."}
              </p>
              {prev ? (
                <Link href={href(prev)} className={cn(buttonStyles({ variant: "secondary", size: "sm" }), "mt-4")}>
                  Back to your money
                </Link>
              ) : null}
            </section>
          )
        ) : null}

        {step.id === "reads" ? (
          <>
            <FilingsCard {...d.filings} />
            <MorningCard {...d.morning} />
            <NewslettersCard {...d.newsletters} />
            <PodcastsCard {...d.podcasts} />
          </>
        ) : null}

        {step.id === "done" ? (
          <>
            <SetupOverview items={d.overview} demo={d.demo} />
            <p className="-mt-6 mb-6 text-footnote text-text-tertiary">What is not in use yet waits on Setup, under the same card. {d.demo ? "The demo keeps nothing." : "A short tour of your app follows."}</p>
          </>
        ) : null}

        <div className="mt-7 flex flex-wrap items-center gap-3">
          {prev ? (
            <Link href={href(prev)} className={buttonStyles({ variant: "secondary" })}>
              Back
            </Link>
          ) : null}
          {next ? (
            <Link href={href(next)} className={cn(buttonStyles({}), "flex-1 text-center lg:flex-none")}>
              Continue
            </Link>
          ) : null}
          <form action={finishWelcomeAction} className={next ? "ml-auto" : "flex-1 lg:flex-none"}>
            {next ? (
              <button type="submit" className="text-footnote text-text-tertiary underline-offset-4 hover:underline">
                Skip the rest and open my app
              </button>
            ) : (
              <Button type="submit" size="lg" className="w-full lg:w-auto">
                {d.demo ? "Open the app" : "Open my app and take the tour"}
              </Button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
