import { ArrowDown, ArrowUp } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { InfoTip } from "@/components/ui/info-tip";
import { StatusPill } from "@/components/ui/status";
import { companyHref } from "@/lib/company";
import { capWords, moveFill, moveInk, signedPct } from "@/lib/market-day";
import { metricInfo } from "@/lib/metric-info";
import type { SortKey, TableRow } from "@/lib/screener-table";

const COLUMNS: { key: SortKey; label: string; right: boolean; field?: string }[] = [
  { key: "symbol", label: "Symbol", right: false },
  { key: "price", label: "Price", right: true },
  { key: "changePct", label: "Chg %", right: true },
  { key: "cap", label: "Mkt cap", right: true },
  { key: "pe", label: "P/E", right: true, field: "pe_ratio" },
  { key: "forwardPe", label: "Fwd P/E", right: true, field: "forward_pe" },
  { key: "epsGrowth", label: "EPS growth", right: true, field: "eps_growth_pct" },
  { key: "revenueGrowth", label: "Rev growth", right: true, field: "revenue_growth_pct" },
  { key: "divYield", label: "Div yield", right: true, field: "dividend_yield_pct" },
  { key: "roic", label: "ROIC", right: true, field: "roic_pct" },
  { key: "impliedGrowth", label: "Priced-in growth", right: true, field: "implied_growth_pct" },
  { key: "sector", label: "Sector", right: false },
];

const pct = (v: number | null, signed = false) => (v === null ? "—" : `${signed && v > 0 ? "+" : ""}${v.toFixed(1)}%`);
const ratio = (v: number | null) => (v === null ? "—" : v.toFixed(1));

/**
 * The screener's table, after TradingView's (Hamza, 23 Oct 2026): one row a
 * company, every column sorting from its header, the move in the heat map's
 * own colours, a company held or watched marked, its class beside its name.
 * A dash is a figure the screener has not read, never a zero. Priced-in
 * growth is the revenue growth the price assumes (lib/dcf.ts's reverse DCF). The table
 * scrolls sideways inside its card on a phone, the symbol column fixed.
 */
export function ScreenTable({ rows, sort, sortHref, classLabel, linkable }: { rows: TableRow[]; sort: { key: SortKey; dir: "asc" | "desc" }; sortHref: (key: SortKey) => string; classLabel: (id: string) => string; linkable: (r: TableRow) => boolean }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[66rem] border-collapse text-footnote">
        <caption className="sr-only">Companies on the screen, sorted by {COLUMNS.find((c) => c.key === sort.key)?.label}</caption>
        <thead>
          <tr className="border-b border-hairline text-caption text-text-secondary">
            {COLUMNS.map((c, i) => (
              <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`whitespace-nowrap px-3 py-2.5 font-medium ${c.right ? "text-right" : "text-left"} ${i === 0 ? "sticky left-0 z-10 bg-surface" : ""}`}>
                <Link href={sortHref(c.key) as Route} scroll={false} className={`inline-flex items-center gap-1 hover:text-text ${sort.key === c.key ? "text-text" : ""}`}>
                  {c.label}
                  {sort.key === c.key ? sort.dir === "asc" ? <ArrowUp aria-hidden className="h-3 w-3" /> : <ArrowDown aria-hidden className="h-3 w-3" /> : null}
                </Link>
                {c.field && metricInfo(c.field) ? <InfoTip id={`screen-${c.key}`} label={c.label} text={metricInfo(c.field)!} side="below" align="end" className="ml-1" /> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol} className="border-b border-hairline last:border-0 hover:bg-surface-2">
              <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-normal">
                <span className="flex min-w-[13rem] max-w-[17rem] items-center gap-2">
                  {linkable(r) ? (
                    <Link href={companyHref(r.symbol) as Route} className="data shrink-0 font-semibold text-accent-text">
                      {r.symbol}
                    </Link>
                  ) : (
                    <span className="data shrink-0 font-semibold">{r.symbol}</span>
                  )}
                  <span className="truncate text-text-secondary" title={r.name}>
                    {r.name}
                  </span>
                  {r.held ? <StatusPill tone="info">Held</StatusPill> : r.watched ? <StatusPill tone="neutral">Watched</StatusPill> : null}
                </span>
                {r.classId ? <span className="mt-0.5 block text-caption text-accent-text">{classLabel(r.classId)}</span> : null}
              </th>
              <td className="data px-3 py-2 text-right">{r.price === null ? "—" : r.price.toFixed(2)}</td>
              <td className="px-3 py-2 text-right">
                {r.changePct === null ? (
                  "—"
                ) : (
                  <span className="data inline-block min-w-[4.25rem] rounded-[6px] px-1.5 py-0.5 text-right font-semibold" style={{ background: moveFill(r.changePct), color: moveInk(r.changePct) }}>
                    {signedPct(r.changePct)}
                  </span>
                )}
              </td>
              <td className="data px-3 py-2 text-right">{r.cap ? capWords(r.cap) : "—"}</td>
              <td className="data px-3 py-2 text-right">{ratio(r.pe)}</td>
              <td className="data px-3 py-2 text-right">{ratio(r.forwardPe)}</td>
              <td className="data px-3 py-2 text-right">{pct(r.epsGrowth, true)}</td>
              <td className="data px-3 py-2 text-right">{pct(r.revenueGrowth, true)}</td>
              <td className="data px-3 py-2 text-right">{pct(r.divYield)}</td>
              <td className="data px-3 py-2 text-right">{pct(r.roic)}</td>
              <td className="data px-3 py-2 text-right">{pct(r.impliedGrowth)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-text-secondary">{r.sector ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
