import { KeyRound, LogOut, Mail, UserRound } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/app/action-form";
import { ThemeChoice } from "@/components/customise/controls";
import { ListLinkRow, ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { PLAN_WORDS } from "@/lib/plans";
import { getWorkspace } from "@/lib/workspace";

import { changePasswordAction, deleteAccountAction, setDonateAction, setImproveAction, signOutAction } from "./actions";

export const metadata = { title: "Account settings · Invariant" };

const field = "block w-full rounded-[10px] border border-hairline bg-bg px-3 py-2 text-body";

/**
 * Account settings (Hamza, 19 Oct 2026: the menu under the person's initials):
 * the address they sign in with and how, the password for an account made
 * with one, the theme, whether what they raise helps improve the app
 * (`improve`, 4 Nov 2026), and signing out. For an account made here (Hamza,
 * 9 Nov 2026, the beta): its AI allowance and Delete my account. What the app was built from (their
 * name, who it is for, where the money is) is on Setup, Your account.
 */
export default async function AccountPage() {
  const ws = await getWorkspace();
  const demo = ws.mode === "demo";
  const { hasPassword, MIN_PASSWORD } = await import("@/lib/users");
  const withPassword = !demo && (await hasPassword(ws.operator.email));
  const { planOf } = await import("@/lib/users");
  const { runsDeployment } = await import("@/lib/beta-run");
  const own = !demo && !runsDeployment(ws.operator.email);
  const plan = own ? await planOf(ws.operator.email) : null;
  return (
    <>
      <PageHeader title="Account settings" subtitle={demo ? "The demo has no account; the theme is kept in this browser." : ws.operator.email} />
      <PageBody>
        <div className="flow-cols">
          <div className="flow-col">
            <ListSection header="Sign-in" className="mb-8">
              <ListRow wrap label="Address" leading={<Mail className="size-5 shrink-0 text-text-secondary" aria-hidden />} detail={demo ? "No sign-in needed for the demo." : `${ws.operator.email}. Reports, alerts and codes go here and nowhere else.`} />
              <ListRow wrap label="How you sign in" leading={<KeyRound className="size-5 shrink-0 text-text-secondary" aria-hidden />} detail={demo ? "Nobody signs in to the demo." : withPassword ? "Email and a password kept here as a hash." : "Google or Microsoft, which keep your password; change it there."} />
              {plan ? <ListRow wrap label="Plan" detail={`${PLAN_WORDS[plan]}. Its monthly AI allowance is on Setup.`} /> : null}
              <ListLinkRow href={"/setup#group-5" as Route} label="Profile" detail="Your name, who the app is for and where your files are kept, on Setup." leading={<UserRound className="size-5 shrink-0 text-text-secondary" aria-hidden />} />
            </ListSection>

            {withPassword ? (
              <section className="mb-8">
                <h2 className="section-header mb-2 px-1">Change your password</h2>
                <ActionForm action={changePasswordAction} label="Change the password" doneLabel="Password changed" className="card space-y-3 px-4 py-4">
                  <label className="block">
                    <span className="mb-1 block text-subhead">Current password</span>
                    <input name="current" type="password" autoComplete="current-password" required className={field} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-subhead">New password</span>
                    <input name="next" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} className={field} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-subhead">New password again</span>
                    <input name="again" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} className={field} />
                  </label>
                  <p className="text-footnote text-text-secondary">At least {MIN_PASSWORD} characters. Only its hash is kept.</p>
                </ActionForm>
              </section>
            ) : null}
          </div>

          <div className="flow-col">
            <section className="mb-8">
              <h2 className="section-header mb-2 px-1">Theme</h2>
              <ThemeChoice current={ws.preferences.theme} />
            </section>

            <section className="mb-8">
              <h2 className="section-header mb-2 px-1">Help improve Invariant</h2>
              {demo ? (
                <p className="card px-4 py-4 text-subhead text-text-secondary">The demo counts nothing.</p>
              ) : (
                <ActionForm action={setImproveAction} label="Save" doneLabel="Saved" className="card space-y-3 px-4 py-4">
                  <label className="flex items-start gap-3">
                    <input name="improve" type="checkbox" defaultChecked={ws.preferences.improve} className="mt-1 size-4 shrink-0 accent-[var(--accent)]" />
                    <span className="text-subhead">Count what the app could not express in my methodology, and the reasons I rate a finding not useful, with everyone else&apos;s.</span>
                  </label>
                  <p className="text-footnote text-text-secondary">Only the words of a gap, any amount masked, and an agent&apos;s name, step and reason are counted, never a figure, a holding, a finding or who raised it. The most common are fixed in the app for everyone. Switching it off deletes what you raised.</p>
                </ActionForm>
              )}
            </section>

            <section className="mb-8">
              <h2 className="section-header mb-2 px-1">Give open data</h2>
              {demo ? (
                <p className="card px-4 py-4 text-subhead text-text-secondary">The demo gives nothing.</p>
              ) : (
                <ActionForm action={setDonateAction} label="Save" doneLabel="Saved" className="card space-y-3 px-4 py-4">
                  <label className="flex items-start gap-3">
                    <input name="donate" type="checkbox" defaultChecked={ws.preferences.donate} className="mt-1 size-4 shrink-0 accent-[var(--accent)]" />
                    <span className="text-subhead">Once a week, give how I keep my rules to the open data, pooled with everyone else&apos;s.</span>
                  </label>
                  <p className="text-footnote text-text-secondary">
                    Only the methodology&apos;s family, the share of rules kept, the breaches, the share of trades with a reason and how many holdings in a band, under a fingerprint of the sign-in. Never an amount, a holding or who gave it. Published only when five or more give it the same week, on{" "}
                    <a href="/open-data" className="text-accent-text underline-offset-4 hover:underline">
                      open data
                    </a>
                    . Switching it off deletes what you gave.
                  </p>
                </ActionForm>
              )}
            </section>

            <ListSection header="Policies and help" className="mb-8">
              <ListLinkRow href={"/help" as Route} label="Help and support" detail="Guides, the tour, and where to write." />
              <ListLinkRow href={"/privacy" as Route} label="Privacy policy" />
              <ListLinkRow href={"/cookies" as Route} label="Cookies" />
              <ListLinkRow href={"/terms" as Route} label="Terms" />
            </ListSection>

            {own ? (
              <section className="mb-8">
                <h2 className="section-header mb-2 px-1">Delete my account</h2>
                <ActionForm action={deleteAccountAction} label="Delete my account" doneLabel="Deleted" variant="secondary" className="card space-y-3 px-4 py-4">
                  <p className="text-subhead">Deletes your account and everything this deployment keeps about you: your sign-in and plan, your report schedule, your Community card, your clubs&apos; memberships, your AI spend and what you raised to improve the app.</p>
                  <p className="text-footnote text-text-secondary">Your files stay in the Portfolio OS folder in your own Drive; delete the folder there to remove them too. A club you own is deleted on Clubs first. This cannot be undone.</p>
                  <label className="block">
                    <span className="mb-1 block text-subhead">Type delete to confirm</span>
                    <input name="confirm" autoComplete="off" required className={field} />
                  </label>
                </ActionForm>
              </section>
            ) : null}

            {!demo ? (
              <form action={signOutAction} className="px-1">
                <button type="submit" className="inline-flex items-center gap-2 rounded-[10px] bg-surface-2 px-4 py-2 text-subhead text-text-secondary transition-colors hover:text-text">
                  <LogOut className="size-4" aria-hidden />
                  Sign out
                </button>
              </form>
            ) : (
              <p className="px-1 text-footnote text-text-secondary">
                <Link href={"/sign-in" as Route} className="text-accent-text">
                  Sign in
                </Link>{" "}
                to use the app with your own money.
              </p>
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}
