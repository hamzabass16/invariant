import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import type { z } from "zod";

import { refreshAccessToken } from "@/lib/google-user";
import { logEvent, who } from "@/lib/log";
import { refreshGraphToken } from "@/lib/microsoft-user";
import { sessionTokens, type SessionTokens } from "@/lib/session-tokens";
import { SyncError } from "@/lib/sync-error";
import * as bucket from "@/lib/user-bucket";
import * as drive from "@/lib/user-drive";
import * as onedrive from "@/lib/user-onedrive";
import type { VaultChoice } from "@/lib/registry";
import { VAULT_KEYS, type VaultKey } from "@/lib/vault-keys";

/**
 * The vault: where one person's files live, in a system they already control,
 * reached with their own token or credential under the narrowest permission
 * that system offers. The vault follows the identity they sign in with, so
 * onboarding is "sign in, tick the box"; the strictest paste a bucket of
 * their own once. Every screen and action goes through this interface and
 * never through an adapter directly.
 *
 *   google_drive  a "Portfolio OS" folder in their Google Drive, drive.file
 *                 scope (lib/user-drive.ts).
 *   onedrive      the Apps/Portfolio OS folder in their OneDrive, personal or
 *                 work, Files.ReadWrite.AppFolder scope (lib/user-onedrive.ts).
 *   bucket        an S3-style bucket in the person's own cloud account
 *                 (lib/user-bucket.ts); its credential is kept sealed in the
 *                 registry, since the server reads with it, until the browser
 *                 holds it instead.
 *
 * Someone who signed in by email and password has no folder token in their
 * session; they link a Google Drive once on Welcome (app/api/vault/google),
 * and its refresh token is kept sealed in the registry beside the bucket
 * choices, read only to open the folder. The deployment itself holds none
 * of the files.
 */

export { VAULT_KEYS };
export type { VaultKey };

export type VaultKind = "google_drive" | "onedrive" | "bucket";
export type Provider = "google" | "microsoft";

export type VaultInfo = {
  kind: VaultKind;
  /** Where the files are, in the person's words; never a credential. */
  where: string;
  /** The sign-in behind the vault, or null for a pasted bucket. */
  provider: Provider | null;
  /** The address of the person whose vault this is, for their AI's meter (lib/hosted-model.ts); never written, logged or shown. */
  owner?: string | null;
};

export type Vault = VaultInfo & {
  readJson<T>(key: VaultKey, schema: z.ZodType<T>): Promise<T | null>;
  writeJson(key: VaultKey, data: unknown): Promise<void>;
  saveDocument(name: string, mime: string, bytes: Uint8Array): Promise<string>;
  /** A Drive vault alone: opens an upload of the methodology document for the browser to send straight to the folder, and reads it back (lib/user-drive.ts). */
  startDocumentUpload?(name: string, mime: string, size: number, origin: string): Promise<string>;
  readDocument?(id: string): Promise<{ name: string; mime: string; bytes: Uint8Array }>;
  removeFile(key: VaultKey): Promise<void>;
  /** Keeps a review's PDF in the vault, the one before to the bin; null where the vault keeps none (Hamza, 18 Oct 2026). */
  saveReportPdf(kind: "weekly" | "monthly", name: string, pdf: Uint8Array): Promise<{ id: string; url: string } | null>;
};

export const WHERE: Record<Exclude<VaultKind, "bucket">, string> = {
  google_drive: "the Portfolio OS folder in your Google Drive",
  onedrive: "the Apps/Portfolio OS folder in your OneDrive",
};

/** A vault reached with an access token: the person's own Drive or OneDrive. */
export function vaultWithToken(provider: Provider, token: string, owner: string | null = null): Vault {
  if (provider === "microsoft") {
    return {
      kind: "onedrive",
      provider,
      owner,
      where: WHERE.onedrive,
      readJson: (key, schema) => onedrive.readJson(token, key, schema),
      writeJson: (key, data) => onedrive.writeJson(token, key, data),
      saveDocument: (name, mime, bytes) => onedrive.saveDocument(token, name, mime, bytes),
      removeFile: (key) => onedrive.removeFile(token, key),
      saveReportPdf: async () => null,
    };
  }
  return {
    kind: "google_drive",
    provider,
    owner,
    where: WHERE.google_drive,
    readJson: (key, schema) => drive.readJson(token, key, schema),
    writeJson: (key, data) => drive.writeJson(token, key, data),
    saveDocument: (name, mime, bytes) => drive.saveDocument(token, name, mime, bytes),
    startDocumentUpload: (name, mime, size, origin) => drive.startDocumentUpload(token, name, mime, size, origin),
    readDocument: (id) => drive.readDocument(token, id),
    removeFile: (key) => drive.removeFile(token, key),
    saveReportPdf: (kind, name, pdf) => drive.savePdf(token, `report_${kind}`, name, pdf),
  };
}

/** A vault in the person's own bucket. */
export function vaultInBucket(config: bucket.BucketConfig, owner: string | null = null): Vault {
  return {
    kind: "bucket",
    provider: null,
    owner,
    where: bucket.describeBucket(config),
    readJson: (key, schema) => bucket.readJson(config, key, schema),
    writeJson: (key, data) => bucket.writeJson(config, key, data),
    saveDocument: (name, mime, bytes) => bucket.saveDocument(config, name, mime, bytes),
    removeFile: (key) => bucket.removeFile(config, key),
    saveReportPdf: async () => null,
  };
}

/** The sign-in the person used, for screens that word a sentence by it; null when there is no provider session. */
export async function sessionProvider(): Promise<Provider | null> {
  return (await sessionTokens())?.provider ?? null;
}

/** The log detail of the one expected failure: an email sign-in that has not linked a Drive yet. */
export const NO_VAULT = "no vault linked";

/** The signed-in address, from the provider tokens or, for a password sign-in, the session itself. */
async function signedInEmail(s: SessionTokens | null): Promise<string | null> {
  if (s?.email) return s.email;
  const { auth } = await import("@/lib/auth");
  return (await auth())?.user?.email?.toLowerCase() ?? null;
}

/** How long the kind of a person's vault choice is kept in the shared data cache; changing the choice clears it at once (`forgetVaultKind` in lib/registry.ts). */
const VAULT_KIND_SECONDS = 86_400;

/** What the registry holds for a sign-in that carries its own folder: no choice, a bucket, a linked Drive, or unknown while it cannot be reached. */
type ChoiceKind = "none" | "bucket" | "google_drive" | "unknown";

/**
 * The kind of the person's vault choice, kept a day in the data cache under
 * the log's fingerprint, so an ordinary page asks the database nothing (Hamza,
 * 25 Nov 2026: the free database ran out of compute, and every page woke it).
 * Unknown when the registry cannot be reached and nothing is kept yet.
 */
async function choiceKind(email: string): Promise<ChoiceKind> {
  const { vaultChoiceKind, vaultKindTag } = await import("@/lib/registry");
  try {
    return await unstable_cache(async () => (await vaultChoiceKind(email)) ?? "none", ["vault-kind", who(email)], { tags: [vaultKindTag(email)], revalidate: VAULT_KIND_SECONDS })();
  } catch (e) {
    if (e instanceof SyncError && e.logDetail === "vault choice kind unknown") throw e;
    logEvent("warn", "vault.registry_unreachable", { who: who(email) });
    return "unknown";
  }
}

/** The registry could not be reached and nothing says where the person's files are: the folder behind the sign-in is opened to read only. */
type Unreached = { kind: "unreachable" };

/**
 * The vault choice kept for the signed-in person, or null: none, or no
 * registry. A sign-in that carries its own folder needs the full choice only
 * for a bucket or a linked Drive; when the registry cannot be reached and no
 * kind is kept, it is `unreachable`.
 */
const chosenVault = cache(async (): Promise<VaultChoice | Unreached | null> => {
  const s = await sessionTokens();
  const email = await signedInEmail(s);
  if (!email) return null;
  const { registryAvailable, vaultChoice } = await import("@/lib/registry");
  if (!registryAvailable()) return null;
  if (s?.tokens.folder) {
    const kind = await choiceKind(email);
    if (kind === "none") return null;
    if (kind === "unknown") return { kind: "unreachable" };
  }
  return await vaultChoice(email);
});

/** Said when a write is refused because the registry could not be reached. */
export const READ_ONLY_SENTENCE = "The app's database cannot be reached just now, so your files are shown but nothing is saved until it is back.";

/** The same vault, read only: what is written could land in the wrong place while the registry cannot say where the files are. */
function readOnly(v: Vault): Vault {
  const refuse = async (): Promise<never> => {
    throw new SyncError(READ_ONLY_SENTENCE, "vault read-only: registry unreachable");
  };
  return { ...v, writeJson: refuse, saveDocument: refuse, startDocumentUpload: v.startDocumentUpload ? refuse : undefined, removeFile: refuse, saveReportPdf: refuse };
}

/**
 * The signed-in person's vault, read once per request: their pasted bucket
 * when they chose one (lib/registry.ts), else the folder behind their
 * sign-in, else the Google Drive they linked on Welcome. A registry that
 * cannot be reached for a person who chose a bucket or linked a Drive is a
 * sentence, since the files would not be in the folder; for a sign-in with
 * its own folder and no kind kept, the folder opens to read only, so an
 * outage of the database never locks the person out (Hamza, 25 Nov 2026).
 */
export const openVault = cache(async (): Promise<Vault> => {
  const chosen = await chosenVault();
  if (chosen?.kind === "unreachable") return readOnly(await openChosen(null));
  return openChosen(chosen);
});

async function openChosen(chosen: VaultChoice | null): Promise<Vault> {
  const s = await sessionTokens();
  const owner = await signedInEmail(s);
  if (chosen?.kind === "bucket") return vaultInBucket(chosen.config, owner);
  if (s?.provider === "microsoft") {
    const { graphAccessToken } = await import("@/lib/microsoft-user");
    return vaultWithToken("microsoft", await graphAccessToken(), owner);
  }
  if (s?.provider === "google" && (s.tokens.folder || chosen?.kind !== "google_drive")) {
    const { driveAccessToken } = await import("@/lib/google-user");
    return vaultWithToken("google", await driveAccessToken(), owner);
  }
  if (chosen?.kind === "google_drive") return vaultWithToken("google", await refreshAccessToken(chosen.refresh), owner);
  if (!s && !(await signedInEmail(null))) throw new SyncError("You are not signed in. Sign out and sign in again.", "no sign-in");
  throw new SyncError("Connect your Google Drive on the Welcome page first, so the app has somewhere to keep your files.", NO_VAULT);
}

/** Whether the signed-in person has somewhere to keep files: a folder token in the session, a linked Drive or a chosen bucket. */
export async function vaultLinked(): Promise<boolean> {
  const s = await sessionTokens();
  if (s?.tokens.folder) return true;
  try {
    return !!(await chosenVault());
  } catch {
    return false;
  }
}

/** The refresh token of the Drive linked on Welcome, for a schedule or a grant that must open the vault later; null when there is none. */
export async function linkedDriveRefresh(): Promise<string | null> {
  const chosen = await chosenVault().catch(() => null);
  return chosen?.kind === "google_drive" ? chosen.refresh : null;
}

/**
 * A vault for the scheduled report (lib/report-run.ts), opened from what the
 * person enrolled with: a refresh token for a folder, or the bucket they
 * chose. The same files, the same scope; only the way in differs.
 */
export async function vaultForEnrolment(e: { email: string; provider: Provider | "bucket"; refreshToken: () => string | null }): Promise<Vault> {
  if (e.provider === "bucket") {
    const { vaultChoice } = await import("@/lib/registry");
    const chosen = await vaultChoice(e.email);
    if (chosen?.kind !== "bucket") throw new SyncError("The bucket this schedule used is no longer chosen. Keep the schedule again on the Reports screen.", "enrolment bucket missing");
    return vaultInBucket(chosen.config, e.email);
  }
  const refresh = e.refreshToken();
  if (!refresh) throw new SyncError("This schedule has no sign-in token. Keep the schedule again on the Reports screen.", "enrolment without refresh token");
  return vaultWithToken(e.provider, e.provider === "microsoft" ? await refreshGraphToken(refresh) : await refreshAccessToken(refresh), e.email);
}

/**
 * A vault for the person's own Claude (the MCP server, lib/mcp-run.ts),
 * opened from the sign-in its token carries: their chosen bucket when they
 * chose one, else the folder behind that sign-in. Read, never written.
 */
export async function vaultForMcp(g: { email: string; provider: Provider; refresh: string }): Promise<Vault> {
  const { registryAvailable, vaultChoice } = await import("@/lib/registry");
  if (registryAvailable()) {
    const chosen = await vaultChoice(g.email);
    if (chosen?.kind === "bucket") return vaultInBucket(chosen.config, g.email);
  }
  return vaultWithToken(g.provider, g.provider === "microsoft" ? await refreshGraphToken(g.refresh) : await refreshAccessToken(g.refresh), g.email);
}
