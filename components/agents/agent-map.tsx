import { ArrowDown, ArrowRight, ArrowUp, CornerDownLeft } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { StatusPill } from "@/components/ui/status";
import { AGENTS, hierarchy, modelLabel, usd, LAYER_ABOUT, LAYER_LABEL, LAYERS, STATUS_LABEL, TIER_LABEL, type AgentStatus, type AgentStep, type Tier } from "@/lib/agents";
import { cn } from "@/lib/utils";

export const STATUS_TONE: Record<AgentStatus, "ok" | "info" | "neutral" | "warn"> = { live: "ok", on_agent: "ok", own_path: "neutral", planned: "info" };

/** The tier of a step as a chip: none is the app's own code, the rest a model on the person's key. */
export function TierChip({ tier }: { tier: Tier }) {
  return <span className={cn("data rounded-md px-1.5 py-0.5 text-caption", tier === "none" ? "bg-surface-2 text-text-secondary" : "bg-accent-subtle text-accent-text")}>{tier === "none" ? "App, no model" : TIER_LABEL[tier]}</span>;
}

/**
 * A run's loop as a row of steps (the agents doc, §8): Gather, Filter, Sift,
 * Judge, Check, each with its tier and its words, and the edge back to
 * Gather drawn under them. A column on a phone.
 */
export function StepLoop({ steps, back = true }: { steps: readonly AgentStep[]; back?: boolean }) {
  return (
    <div>
      <ol className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
        {steps.map((s, i) => (
          <li key={`${s.id}-${i}`} className="flex flex-col items-center gap-2 lg:flex-1 lg:flex-row">
            <div className="card w-full min-w-0 flex-1 px-3 py-3">
              <p className="flex flex-wrap items-center gap-2">
                <span className="data text-caption text-text-tertiary">{i + 1}</span>
                <span className="text-subhead font-semibold">{s.label}</span>
                <TierChip tier={s.tier} />
              </p>
              <p className="mt-1.5 text-caption text-text-secondary">{s.words}</p>
            </div>
            {i < steps.length - 1 ? (
              <>
                <ArrowDown className="size-4 shrink-0 text-text-tertiary lg:hidden" aria-hidden />
                <ArrowRight className="hidden size-4 shrink-0 text-text-tertiary lg:block" aria-hidden />
              </>
            ) : null}
          </li>
        ))}
      </ol>
      {back ? (
        <p className="mt-2 flex items-start gap-2 px-1 text-caption text-text-tertiary">
          <CornerDownLeft className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          When fewer than two items are left after the filter, the run goes back to Gather once over three weeks instead of one. A model&rsquo;s answer that does not hold keeps the last good findings and says why.
        </p>
      ) : null}
    </div>
  );
}

/** The three layers of the agents doc (§2.1), each agent in its layer with its status, linked to its page. */
export function LayerMap() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {LAYERS.map((l, i) => (
        <div key={l} className={cn("card px-4 py-3", i === 0 && "ring-1 ring-accent-text/30")}>
          <p className="text-subhead font-semibold">{LAYER_LABEL[l]}</p>
          <p className="mt-1 text-caption text-text-secondary">{LAYER_ABOUT[l]}</p>
          <ul className="mt-3 space-y-1.5">
            {AGENTS.filter((a) => a.layer === l).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-footnote">
                <Link href={`/agents/${a.id}` as Route} className="min-w-0 truncate text-accent-text">
                  {a.name}
                </Link>
                <StatusPill tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</StatusPill>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** A figure tile: a label, the figure, a line under it. */
export function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card px-4 py-3">
      <dt className="text-footnote text-text-secondary">{label}</dt>
      <dd className="data mt-1 text-title-3">{value}</dd>
      <dd className="mt-0.5 text-caption text-text-tertiary">{sub}</dd>
    </div>
  );
}

/** This week's estimated spend against the ceiling, as a bar. */
export function Spend({ used, ceiling }: { used: number; ceiling: number }) {
  const share = ceiling > 0 ? Math.min(1, used / ceiling) : 1;
  return (
    <div className="mt-2">
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${usd(used)} of ${usd(ceiling)} this week`}>
        <div className={share >= 1 ? "h-full bg-warn" : "h-full bg-accent"} style={{ width: `${Math.max(2, share * 100)}%` }} />
      </div>
      <p className="mt-1 text-caption text-text-tertiary">
        {usd(used)} of {usd(ceiling)} this week, estimated
      </p>
    </div>
  );
}

/** Each tier's hue in the hierarchy: the strongest model the deepest colour, the app's own code platinum. */
const TIER_HUE: Record<Tier, string> = { opus: "var(--cat-2)", sonnet: "var(--cat-1)", haiku: "var(--cat-6)", none: "var(--text-secondary)" };

/**
 * The hierarchy (Hamza, 4 Nov 2026): Opus, Sonnet, Haiku and the app's own
 * code as four bands, the top first, each with the model it runs and every
 * agent with a step on it, the steps named. Between the bands, work handed
 * down and a refused reading asked again one tier up.
 */
export function HierarchyMap({ now = {} }: { now?: Partial<Record<Tier, string>> }) {
  // Each tier on the model it is on now: its family's newest release when Anthropic has one (lib/models.ts; Hamza, 4 Nov 2026).
  const rows = hierarchy().map((r) => ({ ...r, model: now[r.tier] ?? r.model, newer: !!now[r.tier] && now[r.tier] !== r.model }));
  // Drawn as a diagram (Hamza, 11 Nov 2026: "a clear colorized visual"): a spine down the left, a node per tier in its hue, the work handed down along the spine and a refused reading sent back up it, each tier's agents as chips in that hue.
  return (
    <ol className="flex flex-col">
      {rows.map((r, i) => {
        const hue = TIER_HUE[r.tier];
        const last = i === rows.length - 1;
        return (
          <li key={r.tier} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-4">
            <div className="relative flex flex-col items-center">
              <span className="relative z-10 mt-1 flex size-11 items-center justify-center rounded-full text-caption font-semibold" style={{ background: `color-mix(in oklab, ${hue} 24%, var(--bg))`, boxShadow: `inset 0 0 0 1.5px ${hue}`, color: hue }} aria-hidden>
                {r.tier === "none" ? "App" : TIER_LABEL[r.tier].slice(0, 1)}
              </span>
              {!last ? <span className="absolute top-12 bottom-0 w-0.5" style={{ background: `linear-gradient(${hue}, ${TIER_HUE[rows[i + 1].tier]})` }} aria-hidden /> : null}
            </div>
            <div className="min-w-0 pb-5">
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-display text-title-3 font-medium" style={{ color: hue }}>{r.tier === "none" ? "The app" : TIER_LABEL[r.tier]}</span>
                <span className="data rounded-md px-1.5 py-0.5 text-caption" style={{ background: `color-mix(in oklab, ${hue} 16%, transparent)`, color: hue }}>{modelLabel(r.model)}</span>
                {r.newer ? <span className="text-caption text-text-tertiary">newest release, taken up by itself</span> : null}
                <span className="data ml-auto text-caption text-text-tertiary">{r.agents.length} {r.agents.length === 1 ? "agent" : "agents"}</span>
              </p>
              <p className="mt-0.5 text-caption text-text-secondary">{r.role}</p>
              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {r.agents.map((a) => (
                  <li key={a.id} className="min-w-0">
                    <Link href={`/agents/${a.id}` as Route} className="flex max-w-full items-baseline gap-2 rounded-full px-3 py-1 transition-[background-color] duration-150" style={{ background: `color-mix(in oklab, ${hue} 12%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${hue} 55%, transparent)` }}>
                      <span className="truncate text-footnote font-medium text-text">{a.name}</span>
                      {a.steps.length ? <span className="hidden truncate text-caption text-text-tertiary sm:inline">{a.steps.join(", ")}</span> : null}
                      {a.status === "planned" ? <StatusPill tone="info">{STATUS_LABEL.planned}</StatusPill> : null}
                    </Link>
                  </li>
                ))}
              </ul>
              {!last ? (
                <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-caption text-text-tertiary">
                  <span className="flex items-center gap-1">
                    <ArrowDown className="size-3.5" style={{ color: hue }} aria-hidden />
                    {i === rows.length - 2 ? "hands the model's answer to the app's check" : "hands work down"}
                  </span>
                  {i < rows.length - 2 ? (
                    <span className="flex items-center gap-1">
                      <ArrowUp className="size-3.5" style={{ color: TIER_HUE[rows[i + 1].tier] }} aria-hidden />
                      a refused reading, asked again on a Claude key
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
