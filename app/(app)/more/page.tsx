import type { Route } from "next";
import { navFor, SETTINGS, settingsFor, settingsHrefsFor, tabsFor } from "@/components/app/nav-items";
import { ListLinkRow, ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { orderNav } from "@/lib/preferences";
import { getWorkspace } from "@/lib/workspace";

export const metadata = { title: "Settings · Invariant" };

/**
 * Settings, the phone's More tab (Hamza, 19 Oct 2026: on a laptop the same
 * tabs open from the Settings menu at the top of the page, so this page is
 * not linked there): every screen the tab bar has no room for, then the
 * Settings tabs, the vault, the account (the laptop's initials menu) and the
 * boundaries. What each source holds and
 * since when is on Setup, card by card.
 */
export default async function MorePage() {
  const ws = await getWorkspace();
  const { overflow } = tabsFor(orderNav(navFor(ws.modules, ws.screens), ws.preferences));
  const tabs = settingsFor(settingsHrefsFor(ws.modules, ws.screens));
  const detailOf = (href: string) => SETTINGS.find((s) => s.href === href)?.detail;

  return (
    <>
      <PageHeader title="Settings" subtitle={ws.setup ? `${ws.setup.ownerName}'s app${ws.setup.methodology ? ` · ${ws.setup.methodology.name}` : ""}` : undefined} />
      <PageBody>
        <div className="flow-cols">
          <div className="flow-col">
            {overflow.length ? (
              <ListSection header="Sections" className="mb-8 lg:hidden">
                {overflow.map(({ href, label, icon: Icon }) => (
                  <ListLinkRow key={href} href={href} label={label} leading={<Icon className="size-5 shrink-0 text-text-secondary" aria-hidden />} />
                ))}
              </ListSection>
            ) : null}

            <ListSection header="Settings" className="mb-8" footer="What each source holds, and since when, is on Setup, card by card.">
              {tabs.map(({ href, label, icon: Icon }) => (
                <ListLinkRow key={href} href={href} label={label} detail={detailOf(href)} leading={<Icon className="size-5 shrink-0 text-text-secondary" aria-hidden />} />
              ))}
              <ListRow label="Vault" detail={ws.vault ? `${ws.vault.where}` : ws.mode === "demo" ? "The demo keeps its choices in this browser." : "Not open."} value={ws.vault ? <StatusPill tone="ok">{ws.vault.kind}</StatusPill> : undefined} />
            </ListSection>
          </div>

          <div className="flow-col">
            <ListSection header="Account" className="mb-8 lg:hidden">
              <ListLinkRow href={"/account" as Route} label="Account settings" detail="Your address, how you sign in, the password and the theme." />
              <ListLinkRow href={"/setup#group-5" as Route} label="Profile" detail="Your name, who the app is for and where your files are kept." />
              <ListLinkRow href={"/help" as Route} label="Help and support" />
              <ListLinkRow href={"/privacy" as Route} label="Privacy policy" />
              <ListLinkRow href={"/cookies" as Route} label="Cookies" />
              <ListLinkRow href={"/terms" as Route} label="Terms" />
            </ListSection>

            <ListSection header="Boundaries" className="mb-8">
              <ListRow wrap label="Read-only" detail="No code path places, changes or cancels an order, creates an alert, or writes to a bank or broker." />
              <ListRow wrap label="Your data" detail="Figures are read with your own token from your own vault. Nothing about your money goes in a URL, a log line or an analytics event." />
              <ListRow wrap label="The AI" detail="Reading a methodology, a study or an analyst question runs on Claude under Invariant's own key; your figures go to Anthropic for the call alone and are never logged." />
            </ListSection>
          </div>
        </div>
        <p className="px-1 text-footnote text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
