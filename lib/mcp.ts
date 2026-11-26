/**
 * The Model Context Protocol over Streamable HTTP, stateless and read-only:
 * each POST carries one JSON-RPC message (or a batch) and gets its answer as
 * JSON. No session is kept, no stream is opened, nothing is pushed.
 *
 * Offered: initialize, ping, tools/list and tools/call, with the tools of
 * lib/mcp-tools.ts. Every tool is read-only and says so in its annotations.
 * A tool that cannot answer returns its sentence as an error result; the
 * protocol itself answers only with JSON-RPC errors.
 *
 * Pure: app/api/mcp/route.ts serves it, scripts/check-mcp.ts drives it.
 */
import { z } from "zod";

import { MCP_INSTRUCTIONS, MCP_TOOLS, ToolProblem, type McpSource, type McpTool } from "@/lib/mcp-tools";

export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const LATEST_PROTOCOL = PROTOCOL_VERSIONS[0];
export const SERVER_INFO = { name: "portfolio-os", title: "Invariant", version: "1.0.0" };

/**
 * What the client shows for this server: the name, and, when the origin is
 * known, the app's own icon (the favicon, `app/icon.svg`, with a PNG for a
 * client that does not draw SVG) and the app as its website, as the MCP
 * `Implementation` carries them (Hamza, 17 Oct 2026: the connector showed
 * no icon in Claude's settings).
 */
export function serverInfoFor(origin: string | null): typeof SERVER_INFO & { websiteUrl?: string; icons?: { src: string; mimeType: string; sizes: string[] }[] } {
  if (!origin) return SERVER_INFO;
  return {
    ...SERVER_INFO,
    websiteUrl: origin,
    icons: [
      { src: `${origin}/icon-256.png`, mimeType: "image/png", sizes: ["256x256"] },
      { src: `${origin}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
    ],
  };
}

type Id = string | number;
type RpcRequest = { jsonrpc: "2.0"; id?: Id | null; method?: unknown; params?: unknown };
export type RpcReply = { jsonrpc: "2.0"; id: Id | null; result?: unknown; error?: { code: number; message: string } };

const rpcError = (id: Id | null, code: number, message: string): RpcReply => ({ jsonrpc: "2.0", id, error: { code, message } });

/** Each tool as tools/list shows it: its JSON Schema for the input, read-only in its annotations unless it is the one proposal tool, never destructive. */
export function toolList<S>(tools: readonly McpTool<S>[] = MCP_TOOLS as unknown as readonly McpTool<S>[]) {
  return tools.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: z.toJSONSchema(t.input, { target: "draft-2020-12", io: "input", unrepresentable: "any" }),
    annotations: { title: t.title, readOnlyHint: !t.writes, destructiveHint: false, idempotentHint: true, openWorldHint: t.name === "get_edgar_facts" || !!t.open },
  }));
}

/** Runs one tool: the arguments checked against its schema, a ToolProblem or a bad argument as an error result. */
export async function callTool<S>(name: string, args: unknown, source: () => Promise<S>, tools: readonly McpTool<S>[]): Promise<{ content: { type: "text"; text: string }[]; isError: boolean }> {
  const tool = tools.find((t) => t.name === name)!;
  const parsed = tool.input.safeParse(args ?? {});
  if (!parsed.success) {
    const why = parsed.error.issues.slice(0, 4).map((i) => `${i.path.join(".") || "arguments"}: ${i.message}`).join("; ");
    return { content: [{ type: "text", text: `The arguments do not fit ${name}: ${why}.` }], isError: true };
  }
  try {
    const text = await tool.run(await source(), parsed.data as never);
    return { content: [{ type: "text", text }], isError: false };
  } catch (e) {
    if (e instanceof ToolProblem) return { content: [{ type: "text", text: e.message }], isError: true };
    throw e;
  }
}

export type Handled = { status: 200; body: RpcReply | RpcReply[] } | { status: 202 } | { status: 400; body: RpcReply };

/**
 * One POST's body, answered. `source` opens the person's data, and only
 * tools/call asks for it, so connecting and listing cost no vault read. A
 * notification or a response from the client is accepted with 202.
 */
/** What a server offers: its tools and what it says of itself on initialize. The person's server is the default; the public research server (lib/mcp-research.ts) is the other. */
export type McpKit<S> = { tools: readonly McpTool<S>[]; instructions: string; info?: { name: string; title: string } };
export const PERSON_KIT: McpKit<McpSource> = { tools: MCP_TOOLS, instructions: MCP_INSTRUCTIONS };

export async function handleRpc<S = McpSource>(body: unknown, source: () => Promise<S>, problem: (e: unknown) => string, origin: string | null = null, kit: McpKit<S> = PERSON_KIT as unknown as McpKit<S>): Promise<Handled> {
  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as unknown[];
  if (!messages.length) return { status: 400, body: rpcError(null, -32600, "An empty batch.") };
  const replies: RpcReply[] = [];
  for (const raw of messages) {
    const reply = await one(raw, source, problem, origin, kit);
    if (reply) replies.push(reply);
  }
  if (!replies.length) return { status: 202 };
  return { status: 200, body: batch ? replies : replies[0] };
}

async function one<S>(raw: unknown, source: () => Promise<S>, problem: (e: unknown) => string, origin: string | null, kit: McpKit<S>): Promise<RpcReply | null> {
  if (!raw || typeof raw !== "object" || (raw as RpcRequest).jsonrpc !== "2.0") return rpcError(null, -32600, "Not a JSON-RPC 2.0 message.");
  const msg = raw as RpcRequest;
  const hasId = "id" in msg && msg.id !== undefined && msg.id !== null;
  // A notification, or the client's answer to a request this server never sends: nothing to say.
  if (!hasId) return null;
  const id = msg.id as Id;
  if (typeof id !== "string" && typeof id !== "number") return rpcError(null, -32600, "The id must be a string or a number.");
  if (typeof msg.method !== "string") return "result" in msg || "error" in msg ? null : rpcError(id, -32600, "A request needs a method.");
  const params = (msg.params && typeof msg.params === "object" ? msg.params : {}) as Record<string, unknown>;
  switch (msg.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : LATEST_PROTOCOL;
      const protocolVersion = (PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : LATEST_PROTOCOL;
      return { jsonrpc: "2.0", id, result: { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { ...serverInfoFor(origin), ...(kit.info ?? {}) }, instructions: kit.instructions } };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: toolList(kit.tools) } };
    case "tools/call": {
      const name = params.name;
      if (typeof name !== "string" || !kit.tools.some((t) => t.name === name)) return rpcError(id, -32602, `Unknown tool: ${String(name)}.`);
      try {
        return { jsonrpc: "2.0", id, result: await callTool(name, params.arguments, source, kit.tools) };
      } catch (e) {
        // The person's data could not be opened, or a tool failed: a sentence, as an error result the model can read.
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: problem(e) }], isError: true } };
      }
    }
    case "resources/list":
      return { jsonrpc: "2.0", id, result: { resources: [] } };
    case "prompts/list":
      return { jsonrpc: "2.0", id, result: { prompts: [] } };
    default:
      return rpcError(id, -32601, `Method not offered: ${msg.method}.`);
  }
}
