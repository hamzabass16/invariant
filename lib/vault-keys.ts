/**
 * The files the app keeps in a person's vault. Fixed names, so nothing outside
 * this list is ever written, whichever system the vault is in.
 *
 *   setup, book, property_watch   what Setup and the inputs produced
 *   book_notes                    what an uploaded statement lacked (lib/import-book.ts)
 *   methodology_draft             a drafted methodology awaiting confirmation
 *   methodology_source            the document it was drafted from
 *   secrets                       an own model key from before the hosted AI, no longer read,
 *                                 read only to make the drafting call
 *   preferences, records          their arrangement of the app (lib/preferences.ts)
 *   reports                       the last few scheduled reports (lib/report.ts)
 *   research, research_template   research documents and the person's own template (lib/research.ts)
 *   filings                       fundamentals read from SEC filings for every listed holding (lib/filings.ts)
 *   decisions                     the Decision Log (lib/decisions.ts)
 *   analyst                       the analyst's conversations and lessons (lib/analyst.ts)
 *   connections                   the IBKR Flex token and query id, the SnapTrade Personal key and
 *                                 the eToro keys for the morning refresh (lib/connections.ts), read
 *                                 only to make the fetch
 *   brokers                       what the last good SnapTrade and eToro fetches returned (lib/brokers.ts)
 *   sync                          what the last refresh did, source by source
 *   statements                    what each bank statement and fund report said (lib/statements.ts);
 *                                 never the document itself
 *   benchmarks                    SPY's and QQQ's largest companies with their filings' fundamentals,
 *                                 for the look-through (lib/look-through.ts); public figures only
 *   alerts                        every alert that fired, cleared, was emailed or dismissed (lib/alerts.ts)
 *   newsletters                   a short digest of each newsletter forwarded (lib/newsletters.ts);
 *                                 never the email itself
 *   recaps                        "What happened" in each US session, written by the person's own
 *                                 Claude from the web (lib/market-recap.ts), each point with its page
 *   custom_data                   the data the person added themselves (lib/custom-data.ts): each
 *                                 definition and its last reading
 *   data_keys                     the API keys those definitions need, read only to make the call,
 *                                 never shown again
 *   portfolios                    the person's portfolios: names, accounts, and a methodology each
 *                                 when they keep one per portfolio (lib/portfolios.ts)
 *   earnings                      the report after each set of results of a company the person follows
 *                                 (lib/earnings.ts): figures from the filing, the class test, their
 *                                 triggers, and their Claude's reading of the release with its pages
 *   theses                        each holding's and watchlist symbol's thesis in the person's words, its pillars with the
 *                                 figure that tests each, the watch items, the valuation estimates, the DCF inputs and what
 *                                 was added to it (a document their Claude read, a note of theirs); the market theses with
 *                                 pillars on the indicators (lib/theses.ts); written by the person on Theses and by their own
 *                                 Claude through the connector's write_thesis, for them to review
 *   thesis_writes                 what the person's own Claude proposed to a thesis through write_thesis
 *                                 (lib/thesis-writes.ts), one per thesis, waiting for them to keep the parts
 *                                 they tick; the write as Claude sent it, never a document
 *   thesis_proposals              the changes a document the person uploaded proposes to one of their theses
 *                                 (lib/thesis-review.ts; Hamza, 19 Oct 2026), pending until they approve, deny
 *                                 or amend each on the thesis page; the document itself is never kept
 *   newsletter_senders            the newsletter senders the person's Claude proposed through the
 *                                 connector and what the person decided about each (lib/newsletters.ts)
 *   forwarding                    Gmail's forwarding confirmations the app made for the person's
 *                                 statements and newsletters addresses: when each request came and
 *                                 when Google confirmed it (lib/inbox.ts); never a link or a token
 *   podcasts                      the podcasts the person follows on podscripts.co and each new
 *                                 episode written up on their own model: the summary, the points
 *                                 and a perspective against their book (lib/podcasts.ts); never
 *                                 the transcript
 *   thesis_hunter                 what the Thesis Hunter found for each thesis on the AI
 *                                 (lib/thesis-hunter.ts): each find's words, stance, source with its page,
 *                                 and a chart from printed figures or a picture's address; never a page itself
 *   push                          the devices the person turned notifications on for: each browser's push
 *                                 address and keys, and when the last recap after the close went (lib/push.ts)
 *   screener                      the S&P 500 and Nasdaq-100 companies' fundamentals from their filings,
 *                                 read a share at a time for the methodology screener (lib/screener.ts)
 *   funds                         the top funds' latest 13F positions, the quarter before and the moves
 *                                 (lib/funds.ts); public filings alone
 *   research_cache                the Research Agent's daily pass per company (lib/research-agent.ts): the
 *                                 findings with their pillar, stance and sources, the items kept and those
 *                                 dropped with the reason, the priced-in readings, and each agent run's
 *                                 steps with the tokens and the estimated cost, the daily planner's plan (symbols,
 *                                 thesis keys and a line why each) and the lens agents' readings of the findings;
 *                                 headlines and links, never a page
 *   agent_feedback                the person's ratings of the agents' findings (useful or not, what was
 *                                 wrong, a note) and the lessons proposed from them, pending, approved or
 *                                 denied (lib/agents.ts)
 *   evaluation                    how the person judges their methodology (lib/methodology-evaluation.ts): the
 *                                 day they measure from, the tests they confirmed and a proposal from their
 *                                 own model waiting to be confirmed or dismissed; words and dates, never an amount
 *   perf_insights                 the Performance page read through the methodology on the AI
 *                                 (lib/perf-insights.ts): one reading per card, the figures' date and the
 *                                 windows; words, never an amount
 *   calendar_events               the dated events the Calendar agent found on the AI once a
 *                                 month (lib/calendar-agent.ts): each one's date, kind, economy, name, a line on
 *                                 what it decides and its official page; never a page itself
 *   macro_reports                 a report after each macro event on the calendar (lib/macro-report.ts): the
 *                                 markets' and the book's moves on the session that traded it, in percent, its
 *                                 history at today's weights, what it touches in the book, the outcome as the
 *                                 person's own model read it with each page, the readings of an outcome not
 *                                 final, and Kalshi's or Polymarket's prices the day before; never an amount
 *   custom_agents                 the agents the person built in the Agent Builder (lib/custom-agents.ts): their
 *                                 words, what the app compiled them into (a question, companies by symbol,
 *                                 sources, how often), the test run and the findings with their sources; never a page
 *   probe                         written and removed when a new vault is tested
 *
 * Pure, so adapters, screens and checks share one list.
 */
export const VAULT_KEYS = ["setup", "book", "book_notes", "property_watch", "methodology_draft", "methodology_source", "secrets", "preferences", "records", "reports", "research", "research_template", "filings", "decisions", "analyst", "connections", "brokers", "sync", "statements", "benchmarks", "alerts", "newsletters", "recaps", "custom_data", "data_keys", "portfolios", "earnings", "theses", "thesis_proposals", "thesis_writes", "newsletter_senders", "forwarding", "podcasts", "thesis_hunter", "push", "screener", "funds", "research_cache", "agent_feedback", "evaluation", "perf_insights", "calendar_events", "macro_reports", "custom_agents", "probe"] as const;
export type VaultKey = (typeof VAULT_KEYS)[number];
