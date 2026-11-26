import { type NavBadges } from "@/components/app/nav-items";
import { Palette } from "@/components/app/palette";
import { TabBar } from "@/components/app/tab-bar";
import { TopBar } from "@/components/app/top-bar";
import type { AccountInfo, PortfolioPick } from "@/components/app/top-menus";
import type { PaletteEntry } from "@/lib/palette";

/**
 * Top menu on laptop, tab bar on phone. Both are rendered and chosen with CSS so
 * the server sends the right shell for either viewport without a flash.
 */
/** `hrefs` is the person's ordered list of screens and `settingsHrefs` the Settings menu's; the icons are resolved on the client. */
export function AppShell({ footer, badges, hrefs, settingsHrefs, title, portfolio, account, palette, children }: { footer: React.ReactNode; badges?: NavBadges; hrefs: string[]; settingsHrefs: string[]; title: string; portfolio?: PortfolioPick | null; account: AccountInfo; palette: { rules: PaletteEntry[]; tickers: PaletteEntry[] }; children: React.ReactNode }) {
  return (
    <>
      <TopBar footer={footer} badges={badges} hrefs={hrefs} settingsHrefs={settingsHrefs} title={title} portfolio={portfolio} account={account} />
      <div className="min-w-0 pb-[4.5rem] lg:pb-0">{children}</div>
      <TabBar badges={badges} hrefs={hrefs} />
      {/* ⌘K, the top bar's search and the phone title bar's (Hamza, 4 Nov 2026). */}
      <Palette hrefs={hrefs} settingsHrefs={settingsHrefs} rules={palette.rules} tickers={palette.tickers} />
    </>
  );
}
