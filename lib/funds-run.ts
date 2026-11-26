import "server-only";

import { findIssuer, thirteenFs, thirteenFTable } from "@/lib/edgar";
import { EMPTY_FUNDS, filingOf, fundFilings, FUNDS, FUNDS_READ, fundsDue, fundsFileSchema, movesOf, sharesByCusip, type Fund, type FundsFile } from "@/lib/funds";
import type { EdgarContact } from "@/lib/preferences";
import { SyncError } from "@/lib/sync-error";
import type { Vault } from "@/lib/vault";

export type FundsRun = { checked: number; read: number; failed: number; sentence: string };

/**
 * The top funds' 13Fs (lib/funds.ts), with the contact the person confirmed:
 * each fund due a look has its filing list read; a 13F not read before is
 * read, its information table kept by its largest positions, each matched to
 * its company by name in the SEC's own list, and set against the quarter
 * before. A fund whose list or table cannot be read keeps its last good
 * copy and a sentence. Public filings alone; nothing of the person's book
 * leaves the app, and no model is involved.
 */
export async function readFundsInto(vault: Vault, contact: EdgarContact, now: Date, budgetMs: number): Promise<FundsRun> {
  const started = Date.now();
  const prev = (await vault.readJson("funds", fundsFileSchema).catch(() => null)) ?? EMPTY_FUNDS;
  const byId: FundsFile["byId"] = { ...prev.byId };
  const due = fundsDue(prev, now);
  let read = 0;
  let failed = 0;
  let checked = 0;
  const checkedAt = now.toISOString();
  for (const d of due) {
    if (Date.now() - started > budgetMs) break;
    checked += 1;
    const kept = prev.byId[d.id]?.cik === d.cik ? prev.byId[d.id] : undefined;
    try {
      // The current filer's 13Fs, then an earlier filer's for the quarters before it took over; an earlier list that cannot be read leaves the current one alone.
      const lists = [{ cik: d.cik, refs: await thirteenFs(d.cik, contact) }];
      for (const cik of d.before ?? []) {
        const refs = await thirteenFs(cik, contact).catch((e) => {
          if (e instanceof SyncError) return null;
          throw e;
        });
        if (refs) lists.push({ cik, refs });
      }
      const [latest, before] = fundFilings(lists);
      if (!latest) {
        byId[d.id] = { ...(kept ?? { id: d.id, cik: d.cik, latest: null, previous: null, moves: null, read: FUNDS_READ }), name: d.name, manager: d.manager, checkedAt, error: "SEC EDGAR lists no 13F for this manager." };
        failed += 1;
        continue;
      }
      if (kept?.latest?.accession === latest.accession && !kept.error && kept.read >= FUNDS_READ) {
        byId[d.id] = { ...kept, name: d.name, manager: d.manager, checkedAt };
        continue;
      }
      const rows = await thirteenFTable(latest.cik, latest.accession, contact);
      const filing = filingOf(rows, latest);
      // The quarter before: the one kept, else its own table.
      let previous: Fund["previous"] = null;
      const prevNames: Record<string, { name: string; ticker: string | null }> = {};
      if (before) {
        if (kept?.latest?.accession === before.accession && kept.read >= FUNDS_READ) {
          previous = { accession: before.accession, period: before.period, pct: Object.fromEntries(kept.latest.positions.map((p) => [p.cusip, p.pct])) };
          for (const p of kept.latest.positions) prevNames[p.cusip] = { name: p.name, ticker: p.ticker };
        } else {
          try {
            const earlier = await thirteenFTable(before.cik, before.accession, contact);
            previous = { accession: before.accession, period: before.period, pct: sharesByCusip(earlier) };
            for (const r of earlier.slice(0, 120)) prevNames[r.cusip] = { name: r.name, ticker: null };
          } catch (e) {
            if (!(e instanceof SyncError)) throw e;
          }
        }
      }
      // Each kept position's company, by the issuer's name in the SEC's list; a name the list does not give stays unmatched.
      for (const p of filing.positions) {
        const known = kept && kept.read >= FUNDS_READ ? kept.latest?.positions.find((x) => x.cusip === p.cusip && x.ticker) : undefined;
        // A company list that cannot be read throws, so the fund keeps its last good copy rather than a 13F with no companies (Hamza, 23 Oct 2026: funds left unrated).
        p.ticker = known?.ticker ?? (await findIssuer(p.name, contact))?.ticker ?? null;
      }
      for (const [c, v] of Object.entries(prevNames)) if (!v.ticker) prevNames[c] = { ...v, ticker: filing.positions.find((p) => p.cusip === c)?.ticker ?? null };
      byId[d.id] = { id: d.id, cik: d.cik, name: d.name, manager: d.manager, checkedAt, latest: filing, previous, moves: movesOf(filing, sharesByCusip(rows), previous, prevNames), error: null, read: FUNDS_READ };
      read += 1;
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      console.error(`[funds] a fund: ${e.logDetail ?? "failed"}`);
      byId[d.id] = { ...(kept ?? { id: d.id, cik: d.cik, latest: null, previous: null, moves: null, read: FUNDS_READ }), name: d.name, manager: d.manager, checkedAt, error: `${e.message}${kept?.latest ? " The last 13F read stays." : ""}`.slice(0, 300) };
      failed += 1;
    }
  }
  // A fund taken off the list leaves the file.
  for (const id of Object.keys(byId)) if (!FUNDS.some((d) => d.id === id)) delete byId[id];
  if (checked) await vault.writeJson("funds", fundsFileSchema.parse({ version: 1, byId, updated: checkedAt }));
  return { checked, read, failed, sentence: checked ? `Top funds: ${checked} looked at, ${read} new 13F${read === 1 ? "" : "s"} read${failed ? `, ${failed} not` : ""}.` : "Top funds: none due a look." };
}
