"use client";

import { ChevronDown, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { badgeFor, groupNav, isCurrent, itemsFor, settingsFor, type NavBadges } from "@/components/app/nav-items";
import { SearchButton } from "@/components/app/palette";
import { StealthToggle } from "@/components/app/stealth";
import { AccountMenu, PortfolioMenu, type AccountInfo, type PortfolioPick } from "@/components/app/top-menus";
import { useBadges } from "@/components/app/unread";
import { cn } from "@/lib/utils";

/**
 * Laptop navigation (Hamza, 19 Oct 2026: a menu at the top of the page, not
 * a sidebar): the brand at the left; every screen under one of six places
 * (`groupNav`: Today, Book, Research, Markets, Rules, Reviews; Hamza, 4 Nov 2026, Markets split from Research 6 Nov 2026),
 * each a menu opened on hover, so nothing folds under More; then the search
 * (⌘K, components/app/palette.tsx), the portfolio selector, the
 * stealth switch that hides every amount (Hamza, 19 Oct 2026), Settings
 * (Setup, Customise, Newsletters and the SEC contact) and the account menu
 * under the person's initials. The bar's background blends the accent into
 * the surface behind a blur. Hidden below 1024px, where the tab bar takes
 * over.
 */
export function TopBar({ footer, badges: served = {}, hrefs, settingsHrefs, title, portfolio, account }: { footer: React.ReactNode; badges?: NavBadges; hrefs: string[]; settingsHrefs: string[]; title: string; portfolio?: PortfolioPick | null; account: AccountInfo }) {
  const pathname = usePathname();
  const badges = useBadges(served);
  const items = itemsFor(hrefs).filter((n) => n.id !== "more");
  const settings = settingsFor(settingsHrefs);
  const settingsOpen = settings.some((s) => isCurrent(pathname, s.href)) || pathname === "/more";
  const entries = groupNav(items);

  return (
    <header className="top-menu sticky top-0 z-40 hidden lg:block" data-tour="top-menu">
      <div className="mx-auto flex h-14 max-w-content items-center gap-3 px-6 xl:gap-5">
        <Link href="/" className="flex shrink-0 flex-col justify-center" aria-label={`${title} home`}>
          <span className="brand-mark">{title}</span>
          <span className="gilt-rule mt-1" aria-hidden />
        </Link>
        <nav aria-label="Sections" className="min-w-0 flex-1">
          <ul className="flex items-center gap-0.5">
            {entries.map((e) => {
              if (e.kind === "screen") {
                const { href, label, icon: Icon } = e.item;
                const current = isCurrent(pathname, href);
                const badge = badgeFor(badges, href);
                return (
                  <li key={href}>
                    <Link href={href} aria-current={current ? "page" : undefined} className={cn("top-item", current && "top-item-current")}>
                      <Icon className="size-4 shrink-0" strokeWidth={current ? 2.2 : 1.8} aria-hidden />
                      <span className="whitespace-nowrap">{label}</span>
                      {badge ? (
                        <span className="data rounded-full bg-accent px-1.5 text-caption leading-5 font-semibold text-text" aria-label={`${badge} unread`}>
                          {badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              }
              const { group, items: members } = e;
              const open = members.some((n) => isCurrent(pathname, n.href));
              const count = members.reduce((sum, n) => sum + (Number(badgeFor(badges, n.href)?.replace("+", "")) || 0), 0);
              const GroupIcon = group.icon;
              return (
                <li key={group.id} className="group relative">
                  <button type="button" className={cn("top-item", open && "top-item-current")} aria-haspopup="menu">
                    <GroupIcon className="size-4 shrink-0" strokeWidth={open ? 2.2 : 1.8} aria-hidden />
                    <span className="whitespace-nowrap">{group.label}</span>
                    {count ? <span className="data rounded-full bg-accent px-1.5 text-caption leading-5 font-semibold text-text">{count > 99 ? "99+" : count}</span> : null}
                    <ChevronDown className="size-3.5 transition-transform duration-150 group-hover:rotate-180 group-focus-within:rotate-180" aria-hidden />
                  </button>
                  <Menu label={group.label}>
                    {members.map(({ id, href, label, icon: Icon }) => {
                      const current = isCurrent(pathname, href);
                      const badge = badgeFor(badges, href);
                      return (
                        <React.Fragment key={href}>
                          <li>
                            <Link href={href} role="menuitem" aria-current={current ? "page" : undefined} className={cn("menu-item", current && "menu-item-current")}>
                              <Icon className="size-4 shrink-0" aria-hidden />
                              <span className="flex-1 truncate">{label}</span>
                              {badge ? <span className="data rounded-full bg-accent px-1.5 text-caption leading-5 font-semibold text-text">{badge}</span> : null}
                            </Link>
                          </li>
                          {/* A view of the screen above it (Methodology's Evaluation), set in under it. */}
                          {(group.extras ?? []).filter((x) => x.after === id).map(({ href: xHref, label: xLabel, icon: XIcon }) => (
                            <li key={xHref}>
                              <Link href={xHref} role="menuitem" className="menu-item pl-9">
                                <XIcon className="size-4 shrink-0" aria-hidden />
                                <span className="flex-1 truncate">{xLabel}</span>
                              </Link>
                            </li>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </Menu>
                </li>
              );
            })}
          </ul>
        </nav>
        <SearchButton />
        {portfolio && portfolio.items.length ? <PortfolioMenu pick={portfolio} /> : null}
        <StealthToggle />
        <div className="group relative shrink-0">
          <button type="button" className={cn("top-item", settingsOpen && "top-item-current")} aria-haspopup="menu">
            <Settings className="size-4 shrink-0" strokeWidth={settingsOpen ? 2.2 : 1.8} aria-hidden />
            <span>Settings</span>
            <ChevronDown className="size-3.5 transition-transform duration-150 group-hover:rotate-180 group-focus-within:rotate-180" aria-hidden />
          </button>
          <Menu label="Settings" align="right" foot={footer}>
            {settings.map(({ href, label, detail, icon: Icon }) => {
              const current = isCurrent(pathname, href);
              return (
                <li key={href}>
                  <Link href={href} role="menuitem" aria-current={current ? "page" : undefined} className={cn("menu-item", current && "menu-item-current")}>
                    <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block">{label}</span>
                      {detail ? <span className="block text-caption text-text-tertiary">{detail}</span> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </Menu>
        </div>
        <AccountMenu account={account} />
      </div>
    </header>
  );
}

/** A menu that opens under its button on hover or keyboard focus and stays open while the pointer is on it; the gap above it is part of it, so the pointer never falls through. */
function Menu({ label, align = "left", foot, children }: { label: string; align?: "left" | "right"; foot?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={cn("invisible absolute top-full z-50 pt-2 opacity-0 transition-[opacity,transform,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0", align === "right" ? "right-0" : "left-0")}>
      <div className="top-menu-panel w-72 overflow-hidden rounded-2xl border border-hairline p-1.5">
        <ul role="menu" aria-label={label} className="space-y-0.5">
          {children}
        </ul>
        {foot ? <div className="mt-1.5 border-t border-hairline px-3 pt-2.5 pb-1.5">{foot}</div> : null}
      </div>
    </div>
  );
}
