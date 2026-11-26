"use client";

import { Briefcase, Building2, Check, FileText, Gem, Globe, House, Landmark, Mail, User, Users, type LucideIcon } from "lucide-react";
import { useActionState, useState } from "react";

import { saveSetupAction, type SaveState } from "@/app/(app)/setup/actions";
import { navFor } from "@/components/app/nav-items";
import { DoneMark } from "@/components/app/done-mark";
import { Button } from "@/components/ui/button";
import type { AssetClass } from "@/lib/holdings";
import { SCREENS, type ScreenId } from "@/lib/ontology";
import { screensOn, shownWhen } from "@/lib/screens";
import { INPUT_GROUP_LABEL, INPUTS, INPUT_IDS, modulesFor, PROFILE_IDS, PROFILES, type InputGroup, type InputId, type ProfileId, type Setup } from "@/lib/setup";
import { cn } from "@/lib/utils";
import { reached } from "@/components/app/reach";

/**
 * The first setup, on Welcome: what a new person tells the app, why each
 * input matters, and what the app builds from it. The same answers as the
 * four steps on Setup (components/setup/setup-wizard.tsx), which is where
 * they are changed later; this is the first telling, laid out to be read.
 * Pick what applies today: every input can be added on Setup afterwards.
 */

const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "AED", "SAR", "CAD", "AUD", "SGD", "HKD", "JPY"];
const BROKERS: InputId[] = ["ibkr", "schwab", "other_broker", "etoro"];

export type Stage = { id: "files" | "who" | "where" | "details" | "app"; label: string; why: string };

const STAGES: Stage[] = [
  { id: "files", label: "Your files", why: "Where the app keeps what it builds for you." },
  { id: "who", label: "Who it is for", why: "Pre-ticks the usual places money is reported." },
  { id: "where", label: "Where your money is", why: "Each place adds the screens it needs." },
  { id: "details", label: "A few details", why: "Your name and the currency everything is shown in." },
  { id: "app", label: "Your app", why: "What is built, and what you do next, once." },
];

const ICON: Record<InputId, LucideIcon> = { ibkr: Landmark, schwab: Building2, other_broker: Briefcase, etoro: Globe, bank_statements: Mail, fund_reports: FileText, property: House, other_assets: Gem };
const PROFILE_ICON: Record<ProfileId, LucideIcon> = { individual: User, family_office: Users };

const CLASS_WORDS: Record<AssetClass, string> = { equity: "shares", etf: "funds", option: "options", bond: "bonds", deposit: "deposits", cash: "cash", private_fund: "private funds", real_estate: "property", other: "other assets" };

/** What each screen is for, in a line, for the last stage; the ontology's own first sentence for any not named here. */
const SCREEN_ABOUT: Partial<Record<ScreenId, string>> = {
  today: "Net worth and the day, this year against SPY and QQQ, the session, and why each holding moved.",
  notifications: "What needs a decision: breaches, watches, dates, trades without a reason.",
  holdings: "Every holding by weight and by class, concentration, how they move together.",
  performance: "Returns, growth, risk and drawdown against the benchmarks your methodology names.",
  markets: "Indicators, the cycle, liquidity, the economy, the world and the major economies.",
  earnings: "When each company reports, an alert the day before, a report and a deck after.",
  trades: "Every fill, what a win makes against what a loss costs, the rotations.",
  signals: "Each holding's triggers and kill signals, read against its latest filings.",
  watchlist: "Companies you follow, with the levels you set.",
  theses: "One folder per holding: the thesis, its pillars, the Valuation calculator, the decks.",
  calendar: "Expiries, results and the dates your rules name.",
  reviews: "The weekly and monthly review, built from the same data, sent by email with a deck.",
  methodology: "The rules you invest by, read: classes, rules, figures and what each needs from you.",
  options: "Contracts, strategies, Greeks, premium and expiries.",
  fixed_income: "Bonds and deposits: maturities, yields, issuers.",
  funds: "Private funds: commitments, calls, and the companies inside them.",
  properties: "Each property's equity and a weekly watch on prices and local news.",
  statements: "Your statements address and how to forward to it.",
  more: "Every input in one place, to change your answers later.",
};
const aboutOf = (id: ScreenId) => SCREEN_ABOUT[id] ?? SCREENS[id].about.split(/(?<=\.)\s/)[0];

/** What the app reads for everyone by itself, said once, so the inputs are seen against it. */
const BY_ITSELF = ["Company filings from the SEC, every morning and when you open the app", "Results after each earnings day, with a report and a deck", "Markets, the session and why each holding moved, after the close", "A morning refresh of every connection, and alerts by email"];

function Pick({ selected, onClick, icon: Icon, title, detail, brings, role = "radio" }: { selected: boolean; onClick: () => void; icon: LucideIcon; title: string; detail: string; brings?: string; role?: "radio" | "checkbox" }) {
  return (
    <button type="button" role={role} aria-checked={selected} onClick={onClick} className={cn("flex w-full items-start gap-3 rounded-card border px-4 py-3.5 text-left transition-colors", selected ? "border-accent bg-accent-subtle" : "border-hairline bg-surface hover:bg-surface-2")}>
      <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl", selected ? "bg-accent text-text" : "bg-surface-2 text-accent-text")} aria-hidden>
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-medium">{title}</span>
        <span className="mt-0.5 block text-footnote text-text-secondary">{detail}</span>
        {brings ? <span className="mt-1 block text-caption text-text-tertiary">Brings in {brings}</span> : null}
      </span>
      <span className={cn("mt-1 flex size-5 shrink-0 items-center justify-center border", role === "radio" ? "rounded-full" : "rounded-md", selected ? "border-accent bg-accent text-text" : "border-text-tertiary")} aria-hidden>
        {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

export function FirstSetup({ mode, drive, name }: { mode: "demo" | "drive"; drive: { linked: boolean; outcome: string | null; href: string } | null; name: string | null }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(reached(saveSetupAction), { error: null });
  const stages = drive ? STAGES : STAGES.filter((s) => s.id !== "files");
  const [stage, setStage] = useState(drive && !drive.linked ? 0 : drive ? 1 : 0);
  const [profile, setProfile] = useState<ProfileId | null>(null);
  const [inputs, setInputs] = useState<InputId[]>([]);
  const [touched, setTouched] = useState(false);
  const [tradesOptions, setTradesOptions] = useState(false);
  const [ownerName, setOwnerName] = useState(name ?? "");
  const [currency, setCurrency] = useState("USD");
  const [helperName, setHelperName] = useState("");

  const current = stages[stage];
  const pickProfile = (p: ProfileId) => {
    setProfile(p);
    if (!touched) {
      setInputs([...PROFILES[p].suggested]);
      setTradesOptions(p === "individual");
      setCurrency(PROFILES[p].defaultCurrency);
    }
  };
  const toggle = (id: InputId) => {
    setTouched(true);
    setInputs((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  };
  const hasBroker = inputs.some((i) => BROKERS.includes(i));
  const preview: Setup | null = profile ? { version: 1, ownerName: ownerName || "You", profile, baseCurrency: currency, inputs: inputs.length ? inputs : ["other_assets"], tradesOptions: hasBroker && tradesOptions, helperName: helperName || null, methodology: null, updated: "" } : null;
  // The screens a first build switches on: the inputs' modules, on the skeleton before any methodology.
  const built = preview ? navFor(modulesFor(preview, null), screensOn(shownWhen(null, null, null, null))) : [];
  const canNext: Record<Stage["id"], boolean> = { files: !!drive?.linked, who: !!profile, where: inputs.length > 0, details: ownerName.trim().length > 0, app: true };
  const brings = (id: InputId) => [...new Set(INPUTS[id].brings.map((c) => CLASS_WORDS[c]))].join(", ");

  return (
    <form action={action} className="lg:grid lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:gap-10">
      {/* The rail: every stage, the current one lit, the ones done checked. */}
      <ol className="mb-6 flex gap-2 overflow-x-auto lg:mb-0 lg:block lg:space-y-1" aria-label="Stages">
        {stages.map((s, i) => {
          const done = i < stage || (s.id === "files" && !!drive?.linked);
          const now = i === stage;
          return (
            <li key={s.id} className={cn("flex shrink-0 items-start gap-3 rounded-card px-3 py-2.5 lg:px-3", now ? "bg-accent-subtle" : "")}>
              <span className={cn("data mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-caption", done ? "border-ok bg-ok text-text" : now ? "border-accent text-accent-text" : "border-hairline-strong text-text-tertiary")} aria-hidden>
                {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cn("block text-subhead font-medium", now ? "text-text" : done ? "text-text-secondary" : "text-text-tertiary")}>{s.label}</span>
                <span className="hidden text-caption text-text-tertiary lg:block">{s.why}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <div className="card px-4 py-5 lg:px-8 lg:py-7">
        {/* Every answer stays in the form on every stage, so the last stage submits them all. */}
        <input type="hidden" name="profile" value={profile ?? ""} />
        {inputs.map((i) => (
          <input key={i} type="hidden" name="inputs" value={i} />
        ))}
        <input type="hidden" name="tradesOptions" value={hasBroker && tradesOptions ? "yes" : "no"} />
        <input type="hidden" name="ownerName" value={ownerName} />
        <input type="hidden" name="baseCurrency" value={currency} />
        <input type="hidden" name="helperName" value={helperName} />

        {current.id === "files" && drive ? (
          <section>
            <p className="section-header">1. Your files</p>
            <h2 className="mt-2 text-title-2 font-semibold">Where the app keeps what it builds</h2>
            <p className="mt-3 text-subhead text-text-secondary">Invariant keeps everything about you in a folder called Portfolio OS in your own Google Drive: your answers, your holdings, your methodology, every report. It can see that folder and nothing else in your Drive, and nothing of your money is kept on this server.</p>
            {drive.linked ? (
              <div className="mt-6 rounded-card border border-ok/40 bg-ok/10 px-4 py-3">
                <DoneMark label="Google Drive connected" />
              </div>
            ) : (
              <>
                {drive.outcome === "denied" ? <p className="mt-6 rounded-card bg-danger/15 px-4 py-3 text-subhead text-danger">Google did not give the folder permission. Try again and leave the box for the app&apos;s own files ticked.</p> : null}
                {drive.outcome === "failed" ? <p className="mt-6 rounded-card bg-danger/15 px-4 py-3 text-subhead text-danger">The link could not be kept. Try again in a moment.</p> : null}
                {drive.outcome === "unavailable" ? <p className="mt-6 rounded-card bg-danger/15 px-4 py-3 text-subhead text-danger">This deployment cannot keep a Drive link yet. Ask the person who runs it.</p> : null}
                <a href={drive.href} className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-control bg-accent px-4 text-body font-medium text-text shadow-[0_1px_0_var(--edge)_inset,0_8px_20px_-12px_var(--accent)] hover:brightness-110 lg:w-auto">
                  Connect Google Drive
                </a>
                <p className="mt-3 text-footnote text-text-tertiary">Google asks you to choose an account and to allow the app its own files. Nothing else is asked for.</p>
              </>
            )}
          </section>
        ) : null}

        {current.id === "who" ? (
          <section>
            <p className="section-header">{drive ? "2" : "1"}. Who it is for</p>
            <h2 className="mt-2 text-title-2 font-semibold">Who is this for?</h2>
            <p className="mt-2 text-subhead text-text-secondary">Pre-ticks the places money is usually reported for someone like you. You change any of it on the next step.</p>
            <div className="mt-5 space-y-3" role="radiogroup" aria-label="Profile">
              {PROFILE_IDS.map((p) => (
                <Pick key={p} selected={profile === p} onClick={() => pickProfile(p)} icon={PROFILE_ICON[p]} title={PROFILES[p].label} detail={PROFILES[p].blurb} brings={PROFILES[p].suggested.map((i) => INPUTS[i].label).join(", ")} />
              ))}
            </div>
          </section>
        ) : null}

        {current.id === "where" ? (
          <section>
            <p className="section-header">{drive ? "3" : "2"}. Where your money is</p>
            <h2 className="mt-2 text-title-2 font-semibold">Where is your money reported?</h2>
            <p className="mt-2 text-subhead text-text-secondary">Tick what applies today. Each place switches on the screens it needs; the connection itself (a read-only token or key, with a step-by-step guide) is kept on Setup afterwards. Nothing here can trade.</p>
            {(["broker", "email", "manual"] as InputGroup[]).map((g) => (
              <div key={g} className="mt-6">
                <p className="section-header mb-2 px-1">{INPUT_GROUP_LABEL[g]}</p>
                <div className="space-y-2">
                  {INPUT_IDS.filter((id) => INPUTS[id].group === g).map((id) => (
                    <Pick key={id} role="checkbox" selected={inputs.includes(id)} onClick={() => toggle(id)} icon={ICON[id]} title={INPUTS[id].label} detail={INPUTS[id].how} brings={brings(id)} />
                  ))}
                </div>
              </div>
            ))}
            {hasBroker ? (
              <div className="mt-6 rounded-card border border-hairline bg-surface px-4 py-3">
                <p className="text-body font-medium">Do you trade options?</p>
                <p className="mb-3 text-footnote text-text-secondary">Adds the Options screen now, before the first contract arrives.</p>
                <div className="flex gap-2">
                  {[
                    ["yes", "Yes"],
                    ["no", "No"],
                  ].map(([v, l]) => (
                    <Button key={v} type="button" size="sm" variant={(v === "yes") === tradesOptions ? "primary" : "secondary"} onClick={() => setTradesOptions(v === "yes")} aria-pressed={(v === "yes") === tradesOptions}>
                      {l}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-6 rounded-card bg-surface-2 px-4 py-3">
              <p className="section-header">Read for you, by itself</p>
              <ul className="mt-2 space-y-1.5 text-footnote text-text-secondary">
                {BY_ITSELF.map((line) => (
                  <li key={line} className="flex gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-ok" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {current.id === "details" ? (
          <section>
            <p className="section-header">{drive ? "4" : "3"}. A few details</p>
            <h2 className="mt-2 text-title-2 font-semibold">A few details</h2>
            <label className="mt-5 block">
              <span className="mb-1 block text-subhead">Your name</span>
              <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={40} autoComplete="given-name" className="h-12 w-full rounded-[10px] border border-hairline bg-surface px-3 text-body" placeholder="How the app should address you" />
            </label>
            <label className="mt-4 block">
              <span className="mb-1 block text-subhead">Show everything in</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={mode === "demo"} className="h-12 w-full rounded-[10px] border border-hairline bg-surface px-3 text-body">
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              {mode === "demo" ? <span className="mt-1 block text-footnote text-text-tertiary">The demo uses its sample&apos;s currency.</span> : <span className="mt-1 block text-footnote text-text-tertiary">Holdings in other currencies are converted at the day&apos;s rate.</span>}
            </label>
            <label className="mt-4 block">
              <span className="mb-1 block text-subhead">Someone helping you set up (optional)</span>
              <input value={helperName} onChange={(e) => setHelperName(e.target.value)} maxLength={40} className="h-12 w-full rounded-[10px] border border-hairline bg-surface px-3 text-body" placeholder="A first name" />
              <span className="mt-1 block text-footnote text-text-tertiary">Named in your instructions, so you know who to ask.</span>
            </label>
          </section>
        ) : null}

        {current.id === "app" ? (
          <section>
            <p className="section-header">{drive ? "5" : "4"}. Your app</p>
            <h2 className="mt-2 text-title-2 font-semibold">Built from your answers</h2>
            <p className="mt-2 text-subhead text-text-secondary">These screens are switched on now. Attach your methodology on Setup and the Dashboard is rebuilt around its rules.</p>
            <div className="mt-5 overflow-hidden rounded-card border border-hairline">
              {built.map(({ id, href, label, icon: Icon }) => (
                <div key={href} className="flex items-start gap-3 border-b border-hairline px-4 py-3 last:border-0">
                  <Icon className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-body">{label}</p>
                    <p className="text-footnote text-text-secondary">{aboutOf(id)}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="section-header mt-6 mb-2 px-1">What you do next, once, on Setup</p>
            <ol className="list-decimal space-y-2 rounded-card border border-hairline py-3 pr-4 pl-9 text-subhead">
              {inputs.map((i) => (
                <li key={i}>
                  <b className="font-medium">{INPUTS[i].label}.</b> {INPUTS[i].ownerStep}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-footnote text-text-tertiary">A short tour follows, and ends where these answers are changed.</p>
          </section>
        ) : null}

        {state.error ? <p className="mt-5 rounded-card bg-danger/15 px-4 py-3 text-subhead text-danger">{state.error}</p> : null}

        <div className="mt-7 flex gap-3">
          {stage > 0 && !(current.id === "who" && drive?.linked) ? (
            <Button type="button" variant="secondary" onClick={() => setStage(stage - 1)}>
              Back
            </Button>
          ) : null}
          {current.id === "files" && !drive?.linked ? null : stage < stages.length - 1 ? (
            // Separate keys: reusing one element would turn the clicked Continue into a submit mid-click and send the form early.
            <Button key="next" type="button" className="flex-1 lg:flex-none" disabled={!canNext[current.id]} onClick={() => setStage(stage + 1)}>
              Continue
            </Button>
          ) : (
            <Button key="submit" type="submit" className="flex-1 lg:flex-none" loading={pending}>
              Build my app
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
