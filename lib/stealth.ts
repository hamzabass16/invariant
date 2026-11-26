/**
 * Stealth mode, pure (Hamza, 19 Oct 2026: a switch beside Settings that hides
 * every money amount): what reads as an amount of money on a screen, so the
 * page can mask it while the switch is on. An amount is a currency sign or a
 * currency code then a number (with a k, m, bn or tn after it), the sign in
 * front included; a percentage, a count, a price written "123.45 USD" and a
 * date are left as they are. The choice is a cookie on the device alone.
 *
 * Only what is the person's own money is hidden (Hamza, 7 Nov 2026: "it
 * should only hide anything that relates to the portfolio net worth"): a
 * company's revenue, a market value or a price on a public page stays. A
 * screen whose figures are all public companies' or markets' (PUBLIC_PATHS)
 * is left as it is but for what is marked `data-private` (a holding's value
 * on a company's page); anywhere else every amount is hidden but what is
 * marked `data-public` (the S&P 500's day, a company's news, prices out of
 * hours).
 */
export const STEALTH_COOKIE = "pos_stealth";
export const STEALTH_MASK = "•••••";

const CODES = "USD|EUR|GBP|CHF|CAD|AUD|NZD|JPY|CNY|HKD|SGD|SEK|NOK|DKK|AED|SAR|QAR|KWD|BHD|INR|ZAR|BRL|MXN|ILS|TRY|PLN|CZK|HUF|KRW|TWD|LBP";
const MONEY = new RegExp(`(?:[-−+]\\s?)?(?:[A-Z]{0,3}[$€£¥₹₪₩]|\\b(?:${CODES})\\s?)\\s?[-−]?\\d[\\d,.]*(?:\\s?(?:bn|tn|[kKmMB])\\b)?`, "g");

/** The text with every amount of money masked; the same text when it has none. */
export function maskMoney(text: string): string {
  if (!/\d/.test(text)) return text;
  return text.replace(MONEY, STEALTH_MASK);
}

/** The screens whose amounts are public companies' and markets', never the person's. */
export const PUBLIC_PATHS = ["/company", "/companies", "/screener", "/markets", "/flows", "/calendar", "/earnings", "/top-funds", "/community", "/watchlist", "/research", "/agents"] as const;

/** Whether a screen's amounts are all public: its path is one of PUBLIC_PATHS or under one. */
export const publicPath = (path: string) => PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
