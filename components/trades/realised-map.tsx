import { money } from "@/lib/holdings";
import { moveFillAt, moveInkAt } from "@/lib/market-day";
import { inViewSize, squarify } from "@/lib/treemap";
import type { RealisedBySymbol } from "@/lib/trades";

const signed = (v: number, ccy: string) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${money(Math.abs(v), ccy)}`;
const pctWords = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v) >= 100 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(1)}%`;

/** Full colour at this return on cost either way, as What each holding made on Holdings. */
const FULL_AT = 30;
const LEGEND = [-30, -20, -10, 0, 10, 20, 30];
const SHAPES = [
  { key: "full", w: 1600, h: 560, className: "hidden lg:block" },
  { key: "wide", w: 900, h: 480, className: "hidden sm:block lg:hidden" },
  { key: "tall", w: 420, h: 560, className: "block sm:hidden" },
] as const;

/**
 * Realised by holding as a heat map (Hamza, 19 Oct 2026): each holding sold
 * in the window a tile sized by what its sales made or lost and coloured by
 * that against the cost of the lots closed; a holding only the broker's P&L
 * prices has no cost, so it takes the colour of its sign at half strength.
 */
export function RealisedMap({ rows, ccy, footer }: { rows: readonly RealisedBySymbol[]; ccy: string; footer: string }) {
  const total = rows.reduce((s, r) => s + r.pnl, 0);
  const tone = (r: RealisedBySymbol) => r.pct ?? (r.pnl > 0 ? FULL_AT / 2 : r.pnl < 0 ? -FULL_AT / 2 : 0);
  return (
    <section id="realised" className="card mb-8 scroll-mt-20 px-4 py-4 sm:px-5" aria-labelledby="realised-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="realised-title" className="section-header">Realised by holding · {rows.length}</h3>
          {rows.length ? (
            <p className="mt-1 text-subhead text-text-secondary">
              <span className="data text-text">{signed(total, ccy)}</span> realised in the window.
            </p>
          ) : null}
        </div>
        {rows.length ? (
          <div className="flex overflow-hidden rounded-[6px]" aria-hidden>
            {LEGEND.map((v) => (
              <span key={v} className="data px-1.5 py-0.5 text-caption" style={{ background: moveFillAt(v, FULL_AT), color: moveInkAt(v, FULL_AT) }}>
                {v > 0 ? `+${v}` : v}%
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {rows.length ? (
        <div className="mt-3">
          {SHAPES.map((shape) => (
            <svg key={shape.key} viewBox={`0 0 ${shape.w} ${shape.h}`} className={`${shape.className} w-full`} role="img" aria-label={`Heat map of ${rows.length} holdings sold, sized by what was realised and coloured by the return on cost`}>
              {squarify(rows, inViewSize(rows, (r) => Math.abs(r.pnl)), { x: 0, y: 0, w: shape.w, h: shape.h }).map((t) => {
                const r = t.item;
                const fill = moveFillAt(tone(r), FULL_AT);
                const ink = moveInkAt(tone(r), FULL_AT);
                const fs = Math.max(11, Math.min(34, t.w / 4.6, t.h / 3.4));
                const showTicker = t.w >= 34 && t.h >= 20;
                const showMoney = showTicker && t.h >= fs * 2.3 && t.w >= fs * 0.5 * 10;
                const showPct = showMoney && r.pct !== null && t.h >= fs * 3.1;
                const offsets = [0, fs * 1.0, fs * 1.72].slice(0, showPct ? 3 : showMoney ? 2 : 1);
                const span = 0.8 * fs + offsets[offsets.length - 1] + 0.15 * fs;
                const top = t.y + t.h / 2 - span / 2 + 0.8 * fs;
                return (
                  <g key={r.symbol}>
                    <rect x={t.x + 1.5} y={t.y + 1.5} width={Math.max(0, t.w - 3)} height={Math.max(0, t.h - 3)} rx={8} fill={fill}>
                      <title>{`${r.symbol} · ${signed(r.pnl, ccy)}${r.pct === null ? "" : ` · ${pctWords(r.pct)} on cost`} · ${r.sales} sale${r.sales === 1 ? "" : "s"}`}</title>
                    </rect>
                    {showTicker ? (
                      <text x={t.x + t.w / 2} y={offsets.length === 1 ? t.y + t.h / 2 + fs * 0.35 : top} textAnchor="middle" className="data" fontSize={fs} fontWeight={600} fill={ink} pointerEvents="none">
                        {r.symbol}
                      </text>
                    ) : null}
                    {showMoney ? (
                      <text x={t.x + t.w / 2} y={top + offsets[1]} textAnchor="middle" className="data" fontSize={fs * 0.6} fontWeight={600} fill={ink} pointerEvents="none">
                        {signed(r.pnl, ccy)}
                      </text>
                    ) : null}
                    {showPct && r.pct !== null ? (
                      <text x={t.x + t.w / 2} y={top + offsets[2]} textAnchor="middle" className="data" fontSize={fs * 0.5} fill={ink} opacity={0.85} pointerEvents="none">
                        {pctWords(r.pct)} on cost
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          ))}
          {/* The table view for a screen reader, in a clipped box: a table will not shrink to sr-only's one pixel and would widen the page. */}
          <div className="sr-only">
          <table>
            <caption>Realised by holding: what each holding&apos;s sales made in the window and the return on cost</caption>
            <thead>
              <tr>
                <th>Holding</th>
                <th>Realised</th>
                <th>On cost</th>
                <th>Sales</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol}>
                  <td>{r.symbol}</td>
                  <td>{signed(r.pnl, ccy)}</td>
                  <td>{r.pct === null ? "n/a" : pctWords(r.pct)}</td>
                  <td>{r.sales}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-subhead text-text-secondary">No sale closed in the window.</p>
      )}
      <p className="mt-3 text-footnote text-text-tertiary">{footer}</p>
    </section>
  );
}
