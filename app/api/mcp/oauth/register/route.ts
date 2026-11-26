import { NextResponse, type NextRequest } from "next/server";

import { register } from "@/lib/mcp-auth";
import { mcpOpen, serverKey } from "@/lib/mcp-run";

/** Dynamic client registration (RFC 7591), kept nowhere: the client id is the client's own redirect addresses, sealed (lib/mcp-auth.ts). */
export const dynamic = "force-dynamic";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "cache-control": "no-store" };

export async function POST(req: NextRequest) {
  const key = serverKey();
  if (mcpOpen() || !key) return NextResponse.json({ error: "invalid_request", error_description: "This deployment takes no sign-in." }, { status: 404, headers: CORS });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "The body is not JSON." }, { status: 400, headers: CORS });
  }
  const out = register(key, body);
  return NextResponse.json(out.reply, { status: out.ok ? 201 : 400, headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
