"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { issueCode, readAuthorize, redirectWith, resourceOf } from "@/lib/mcp-auth";
import { mayConnect, originOf, serverKey } from "@/lib/mcp-run";
import { sessionTokens } from "@/lib/session-tokens";
import { linkedDriveRefresh } from "@/lib/vault";

const PARAMS = ["client_id", "redirect_uri", "response_type", "state", "code_challenge", "code_challenge_method", "resource", "scope"] as const;

/**
 * The consent page's answer. Everything is read again from the form and the
 * session, never trusted from the page: the client and its address, the
 * person on the allowlist, the sign-in's refresh token. Allow sends a code
 * to the client's own address; Cancel sends access_denied.
 */
export async function answerAction(form: FormData) {
  const key = serverKey();
  if (!key) redirect("/mcp/authorize" as Route);
  const p = Object.fromEntries(PARAMS.map((k) => [k, (form.get(k) as string | null) || undefined]));
  const origin = originOf(await headers());
  const read = readAuthorize(key, p, resourceOf(origin));
  if (!read.ok) {
    if ("show" in read.problem) redirect("/mcp/authorize" as Route);
    const pr = read.problem;
    redirect(redirectWith(pr.redirect, { error: pr.error, error_description: pr.description, state: pr.state, iss: origin }) as Route);
  }
  const req = read.req;
  if (form.get("answer") !== "allow") redirect(redirectWith(req.redirect, { error: "access_denied", error_description: "The person declined.", state: req.state, iss: origin }) as Route);
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  const tokens = await sessionTokens();
  // A password sign-in has no folder token of its own: the Drive linked on Welcome stands in.
  const refresh = (tokens?.tokens.refresh && tokens.tokens.folder ? tokens.tokens.refresh : null) ?? (await linkedDriveRefresh());
  if (!email || !(await mayConnect(email)) || !refresh) redirect(`/sign-in?next=${encodeURIComponent(`/mcp/authorize?${new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1])).toString()}`)}` as Route);
  const code = issueCode(key, req, { email, provider: tokens?.provider ?? "google", refresh }, Math.floor(Date.now() / 1000));
  await (await import("@/lib/beta-run")).recordEvent(email, "connector_added");
  redirect(redirectWith(req.redirect, { code, state: req.state, iss: origin }) as Route);
}
