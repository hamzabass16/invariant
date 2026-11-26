import { StatTile } from "@/components/app/figures";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import { NoFigures } from "@/components/app/no-figures";
import { SampleNote } from "@/components/app/sample-note";
import { ShareBar } from "@/components/app/share-bar";
import { ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { fixedIncome } from "@/lib/exposure";
import { money } from "@/lib/holdings";
import { localDay } from "@/lib/time";
import { screen } from "@/lib/workspace";

export const metadata = { title: "Fixed income · Invariant" };

const pc = (x: number) => `${(x * 100).toFixed(1)}%`;

export default async function IncomePage() {
  const { book, sample } = await screen("fixed_income");
  if (!book)
    return (
      <>
        <PageHeader fresh={<ScreenFreshness />} title="Fixed income" />
        <PageBody>
          <NoFigures what="Bonds and deposits" />
        </PageBody>
      </>
    );
  const ccy = book.fx.base;
  const fi = fixedIncome(book, localDay());
  const holdings = book.holdings.filter((h) => h.assetClass === "bond" || h.assetClass === "deposit");
  const ladderScale = Math.max(...fi.ladder.map((l) => l.share), 0.01);

  return (
    <>
      <PageHeader fresh={<ScreenFreshness />} title="Fixed income" subtitle="Deposits and bonds from the bank statements" />
      <PageBody>
        <SampleNote sample={sample} asOf={book.asOf} />
        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatTile label="Total" value={money(fi.total, ccy)} />
          <StatTile label="Weighted yield" value={fi.weightedYieldPct === null ? "n/a" : `${fi.weightedYieldPct.toFixed(2)}%`} detail={`Stated on ${pc(fi.yieldCoverage)} of it; the rest has no yield on the statement`} />
          <StatTile label="Maturing in 90 days" value={String(fi.maturingSoon.length)} detail={fi.maturingSoon.map((m) => `${m.maturity}`).join(" · ") || "Nothing"} tone={fi.maturingSoon.length ? "warn" : "neutral"} />
        </div>

        {fi.maturingSoon.length ? (
          <ListSection header="Coming up for reinvestment">
            {fi.maturingSoon.map((m) => (
              <ListRow key={m.name} label={m.name} detail={`Matures ${m.maturity}`} value={<span className="data">{money(m.value, ccy)}</span>} />
            ))}
          </ListSection>
        ) : null}

        <ListSection header="Maturity ladder">
          {fi.ladder.map((l) => (
            <ListRow key={l.key} label={<>{l.key}<ShareBar share={l.share} scale={ladderScale} /></>} detail={money(l.value, ccy)} value={<span className="data">{pc(l.share)}</span>} />
          ))}
        </ListSection>

        <ListSection header="By issuer or bank" footer="Concentration in one issuer or one bank is a risk of its own, separate from the yield.">
          {fi.byIssuer.map((r) => (
            <ListRow key={r.key} label={r.key} detail={money(r.value, ccy)} value={<span className="data">{pc(r.share)}</span>} />
          ))}
        </ListSection>
        <ListSection header="By currency">
          {fi.byCurrency.map((r) => (
            <ListRow key={r.key} label={r.key} value={<span className="data">{pc(r.share)}</span>} />
          ))}
        </ListSection>

        <ListSection grid header="Every line">
          {holdings.map((h) => (
            <ListRow
              key={h.id}
              label={h.name}
              detail={
                h.bond
                  ? `${h.bond.issuer} · coupon ${h.bond.coupon ?? "n/a"}% · matures ${h.bond.maturity ?? "n/a"} · yield ${h.bond.yieldPct === null ? "not stated" : `${h.bond.yieldPct}%`}`
                  : `${h.account} · rate ${h.deposit?.ratePct ?? "n/a"}% · matures ${h.deposit?.maturity ?? "n/a"}`
              }
              value={<span className="data">{money(h.value, h.currency)}</span>}
            />
          ))}
        </ListSection>
        <p className="px-1 text-footnote text-text-tertiary">Figures as the statements give them. Not investment advice.</p>
      </PageBody>
    </>
  );
}
