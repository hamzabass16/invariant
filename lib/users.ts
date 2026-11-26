import "server-only";

import { createHmac, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import { connectionProblem } from "@/lib/connection-string";
import { defaultPlan, INVITE_ALPHABET, INVITE_LENGTH, inviteShapeOk, isPlan, MAX_INVITE_DAYS, MAX_INVITE_USES, normalInviteCode, signUpModeOf, type Plan, type SignUpMode } from "@/lib/plans";
import { SyncError } from "@/lib/sync-error";

/**
 * The app's own accounts, for people who are not on ALLOWED_EMAILS: one row
 * per address in the operator's Postgres (DATABASE_URL, the same database as
 * the registry), holding the address, a password hash and, while a sign-up
 * is being verified, the hash of the code emailed to it. Nothing of anyone's
 * money is here: no setup, no figures, no token. A person's files stay in
 * their own vault, as for everyone else.
 *
 * Sign-up is open only when the operator sets SIGN_UP=open, or to someone
 * holding an invitation with SIGN_UP=invite (Hamza, 9 Nov 2026: the beta is
 * invite-only): a deployment that forgets it is locked, not open. An
 * invitation is a code the operator makes on /ops (`makeInvite`), good for a
 * number of people until a day, naming the plan they join on; only its keyed
 * hash and a copy sealed under REPORT_KEY are kept, and it is used up only
 * when an account is made with it. With sign-up open, a person joins by
 * Google or Microsoft sign-in (the row is made at the first sign-in), or by
 * email and password, verified with a six-digit code sent to the address
 * (lib/report-mail.ts, the one mail path). The code is hashed before it is
 * kept, lasts CODE_MINUTES, and allows CODE_ATTEMPTS tries. Passwords are
 * hashed with scrypt and a random salt; a password is never kept or logged
 * as typed. A failed sign-in counts, and ten in a row lock the address for a
 * quarter of an hour.
 */

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const MIN_PASSWORD = 10;
export const CODE_MINUTES = 15;
export const CODE_ATTEMPTS = 5;
const SIGN_IN_FAILURES = 10;
const LOCK_MINUTES = 15;

/** Who this deployment takes new accounts from: anyone, invited people, or no one. */
export function signUpMode(): SignUpMode {
  return signUpModeOf(process.env.SIGN_UP);
}

/** Whether this deployment takes new accounts at all, from anyone or with an invitation. */
export function signUpOpen(): boolean {
  return signUpMode() !== "closed";
}

/** Whether the accounts store can be reached at all; never a value. */
export function usersAvailable(): boolean {
  return !connectionProblem(process.env.DATABASE_URL) && !!process.env.AUTH_SECRET;
}

/** An address as kept: trimmed and lowercased; null when it is not an address. */
export function normaliseEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254 ? email : null;
}

/** Why a password cannot be used, or null. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > 200) return "That password is too long.";
  return null;
}

type Sql = NeonQueryFunction<false, false>;
let ready: Promise<void> | null = null;

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url || connectionProblem(url)) throw new SyncError("Sign-up is not set up on this deployment.", "no DATABASE_URL");
  const q: Sql = neon(url);
  ready ??= q`
    create table if not exists app_users (
      email text primary key,
      password_hash text,
      pending_hash text,
      verified_at timestamptz,
      code_hash text,
      code_expires timestamptz,
      code_attempts integer not null default 0,
      failures integer not null default 0,
      locked_until timestamptz,
      created_at timestamptz not null default now(),
      last_sign_in timestamptz
    )`
    .then(() => q`alter table app_users add column if not exists plan text`)
    .then(() => q`alter table app_users add column if not exists committed_at timestamptz`)
    .then(
      () => q`
        create table if not exists invite_codes (
          hash text primary key,
          sealed text not null,
          plan text,
          uses integer not null,
          used integer not null default 0,
          expires_at timestamptz not null,
          created_at timestamptz not null default now()
        )`,
    )
    .then(() => undefined);
  return { q, ready };
}

async function run<T>(fn: (q: Sql) => Promise<T>): Promise<T> {
  const { q, ready: table } = sql();
  try {
    await table;
    return await fn(q);
  } catch (e) {
    if (e instanceof SyncError) throw e;
    ready = null;
    throw new SyncError("The accounts store could not be reached. Try again in a moment.", "users query failed");
  }
}

// ---------------------------------------------------------------------------
// Hashing

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

async function passwordMatches(password: string, kept: string): Promise<boolean> {
  const [scheme, salt, hash] = kept.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const got = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** The code's hash, keyed on the deployment's secret, so a read of the table yields no code. */
function codeHash(email: string, code: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new SyncError("Sign-up is not set up on this deployment.", "no AUTH_SECRET");
  return createHmac("sha256", secret).update(`${email}\n${code}`).digest("base64");
}

function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

// ---------------------------------------------------------------------------
// Membership

type Row = { email: string; password_hash: string | null; pending_hash: string | null; verified_at: string | Date | null; code_hash: string | null; code_expires: string | Date | null; code_attempts: number; failures: number; locked_until: string | Date | null };

async function rowOf(q: Sql, email: string): Promise<Row | null> {
  const rows = (await q`select email, password_hash, pending_hash, verified_at, code_hash, code_expires, code_attempts, failures, locked_until from app_users where email = ${email}`) as Row[];
  return rows[0] ?? null;
}

/** Whether the address has a verified account. False, never a throw, when the store cannot be reached: a sign-in fails closed. */
export async function isMember(email: string): Promise<boolean> {
  if (!usersAvailable()) return false;
  try {
    return await run(async (q) => {
      const row = await rowOf(q, email);
      return !!row?.verified_at;
    });
  } catch {
    return false;
  }
}

/**
 * A Google or Microsoft sign-in while sign-up is open makes the account on the
 * spot; one that exists is kept as it is. Invite-only, the invitation is used
 * up here, and false is answered (no account, no throw) when it cannot be.
 */
export async function joinWithProvider(email: string, invite: string | null = null): Promise<boolean> {
  const mode = signUpMode();
  if (mode === "closed") throw new SyncError("Sign-ups are closed on this deployment.", "sign-up closed");
  return run(async (q) => {
    if ((await rowOf(q, email))?.verified_at) return true;
    const plan = mode === "invite" ? await redeemInvite(q, invite) : { plan: defaultPlan(process.env.DEFAULT_PLAN) };
    if (!plan) return false;
    await q`
      insert into app_users (email, verified_at, plan) values (${email}, now(), ${plan.plan})
      on conflict (email) do update set verified_at = coalesce(app_users.verified_at, now()), plan = coalesce(app_users.plan, excluded.plan)`;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Sign-up by email

/**
 * Starts a sign-up: keeps the password's hash as pending and a fresh code's
 * hash on the row, and returns the code for the caller to email. An address
 * that already has a verified password is told to sign in instead.
 */
export async function startSignUp(email: string, password: string, invite: string | null = null): Promise<{ code: string }> {
  if (!usersAvailable()) throw new SyncError("Sign-up is not set up on this deployment.", "users unavailable");
  if (!signUpOpen()) throw new SyncError("Sign-ups are closed on this deployment.", "sign-up closed");
  if (signUpMode() === "invite" && !(await inviteUsable(invite))) throw new SyncError(INVITE_UNUSABLE, "invite unusable");
  const problem = passwordProblem(password);
  if (problem) throw new SyncError(problem, "password problem");
  const pending = await hashPassword(password);
  const code = newCode();
  const hash = codeHash(email, code);
  await run(async (q) => {
    const row = await rowOf(q, email);
    if (row?.verified_at && row.password_hash) throw new SyncError("An account with this address already exists. Sign in instead.", "sign-up exists");
    await q`
      insert into app_users (email, pending_hash, code_hash, code_expires, code_attempts)
      values (${email}, ${pending}, ${hash}, now() + make_interval(mins => ${CODE_MINUTES}), 0)
      on conflict (email) do update set pending_hash = excluded.pending_hash, code_hash = excluded.code_hash, code_expires = excluded.code_expires, code_attempts = 0`;
  });
  return { code };
}

/** A new code for a sign-up under way, when the first one did not arrive or ran out. */
export async function resendCode(email: string): Promise<{ code: string }> {
  if (!usersAvailable()) throw new SyncError("Sign-up is not set up on this deployment.", "users unavailable");
  const code = newCode();
  const hash = codeHash(email, code);
  await run(async (q) => {
    const row = await rowOf(q, email);
    if (!row?.pending_hash) throw new SyncError("Start the sign-up again.", "resend without sign-up");
    await q`update app_users set code_hash = ${hash}, code_expires = now() + make_interval(mins => ${CODE_MINUTES}), code_attempts = 0 where email = ${email}`;
  });
  return { code };
}

/** Checks the code; a match verifies the address and makes the pending password the account's. Invite-only, the invitation is used up here. */
export async function verifySignUp(email: string, code: string, invite: string | null = null): Promise<void> {
  if (!usersAvailable()) throw new SyncError("Sign-up is not set up on this deployment.", "users unavailable");
  const typed = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(typed)) throw new SyncError("The code is six digits.", "code shape");
  const hash = codeHash(email, typed);
  await run(async (q) => {
    const row = await rowOf(q, email);
    if (!row?.code_hash || !row.pending_hash) throw new SyncError("Start the sign-up again.", "verify without sign-up");
    if (!row.code_expires || new Date(row.code_expires).getTime() < Date.now()) throw new SyncError("That code has run out. Send a new one.", "code expired");
    if (row.code_attempts >= CODE_ATTEMPTS) throw new SyncError("Too many tries. Send a new code.", "code attempts");
    const a = Buffer.from(hash);
    const b = Buffer.from(row.code_hash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await q`update app_users set code_attempts = code_attempts + 1 where email = ${email}`;
      throw new SyncError("That code is not right.", "code mismatch");
    }
    let plan: Plan | null = null;
    if (!row.verified_at) {
      const invited = signUpMode() === "invite" ? await redeemInvite(q, invite) : { plan: defaultPlan(process.env.DEFAULT_PLAN) };
      if (!invited) throw new SyncError(INVITE_UNUSABLE, "invite unusable at verify");
      plan = invited.plan;
    }
    await q`update app_users set password_hash = pending_hash, pending_hash = null, verified_at = coalesce(verified_at, now()), plan = coalesce(plan, ${plan}), code_hash = null, code_expires = null, code_attempts = 0, failures = 0, locked_until = null where email = ${email}`;
  });
}

// ---------------------------------------------------------------------------
// Sign-in by email

/** Whether the password is the verified account's. A locked address answers false until the lock ends. */
export async function checkPassword(email: string, password: string): Promise<boolean> {
  if (!usersAvailable()) return false;
  try {
    return await run(async (q) => {
      const row = await rowOf(q, email);
      if (!row?.verified_at || !row.password_hash) return false;
      if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) return false;
      if (await passwordMatches(password, row.password_hash)) {
        await q`update app_users set failures = 0, locked_until = null, last_sign_in = now() where email = ${email}`;
        return true;
      }
      const failures = row.failures + 1;
      if (failures >= SIGN_IN_FAILURES) await q`update app_users set failures = 0, locked_until = now() + make_interval(mins => ${LOCK_MINUTES}) where email = ${email}`;
      else await q`update app_users set failures = ${failures} where email = ${email}`;
      return false;
    });
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// The account page

/** Whether the address signs in with a password kept here; false, never a throw, when the store cannot be read (the page then offers no form). */
export async function hasPassword(email: string): Promise<boolean> {
  if (!usersAvailable()) return false;
  try {
    return await run(async (q) => !!(await rowOf(q, email))?.password_hash);
  } catch {
    return false;
  }
}

/**
 * Changes a verified account's password (Hamza, 19 Oct 2026: Account settings).
 * The current password must match, under the same lock as a sign-in, and the
 * new one pass the same rules as at sign-up; only its hash is kept.
 */
export async function changePassword(email: string, current: string, next: string): Promise<void> {
  if (!usersAvailable()) throw new SyncError("Accounts are not set up on this deployment.", "users unavailable");
  const problem = passwordProblem(next);
  if (problem) throw new SyncError(problem, "password problem");
  if (next === current) throw new SyncError("Choose a password other than the current one.", "password unchanged");
  await run(async (q) => {
    const row = await rowOf(q, email);
    if (!row?.verified_at || !row.password_hash) throw new SyncError("This account signs in with Google or Microsoft, which keep its password.", "no password");
    if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) throw new SyncError(`Too many wrong tries. Try again in ${LOCK_MINUTES} minutes.`, "password locked");
    if (!(await passwordMatches(current, row.password_hash))) {
      const failures = row.failures + 1;
      if (failures >= SIGN_IN_FAILURES) await q`update app_users set failures = 0, locked_until = now() + make_interval(mins => ${LOCK_MINUTES}) where email = ${email}`;
      else await q`update app_users set failures = ${failures} where email = ${email}`;
      throw new SyncError("The current password is not right.", "password mismatch");
    }
    const hash = await hashPassword(next);
    await q`update app_users set password_hash = ${hash}, failures = 0, locked_until = null where email = ${email}`;
  });
}

// ---------------------------------------------------------------------------
// Invitations (Hamza, 9 Nov 2026: the beta is invite-only)

export const INVITE_UNUSABLE = "That invitation code is not right, has been used up or has run out. Ask the person who invited you for another.";

/** The invitation's hash, keyed on the deployment's secret, so a read of the table yields no code. */
function inviteHash(code: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new SyncError("Sign-up is not set up on this deployment.", "no AUTH_SECRET");
  return createHmac("sha256", secret).update(`invite\n${normalInviteCode(code)}`).digest("hex");
}

function newInviteCode(): string {
  return Array.from({ length: INVITE_LENGTH }, () => INVITE_ALPHABET[randomInt(0, INVITE_ALPHABET.length)]).join("");
}

/** Whether a typed invitation would let someone in now; false, never a throw, when the store cannot be read. */
export async function inviteUsable(code: string | null): Promise<boolean> {
  if (!code || !inviteShapeOk(code) || !usersAvailable()) return false;
  try {
    return await run(async (q) => {
      const rows = (await q`select 1 from invite_codes where hash = ${inviteHash(code)} and used < uses and expires_at > now()`) as unknown[];
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

/** Uses one place on the invitation, in one statement so two people cannot take the last; its plan, or null when it cannot be used. */
async function redeemInvite(q: Sql, code: string | null): Promise<{ plan: Plan | null } | null> {
  if (!code || !inviteShapeOk(code)) return null;
  const rows = (await q`update invite_codes set used = used + 1 where hash = ${inviteHash(code)} and used < uses and expires_at > now() returning plan`) as { plan: string | null }[];
  if (!rows.length) return null;
  return { plan: isPlan(rows[0].plan) ? rows[0].plan : defaultPlan(process.env.DEFAULT_PLAN) };
}

export type Invite = { id: string; code: string | null; plan: Plan | null; uses: number; used: number; expires: string; created: string };

/** Makes an invitation for up to `uses` people over `days` days, on a plan; the code is returned to show the operator. */
export async function makeInvite(plan: Plan | null, uses: number, days: number): Promise<string> {
  if (!usersAvailable()) throw new SyncError("Accounts are not set up on this deployment.", "users unavailable");
  if (!Number.isInteger(uses) || uses < 1 || uses > MAX_INVITE_USES) throw new SyncError(`An invitation lets in 1 to ${MAX_INVITE_USES} people.`, "invite uses");
  if (!Number.isInteger(days) || days < 1 || days > MAX_INVITE_DAYS) throw new SyncError(`An invitation lasts 1 to ${MAX_INVITE_DAYS} days.`, "invite days");
  const { sealText } = await import("@/lib/registry");
  const code = newInviteCode();
  const sealed = sealText(code);
  await run((q) => q`insert into invite_codes (hash, sealed, plan, uses, expires_at) values (${inviteHash(code)}, ${sealed}, ${plan}, ${uses}, now() + make_interval(days => ${days}))`);
  return code;
}

/** Every invitation, newest first, with its code opened for the operator (null when the key has changed since). */
export async function invites(): Promise<Invite[]> {
  if (!usersAvailable()) return [];
  const { openText } = await import("@/lib/registry");
  const rows = (await run((q) => q`select hash, sealed, plan, uses, used, expires_at, created_at from invite_codes order by created_at desc limit 50`)) as { hash: string; sealed: string; plan: string | null; uses: number; used: number; expires_at: string | Date; created_at: string | Date }[];
  return rows.map((r) => {
    let code: string | null = null;
    try {
      code = openText(r.sealed);
    } catch {
      code = null;
    }
    return { id: r.hash.slice(0, 16), code, plan: isPlan(r.plan) ? r.plan : null, uses: r.uses, used: r.used, expires: new Date(r.expires_at).toISOString(), created: new Date(r.created_at).toISOString() };
  });
}

/** Ends an invitation now; the accounts already made with it stay. */
export async function endInvite(id: string): Promise<void> {
  if (!/^[0-9a-f]{16}$/.test(id)) throw new SyncError("That invitation could not be found.", "invite id");
  const rows = (await run((q) => q`update invite_codes set expires_at = least(expires_at, now()) where left(hash, 16) = ${id} returning hash`)) as { hash: string }[];
  if (!rows.length) throw new SyncError("That invitation could not be found.", "invite unknown");
}

// ---------------------------------------------------------------------------
// Plans and leaving

/** The account's plan; null for an address on the allowlist, an account made before plans, or when the store cannot be read. */
export async function planOf(email: string): Promise<Plan | null> {
  if (!usersAvailable()) return null;
  try {
    return await run(async (q) => {
      const rows = (await q`select plan from app_users where email = ${email}`) as { plan: string | null }[];
      return isPlan(rows[0]?.plan) ? (rows[0].plan as Plan) : null;
    });
  } catch {
    return null;
  }
}

/** Deletes the account's row: its address, password hash and plan. */
export async function deleteUser(email: string): Promise<void> {
  if (!usersAvailable()) return;
  await run((q) => q`delete from app_users where email = ${email}`);
}
