/**
 * The Claude models the app asks for, in one place (pure). Each call names
 * the tier it needs; a model name is written here and nowhere else, so a new
 * model is one line. An open-model provider names its own model instead
 * (`modelFor` in lib/model-provider.ts).
 */
export const MODELS: Readonly<Record<"fast" | "standard" | "best", string>> = {
  /** Short reads: a newsletter, a watcher, a sift. */
  fast: "claude-haiku-5-5",
  /** Most readings: a study, a report, a recap, a judgment. */
  standard: "claude-sonnet-5-5",
  /** Drafting a methodology from its document. */
  best: "claude-opus-5-5",
};

// ---------------------------------------------------------------------------
// The newest model of each tier (Hamza, 4 Nov 2026: "automatically update once
// Claude releases new updated models"). Anthropic's model list is read on the
// key twice a day (lib/model-catalog.ts); a call asking for a tier's model
// above goes to that family's newest release, only ever a higher version than
// the one written here, and back to the one written here when the new model
// refuses the request. Pure.

export type ModelTier = keyof typeof MODELS;
/** Each tier's family, as Anthropic names its models. */
export const TIER_FAMILY: Readonly<Record<ModelTier, "haiku" | "sonnet" | "opus">> = { fast: "haiku", standard: "sonnet", best: "opus" };

/** A model id's family and version (claude-opus-5-5 is opus 5.5; a dated snapshot carries its date), else null for anything else. */
export function modelVersion(id: string): { family: "haiku" | "sonnet" | "opus"; major: number; minor: number; dated: boolean } | null {
  const m = /^claude-(haiku|sonnet|opus)-(\d{1,2})(?:-(\d{1,2}))?(-\d{8})?$/.exec(id.trim());
  if (!m) return null;
  return { family: m[1] as "haiku" | "sonnet" | "opus", major: Number(m[2]), minor: m[3] ? Number(m[3]) : 0, dated: !!m[4] };
}

const newer = (a: { major: number; minor: number }, b: { major: number; minor: number }) => a.major > b.major || (a.major === b.major && a.minor > b.minor);

/** The ids in Anthropic's model list (GET /v1/models), read item by item; anything unreadable is left out. */
export function modelIdsOf(body: unknown): string[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data.map((d) => (d && typeof d === "object" && typeof (d as { id?: unknown }).id === "string" ? (d as { id: string }).id : "")).filter(Boolean).slice(0, 500);
}

/**
 * Each tier's newest model in the list, when it is a higher version of the
 * tier's family than the one written in MODELS; an undated alias over a dated
 * snapshot of the same version. A tier with nothing newer is left out.
 */
export function newestModels(ids: readonly string[]): Partial<Record<ModelTier, string>> {
  const out: Partial<Record<ModelTier, string>> = {};
  for (const tier of Object.keys(MODELS) as ModelTier[]) {
    const pinned = modelVersion(MODELS[tier]);
    if (!pinned) continue;
    let best: { id: string; major: number; minor: number; dated: boolean } | null = null;
    for (const id of ids) {
      const v = modelVersion(id);
      if (!v || v.family !== TIER_FAMILY[tier] || !newer(v, pinned)) continue;
      if (!best || newer(v, best) || (v.major === best.major && v.minor === best.minor && best.dated && !v.dated)) best = { id, ...v };
    }
    if (best) out[tier] = best.id;
  }
  return out;
}

/** The model a call goes to: a tier's model above becomes its newest release; any other name is sent as written. */
export function currentModel(model: string, newest: Partial<Record<ModelTier, string>>): string {
  const tier = (Object.keys(MODELS) as ModelTier[]).find((t) => MODELS[t] === model);
  return (tier && newest[tier]) || model;
}

/** The model each tier written above is on now. */
export const tierModelsNow = (newest: Partial<Record<ModelTier, string>>): Record<ModelTier, string> => ({ fast: newest.fast ?? MODELS.fast, standard: newest.standard ?? MODELS.standard, best: newest.best ?? MODELS.best });
