import { NextResponse, type NextRequest } from "next/server";

import { tokenReply } from "@/lib/mcp-auth";
import { mcpOpen, serverKey, withAccess } from "@/lib/mcp-run";

/** The token endpoint: a code or a refresh token in, sealed tokens out (lib/mcp-auth.ts). Form-encoded, as RFC 6749 says. */
export const dynamic = "force-dynamic";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type, authorization", "cache-control": "no-store", pragma: "no-cache" };

export async function POST(req: NextRequest) {
  const key = serverKey();
  if (mcpOpen() || !key) return NextResponse.json({ error: "invalid_request", error_description: "This deployment takes no sign-in." }, { status: 404, headers: CORS });
  let form: URLSearchParams;
  try {
    const type = req.headers.get("content-type") ?? "";
    form = type.includes("application/json") ? new URLSearchParams(Object.entries((await req.json()) as Record<string, string>).map(([k, v]) => [k, String(v)])) : new URLSearchParams(await req.text());
  } catch {
    return NextResponse.json({ error: "invalid_request", error_description: "The body could not be read." }, { status: 400, headers: CORS });
  }
  const now = Math.floor(Date.now() / 1000);
  const out = await withAccess((allowed) => tokenReply(key, form, allowed, now));
  return NextResponse.json(out.body, { status: out.status, headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
