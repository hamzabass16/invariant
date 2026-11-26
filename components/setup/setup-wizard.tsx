"use client";

import { Check } from "lucide-react";
import { useActionState, useState } from "react";

import { saveSetupAction, startOverAction, type SaveState } from "@/app/(app)/setup/actions";
import { NAV } from "@/components/app/nav-items";
import { Button } from "@/components/ui/button";
import { INPUT_GROUP_LABEL, INPUTS, INPUT_IDS, modulesFor, PROFILE_IDS, PROFILES, type InputGroup, type InputId, type ProfileId, type Setup } from "@/lib/setup";
import { cn } from "@/lib/utils";
import { reached } from "@/components/app/reach";

const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "AED", "SAR", "CAD", "AUD", "SGD", "HKD", "JPY"];
const STEPS = ["Who it is for", "Where your money is reported", "A few details", "Your app"];
const BROKERS: InputId[] = ["ibkr", "schwab", "other_broker", "etoro"];

/** What each screen is for, in a line, for the last step. */
const SCREEN_ABOUT: Record<string, string> = {
  overview: "The dashboard. Your methodology decides what leads it.",
  allocation: "Net worth by asset class, theme, country and account; what overlaps.",
  options: "Contracts, strategies, Greeks, premium and expiries.",
  fixed_income: "Bonds and deposits: maturities, yields, issuers.",
  funds: "Private funds: commitments, calls, and the companies inside them.",
  properties: "Each property's equity and a weekly watch on prices and local news.",
  statements: "Your statements address and how to forward to it.",
  methodology: "Attach the rules you invest by; the dashboard is rebuilt around them.",
  setup: "This screen, to change your answers later.",
};

function Choice({ selected, onClick, title, detail, role = "radio" }: { selected: boolean; onClick: () => void; title: string; detail: string; role?: "radio" | "checkbox" }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      onClick={onClick}
      className={cn("flex w-full items-start gap-3 rounded-card border px-4 py-3 text-left transition-colors", selected ? "border-accent bg-accent-subtle" : "border-hairline bg-surface hover:bg-surface-2")}
    >
      <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center border", role === "radio" ? "rounded-full" : "rounded-md", selected ? "border-accent bg-accent text-text" : "border-text-tertiary")} aria-hidden>
        {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-body font-medium">{title}</span>
        <span className="mt-0.5 block text-footnote text-text-secondary">{detail}</span>
      </span>
    </button>
  );
}

export function SetupWizard({ mode, initial, waiting }: { mode: "demo" | "drive"; initial: Setup | null; waiting: InputId[] }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(reached(saveSetupAction), { error: null });
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<ProfileId | null>(initial?.profile ?? null);
  const [inputs, setInputs] = useState<InputId[]>(initial?.inputs ?? []);
  const [touched, setTouched] = useState(!!initial);
  const [tradesOptions, setTradesOptions] = useState(initial?.tradesOptions ?? false);
  const [ownerName, setOwnerName] = useState(initial?.ownerName ?? "");
  const [currency, setCurrency] = useState(initial?.baseCurrency ?? "USD");
  const [helperName, setHelperName] = useState(initial?.helperName ?? "");

  const pickProfile = (p: ProfileId) => {
    setProfile(p);
    // The profile pre-ticks its usual inputs until the person changes them.
    if (!touched) {
      setInputs([...PROFILES[p].suggested]);
      setTradesOptions(p === "individual");
      if (!initial) setCurrency(PROFILES[p].defaultCurrency);
    }
  };
  const toggle = (id: InputId) => {
    setTouched(true);
    setInputs((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  };
  const hasBroker = inputs.some((i) => BROKERS.includes(i));
  const canNext = [!!profile, inputs.length > 0, ownerName.trim().length > 0, true][step];

  const preview: Setup | null = profile
    ? { version: 1, ownerName: ownerName || "You", profile, baseCurrency: currency, inputs: inputs.length ? inputs : ["other_assets"], tradesOptions: hasBroker && tradesOptions, helperName: helperName || null, methodology: null, updated: "" }
    : null;
  const screens = preview ? modulesFor(preview, null) : [];

  return (
    <form action={action}>
      <ol className="mb-6 flex gap-1.5" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <span className={cn("block h-1 rounded-full", i <= step ? "bg-accent" : "bg-surface-2")} aria-hidden />
            <span className={cn("mt-2 hidden text-caption lg:block", i === step ? "text-text" : "text-text-tertiary")}>{s}</span>
          </li>
        ))}
      </ol>
      <p className="mb-1 text-footnote text-text-tertiary lg:hidden">
        Step {step + 1} of {STEPS.length}
      </p>

      {/* Every field stays in the form on every step, so the last step submits them all. */}
      <input type="hidden" name="profile" value={profile ?? ""} />
      {inputs.map((i) => (
        <input key={i} type="hidden" name="inputs" value={i} />
      ))}
      <input type="hidden" name="tradesOptions" value={hasBroker && tradesOptions ? "yes" : "no"} />

      <section hidden={step !== 0}>
        <h2 className="mb-4 text-title-3 font-semibold">Who is this for?</h2>
        <div className="space-y-3" role="radiogroup" aria-label="Profile">
          {PROFILE_IDS.map((p) => (
            <Choice key={p} selected={profile === p} onClick={() => pickProfile(p)} title={PROFILES[p].label} detail={PROFILES[p].blurb} />
          ))}
        </div>
      </section>

      <section hidden={step !== 1}>
        <h2 className="mb-1 text-title-3 font-semibold">Where is your money reported?</h2>
        <p className="mb-4 text-subhead text-text-secondary">Tick everything that applies. Each one adds the screens it needs; you can change this later.</p>
        {(["broker", "email", "manual"] as InputGroup[]).map((g) => (
          <div key={g} className="mb-6">
            <p className="section-header mb-2 px-1">{INPUT_GROUP_LABEL[g]}</p>
            <div className="space-y-2">
              {INPUT_IDS.filter((id) => INPUTS[id].group === g).map((id) => (
                <Choice key={id} role="checkbox" selected={inputs.includes(id)} onClick={() => toggle(id)} title={INPUTS[id].label} detail={INPUTS[id].how} />
              ))}
            </div>
          </div>
        ))}
        {hasBroker ? (
          <div className="mb-2 card px-4 py-3">
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
      </section>

      <section hidden={step !== 2}>
        <h2 className="mb-4 text-title-3 font-semibold">A few details</h2>
        <label className="mb-4 block">
          <span className="mb-1 block text-subhead">Your name</span>
          <input name="ownerName" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} maxLength={40} autoComplete="given-name" className="h-11 w-full rounded-[10px] border border-hairline bg-surface px-3 text-body" placeholder="How the app should address you" />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-subhead">Report everything in</span>
          <select name="baseCurrency" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={mode === "demo"} className="h-11 w-full rounded-[10px] border border-hairline bg-surface px-3 text-body">
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {mode === "demo" ? <span className="mt-1 block text-footnote text-text-tertiary">The demo uses its sample&apos;s currency.</span> : null}
        </label>
        <label className="block">
          <span className="mb-1 block text-subhead">Someone helping you set up (optional)</span>
          <input name="helperName" value={helperName} onChange={(e) => setHelperName(e.target.value)} maxLength={40} className="h-11 w-full rounded-[10px] border border-hairline bg-surface px-3 text-body" placeholder="A first name" />
          <span className="mt-1 block text-footnote text-text-tertiary">Named in your instructions, so you know who to ask.</span>
        </label>
      </section>

      <section hidden={step !== 3}>
        <h2 className="mb-1 text-title-3 font-semibold">Your app</h2>
        <p className="mb-4 text-subhead text-text-secondary">Built from your answers. Attach your methodology afterwards and the dashboard is rebuilt around it.</p>
        <div className="mb-6 overflow-hidden card">
          {NAV.filter((n) => screens.includes(n.module)).map(({ href, label, icon: Icon, module }) => (
            <div key={href} className="flex items-start gap-3 border-b border-hairline px-4 py-3 last:border-0">
              <Icon className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden />
              <div className="min-w-0">
                <p className="text-body">{label}</p>
                <p className="text-footnote text-text-secondary">{SCREEN_ABOUT[module]}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="section-header mb-2 px-1">What you do next, once</p>
        <ol className="mb-2 list-decimal space-y-2 card py-3 pr-4 pl-9 text-subhead">
          {inputs.map((i) => (
            <li key={i}>
              <b className="font-medium">{INPUTS[i].label}.</b> {INPUTS[i].ownerStep}
              {waiting.includes(i) && initial?.inputs.includes(i) ? <span className="text-text-tertiary"> Not connected yet.</span> : null}
            </li>
          ))}
        </ol>
      </section>

      {state.error ? <p className="mt-4 rounded-card bg-danger/15 px-4 py-3 text-subhead text-danger">{state.error}</p> : null}

      <div className="mt-6 flex gap-3">
        {step > 0 ? (
          <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        ) : null}
        {step < STEPS.length - 1 ? (
          // Separate keys: reusing one element would turn the clicked Continue into a submit mid-click and send the form early.
          <Button key="next" type="button" className="flex-1 lg:flex-none" disabled={!canNext} onClick={() => setStep(step + 1)}>
            Continue
          </Button>
        ) : (
          <Button key="submit" type="submit" className="flex-1 lg:flex-none" loading={pending}>
            {initial ? "Save and rebuild" : "Build my app"}
          </Button>
        )}
      </div>
      {mode === "demo" && initial ? (
        <button type="submit" formAction={startOverAction} className="mt-6 text-footnote text-accent-text">
          Start the demo again
        </button>
      ) : null}
    </form>
  );
}
