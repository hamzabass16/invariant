import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { publicCallSchema, type PublicCall } from "@/lib/public-calls";
import { storageMode } from "@/lib/storage";

/** The public calls for the public pages: the registry's on a deployment, the demo's fictional ones in demo mode. Nothing here names an address. */
function sample(): PublicCall[] {
  return z.object({ calls: z.array(publicCallSchema) }).parse(JSON.parse(readFileSync(path.join(process.cwd(), "data/samples", "public-calls.json"), "utf8"))).calls;
}

export async function callsToShow(): Promise<{ calls: PublicCall[]; problem: string | null }> {
  if (storageMode() === "demo") return { calls: sample(), problem: null };
  try {
    const { registryAvailable, publicCalls } = await import("@/lib/registry");
    if (!registryAvailable()) return { calls: [], problem: "This deployment keeps no public calls." };
    return { calls: await publicCalls(null), problem: null };
  } catch {
    return { calls: [], problem: "The calls could not be read just now." };
  }
}

export async function callToShow(id: string): Promise<PublicCall | null> {
  if (storageMode() === "demo") return sample().find((c) => c.id === id) ?? null;
  try {
    const { registryAvailable, publicCall } = await import("@/lib/registry");
    return registryAvailable() ? await publicCall(id) : null;
  } catch {
    return null;
  }
}
