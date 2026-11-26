import Link from "next/link";

import { ActionForm } from "@/components/app/action-form";
import { ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { badgeOf } from "@/lib/community";
import { companyHref } from "@/lib/company";
import { creedMethodWords, fundNameOf, fundThesisTaken, themeLabel } from "@/lib/fund-creeds";
import { listingFrom, listingWords, marketOrder, PACK_MAX_RULES, packListingSchema, type ListingView, type PackListingView } from "@/lib/marketplace";
import { RULE_PACKS } from "@/lib/rule-packs";
import { longDate } from "@/lib/time";
import { fundCreedsFor, fundsFor, sampleMethodology, SAMPLE_IDS, screen, thesesFor } from "@/lib/workspace";

import { takeFundThesisAction } from "../../theses/actions";
import { adoptFundAction, adoptListingAction, adoptPackAction, listPackAction, setShadowAction, unlistPackAction } from "../actions";

export const maxDuration = 300;
export const metadata = { title: "Marketplace · Invariant" };

/** The demo's shelf: its fictional sample methodologies under fictional names, adopted a made-up number of times. */
const DEMO_CREDITS: Record<(typeof SAMPLE_IDS)[number], { credit: string; adopters: number }> = {
  individual: { credit: "M. Okafor", adopters: 41 },
  dividend_growth: { credit: "Lena R.", adopters: 27 },
  family_office: { credit: "Harbour Family Office", adopters: 9 },
};

function demoShelf(): ListingView[] {
  return SAMPLE_IDS.map((id) => ({ ...listingFrom({ ...sampleMethodology({ sample: id, drop: [] }), adopted: "2026-09-01" }, { id: `demo-${id.replace(/_/g, "-")}`, credit: DEMO_CREDITS[id].credit, now: "2026-11-01T00:00:00.000Z" }), adopters: DEMO_CREDITS[id].adopters, mine: false }));
}

/** The demo's packs: fictional analysts, the ready-made packs' own rules. */
function demoPacks(): PackListingView[] {
  return [
    { ...packListingSchema.parse({ id: "demo-tight-book", name: "Tight book", about: "Concentration limits from a fictional analyst who runs fifteen stocks.", credit: "R. Haddad", handle: "patient-capital", figures: RULE_PACKS[0].figures, rules: RULE_PACKS[0].rules, listedAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" }), adopters: 12, mine: false },
    { ...packListingSchema.parse({ id: "demo-cash-floor", name: "Cash floor", about: "Never fully invested, never sitting in cash.", credit: "S. Lindqvist", handle: "toll-roads", figures: RULE_PACKS[3].figures, rules: RULE_PACKS[3].rules, listedAt: "2026-10-28T00:00:00.000Z", updatedAt: "2026-10-28T00:00:00.000Z" }), adopters: 4, mine: false },
  ];
}

/**
 * The methodology marketplace (Hamza, 9 Nov 2026, "Listing now, royalties
 * later"): the methodologies people listed, rules only, the most adopted
 * first; adopting one makes a draft credited to its author.
 */
export default async function MarketPage() {
  const ws = await screen("methodology");
  let shelf: ListingView[] = [];
  let packs: PackListingView[] = [];
  let verified = false;
  let problem: string | null = null;
  if (ws.mode === "demo") {
    shelf = demoShelf();
    packs = demoPacks();
  } else {
    try {
      const { registryAvailable, marketListings, packListings, myProfile } = await import("@/lib/registry");
      if (registryAvailable()) {
        shelf = await marketListings(ws.operator.email);
        packs = await packListings(ws.operator.email);
        const card = await myProfile(ws.operator.email);
        verified = !!card && badgeOf(card.sharing.record ? card.record : null).verified;
      }
      if (!registryAvailable()) problem = "The marketplace needs the deployment's registry, which is not set up here.";
    } catch {
      problem = "The marketplace could not be read just now.";
    }
  }
  const rows = marketOrder(shelf);
  // What the top funds say they do and the theses they state (lib/fund-creeds.ts), read once a quarter for everyone.
  const [{ creeds, error: creedError }, { file: fundsFile }, { file: theses }] = await Promise.all([fundCreedsFor(ws), fundsFor(ws), thesesFor(ws)]);
  const funds = Object.values(creeds)
    .filter((c) => !c.error && c.summary)
    .map((c) => ({ creed: c, fund: fundNameOf(c.id, fundsFile) }))
    .filter((r): r is { creed: typeof r.creed; fund: NonNullable<typeof r.fund> } => !!r.fund)
    .sort((a, b) => a.fund.name.localeCompare(b.fund.name));
  const fundTheses = funds.flatMap(({ creed, fund }) => creed.theses.map((t, i) => ({ t, i, fund, taken: fundThesisTaken(theses, t) }))).sort((a, b) => (b.t.source.date ?? "").localeCompare(a.t.source.date ?? "") || a.t.title.localeCompare(b.t.title));
  const demo = ws.mode === "demo";
  return (
    <>
      <PageHeader title="Marketplace" subtitle="Methodologies and theses to adopt as your own: listed by people who invest by them, and stated by the top funds in their own words. Free for now." />
      <PageBody>
        <p className="mb-6 px-1 text-footnote">
          <Link href="/methodology" className="text-accent-text underline-offset-4 hover:underline">
            Your methodology
          </Link>
          {" "}· list yours there.
        </p>
        {problem ? <p className="card mb-6 px-4 py-4 text-subhead text-text-secondary">{problem}</p> : null}
        <ListSection grid header={`${rows.length} listed`} footer="Each listing is the author's figures, classes and rules, never a holding, an amount or their document. Adopting one makes a draft you check, trim and confirm; it stays credited to its author through every change you make. Not investment advice.">
          {rows.map((l) => (
            <ListRow
              key={l.id}
              wrap
              label={
                <span>
                  {l.name} <span className="text-text-tertiary">by {l.credit}</span>
                </span>
              }
              detail={`${l.summary} ${listingWords(l)}${l.family ? ` · ${l.family}` : ""} · updated ${longDate(l.updatedAt.slice(0, 10))}${l.methodology.lineage ? ` · forked from ${l.methodology.lineage.parent}` : ""}`}
              value={
                <span className="flex flex-col items-start gap-2">
                  <span className="data text-footnote text-text-secondary">{`${l.adopters} ${l.adopters === 1 ? "adoption" : "adoptions"}`}</span>
                  {l.mine ? (
                    <span className="text-footnote text-text-tertiary">Yours</span>
                  ) : (
                    <>
                      <ActionForm action={adoptListingAction} label="Adopt as a draft" pendingLabel="Adopting" doneLabel="Draft ready" doneHref="/methodology" variant="secondary" size="sm">
                        <input type="hidden" name="listing" value={l.id} />
                      </ActionForm>
                      {ws.mode === "drive" ? (
                        <ActionForm action={setShadowAction} label="Run beside mine" pendingLabel="Reading" doneLabel="Running" doneHref="/methodology?view=shadow" variant="ghost" size="sm">
                          <input type="hidden" name="shadow" value={`market:${l.id}`} />
                        </ActionForm>
                      ) : null}
                    </>
                  )}
                </span>
              }
            />
          ))}
          {!rows.length && !problem ? <ListRow wrap label="Nothing listed yet" detail="Be the first: list the methodology you invest by on Methodology." /> : null}
        </ListSection>
        <ListSection grid className="mt-8" header={`Packs from verified analysts: ${packs.length}`} footer={`A few rules from a verified analyst's own methodology, with the figures they test, laid on yours as a draft you confirm. Only an author whose shared record carries the verified mark can list one, ${PACK_MAX_RULES} rules at most.`}>
          {packs.map((p) => (
            <ListRow
              key={p.id}
              wrap
              label={
                <span>
                  {p.name} <span className="text-text-tertiary">by {p.credit}</span>
                </span>
              }
              detail={`${p.about} ${p.rules.map((r) => r.text).join(" ")} · ${p.adopters} ${p.adopters === 1 ? "adoption" : "adoptions"}`}
              value={
                p.mine ? (
                  <ActionForm action={async () => unlistPackAction()} label="Unlist" variant="ghost" size="sm" doneLabel="Unlisted">
                    <span />
                  </ActionForm>
                ) : (
                  <ActionForm action={adoptPackAction} label="Add to my rules" pendingLabel="Adding" doneLabel="Draft ready" doneHref="/methodology" variant="secondary" size="sm">
                    <input type="hidden" name="pack" value={p.id} />
                  </ActionForm>
                )
              }
            />
          ))}
          {!packs.length && !problem ? <ListRow wrap label="No pack listed yet" detail="A verified analyst lists one below." /> : null}
        </ListSection>
        {ws.mode === "drive" && ws.setup?.methodology ? (
          <section className="card mt-6 px-4 py-4">
            <h2 className="section-header mb-1">List some of your rules as a pack</h2>
            {verified ? (
              <ActionForm action={listPackAction} label="List the pack" pendingLabel="Listing" doneLabel="Listed">
                <label className="block text-subhead">
                  Its name
                  <input name="name" maxLength={60} className="mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body" />
                </label>
                <label className="mt-2 block text-subhead">
                  What it keeps, in a line
                  <input name="about" maxLength={300} className="mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body" />
                </label>
                <fieldset className="mt-3 mb-3 space-y-1 text-subhead">
                  <legend className="mb-1">The rules, those the app tests ({PACK_MAX_RULES} at most)</legend>
                  {ws.setup.methodology.rules.filter((r) => r.test).map((r) => (
                    <label key={r.id} className="flex items-start gap-2">
                      <input type="checkbox" name="rule" value={r.id} className="mt-1" /> <span>{r.section}: {r.text}</span>
                    </label>
                  ))}
                </fieldset>
              </ActionForm>
            ) : (
              <p className="text-subhead text-text-secondary">Packs are listed by verified analysts: share your track record on Community, and once it carries the verified mark you can list rules here.</p>
            )}
          </section>
        ) : null}
        <ListSection grid header="From the top funds" footer={`${creedError ? `${creedError} ` : ""}How each fund says it invests, read once a quarter from its own letters, site and filings. Adopting one makes a draft on your own figures and dashboard: each figure it looks for is a guideline for you to check, and only the levels it states become a class. Credited to the fund; its words, not its holdings.`}>
          {funds.map(({ creed: c, fund }) => (
            <ListRow
              key={fund.id}
              wrap
              label={
                <span>
                  {fund.name} <span className="text-text-tertiary">· {fund.manager}</span>
                </span>
              }
              detail={`${c.summary} ${creedMethodWords(c)} · read ${longDate(c.readAt.slice(0, 10))}`}
              value={
                <ActionForm action={adoptFundAction} label="Adopt as a draft" pendingLabel="Adopting" doneLabel="Draft ready" doneHref="/methodology" variant="secondary" size="sm">
                  <input type="hidden" name="fund" value={fund.id} />
                </ActionForm>
              }
            />
          ))}
          {!funds.length ? <ListRow wrap label="No fund read yet" detail="Each fund's own words are read once a quarter, a few each morning." /> : null}
        </ListSection>
        <ListSection grid header="Theses the top funds state" footer="Each from a fund's newest letters or talks, in the app's words, with its page. Taking one in starts your thesis with the fund's words, credited, or adds them as an entry on the thesis you have; a company you neither hold nor watch joins your watchlist. Not investment advice.">
          {fundTheses.map(({ t, i, fund, taken }) => (
            <ListRow
              key={`${fund.id}-${i}`}
              wrap
              label={
                <span>
                  {t.title} <span className="text-text-tertiary">· {fund.name}</span>
                </span>
              }
              detail={
                <span>
                  {t.ticker && !demo ? (
                    <a href={companyHref(t.ticker)} className="text-accent-text">
                      {t.ticker}
                    </a>
                  ) : (
                    (t.ticker ?? (t.theme ? themeLabel(t.theme) : ""))
                  )}
                  {` · ${t.words} `}
                  <a href={t.source.url} target="_blank" rel="noopener noreferrer" className="text-accent-text underline-offset-4 hover:underline">
                    {t.source.title}
                  </a>
                  {t.source.date ? ` · ${longDate(t.source.date)}` : ""}
                </span>
              }
              value={
                taken ? (
                  <span className="text-footnote text-text-tertiary">In your theses</span>
                ) : (
                  <ActionForm action={takeFundThesisAction} label="Add to my theses" pendingLabel="Adding" doneLabel="Added" doneHref={t.ticker ? `/theses/${encodeURIComponent(t.ticker)}` : "/theses"} variant="secondary" size="sm">
                    <input type="hidden" name="fund" value={fund.id} />
                    <input type="hidden" name="thesis" value={String(i)} />
                  </ActionForm>
                )
              }
            />
          ))}
          {!fundTheses.length ? <ListRow wrap label="No stated thesis yet" detail="The theses come with each fund's reading." /> : null}
        </ListSection>
      </PageBody>
    </>
  );
}
