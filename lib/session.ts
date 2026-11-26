import "server-only";

import { redirect } from "next/navigation";

import { demoIsPublic } from "@/lib/storage";

export type Operator = { name: string | null; email: string; image: string | null };

/**
 * A signed-in operator for a local preview or smoke run, and nothing else.
 *
 * Two locks, as in ADPHI-OS: it does nothing unless PREVIEW_OPERATOR_EMAIL is
 * set, which no deployment sets, and it refuses outright on Vercel, which
 * always sets VERCEL. Setting it there by mistake fails closed.
 */
function previewOperator(): Operator | null {
  const email = process.env.PREVIEW_OPERATOR_EMAIL;
  if (!email) return null;
  if (process.env.VERCEL) {
    throw new Error(
      "PREVIEW_OPERATOR_EMAIL is set on a Vercel deployment. Remove it: it is a local testing shim, never a deployment setting.",
    );
  }
  return { name: "Local preview", email, image: null };
}

/** Every screen is behind the allowlist. Redirects rather than throwing. */
export async function requireOperator(): Promise<Operator> {
  const shim = previewOperator();
  if (shim) return shim;
  // The public demo shows fictional samples only and has no sign-in; drive mode never gets here.
  if (demoIsPublic()) return { name: "Demo", email: "demo", image: null };

  const { auth, admitted } = await import("@/lib/auth");
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  // Re-checked on every request, so removing an address or an account revokes a live session.
  if (!email || !(await admitted(email))) redirect("/sign-in");
  return { name: session!.user!.name ?? null, email, image: session!.user!.image ?? null };
}

/** The same check for a route that answers in JSON: the operator, or null where a screen would redirect to sign in. */
export async function operatorOrNull(): Promise<Operator | null> {
  const shim = previewOperator();
  if (shim) return shim;
  if (demoIsPublic()) return { name: "Demo", email: "demo", image: null };
  const { auth, admitted } = await import("@/lib/auth");
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email || !(await admitted(email))) return null;
  return { name: session!.user!.name ?? null, email, image: session!.user!.image ?? null };
}
