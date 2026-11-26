import { Users } from "lucide-react";
import type { Route } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { ActionButton } from "@/components/app/action-button";
import { ActionForm } from "@/components/app/action-form";
import { CopyButton } from "@/components/app/copy-button";
import { SampleNote } from "@/components/app/sample-note";
import { ScreenFreshness } from "@/components/app/screen-freshness";
import { FamilySection, type FamilyGroup } from "@/components/community/family";
import { FeedCard, PersonCard } from "@/components/community/feed";
import { FollowButton } from "@/components/community/follow-button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow, ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { badgeSnippets } from "@/lib/badge";
import { companyHref } from "@/lib/company";
import { slotsOn } from "@/lib/screens";
import { CHANGE_NOTICE_DAYS, communityFeed, communityIndex, handleFrom, INDEX_MIN_HOLDERS, matchesSearch, POOL_MIN_PEOPLE, pooledBenchmarks, splitFollowing, summaryOf, type CommunityProfile, type ProfileSummary } from "@/lib/community";
import { FAMILY_LABEL } from "@/lib/research";
import { cn } from "@/lib/utils";
import { localDay, daysBetween, longDate } from "@/lib/time";
import { communityFor, screen } from "@/lib/workspace";

import { cardLinkAction, dropCardLinkAction, shareAction, stopSharingAction } from "./actions";

export const metadata = { title: "Community · Invariant" };

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body text-text";

/** What a card changed lately, for the row under it: the theses by symbol or title and the weights, within the week followers are told of it. */
function changedWords(p: CommunityProfile | undefined, today: string): string | null {
  const c = p?.changed;
  if (!c) return null;
  const day = c.at.slice(0, 10);
  if (day > today || daysBetween(day, today) >= CHANGE_NOTICE_DAYS) return null;
  const parts = [c.theses.length ? `theses: ${c.theses.slice(0, 6).join(", ")}${c.theses.length > 6 ? ` and ${c.theses.length - 6} more` : ""}` : null, c.weights ? "weights" : null].filter(Boolean);
  return parts.length ? `Changed ${longDate(day)}: ${parts.join("; ")}.` : null;
}

const shareWords = (p: ProfileSummary) => [p.stocks ? `${p.stocks} stock ${p.stocks === 1 ? "thesis" : "theses"}` : null, p.markets ? `${p.markets} market ${p.markets === 1 ? "thesis" : "theses"}` : null, p.weights ? `${p.weights} weights` : null].filter(Boolean).join(", ") || "nothing yet";

/**
 * Community (Hamza, 18 Oct 2026; laid out after Blossom, 6 Nov 2026): a feed
 * of what the people sharing wrote and moved, For you or Following, with a
 * search by person or ticker; beside it the companies most held together, the
 * people to follow with their largest holdings, and the person's own card.
 * What is shared is listed in full; an amount, an account or a valuation
 * never leaves the vault. No post, like or comment is kept: the feed is the
 * shared cards themselves.
 */
export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 40);
  const tab = sp.tab === "following" ? "following" : "everyone";
  const ws = await screen("overview");
  const { profiles, mine, available, error } = await communityFor(ws);
  const summaries = profiles.map(summaryOf);
  const { followed, others, gone } = splitFollowing(summaries, ws.preferences.following);
  const demo = ws.mode === "demo";
  const today = localDay();
  const byHandle = new Map(profiles.map((p) => [p.handle, p]));
  // What the people sharing hold together (Hamza, 23 Oct 2026): only companies five or more of them hold.
  const index = slotsOn("community", ws.shown).includes("community_index") ? communityIndex(profiles) : null;
  const followSet = new Set(ws.preferences.following);
  const feed = communityFeed(tab === "following" ? profiles.filter((p) => followSet.has(p.handle)) : profiles, q);
  const people = [...followed, ...others].map((s) => byHandle.get(s.handle)!).filter((p) => matchesSearch(p, q));
  // How each family of methodologies did, from the records people share (Hamza, 9 Nov 2026); a family with fewer than three is left out.
  const pool = pooledBenchmarks(profiles);
  // The card's own link, for a mentor (Hamza, 9 Nov 2026): read back to its owner alone.
  let cardLink: string | null = null;
  let badge: ReturnType<typeof badgeSnippets> | null = null;
  if (mine && !demo) {
    try {
      const { cardLinkOf } = await import("@/lib/registry");
      const code = await cardLinkOf(ws.operator.email);
      const h = await headers();
      const origin = `https://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost"}`;
      if (code) cardLink = `${origin}/card/${code}`;
      // The verified record badge for a CV (Hamza, 9 Nov 2026, the twenty further ways): a picture of the record served by the same link code.
      if (code) badge = badgeSnippets(origin, code, mine.name);
    } catch {
      cardLink = null;
    }
  }
  // Family accounts (Hamza, 9 Nov 2026): the households the person is in, each member's shared card side by side.
  let family: FamilyGroup[] = [];
  if (slotsOn("community", ws.shown).includes("community_family")) {
    if (demo) {
      // The demo's family keeps the concentration pack: the visitor's row read on the sample book, the others fictional.
      const [{ RULE_PACKS }, { familyRules }] = await Promise.all([import("@/lib/rule-packs"), import("@/lib/households")]);
      const pack = RULE_PACKS[0];
      const mine = ws.book ? familyRules(pack, ws.book, localDay(), ws.setup?.inputs ?? []) : null;
      const sam = { pack: pack.id, asOf: localDay(), rules: pack.rules.map((r, i) => ({ id: r.id, text: r.text, status: i === 0 ? ("near" as const) : ("kept" as const), actual: i === 0 ? "9.4%" : "41.0%" })) };
      family = [{ id: "demo-family", name: "The Rivera family", code: null, pack: pack.id, members: [{ name: "You", you: true, card: profiles[0] ?? null, result: mine }, { name: "Sam", you: false, card: profiles[1] ?? null, result: sam }, { name: "Grandad", you: false, card: null, result: null }] }];
    }
    else {
      try {
        const { registryAvailable, myHouseholds, householdCards } = await import("@/lib/registry");
        if (registryAvailable()) {
          const hs = await myHouseholds(ws.operator.email);
          const read = await Promise.all(hs.slice(0, 3).map((h) => householdCards(h.id, ws.operator.email)));
          family = read.flatMap((r) => (r ? [{ id: r.household.id, name: r.household.name, code: r.code, pack: r.pack, members: r.members }] : []));
        }
      } catch {
        family = [];
      }
    }
  }
  const tabHref = (t: "everyone" | "following") => `/community?${new URLSearchParams({ ...(t === "following" ? { tab: t } : {}), ...(q ? { q } : {}) }).toString()}`.replace(/\?$/, "");
  return (
    <>
      <PageHeader title="Community" fresh={<ScreenFreshness />} subtitle={`${summaries.length} ${summaries.length === 1 ? "person shares" : "people share"} on this deployment · you follow ${followed.length}. Theses in their words and weights in percent; never an amount.`} />
      <PageBody>
        {ws.book && ws.sample ? <SampleNote sample showcase={ws.showcase} asOf={ws.book.asOf} /> : null}
        {error ? <p className="mb-4 px-1 text-footnote text-danger">{error}</p> : null}

        {!available ? (
          <EmptyState icon={Users} title="Not available on this deployment" instruction="The community needs the deployment's registry (DATABASE_URL and REPORT_KEY); the operator sets it up. Everything else in the app works without it." action={null} />
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <form action="/community" method="get" role="search" className="min-w-0 flex-1">
                {tab === "following" ? <input type="hidden" name="tab" value="following" /> : null}
                <label className="sr-only" htmlFor="community-q">
                  Search people or a ticker
                </label>
                <input id="community-q" name="q" defaultValue={q} maxLength={40} placeholder="Search people or a ticker" className="block w-full rounded-full border border-hairline-strong bg-surface-2 px-4 py-2 text-body text-text" />
              </form>
              <nav className="inline-flex rounded-full border border-hairline p-0.5" aria-label="Whose posts">
                {(["everyone", "following"] as const).map((t) => (
                  <a key={t} href={tabHref(t)} aria-current={t === tab ? "page" : undefined} className={cn("rounded-full px-3.5 py-1.5 text-footnote font-medium transition-colors", t === tab ? "bg-text text-bg" : "text-text-secondary hover:text-text")}>
                    {t === "everyone" ? "For you" : `Following · ${followed.length}`}
                  </a>
                ))}
              </nav>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <section aria-label="Feed" className="min-w-0">
                <h2 className="section-header mb-2 px-1">{q ? `Feed · ${q}` : tab === "following" ? "From the people you follow" : "Feed"}</h2>
                {feed.length ? (
                  <div className="space-y-3">
                    {feed.map((it) => (
                      <FeedCard key={it.id} item={it} today={today} link={!demo} />
                    ))}
                  </div>
                ) : (
                  <ListSection>
                    <ListRow wrap label={q ? "Nothing matches" : tab === "following" ? "Nothing from the people you follow yet" : "Nothing shared yet"} detail={q ? "Try a handle, a name or a ticker someone holds." : tab === "following" ? "Follow someone from People and what they write and move shows here." : "Share your own card below and others can follow you."} />
                  </ListSection>
                )}
                <p className="mt-3 px-1 text-caption text-text-tertiary">Each item is a shared thesis, a card&apos;s weights that moved a point or more, or the card itself; in percent, never an amount. Not investment advice, theirs or anyone&apos;s.</p>
              </section>

              <aside className="min-w-0 space-y-6">
                {index ? (
                  <section aria-labelledby="most-held">
                    <h2 id="most-held" className="section-header mb-2 px-1">Most held</h2>
                    <div className="card px-4 py-3">
                      {index.rows.length ? (
                        <ul className="space-y-2.5">
                          {index.rows.slice(0, 10).map((r) => {
                            const label = (
                              <span className="flex min-w-0 items-baseline gap-2">
                                <span className="data font-semibold">{r.symbol}</span>
                                {r.name ? <span className="truncate text-caption text-text-secondary">{r.name}</span> : null}
                              </span>
                            );
                            return (
                              <li key={r.symbol}>
                                <div className="flex items-baseline justify-between gap-3 text-footnote">
                                  {demo ? label : (
                                    <a href={companyHref(r.symbol)} className="min-w-0 hover:text-accent-text">
                                      {label}
                                    </a>
                                  )}
                                  <span className="data shrink-0 text-text-secondary">{r.holders} of {index.people}</span>
                                </div>
                                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                                  <div className="h-full rounded-full" style={{ width: `${Math.max(4, r.holdersPct)}%`, background: "var(--series-hcmp)" }} />
                                </div>
                                <p className="mt-0.5 text-caption text-text-tertiary">{r.avgWeightPct.toFixed(1)}% on average among them · {r.indexWeightPct.toFixed(1)}% of the community index</p>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-footnote text-text-secondary">A company shows here once {INDEX_MIN_HOLDERS} people sharing their weights hold it; {index.people} {index.people === 1 ? "shares" : "share"} weights now.</p>
                      )}
                    </div>
                    <p className="mt-2 px-1 text-caption text-text-tertiary">{`Of the ${index.people} ${index.people === 1 ? "person" : "people"} sharing their weights, how many hold each company. ${index.below ? `${index.below} ${index.below === 1 ? "company is" : "companies are"} held by fewer than ${INDEX_MIN_HOLDERS} and not shown, so no one's weight can be read from it. ` : ""}Never a name or an amount.`}</p>
                  </section>
                ) : null}

                <section aria-labelledby="pooled">
                  <h2 id="pooled" className="section-header mb-2 px-1">How methodologies did</h2>
                  <div className="card px-4 py-3">
                    {pool.rows.length ? (
                      <ul className="space-y-2.5">
                        {pool.rows.map((r) => (
                          <li key={r.family} className="text-footnote">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="font-medium">{FAMILY_LABEL[r.family]}</span>
                              <span className="data text-text-secondary">{r.people} people</span>
                            </div>
                            <p className="mt-0.5 text-caption text-text-secondary">
                              <span className="data">{r.medianTwrPct >= 0 ? "+" : ""}{r.medianTwrPct.toFixed(1)}%</span> median return{r.medianAgainstSpyPts !== null ? `, ${r.medianAgainstSpyPts >= 0 ? "+" : ""}${r.medianAgainstSpyPts.toFixed(1)} pts against SPY` : ""}{r.medianRulesKeptPct !== null ? `, ${Math.round(r.medianRulesKeptPct)}% of rules kept` : ""} · about {Math.round(r.medianDays / 30)} months of record
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-footnote text-text-secondary">A family of methodologies shows here once {POOL_MIN_PEOPLE} people under it share their track record.</p>
                    )}
                  </div>
                  <p className="mt-2 px-1 text-caption text-text-tertiary">Medians of the track records shared on this deployment, by the family each methodology belongs to; each record covers its own days, from its own first statement. {pool.below ? `${pool.below} ${pool.below === 1 ? "family has" : "families have"} fewer than ${POOL_MIN_PEOPLE} and ${pool.below === 1 ? "is" : "are"} not shown. ` : ""}Past results, not a forecast or advice.</p>
                </section>

                <section aria-labelledby="people">
                  <h2 id="people" className="section-header mb-2 px-1">People · {people.length}</h2>
                  <div className="space-y-2">
                    {people.length ? (
                      people.map((p) => <PersonCard key={p.handle} p={p} you={mine?.handle === p.handle} link={!demo} action={mine?.handle === p.handle ? undefined : <FollowButton handle={p.handle} following={followSet.has(p.handle)} />} />)
                    ) : (
                      <ListSection>
                        <ListRow wrap label={q ? "Nobody matches" : "Nobody else is sharing yet"} detail={q ? undefined : mine ? "You are the first." : "Share your own card below and others can follow you."} />
                      </ListSection>
                    )}
                    {gone.map((h) => (
                      <ListSection key={h}>
                        <ListRow wrap label={`@${h}`} detail="No longer sharing." value={<FollowButton handle={h} following />} />
                      </ListSection>
                    ))}
                  </div>
                  <p className="mt-2 px-1 text-caption text-text-tertiary">{demo ? "The demo's people are fictional; following them is kept in this browser." : `Following is kept in your own preferences; nobody is told. When someone you follow changes a thesis, or a weight moves by a point or more, it is on Notifications.`}</p>
                </section>
              </aside>
            </div>

            {slotsOn("community", ws.shown).includes("community_family") ? <FamilySection groups={family} demo={demo} /> : null}

            <section className="mt-8 mb-8">
              <h2 className="section-header mb-2 px-1">Share with the community</h2>
              {mine ? (
                <ListSection footer="The card follows your theses and weights by itself: a thesis written or changed, a document folded in, the morning statement or a new methodology replaces it at once, and the people who follow you are told of a changed thesis or a weight that moved a point or more. Sharing again changes the handle, the name, the line or the choice. Stopping deletes it from the deployment; your handle is free again." className="mb-3">
                  <ListRow wrap label={`You share as @${mine.handle}${mine.sharing.listed ? "" : ", by link only"}`} detail={`${mine.name}. Shares ${shareWords(summaryOf(mine))}${mine.record ? ", the track record" : ""}${mine.asOf ? `, weights at ${longDate(mine.asOf)}` : ""}. Updated ${longDate(mine.updatedAt.slice(0, 10))}.${changedWords(mine, today) ? ` ${changedWords(mine, today)}` : ""}`} value={<ActionButton action={stopSharingAction} label="Stop sharing" variant="ghost" size="sm" doneLabel="Stopped" />} />
                </ListSection>
              ) : null}
              {mine && !demo ? (
                <div className="card mb-3 px-4 py-4">
                  <h3 className="section-header mb-1">A link to your card, for a mentor</h3>
                  <p className="text-subhead text-text-secondary">Anyone with the link reads your card as you share it (your theses, your weights in percent, your track record and its streak) without signing in, whether or not it is listed on Community. Never an amount. A new link stops the old one.</p>
                  {cardLink ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span className="data min-w-0 break-all rounded-control border border-hairline-strong bg-surface-2 px-3 py-1.5 text-footnote">{cardLink}</span>
                      <CopyButton text={cardLink} label="Copy the link" />
                      <ActionButton action={dropCardLinkAction} label="Turn the link off" variant="ghost" size="sm" doneLabel="Off" />
                    </div>
                  ) : null}
                  <div className="mt-3">
                    <ActionButton action={cardLinkAction} label={cardLink ? "Make a new link" : "Make a link"} variant="secondary" size="sm" doneLabel="Made" />
                  </div>
                  {badge ? (
                    <div className="mt-4 border-t border-hairline pt-3">
                      <h3 className="section-header mb-1">Your record badge, for a CV or LinkedIn</h3>
                      <p className="text-subhead text-text-secondary">A small picture of your shared record (its length, the rules kept, the weeks without a breach and the verified mark when you hold it) that opens your card. It follows the card; a new link changes it.</p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={badge.image} alt={`${mine!.name}'s record badge`} width={380} height={64} className="mt-3 max-w-full rounded-md border border-hairline" />
                      <div className="mt-3 flex flex-wrap gap-3">
                        <CopyButton text={badge.markdown} label="Copy for Markdown" />
                        <CopyButton text={badge.html} label="Copy as HTML" />
                        <CopyButton text={badge.link} label="Copy the link" />
                      </div>
                    </div>
                  ) : null}
                  <p className="mt-4 border-t border-hairline pt-3 text-subhead">
                    <Link href={"/community/mentors" as Route} className="text-accent-text">Mentor sessions</Link>
                    <span className="text-text-tertiary"> · </span>
                    <Link href={"/calls" as Route} className="text-accent-text">Public calls</Link>
                  </p>
                </div>
              ) : null}
              {/* Folded shut until opened (Hamza, 23 Oct 2026). */}
              <details className="card px-4 py-3">
                <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-[10px] bg-accent-subtle px-3 text-subhead text-accent-text">{mine ? "Change what you share" : "Share your card"}</summary>
              <ActionForm action={shareAction} label={mine ? "Share again" : "Share"} pendingLabel="Sharing" doneLabel="Shared" className="pt-3 pb-1">
                <p className="text-subhead text-text-secondary">
                  What goes out, and nothing else: your theses in your words (the text, the pillars with their tests, the pathway, the watch items) and each holding&rsquo;s weight of your book in percent, with the class your methodology gives it. Never an amount, an account, your net worth, a valuation, a DCF, a decision, an alert, a statement, or what was added to a thesis. Everyone signed in on this deployment can see it.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block text-subhead">
                    Handle
                    <input name="handle" className={`${field} data`} maxLength={24} defaultValue={mine?.handle ?? handleFrom(ws.operator.name ?? "")} placeholder="quiet-compounder" pattern="[A-Za-z0-9 _-]{2,24}" required disabled={demo} />
                  </label>
                  <label className="block text-subhead">
                    Shown as
                    <input name="name" className={field} maxLength={60} defaultValue={mine?.name ?? ws.operator.name ?? ""} placeholder="A name or a pen name" disabled={demo} />
                  </label>
                </div>
                <label className="mt-3 block text-subhead">
                  A line about how you invest (optional)
                  <input name="about" className={field} maxLength={300} defaultValue={mine?.about ?? ""} disabled={demo} />
                </label>
                <fieldset className="mt-3 flex flex-wrap gap-4 text-subhead">
                  <legend className="sr-only">What to share</legend>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="theses" defaultChecked={mine ? mine.sharing.theses : true} disabled={demo} /> My theses
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="weights" defaultChecked={mine ? mine.sharing.weights : true} disabled={demo} /> My weights, in percent
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="record" defaultChecked={mine ? mine.sharing.record : false} disabled={demo} /> My track record: return since the start against SPY, the rules kept and the weeks without a breach, in percent, read by the app
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="rules" defaultChecked={mine ? mine.sharing.rules : false} disabled={demo} /> My methodology&apos;s rules, in its words: for an adviser or a mentor to read beside the record
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="judgement" defaultChecked={mine ? mine.sharing.judgement : false} disabled={demo} /> My judgement at a glance, for a recruiter: trades with a reason and how they fared, trades planned a day ahead, my valuations judged a year on, my club competitions; percent and counts
                  </label>
                </fieldset>
                <fieldset className="mt-3 flex flex-wrap gap-4 text-subhead">
                  <legend className="mb-1 text-subhead">Who sees it</legend>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="listed" value="everyone" defaultChecked={mine ? mine.sharing.listed : true} disabled={demo} /> Everyone on Community
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="listed" value="link" defaultChecked={mine ? !mine.sharing.listed : false} disabled={demo} /> Only people I give the link to, such as a mentor
                  </label>
                </fieldset>
                <p className="mt-3 mb-3 text-footnote text-text-tertiary">{demo ? "The demo shares nothing; in your own copy this card shares your theses and weights." : "Kept in the deployment's registry under your sign-in while you share; deleted the moment you stop. Not investment advice, yours or anyone's."}</p>
              </ActionForm>
              </details>
            </section>
          </>
        )}
      </PageBody>
    </>
  );
}
