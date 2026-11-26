import { NextResponse, type NextRequest } from "next/server";

import { openRulesDocument } from "@/lib/open-rules";

/**
 * The open rule language as a JSON Schema (lib/open-rules.ts), public and
 * read-only: no sign-in, no vault, no person's methodology.
 */
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const origin = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : new URL(req.url).origin;
  return NextResponse.json(openRulesDocument(origin), { headers: { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" } });
}
