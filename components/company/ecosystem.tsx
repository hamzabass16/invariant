import type { Route } from "next";
import Link from "next/link";

import { ChartFrame, ChartTable } from "@/components/charts/frame";
import { companyHref } from "@/lib/company";
import { ECO_KIND_LABEL, ecoGroups, type EcoKind, type EcoRelation, type Ecosystem } from "@/lib/ecosystem";

/** Each kind's hue: identity, never a status colour. */
const HUE: Record<EcoKind, string> = { supplier: "var(--series-spy)", customer: "var(--series-hcmp)", partner: "var(--series-qqq)", competitor: "var(--text-tertiary)" };
const SHOWN = 8;

function Entry({ r, linkable }: { r: EcoRelation; linkable: (s: string) => boolean }) {
  return (
    <li className="border-b border-hairline last:border-b-0">
      <details className="group py-2">
        <summary className="flex cursor-pointer list-none items-baseline gap-2 text-subhead [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="mt-1 inline-block h-2 w-2 shrink-0 self-start rounded-full" style={{ background: HUE[r.kind] }} />
          <span className="min-w-0 flex-1 truncate">{r.name}</span>
          {r.ticker ? (
            linkable(r.ticker) ? (
              <Link href={companyHref(r.ticker) as Route} className="data text-caption text-text-secondary underline-offset-2 hover:underline">
                {r.ticker}
              </Link>
            ) : (
              <span className="data text-caption text-text-tertiary">{r.ticker}</span>
            )
          ) : null}
          {r.share !== null ? (
            <span className="data text-caption text-text-secondary" title={`${r.share}% of revenue`}>
              {`${r.share}%`}
              <span className="sr-only"> of revenue</span>
            </span>
          ) : null}
        </summary>
        <blockquote className="mt-1.5 border-l border-hairline pl-3 text-caption text-text-secondary">{`“${r.quote}”`}</blockquote>
      </details>
    </li>
  );
}

function Column({ kind, items, linkable, className }: { kind: EcoKind; items: EcoRelation[]; linkable: (s: string) => boolean; className?: string }) {
  return (
    <div className={`term-cell ${className ?? ""}`}>
      <p className="term-label mb-1 flex items-center justify-between">
        <span>{ECO_KIND_LABEL[kind]}</span>
        <span className="data text-text-tertiary">{items.length}</span>
      </p>
      {items.length ? (
        <>
          <ul>
            {items.slice(0, SHOWN).map((r) => (
              <Entry key={`${r.kind}:${r.name}`} r={r} linkable={linkable} />
            ))}
          </ul>
          {items.length > SHOWN ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-caption text-text-secondary">{`${items.length - SHOWN} more`}</summary>
              <ul>
                {items.slice(SHOWN).map((r) => (
                  <Entry key={`${r.kind}:${r.name}`} r={r} linkable={linkable} />
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : (
        <p className="py-2 text-caption text-text-tertiary">None named in the report.</p>
      )}
    </div>
  );
}

/**
 * The companies a company names in its own annual report, by kind, each
 * opening to the sentence it is named in (lib/ecosystem.ts; Hamza, 21 Nov
 * 2026, after Qualtrim's ecosystem page): suppliers on the left, the company
 * in the middle, its customers on the right, its partners and competitors
 * under them. The table holds every one with its quote.
 */
export function EcosystemCard({ symbol, name, eco, linkable, filedOn }: { symbol: string; name: string; eco: Ecosystem; linkable: (s: string) => boolean; filedOn: string | null }) {
  const by = (k: EcoKind) => eco.relations.filter((r) => r.kind === k).sort((a, b) => (b.share ?? -1) - (a.share ?? -1));
  const groups = ecoGroups(eco);
  const source = `${eco.form}${filedOn ? ` filed ${filedOn}` : ""}`;
  const table = (
    <ChartTable
      caption={`The companies ${symbol}'s ${eco.form} names, by kind, with its own words`}
      head={["Company", "Kind", "Ticker", "Share", "The report's words"]}
      rows={groups.flatMap((g) => g.items.map((r) => [r.name, ECO_KIND_LABEL[r.kind].replace(/s$/, ""), r.ticker ?? "–", r.share === null ? "–" : `${r.share}%`, <span key="q" className="block max-w-[28rem] whitespace-normal text-left">{r.quote}</span>]))}
    />
  );
  return (
    <ChartFrame
      title="Ecosystem"
      subtitle={`The suppliers, customers, partners and competitors ${symbol} names in its ${source}, each with the sentence it is named in. The report's words, not the app's; a name opens its sentence, and a customer's percentage is its share of revenue.`}
      legend={(["supplier", "customer", "partner", "competitor"] as const).map((k) => ({ label: ECO_KIND_LABEL[k], color: HUE[k], kind: "rect" as const }))}
      table={table}
      after={
        <p className="mt-2 text-caption text-text-tertiary">
          {eco.url ? (
            <a href={eco.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              {`Read the ${eco.form} at the SEC`}
            </a>
          ) : null}
          {eco.note ? ` ${eco.note}` : ""}
        </p>
      }
    >
      <div className="term-grid grid grid-cols-1 md:grid-cols-3">
        <Column kind="supplier" items={by("supplier")} linkable={linkable} />
        <div className="term-cell flex flex-col items-center justify-center gap-2 py-6 text-center">
          <span className="data text-caption text-text-tertiary" aria-hidden>
            {"suppliers → "}
            <span className="text-text-primary">{symbol}</span>
            {" → customers"}
          </span>
          <span className="text-body font-semibold sm:text-title-3">{name}</span>
          <span className="text-caption text-text-tertiary">{`${eco.relations.length} companies named in its ${eco.form}`}</span>
        </div>
        <Column kind="customer" items={by("customer")} linkable={linkable} />
        <Column kind="partner" items={by("partner")} linkable={linkable} className="md:col-span-1" />
        <Column kind="competitor" items={by("competitor")} linkable={linkable} className="md:col-span-2" />
      </div>
    </ChartFrame>
  );
}

/** What the section says without a reading: why, in a sentence. */
export function ecosystemWaiting(eco: Ecosystem | null, demo: boolean, registry: boolean): string {
  if (demo) return "The demo reads no annual report, so it draws no ecosystem.";
  if (!registry) return "This deployment keeps no shared readings, so the ecosystem is not read.";
  if (!eco) return "The ecosystem is read from the company's annual report: the S&P 500 and the Nasdaq-100 at the morning run, and a company you hold or watch when you open the app.";
  if (eco.error) return eco.error;
  return "The annual report names no supplier, customer, partner or competitor.";
}
