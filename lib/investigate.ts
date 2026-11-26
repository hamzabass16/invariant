/**
 * Every reading that searches the web is investigative (Hamza, 23 Oct 2026):
 * when a company did something investors did not expect, it asks why the
 * company did it, not only what it did. His example: Netflix announced
 * layoffs at its results; the reading looks at who was let go and who was
 * hired, the executives involved and their histories, and finds that the
 * company is reshaping itself to make more original content. The principle
 * is one text, set into the commentary on the results, the why of the
 * reaction, the Thesis Hunter and the recap after the close, so each says
 * it the same way. Pure: no network, no key.
 */

/** Searches added to a reading that is asked to investigate, on the person's own key. */
export const INVESTIGATE_SEARCHES = 4;

/** At most this many things investors did not expect, each with why the company did it. */
export const MAX_UNEXPECTED = 3;

/**
 * Read between the lines (Hamza, 4 Nov 2026: "What's behind the news? ...
 * for all the agents, researching"): the general rule, for every reading
 * that researches, about a company or not.
 */
export const READ_BEHIND = `- Read between the lines: ask what is behind the news, not only what it says. What changed from before, who gains and who loses by it, what the timing or the wording shows, what is left unsaid, and whether a move it is credited with had another cause that day. Name what the pages show and what they do not; never a motive the pages do not support.`;

/** The rule every web reading about a company carries, in the prompts' own voice. */
export const INVESTIGATIVE = `- Be investigative. When the company did something investors did not expect (layoffs, a deal, a change of leadership, a new line of business, a cut or a rise in spending, guidance against the trend), find out why it did it, not only what it did: who left and who was hired, the executives involved and what they did before, what the company said and did in the quarters before, and what that shows about where it is going. For example, when Netflix announced layoffs nobody expected, the reason showed in who was let go and who was hired: it was reshaping itself to make more original content. Name what the evidence shows and what it does not; every finding with the page it came from, never a motive the pages do not support.
${READ_BEHIND}`;
