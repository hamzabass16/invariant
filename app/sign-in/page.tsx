import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PasswordForm } from "@/components/sign-in/password-form";
import { Button, buttonStyles } from "@/components/ui/button";
import { admitted, auth, signIn, signInProviders } from "@/lib/auth";
import { ACCOUNT_DELETED_WORDS } from "@/lib/plans";
import { nextOf, signInErrorWords } from "@/lib/sign-in";
import { signUpOpen, usersAvailable } from "@/lib/users";
import { demoBase } from "@/lib/deployment";

export const metadata = { title: "Sign in · Invariant" };

/** The public demo, where /try opens the anonymized snapshot with its guided tour: the deployment's DEMO_URL (lib/deployment.ts), else none. */
const DEMO_BASE = demoBase();

/**
 * The first page: sign in, create an account, or try the demo. Sign-in is
 * with the Google or Microsoft account on the access list, or with an email
 * and password made on Sign up; sign-up shows only while the deployment
 * takes new accounts (SIGN_UP=open). Someone already signed in goes
 * straight through.
 */
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; deleted?: string }> }) {
  const { error, next: rawNext, deleted } = await searchParams;
  const next = nextOf(rawNext);
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (email && (await admitted(email))) redirect(next as Route);

  const providers = signInProviders();
  const withEmail = usersAvailable();
  const open = withEmail && signUpOpen();
  const problem = signInErrorWords(error);

  return (
    <main className="reveal-stack mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <p className="section-header">Private</p>
      <h1 className="mt-2 text-large-title font-bold tracking-[-0.02em]">Invariant</h1>
      <span className="gilt-rule mt-3" aria-hidden />
      <p className="mt-3 text-subhead text-text-secondary">One console for your money. Your files stay in your own Google Drive; nothing of them is kept here.</p>

      {next !== "/" ? <p className="mt-3 text-subhead text-text-secondary">Sign in to connect your own Claude. It will only read.</p> : null}

      {problem ? <p className="mt-6 rounded-card bg-danger/15 px-4 py-3 text-subhead text-danger">{problem}</p> : null}
      {deleted ? <p className="mt-6 rounded-card bg-surface-2 px-4 py-3 text-subhead">{ACCOUNT_DELETED_WORDS}</p> : null}

      <section aria-label="Sign in" className="mt-8">
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: next });
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
              await signIn("microsoft-entra-id", { redirectTo: next });
            }}
          >
            <Button type="submit" size="lg" variant="secondary">
              Continue with Microsoft
            </Button>
          </form>
        ) : null}
        {withEmail ? (
          <>
            <p className="my-5 flex items-center gap-3 text-caption text-text-tertiary before:h-px before:flex-1 before:bg-hairline after:h-px after:flex-1 after:bg-hairline">or with your email</p>
            <PasswordForm next={next} />
          </>
        ) : null}
        {open ? (
          <p className="mt-5 text-subhead text-text-secondary">
            New here?{" "}
            <Link href="/sign-up" className="font-medium text-accent-text underline-offset-4 hover:underline">
              Create an account
            </Link>
          </p>
        ) : null}
      </section>

      {DEMO_BASE !== null ? (
        <div className="mt-10 border-t border-hairline pt-6">
          <a href={`${DEMO_BASE}/try`} className={buttonStyles({ variant: "secondary", size: "lg" })}>
            Try the demo free
          </a>
          <p className="mt-3 text-footnote text-text-tertiary">A real portfolio, anonymized and dated, with a guided tour. No sign-in, nothing saved.</p>
        </div>
      ) : null}
      {providers.includes("microsoft") ? <p className="mt-6 text-footnote text-text-tertiary">Your files stay in the account you sign in with: a Portfolio OS folder in Google Drive, or an Apps/Portfolio OS folder in OneDrive.</p> : null}
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
