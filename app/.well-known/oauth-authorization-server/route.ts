import { NextResponse, type NextRequest } from "next/server";

import { authorizationServer } from "@/lib/mcp-auth";
import { mcpOpen, originOf } from "@/lib/mcp-run";

/** RFC 8414: the app is its own authorization server for the MCP server, signing people in with the same Google or Microsoft account. */
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  if (mcpOpen()) return NextResponse.json({ error: "This deployment takes no sign-in." }, { status: 404 });
  return NextResponse.json(authorizationServer(originOf(req.headers)), { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" } });
}
