import { NextResponse } from "next/server";

import { allowedEmails, signInProviders } from "@/lib/auth";
import { registryProblem } from "@/lib/registry";
import { mailProblem } from "@/lib/report-mail";
import { demoIsPublic, storageMode } from "@/lib/storage";

/**
 * Configuration check after a deploy. Says what is missing, never a value.
 * `status` is about sign-in: `ok` or `misconfigured` (503). `syncs` says which
 * data connections are configured, never their values.
 */
export function GET() {
  // The public demo has no sign-in, so it needs no Google client.
  const missing = [
    ["AUTH_SECRET", process.env.AUTH_SECRET],
    ...(demoIsPublic()
      ? []
      : [
          ["AUTH_GOOGLE_ID", process.env.AUTH_GOOGLE_ID],
          ["AUTH_GOOGLE_SECRET", process.env.AUTH_GOOGLE_SECRET],
        ]),
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (allowedEmails().length === 0 && !demoIsPublic()) missing.push("ALLOWED_EMAILS");

  const set = (name: string) => Boolean(process.env[name]);
  const syncs = {
    storage: storageMode(),
    // Which sign-ins, and so which vaults, this deployment offers; a bucket vault also needs the registry.
    signIn: signInProviders().join(", "),
    // Reading a methodology runs on each person's own model key, kept in their vault; the deployment holds none.
    drafting: "per person",
    // The statements inbox needs its address and an app password; it is read in the morning refresh.
    inbox: set("INBOX_ADDRESS") && set("INBOX_PASSWORD") ? "set" : set("INBOX_ADDRESS") ? "INBOX_PASSWORD is not set." : "not set",
    // IBKR, SnapTrade and eToro run on each person's own keys, kept in their vault; the deployment holds none.
    brokers: "per person",
    // Scheduled reports need the enrolment registry, the mail account and the cron secret.
    reports: registryProblem() ?? mailProblem() ?? (set("CRON_SECRET") ? "set" : "CRON_SECRET is not set."),
  };

  const status = missing.length === 0 ? "ok" : "misconfigured";
  return NextResponse.json({ status, missing, syncs }, { status: missing.length === 0 ? 200 : 503 });
}
