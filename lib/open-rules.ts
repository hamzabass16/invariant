import { z } from "zod";

import { FIELD_IDS, FIELDS, MEASURES, WINDOWS } from "@/lib/ontology";
import { methodologySchema } from "@/lib/methodology";

/**
 * The open rule language (Hamza, 9 Nov 2026, the moat's "open rule language,
 * closed engine"): the shape a methodology is written in, as a JSON Schema
 * anyone can read and write against, with the ontology's fields, measures
 * and windows it names. The engine that reads a book against it, the price
 * and filings reads, the checks and the record stay the app's. Pure; no
 * person's methodology, figure or name is in it.
 */
export const OPEN_RULES_VERSION = "2026-11-09";

export function openRulesDocument(origin: string | null) {
  const schema = z.toJSONSchema(methodologySchema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  return {
    ...schema,
    ...(origin ? { $id: `${origin}/api/methodology/schema` } : {}),
    title: "Invariant methodology",
    description: "A written investment methodology as rules, classes and figures over the Invariant ontology: what a book is tested against. A methodology written to this schema can be adopted in Invariant, where it takes effect only once its owner confirms it. Not investment advice.",
    "x-version": OPEN_RULES_VERSION,
    "x-ontology": {
      fields: FIELD_IDS.map((id) => ({ id, object: FIELDS[id].object, label: FIELDS[id].label, type: FIELDS[id].type, about: FIELDS[id].about, ...(FIELDS[id].values ? { values: FIELDS[id].values } : {}) })),
      measures: MEASURES,
      windows: WINDOWS,
    },
  };
}
