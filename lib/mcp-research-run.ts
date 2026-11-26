import "server-only";

import { unstable_cache } from "next/cache";

import { releaseDaysFor } from "@/lib/company-run";
import { companyFacts, insiderForms, lookupCompany, operatorContact } from "@/lib/edgar";
import { factsText, latestBalance } from "@/lib/edgar-facts";
import { INSIDER_READ_DAYS, withForms, type Insiders } from "@/lib/insiders";
import { loadShortInterest } from "@/lib/markets-feed";
import type { ResearchCompany, ResearchSource } from "@/lib/mcp-research";
import type { EdgarContact } from "@/lib/preferences";
import { withShareCount, type ShortInterest } from "@/lib/short-interest";
import { storageMode } from "@/lib/storage";
import { SyncError } from "@/lib/sync-error";
import { addDaysTo, localDay } from "@/lib/time";

/**
 * The public research server's reads (lib/mcp-research.ts): SEC EDGAR and
 * FINRA alone, with the deployment's own contact for the SEC (SEC_CONTACT,
 * else the app's inbox address), since no one is signed in. Each answer is
 * shared for the day in the data cache under the CIK alone, so a ticker
 * asked by many is read once; nothing is kept and nothing of anyone's vault
 * is opened. The demo answers nothing.
 */

const DAY_SECONDS = 12 * 60 * 60;

const contact = operatorContact;

export function researchSource(): ResearchSource {
  const today = localDay();
  const sec = contact();
  const ready = storageMode() === "demo" ? "The demo reads no filings. The research tools answer on a deployment of Invariant." : !sec ? "This deployment names no contact for the SEC (SEC_CONTACT), which EDGAR asks of every reader, so it reads no filings." : null;
  const c = sec as EdgarContact;
  return {
    today,
    ready,
    company: async (ticker) => {
      // The SEC lists a class share with a dash (BRK-B) where a listing carries a dot.
      const dashed = ticker.replace(".", "-");
      for (const t of dashed === ticker ? [ticker] : [ticker, dashed]) {
        const hit = await lookupCompany(t, c);
        if (hit && (hit.ticker === ticker || hit.ticker === dashed)) return { ticker: hit.ticker, name: hit.title, cik: hit.cik } satisfies ResearchCompany;
      }
      return null;
    },
    facts: (co) => unstable_cache(async () => factsText(await companyFacts(co.cik, c)), ["research-facts", String(co.cik), today], { revalidate: DAY_SECONDS })(),
    insiders: (co) =>
      unstable_cache(
        async (): Promise<Insiders | null> => {
          try {
            const got = await insiderForms(co.cik, c, addDaysTo(today, -INSIDER_READ_DAYS), []);
            return withForms(undefined, got.forms, got.waiting, new Date().toISOString());
          } catch (e) {
            if (e instanceof SyncError) return null;
            throw e;
          }
        },
        ["research-insiders", String(co.cik), today],
        { revalidate: DAY_SECONDS },
      )(),
    short: (co) =>
      unstable_cache(
        async (): Promise<{ row: ShortInterest | null; settlement: string | null }> => {
          const s = await loadShortInterest([co.ticker], today);
          const row = s.rows.get(co.ticker);
          if (!row || !s.settlement) return { row: null, settlement: s.settlement };
          // The share of the shares outstanding needs the filings' count; without it the row stands alone.
          const table = await companyFacts(co.cik, c).catch(() => null);
          const shares = table ? (latestBalance(table, "sharesOutstanding")?.value ?? table.ttm.dilutedShares ?? null) : null;
          return { row: withShareCount(row, s.settlement, shares, table?.currency === "USD"), settlement: s.settlement };
        },
        ["research-short", co.ticker, today],
        { revalidate: DAY_SECONDS },
      )(),
    releases: async (co) => {
      const r = await releaseDaysFor(co.cik, c, today);
      if (r.problem) throw new SyncError(r.problem, "research releases");
      return r.days;
    },
  };
}

/** A failed read in a sentence; the ticker never goes in the log. */
export function researchProblem(e: unknown): string {
  if (e instanceof SyncError) {
    console.error(`[mcp research] call failed: ${e.logDetail ?? "sync error"}`);
    return e.message;
  }
  console.error("[mcp research] call failed: unexpected error");
  return "The filings could not be read just now. Try again in a moment.";
}
