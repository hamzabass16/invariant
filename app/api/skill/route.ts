import { NextResponse, type NextRequest } from "next/server";

import { SKILL_NAME, skillMarkdown } from "@/lib/invariant-skill";
import { storedZip } from "@/lib/zip-store";

/**
 * The Invariant skill for a person's own Claude (lib/invariant-skill.ts), as
 * the zip Claude's Skills settings take: a folder with its SKILL.md. Public,
 * the same for everyone; no vault, no figure.
 */
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const origin = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : new URL(req.url).origin;
  const bytes = storedZip([{ path: `${SKILL_NAME}/SKILL.md`, text: skillMarkdown(origin) }]);
  return new NextResponse(bytes as BodyInit, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${SKILL_NAME}-skill.zip"`, "cache-control": "public, max-age=3600" } });
}
