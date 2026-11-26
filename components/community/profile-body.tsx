import { Donut, type Slice } from "@/components/charts/donut";
import type { LegendItem } from "@/components/charts/frame";
import { Avatar, Chip, RecordLine } from "@/components/community/feed";
import { ListRow, ListSection } from "@/components/ui/list";
import { StatusPill } from "@/components/ui/status";
import { CHANGE_NOTICE_DAYS, topHoldings, type CommunityProfile, type Receipt } from "@/lib/community";
import { pct } from "@/lib/format";
import { FAMILY_LABEL } from "@/lib/research";
import { paragraphsOf, pillarFieldName } from "@/lib/theses";
import { localDay, daysBetween, longDate } from "@/lib/time";
import type { ReactNode } from "react";

// One hue per class in the order the profile names them; a holding with no class is grey.
const CLASS_PALETTE = ["var(--arch-tr)", "var(--arch-cm)", "var(--arch-dg)", "var(--arch-ph)", "var(--series-spy)", "var(--series-qqq)", "var(--accent-text)", "var(--text-tertiary)"];
const step = (color: string, i: number) => (i === 0 ? color : `color-mix(in oklab, ${color}, var(--surface) ${Math.min(60, i * 16)}%)`);

const testWords = (t: { field: string; is: "gte" | "lte"; value: number } | null) => (t ? `${pillarFieldName(t.field)} ${t.is === "gte" ? "at or above" : "at or below"} ${t.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "No test; theirs to judge");

/** A thesis's receipt (lib/receipts.ts): when the deployment first saw these words, with the fingerprint anyone can check. */
function ReceiptLine({ r, link }: { r: Receipt | null; link: boolean }) {
  if (!r) return null;
  const words = `Sealed ${longDate(r.sealedAt.slice(0, 10))} · ${r.hash.slice(0, 12)}`;
  return <p className="mt-1 text-caption text-text-tertiary">{link ? <a href={`/receipt/${r.hash}`} className="data underline-offset-4 hover:underline">{words}</a> : <span className="data">{words}</span>}: these words existed by then, unchanged.</p>;
}

const pctOr = (v: number | null, none: string) => (v === null ? none : `${Math.round(v)}%`);

/**
 * The recruiter view (Hamza, 9 Nov 2026, the twenty further ways): the
 * person's judgement at a glance, read by the app from their own records and
 * shared only when they tick it. Percent and counts; never an amount, and
 * never the book's return on its own.
 */
function AtAGlance({ j }: { j: NonNullable<CommunityProfile["judgement"]> }) {
  const cells = [
    { label: "Trades with a reason", value: pctOr(j.reasonedPct, "none yet"), detail: `${j.trades} trades in the past year` },
    { label: "Reasons that held against SPY", value: pctOr(j.rightPct, "not judged yet"), detail: "a reasoned buy beat SPY since, a reasoned sale lagged it" },
    { label: "Planned a day ahead", value: pctOr(j.plannedPct, "none yet"), detail: "trades with a plan logged the day before or earlier" },
    { label: "Own valuations that held", value: pctOr(j.calibrationPct, "not judged yet"), detail: `${j.calibrationJudged} judged a year after they were set` },
    { label: "Club competitions", value: String(j.clubCompetitions), detail: j.clubMedianAgainstSpyPts === null ? "none against SPY yet" : `median ${j.clubMedianAgainstSpyPts >= 0 ? "+" : ""}${j.clubMedianAgainstSpyPts.toFixed(1)} pts against SPY` },
  ];
  return (
    <section className="card mb-6 px-4 py-4 sm:px-5" aria-labelledby="glance">
      <h2 id="glance" className="section-header mb-1">At a glance</h2>
      <p className="mb-3 text-footnote text-text-tertiary">How they decide, read by the app from their own records as of {longDate(j.asOf)}: the reasons, the planning and the valuations, scored on what happened next.</p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cells.map((c) => (
          <div key={c.label} className="rounded-lg border border-hairline px-3 py-2">
            <dt className="text-caption text-text-tertiary">{c.label}</dt>
            <dd className="data text-title3 font-semibold">{c.value}</dd>
            <dd className="text-caption text-text-secondary">{c.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * A shared card as a page: the head (avatar, name, methodology and where it
 * came from, the track record with its streak), what is shared, the
 * portfolio in percent and the theses with their receipts. The Community
 * profile page and the card's own link (a mentor's view) draw it alike.
 */
export function ProfileBody({ p, link, follow }: { p: CommunityProfile; link: boolean; follow?: ReactNode }) {
  const classes = [...new Set(p.weights.map((w) => w.classLabel ?? "No class"))];
  const colorOf = (label: string | null) => (label ? CLASS_PALETTE[classes.indexOf(label) % CLASS_PALETTE.length] : "var(--arch-none)");
  const counts = new Map<string, number>();
  const slices: Slice[] = p.weights.map((w) => {
    const g = w.classLabel ?? "No class";
    const i = counts.get(g) ?? 0;
    counts.set(g, i + 1);
    return { key: w.symbol, label: w.symbol, value: w.weightPct, color: step(colorOf(w.classLabel), i), group: g, detail: w.name ?? undefined };
  });
  const shown = p.weights.reduce((t, w) => t + w.weightPct, 0);
  if (shown < 99.5) slices.push({ key: "rest", label: "Cash and the rest", value: Math.max(0, 100 - shown), color: "var(--text-tertiary)", group: "Rest", detail: "cash, deposits and anything not listed" });
  const legend: LegendItem[] = classes.map((c) => ({ label: c, color: colorOf(c === "No class" ? null : c), kind: "rect" }));
  return (
    <>
        {/* The profile's head, after Blossom's (Hamza, 6 Nov 2026): avatar, name, handle, line, methodology, what they share, their largest holdings. */}
        <section className="card mb-6 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={p.name} handle={p.handle} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-title3 font-semibold">{p.name}</p>
              <p className="data text-footnote text-text-tertiary">@{p.handle}</p>
              {p.methodology ? <p className="mt-1 text-footnote text-text-secondary">Invests by {p.methodology}{p.methodologyFrom ? `, forked from ${p.methodologyFrom}` : ""}{p.family ? ` · ${FAMILY_LABEL[p.family]}` : ""}</p> : null}
            </div>
            {follow}
          </div>
          {p.about ? <p className="mt-3 text-body text-text-secondary">{p.about}</p> : null}
          {p.record ? <RecordLine record={p.record} /> : null}
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-footnote">
            <div className="flex items-baseline gap-1.5">
              <dt className="sr-only">Stock theses</dt>
              <dd className="data font-semibold">{p.stocks.length}</dd>
              <span className="text-text-secondary">stock {p.stocks.length === 1 ? "thesis" : "theses"}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="sr-only">Market theses</dt>
              <dd className="data font-semibold">{p.markets.length}</dd>
              <span className="text-text-secondary">market {p.markets.length === 1 ? "thesis" : "theses"}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt className="sr-only">Holdings</dt>
              <dd className="data font-semibold">{p.weights.length}</dd>
              <span className="text-text-secondary">{p.weights.length === 1 ? "holding" : "holdings"}</span>
            </div>
          </dl>
          {p.weights.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {topHoldings(p).map((c) => (
                <Chip key={c.symbol} chip={c} link={link} />
              ))}
            </div>
          ) : null}
        </section>
        {p.judgement ? <AtAGlance j={p.judgement} /> : null}
        <p className="mb-6 px-1 text-footnote text-text-tertiary">
          Shared by {p.name}, as of {longDate(p.updatedAt.slice(0, 10))}: {p.sharing.theses ? "their theses" : ""}{p.sharing.theses && p.sharing.weights ? " and " : ""}{p.sharing.weights ? "their weights in percent" : ""}, kept in step with their files.
          {p.changed && daysBetween(p.changed.at.slice(0, 10), localDay()) < CHANGE_NOTICE_DAYS && p.changed.at.slice(0, 10) <= localDay() ? ` Changed ${longDate(p.changed.at.slice(0, 10))}: ${[p.changed.theses.length ? `theses ${p.changed.theses.slice(0, 8).join(", ")}` : null, p.changed.weights ? "the weights" : null].filter(Boolean).join(" and ")}.` : ""}
          {" "}Not investment advice, theirs or anyone&rsquo;s.
        </p>

        {p.sharing.rules && p.rules.length ? (
          <ListSection header={`Their rules · ${p.methodology ?? "their methodology"}`} footer="The methodology's rules in its own words, shared for an adviser or a mentor to read beside the record. The app holds the book to them; the figures stay theirs.">
            {p.rules.map((r, i) => (
              <ListRow key={`${r.section}-${i}`} wrap label={r.text} detail={`§${r.section} · ${r.severity === "breach" ? "a hard limit" : r.severity === "guideline" ? "a guideline" : "a level to be told of"}`} />
            ))}
          </ListSection>
        ) : null}

        {p.sharing.weights ? (
          <section id="portfolio" className="mb-8 scroll-mt-20">
            <h2 className="section-header mb-2 px-1">Portfolio</h2>
            {p.weights.length ? (
              <>
                <Donut title="Portfolio by holding" subtitle={`Weight of their book, in percent${p.asOf ? `, at ${longDate(p.asOf)}` : ""}; coloured by the class their methodology gives it.`} slices={slices} legend={legend} centre={{ value: String(p.weights.length), label: p.weights.length === 1 ? "holding" : "holdings" }} tableCaption="Each holding's weight and class" tableHead={["Holding", "Weight", "Class", "Name"]} />
                <ListSection grid className="mt-3" footer="Percent of their book. The amounts behind them were never shared.">
                  {p.weights.map((w) => (
                    <ListRow key={w.symbol} wrap label={<span className="flex flex-wrap items-center gap-2"><span className="data font-semibold">{w.symbol}</span>{w.name && w.name !== w.symbol ? <span className="text-text-secondary">{w.name}</span> : null}</span>} detail={w.classLabel ?? undefined} value={<span className="data">{pct(w.weightPct, 2)}</span>} />
                  ))}
                </ListSection>
              </>
            ) : (
              <ListSection>
                <ListRow wrap label="No weights shared" />
              </ListSection>
            )}
          </section>
        ) : null}

        {p.sharing.theses ? (
          <>
            <section className="mb-8">
              <h2 className="section-header mb-2 px-1">Market theses · {p.markets.length}</h2>
              {p.markets.length ? (
                p.markets.map((m) => (
                  <div key={m.id} id={`market-${m.id}`} className="card mb-3 scroll-mt-20 px-4 py-4">
                    <p className="font-semibold">{m.title}</p>
                    {paragraphsOf(m.text).map((x, i) => (
                      <p key={i} className="mt-2 text-body">
                        {x}
                      </p>
                    ))}
                    {m.pillars.length ? (
                      <ul className="mt-3 space-y-1.5">
                        {m.pillars.map((pl, i) => (
                          <li key={i} className="text-subhead">
                            <span className="font-medium">{pl.name}</span>
                            {pl.text ? <span className="text-text-secondary"> {pl.text}</span> : null} <span className="text-caption text-text-tertiary">{testWords(pl.test)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {m.watch.length ? <p className="mt-3 text-footnote text-text-secondary">Watch: {m.watch.join(" · ")}</p> : null}
                    <p className="mt-2 text-caption text-text-tertiary">Updated {longDate(m.updatedAt.slice(0, 10))}</p>
                    <ReceiptLine r={m.receipt} link={link} />
                  </div>
                ))
              ) : (
                <ListSection>
                  <ListRow wrap label="No market thesis shared" />
                </ListSection>
              )}
            </section>
            <section className="mb-8">
              <h2 className="section-header mb-2 px-1">Stock theses · {p.stocks.length}</h2>
              {p.stocks.length ? (
                p.stocks.map((t) => (
                  <div key={t.symbol} id={`thesis-${t.symbol}`} className="card mb-3 scroll-mt-20 px-4 py-4">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="data font-semibold">{t.symbol}</span>
                      {p.weights.find((w) => w.symbol === t.symbol) ? <StatusPill tone="neutral">{pct(p.weights.find((w) => w.symbol === t.symbol)!.weightPct, 1)} of their book</StatusPill> : null}
                    </p>
                    {paragraphsOf(t.text).map((x, i) => (
                      <p key={i} className="mt-2 text-body">
                        {x}
                      </p>
                    ))}
                    {t.pathway ? <p className="mt-2 text-footnote text-text-secondary">Pathway: {t.pathway}</p> : null}
                    {t.pillars.length ? (
                      <ul className="mt-3 space-y-1.5">
                        {t.pillars.map((pl, i) => (
                          <li key={i} className="text-subhead">
                            <span className="font-medium">{pl.name}</span>
                            {pl.text ? <span className="text-text-secondary"> {pl.text}</span> : null} <span className="text-caption text-text-tertiary">{testWords(pl.test)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {t.watch.length ? <p className="mt-3 text-footnote text-text-secondary">Watch: {t.watch.join(" · ")}</p> : null}
                    <p className="mt-2 text-caption text-text-tertiary">Updated {longDate(t.updatedAt.slice(0, 10))}</p>
                    <ReceiptLine r={t.receipt} link={link} />
                  </div>
                ))
              ) : (
                <ListSection>
                  <ListRow wrap label="No stock thesis shared" />
                </ListSection>
              )}
            </section>
          </>
        ) : null}
    </>
  );
}
