import type * as React from "react";

import { StatTile } from "@/components/app/figures";
import { ListRow, ListSection } from "@/components/ui/list";
import { fundOverlapMatrix, netWorth, overlap } from "@/lib/exposure";
import { money, type Book } from "@/lib/holdings";

const pc = (x: number) => `${(x * 100).toFixed(1)}%`;

/**
 * Where the money is: liquid and illiquid, the same company reached in
 * more than one place, and the accounts when there are several (one
 * account is the net worth again). Net worth by asset class,
 * by currency and revenue by region are views of the one donut card at the
 * top of Holdings (Hamza, 19 Oct 2026); the net worth
 * tile, the asset-class list and the themes are not drawn (Hamza, 19 Oct
 * 2026: the header and the donut say net worth, the donut's table lists the
 * classes, and Sectors looks through funds), nor the currencies tile, which
 * the Currencies tab draws (Hamza, 20 Oct 2026: no repeated cards).
 */
export function WhereMoneyIs({ book, badge }: { book: Book; badge?: React.ReactNode }) {
  const ccy = book.fx.base;
  const nw = netWorth(book);
  const ov = overlap(book);
  const pairs = fundOverlapMatrix(book);

  return (
    <section id="allocation" className="scroll-mt-20">
      <h2 className="section-header mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 px-4">
        Where the money is
        {badge}
      </h2>
      <div className="mb-8 grid grid-cols-2 gap-3">
        <StatTile label="Liquid" value={money(nw.liquid, ccy)} detail={pc(nw.total ? nw.liquid / nw.total : 0)} />
        <StatTile label="Illiquid" value={money(nw.illiquid, ccy)} detail="Private funds and real estate" />
      </div>

      <ListSection header="Overlap" footer="The same company reached in more than one place: two funds, a fund and a direct holding, shares and options, or two brokers. Matched on ticker, otherwise on the company name.">
        {ov.length ? (
          ov.map((r) => (
            <ListRow
              key={r.company}
              label={r.ticker ? `${r.company} (${r.ticker})` : r.company}
              detail={r.places.map((p) => `${p.via} ${money(p.value, ccy)}${p.estimated ? " est." : ""}`).join(" · ")}
              value={<span className="data">{pc(r.share)}</span>}
            />
          ))
        ) : (
          <ListRow label="No company appears in more than one place." />
        )}
      </ListSection>

      {pairs.length ? (
        <ListSection header="Funds that hold the same companies">
          {pairs.map((p) => (
            <ListRow wrap key={`${p.a}-${p.b}`} label={`${p.a} and ${p.b}`} detail={p.shared.join(", ")} value={<span className="data">{money(p.value, ccy)}</span>} />
          ))}
        </ListSection>
      ) : null}

      {nw.byAccount.length > 1 ? (
        <ListSection grid header="By account or institution">
          {nw.byAccount.map((c) => (
            <ListRow key={c.key} label={c.key} detail={money(c.value, ccy)} value={<span className="data">{pc(c.share)}</span>} />
          ))}
        </ListSection>
      ) : null}
    </section>
  );
}
