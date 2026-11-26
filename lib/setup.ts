/**
 * What a person chose when they set up Invariant, and what the app builds
 * from it. Everyone starts from the same app. Setup happens in two stages:
 *
 *   1. Profile and inputs: who they are (an individual, a family office) and
 *      where their money is reported (brokers, statements by email, things
 *      entered by hand). That decides the screens they get.
 *   2. Methodology: the rules they invest by. That decides the dashboard, its
 *      headline figures, the checks and how each part is shown
 *      (lib/methodology.ts).
 *
 * Nothing here names a person. Pure: zod and plain functions only, so the
 * setup screens, the checks and the server share it.
 */
import { z } from "zod";

import { type AssetClass, type Book, type Holding } from "@/lib/holdings";
import { methodologySchema } from "@/lib/methodology";
import { shownWhen } from "@/lib/screens";

const currency = z.string().regex(/^[A-Z]{3}$/);

export const PROFILE_IDS = ["individual", "family_office"] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];

export const INPUT_IDS = ["ibkr", "schwab", "other_broker", "etoro", "bank_statements", "fund_reports", "property", "other_assets"] as const;
export type InputId = (typeof INPUT_IDS)[number];

export type InputGroup = "broker" | "email" | "manual";

export const INPUT_GROUP_LABEL: Record<InputGroup, string> = {
  broker: "Brokerage accounts",
  email: "Statements that arrive by email",
  manual: "Things you tell us about",
};

type InputKind = {
  label: string;
  group: InputGroup;
  /** One line on how it connects, in the owner's words. */
  how: string;
  /** What the owner does, once. */
  ownerStep: string;
  /** Asset classes this input can bring in; decides which screens it switches on. */
  brings: readonly AssetClass[];
};

export const INPUTS: Record<InputId, InputKind> = {
  ibkr: {
    label: "Interactive Brokers",
    group: "broker",
    how: "A read-only report link from IBKR. It cannot trade.",
    ownerStep: "Make a read-only Flex token in IBKR's Client Portal and paste it here once.",
    brings: ["equity", "etf", "option", "bond", "cash"],
  },
  schwab: {
    label: "Charles Schwab",
    group: "broker",
    how: "Through your own free SnapTrade key, read-only.",
    ownerStep: "Make a free SnapTrade key, paste it here, then connect Schwab read-only.",
    brings: ["equity", "etf", "option", "bond", "cash"],
  },
  other_broker: {
    label: "Another broker",
    group: "broker",
    how: "Wealthsimple, Questrade, Fidelity, Robinhood, E*TRADE and others through your own free SnapTrade key, read-only.",
    ownerStep: "Make a free SnapTrade key, paste it here, then connect the broker read-only.",
    brings: ["equity", "etf", "option", "bond", "cash"],
  },
  etoro: {
    label: "eToro",
    group: "broker",
    how: "A read-only key you make in eToro's settings.",
    ownerStep: "Make a key with Read permission in eToro and paste it here once.",
    brings: ["equity", "etf", "other", "cash"],
  },
  bank_statements: {
    label: "Bank statements",
    group: "email",
    how: "Deposits, bonds and cash from the statements your banks email you.",
    ownerStep: "Forward statement emails to your own statements address.",
    brings: ["deposit", "bond", "cash", "equity", "etf"],
  },
  fund_reports: {
    label: "Private fund reports",
    group: "email",
    how: "VC and private equity reports: what each fund owns, calls and pays out.",
    ownerStep: "Forward fund report emails to the same address.",
    brings: ["private_fund"],
  },
  property: {
    label: "Real estate",
    group: "manual",
    how: "Each property's area, your share, any mortgage and rent. Watched weekly for local prices and news.",
    ownerStep: "Tell us about each property once.",
    brings: ["real_estate"],
  },
  other_assets: {
    label: "Other assets",
    group: "manual",
    how: "A private company stake, a loan, art: anything with a value you can name.",
    ownerStep: "Tell us what it is and roughly what it is worth.",
    brings: ["other"],
  },
};

type Profile = {
  label: string;
  blurb: string;
  /** Pre-ticked on the inputs step; the owner can change every one. */
  suggested: readonly InputId[];
  defaultCurrency: string;
};

export const PROFILES: Record<ProfileId, Profile> = {
  individual: {
    label: "Individual investor",
    blurb: "Your own brokerage accounts: shares, funds and options.",
    suggested: ["ibkr", "schwab"],
    defaultCurrency: "USD",
  },
  family_office: {
    label: "Family office",
    blurb: "A family's wealth across banks, private funds, property and brokers, usually with someone helping.",
    suggested: ["bank_statements", "fund_reports", "property"],
    defaultCurrency: "EUR",
  },
};

export const setupSchema = z.object({
  version: z.literal(1),
  /** How the app addresses the owner. */
  ownerName: z.string().trim().min(1).max(40),
  profile: z.enum(PROFILE_IDS),
  baseCurrency: currency,
  inputs: z.array(z.enum(INPUT_IDS)).min(1),
  /** Asked when a broker is chosen. Switches the Options screen on before any option shows up. */
  tradesOptions: z.boolean(),
  /** Someone who helps with setup, named in the instructions ("ask Sam"). Optional. */
  helperName: z.string().trim().max(40).nullable(),
  /** Stage 2: the confirmed methodology. Null until one is attached and confirmed. */
  // Lazy: lib/methodology.ts reads the input catalogue above, so the two modules refer to each other.
  methodology: z.lazy(() => methodologySchema).nullable(),
  updated: z.string(),
});
export type Setup = z.infer<typeof setupSchema>;

/** Every screen the app can build. Which ones a person gets follows from their setup and their book. */
export const MODULES = ["overview", "performance", "trades", "allocation", "options", "fixed_income", "funds", "properties", "statements", "newsletters", "methodology", "research", "analyst", "setup"] as const;
export type Module = (typeof MODULES)[number];

const has = (book: Book | null, classes: AssetClass[]) => !!book?.holdings.some((h) => classes.includes(h.assetClass));

/**
 * Stage 1: the screens a setup switches on. An input that can bring an asset
 * class switches its screen on before the first figure arrives, so the owner
 * sees where it will land; a holding that turns up without a matching input
 * switches its screen on too, so nothing in the book is ever hidden.
 */
export function modulesFor(setup: Setup, book: Book | null): Module[] {
  const chosen = new Set(setup.inputs);
  const pick = (ids: InputId[]) => ids.some((id) => chosen.has(id));
  const brokers = pick(["ibkr", "schwab", "other_broker", "etoro"]);
  const out: Module[] = ["overview", "allocation"];
  // Performance follows a series figure in the methodology (or a nav series before there is one); Trades a ledger.
  const shown = shownWhen(setup.methodology, book, null, null);
  if (shown.series) out.push("performance");
  if (shown.transactions) out.push("trades");
  if ((brokers && setup.tradesOptions) || has(book, ["option"])) out.push("options");
  if (pick(["bank_statements"]) || has(book, ["bond", "deposit"])) out.push("fixed_income");
  if (pick(["fund_reports"]) || has(book, ["private_fund"])) out.push("funds");
  if (pick(["property"]) || has(book, ["real_estate"])) out.push("properties");
  if (pick(["bank_statements", "fund_reports"])) out.push("statements");
  // Anyone can forward newsletters; the reviews carry them once some arrive.
  out.push("newsletters", "methodology");
  // Research and the analyst follow a confirmed methodology: the template and the answers come from what it says.
  if (setup.methodology) out.push("research", "analyst");
  out.push("setup");
  return out;
}

/** Which of the owner's inputs a holding came through. */
export function inputFor(h: Holding): InputId {
  if (h.source === "ibkr") return "ibkr";
  if (h.source === "snaptrade") return /schwab/i.test(h.account) ? "schwab" : "other_broker";
  if (h.source === "etoro") return "etoro";
  if (h.source === "statements") return h.assetClass === "private_fund" ? "fund_reports" : "bank_statements";
  return h.assetClass === "real_estate" ? "property" : "other_assets";
}

/** The book limited to the chosen inputs: what the demo shows for a given choice. */
export function bookForInputs(book: Book, inputs: readonly InputId[]): Book {
  const keep = new Set(inputs);
  const holdings = book.holdings.filter((h) => keep.has(inputFor(h)));
  const ids = new Set(holdings.map((h) => h.id));
  const accounts = new Set(holdings.map((h) => h.account));
  return {
    ...book,
    holdings,
    lookThrough: book.lookThrough.filter((r) => ids.has(r.parentId)),
    transactions: book.transactions.filter((t) => accounts.has(t.account)),
  };
}

/** Which inputs a setup has that the book holds nothing from yet: "connecting" on the Setup screen. */
export function inputsWithoutData(setup: Setup, book: Book | null): InputId[] {
  const seen = new Set((book?.holdings ?? []).map(inputFor));
  return setup.inputs.filter((id) => !seen.has(id));
}

export function stageOf(setup: Setup | null): "new" | "inputs" | "methodology" {
  if (!setup) return "new";
  return setup.methodology ? "methodology" : "inputs";
}
