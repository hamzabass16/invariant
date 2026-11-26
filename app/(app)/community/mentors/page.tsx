import type { Route } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/app/action-form";
import { ListSection } from "@/components/ui/list";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status";
import { badgeOf } from "@/lib/community";
import { MAX_OPEN_ASKS, MAX_REVIEW_CHARS, mentorsSampleSchema, openOffers, type MentorAskView, type MentorOffer } from "@/lib/mentors";
import { longDate } from "@/lib/time";
import { communityFor, screen } from "@/lib/workspace";

import { answerMentorAction, askMentorAction, mentorOfferAction } from "../actions";

export const metadata = { title: "Mentor sessions · Community · Invariant" };

const field = "mt-1 block w-full rounded-control border border-hairline-strong bg-surface-2 px-3 py-2 text-body";

/**
 * Mentor sessions (Hamza, 9 Nov 2026, the twenty further ways): verified
 * analysts offer to review a member's theses and record; a member asks, the
 * mentor reads the member's card through its private link and writes the
 * review back. Free while payments wait; an offer may show its later price.
 */
export default async function MentorsPage() {
  const ws = await screen("overview");
  const demo = ws.mode === "demo";
  let offers: MentorOffer[] = [];
  let mine: MentorOffer | null = null;
  let asks: MentorAskView[] = [];
  let problem: string | null = null;
  const card = demo ? null : ((await communityFor(ws)).mine ?? null);
  if (demo) {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const s = mentorsSampleSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "data/samples", "mentors.json"), "utf8")));
    offers = s.offers;
    asks = s.asks;
  } else {
    try {
      const { registryAvailable, mentorOffers, mentorAsksOf } = await import("@/lib/registry");
      if (!registryAvailable()) problem = "Mentor sessions need the deployment's registry, which is not set up.";
      else {
        const read = await mentorOffers(ws.operator.email);
        offers = read.offers;
        mine = read.mine;
        asks = await mentorAsksOf(ws.operator.email);
      }
    } catch {
      problem = "The mentors could not be read just now.";
    }
  }
  const shelf = openOffers(offers);
  const verified = card ? badgeOf(card.sharing.record ? card.record : null) : null;
  const asking = asks.filter((a) => a.side === "member");
  const asked = asks.filter((a) => a.side === "mentor");
  return (
    <>
      <PageHeader title="Mentor sessions" subtitle="A verified analyst reads your card and writes back" action={<Link href={"/community" as Route} className="text-subhead text-accent-text">Community</Link>} />
      <PageBody>
        <p className="mb-6 px-1 text-subhead text-text-secondary">A mentor carries the verified mark: a shared track record long enough, rules kept and weeks without a breach. Ask one and they read your card (your theses, weights in percent and record) through its private link, then write a review back here. Free for now; an offer may say what a session will cost once payments are on. Not investment advice.</p>
        {problem ? <p className="mb-6 card px-4 py-4 text-subhead text-text-secondary">{problem}</p> : null}
        <ListSection header="Mentors" grid footer={shelf.length ? `Ask at most ${MAX_OPEN_ASKS} at once.` : undefined}>
          {shelf.length ? (
            shelf.map((o) => (
              <article key={o.handle} className="card px-4 py-4">
                <p className="text-headline">
                  <Link href={`/community/${o.handle}` as Route} className="text-accent-text">{o.name}</Link> <StatusPill tone="ok">Verified</StatusPill>
                </p>
                <p className="mt-1 text-subhead text-text-secondary">{o.line}</p>
                {o.focus ? <p className="mt-1 text-footnote text-text-tertiary">Reviews: {o.focus}</p> : null}
                <p className="mt-1 text-footnote text-text-tertiary">Free now{o.laterPriceUsd ? `; $${o.laterPriceUsd} a session once payments are on` : ""}.</p>
                {!demo && card?.handle !== o.handle ? (
                  <ActionForm action={askMentorAction} label="Ask for a review" pendingLabel="Asking" variant="secondary" size="sm" doneLabel="Asked" className="mt-3">
                    <input type="hidden" name="mentor" value={o.handle} />
                    <input type="hidden" name="mentorName" value={o.name} />
                    <label className="mb-2 block text-subhead">
                      What you would like read (optional)
                      <textarea name="note" rows={2} maxLength={1000} className={field} />
                    </label>
                  </ActionForm>
                ) : null}
              </article>
            ))
          ) : (
            <p className="px-4 py-4 text-subhead text-text-secondary">No mentor is taking requests yet.</p>
          )}
        </ListSection>
        {asking.length ? (
          <ListSection header="Your requests" className="mt-6">
            {asking.map((a) => (
              <div key={a.id} className="px-4 py-3">
                <p className="text-subhead">
                  {a.mentorName} · {a.status === "asked" ? "waiting" : a.status} · asked {longDate(a.askedAt.slice(0, 10))}
                </p>
                {a.review ? <p className="mt-2 whitespace-pre-line text-body">{a.review}</p> : null}
              </div>
            ))}
          </ListSection>
        ) : null}
        {asked.length ? (
          <ListSection header="Asked of you" className="mt-6">
            {asked.map((a) => (
              <div key={a.id} className="px-4 py-3">
                <p className="text-subhead">
                  {a.member} · {a.status === "asked" ? "waiting for you" : a.status} · asked {longDate(a.askedAt.slice(0, 10))}
                  {a.cardHref ? (
                    <>
                      {" · "}
                      <a href={a.cardHref} className="text-accent-text">Read their card</a>
                    </>
                  ) : null}
                </p>
                {a.note ? <p className="mt-1 text-footnote text-text-secondary">{a.note}</p> : null}
                {a.status === "asked" && !demo ? (
                  <ActionForm action={answerMentorAction} label="Send the review" pendingLabel="Sending" size="sm" doneLabel="Sent" className="mt-2">
                    <input type="hidden" name="id" value={a.id} />
                    <textarea name="review" rows={5} maxLength={MAX_REVIEW_CHARS} className={field} aria-label="Your review" />
                    <label className="my-2 flex items-center gap-2 text-footnote">
                      <input type="checkbox" name="decline" value="yes" /> Decline instead
                    </label>
                  </ActionForm>
                ) : a.review ? (
                  <p className="mt-2 whitespace-pre-line text-body">{a.review}</p>
                ) : null}
              </div>
            ))}
          </ListSection>
        ) : null}
        {!demo ? (
          <section className="mt-6 card px-4 py-4">
            <h2 className="section-header mb-1">Offer reviews</h2>
            {verified?.verified ? (
              <ActionForm action={mentorOfferAction} label={mine ? "Change the offer" : "Offer reviews"} pendingLabel="Saving" doneLabel="Saved">
                <label className="block text-subhead">
                  What you review, in a line
                  <input name="line" className={field} maxLength={300} defaultValue={mine?.line ?? ""} />
                </label>
                <label className="mt-2 block text-subhead">
                  Your focus (optional)
                  <input name="focus" className={field} maxLength={120} defaultValue={mine?.focus ?? ""} />
                </label>
                <label className="mt-2 block text-subhead">
                  Price a session will have once payments are on, in US dollars (optional)
                  <input name="price" inputMode="numeric" className={field} defaultValue={mine?.laterPriceUsd ?? ""} />
                </label>
                <label className="my-2 flex items-center gap-2 text-subhead">
                  <input type="checkbox" name="open" value="yes" defaultChecked={mine ? mine.open : true} /> Taking requests
                </label>
              </ActionForm>
            ) : (
              <p className="text-subhead text-text-secondary">{card ? `Mentors carry the verified mark; yours still needs ${verified?.missing.join(", ") ?? "a shared track record"}.` : "Share a card with your track record on Community first."}</p>
            )}
            {mine ? (
              <ActionForm action={mentorOfferAction} label="Withdraw the offer" variant="ghost" size="sm" doneLabel="Withdrawn" className="mt-2">
                <input type="hidden" name="close" value="yes" />
              </ActionForm>
            ) : null}
          </section>
        ) : null}
      </PageBody>
    </>
  );
}
