import { z } from "zod";

import { dismissAlerts, markAllRead } from "@/lib/notifications-run";
import { operatorOrNull } from "@/lib/session";
import { storageMode } from "@/lib/storage";
import { SyncError } from "@/lib/sync-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.union([z.object({ dismiss: z.array(z.string().min(1).max(200)).min(1).max(200) }), z.object({ read: z.literal(true) })]);

const json = (body: { error: string | null }, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "private, no-store" } });

/**
 * Dismiss and Mark all read on Notifications. A route the page calls with
 * fetch, never a server action or a transition, so moving to another screen
 * never waits for the vault to be written (Hamza, 23 Oct 2026: after
 * Dismiss, the next page took a long time): React holds a navigation until
 * every pending transition ends, and a dismissal is a read and a write of
 * the vault. The page sends them one at a time (components/notifications/send.ts),
 * so two never overwrite each other's file.
 */
export async function POST(req: Request) {
  if (storageMode() === "drive" && !(await operatorOrNull())) return json({ error: "Sign in again." }, 401);
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return json({ error: "Nothing to dismiss or mark read." }, 400);
  }
  try {
    return json({ error: "dismiss" in body ? await dismissAlerts(body.dismiss) : await markAllRead() });
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[notifications] ${e.logDetail ?? "failed"}`);
      return json({ error: e.message }, 502);
    }
    throw e;
  }
}
