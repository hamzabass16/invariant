/**
 * Sign-in for a person's own Claude: the OAuth 2.1 the Model Context
 * Protocol asks of a remote server, kept without a database.
 *
 *   - Claude finds the server through the protected resource metadata
 *     (RFC 9728) and the authorization server metadata (RFC 8414) built here.
 *   - It registers itself (RFC 7591) or names its published client document
 *     (an https client id on claude.ai or claude.com). A registered client id
 *     is the client's own redirect addresses, sealed; nothing is stored.
 *   - The person signs in with the same Google or Microsoft account as the
 *     app and allows the read on a consent page that names where the code
 *     goes. The code, the access token and the refresh token are sealed
 *     (AES-256-GCM under a key derived from the deployment's AUTH_SECRET) and
 *     carry the sign-in's own refresh token, so each call opens the person's
 *     vault the way the scheduled report does. Only the server can open them.
 *   - Codes go only to Claude's callback, ChatGPT's (Hamza, 21 Oct 2026), or
 *     to a loopback address on the person's own machine (Claude Code); PKCE
 *     S256 is required.
 *
 * What is kept nowhere cannot be listed or revoked one by one: a token lives
 * out its expiry (an hour for access, thirty days for refresh), and the
 * allowlist is read on every call, so removing an address, or the person
 * removing the app's access at Google or Microsoft, ends it at once.
 *
 * Pure apart from node:crypto: the routes, the consent page and the check
 * share it. Nothing here logs; a token never reaches a log line or a URL
 * other than the redirect the client registered.
 */
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

export const MCP_PATH = "/api/mcp";
export const MCP_SCOPE = "portfolio.read";
export const ACCESS_SECONDS = 60 * 60;
export const REFRESH_SECONDS = 30 * 24 * 60 * 60;
export const CODE_SECONDS = 5 * 60;
export const AUTHORIZE_PATH = "/mcp/authorize";
export const TOKEN_PATH = "/api/mcp/oauth/token";
export const REGISTER_PATH = "/api/mcp/oauth/register";

/** Claude's hosted apps (claude.ai, Desktop, mobile) send people back here. */
export const CLAUDE_CALLBACKS = ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"] as const;
/**
 * ChatGPT's callbacks (Hamza, 21 Oct 2026: a ChatGPT connector too): its
 * apps send people back to the connector platform's redirect, or to one per
 * app under /connector/oauth/; OpenAI's review console to its own. ChatGPT
 * registers itself (RFC 7591) with one of them.
 */
export const CHATGPT_CALLBACKS = ["https://chatgpt.com/connector_platform_oauth_redirect", "https://platform.openai.com/apps-manage/oauth"] as const;
const CHATGPT_APP_CALLBACK = /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,100}$/;

/** A ChatGPT callback: the platform's own, or one app's. */
export function isChatgptCallback(uri: string): boolean {
  return (CHATGPT_CALLBACKS as readonly string[]).includes(uri) || CHATGPT_APP_CALLBACK.test(uri);
}

/** The hosts whose published client documents (CIMD) are taken as Claude's. */
const CLAUDE_HOSTS = new Set(["claude.ai", "claude.com"]);

export type Provider = "google" | "microsoft";

/** What a code or a token carries: who signed in, through which provider, with that sign-in's own refresh token. */
export type Grant = { email: string; provider: Provider; refresh: string; client: string; resource: string };

type Sealed =
  | { k: "client"; r: string[]; n: string }
  | ({ k: "code"; exp: number; u: string; ch: string } & Grant)
  | ({ k: "access"; exp: number } & Grant)
  | ({ k: "refresh"; exp: number } & Grant);
type Kind = Sealed["k"];

const PREFIX = "pos1";

/** The sealing key: HKDF over the deployment's AUTH_SECRET, so no new setting is needed and a rotated secret ends every token. */
export function mcpKey(secret: string | undefined): Buffer | null {
  if (!secret || secret.length < 16) return null;
  return Buffer.from(hkdfSync("sha256", secret, "portfolio-os", "mcp tokens v1", 32));
}

const b64url = (b: Buffer) => b.toString("base64url");

function seal(key: Buffer, value: Sealed): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `${PREFIX}.${b64url(Buffer.concat([iv, cipher.getAuthTag(), body]))}`;
}

function open<K extends Kind>(key: Buffer, kind: K, sealed: string | null | undefined, nowSec: number): Extract<Sealed, { k: K }> | null {
  if (!sealed || sealed.length > 8000 || !sealed.startsWith(`${PREFIX}.`)) return null;
  try {
    const raw = Buffer.from(sealed.slice(PREFIX.length + 1), "base64url");
    if (raw.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const value = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")) as Sealed;
    if (value.k !== kind) return null;
    if ("exp" in value && !(typeof value.exp === "number" && value.exp > nowSec)) return null;
    return value as Extract<Sealed, { k: K }>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Redirect addresses

function parse(uri: string): URL | null {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** A loopback address on the person's own machine: plain http, any port (RFC 8252). */
export function isLoopback(uri: string): boolean {
  const u = parse(uri);
  return !!u && u.protocol === "http:" && LOOPBACK.has(u.hostname) && !u.username && !u.password && !u.hash;
}

/** Where a code may go: Claude's own callback, ChatGPT's, or a loopback address for Claude Code. Anything else is refused at registration and at sign-in. */
export function redirectAllowed(uri: string): boolean {
  return (CLAUDE_CALLBACKS as readonly string[]).includes(uri) || isChatgptCallback(uri) || isLoopback(uri);
}

/** A registered address matches exactly, or for loopback with the port left out of the comparison. */
export function redirectMatches(registered: readonly string[], uri: string): boolean {
  if (!redirectAllowed(uri)) return false;
  if (registered.includes(uri)) return true;
  if (!isLoopback(uri)) return false;
  const u = parse(uri)!;
  return registered.some((r) => {
    const g = parse(r);
    return !!g && isLoopback(r) && g.hostname === u.hostname && g.pathname === u.pathname && g.search === u.search;
  });
}

// ---------------------------------------------------------------------------
// Clients

export type Client = { id: string; name: string; redirects: string[] | null; claude: boolean; chatgpt: boolean };

const registrationSchemaError = (why: string) => ({ error: "invalid_redirect_uri" as const, error_description: why });

/**
 * Registers a client (RFC 7591) without storing it: the client id is its
 * redirect addresses and name, sealed. Only Claude's callback and loopback
 * addresses are taken.
 */
export function register(key: Buffer, body: unknown): { ok: true; reply: Record<string, unknown> } | { ok: false; reply: { error: string; error_description: string } } {
  const b = (body && typeof body === "object" ? body : {}) as { redirect_uris?: unknown; client_name?: unknown; token_endpoint_auth_method?: unknown; grant_types?: unknown };
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (!uris.length || uris.length > 5 || uris.length !== (b.redirect_uris as unknown[]).length) return { ok: false, reply: registrationSchemaError("Give one to five redirect addresses.") };
  const bad = uris.find((u) => !redirectAllowed(u));
  if (bad) return { ok: false, reply: registrationSchemaError("Invariant sends sign-ins only to Claude's or ChatGPT's callback, or to a loopback address on your own machine.") };
  if (b.token_endpoint_auth_method !== undefined && b.token_endpoint_auth_method !== "none") return { ok: false, reply: { error: "invalid_client_metadata", error_description: "Clients here are public: token_endpoint_auth_method none." } };
  const name = uris.every(isChatgptCallback) ? "ChatGPT" : typeof b.client_name === "string" && b.client_name.trim() ? b.client_name.trim().slice(0, 60) : "An MCP client";
  const id = seal(key, { k: "client", r: uris, n: name });
  return {
    ok: true,
    reply: { client_id: id, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name, redirect_uris: uris, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", scope: MCP_SCOPE },
  };
}

/** The client behind an id: a sealed registration, or Claude's published document on claude.ai or claude.com, whose redirects are Claude's callback and loopback. */
export function clientOf(key: Buffer, id: string | null | undefined): Client | null {
  if (!id) return null;
  if (id.startsWith("https://")) {
    const u = parse(id);
    if (!u || !CLAUDE_HOSTS.has(u.hostname) || u.port || u.username) return null;
    const code = /claude-code/i.test(u.pathname);
    return { id, name: code ? "Claude Code" : "Claude", redirects: null, claude: true, chatgpt: false };
  }
  const c = open(key, "client", id, 0);
  return c ? { id, name: c.n, redirects: c.r, claude: false, chatgpt: c.r.every(isChatgptCallback) } : null;
}

/** Whether a client may send the person back to this address: a registered one to its own, Claude's published document to Claude's callback or loopback, never ChatGPT's. */
export function clientRedirects(c: Client, uri: string): boolean {
  return c.redirects ? redirectMatches(c.redirects, uri) : redirectAllowed(uri) && !isChatgptCallback(uri);
}

// ---------------------------------------------------------------------------
// The authorization request

export type AuthorizeRequest = { client: Client; redirect: string; state: string | null; challenge: string; resource: string };

export type AuthorizeProblem =
  /** Shown on the page: there is no trustworthy address to send the person back to. */
  | { show: string }
  /** Sent back to the client's own address. */
  | { redirect: string; error: string; description: string; state: string | null };

/**
 * Reads the authorization request. A bad client or address is shown on the
 * page (never redirected); a bad request from a good client goes back to it.
 */
export function readAuthorize(key: Buffer, p: Record<string, string | undefined>, resource: string): { ok: true; req: AuthorizeRequest } | { ok: false; problem: AuthorizeProblem } {
  const client = clientOf(key, p.client_id);
  if (!client) return { ok: false, problem: { show: "This connection request names a client Invariant does not know. Start again from Claude or ChatGPT." } };
  const redirect = p.redirect_uri ?? (client.redirects?.length === 1 ? client.redirects[0] : "");
  if (!redirect || !clientRedirects(client, redirect)) return { ok: false, problem: { show: "This connection request would send you somewhere other than Claude or ChatGPT. Start again from Claude or ChatGPT." } };
  const state = p.state ?? null;
  const back = (error: string, description: string): { ok: false; problem: AuthorizeProblem } => ({ ok: false, problem: { redirect, error, description, state } });
  if (p.response_type !== "code") return back("unsupported_response_type", "Only the authorization code flow is offered.");
  if (!p.code_challenge || !/^[A-Za-z0-9_-]{43}$/.test(p.code_challenge) || p.code_challenge_method !== "S256") return back("invalid_request", "PKCE with S256 is required.");
  if (p.resource && p.resource !== resource) return back("invalid_target", "This server's resource is its /api/mcp address.");
  if (p.scope && !p.scope.split(" ").every((s) => s === MCP_SCOPE || s === "offline_access" || s === "")) return back("invalid_scope", `The one scope is ${MCP_SCOPE}.`);
  return { ok: true, req: { client, redirect, state, challenge: p.code_challenge, resource } };
}

/** Where the person goes after the consent page: the client's address with the code, or with the error. */
export function redirectWith(redirect: string, params: Record<string, string | null>): string {
  const u = new URL(redirect);
  for (const [k, v] of Object.entries(params)) if (v !== null) u.searchParams.set(k, v);
  return u.toString();
}

export function issueCode(key: Buffer, req: AuthorizeRequest, grant: Omit<Grant, "client" | "resource">, nowSec: number): string {
  return seal(key, { k: "code", exp: nowSec + CODE_SECONDS, u: req.redirect, ch: req.challenge, ...grant, client: req.client.id, resource: req.resource });
}

/** PKCE S256 (RFC 7636): the verifier's SHA-256, base64url, must be the challenge. */
export function pkceOk(verifier: string | undefined, challenge: string): boolean {
  if (!verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  return b64url(createHash("sha256").update(verifier).digest()) === challenge;
}

// ---------------------------------------------------------------------------
// The token endpoint

export type TokenReply = { status: number; body: Record<string, unknown> };

const tokenError = (error: string, description: string, status = 400): TokenReply => ({ status, body: { error, error_description: description } });

function tokens(key: Buffer, g: Grant, nowSec: number): TokenReply {
  return {
    status: 200,
    body: {
      access_token: seal(key, { k: "access", exp: nowSec + ACCESS_SECONDS, ...g }),
      token_type: "Bearer",
      expires_in: ACCESS_SECONDS,
      refresh_token: seal(key, { k: "refresh", exp: nowSec + REFRESH_SECONDS, ...g }),
      scope: MCP_SCOPE,
    },
  };
}

/**
 * The token endpoint's answer to a form (application/x-www-form-urlencoded).
 * `allowed` is the allowlist read now, so a removed address gets no token.
 */
export function tokenReply(key: Buffer, form: URLSearchParams, allowed: (email: string) => boolean, nowSec: number): TokenReply {
  const grantType = form.get("grant_type");
  const clientId = form.get("client_id");
  if (grantType === "authorization_code") {
    const code = open(key, "code", form.get("code"), nowSec);
    if (!code) return tokenError("invalid_grant", "The code is unknown or has expired. Connect again from Claude.");
    if (clientId && clientId !== code.client) return tokenError("invalid_grant", "The code was issued to another client.");
    if (form.get("redirect_uri") && form.get("redirect_uri") !== code.u) return tokenError("invalid_grant", "The redirect address differs from the one signed in with.");
    if (!pkceOk(form.get("code_verifier") ?? undefined, code.ch)) return tokenError("invalid_grant", "The PKCE verifier does not match.");
    if (form.get("resource") && form.get("resource") !== code.resource) return tokenError("invalid_target", "The resource differs from the one signed in for.");
    if (!allowed(code.email)) return tokenError("invalid_grant", "This account is no longer on the access list.");
    return tokens(key, { email: code.email, provider: code.provider, refresh: code.refresh, client: code.client, resource: code.resource }, nowSec);
  }
  if (grantType === "refresh_token") {
    const r = open(key, "refresh", form.get("refresh_token"), nowSec);
    if (!r) return tokenError("invalid_grant", "The refresh token is unknown or has expired. Connect again from Claude.");
    if (clientId && clientId !== r.client) return tokenError("invalid_grant", "The refresh token was issued to another client.");
    if (!allowed(r.email)) return tokenError("invalid_grant", "This account is no longer on the access list.");
    return tokens(key, { email: r.email, provider: r.provider, refresh: r.refresh, client: r.client, resource: r.resource }, nowSec);
  }
  return tokenError("unsupported_grant_type", "authorization_code or refresh_token.");
}

/** The grant behind a bearer token on a call, or null: unknown, expired, for another resource, or no longer on the allowlist. */
export function accessGrant(key: Buffer, header: string | null, resource: string, allowed: (email: string) => boolean, nowSec: number): Grant | null {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  const a = open(key, "access", m?.[1], nowSec);
  if (!a || a.resource !== resource || !allowed(a.email)) return null;
  return { email: a.email, provider: a.provider, refresh: a.refresh, client: a.client, resource: a.resource };
}

// ---------------------------------------------------------------------------
// Discovery

export const resourceOf = (origin: string) => `${origin}${MCP_PATH}`;
export const resourceMetadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`;

/** RFC 9728: the resource is the /api/mcp address exactly as the person pastes it; the issuer is the app itself. */
export function protectedResource(origin: string): Record<string, unknown> {
  return { resource: resourceOf(origin), authorization_servers: [origin], scopes_supported: [MCP_SCOPE], bearer_methods_supported: ["header"], resource_name: "Invariant" };
}

/** RFC 8414, with both ways a client may name itself: registration and a published document. */
export function authorizationServer(origin: string): Record<string, unknown> {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}${AUTHORIZE_PATH}`,
    token_endpoint: `${origin}${TOKEN_PATH}`,
    registration_endpoint: `${origin}${REGISTER_PATH}`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [MCP_SCOPE],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

/** The 401 that starts sign-in, pointing at the resource metadata. */
export function challenge(origin: string, error?: "invalid_token"): string {
  return `Bearer resource_metadata="${resourceMetadataUrl(origin)}", scope="${MCP_SCOPE}"${error ? `, error="${error}"` : ""}`;
}
