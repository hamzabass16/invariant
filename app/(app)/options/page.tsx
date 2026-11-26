import { StatTile } from "@/components/app/figures";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import { NoFigures } from "@/components/app/no-figures";
import { SampleNote } from "@/components/app/sample-note";
import { Columns } from "@/components/charts/columns";
import { ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { DEFAULT_RATE, money, spotsFor } from "@/lib/holdings";
import {
  STRATEGY_LABEL,
  contractView,
  exposureByUnderlying,
  groupStrategies,
  optionAlerts,
  portfolioGreeks,
  premiumByMonth,
  realisedOptions,
  type ContractView,
} from "@/lib/options";
import { localDay } from "@/lib/time";
import { screen } from "@/lib/workspace";

export const metadata = { title: "Options · Invariant" };

const signed = (n: number, ccy: string) => `${n > 0 ? "+" : ""}${money(n, ccy)}`;

function contractLabel(v: ContractView) {
  const side = v.contracts < 0 ? "Short" : "Long";
  return `${side} ${Math.abs(v.contracts)} × ${v.option.underlying} ${v.option.strike} ${v.option.right === "C" ? "call" : "put"}`;
}

export default async function OptionsPage() {
  const { book, sample } = await screen("options");
  if (!book)
    return (
      <>
        <PageHeader fresh={<ScreenFreshness />} title="Options" />
        <PageBody>
          <NoFigures what="Option contracts" />
        </PageBody>
      </>
    );
  const ccy = book.fx.base;
  const today = localDay();
  const market = { today, rate: book.market?.rate ?? DEFAULT_RATE, spots: spotsFor(book) };

  const views = book.holdings.map((h) => contractView(h, market)).filter((v): v is ContractView => v !== null).sort((a, b) => a.dte - b.dte);
  const cash = Object.fromEntries(
    [...new Set(book.holdings.map((h) => h.account))].map((a) => [a, book.holdings.filter((h) => h.account === a && h.assetClass === "cash").reduce((s, h) => s + h.value, 0)]),
  );
  const strategies = groupStrategies(book.holdings, cash);
  const exposure = exposureByUnderlying(book.holdings, market);
  const greeks = portfolioGreeks(views);
  const premium = premiumByMonth(book.transactions);
  const realised = realisedOptions(book.transactions);
  const alerts = optionAlerts(views);
  const accounts = [...new Set(views.map((v) => v.holding.account))].join(" and ");

  return (
    <>
      <PageHeader fresh={<ScreenFreshness />} title="Options" subtitle={`${views.length} open contracts across ${accounts || "no accounts"}`} />
      <PageBody>
        <SampleNote sample={sample} asOf={book.asOf} />

        {alerts.length ? (
          <ListSection header="Needs you">
            {alerts.map((a) => (
              <ListRow key={`${a.holdingId}-${a.kind}`} label={a.text} trailing={<StatusPill tone={a.kind === "short_itm" || a.kind === "expires_today" ? "danger" : "warn"}>{a.kind === "short_itm" ? "In the money" : "Expiry"}</StatusPill>} />
            ))}
          </ListSection>
        ) : null}

        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Delta" value={`${greeks.delta.toFixed(0)} sh`} detail="Share-equivalent, all contracts" />
          <StatTile label="Theta" value={`${signed(greeks.theta, ccy)}/day`} detail="Time decay, all contracts" tone={greeks.theta >= 0 ? "ok" : "warn"} />
          <StatTile label="Vega" value={`${signed(greeks.vega, ccy)}`} detail="Per 1 point of volatility" />
          <StatTile label="Gamma" value={greeks.gamma.toFixed(2)} detail="Delta change per $1 move" />
        </div>
        <p className="-mt-6 mb-8 px-1 text-footnote text-text-secondary">
          Greeks are computed (Black-Scholes, volatility implied from each mark), not supplied by the broker.{greeks.missing ? ` ${greeks.missing} contract(s) had no usable mark and are left out.` : ""}
        </p>

        <ListSection grid header="Strategies" footer="Legs are grouped automatically: spreads, then straddles and strangles, then covered calls against shares in the same account, then single legs. A short put counts as cash-secured only when the account's cash covers the strike.">
          {strategies.map((s, i) => (
            <ListRow
              key={i}
              label={`${s.underlying} · ${STRATEGY_LABEL[s.kind]}`}
              detail={`${s.account} · ${s.legs.map((l) => `${l.contracts > 0 ? "+" : ""}${l.contracts} ${l.strike}${l.right}`).join(" / ")} · exp ${s.expiry}${s.breakevens.length ? ` · breakeven ${s.breakevens.join(" and ")}` : ""}`}
              value={
                <span className="data text-footnote">
                  {s.maxProfit !== null ? `${s.kind === "covered_call" ? "premium" : "max"} +${money(s.maxProfit, ccy)}` : "max gain open"}
                  <br />
                  {s.maxLoss !== null ? `max −${money(s.maxLoss, ccy)}` : s.kind === "covered_call" ? "downside in the shares" : "max loss open"}
                </span>
              }
            />
          ))}
        </ListSection>

        <ListSection grid header="Open contracts">
          {views.map((v) => (
            <ListRow
              key={v.holding.id}
              label={contractLabel(v)}
              detail={`${v.holding.account} · exp ${v.option.expiry} (${v.dte} days) · ${v.moneyness ?? "no spot"}${v.iv !== null ? ` · IV ${(v.iv * 100).toFixed(0)}%` : ""}${v.deltaShares !== null ? ` · Δ ${v.deltaShares.toFixed(0)} sh` : ""}`}
              value={
                <span className="data">
                  {money(v.holding.value, v.holding.currency)}
                  {v.unrealizedPnl !== null ? <span className={`block text-footnote ${v.unrealizedPnl >= 0 ? "text-ok" : "text-danger"}`}>{signed(v.unrealizedPnl, v.holding.currency)}</span> : null}
                </span>
              }
              trailing={v.assignmentRisk ? <StatusPill tone="danger">Assignment risk</StatusPill> : null}
            />
          ))}
        </ListSection>

        <ListSection grid header="Exposure by underlying" footer="Shares plus each option's delta, valued at the latest price. This is what the book behaves like if the stock moves a little.">
          {exposure.map((e) => (
            <ListRow
              key={e.underlying}
              label={e.underlying}
              detail={`${e.shares} shares · options ${e.optionDeltaShares >= 0 ? "+" : ""}${e.optionDeltaShares.toFixed(0)} sh${e.partial ? " · partial" : ""}`}
              value={<span className="data">{e.deltaAdjustedValue === null ? "no price" : money(e.deltaAdjustedValue, ccy)}</span>}
            />
          ))}
        </ListSection>

        <div className="mb-8">
          <Columns
            title="Premium collected by month"
            subtitle="Options sold to open, net of commissions"
            labels={premium.map((p) => p.month)}
            values={premium.map((p) => p.collected)}
            color="var(--accent)"
            format="usd"
            tableCaption="Premium collected and paid by month"
          />
        </div>

        <ListSection grid header="Realised options results" footer="Closed, expired and assigned contracts, by underlying. An assignment closes the option at its premium; the shares that follow count as a stock trade.">
          {realised.length ? (
            realised.map((r) => (
              <ListRow key={r.underlying} label={r.underlying} detail={`${r.closed} closed · ${r.wins} won · ${r.losses} lost`} value={<span className={`data ${r.realised >= 0 ? "text-ok" : "text-danger"}`}>{signed(r.realised, ccy)}</span>} />
            ))
          ) : (
            <ListRow label="No closed contracts in the period." />
          )}
        </ListSection>
        <p className="px-1 text-footnote text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
