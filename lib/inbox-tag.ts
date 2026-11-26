import "server-only";

import { createHash } from "node:crypto";

/** A person's tag on the statements inbox: a short hash of their sign-in, never their email. */
export function inboxTag(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 8);
}
