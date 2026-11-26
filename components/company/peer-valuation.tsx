import type { Route } from "next";
import Link from "next/link";

import type { ConsensusNow } from "@/components/theses/valuation-history";
import { InfoTip } from "@/components/ui/info-tip";
import { companyHref } from "@/lib/company";
import { EXTRA_INFO, metricInfo } from "@/lib/metric-info";
import { capWords } from "@/lib/market-day";
import { PEER_METRICS, type PeerComparison } from "@/lib/peers";

const x = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}x`);
const signed = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(0)}%`);

/**
 * A company's multiples against its peers and its sector as a whole (Hamza,
 * 23 Oct 2026): each trailing and forward multiple from the filings, the
 * peers' median and the sector's, its premium or discount on each, the
 * analysts' consensus forward P/E as the company's own line, and the largest
 * peers by name. A dash is a figure not read, never a zero.
 */
export function PeerValuation({ symbol, comparison: c, consensus, linkable }: { symbol: string; comparison: PeerComparison; consensus: ConsensusNow | null; linkable: (symbol: string) => boolean }) {
  const anyRead = c.rows.some((r) => r.company !== null || r.peersMedian !== null || r.sectorWhole !== null);
  return (
    <div className="card px-4 py-4">
      <p className="text-subhead font-semibold">Against its peers and its sector</p>
      <p className="mt-1 text-footnote text-text-secondary">
        {c.words} {c.sector ? `Sector: ${c.sector}, ${c.sectorCount} ${c.sectorCount === 1 ? "company" : "companies"}, taken whole: its market value over the figure under it.` : null}
      </p>
      {anyRead ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-footnote">
            <caption className="sr-only">{symbol}&apos;s multiples against its peers&apos; median and its sector as a whole</caption>
            <thead>
              <tr className="border-b border-hairline text-caption text-text-secondary">
                <th scope="col" className="py-2 pr-3 text-left font-medium">Multiple</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">{symbol}</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Peers&apos; median <InfoTip id="peers-median" label="the peers' median" text={EXTRA_INFO.peers_median} side="below" align="end" /></th>
                <th scope="col" className="px-2 py-2 text-right font-medium">vs peers</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Sector, whole <InfoTip id="sector-whole" label="the sector as a whole" text={EXTRA_INFO.sector_whole} side="below" align="end" /></th>
                <th scope="col" className="py-2 pl-2 text-right font-medium">vs sector</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.field} className="border-b border-hairline last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal text-text-secondary">
                    {r.label}
                    {metricInfo(r.field) ? <InfoTip id={`peers-${r.field}`} label={r.label} text={metricInfo(r.field)!} side="below" align="start" className="ml-1" /> : null}
                  </th>
                  <td className="data px-2 py-2 text-right font-semibold">{x(r.company)}</td>
                  <td className="data px-2 py-2 text-right">
                    {x(r.peersMedian)}
                    {r.peersN ? <span className="text-caption text-text-tertiary"> ({r.peersN})</span> : null}
                  </td>
                  <td className="data px-2 py-2 text-right text-text-secondary">{signed(r.vsPeersPct)}</td>
                  <td className="data px-2 py-2 text-right">
                    {x(r.sectorWhole)}
                    {r.sectorMedian !== null ? <span className="block text-caption text-text-tertiary">median {r.sectorMedian.toFixed(1)}x</span> : null}
                  </td>
                  <td className="data py-2 pl-2 text-right text-text-secondary">{signed(r.vsSectorPct)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row" className="py-2 pr-3 text-left font-normal text-text-secondary">
                  Fwd P/E, analysts <InfoTip id="peers-consensus" label="the analysts' forward P/E" text={EXTRA_INFO.consensus_ntm} side="above" align="start" />
                </th>
                <td className="data px-2 py-2 text-right font-semibold">{x(consensus?.pe ?? null)}</td>
                <td colSpan={4} className="py-2 pl-2 text-left text-caption text-text-tertiary">
                  {consensus ? `${consensus.words} Their estimate, read ${consensus.readAt.slice(0, 10)}; not read for the peers.` : "No analysts' consensus is read for this company yet."}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-footnote text-text-tertiary">No multiple is read for the company, its peers or its sector yet; the screener reads a share of the S&amp;P 500 and the Nasdaq-100 each day.</p>
      )}
      {c.peers.length ? (
        <div className="mt-3">
          <p className="text-caption text-text-secondary">The largest peers</p>
          <ul className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {c.peers.map((p) => (
              <li key={p.symbol} className="flex items-baseline justify-between gap-3 rounded-[8px] bg-surface-2 px-3 py-1.5 text-footnote">
                <span className="min-w-0 truncate">
                  {linkable(p.symbol) ? (
                    <Link href={companyHref(p.symbol) as Route} className="data font-semibold text-accent-text">
                      {p.symbol}
                    </Link>
                  ) : (
                    <span className="data font-semibold">{p.symbol}</span>
                  )}{" "}
                  <span className="text-text-secondary">{p.name}</span>
                </span>
                <span className="data shrink-0 text-text-secondary">
                  {PEER_METRICS.slice(0, 2).map((m) => `${m.label} ${x(p.values[m.field] ?? null)}`).join(" · ")}
                  {p.cap ? ` · ${capWords(p.cap)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {c.notes.map((n) => (
        <p key={n} className="mt-2 text-caption text-text-tertiary">{n}</p>
      ))}
      <p className="mt-2 text-caption text-text-tertiary">Forward multiples from the filings carry the trailing figure a year on at revenue growth, held between −50% and +100%; the app&apos;s arithmetic, not a forecast. Not investment advice.</p>
    </div>
  );
}
