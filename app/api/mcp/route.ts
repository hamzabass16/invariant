import { NextResponse, type NextRequest } from "next/server";

import { handleRpc, PROTOCOL_VERSIONS } from "@/lib/mcp";
import { challenge, resourceOf } from "@/lib/mcp-auth";
import { grantOf, mcpOpen, mcpProblem, mcpSource, originOf } from "@/lib/mcp-run";

/**
 * The MCP server a person adds to their own Claude: Streamable HTTP,
 * stateless, read-only (lib/mcp.ts). Every call carries the bearer token
 * from their sign-in, checked here; without one the answer is the 401 that
 * starts sign-in. The public demo answers without sign-in, from the
 * anonymized showcase.
 */

export const dynamic = "force-dynamic";
// A tool call opens the person's vault and the market feed, as a screen does.
export const maxDuration = 60;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

export async function POST(req: NextRequest) {
  const origin = originOf(req.headers);
  let grant = null;
  if (!mcpOpen()) {
    const header = req.headers.get("authorization");
    grant = await grantOf(header, resourceOf(origin));
    if (!grant) return json({ error: "invalid_token", error_description: "Sign in to Invariant from Claude to use this server." }, 401, { "www-authenticate": challenge(origin, header ? "invalid_token" : undefined) });
  }
  const version = req.headers.get("mcp-protocol-version");
  if (version && !(PROTOCOL_VERSIONS as readonly string[]).includes(version)) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `Protocol version ${version} is not offered.` } }, 400);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "The body is not JSON." } }, 400);
  }
  const out = await handleRpc(body, () => mcpSource(grant), mcpProblem, origin);
  if (out.status === 202) return new NextResponse(null, { status: 202 });
  return json(out.body, out.status);
}

/** No stream is offered: every answer comes back on its POST. */
export function GET() {
  return json({ error: "This server answers POST only." }, 405, { allow: "POST" });
}

export function DELETE() {
  return json({ error: "No session is kept, so there is none to end." }, 405, { allow: "POST" });
}
