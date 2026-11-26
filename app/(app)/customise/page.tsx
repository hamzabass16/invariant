import { ActionButton } from "@/components/app/action-button";
import { AskClaudeCard } from "@/components/app/ask-claude";
import { askState } from "@/lib/ask-claude-run";
import { ActionForm } from "@/components/app/action-form";
import { navFor } from "@/components/app/nav-items";
import { FigureBuilder, HeadlineForm, HiddenRow, RecordForm, RemoveFigure, RemoveRecord, ScreenOrder, ThemeChoice } from "@/components/customise/controls";
import { DataBuilder, DataRowActions } from "@/components/custom-data/data-builder";
import { FigureTile } from "@/components/dashboard/figure";
import { ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { DATA_FORMAT_LABEL, DATA_REFRESH_LABEL, DATA_SCREEN_LABEL, DATA_SCREENS, formatData, MAX_DATA, sourceWords } from "@/lib/custom-data";
import { money } from "@/lib/holdings";
import { computeFigure, contextFor, dashboardFor } from "@/lib/methodology";
import { DEFAULT_PRACTICES, PRACTICE_ABOUT, PRACTICES } from "@/lib/ontology";
import { dashboardWith, NEVER_HIDDEN, orderNav } from "@/lib/preferences";
import { exprWords } from "@/lib/recipes";
import { practicesOf } from "@/lib/screens";
import { localDay } from "@/lib/time";
import { SECTORS } from "@/lib/sectors";
import { screen } from "@/lib/workspace";

import { practiceAction, resetHeadlineAction, resetNavAction } from "./actions";

export const metadata = { title: "Customise · Invariant" };

/** Adding data reads it at once; a Claude reading searches the web first. */
export const maxDuration = 300;

/**
 * How the person arranges the app for themselves: theme, the order and
 * visibility of screens, the pages they add, the tiles that lead the
 * Dashboard, figures they build
 * over the ontology, and what they record about their holdings. Everything is
 * kept in their own vault (a cookie in the demo) and never touches the
 * methodology.
 */
export default async function CustomisePage() {
  const ws = await screen("setup");
  const dataAsk = await askState(ws);
  const { setup, book, preferences: prefs } = ws;
  const today = localDay();
  const all = navFor(ws.modules, ws.screens);
  const visible = orderNav(all, prefs);
  const hidden = all.filter((n) => !visible.some((v) => v.href === n.href));
  const base = dashboardFor(setup.profile, ws.modules, setup.methodology);
  const { figures, dashboard, custom } = dashboardWith(base.figures, base.dashboard, prefs);
  const tiles = figures.filter((f) => f.view === "tile").map((f) => ({ id: f.id, label: f.label, custom: custom.some((c) => c.id === f.id) }));
  const ctx = book ? contextFor(book, today, setup.methodology) : null;
  const recordable = book ? book.holdings.filter((h) => !["cash", "option"].includes(h.assetClass)).map((h) => ({ symbol: h.symbol, name: h.name })).filter((h, i, arr) => arr.findIndex((x) => x.symbol === h.symbol) === i) : [];
  const records = Object.entries(ws.records.bySymbol);
  const asked = practicesOf(setup.methodology);

  return (
    <>
      <PageHeader title="Customise" subtitle={`Kept in ${ws.mode === "demo" ? "this browser for the demo" : "your own vault"}. Your methodology is untouched.`} />
      <PageBody>
        <section className="mb-8">
          <h2 className="section-header mb-2 px-1">Appearance</h2>
          <ThemeChoice current={prefs.theme} />
        </section>

        <section className="mb-8">
          <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
            <h2 className="section-header">Screens</h2>
            {prefs.navOrder.length || prefs.hidden.length ? <ActionButton action={resetNavAction} label="Reset order" variant="ghost" /> : null}
          </div>
          <ScreenOrder items={visible.map((n) => ({ href: n.href, label: n.label, locked: (NEVER_HIDDEN as readonly string[]).includes(n.href) }))} />
          {hidden.length ? (
            <ListSection header="Hidden" className="mt-4">
              {hidden.map((n) => (
                <HiddenRow key={n.href} href={n.href} label={n.label} />
              ))}
            </ListSection>
          ) : null}
        </section>

        <section className="mb-8 scroll-mt-20" data-tour="practices">
          <h2 className="section-header mb-2 px-1">Pages you can add</h2>
          <ListSection footer="Not every investor keeps these, so each is off until you add it, even when your methodology names it. Each is a page of its own in the top menu and under More. Trades is on for everyone; hide it under Screens.">
            {PRACTICES.filter((p) => !DEFAULT_PRACTICES.includes(p)).map((p) => {
              const byMethodology = asked.includes(p);
              const added = prefs.practices.includes(p);
              return (
                <ListRow
                  key={p}
                  wrap
                  label={PRACTICE_ABOUT[p].label}
                  detail={`${PRACTICE_ABOUT[p].about}${added ? " On." : " Off."}${byMethodology ? " Your methodology names it." : ""}`}
                  trailing={
                    <ActionForm action={practiceAction} label={added ? "Remove" : "Add"} variant={added ? "ghost" : "secondary"} size="sm">
                      <input type="hidden" name="practice" value={p} />
                      <input type="hidden" name="how" value={added ? "remove" : "add"} />
                    </ActionForm>
                  }
                />
              );
            })}
          </ListSection>
        </section>

        <section className="mb-8">
          <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
            <h2 className="section-header">Headline on the Dashboard</h2>
            {prefs.headline ? <ActionButton action={resetHeadlineAction} label={setup.methodology ? "Back to the methodology's" : "Back to the default"} variant="ghost" /> : null}
          </div>
          {tiles.length ? <HeadlineForm tiles={tiles} picked={dashboard.headline} /> : <p className="px-1 text-footnote text-text-secondary">No tiles yet.</p>}
        </section>

        <section className="mb-8">
          <h2 className="section-header mb-2 px-1">Your figures</h2>
          {custom.length ? (
            <ListSection footer="Shown on the Dashboard in a section of their own, computed like every other figure.">
              {custom.map((f) => (
                <ListRow
                  key={f.id}
                  wrap
                  label={f.label}
                  detail={exprWords(f.expr) + (f.by ? `, by ${f.by}` : "")}
                  value={ctx ? (() => {
                    const r = computeFigure(f, ctx, setup.inputs);
                    if (r.needs.length) return "waiting";
                    if (r.kind === "scalar") return r.value === null ? "n/a" : f.unit === "money" ? money(r.value, book!.fx.base) : r.value.toFixed(f.unit === "count" ? 0 : 1);
                    return `${r.points.length} rows`;
                  })() : undefined}
                  trailing={<RemoveFigure figure={f} />}
                />
              ))}
            </ListSection>
          ) : null}
          <p className="mb-3 px-1 text-footnote text-text-secondary">Write a recipe in the same language the drafter uses: a measure over your holdings or transactions, a share of net worth, or a statistic of the account&apos;s value. A field no input supplies yet is allowed; the figure then says what it needs.</p>
          <FigureBuilder />
        </section>

        <section id="your-data" className="mb-8 scroll-mt-20">
          <h2 className="section-header mb-2 px-1">Your data</h2>
          {ws.customData.defs.length ? (
            <ListSection footer={ws.mode === "demo" ? "Fictional samples, to show each kind. The demo reads nothing." : "Read again on their own schedule in the morning refresh; a reading that fails keeps the last good one and says why."}>
              {ws.customData.defs.map((d) => {
                const r = ws.customData.readings[d.id];
                const last = r?.points[r.points.length - 1];
                return (
                  <ListRow
                    key={d.id}
                    wrap
                    label={d.name}
                    detail={[`${DATA_FORMAT_LABEL[d.format]} on ${DATA_SCREEN_LABEL[d.screen]}`, sourceWords(d), DATA_REFRESH_LABEL[d.refresh].toLowerCase(), d.source.kind === "api" && d.source.keyIn !== "none" ? "key kept" : null, r?.problem ?? null].filter(Boolean).join(" · ")}
                    value={last ? <span className="data">{d.format === "number" ? formatData(last.value, d.unit) : `${r!.points.length} points`}</span> : "waiting"}
                    trailing={<DataRowActions id={d.id} name={d.name} demo={ws.mode === "demo"} />}
                  />
                );
              })}
            </ListSection>
          ) : null}
          <p className="mb-3 px-1 text-footnote text-text-secondary">
            Add a figure or a series of your own: from a public API you point at{ws.askClaude ? "" : ", or fetched by the AI from the web"}. It sits on the screen you choose, read again as often as you say, {MAX_DATA} at most. Not part of your methodology: a rule never reads it.
          </p>
          {ws.customData.defs.length < MAX_DATA ? <DataBuilder screens={DATA_SCREENS.filter((s) => ws.screens.includes(s))} claudeReady={ws.mode === "demo" || ws.provider?.kind === "anthropic"} apiOnly={ws.askClaude} /> : null}
          {ws.askClaude ? <AskClaudeCard feature="add_data" connected={dataAsk.connected} demo={ws.mode === "demo"} className="card mt-3" /> : null}
        </section>

        {book ? (
          <section className="mb-8">
            <h2 className="section-header mb-2 px-1">Your records</h2>
            {records.length ? (
              <ListSection footer="Laid over the holdings whenever the book is read; a broker never supplies these.">
                {records.map(([symbol, r]) => (
                  <ListRow
                    key={symbol}
                    wrap
                    label={symbol}
                    detail={[r.sector ? `Sector ${r.sector}` : null, r.ownValuation ? `Own valuation ${r.ownValuation.low ?? "–"} / ${r.ownValuation.base} / ${r.ownValuation.high ?? "–"} as of ${r.ownValuation.asOf}${r.ownValuation.basis ? ` (${r.ownValuation.basis})` : ""}` : null, r.since ? `Since ${r.since}` : null, r.note].filter(Boolean).join(" · ")}
                    trailing={<RemoveRecord symbol={symbol} />}
                  />
                ))}
              </ListSection>
            ) : null}
            {recordable.length ? <RecordForm symbols={recordable} asOf={book.asOf} sectors={SECTORS} /> : <p className="px-1 text-footnote text-text-secondary">Records attach to shares, funds, bonds and property; none in the book yet.</p>}
          </section>
        ) : null}

        {ctx && custom.length ? (
          <section className="mb-8">
            <h2 className="section-header mb-2 px-1">Preview</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {custom
                .filter((f) => f.view === "tile")
                .map((f) => (
                  <FigureTile key={f.id} figure={f} result={computeFigure(f, ctx, setup.inputs)} ccy={book!.fx.base} />
                ))}
            </div>
          </section>
        ) : null}
      </PageBody>
    </>
  );
}
