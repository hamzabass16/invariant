import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { cookies } from "next/headers";

import { InviteForm } from "@/components/sign-in/invite-form";
import { SignUpForm } from "@/components/sign-in/sign-up-form";
import { Button } from "@/components/ui/button";
import { admitted, auth, signIn, signInProviders } from "@/lib/auth";
import { INVITE_COOKIE } from "@/lib/plans";
import { CODE_MINUTES, inviteUsable, MIN_PASSWORD, signUpMode, signUpOpen, usersAvailable } from "@/lib/users";

export const metadata = { title: "Create an account · Invariant" };

/**
 * Create an account: with Google or Microsoft (the account is made at the
 * first sign-in), or with an email and a password verified by a code sent
 * to the address. Only while the deployment takes new accounts
 * (SIGN_UP=open, or =invite with a code from the operator, asked for first);
 * otherwise the page says so and points at sign-in. A new account lands on
 * Welcome, the first setup.
 */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (email && (await admitted(email))) redirect("/welcome");
  const available = usersAvailable();
  const open = available && signUpOpen();
  const providers = signInProviders();
  const inviteOnly = open && signUpMode() === "invite";
  const invited = inviteOnly && (await inviteUsable((await cookies()).get(INVITE_COOKIE)?.value ?? null));
  const askedAgain = (await searchParams).invite === "needed";

  return (
    <main className="reveal-stack mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <p className="brand-mark">Invariant</p>
      <h1 className="mt-2 text-large-title font-bold tracking-[-0.02em]">Create your account</h1>
      <span className="gilt-rule mt-3" aria-hidden />
      {inviteOnly && !invited ? (
        <>
          <p className="mt-3 text-subhead text-text-secondary">Invariant is in a private beta. Enter the invitation code you were sent to create your account.</p>
          {askedAgain ? <p className="mt-3 text-subhead text-danger">That sign-in has no account here yet. Enter your invitation code first, then continue with Google or Microsoft.</p> : null}
          <section aria-label="Invitation" className="mt-8">
            <InviteForm />
          </section>
        </>
      ) : open ? (
        <>
          {invited ? <p className="mt-3 text-subhead text-ok">Invitation accepted. Create your account within half an hour.</p> : null}
          <p className="mt-3 text-subhead text-text-secondary">Your files will live in a Portfolio OS folder in your own Google Drive, which the app can see nothing outside of. Nothing of your money is kept here.</p>
          <section aria-label="Create an account" className="mt-8">
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/welcome" });
              }}
            >
              <Button type="submit" size="lg">
                Continue with Google
              </Button>
            </form>
            {providers.includes("microsoft") ? (
              <form
                className="mt-3"
                action={async () => {
                  "use server";
                  await signIn("microsoft-entra-id", { redirectTo: "/welcome" });
                }}
              >
                <Button type="submit" size="lg" variant="secondary">
                  Continue with Microsoft
                </Button>
              </form>
            ) : null}
            <p className="my-5 flex items-center gap-3 text-caption text-text-tertiary before:h-px before:flex-1 before:bg-hairline after:h-px after:flex-1 after:bg-hairline">or with your email</p>
            <SignUpForm minPassword={MIN_PASSWORD} codeMinutes={CODE_MINUTES} />
          </section>
        </>
      ) : (
        <p className="mt-3 text-subhead text-text-secondary">{available ? "This deployment is not taking new accounts. Ask the person who runs it." : "Sign-up is not set up on this deployment yet."}</p>
      )}
      <p className="mt-8 text-subhead text-text-secondary">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-accent-text underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
      <nav aria-label="Policies" className="mt-8 flex gap-x-5 text-footnote text-text-tertiary">
        <Link href={"/privacy" as Route} className="underline-offset-4 hover:underline">
          Privacy
        </Link>
        <Link href={"/terms" as Route} className="underline-offset-4 hover:underline">
          Terms
        </Link>
      </nav>
    </main>
  );
}
