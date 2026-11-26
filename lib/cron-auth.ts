import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Whether a request carries Vercel's cron secret. Returns the response to send
 * when it does not, or null when it does.
 *
 * **The secret, compared in constant time.** Vercel sends
 * `Authorization: Bearer $CRON_SECRET` to cron routes. `===` on two strings
 * returns at the first differing character, which leaks how much of a guess
 * was right. Both sides are hashed first so `timingSafeEqual` always compares
 * 32 bytes against 32 — a raw comparison would also leak the secret's length,
 * and throws outright on a length mismatch.
 *
 * **Fails closed.** With no `CRON_SECRET` configured, nothing is accepted.
 * The alternative is an endpoint that anyone can hit whenever the variable is
 * forgotten on a new deployment.
 */
export function refuseUnlessCron(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response("Not configured.", { status: 503 });

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(presented), digest(secret))) {
    return new Response("Unauthorized.", { status: 401 });
  }
  return null;
}
