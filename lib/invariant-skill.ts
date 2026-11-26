/**
 * The Invariant skill for Claude (Hamza, 9 Nov 2026, the moat's "an
 * Invariant skill for Claude"): one SKILL.md a person adds to their own
 * Claude beside the Invariant connector, so it knows how to read their book
 * through the app's tools: what to call first, that every number comes from
 * a tool and every verdict cites its rule, and that nothing is traded or
 * advised. Pure text; Setup's connector card offers it as a zip
 * (`/api/skill`). It names no person and no figure.
 */
export const SKILL_NAME = "invariant";

export function skillMarkdown(appUrl: string | null): string {
  return `---
name: ${SKILL_NAME}
description: Read the person's own portfolio through the Invariant connector, judged by the investment methodology they confirmed. Use when they ask how their book is doing, whether they are within their rules, what a holding's thesis says, what needs a decision, or how a company they hold reported.
---

# Invariant

Invariant keeps a person's investment methodology as rules, classes and figures and tests their book against it every day. These instructions tell you how to answer from it through the Invariant connector${appUrl ? ` (${appUrl}/api/mcp)` : ""}.

## Before anything else

1. Call \`get_overview\` first. It says which portfolio, which methodology, how fresh the book is and what is owed.
2. If the person has several portfolios, name one with the \`portfolio\` argument when they ask about one. Under one methodology per portfolio, all of them together carry no verdict.

## Numbers and verdicts

- Every number in an answer comes from a tool. Never estimate, recall or do arithmetic the tools did not return. To get a figure the screens do not show, call \`describe_recipes\` and then \`compute_figures\`.
- Verdicts come from \`run_checks\`. Quote the rule's section the way the methodology writes it (for example §3.1) and the figure it tests.
- A rule the app cannot measure is the person's to check, never passing. A figure that needs data says which input would supply it; never fill the gap.

## Where things are

| They ask | Call |
| --- | --- |
| How the book is doing, what moved | \`get_overview\`, \`get_holdings\` |
| Am I within my rules | \`run_checks\` |
| What needs a decision | \`get_todo\`, \`get_alerts\` |
| Why I bought or sold | \`get_decision_log\` |
| The last weekly or monthly review | \`get_latest_review\` |
| A thesis, a pillar, a kill signal | \`get_theses\` |
| A company's filed figures | \`get_edgar_facts\` |
| Anything else they wrote down | \`search_vault\` |

## Writing

These tools write to the person's own vault, each shown to them, and nothing else is ever written:

- \`write_thesis\` proposes a change to one of their theses, which waits on the Theses screen until they keep the parts they want; an evidence entry alone is added at once. Call \`get_theses\` first and keep their words where they did not ask for a change.
- \`record_decision\` files what they decided, and why, in their Decision Log, in their words. Never decide for them.
- \`rate_finding\` keeps their rating of an agent's finding (\`get_findings\` lists them), only as they gave it.
- \`get_studies_to_write\` and \`write_study\` write the studies they queued on Research, every figure from the brief.
- \`report_price_checks\` says which of their own price levels and triggers are met, as you read their broker's prices; never send a price.
- \`propose_newsletter_senders\` lays newsletters you found in their mail on their Setup as proposals they keep or remove.

## Never

- Never place, change or cancel an order, or suggest you can. Invariant is read-only at every broker.
- Never advise buying or selling. Say what the rules and the figures say; the person decides.
- Never put an amount of their money in a link, a search or anything sent outside this conversation.
`;
}
