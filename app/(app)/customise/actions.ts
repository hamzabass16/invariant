"use server";

import { revalidatePath } from "next/cache";

import { navFor } from "@/components/app/nav-items";
import { ASK_CLAUDE_SENTENCE } from "@/lib/ask-claude";
import { checkAddress, dataDefSchema, dataIdFor, MAX_DATA } from "@/lib/custom-data";
import { recordFields } from "@/lib/holdings";
import { DEFAULT_PRACTICES, DIMENSIONS, FIELD_IDS, FILTER_OPS, MEASURABLE, MEASURES, PERIODS, PRACTICES, SERIES_STATS, UNITS, type FieldId, type Practice } from "@/lib/ontology";
import { dashboardFor } from "@/lib/methodology";
import { CUSTOM_PREFIX, dashboardWith, MAX_CUSTOM_FIGURES, moveNav, reorderNav, THEMES, type Theme } from "@/lib/preferences";
import { figureSchema, VIEWS, type Figure } from "@/lib/recipes";
import { SECTORS } from "@/lib/sectors";
import { SyncError } from "@/lib/sync-error";
import { getWorkspace, saveCustomData, savePreferences, saveRecords } from "@/lib/workspace";

export type CustomiseState = { error: string | null };

async function guarded(fn: () => Promise<void>): Promise<CustomiseState> {
  try {
    await fn();
    revalidatePath("/", "layout");
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[customise] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const oneOf = <T extends string>(v: string, list: readonly T[]): T | null => ((list as readonly string[]).includes(v) ? (v as T) : null);

// ---------------------------------------------------------------------------
// Appearance and screens

export async function setThemeAction(_prev: CustomiseState, form: FormData): Promise<CustomiseState> {
  const ws = await getWorkspace();
  const theme = oneOf<Theme>(str(form, "theme"), THEMES);
  if (!theme) return { error: "Choose a theme." };
  return guarded(() => savePreferences({ ...ws.preferences, theme }));
}

export async function navAction(_prev: CustomiseState, form: FormData): Promise<CustomiseState> {
  const ws = await getWorkspace();
  const href = str(form, "href");
  const how = oneOf(str(form, "how"), ["up", "down", "hide", "show"] as const);
  if (!how || !navFor(ws.modules, ws.screens).some((n) => n.href === href)) return { error: "That screen is not in your app." };
  return guarded(() =>
    savePreferences(
      moveNav(
        ws.preferences,
        navFor(ws.modules, ws.screens).map((n) => n.href),
        href,
        how,
      ),
    ),
  );
}

/** The screens in the order the person dragged them to on Customise. */
export async function orderNavAction(order: string[]): Promise<CustomiseState> {
  const ws = await getWorkspace();
  const next = Array.isArray(order) && order.every((h) => typeof h === "string") ? reorderNav(ws.preferences, navFor(ws.modules, ws.screens).map((n) => n.href), order) : null;
  if (!next) return { error: "The screens changed since this page opened; reload it and drag again." };
  return guarded(() => savePreferences(next));
}

export async function resetNavAction(): Promise<CustomiseState> {
  const ws = await getWorkspace();
  return guarded(() => savePreferences({ ...ws.preferences, navOrder: [], hidden: [] }));
}

/** Adds or removes a page tied to a practice (Trade check, Decision Log, the to-do). Each is off until added, whatever the methodology names; Trades is on for everyone. */
export async function practiceAction(_prev: CustomiseState, form: FormData): Promise<CustomiseState> {
  const ws = await getWorkspace();
  const practice = oneOf<Practice>(str(form, "practice"), PRACTICES);
  const how = oneOf(str(form, "how"), ["add", "remove"] as const);
  if (!practice || !how || DEFAULT_PRACTICES.includes(practice)) return { error: "That page is not one you can add." };
  const added = new Set(ws.preferences.practices);
  if (how === "add") added.add(practice);
  else added.delete(practice);
  return guarded(() => savePreferences({ ...ws.preferences, practices: PRACTICES.filter((p) => added.has(p)) }));
}

// ---------------------------------------------------------------------------
// Headline

export async function headlineAction(_prev: CustomiseState, form: FormData): Promise<CustomiseState> {
  const ws = await getWorkspace();
  const ids = form.getAll("figure").map(String).filter((s) => /^[\w.-]{1,40}$/.test(s));
  if (!ids.length) return { error: "Tick at least one figure." };
  if (ids.length > 6) return { error: "Six tiles at most." };
  if (!ws.setup) return { error: "Finish Setup first." };
  const base = dashboardFor(ws.setup.profile, ws.modules, ws.setup.methodology);
  const tiles = new Set(dashboardWith(base.figures, base.dashboard, ws.preferences).figures.filter((f) => f.view === "tile").map((f) => f.id));
  if (ids.some((id) => !tiles.has(id))) return { error: "One of those figures is not a tile any more. Reload and pick again." };
  return guarded(() => savePreferences({ ...ws.preferences, headline: ids }));
}

export async function resetHeadlineAction(): Promise<CustomiseState> {
  const ws = await getWorkspace();
  return guarded(() => savePreferences({ ...ws.preferences, headline: null }));
}

// ---------------------------------------------------------------------------
// The person's own figures, built over the ontology

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "figure";
}

/** Reads the builder's form into a recipe; every choice is checked against the ontology, never trusted. */
function figureFrom(form: FormData, taken: Set<string>): Figure | string {
  const label = str(form, "label").slice(0, 60);
  if (!label) return "Give the figure a name.";
  const unit = oneOf(str(form, "unit"), UNITS);
  const view = oneOf(str(form, "view"), VIEWS);
  const by = oneOf(str(form, "by"), DIMENSIONS);
  const kind = oneOf(str(form, "kind"), ["measure", "share", "series"] as const);
  if (!unit || !view || !kind) return "Choose a unit, a view and what to compute.";
  let expr: Figure["expr"];
  if (kind === "series") {
    const stat = oneOf(str(form, "stat"), SERIES_STATS);
    const period = oneOf(str(form, "period"), PERIODS);
    const of = str(form, "of").toUpperCase().slice(0, 20) || "nav";
    const vs = str(form, "vs").toUpperCase().slice(0, 20);
    if (!stat || !period) return "Choose a statistic and a period.";
    expr = { op: "series", stat, of: of === "NAV" ? "nav" : of, period, ...(vs ? { vs } : {}) };
  } else {
    const measure = oneOf(str(form, "measure"), MEASURES);
    const over = oneOf(str(form, "over"), MEASURABLE);
    const field = oneOf(str(form, "field"), FIELD_IDS) as FieldId | null;
    if (!measure || !over) return "Choose a measure and what to measure over.";
    if (measure !== "count" && !field) return "Choose a field to measure.";
    const where: { field: FieldId; is: (typeof FILTER_OPS)[number]; value?: string | number | boolean }[] = [];
    const fField = oneOf(str(form, "filterField"), FIELD_IDS) as FieldId | null;
    const fOp = oneOf(str(form, "filterOp"), FILTER_OPS);
    const fRaw = str(form, "filterValue");
    if (fField && fOp) {
      const value = fOp === "is_null" || fOp === "not_null" ? undefined : fRaw === "true" ? true : fRaw === "false" ? false : fRaw !== "" && !Number.isNaN(Number(fRaw)) ? Number(fRaw) : fRaw;
      where.push({ field: fField, is: fOp, ...(value === undefined ? {} : { value }) });
    }
    const windowKind = oneOf(str(form, "window"), ["none", "all", "ttm", "prior_ttm", "ytd", "last_months"] as const);
    const months = Number(str(form, "months"));
    const top = Number(str(form, "top"));
    const m = {
      measure,
      over,
      ...(measure === "count" ? {} : { field: field! }),
      where,
      ...(over === "transactions" && windowKind && windowKind !== "none" ? { window: { kind: windowKind, ...(windowKind === "last_months" ? { months: months > 0 ? Math.floor(months) : 6 } : {}) } } : {}),
      ...(top > 0 && measure !== "count" ? { top: Math.floor(top) } : {}),
      ...(form.get("abs") === "on" ? { abs: true } : {}),
    };
    expr = kind === "share" ? { op: "ratio", num: m, den: { measure: "sum", over: "holdings", field: "owner_value", where: [], whole: true } } : { op: "measure", of: m };
  }
  let id = `${CUSTOM_PREFIX}${slug(label)}`;
  for (let n = 2; taken.has(id); n += 1) id = `${CUSTOM_PREFIX}${slug(label)}-${n}`;
  const parsed = figureSchema.safeParse({ id, label, about: str(form, "about").slice(0, 200) || undefined, unit, expr, ...(view === "tile" ? {} : { by: by ?? "symbol" }), view });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "That recipe does not hold together.";
  if ((parsed.data.view === "tile") === !!parsed.data.by) return parsed.data.view === "tile" ? "A tile has no grouping; pick a chart or a table to group." : "A chart or table needs a grouping.";
  return parsed.data;
}

export async function addFigureAction(_prev: CustomiseState, form: FormData): Promise<CustomiseState> {
  const ws = await getWorkspace();
  if (ws.preferences.figures.length >= MAX_CUSTOM_FIGURES) return { error: `${MAX_CUSTOM_FIGURES} figures of your own at most. Remove one first.` };
  const taken = new Set([...ws.preferences.figures.map((f) => f.id), ...(ws.setup?.methodology?.figures.map((f) => f.id) ?? [])]);
  const figure = figureFrom(form, taken);
  if (typeof figure === "string") return { error: figure };
  return guarded(() => savePreferences({ ...ws.preferences, figures: [...ws.preferences.figures, figure] }));
}

export async function removeFigureAction(_prev: CustomiseState, form: FormData): Promise<CustomiseState> {
  const ws = await getWorkspace();
  const id = str(form, "id");
  const headline = ws.preferences.headline?.filter((h) => h !== id) ?? null;
  return guarded(() => savePreferences({ ...ws.preferences, figures: ws.preferences.figures.filter((f) => f.id !== id), headline: headline && headline.length ? headline : null }));
}

// ---------------------------------------------------------------------------
// Records: the owner's own valuation and dates per holding

const num = (v: string) => (v === "" ? null : Number.isNaN(Number(v)) ? undefined : Number(v));

export async function saveRecordAction(_prev: CustomiseState, form: FormData): Promise<CustomiseState> {
  const ws = await getWorkspace();
  const symbol = str(form, "symbol").slice(0, 40);
  if (!ws.book?.holdings.some((h) => h.symbol === symbol)) return { error: "Pick one of your holdings." };
  const low = num(str(form, "low"));
  const base = num(str(form, "base"));
  const high = num(str(form, "high"));
  if (low === undefined || base === undefined || high === undefined) return { error: "A valuation is a number per unit." };
  if ((low !== null || high !== null) && base === null) return { error: "Give the base case; low and high are optional." };
  const asOf = str(form, "asOf") || ws.book.asOf;
  const since = str(form, "since") || null;
  const sector = str(form, "sector").slice(0, 40);
  if (sector && !(SECTORS as readonly string[]).includes(sector)) return { error: "The sector is one of the eleven." };
  const parsed = recordFields.safeParse({
    ownValuation: base === null ? null : { low, base, high, asOf, basis: str(form, "basis").slice(0, 80) || null },
    since,
    note: str(form, "note").slice(0, 300) || null,
    sector: sector || null,
  });
  if (!parsed.success) return { error: "Dates are YYYY-MM-DD; the basis is 80 characters at most." };
  if (parsed.data.ownValuation && parsed.data.ownValuation.base <= 0) return { error: "A valuation is above zero." };
  // The form carries the valuation, dates, note and sector; levels, triggers and a revaluation set elsewhere stay.
  const prev = ws.records.bySymbol[symbol];
  const next = prev ? { ...parsed.data, levels: prev.levels, triggers: prev.triggers, revaluation: prev.revaluation } : parsed.data;
  return guarded(() => saveRecords({ ...ws.records, bySymbol: { ...ws.records.bySymbol, [symbol]: next } }));
}

export async function removeRecordAction(_prev: CustomiseState, form: FormData): Promise<CustomiseState> {
  const ws = await getWorkspace();
  const symbol = str(form, "symbol");
  const bySymbol = { ...ws.records.bySymbol };
  delete bySymbol[symbol];
  return guarded(() => saveRecords({ ...ws.records, bySymbol }));
}

// ---------------------------------------------------------------------------
// Your data: a figure or series from a public API or the person's own Claude

/**
 * Adds one piece of data and reads it at once, so the person sees the first
 * reading (or why there is none) before leaving the screen. The key, when the
 * API needs one, goes to its own vault file and is never shown again.
 */
export async function addDataAction(_prev: CustomiseState, form: FormData): Promise<CustomiseState> {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "The demo shows fictional data and reads nothing. In your own copy, Add data keeps it in your vault." };
  const file = ws.customData;
  if (file.defs.length >= MAX_DATA) return { error: `${MAX_DATA} pieces at most. Remove one first.` };
  const name = str(form, "name");
  if (!name) return { error: "Give it a name." };
  const kind = str(form, "source");
  const source =
    kind === "api"
      ? { kind: "api" as const, url: str(form, "url"), answer: oneOf(str(form, "answer"), ["json", "csv"] as const) ?? "json", rows: str(form, "rows"), x: str(form, "x"), value: str(form, "value"), keyIn: oneOf(str(form, "keyIn"), ["none", "header", "query"] as const) ?? "none", keyName: str(form, "keyName") }
      : { kind: "claude" as const, ask: str(form, "ask") };
  if (source.kind === "api") {
    const refused = checkAddress(source.url);
    if (refused) return { error: refused };
    if (source.keyIn !== "none" && !source.keyName) return { error: "Name the header or parameter the key goes in, as the API's documentation gives it." };
    if (source.keyIn !== "none" && !str(form, "key")) return { error: "Paste the key, or choose that the API needs none." };
  } else if (ws.askClaude) return { error: ASK_CLAUDE_SENTENCE };
  else if (source.ask.length < 10) return { error: "Say what the AI should fetch, in a sentence." };
  const parsed = dataDefSchema.safeParse({
    id: dataIdFor(name, file.defs.map((d) => d.id)),
    name,
    about: str(form, "about"),
    format: str(form, "format"),
    unit: str(form, "unit"),
    refresh: str(form, "refresh"),
    screen: str(form, "screen"),
    source,
    added: new Date().toISOString(),
  });
  if (!parsed.success) return { error: `That does not fit yet: ${parsed.error.issues[0]?.path.join(".") || "a field"} ${parsed.error.issues[0]?.message ?? ""}`.trim() };
  const def = parsed.data;
  const key = def.source.kind === "api" && def.source.keyIn !== "none" ? { id: def.id, value: str(form, "key").slice(0, 400) } : undefined;
  return guarded(async () => {
    await saveCustomData({ ...file, defs: [...file.defs, def] }, key);
    const { openVault } = await import("@/lib/vault");
    const { refreshData } = await import("@/lib/custom-data-run");
    await refreshData(await openVault(), new Date(), { only: def.id });
  });
}

export async function removeDataAction(_prev: CustomiseState, form: FormData): Promise<CustomiseState> {
  const ws = await getWorkspace();
  const id = str(form, "id");
  if (!ws.customData.defs.some((d) => d.id === id)) return { error: "That is not in your data any more." };
  const readings = { ...ws.customData.readings };
  delete readings[id];
  return guarded(() => saveCustomData({ ...ws.customData, defs: ws.customData.defs.filter((d) => d.id !== id), readings }, { id, value: null }));
}

/** Refresh now: one piece, or all of them, read at once whatever their schedule. */
export async function refreshDataAction(_prev: CustomiseState, form: FormData): Promise<CustomiseState> {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "The demo shows fictional data and reads nothing." };
  const id = str(form, "id");
  if (id && !ws.customData.defs.some((d) => d.id === id)) return { error: "That is not in your data any more." };
  return guarded(async () => {
    const { openVault } = await import("@/lib/vault");
    const { refreshData } = await import("@/lib/custom-data-run");
    await refreshData(await openVault(), new Date(), id ? { only: id } : { force: true });
  });
}
