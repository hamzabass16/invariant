"use server";

import { revalidatePath } from "next/cache";

import { randomBytes } from "node:crypto";

import { HANDLE, handleFrom, profileFrom, withFollowing, withStreak, sharedRulesOf } from "@/lib/community";
import { familyOf } from "@/lib/research";
import { resonanceOf } from "@/lib/resonance";
import { deriveScreens } from "@/lib/screen-data";
import { SyncError } from "@/lib/sync-error";
import { localDay } from "@/lib/time";
import { getWorkspace, savePreferences, thesesFor } from "@/lib/workspace";

export type CommunityState = { error: string | null };

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

async function guarded(fn: () => Promise<void>, handle?: string): Promise<CommunityState> {
  try {
    await fn();
    revalidatePath("/community");
    if (handle) revalidatePath(`/community/${encodeURIComponent(handle)}`);
    return { error: null };
  } catch (e) {
    if (e instanceof SyncError) {
      console.error(`[community] ${e.logDetail ?? "failed"}`);
      return { error: e.message };
    }
    throw e;
  }
}

/**
 * Shares the person's profile, or replaces it: the handle and name they
 * typed, a line about them, and what they chose (their theses, their
 * weights, or both), built here from their own files and the book's weights
 * in percent. Nothing of an amount passes (`profileFrom`, pure). The demo
 * shares nothing.
 */
export async function shareAction(_prev: CommunityState, form: FormData): Promise<CommunityState> {
  return guarded(async () => {
    const ws = await getWorkspace();
    if (ws.mode === "demo") throw new SyncError("The demo's community is fictional; in your own copy you share from here.", "community in demo");
    if (!ws.setup) throw new SyncError("Finish the setup first.", "community no setup");
    const { registryAvailable, shareProfile, myProfile } = await import("@/lib/registry");
    if (!registryAvailable()) throw new SyncError("Sharing needs the deployment's registry, which is not set up.", "community no registry");
    const handle = handleFrom(str(form, "handle"));
    // Sharing again keeps what followers were last told of; from here the card follows the files by itself (lib/community-run.ts; Hamza, 19 Oct 2026).
    const prev = await myProfile(ws.operator.email);
    const sharing = { theses: form.get("theses") === "on", weights: form.get("weights") === "on", record: form.get("record") === "on", listed: str(form, "listed") !== "link", rules: form.get("rules") === "on", judgement: form.get("judgement") === "on" };
    const { file: theses, error } = await thesesFor(ws);
    if (sharing.theses && error) throw new SyncError(`Your theses could not be read, so they cannot be shared yet. ${error}`, "community theses unread");
    const book = ws.fullBook;
    const data = book ? deriveScreens({ book, methodology: ws.baseSetup!.methodology, inputs: ws.baseSetup!.inputs, shown: ws.shown, filings: ws.filings, decisions: ws.decisions, preferences: ws.preferences }, localDay()) : null;
    const weights = (data?.weights ?? []).map((w) => ({ symbol: w.symbol, name: w.name, weight: w.weight, classLabel: w.classId ? w.classLabel : null }));
    if (sharing.weights && !weights.length) throw new SyncError("There are no weights to share yet: the book is empty.", "community no weights");
    const { recordFor, lastBreachEnd, lineageWords, sealedCard, judgementFor } = await import("@/lib/community-run");
    const m = ws.baseSetup?.methodology ?? null;
    const now = new Date().toISOString();
    const read = sharing.record ? recordFor(ws, data) : null;
    if (sharing.record && !read) throw new SyncError("There is no track record to share yet: it needs a statement with at least a month of daily values.", "community no record");
    const record = read ? withStreak(read, data && m ? resonanceOf(data.findings, data.todo, data.notices).breaches : null, prev?.record ?? null, lastBreachEnd(ws.alerts, m, now), localDay()) : null;
    let profile;
    try {
      profile = profileFrom({ handle, name: str(form, "name") || ws.operator.name || handle, about: str(form, "about") || null, methodology: m?.name ?? null, methodologyFrom: m ? lineageWords(m) : null, family: m ? familyOf(m).family : null, theses, weights, asOf: book?.asOf ?? null, sharing, now, changed: prev?.changed ?? null, record, rules: sharedRulesOf(m ?? null), judgement: sharing.judgement ? await judgementFor(ws, ws.operator.email, localDay()) : null });
    } catch (e) {
      throw new SyncError(e instanceof Error ? e.message : "The profile could not be built.", "community profile");
    }
    await shareProfile(ws.operator.email, await sealedCard(profile));
  });
}

/** Stops sharing: the deployment deletes the profile; the handle is free again. */
export async function stopSharingAction(): Promise<CommunityState> {
  return guarded(async () => {
    const ws = await getWorkspace();
    if (ws.mode === "demo") throw new SyncError("The demo shares nothing.", "community in demo");
    const { registryAvailable, stopSharing } = await import("@/lib/registry");
    if (!registryAvailable()) throw new SyncError("The deployment's registry is not set up.", "community no registry");
    await stopSharing(ws.operator.email);
    await (await import("@/lib/registry")).forgetMentoring(ws.operator.email).catch(() => undefined);
  });
}

/** Follows or unfollows a handle: the list is kept in the person's preferences, in their vault (the demo's in this browser). */
export async function followAction(_prev: CommunityState, form: FormData): Promise<CommunityState> {
  const handle = str(form, "handle");
  const follow = str(form, "follow") !== "no";
  return guarded(async () => {
    if (!HANDLE.test(handle)) throw new SyncError("That is not a handle.", "community handle");
    const ws = await getWorkspace();
    await savePreferences({ ...ws.preferences, following: withFollowing(ws.preferences.following, handle, follow) });
  }, handle);
}

/**
 * Makes a new link to the person's card (Hamza, 9 Nov 2026, the moat's
 * "mentor view"): anyone with it sees the card as shared, listed on
 * Community or not, without signing in; the old link stops working. Nothing
 * of an amount is on a card.
 */
export async function cardLinkAction(): Promise<CommunityState> {
  return guarded(async () => {
    const ws = await getWorkspace();
    if (ws.mode === "demo") throw new SyncError("The demo shares nothing.", "community in demo");
    const { registryAvailable, myProfile, setCardLink } = await import("@/lib/registry");
    if (!registryAvailable()) throw new SyncError("The deployment's registry is not set up.", "community no registry");
    if (!(await myProfile(ws.operator.email))) throw new SyncError("Share your card first; choose Only people with the link to keep it off Community.", "community link no card");
    await setCardLink(ws.operator.email, randomBytes(18).toString("base64url"));
  });
}

/** Turns the card's link off. */
export async function dropCardLinkAction(): Promise<CommunityState> {
  return guarded(async () => {
    const ws = await getWorkspace();
    if (ws.mode === "demo") throw new SyncError("The demo shares nothing.", "community in demo");
    const { registryAvailable, setCardLink } = await import("@/lib/registry");
    if (!registryAvailable()) throw new SyncError("The deployment's registry is not set up.", "community no registry");
    await setCardLink(ws.operator.email, null);
  });
}

// ---------------------------------------------------------------------------
// Family accounts (lib/households.ts; Hamza, 9 Nov 2026, the twenty more ways)

/** Starts a household with the person in it and a join code to hand to the others. */
export async function createHouseholdAction(_prev: CommunityState, form: FormData): Promise<CommunityState> {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "The demo's family is fictional." };
  const name = str(form, "name").slice(0, 60);
  const me = str(form, "me").slice(0, 60) || ws.operator.name || "Me";
  if (name.length < 2) return { error: "Name the household." };
  return guarded(async () => {
    const [{ householdIdFrom }, { inviteCodeFrom }, { createHousehold }] = await Promise.all([import("@/lib/households"), import("@/lib/clubs"), import("@/lib/registry")]);
    await createHousehold(ws.operator.email, me, { id: householdIdFrom(name, randomBytes(6).toString("hex")), name }, inviteCodeFrom(randomBytes(16)));
  });
}

export async function joinHouseholdAction(_prev: CommunityState, form: FormData): Promise<CommunityState> {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "The demo's family is fictional." };
  const code = str(form, "code");
  const me = str(form, "me").slice(0, 60) || ws.operator.name || "Member";
  if (code.length < 6) return { error: "Type the household's code." };
  const { allow, limitKey } = await import("@/lib/rate-limit");
  if (!(await allow(limitKey("household-join", ws.operator.email), 10, 3600))) return { error: "Too many tries; try again in an hour." };
  return guarded(async () => {
    await (await import("@/lib/registry")).joinHousehold(ws.operator.email, me, code);
  });
}

/** Family rules (Hamza, 9 Nov 2026, the twenty further ways): the ready-made pack the household holds itself to, or none; each member's own app reads it on their own book. */
export async function householdPackAction(_prev: CommunityState, form: FormData): Promise<CommunityState> {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "The demo's family is fictional." };
  const id = str(form, "id");
  const pack = str(form, "pack");
  const { RULE_PACKS } = await import("@/lib/rule-packs");
  if (pack && !RULE_PACKS.some((p) => p.id === pack)) return { error: "Choose one of the ready-made packs." };
  return guarded(async () => {
    await (await import("@/lib/registry")).setHouseholdPack(id, ws.operator.email, pack || null);
    await (await import("@/lib/community-run")).publishClubAndFamily(ws, ws.operator.email, localDay()).catch(() => console.error("[households] result not kept"));
  });
}

export async function leaveHouseholdAction(_prev: CommunityState, form: FormData): Promise<CommunityState> {
  const ws = await getWorkspace();
  if (ws.mode === "demo") return { error: "The demo's family is fictional." };
  const id = str(form, "id");
  return guarded(async () => {
    await (await import("@/lib/registry")).leaveHousehold(id, ws.operator.email);
  });
}

// ---------------------------------------------------------------------------
// Mentor sessions (lib/mentors.ts; Hamza, 9 Nov 2026, the twenty further ways)

/** Offers reviews as a mentor, or changes the offer: a verified analyst only, free now with the later price shown. */
export async function mentorOfferAction(_prev: CommunityState, form: FormData): Promise<CommunityState> {
  return guarded(async () => {
    const ws = await getWorkspace();
    if (ws.mode === "demo") throw new SyncError("The demo's mentors are fictional.", "mentor in demo");
    const { registryAvailable, myProfile, keepMentorOffer, dropMentorOffer } = await import("@/lib/registry");
    if (!registryAvailable()) throw new SyncError("The deployment's registry is not set up.", "mentor no registry");
    if (str(form, "close") === "yes") return dropMentorOffer(ws.operator.email);
    const card = await myProfile(ws.operator.email);
    const { offerProblem, mentorOfferSchema } = await import("@/lib/mentors");
    const problem = offerProblem(card);
    if (problem) throw new SyncError(problem, "mentor not verified");
    const price = str(form, "price");
    const parsed = mentorOfferSchema.safeParse({ handle: card!.handle, name: card!.name, line: str(form, "line"), focus: str(form, "focus") || null, laterPriceUsd: price ? Math.round(Number(price)) : null, open: str(form, "open") !== "no", updatedAt: new Date().toISOString() });
    if (!parsed.success) throw new SyncError("Say in a line what you review (two characters at least) and, if you like, a whole-dollar later price.", "mentor offer shape");
    await keepMentorOffer(ws.operator.email, parsed.data);
    revalidatePath("/community/mentors");
  });
}

/** Asks a mentor for a review: the member's card opens to them through its private link while the request is open. */
export async function askMentorAction(_prev: CommunityState, form: FormData): Promise<CommunityState> {
  return guarded(async () => {
    const ws = await getWorkspace();
    if (ws.mode === "demo") throw new SyncError("The demo's mentors are fictional.", "mentor in demo");
    const { registryAvailable, myProfile, cardLinkOf, askMentor, mentorAsksOf } = await import("@/lib/registry");
    if (!registryAvailable()) throw new SyncError("The deployment's registry is not set up.", "mentor no registry");
    const handle = str(form, "mentor");
    const card = await myProfile(ws.operator.email);
    const [link, asks] = await Promise.all([cardLinkOf(ws.operator.email), mentorAsksOf(ws.operator.email)]);
    const { askProblem, askIdFrom, mentorAskSchema } = await import("@/lib/mentors");
    const problem = askProblem({ card: !!card, link: !!link, open: asks.filter((a) => a.side === "member" && a.status === "asked").length, self: card?.handle === handle });
    if (problem) throw new SyncError(problem, "mentor ask refused");
    const now = new Date().toISOString();
    const ask = mentorAskSchema.safeParse({ id: askIdFrom(handle, now, randomBytes(4).toString("hex")), mentor: handle, mentorName: str(form, "mentorName") || handle, member: card!.name, note: str(form, "note").slice(0, 1000), status: "asked", review: null, askedAt: now, answeredAt: null });
    if (!ask.success) throw new SyncError("That request could not be made.", "mentor ask shape");
    await askMentor(ws.operator.email, ask.data);
    revalidatePath("/community/mentors");
  });
}

/** The mentor writes the review back, or declines. */
export async function answerMentorAction(_prev: CommunityState, form: FormData): Promise<CommunityState> {
  return guarded(async () => {
    const ws = await getWorkspace();
    if (ws.mode === "demo") throw new SyncError("The demo's mentors are fictional.", "mentor in demo");
    const { registryAvailable, answerMentorAsk } = await import("@/lib/registry");
    if (!registryAvailable()) throw new SyncError("The deployment's registry is not set up.", "mentor no registry");
    const { MAX_REVIEW_CHARS } = await import("@/lib/mentors");
    const decline = str(form, "decline") === "yes";
    const review = str(form, "review").slice(0, MAX_REVIEW_CHARS);
    if (!decline && review.length < 20) throw new SyncError("Write the review, a few sentences at least, or decline.", "mentor review short");
    await answerMentorAsk(ws.operator.email, str(form, "id"), decline ? null : review);
    revalidatePath("/community/mentors");
  });
}
