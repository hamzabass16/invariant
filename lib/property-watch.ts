/**
 * The property watch, pure: the file the app keeps in the vault
 * (property_watch), the request that fills it and the parsing of the answer.
 * The check runs in the app on the person's own Claude key
 * (lib/property-watch-run.ts): one call per property in which the model
 * searches the web for nearby rents, the short-stay market and news that could
 * move the price, and records what it found with its sources. Every figure is
 * one the search returned, with the page it came from; nothing is estimated,
 * and a suggested revaluation is never applied by itself.
 */
import { z } from "zod";

import type { Holding } from "@/lib/holdings";
import { MODELS } from "@/lib/models";
import { READ_BEHIND } from "@/lib/investigate";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const source = z.object({ title: z.string(), url: z.string().url() });

export const propertyWatchSchema = z.object({
  updated: isoDate,
  properties: z.array(
    z.object({
      holdingId: z.string(),
      whatChanged: z.string(),
      longTerm: z
        .object({
          medianRent: z.number(),
          low: z.number(),
          high: z.number(),
          count: z.number().int(),
          radiusKm: z.number(),
          trendPct: z.number().nullable(),
          note: z.string(),
          sources: z.array(source),
        })
        .nullable(),
      shortStay: z
        .object({
          adr: z.number().nullable(),
          occupancyPct: z.number().nullable(),
          note: z.string(),
          sources: z.array(source),
        })
        .nullable(),
      news: z.array(
        z.object({
          date: isoDate,
          title: z.string(),
          distanceKm: z.number().nullable(),
          direction: z.enum(["up", "down", "unclear"]),
          why: z.string(),
          material: z.boolean(),
          source,
        }),
      ),
      suggestedValuation: z.object({ value: z.number(), basis: z.string() }).nullable(),
    }),
  ),
});
export type PropertyWatch = z.infer<typeof propertyWatchSchema>;
export type PropertyWatchEntry = PropertyWatch["properties"][number];

export const WATCH_MODEL = MODELS.standard;
/** Web searches one property's check may use; the person pays for them on their key. */
export const WATCH_MAX_SEARCHES = 6;

const entrySchema = propertyWatchSchema.shape.properties.element;

const RENTAL_WORDS = { long_term: "rented long-term", short_stay: "let as a short-stay rental", own_use: "used by the owner", vacant: "vacant" } as const;

/**
 * One property's check. The model searches the web (the Anthropic server
 * tool), then records what it found by calling record_watch once. Figures
 * come only from pages the search returned, each section naming them.
 */
export function watchRequestBody(h: Holding, today: string, model = WATCH_MODEL): Record<string, unknown> {
  const p = h.property!;
  const schema = z.toJSONSchema(entrySchema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  const lines = [
    `Property id: ${h.id}. ${h.name}.`,
    `Address: ${p.address}, ${p.country}. Currently ${RENTAL_WORDS[p.rental]}.`,
    `Owner's share ${p.ownershipPct}%. Value on the books ${h.value.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${h.currency} (${p.valuationSource}${p.valuationDate ? `, as of ${p.valuationDate}` : ""}).`,
    p.monthlyRent ? `Rent received: ${p.monthlyRent.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${h.currency} a month.` : "No rent recorded.",
    p.purchasePrice ? `Bought ${p.purchaseDate ?? "on a date not recorded"} for ${p.purchasePrice.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${h.currency}.` : "",
    `Today is ${today}. Amounts in ${h.currency}.`,
  ].filter(Boolean);
  return {
    model,
    max_tokens: 4000,
    system: `You check one property for its owner, once a week, by searching the web. Search for: (1) current asking rents for comparable homes within about 1 km (same kind, similar size), their count, range and median, and how they moved on last quarter when a source says; (2) when the home is a short-stay rental or could be one, the average nightly rate and occupancy for the area; (3) news from the last 90 days within a few kilometres that could move prices: transport, zoning, licence caps, large developments, taxes. At most ${WATCH_MAX_SEARCHES} searches.

Rules:
- Every figure you record is one a page you found states; copy it, in the owner's currency, and name that page in sources with its real URL. Where you found nothing, record null and say so in the note. Never estimate, never round a guess into a figure.
- whatChanged is one or two plain sentences on what moved since last time, or that nothing material was found.
- suggestedValuation only when a found page gives a comparable sale or a valuation for homes like this one; state its basis in one sentence. It is a suggestion for the owner to accept or not.
- Mark news material only when it plausibly moves this home's value by a few percent or more.
${READ_BEHIND}
- Your whole answer is one call to record_watch with holdingId "${h.id}"; write nothing outside it. Not investment advice; terse.`,
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: WATCH_MAX_SEARCHES },
      { name: "record_watch", description: "Record this week's check of the property.", input_schema: schema },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: [{ type: "text", text: lines.join("\n") }] }],
  };
}

export type WatchParse = { ok: true; entry: PropertyWatchEntry } | { ok: false; reason: string };

/** Reads the answer: the one record_watch call, validated, its holdingId pinned to the property it was asked about. */
export function parseWatchResponse(body: unknown, holdingId: string): WatchParse {
  const content = (body as { content?: { type: string; name?: string; input?: unknown }[] } | null)?.content;
  const call = content?.find((c) => c.type === "tool_use" && c.name === "record_watch");
  if (!call) return { ok: false, reason: "the model answered in words instead of recording the check" };
  const parsed = entrySchema.safeParse({ ...(call.input as object), holdingId });
  if (!parsed.success) return { ok: false, reason: `the answer did not fit (${parsed.error.issues.length} issues)` };
  return { ok: true, entry: parsed.data };
}

/** The entry a property gets when its check could not run: the sentence, nothing else, so the screen says so rather than looking empty. */
export function unchecked(holdingId: string, why: string): PropertyWatchEntry {
  return { holdingId, whatChanged: `Not checked this time: ${why.replace(/\.$/, "")}.`, longTerm: null, shortStay: null, news: [], suggestedValuation: null };
}

/** The file after one run: today's entries replace the old ones for the same properties; properties no longer held drop out. */
export function mergeWatch(entries: PropertyWatchEntry[], today: string): PropertyWatch {
  return propertyWatchSchema.parse({ updated: today, properties: entries });
}
