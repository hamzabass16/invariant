"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { badgeFor, isCurrent, itemsFor, tabsFor, type NavBadges } from "@/components/app/nav-items";
import { useBadges } from "@/components/app/unread";
import { cn } from "@/lib/utils";

/** Phone navigation. Replaced by the sidebar at 1024px. */
export function TabBar({ badges: served = {}, hrefs }: { badges?: NavBadges; hrefs: string[] }) {
  const pathname = usePathname();
  const badges = useBadges(served);
  const { tabs, overflow } = tabsFor(itemsFor(hrefs));

  return (
    <nav
      aria-label="Sections"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-shell lg:hidden"
    >
      <ul className="mx-auto flex max-w-2xl">
        {tabs.map(({ href, short: label, icon: Icon }) => {
          const current = href === "/more" ? pathname === "/more" || overflow.some((o) => isCurrent(pathname, o.href)) : isCurrent(pathname, href);
          const badge = badgeFor(badges, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 pt-2 pb-2 transition-colors duration-100",
                  current ? "text-shell-text" : "text-shell-muted",
                )}
              >
                <span className="relative">
                  <Icon className="size-6" strokeWidth={current ? 2.2 : 1.8} aria-hidden />
                  {badge ? (
                    <span className="data absolute -top-1 -right-2.5 min-w-4 rounded-full bg-shell-text px-1 text-center text-[0.625rem] leading-4 font-semibold text-shell" aria-label={`${badge} unread notifications`}>
                      {badge}
                    </span>
                  ) : null}
                </span>
                <span className="text-[0.625rem] leading-none font-medium">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
