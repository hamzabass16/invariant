/**
 * The pre-trade check: a buy or a sale laid on a copy of the book, every rule
 * of the methodology run again, and what moved reported with its section. It
 * computes and drafts a Decision Log entry; it never talks to a broker (there
 * is no order path in this app). Pure.
 */
import { money, type Book, type Holding } from "@/lib/holdings";
import { evaluate, type Finding, type Methodology } from "@/lib/methodology";
import { ownerValueOf, evalCtx } from "@/lib/ontology";
import { capOf, capsFor, capState, type Cap, type CapState } from "@/lib/screens";
import { classifier } from "@/lib/recipes";
import type { InputId } from "@/lib/setup";

export type TradeSide = "buy" | "sell";

export type TradeInput = {
  book: Book;
  methodology: Methodology | null;
  inputs: readonly InputId[];
  today: string;
  side: TradeSide;
  symbol: string;
  /** In the base currency. */
  amount: number;
};

export type MovedRule = {
  finding: Finding;
  /** The statuses before and after. */
  before: Finding["status"];
  after: Finding["status"];
};

export type TradeResult = {
  symbol: string;
  held: boolean;
  price: number | null;
  shares: number | null;
  netWorth: number;
  cash: number;
  weightBefore: number;
  weightAfter: number;
  classId: string | null;
  classLabel: string;
  cap: Cap | null;
  capAfter: CapState;
  /** Rules whose status worsened with the trade, worst first. */
  moved: MovedRule[];
  /** Rules the person checks themselves whose text speaks of a buy or a sale. */
  reminders: Finding[];
  /** Sentences about the trade itself: cash short, no price. */
  notes: string[];
  /** No rule newly fails or comes near. */
  clear: boolean;
  draft: string;
};

const RANK = { fail: 0, near: 1, pass: 2, manual: 3, "n/a": 4 } as const;

/** The book with the trade applied: the position grown or shrunk, the cash moved the other way. */
export function bookAfter(book: Book, side: TradeSide, symbol: string, amount: number): Book {
  const s = symbol.toUpperCase();
  const signed = side === "buy" ? amount : -amount;
  const holdings = book.holdings.map((h) => ({ ...h }));
  const mine = holdings.filter((h) => h.symbol.toUpperCase() === s && h.assetClass !== "option").sort((a, b) => ownerValueOf(b, book) - ownerValueOf(a, book));
  const lead = mine[0];
  if (lead) {
    // The same share at two brokers moves together: every lot is scaled by the same factor.
    const total = mine.reduce((sum, h) => sum + ownerValueOf(h, book), 0);
    const next = Math.max(0, total + signed);
    const factor = total > 0 ? next / total : 0;
    for (const h of mine) {
      h.value = h.value * factor;
      h.quantity = h.quantity * factor;
    }
    if (total <= 0 && side === "buy") {
      lead.value = amount;
      lead.quantity = lead.price ? amount / lead.price : 0;
    }
  } else if (side === "buy") {
    const price = book.market?.spots[s] ?? null;
    holdings.push({
      id: `check:${s}`,
      account: "Trade check",
      source: "manual",
      assetClass: "equity",
      symbol: s,
      name: s,
      quantity: price ? amount / price : 0,
      price,
      value: amount,
      costBasis: amount,
      currency: book.fx.base,
      asOf: book.asOf,
      valuation: "manual",
      country: null,
      sector: null,
      themes: [],
    } satisfies Holding);
  }
  const cash = holdings.filter((h) => h.assetClass === "cash" && h.currency === book.fx.base).sort((a, b) => b.value - a.value)[0];
  if (cash) cash.value -= signed;
  else holdings.push({ id: "check:cash", account: "Trade check", source: "manual", assetClass: "cash", symbol: book.fx.base, name: "Cash", quantity: -signed, price: 1, value: -signed, costBasis: null, currency: book.fx.base, asOf: book.asOf, valuation: "manual", country: null, sector: null, themes: [] } satisfies Holding);
  return { ...book, holdings };
}

export function checkTrade(input: TradeInput): TradeResult {
  const { book, methodology: m, inputs, today, side } = input;
  const symbol = input.symbol.toUpperCase();
  const amount = Math.max(0, input.amount);
  const ccy = book.fx.base;
  const after = bookAfter(book, side, symbol, amount);
  const netWorth = book.holdings.reduce((s, h) => s + ownerValueOf(h, book), 0);
  const cash = book.holdings.filter((h) => h.assetClass === "cash").reduce((s, h) => s + ownerValueOf(h, book), 0);
  const valueOf = (b: Book) => b.holdings.filter((h) => h.symbol.toUpperCase() === symbol && h.assetClass !== "option").reduce((s, h) => s + ownerValueOf(h, b), 0);
  const held = valueOf(book) > 0;
  const lead = book.holdings.find((h) => h.symbol.toUpperCase() === symbol && h.assetClass !== "option");
  const price = lead?.price ?? book.market?.spots[symbol] ?? null;
  const shares = price ? amount / price : null;
  const weightBefore = netWorth > 0 ? (valueOf(book) / netWorth) * 100 : 0;
  const weightAfter = netWorth > 0 ? (valueOf(after) / netWorth) * 100 : 0;
  const base = evalCtx(after, today);
  const classOf = m && m.classes.length ? classifier(m.classes, base) : () => null;
  const subject = after.holdings.find((h) => h.symbol.toUpperCase() === symbol && h.assetClass !== "option");
  const classId = subject ? classOf(subject) : null;
  const classLabel = classId ? (m?.classes.find((c) => c.id === classId)?.label ?? classId) : "No class yet";
  const cap = capOf(capsFor(m), classId);
  const capAfter = capState(weightAfter, cap?.cap ?? null);

  const before = m ? evaluate(m, book, today, inputs) : [];
  const post = m ? evaluate(m, after, today, inputs) : [];
  const moved: MovedRule[] = [];
  for (const f of post) {
    const b = before.find((x) => x.rule.id === f.rule.id);
    if (!b || f.status === "manual" || f.status === "n/a") continue;
    if (RANK[f.status] < RANK[b.status]) moved.push({ finding: f, before: b.status, after: f.status });
  }
  moved.sort((a, b) => RANK[a.after] - RANK[b.after]);
  const reminders = post.filter((f) => f.status === "manual" && /\b(buy|buys|bought|sale|sales|sell|sells|sold|purchase|trim|exit)\b/i.test(f.rule.text));

  const notes: string[] = [];
  if (price === null) notes.push(`No price for ${symbol}: the share count is unknown; the weight is computed from the amount.`);
  if (side === "buy" && amount > cash) notes.push(`The buy needs ${money(amount, ccy)} and the book holds ${money(cash, ccy)} in cash: ${money(amount - cash, ccy)} short, unless a sale funds it.`);
  if (side === "sell" && amount > valueOf(book)) notes.push(`The sale is larger than the position (${money(valueOf(book), ccy)}); the check treats it as a full exit.`);
  if (!m) notes.push("No methodology confirmed yet: only the weights are shown.");

  const clear = !moved.some((x) => x.after === "fail" || x.after === "near");
  const lines = [
    `${today} · ${side === "buy" ? "Buy" : "Sell"} ${symbol} · ${money(amount, ccy)}${shares !== null ? ` (${shares.toFixed(2)} sh at ${price!.toLocaleString("en-US", { maximumFractionDigits: 2 })})` : ""}`,
    `Weight ${weightBefore.toFixed(2)}% → ${weightAfter.toFixed(2)}%${cap ? ` against the ${cap.cap}% cap (${cap.rule.section})` : " (no cap)"} · ${classLabel}`,
    moved.length ? `Rules moved: ${moved.map((x) => `${x.finding.rule.section} ${x.finding.rule.text} (${x.before} → ${x.after})`).join("; ")}` : m ? "No rule newly fails or comes near." : "",
    reminders.length ? `Yours to check: ${reminders.map((f) => `${f.rule.section} ${f.rule.text}`).join("; ")}` : "",
    "Reason: ",
  ].filter(Boolean);
  return { symbol, held, price, shares, netWorth, cash, weightBefore, weightAfter, classId, classLabel, cap, capAfter, moved, reminders, notes, clear, draft: lines.join("\n") };
}
