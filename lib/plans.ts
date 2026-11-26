/**
 * Plans, invitations and the beta's counts (Hamza, 9 Nov 2026: a free,
 * invite-only beta for about thirty people, measured from the first invite).
 * Pure: it reads the settings it is handed and nothing else.
 *
 * A plan is a word on the person's account (lib/users.ts), never on their
 * files, and sets nothing but the monthly AI allowance (Hamza, 26 Nov 2026:
 * open source, nothing is sold). Each plan's monthly AI allowance at list price comes
 * from PLAN_CAPS_USD ("beta:3,core:1.5,pro:6"), else `DEFAULT_PLAN_CAPS`; an
 * account with no plan, and the operator, keep the deployment's own cap
 * (MODEL_CAP_USD, else DEFAULT_CAP_USD in lib/model-meter.ts). Past the cap
 * the model is not called, so the scheduled prose pauses and says so while the
 * figures, checks and alerts, which never call it, keep running.
 */

export const PLANS = ["beta", "founder", "core", "pro"] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_WORDS: Record<Plan, string> = { beta: "Beta", founder: "Founding member", core: "Core", pro: "Pro" };

/** US dollars of AI a month at list price, unless PLAN_CAPS_USD says otherwise (the business plan, 8 Nov 2026). */
export const DEFAULT_PLAN_CAPS: Record<Plan, number> = { beta: 3, founder: 1.5, core: 1.5, pro: 6 };

export const isPlan = (v: unknown): v is Plan => typeof v === "string" && (PLANS as readonly string[]).includes(v);

/** PLAN_CAPS_USD read over the defaults: "plan:dollars" pairs, a pair that does not read left at its default. */
export function planCaps(raw: string | undefined): Record<Plan, number> {
  const caps = { ...DEFAULT_PLAN_CAPS };
  for (const pair of (raw ?? "").split(/[\s,;]+/)) {
    const [name, value] = pair.split(":");
    const n = Number(value);
    if (isPlan(name?.trim().toLowerCase()) && value !== undefined && value.trim() !== "" && Number.isFinite(n) && n >= 0) caps[name.trim().toLowerCase() as Plan] = n;
  }
  return caps;
}

/** The plan a new account takes when its invitation names none: DEFAULT_PLAN, else none. */
export function defaultPlan(raw: string | undefined): Plan | null {
  const p = (raw ?? "").trim().toLowerCase();
  return isPlan(p) ? p : null;
}

/** One person's monthly cap: their plan's, else the deployment's own. */
export function capOf(plan: Plan | null, caps: Record<Plan, number>, fallback: number): number {
  return plan ? caps[plan] : fallback;
}

// ---------------------------------------------------------------------------
// Who may make an account

/** SIGN_UP: "open" takes anyone, "invite" only someone with a code from the operator; anything else, unset included, takes no one. */
export type SignUpMode = "open" | "invite" | "closed";

export function signUpModeOf(raw: string | undefined): SignUpMode {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "open" ? "open" : v === "invite" ? "invite" : "closed";
}

/** An invitation as typed: letters and digits, upper case, without spaces or dashes. */
export function normalInviteCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The cookie that carries a checked invitation from the sign-up page to the Google or Microsoft sign-in, for half an hour; the code alone, used up when the account is made. */
export const INVITE_COOKIE = "pos_invite";
export const INVITE_COOKIE_SECONDS = 30 * 60;

/** Whether a typed code could be one: the twelve letters and digits a made code has. */
export const inviteShapeOk = (raw: string) => normalInviteCode(raw).length === INVITE_LENGTH;

export const INVITE_LENGTH = 12;
/** Letters and digits a made code is drawn from: no 0, O, 1, I or L, so a code read aloud or copied by hand is not misread. */
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A code as shown: three groups of four. */
export function shownInviteCode(code: string): string {
  return normalInviteCode(code).replace(/(.{4})(?=.)/g, "$1-");
}

/** How many people one code may let in, and for how many days, at most. */
export const MAX_INVITE_USES = 200;
export const MAX_INVITE_DAYS = 120;

// ---------------------------------------------------------------------------
// The beta's five counts (the business plan, section 9), on /ops

export const BETA_EVENTS = ["signed_up", "statement_read", "methodology_confirmed", "verdict_viewed", "connector_added"] as const;
export type BetaEvent = (typeof BETA_EVENTS)[number];

export const BETA_EVENT_WORDS: Record<BetaEvent, string> = {
  signed_up: "Signed up",
  statement_read: "Read a statement",
  methodology_confirmed: "Confirmed a methodology",
  verdict_viewed: "Opened a weekly review",
  connector_added: "Added the connector to Claude",
};

/** Each count as a share of those who signed up, rounded; none when no one has. */
export function funnel(counts: Partial<Record<BetaEvent, number>>): { event: BetaEvent; words: string; people: number; share: number | null }[] {
  const base = counts.signed_up ?? 0;
  return BETA_EVENTS.map((event) => {
    const people = counts[event] ?? 0;
    return { event, words: BETA_EVENT_WORDS[event], people, share: base > 0 ? Math.round((people / base) * 100) : null };
  });
}

/** What the sign-in page says after Delete my account. */
export const ACCOUNT_DELETED_WORDS = "Your account and everything this deployment kept about you are deleted. Your files are still in the Portfolio OS folder in your own Drive; delete the folder there to remove them too.";
