import { Suspense } from "react";

import { AppShell } from "@/components/app/app-shell";
import { Greeting } from "@/components/app/greeting";
import { initialsOf, navFor, settingsHrefsFor } from "@/components/app/nav-items";
import { Tour } from "@/components/demo/tour";
import { RefreshWhileOpen } from "@/components/live/refresh";
import { LensBar } from "@/components/portfolios/lens-bar";
import { orderNav } from "@/lib/preferences";
import { companyHref } from "@/lib/company";
import { readableSymbols } from "@/lib/filings";
import { testedAs } from "@/lib/methodology";
import { ruleEntries, tickerEntries } from "@/lib/palette";
import { fillsOf } from "@/lib/trades";
import { lensIds, portfolioLabel } from "@/lib/portfolios";
import { TOUR, TOUR_APP } from "@/lib/tour";
import { deriveScreens } from "@/lib/screen-data";
import { catchUpOnOpen } from "@/lib/catch-up";
import { localDay } from "@/lib/time";
import { getWorkspace } from "@/lib/workspace";

/** Every screen reads the person's latest copy on each request, never a copy baked in at build time. */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ws = await getWorkspace();
  // Results and filings the scheduled runs would read, read after the page is sent when they are due.
  await catchUpOnOpen(ws);
  // The unread count on Notifications: today's breaches, watches, dates and reads since the person last looked.
  const unread = ws.setup && ws.book ? deriveScreens({ book: ws.book, methodology: ws.setup.methodology, inputs: ws.setup.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences, research: ws.research, alerts: ws.alerts, statements: ws.statements }, localDay()).unread.length : 0;
  // The portfolios as the top of the page names them ("Hamza's IBKR" while a portfolio keeps its account's name) and the ones in view.
  const pick = ws.setup ? { items: ws.portfolios.items.map((p) => ({ id: p.id, label: portfolioLabel(p, ws.setup!.ownerName, ws.fullBook) })), chosen: lensIds(ws.portfolios, ws.preferences.lens) } : null;
  const demo = ws.mode === "demo";
  const name = demo ? "Demo" : (ws.setup?.ownerName ?? ws.operator.name ?? ws.operator.email);
  const account = { initials: demo ? "D" : initialsOf(ws.setup?.ownerName ?? ws.operator.name, ws.operator.email), name, email: demo && ws.operator.email === "demo" ? "No sign-in needed" : ws.operator.email, theme: ws.preferences.theme, demo };
  // The search palette's own entries (⌘K; Hamza, 4 Nov 2026): the methodology's rules and the tickers held, watched and traded, by symbol and name alone.
  const m = ws.draft ?? ws.setup?.methodology ?? null;
  const book = ws.fullBook ?? ws.book;
  const names = new Map<string, string>();
  for (const e of Object.values(ws.filings?.bySymbol ?? {})) if (e.name) names.set((e.ticker ?? e.symbol).toUpperCase(), e.name);
  for (const h of book?.holdings ?? []) if (h.name && h.name !== h.symbol) names.set(h.symbol.toUpperCase(), h.name);
  const palette = {
    rules: m ? ruleEntries(m.rules.map((r) => ({ id: r.id, section: r.section, text: r.text, tested: r.test ? testedAs(r, m, ws.setup?.baseCurrency ?? "USD") : null })), ws.book && !ws.draft ? "checks" : "rules") : [],
    tickers: tickerEntries(book ? readableSymbols(book) : [], Object.keys(ws.records.bySymbol), book ? fillsOf(book).map((f) => f.symbol) : [], names, companyHref),
  };
  return (
    <AppShell
      palette={palette}
      portfolio={pick}
      account={account}
      hrefs={orderNav(navFor(ws.modules, ws.screens), ws.preferences).map((n) => n.href)}
      settingsHrefs={settingsHrefsFor(ws.modules, ws.screens)}
      badges={{ "/notifications": unread }}
      title="Invariant"
      footer={
        <div className="min-w-0">
          {ws.mode === "demo" ? (
            <p className="text-caption text-accent-text">
              {ws.showcase ? "Demo · anonymized snapshot" : "Demo · fictional data"}
              {" · "}
              <a href="/try" className="underline underline-offset-2">
                {ws.showcase ? "Restart the tour" : "Take the tour"}
              </a>
            </p>
          ) : null}
          <p className="truncate text-caption text-text-tertiary" title={ws.operator.email}>
            {ws.mode === "demo" && ws.operator.email === "demo" ? "No sign-in needed" : ws.operator.email}
          </p>
        </div>
      }
    >
      {pick && pick.items.length > 1 ? <LensBar pick={pick} /> : null}
      {children}
      <Greeting name={ws.mode === "demo" ? null : (ws.setup?.ownerName ?? null)} shown={ws.mode === "drive" ? ws.preferences.quotesShown : null} />
      <RefreshWhileOpen />
      <Suspense fallback={null}>
        <Tour steps={ws.showcase ? TOUR : TOUR_APP} />
      </Suspense>
    </AppShell>
  );
}
