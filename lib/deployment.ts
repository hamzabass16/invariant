/**
 * What a deployment says about itself, from its own settings and never
 * written into the code (pure: it reads the environment and nothing else).
 * Server code only, since a browser does not see these variables.
 */

/** The address people write to: CONTACT_EMAIL, else the inbox the app reads and sends from. Null when neither is set. */
export function contactAddress(): string | null {
  const a = (process.env.CONTACT_EMAIL ?? process.env.INBOX_ADDRESS ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a) ? a : null;
}

/** The address in a sentence: the address, else who it would be. */
export const contactWords = () => contactAddress() ?? "whoever runs this deployment";

/**
 * Where the public demo is, ending before /try: DEMO_URL; on a demo
 * deployment itself, its own pages (""); else null, and no screen links it.
 */
export function demoBase(): string | null {
  const u = (process.env.DEMO_URL ?? "").trim().replace(/\/$/, "");
  if (/^https:\/\/[^\s/]+/.test(u)) return u;
  return process.env.STORAGE === "demo" ? "" : null;
}

/**
 * Where the source code is (SOURCE_URL, an https address, such as the
 * repository on GitHub); null when unset, and the front page links none.
 */
export function sourceUrl(): string | null {
  const u = (process.env.SOURCE_URL ?? "").trim().replace(/\/$/, "");
  return /^https:\/\/[^\s/]+/.test(u) ? u : null;
}

/**
 * Who may open the operator's screen (/ops): the addresses in
 * OPERATOR_EMAILS, else those in SHARED_RECAP_TO, which already name the
 * operator. Lower case; empty when neither is set, and then no one may.
 */
export function operatorEmails(): string[] {
  const raw = process.env.OPERATOR_EMAILS ?? process.env.SHARED_RECAP_TO ?? "";
  return raw
    .split(/[\s,;]+/)
    .map((a) => a.trim().toLowerCase())
    .filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
}

/**
 * Whether the AI a person asks for on demand runs in the app (the beta's
 * hybrid AI, Hamza, 9 Nov 2026): only for the operator and the allowlist
 * (OPERATOR_EMAILS, ALLOWED_EMAILS); everyone else asks their own Claude
 * through the connector (lib/ask-claude.ts).
 */
export function hostsOnDemand(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  const allowed = (process.env.ALLOWED_EMAILS ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
  return operatorEmails().includes(e) || allowed.includes(e);
}
