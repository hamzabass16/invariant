import { StatTile } from "@/components/app/figures";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import { NoFigures } from "@/components/app/no-figures";
import { SampleNote } from "@/components/app/sample-note";
import { ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { commitments, fundLookThrough } from "@/lib/exposure";
import { money } from "@/lib/holdings";
import { screen } from "@/lib/workspace";

export const metadata = { title: "Private funds · Invariant" };

const x = (v: number | null) => (v === null ? "n/a" : `${v.toFixed(2)}x`);

export default async function FundsPage() {
  const { book, sample } = await screen("funds");
  if (!book)
    return (
      <>
        <PageHeader fresh={<ScreenFreshness />} title="Private funds" />
        <PageBody>
          <NoFigures what="Private funds" />
        </PageBody>
      </>
    );
  const ccy = book.fx.base;
  const funds = book.holdings.filter((h) => h.assetClass === "private_fund" && h.fund);
  const lt = fundLookThrough(book);
  const cm = commitments(book);

  return (
    <>
      <PageHeader fresh={<ScreenFreshness />} title="Private funds" subtitle="From the reports the funds email; values are the funds' own, as of each report" />
      <PageBody>
        <SampleNote sample={sample} asOf={book.asOf} />
        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatTile label="Unfunded commitments" value={money(cm.totalUnfunded, ccy)} detail="Capital the funds can still call" />
          <StatTile label="Cash and deposits" value={money(cm.cash + cm.deposits, ccy)} detail="Available to meet calls" />
          <StatTile label="Coverage" value={cm.coverage === null ? "n/a" : `${cm.coverage.toFixed(1)}x`} tone={cm.coverage !== null && cm.coverage < 1 ? "danger" : "ok"} detail="Cash and deposits over unfunded" />
        </div>

        {funds.map((h) => {
          const f = h.fund!;
          const rows = lt.filter((r) => r.parentId === h.id).sort((a, b) => b.value - a.value);
          const estimated = rows.some((r) => r.estimated);
          return (
            <ListSection
              key={h.id}
              header={h.name}
              footer={
                estimated
                  ? "This report lists its companies without values, so each is shown at an equal share of the fund. Treat those figures as estimates."
                  : `Company values from the fund's report dated ${rows[0]?.asOf ?? h.asOf}.`
              }
            >
              <ListRow label="NAV (your share)" detail={`${f.manager}${f.vintage ? ` · vintage ${f.vintage}` : ""} · report ${h.asOf}`} value={<span className="data">{money(h.value, h.currency)}</span>} />
              <ListRow label="Committed · called · unfunded" value={<span className="data text-footnote">{money(f.commitment, h.currency)} · {money(f.called, h.currency)} · {money(Math.max(f.commitment - f.called, 0), h.currency)}</span>} />
              <ListRow label="Distributions" value={<span className="data">{money(f.distributions, h.currency)}</span>} />
              <ListRow label="DPI · TVPI · IRR (as reported)" value={<span className="data text-footnote">{x(f.reported.dpi)} · {x(f.reported.tvpi)} · {f.reported.irrPct === null ? "n/a" : `${f.reported.irrPct.toFixed(1)}%`}</span>} />
              {rows.map((r) => (
                <ListRow
                  key={r.name}
                  label={r.name}
                  detail={[r.sector, r.stage, r.country, r.themes.join(", ")].filter(Boolean).join(" · ")}
                  value={<span className="data">{money(r.value, ccy)}</span>}
                  trailing={r.estimated ? <StatusPill tone="neutral">Est.</StatusPill> : <span className="data text-footnote text-text-secondary">{(r.weight * 100).toFixed(0)}%</span>}
                />
              ))}
            </ListSection>
          );
        })}
        <p className="px-1 text-footnote text-text-tertiary">Not investment advice.</p>
      </PageBody>
    </>
  );
}
