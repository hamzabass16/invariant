import { NextResponse, type NextRequest } from "next/server";

import { handleRpc, PROTOCOL_VERSIONS } from "@/lib/mcp";
import { RESEARCH_INSTRUCTIONS, RESEARCH_TOOLS } from "@/lib/mcp-research";
import { researchProblem, researchSource } from "@/lib/mcp-research-run";
import { originOf } from "@/lib/mcp-run";

/**
 * The public research server (lib/mcp-research.ts): Streamable HTTP,
 * stateless, read-only, with no sign-in, since it reads public filings alone
 * and never a person's vault. The person's own server stays at /api/mcp.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

const KIT = { tools: RESEARCH_TOOLS, instructions: RESEARCH_INSTRUCTIONS, info: { name: "portfolio-os-research", title: "Invariant research" } };

export async function POST(req: NextRequest) {
  const origin = originOf(req.headers);
  const version = req.headers.get("mcp-protocol-version");
  if (version && !(PROTOCOL_VERSIONS as readonly string[]).includes(version)) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `Protocol version ${version} is not offered.` } }, 400);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "The body is not JSON." } }, 400);
  }
  const out = await handleRpc(body, async () => researchSource(), researchProblem, origin, KIT);
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
