import { redirect } from "next/navigation";

import { setupData } from "@/components/setup/setup-data";
import { FirstSetup } from "@/components/welcome/first-setup";
import { SecondSetup } from "@/components/welcome/second-setup";
import { signOut } from "@/lib/auth";
import { welcomeStep } from "@/lib/welcome";
import { getWorkspace } from "@/lib/workspace";

export const metadata = { title: "Welcome · Invariant" };
export const dynamic = "force-dynamic";
/** Reading a methodology, asked once more when its record does not hold together, can take minutes. */
export const maxDuration = 800;

/**
 * The first page after signing up: where the files go (an email sign-in
 * links a Google Drive here; a Google or Microsoft sign-in already has its
 * folder), then who the app is for, where the money is reported and a few
 * details, each with why it matters. Building the app opens the second
 * part: what to give it, in Setup's own cards, one group at a time (rules,
 * money, each holding's thesis and valuation, what it reads), any of which
 * can be skipped; finishing opens the tour, which ends on Setup, where every
 * answer is changed later. Someone who finished goes to the Dashboard.
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ drive?: string; step?: string; connected?: string }> }) {
  const [ws, sp] = await Promise.all([getWorkspace(), searchParams]);
  const drive = ws.mode === "drive";
  if (ws.setup) {
    if (ws.preferences.welcomed) redirect("/");
    const step = welcomeStep(sp.step);
    const d = await setupData({ ...ws, setup: ws.setup }, sp);
    const first = drive ? (ws.setup.ownerName.split(" ")[0] || null) : null;
    return (
      <main className="mx-auto min-h-dvh max-w-6xl px-4 pb-16 pt-6 lg:px-8 lg:pt-10">
        <header className="reveal-stack mb-8 flex items-start justify-between gap-4 lg:mb-10">
          <div>
            <p className="section-header">Your app is built{first ? `, ${first}` : ""}</p>
            <h1 className="mt-2 text-large-title font-bold tracking-[-0.02em]">Now give it what it reads</h1>
            <span className="gilt-rule mt-3" aria-hidden />
            <p className="mt-3 max-w-xl text-subhead text-text-secondary">Four short steps, each with why it matters. Skip any; everything here is also on Setup, where it is changed later. Not investment advice.</p>
          </div>
          <SignOut drive={drive} />
        </header>
        {ws.error ? <p className="mb-6 rounded-card bg-danger/15 px-4 py-3 text-subhead text-danger">{ws.error}</p> : null}
        <SecondSetup d={d} step={step} />
      </main>
    );
  }
  let linked = true;
  if (drive) {
    const { vaultLinked } = await import("@/lib/vault");
    linked = await vaultLinked();
  }
  // A vault that exists but could not be read is said so; one not linked yet is the first stage.
  const problem = drive && linked && ws.error ? ws.error : null;
  const outcome = sp.drive && ["linked", "denied", "failed", "unavailable"].includes(sp.drive) ? sp.drive : null;
  // The demo greets no one by name.
  const first = drive ? (ws.operator.name?.split(" ")[0] ?? null) : null;

  return (
    <main className="mx-auto min-h-dvh max-w-6xl px-4 pb-16 pt-6 lg:px-8 lg:pt-10">
      <header className="reveal-stack mb-8 flex items-start justify-between gap-4 lg:mb-10">
        <div>
          <p className="section-header">Welcome{first ? `, ${first}` : ""}</p>
          <h1 className="mt-2 text-large-title font-bold tracking-[-0.02em]">Set up your app</h1>
          <span className="gilt-rule mt-3" aria-hidden />
          <p className="mt-3 max-w-xl text-subhead text-text-secondary">A few short steps. Pick what applies today; every answer can be changed later on Setup, and nothing here is investment advice.</p>
        </div>
        <SignOut drive={drive} />
      </header>
      {problem ? <p className="mb-6 rounded-card bg-danger/15 px-4 py-3 text-subhead text-danger">{problem}</p> : null}
      <FirstSetup mode={ws.mode} drive={drive ? { linked, outcome, href: "/api/vault/google/start" } : null} name={first} />
    </main>
  );
}

function SignOut({ drive }: { drive: boolean }) {
  if (!drive) return null;
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/sign-in" });
      }}
    >
      <button type="submit" className="text-footnote text-text-tertiary underline-offset-4 hover:underline">
        Sign out
      </button>
    </form>
  );
}
