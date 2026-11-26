"use client";

import { Eye, EyeOff, GripVertical, X } from "lucide-react";
import * as React from "react";
import { useActionState, useState } from "react";

import { addFigureAction, headlineAction, navAction, orderNavAction, removeFigureAction, removeRecordAction, saveRecordAction, setThemeAction, type CustomiseState } from "@/app/(app)/customise/actions";
import { ActionForm } from "@/components/app/action-form";
import { DoneMark, stamped, useDone, type Ran } from "@/components/app/done-mark";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list";
import { DIMENSION_ABOUT, DIMENSIONS, FIELDS, fieldsOf, MEASURABLE, MEASURE_ABOUT, MEASURES, OBJECT_LABEL, PERIOD_WORDS, PERIODS, SERIES_STAT_ABOUT, SERIES_STATS, UNITS, type FieldId } from "@/lib/ontology";
import { THEME_LABEL, THEMES, type Theme } from "@/lib/preferences";
import { VIEWS, type Figure } from "@/lib/recipes";
import { cn } from "@/lib/utils";
import { reached } from "@/components/app/reach";

/**
 * The Customise screen's controls. Each is a small form posting to a server
 * action; the page re-renders with the new arrangement. Nothing here computes
 * a figure: the builder only writes a recipe, which the app validates against
 * the ontology and computes like any other.
 */

const field = "block w-full rounded-[10px] border border-hairline bg-bg px-3 py-2 text-body";
const label = "mb-1 block text-subhead";

/** A row of choices; tapping one submits it. */
export function ThemeChoice({ current }: { current: Theme }) {
  const [state, run, pending] = useActionState<Ran<CustomiseState>, FormData>(stamped(setThemeAction), { error: null });
  const done = useDone(state);
  return (
    <form action={run} className="card px-4 py-4">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => (
          <button key={t} type="submit" name="theme" value={t} disabled={pending} role="radio" aria-checked={current === t} className={cn("rounded-[10px] px-4 py-2 text-subhead transition-colors", current === t ? "bg-accent text-text" : "bg-surface-2 text-text-secondary hover:text-text")}>
            {THEME_LABEL[t]}
          </button>
        ))}
        {done ? <DoneMark label="Theme kept" /> : null}
      </div>
      {state.error ? <p className="mt-2 text-footnote text-danger">{state.error}</p> : null}
    </form>
  );
}

function Tiny({ href, how, title, children }: { href: string; how: "hide" | "show"; title: string; children: React.ReactNode }) {
  const [, run, pending] = useActionState<CustomiseState, FormData>(reached(navAction), { error: null });
  return (
    <form action={run} className="inline-block">
      <input type="hidden" name="href" value={href} />
      <input type="hidden" name="how" value={how} />
      <button type="submit" disabled={pending} title={title} aria-label={title} className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-40">
        {children}
      </button>
    </form>
  );
}

/** A hidden screen, with the eye that brings it back. */
export function HiddenRow({ href, label: text }: { href: string; label: string }) {
  return (
    <ListRow
      label={<span className="text-text-tertiary">{text}</span>}
      detail="Hidden from the top menu and tab bar; still opens by its address."
      trailing={
        <Tiny href={href} how="show" title={`Show ${text}`}>
          <Eye className="size-4" aria-hidden />
        </Tiny>
      }
    />
  );
}

const move = <T,>(xs: readonly T[], from: number, to: number) => {
  const out = [...xs];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
};

/**
 * The screens in order, dragged into place (Hamza, 15 Oct 2026): hold the
 * grip and drag, with a finger or a mouse; or focus the grip and use the
 * arrow keys. The order is saved when the row is let go, with a check to say
 * so; the eye hides a screen from the top menu and tab bar.
 */
export function ScreenOrder({ items }: { items: { href: string; label: string; locked: boolean }[] }) {
  const [order, setOrder] = React.useState(items);
  // The row being dragged, how far, and the slot it would land in; the other rows step aside on the page without the list reordering under the pointer.
  const [drag, setDrag] = React.useState<{ href: string; dy: number; from: number; to: number; h: number } | null>(null);
  const [state, setState] = React.useState<Ran<CustomiseState>>({ error: null });
  const [pending, start] = React.useTransition();
  const done = useDone(state);
  const rows = React.useRef(new Map<string, HTMLLIElement>());
  // Where every row was when the drag began, measured once: the slots never move while the pointer is down, so the row follows the finger and nothing runs away (Hamza, 16 Oct 2026).
  const geo = React.useRef<{ y: number; from: number; rects: { top: number; height: number }[] } | null>(null);
  // A new arrangement from the server (a hide, a reset) replaces the local one.
  const key = items.map((i) => i.href).join("|");
  const [seen, setSeen] = React.useState(key);
  if (seen !== key) {
    setSeen(key);
    setOrder(items);
  }

  const save = (next: typeof items) => {
    if (next.map((n) => n.href).join("|") === items.map((n) => n.href).join("|")) return;
    start(async () => setState(await stamped(orderNavAction)(next.map((n) => n.href))));
  };

  const onDown = (e: React.PointerEvent<HTMLButtonElement>, href: string) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const from = order.findIndex((o) => o.href === href);
    const rects = order.map((o) => {
      const r = rows.current.get(o.href)?.getBoundingClientRect();
      return { top: r?.top ?? 0, height: r?.height ?? 52 };
    });
    geo.current = { y: e.clientY, from, rects };
    setDrag({ href, dy: 0, from, to: from, h: rects[from].height });
  };
  const onMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = geo.current;
    if (!drag || !g) return;
    const dy = e.clientY - g.y;
    // A few pixels of rest before the row moves, so a press is never a drag.
    if (drag.to === g.from && Math.abs(dy) < 4) return;
    const { rects, from } = g;
    const centre = rects[from].top + rects[from].height / 2 + dy;
    let to = from;
    if (centre < rects[0].top) to = 0;
    else if (centre > rects[rects.length - 1].top + rects[rects.length - 1].height) to = rects.length - 1;
    else {
      const i = rects.findIndex((r) => centre >= r.top && centre < r.top + r.height);
      if (i >= 0) to = i;
    }
    setDrag({ href: drag.href, dy, from, to, h: drag.h });
  };
  const onUp = () => {
    if (!drag) return;
    const { from, to } = drag;
    setDrag(null);
    geo.current = null;
    if (from === to) return;
    const next = move(order, from, to);
    setOrder(next);
    save(next);
  };
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null;
    if (to === null || to < 0 || to >= order.length) return;
    e.preventDefault();
    const next = move(order, i, to);
    setOrder(next);
    save(next);
    requestAnimationFrame(() => rows.current.get(order[i].href)?.querySelector("button")?.focus());
  };
  // How far a row other than the dragged one steps aside: the dragged row's height, up or down, when the slot it would land in is on its far side.
  const shift = (i: number): number => {
    if (!drag || i === drag.from) return 0;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -drag.h;
    if (drag.to < drag.from && i >= drag.to && i < drag.from) return drag.h;
    return 0;
  };

  return (
    <div>
      <ol className="list-card card overflow-hidden" aria-label="Screens in order">
        {order.map((n, i) => {
          const dragging = drag?.href === n.href;
          const dy = dragging ? drag!.dy : shift(i);
          return (
            <li
              key={n.href}
              ref={(el) => {
                if (el) rows.current.set(n.href, el);
                else rows.current.delete(n.href);
              }}
              className={cn("relative flex min-h-[3.25rem] items-center gap-2 border-b border-hairline bg-surface pr-4 last:border-0", dragging ? "z-10 shadow-lg ring-1 ring-accent" : "motion-safe:transition-transform motion-safe:duration-150")}
              style={dy ? { transform: `translateY(${dy}px)` } : undefined}
              aria-grabbed={dragging || undefined}
            >
              <button
                type="button"
                onPointerDown={(e) => onDown(e, n.href)}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                onKeyDown={(e) => onKey(e, i)}
                aria-label={`Move ${n.label}: drag, or use the arrow keys`}
                className={cn("flex h-[3.25rem] w-11 shrink-0 touch-none select-none items-center justify-center text-text-tertiary hover:text-text", dragging ? "cursor-grabbing" : "cursor-grab")}
              >
                <GripVertical className="size-5" aria-hidden />
              </button>
              <span className="data w-6 shrink-0 text-caption text-text-tertiary">{drag && !dragging ? (i < drag.from && i >= drag.to ? i + 2 : i > drag.from && i <= drag.to ? i : i + 1) : dragging ? drag!.to + 1 : i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-body">{n.label}</span>
              {n.locked ? null : (
                <Tiny href={n.href} how="hide" title={`Hide ${n.label}`}>
                  <EyeOff className="size-4" aria-hidden />
                </Tiny>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 flex min-h-6 items-center gap-2 px-4 text-footnote text-text-secondary" aria-live="polite">
        {pending ? "Saving the order" : done ? <DoneMark label="Order saved" /> : state.error ? <span className="text-danger">{state.error}</span> : "Drag a screen by its grip. The sidebar and the tab bar follow this order; the phone shows the first four and the rest under More."}
      </p>
    </div>
  );
}

export function HeadlineForm({ tiles, picked }: { tiles: { id: string; label: string; custom: boolean }[]; picked: string[] }) {
  return (
    <ActionForm action={headlineAction} label="Use these tiles" variant="secondary" className="card px-4 py-4">
      <p className="mb-3 text-footnote text-text-secondary">Tick up to six. They lead the Dashboard in this order.</p>
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        {tiles.map((t) => (
          <label key={t.id} className="flex items-center gap-3 rounded-[10px] bg-surface-2 px-3 py-2 text-subhead">
            <input type="checkbox" name="figure" value={t.id} defaultChecked={picked.includes(t.id)} className="size-4 accent-[var(--accent)]" />
            <span className="min-w-0 flex-1 truncate">{t.label}</span>
            {t.custom ? <span className="text-caption text-accent-text">yours</span> : null}
          </label>
        ))}
      </div>
    </ActionForm>
  );
}

const FIELD_OPTIONS = Object.fromEntries(MEASURABLE.map((o) => [o, fieldsOf(o).filter((id) => ["money", "number", "pct", "days", "ratio"].includes(FIELDS[id].type))])) as Record<(typeof MEASURABLE)[number], FieldId[]>;
const FILTER_FIELDS = Object.fromEntries(MEASURABLE.map((o) => [o, fieldsOf(o)])) as Record<(typeof MEASURABLE)[number], FieldId[]>;

/** A figure built by hand over the ontology: the same recipe language the drafter writes. */
export function FigureBuilder() {
  const [kind, setKind] = useState<"measure" | "share" | "series">("measure");
  const [over, setOver] = useState<(typeof MEASURABLE)[number]>("holdings");
  const [measure, setMeasure] = useState<(typeof MEASURES)[number]>("sum");
  const [view, setView] = useState<(typeof VIEWS)[number]>("tile");
  return (
    <ActionForm action={addFigureAction} label="Add the figure" className="card px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={label}>Name</span>
          <input name="label" required maxLength={60} placeholder="Cash and deposits" className={field} />
        </label>
        <label className="block">
          <span className={label}>What to compute</span>
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={field}>
            <option value="measure">A measure (a sum, a count, an average)</option>
            <option value="share">A share of net worth</option>
            <option value="series">A statistic of the account&apos;s value series</option>
          </select>
        </label>
        <label className="block">
          <span className={label}>Unit</span>
          <select name="unit" defaultValue={kind === "share" ? "pct" : "money"} className={field}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        {kind !== "series" ? (
          <>
            <label className="block">
              <span className={label}>Measure</span>
              <select name="measure" value={measure} onChange={(e) => setMeasure(e.target.value as typeof measure)} className={field}>
                {MEASURES.map((m) => (
                  <option key={m} value={m}>
                    {m}: {MEASURE_ABOUT[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Over</span>
              <select name="over" value={over} onChange={(e) => setOver(e.target.value as typeof over)} className={field}>
                {MEASURABLE.map((o) => (
                  <option key={o} value={o}>
                    {OBJECT_LABEL[o]}
                  </option>
                ))}
              </select>
            </label>
            {measure !== "count" ? (
              <label className="block sm:col-span-2">
                <span className={label}>Field</span>
                <select name="field" className={field} defaultValue={over === "holdings" ? "owner_value" : over === "transactions" ? "amount" : "lt_value"}>
                  {FIELD_OPTIONS[over].map((id) => (
                    <option key={id} value={id}>
                      {FIELDS[id].label}
                      {FIELDS[id].suppliedBy === "none" ? " (no input supplies this yet)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <fieldset className="contents">
              <label className="block">
                <span className={label}>Keep rows where</span>
                <select name="filterField" className={field} defaultValue="">
                  <option value="">Every row</option>
                  {FILTER_FIELDS[over].map((id) => (
                    <option key={id} value={id}>
                      {FIELDS[id].label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={label}>is</span>
                  <select name="filterOp" className={field} defaultValue="eq">
                    {["eq", "ne", "gt", "gte", "lt", "lte", "contains", "is_null", "not_null"].map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={label}>value</span>
                  <input name="filterValue" maxLength={40} placeholder="cash" className={field} />
                </label>
              </div>
            </fieldset>
            {over === "transactions" ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={label}>Window</span>
                  <select name="window" className={field} defaultValue="ttm">
                    <option value="all">All</option>
                    <option value="ttm">Last twelve months</option>
                    <option value="prior_ttm">The twelve before</option>
                    <option value="ytd">This year</option>
                    <option value="last_months">Last N months</option>
                  </select>
                </label>
                <label className="block">
                  <span className={label}>N months</span>
                  <input name="months" type="number" min={1} max={120} placeholder="6" className={field} />
                </label>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className={label}>Top N rows only</span>
                <input name="top" type="number" min={1} max={50} placeholder="all" className={field} />
              </label>
              <label className="flex items-end gap-2 pb-2 text-subhead">
                <input name="abs" type="checkbox" className="size-4 accent-[var(--accent)]" /> Size, sign ignored
              </label>
            </div>
          </>
        ) : (
          <>
            <label className="block">
              <span className={label}>Statistic</span>
              <select name="stat" className={field} defaultValue="return">
                {SERIES_STATS.map((s) => (
                  <option key={s} value={s}>
                    {s}: {SERIES_STAT_ABOUT[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Period</span>
              <select name="period" className={field} defaultValue="1y">
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {PERIOD_WORDS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Of</span>
              <input name="of" maxLength={20} placeholder="nav, or a benchmark such as SPY" className={field} />
            </label>
            <label className="block">
              <span className={label}>Against (for beta)</span>
              <input name="vs" maxLength={20} placeholder="SPY" className={field} />
            </label>
          </>
        )}
        <label className="block">
          <span className={label}>Shown as</span>
          <select name="view" value={view} onChange={(e) => setView(e.target.value as typeof view)} className={field}>
            {VIEWS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Grouped by</span>
          <select name="by" className={field} defaultValue={view === "tile" ? "" : "symbol"} disabled={view === "tile"}>
            <option value="">One number</option>
            {DIMENSIONS.map((d) => (
              <option key={d} value={d}>
                {d}: {DIMENSION_ABOUT[d]}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>About (optional)</span>
          <input name="about" maxLength={200} placeholder="One line on what it measures." className={cn(field, "mb-3")} />
        </label>
      </div>
    </ActionForm>
  );
}

export function RemoveFigure({ figure }: { figure: Figure }) {
  const [, run, pending] = useActionState<CustomiseState, FormData>(reached(removeFigureAction), { error: null });
  return (
    <form action={run} className="shrink-0">
      <input type="hidden" name="id" value={figure.id} />
      <button type="submit" disabled={pending} aria-label={`Remove ${figure.label}`} title="Remove" className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-danger disabled:opacity-40">
        <X className="size-4" aria-hidden />
      </button>
    </form>
  );
}

export function RecordForm({ symbols, asOf, sectors }: { symbols: { symbol: string; name: string }[]; asOf: string; sectors: readonly string[] }) {
  return (
    <ActionForm action={saveRecordAction} label="Keep the record" variant="secondary" className="card px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={label}>Holding</span>
          <select name="symbol" required className={field}>
            {symbols.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol} · {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2 sm:col-span-2">
          <label className="block">
            <span className={label}>Low</span>
            <input name="low" type="number" step="any" className={field} />
          </label>
          <label className="block">
            <span className={label}>Base</span>
            <input name="base" type="number" step="any" className={field} />
          </label>
          <label className="block">
            <span className={label}>High</span>
            <input name="high" type="number" step="any" className={field} />
          </label>
        </div>
        <label className="block">
          <span className={label}>Valued on</span>
          <input name="asOf" type="date" defaultValue={asOf} className={field} />
        </label>
        <label className="block">
          <span className={label}>Basis</span>
          <input name="basis" maxLength={80} placeholder="Own DCF, 9% discount rate" className={field} />
        </label>
        <label className="block">
          <span className={label}>In its standing since</span>
          <input name="since" type="date" className={field} />
        </label>
        <label className="block">
          <span className={label}>Note</span>
          <input name="note" maxLength={300} className={field} />
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>Sector</span>
          <select name="sector" className={cn(field, "mb-3")} defaultValue="">
            <option value="">As the filings give it</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mb-3 text-footnote text-text-secondary">Per unit, in the holding&apos;s currency. A methodology reads these as own valuation, price against own valuation, and days in its standing. A holding&apos;s class is never set here: it comes from the methodology&apos;s own Classification Register, else its test.</p>
    </ActionForm>
  );
}

export function RemoveRecord({ symbol }: { symbol: string }) {
  const [, run, pending] = useActionState<CustomiseState, FormData>(reached(removeRecordAction), { error: null });
  return (
    <form action={run} className="shrink-0">
      <input type="hidden" name="symbol" value={symbol} />
      <Button type="submit" variant="ghost" size="sm" loading={pending}>
        Remove
      </Button>
    </form>
  );
}
