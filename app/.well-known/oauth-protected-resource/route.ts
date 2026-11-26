import { NextResponse, type NextRequest } from "next/server";

import { protectedResource } from "@/lib/mcp-auth";
import { mcpOpen, originOf } from "@/lib/mcp-run";

/** RFC 9728: where the person's Claude learns how to sign in to the MCP server. The public demo takes no sign-in, so it has none. */
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  if (mcpOpen()) return NextResponse.json({ error: "This deployment takes no sign-in." }, { status: 404 });
  return NextResponse.json(protectedResource(originOf(req.headers)), { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" } });
}
