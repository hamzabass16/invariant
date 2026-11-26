/**
 * Which pages carry Back and where it goes when there is no page to go back
 * to (pure; Hamza, 11 Nov 2026). A page opened from another sits one level
 * or more under a screen: /company/AAPL, /holdings/AAPL, /theses/market/rates,
 * /methodology/graph. A screen in the menu is one level and has none.
 */

/** The screen a page sits under when its own first part is not a screen of its own. */
const PARENT: Record<string, string> = { company: "/companies" };

export function isDetailPath(pathname: string): boolean {
  return pathname.split("/").filter(Boolean).length >= 2;
}

/** Where Back goes for a page opened straight from a link: the screen it sits under. */
export function backFallback(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  return PARENT[first] ?? (first ? `/${first}` : "/");
}
