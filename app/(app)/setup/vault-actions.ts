"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { chooseBucket, dropBucket, registryAvailable } from "@/lib/registry";
import { SyncError } from "@/lib/sync-error";
import { bucketConfigSchema, probe } from "@/lib/user-bucket";
import { getWorkspace } from "@/lib/workspace";

export type VaultState = { error: string | null };

/**
 * Keeps a pasted bucket as the person's vault, after a probe file has gone in
 * and come back. The credential goes to the adapter and the registry only;
 * an error is a sentence, never the value.
 */
export async function chooseBucketAction(_prev: VaultState, form: FormData): Promise<VaultState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo has no vault." };
  if (!registryAvailable()) return { error: "A bucket vault is not offered on this deployment." };
  const parsed = bucketConfigSchema.safeParse({
    endpoint: String(form.get("endpoint") ?? ""),
    bucket: String(form.get("bucket") ?? ""),
    region: String(form.get("region") ?? "").trim() || "auto",
    prefix: String(form.get("prefix") ?? "").trim() || "portfolio-os",
    accessKeyId: String(form.get("accessKeyId") ?? ""),
    secretAccessKey: String(form.get("secretAccessKey") ?? ""),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first?.message && !/^Invalid/.test(first.message) ? first.message : `Check the ${String(first?.path[0] ?? "form")}.` };
  }
  try {
    await probe(parsed.data);
    await chooseBucket(ws.operator.email, parsed.data);
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
  revalidatePath("/", "layout");
  redirect("/setup");
}

/** Back to the folder behind the sign-in. The files stay in the bucket. */
export async function dropBucketAction(): Promise<VaultState> {
  const ws = await getWorkspace();
  if (ws.mode !== "drive") return { error: "The demo has no vault." };
  try {
    await dropBucket(ws.operator.email);
  } catch (e) {
    if (e instanceof SyncError) return { error: e.message };
    throw e;
  }
  revalidatePath("/", "layout");
  redirect("/setup");
}
