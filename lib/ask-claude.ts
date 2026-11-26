/**
 * "Ask your Claude" (the beta, Hamza, 9 Nov 2026; the beta plan's hybrid AI):
 * the AI a person asks for on demand runs on their own Claude through the
 * Invariant connector, not on the deployment's key. Each feature below is a
 * card with the prompt to paste and whether the connector is added; the
 * operator and the allowlist keep the buttons that run in the app. The
 * scheduled agents, the screens and watchers in words and the first
 * methodology draft stay hosted.
 *
 * Pure: the words alone. Every prompt names the connector's own tools, asks
 * for every number from a tool and never for advice, and carries nothing of
 * the person's money: a ticker or a thesis's title at most.
 */

export const ASK_FEATURES = ["analyst", "add_to_thesis", "study", "perf_insights", "property_watch", "evaluation", "add_data"] as const;
export type AskFeature = (typeof ASK_FEATURES)[number];

/** The sentence an action answers with when it is asked of the app by someone whose AI runs on their own Claude. */
export const ASK_CLAUDE_SENTENCE = "This runs on your own Claude: the card on this page has the prompt to paste.";

const RULES = "Take every number from a tool, cite each rule's section, and never tell me to buy or sell.";

export type AskCard = { title: string; intro: string; prompt: string; after: string };

/** A subject named in a prompt: a ticker or a title, cut and stripped of anything that is not a word. */
function named(s: string): string {
  return s.replace(/[^\p{L}\p{N} .&'-]/gu, "").trim().slice(0, 80);
}

export function askCard(feature: AskFeature, subject?: string): AskCard {
  const who = subject ? named(subject) : "";
  switch (feature) {
    case "analyst":
      return {
        title: "Ask the analyst in your own Claude",
        intro: "Your Claude plans the figures and the app computes them through the Invariant connector, the same tools the analyst used here.",
        prompt: `Use the Invariant connector. Call get_overview first, then answer my question from the tools alone: compute_figures for any figure, run_checks for the verdicts, search_vault for what I wrote. ${RULES}\n\nMy question: `,
        after: "Your Claude answers in its own chat; nothing is written to your vault.",
      };
    case "add_to_thesis":
      return {
        title: "Add a document with your own Claude",
        intro: "Attach the document in Claude; your Claude reads it against the thesis and your methodology and proposes the changes.",
        prompt: `Use the Invariant connector. I am attaching a document. Call get_theses${who ? ` for ${who}` : ""} and get_methodology, read the document against the thesis and the classes and rules it lives under, then call write_thesis with the changes the document supports: the words before and after and why, quoting only figures the document prints. ${RULES}`,
        after: "What it writes lands on this page as Proposed by your Claude, for you to keep, amend or dismiss.",
      };
    case "study":
      return {
        title: "Write the study with your own Claude",
        intro: "The study is queued here with the app's figures; your Claude writes its sections and the app checks every figure against the filings.",
        prompt: `Use the Invariant connector. Call get_studies_to_write, then write each study's sections on its brief and call write_study with them. Use only figures the brief or the filings print, or work one out on its line from printed ones. ${RULES}`,
        after: "A section with a figure no source prints is left out and named; the study shows here once written.",
      };
    case "perf_insights":
      return {
        title: "Read your performance with your own Claude",
        intro: "Your Claude reads the figures on this page through your methodology, from the connector's tools.",
        prompt: `Use the Invariant connector. Call get_overview and get_methodology, then compute_figures for my returns, alpha, volatility, drawdown and the days I beat the benchmark. Read each through my methodology's classes and rules: what it means for the way I invest, in two or three lines a figure. ${RULES}`,
        after: "Your Claude answers in its own chat; the figures on this page stay the app's.",
      };
    case "property_watch":
      return {
        title: "Watch your properties with your own Claude",
        intro: "Your Claude searches the web for each property's market, with every figure's page.",
        prompt: `Use the Invariant connector. Call get_holdings for my real estate, then search the web for each property: nearby rents, the short-stay market and the news that could move its price, every figure with the page it came from. Suggest no revaluation as fact; say what the pages show. ${RULES}`,
        after: "Your Claude answers in its own chat; a revaluation is yours to enter on Setup.",
      };
    case "evaluation":
      return {
        title: "Propose the tests with your own Claude",
        intro: "Your Claude proposes how your methodology should be judged on your record; the app's own tests stand meanwhile.",
        prompt: `Use the Invariant connector. Call get_methodology and get_overview, then propose how this methodology should be judged on my record: which benchmark, which classes against it, which falls it should limit, from what the methodology itself states and the dates on record. Name the section each test comes from. ${RULES}`,
        after: "The Evaluation view keeps the app's own tests; compare what your Claude proposes with them.",
      };
    case "add_data":
      return {
        title: "Find a figure with your own Claude",
        intro: "A figure with no public API is read by your Claude from the web; a figure with one is added here from that API.",
        prompt: `Search the web for ${who || "the figure I name"}: its latest value, its date and the page it came from, and the last few readings if the page shows them. Give every figure with its page.`,
        after: "Your Claude answers in its own chat; the app reads only public APIs by itself.",
      };
  }
}

/** The steps around every card. */
export const ASK_STEPS = [
  { title: "Add Invariant to Claude", detail: "Once: Setup shows how. Sign in with the same account." },
  { title: "Paste the prompt", detail: "In a chat with the connector on. Add what the prompt asks for." },
  { title: "Read the answer", detail: "Your Claude reads through the app's tools; the app computes every figure." },
] as const;
