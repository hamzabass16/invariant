"use client";

import { Briefcase, Check, ChevronDown, Cookie, FileText, LifeBuoy, LogOut, Moon, Settings2, ShieldCheck, Sun, SunMoon, UserRound } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { signOutAction } from "@/app/(app)/account/actions";
import { setThemeAction } from "@/app/(app)/customise/actions";
import { setLensAction } from "@/app/(app)/setup/portfolio-actions";
import { isCurrent } from "@/components/app/nav-items";
import type { Theme } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { reached } from "@/components/app/reach";

/** The portfolios as the top of the page names them, and which the screens look through: none chosen is all together. */
export type PortfolioPick = { items: { id: string; label: string }[]; chosen: string[] };

/** The signed-in person as the account menu shows them. */
export type AccountInfo = { initials: string; name: string; email: string; theme: Theme; demo: boolean };

/** What the portfolio button says: the one portfolio, the one chosen, all together, or the ones put together. */
export function pickLabel(p: PortfolioPick): string {
  if (p.items.length === 1) return p.items[0].label;
  const chosen = p.items.filter((i) => p.chosen.includes(i.id));
  if (!chosen.length) return "All portfolios";
  if (chosen.length === 1) return chosen[0].label;
  return `${chosen.length} portfolios together`;
}

/** A menu that opens under its button on hover or keyboard focus, as the Settings menu does. */
export function HoverMenu({ label, align = "left", width = "w-72", head, foot, children }: { label: string; align?: "left" | "right"; width?: string; head?: React.ReactNode; foot?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={cn("invisible absolute top-full z-50 pt-2 opacity-0 transition-[opacity,transform,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 translate-y-1 group-hover:translate-y-0 group-focus-within:translate-y-0", align === "right" ? "right-0" : "left-0")}>
      <div className={cn("top-menu-panel overflow-hidden rounded-2xl border border-hairline p-1.5", width)}>
        {head ? <div className="mb-1.5 border-b border-hairline px-3 pt-1.5 pb-2.5">{head}</div> : null}
        <ul role="menu" aria-label={label} className="space-y-0.5">
          {children}
        </ul>
        {foot ? <div className="mt-1.5 border-t border-hairline px-3 pt-2.5 pb-1.5">{foot}</div> : null}
      </div>
    </div>
  );
}

/**
 * The choice of portfolios (Hamza, 19 Oct 2026): all together, one, or the
 * ones ticked, put together. Each choice is kept with the person's
 * preferences and every screen reloads through it. With one portfolio there
 * is nothing to choose and the menu is not drawn.
 */
export function PortfolioChoices({ pick, compact }: { pick: PortfolioPick; compact?: boolean }) {
  const [state, run, pending] = React.useActionState(reached(setLensAction), { error: null });
  const all = !pick.chosen.length;
  const several = pick.chosen.length > 1;
  const [ticked, setTicked] = React.useState<string[]>(several ? pick.chosen : pick.items.map((i) => i.id));
  // A new choice from the server resets the ticks, set while rendering rather than in an effect.
  const sig = `${pick.chosen.join(",")}|${pick.items.map((i) => i.id).join(",")}`;
  const [seen, setSeen] = React.useState(sig);
  if (seen !== sig) {
    setSeen(sig);
    setTicked(several ? pick.chosen : pick.items.map((i) => i.id));
  }
  const row = (id: string, text: string, current: boolean, hint?: string) => (
    <li key={id || "all"}>
      <form action={run}>
        <input type="hidden" name="lens" value={id} />
        <button type="submit" role="menuitemradio" aria-checked={current} disabled={pending} className={cn("menu-item w-full text-left", current && "menu-item-current")}>
          <span className="flex size-4 shrink-0 items-center justify-center">{current ? <Check className="size-4" aria-hidden /> : null}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{text}</span>
            {hint ? <span className="block text-caption text-text-tertiary">{hint}</span> : null}
          </span>
        </button>
      </form>
    </li>
  );
  return (
    <>
      {row("", "All portfolios", all, "Every portfolio added together")}
      {pick.items.map((i) => row(i.id, i.label, pick.chosen.length === 1 && pick.chosen[0] === i.id))}
      <li className={cn("mt-1 border-t border-hairline pt-2", compact ? "px-1" : "px-2")}>
        <form action={run} className="space-y-1.5">
          <input type="hidden" name="aggregate" value="1" />
          <p className="section-header px-1">Put together</p>
          {pick.items.map((i) => (
            <label key={i.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-subhead hover:bg-surface-2">
              <input type="checkbox" name="ids" value={i.id} checked={ticked.includes(i.id)} onChange={(e) => setTicked((t) => (e.target.checked ? [...t, i.id] : t.filter((x) => x !== i.id)))} className="size-4 accent-[var(--accent)]" />
              <span className="min-w-0 flex-1 truncate">{i.label}</span>
            </label>
          ))}
          <button type="submit" disabled={pending || ticked.length < 1} className="mt-1 w-full rounded-[10px] bg-accent px-3 py-1.5 text-subhead font-medium text-text transition-opacity disabled:opacity-50">
            {pending ? "Putting together" : ticked.length === pick.items.length ? "Show all together" : ticked.length === 1 ? "Show this one" : `Put ${ticked.length} together`}
          </button>
          {several ? <p className="px-1 text-caption text-text-tertiary">Showing {pick.chosen.length} together now.</p> : null}
          {state.error ? <p className="px-1 text-caption text-danger">{state.error}</p> : null}
        </form>
      </li>
    </>
  );
}

/** The portfolio selector at the top right: the portfolio in view, and with more than one, a menu of the choices. */
export function PortfolioMenu({ pick }: { pick: PortfolioPick }) {
  const label = pickLabel(pick);
  if (pick.items.length <= 1)
    return (
      <div className="top-item max-w-[15rem] cursor-default" title="Your one portfolio. Add another on Setup to choose between them.">
        <Briefcase className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
        <span className="truncate">{label}</span>
      </div>
    );
  return (
    <div className="group relative shrink-0">
      <button type="button" className="top-item max-w-[15rem]" aria-haspopup="menu" title={label}>
        <Briefcase className="size-4 shrink-0" strokeWidth={1.8} aria-hidden />
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 transition-transform duration-150 group-hover:rotate-180 group-focus-within:rotate-180" aria-hidden />
      </button>
      <HoverMenu label="Portfolio" align="right">
        <PortfolioChoices pick={pick} />
      </HoverMenu>
    </div>
  );
}

const THEME_ICON: Record<Theme, typeof Sun> = { system: SunMoon, light: Sun, dark: Moon };
const THEME_WORD: Record<Theme, string> = { system: "Device", light: "Light", dark: "Dark" };

/** Light, dark or the device's, kept at once (the same action as Customise). */
function ThemeSwitch({ current }: { current: Theme }) {
  const [, run, pending] = React.useActionState(reached(setThemeAction), { error: null });
  const [shown, setShown] = React.useState(current);
  const [seen, setSeen] = React.useState(current);
  if (seen !== current) {
    setSeen(current);
    setShown(current);
  }
  return (
    <form action={run} className="grid grid-cols-3 gap-1 rounded-[10px] bg-surface-2 p-1" role="radiogroup" aria-label="Theme">
      {(Object.keys(THEME_WORD) as Theme[]).map((t) => {
        const Icon = THEME_ICON[t];
        return (
          <button
            key={t}
            type="submit"
            name="theme"
            value={t}
            role="radio"
            aria-checked={shown === t}
            disabled={pending}
            onClick={() => {
              setShown(t);
              document.documentElement.dataset.theme = t;
            }}
            className={cn("inline-flex items-center justify-center gap-1.5 rounded-[8px] px-2 py-1.5 text-caption transition-colors", shown === t ? "bg-surface text-text shadow-sm" : "text-text-secondary hover:text-text")}
          >
            <Icon className="size-3.5" aria-hidden />
            {THEME_WORD[t]}
          </button>
        );
      })}
    </form>
  );
}

const ACCOUNT_LINKS: { href: string; label: string; icon: typeof Sun }[] = [
  { href: "/account", label: "Account settings", icon: Settings2 },
  { href: "/setup#group-5", label: "Profile", icon: UserRound },
  { href: "/help", label: "Help and support", icon: LifeBuoy },
  { href: "/privacy", label: "Privacy policy", icon: ShieldCheck },
  { href: "/cookies", label: "Cookies", icon: Cookie },
  { href: "/terms", label: "Terms", icon: FileText },
];

/**
 * The account menu under the person's initials (Hamza, 19 Oct 2026), opened
 * on hover like Settings: account settings, profile, help, the policies, the
 * theme and signing out.
 */
export function AccountMenu({ account }: { account: AccountInfo }) {
  const pathname = usePathname();
  return (
    <div className="group relative shrink-0">
      <button type="button" className="avatar-chip" aria-haspopup="menu" aria-label={`Account: ${account.name}`}>
        <span aria-hidden>{account.initials}</span>
      </button>
      <HoverMenu
        label="Account"
        align="right"
        head={
          <div className="flex items-center gap-3">
            <span className="avatar-chip avatar-chip-lg" aria-hidden>
              {account.initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-subhead font-semibold text-text">{account.name}</span>
              <span className="block truncate text-caption text-text-tertiary">{account.email}</span>
            </span>
          </div>
        }
        foot={
          <div className="space-y-2.5">
            <ThemeSwitch current={account.theme} />
            {account.demo ? null : (
              <form action={signOutAction}>
                <button type="submit" className="inline-flex items-center gap-2 text-subhead text-text-secondary transition-colors hover:text-text">
                  <LogOut className="size-4" aria-hidden />
                  Sign out
                </button>
              </form>
            )}
          </div>
        }
      >
        {ACCOUNT_LINKS.map(({ href, label, icon: Icon }) => {
          const current = isCurrent(pathname, href.split("#")[0]);
          return (
            <li key={href}>
              <Link href={href as Route} role="menuitem" aria-current={current ? "page" : undefined} className={cn("menu-item", current && "menu-item-current")}>
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </HoverMenu>
    </div>
  );
}
