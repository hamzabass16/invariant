# PortfolioOS: instructions for coding assistants

The product is named Invariant everywhere a person sees it (Hamza, 4 Nov
2026, "Rename everywhere"; written PortfolioOS from 17 Oct 2026 until then,
and the repository and this file still call it that). The folder the app
makes in a person's Google Drive is still named "Portfolio OS"
(`lib/user-drive.ts`), and OneDrive's app folder Apps/Portfolio OS, so an
existing vault is found as before; copy that names the folder keeps it.
Signed out, `/` is the front page (`app/site/page.tsx`, rewritten there by
`proxy.ts` when no session cookie is sent), with Log in and Sign up.

PortfolioOS is one app for anyone's money. Every person starts from the same
app and is built for in two stages: first from their profile and inputs
(`lib/setup.ts`), then from their methodology (`lib/methodology.ts`), which is
a graph of recipes over the ontology (`lib/ontology.ts`, `lib/recipes.ts`).
There are no per-person code paths, files, deployments or dashboards: no
investing style gets a hard-coded view. It was built from HCMP OS
(`hamzabass16/hcmp-os`) and keeps its design and conventions, but none of
HCMP's data. The repository is open source under the MIT licence (Hamza,
26 Nov 2026: "open-source it on github"; nothing is sold, so no plan,
price or payment code is added), and the public face is the demo.

## Three hard rules

1. **Read-only, outside the person's own vault.** No code path places,
   changes or cancels an order, creates an alert at a broker, or writes to a bank or
   broker. The only writes are to the person's own vault (`lib/vault.ts`):
   today the "PortfolioOS" folder in their Drive, from `lib/user-drive.ts`
   alone, under the `drive.file` scope alone. The one outbound message is
   the scheduled report and the alerts a check found new
   (`lib/report-mail.ts`, the only mail path), sent to the person's own
   sign-in address and nobody else, and the sign-up code, sent to the
   address being verified, which becomes that sign-in address. The one
   notification is the recap after each US close, sent by Web Push to the
   devices the person turned on themselves (`lib/push-send.ts`, the only
   push path), every amount masked. `npm run check:guard` fails otherwise.
2. **Each person sees only their own data.** Google or Microsoft sign-in
   against `ALLOWED_EMAILS`, or an account in the app's own store
   (`lib/users.ts`, in the registry's database: an address, a scrypt
   password hash and, during sign-up, the hash of the code emailed to it,
   never a figure, a setup or a token of anyone's money; from 9 Nov 2026 its
   plan, which sets only its monthly AI allowance), made only while
   `SIGN_UP=open`, or `SIGN_UP=invite` with an invitation the operator made
   on /ops (`makeInvite`, kept as a keyed hash and a copy sealed under
   `REPORT_KEY`, used up when the account is made, carried from Create an
   account to a Google or Microsoft sign-in in the `pos_invite` cookie;
   Hamza, 9 Nov 2026: the beta is invite-only): by Google or Microsoft at
   the first sign-in, or by email and password verified with a six-digit
   code sent through the one mail path. The allowlist and the store are
   re-read on every request. Delete my account on Account settings
   (`deleteAccount` in `lib/beta-run.ts`) deletes everything the deployment
   keeps about an account made here; the vault stays in their Drive. Each
   person's figures are read with their own token from their own Drive; an
   email sign-in has no folder token, so it links a Google Drive once on
   Welcome (`app/api/vault/google`, `drive.file` alone) and its refresh
   token is kept sealed in `vault_choices` (`chooseDrive`), read only to
   open the folder (`openVault`), the morning refresh and the MCP consent.
   Money data never goes in a URL, a log line, an analytics
   event or this repository.
3. **Cite the rule.** Every check names the section of the person's methodology
   it comes from and the figure it tests. A rule the app cannot measure is
   shown as theirs to check, never as passing; a figure that reads data no
   input supplies says what it needs, never a zero; a methodology takes effect
   only once they confirm it.
4. **Our key, a cap per person** (Hamza, 4 Nov 2026: "host all of the AI";
   no one brings a key). Every model call (reading or suggesting a
   methodology, a study, the analyst, a report's commentary, the property
   watch, the market recap, Add data, a watcher or a screen asked in words)
   runs on Claude under the deployment's one key, `ANTHROPIC_API_KEY`, read
   in `lib/hosted-model.ts` alone (`hostedProvider`, `providerFor(vault)`
   from the vault's `owner`), never logged, echoed or written to a vault;
   the guard fails on that read anywhere else and on any `MODEL_API_KEY` or
   `OPENAI_API_KEY`. Each call is metered per person (`lib/model-meter.ts`:
   the registry's `model_spend`, a keyed fingerprint of the sign-in, the
   month, the estimated cost at list price from `costOf`, the number of
   calls; never a prompt, an answer or a figure; and by agent with no
   person, `agent_spend`, drawn on /ops) and refused once the month reaches
   the person's plan's cap (`PLAN_CAPS_USD` over `DEFAULT_PLAN_CAPS` in the
   pure `lib/plans.ts`, `capFor` in `lib/beta-run.ts`, laid on the provider
   by `providerFor` as `cap`), else `MODEL_CAP_USD`, else `DEFAULT_CAP_USD`,
   with `CAP_REACHED` (`assertWithinCap` in `callModel` and the analyst); an
   operator or an address on the allowlist keeps the deployment's cap. Past
   the cap the scheduled prose pauses and says so; the figures, checks and
   alerts never call the model and keep running. A meter that cannot
   be read lets the call through and logs it. Setup's AI card shows the
   month against the cap. No call without the key, without a sign-in behind
   the vault, or in the demo, which never calls a model. Wherever this file
   says the person's own provider, key or model, it now means this one.
   **Since the beta (Hamza, 9 Nov 2026, the hybrid AI), what a person asks
   for on demand runs on their own Claude** through the connector, not on
   this key: the analyst, Add to thesis, a study on request, Performance's
   insights, the property watch, the evaluation proposal and Add data's
   Claude source are "Ask your Claude" cards (`AskClaudeCard` in
   `components/app/ask-claude.tsx`; the prompts in the pure
   `lib/ask-claude.ts`, each naming the connector's tools, every number from
   a tool and no advice; whether the connector is added from the beta's
   `connector_added` count, `connectorAdded` in `lib/beta-run.ts` and
   `askState` in `lib/ask-claude-run.ts`), and their actions refuse with
   `ASK_CLAUDE_SENTENCE` (`assertHostedOnDemand`). Only the operator and the
   allowlist keep the buttons (`hostsOnDemand` in `lib/deployment.ts`, the
   workspace's `askClaude`). What runs by itself stays on this key: the
   first methodology draft, the screens and watchers in words, the
   statements, newsletters, podcasts, releases, calls and studies after
   results, and the scheduled agents, the daily planner, the Research
   Agent's judge (no Opus advisor; the operator and the allowlist keep
  Sonnet with the advisor), the recap, the reviews' commentary,
   answers and news and the earnings commentary and reaction now on Haiku
   first, asked once more on Sonnet when the app's check refuses the first
   reading (`callChecked`, `tierAbove`); the lens agents stay off until the
   person turns one on.

## Working safely

- Never commit `.env.local`, a key, a token or a connection string. The
  operator puts every secret into Vercel.
- Sample data in `data/samples/` is fictional. Never commit a real person's
  statement, book, address or methodology. The one exception is the
  showcase (`data/samples/showcase.*`, `methodology.showcase.json`): the
  operator's own portfolio, committed at the operator's request, anonymized
  (no name, account, address or Drive file), as of 3 Nov 2026 (refreshed
  from 10 Oct at Hamza's request, 4 Nov 2026), every amount of money in it
  (quantities, values, costs, the ledger, net worth, and the same positions
  in `data/samples/earnings.json`) multiplied by one fixed factor so the real
  size is not shown, its prices, weights, returns and dates as they were
  (Hamza, 26 Nov 2026, "Scale the amounts"), and changed only when asked.
  `/try` opens it with the guided tour (`lib/tour.ts`); the sign-in page
  links to it. `npm run check:screens` holds that it names no one.
- `STORAGE=demo` must never read Drive or call a model; `DEMO_PUBLIC=1` works
  only in demo mode.
- Never set `PREVIEW_OPERATOR_EMAIL` in Vercel. It is a local shim.
- Ask before any deploy, any change to Vercel or Google Cloud settings, and any
  push to `main`.
- Run `npm run check:setup`, `npm run check:screens`, `npm run check:performance`,
  `npm run check:decisions`, `npm run check:library`, `npm run check:todo`,
  `npm run check:options`, `npm run check:exposure`, `npm run check:data`,
  `npm run check:synthetic`, `npm run check:report`, `npm run check:vault`,
  `npm run check:statements`,
  `npm run check:import`, `npm run check:research`, `npm run check:analyst`,
  `npm run check:markets`, `npm run check:earnings`, `npm run check:theses`, `npm run check:community`, `npm run check:agents`, `npm run check:model`, `npm run check:mcp`, `npm run check:pdf`, `npm run check:guard`,
  `npm run typecheck`, `npm run lint`, `npm run build` and `npm run smoke`
  before and after a change. Check 375px and 1440px, dark and light
  (`SMOKE_THEME=light`).
- The enrolment registry (`lib/registry.ts`) is the one thing the deployment
  keeps about a person: their report schedule and their Google refresh token,
  encrypted with `REPORT_KEY`, each month's estimated AI spend under a
  fingerprint of the sign-in (`model_spend`, kept a year, `pruneSpend`), and, only while they choose to share on
  Community, the card they shared (`community_profiles`: a handle, a name,
  their theses' words and their weights in percent and, when ticked, their
  track record in percent; never an amount, an account or a token), and the
  clubs a person started or joined (`clubs`, `club_members`,
  `club_competitions`, `club_entries`, with the library, meetings, votes
  and the records kept after leaving: the club, each member's sign-in,
  chosen name and role, and their virtual trades; never a figure of their
  own money), and thesis receipts (`thesis_receipts`: a fingerprint and a
  time, never the words or whose). The token is decrypted only inside the cron run
  and never reaches a screen, a log or a response. Withdrawing deletes the
  row; Stop sharing deletes the card. Beside it the registry keeps public
  company figures for everyone (`company_figures`, below), nothing of a
  person.
- **The beta is measured, never watched** (Hamza, 9 Nov 2026). Five steps
  (`BETA_EVENTS` in `lib/plans.ts`: signed up, a statement read, a
  methodology confirmed, a weekly review opened, the connector added) are
  counted the first time each person takes
  them, in the registry's `beta_events` under the meter's keyed
  fingerprint, never the address (`recordEvent` in `lib/beta-run.ts`,
  never failing the action it rides on; an operator and the allowlist are
  not counted). /ops draws them as people and shares of those who signed
  up, the AI by agent this month and last, and the invitations. The
  founding plan was removed when the app went open source (Hamza, 26 Nov
  2026); the `committed_at` column is left in `app_users`, unread.
- Every user-visible change adds a line to `docs/CHANGELOG.md`.

## Conventions

- **Design:** see DESIGN.md. Obsidian and platinum (Hamza, 11 Nov 2026):
  near-black with platinum type, platinum the only action colour, one flat
  surface with no cards or layers, Newsreader for titles and labels, Plex
  Mono for every figure.
- **One skeleton, filled by the methodology.** The screens are HCMP OS's, in
  its order, for everyone: Dashboard (the first screen, at `/`; its id is
  `today`), Notifications, Holdings, Performance, Markets, Earnings, Trades,
  Triggers & kill signals, Watchlist, Research, Analyst, Trade check,
  Decision Log, Methodology to-do, Calendar, Reviews, Methodology, the input
  screens, Settings. Today and the Dashboard are one screen, called
  Dashboard (Hamza's ruling of 15 Oct 2026; `/dashboard` only redirects): the
  year strip (SPY, the book, QQQ, each its return this year, the book's lead
  on the arrows between; `yearStrip` in `lib/live.ts`, live in market
  hours), net worth and the day (live, else the statement's and the last
  session's, each badged; the day is `DayTile` in
  `components/live/day-tile.tsx`, two columns or more by `tileGrid` so no
  row has a gap, washed in the map's colour for the move, with the split of
  the book up and down and the holdings that made and cost the most; Hamza,
  19 Oct 2026), the headline tiles (`dashboardHeadline` in
  `lib/screens.ts`: the methodology's, less the book's total and, while
  Holdings is on, the weights by class and the largest holding's share;
  SPY's and QQQ's return beside the book's, the methodology's own figure
  when it has one; never the VIX, Markets carries it; Hamza, 19 Oct 2026),
  each tile and net worth on the Markets range bar (`figureRangeOf` and
  `yearRange` in the pure `lib/figure-range.ts`: a market figure on its
  scale, a series figure on `RETURN_SPANS` or `RISK_SCALES`, a figure a
  rule tests on a track from zero with the limit as a tick, net worth on
  its year's low and high; `movedTo` moves the marker with a live value;
  Performance's tiles and risk cells alike), the return chart (`lib/return-chart.ts`, pure: the time-weighted
  return or the value against SPY, QQQ and the methodology's benchmarks
  over YTD, 3M, 6M, 1Y, 2Y, 5Y or two dates, switched on the chart; while
  the market is open the last point is today at the live prices, from the
  same read as the tiles; Hamza, 15 Oct 2026), the session (live in market
  hours), then the book holding by
  holding (live with prices, else at the close); why each moved (After the
  close; while the market is open it says today's is written after the
  close, offers to write the last close's when it is missing and folds the
  last close's away, `MarketHoursGate`; Hamza, 15 Oct 2026), What happened
  and the Newsletters are on At the Close (`after_close`,
  `/after-close`, the sidebar screen right after Notifications, slots
  `close_brief`, `extended_hours`, `market_today` and then `company_news`, below What happened
  today since 27 Oct 2026; Hamza, 18 Oct 2026;
  After the close draws each holding as a card in a grid, the largest move
  first, 19 Oct 2026). Company news and reports (`company_news`, Hamza,
  19 Oct 2026; `lib/company-news.ts` pure, `lib/company-news-run.ts`
  server-only, `components/markets/company-news.tsx`) is a grid of the
  past `NEWS_DAYS` days' headlines and filings for every listed holding
  and watchlist company, newest first, at most `MAX_PER_COMPANY` each: the
  headlines from Yahoo Finance's RSS per ticker, Google News's behind it
  (`loadCompanyHeadlines` in `lib/markets-feed.ts`, the ticker alone in the
  URL, cached an hour, a count and never a ticker in a log), the 8-K,
  10-Q, 10-K, 6-K, 20-F and 40-F from SEC submissions (`filingsOfWeek`
  through `lib/edgar.ts`), and the post-earnings reports the app wrote;
  each card opens the article or the filing, the newest `NEWS_SHOWN` (twelve,
  so the last row is full at two, three or four across) with
  Show all for the rest, and a feed that cannot be read is a sentence. The demo reads `data/samples/company-news.json`,
  fictional. Performance carries the IRR card after its tiles (slot `irr`,
  `moneyWeighted` and `timingWords` in `lib/performance.ts`,
  `components/performance/irr-card.tsx`; Hamza, 19 Oct 2026): the
  money-weighted return since the start or over the period chosen on the
  card (`?irr=`), yearly from a year on, beside the
  time-weighted return, the deposits and withdrawals at their own dates,
  and what it means in two lines; then Alpha (slot `alpha`, `alphaStats`
  in `lib/performance.ts`, `components/performance/alpha-card.tsx`; Hamza,
  19 Oct 2026): Jensen's alpha a year against the methodology's first
  benchmark with prices, else SPY, over `?alpha=`, by least squares on the
  excess returns, with its 95% interval, the t statistic, the two-sided
  p-value (Student's t, `twoSidedP`), beta, R², the equation and the returns
  as dots under the fitted line, at least `ALPHA_MIN_RETURNS`. No card on
  Performance repeats another (Hamza, 20 Oct 2026): the section that holds
  the drawdown carries a Sortino ratio tile (`sortino` in `SERIES_STATS`)
  unless the methodology already reads it, never an alpha tile beside the
  Alpha card; the risk grid leaves out a cell another card draws (Return
  beside Returns by period, Volatility and Beta beside the methodology's own
  tiles, Worst fall beside Good and bad days, Max drawdown beside the
  drawdown) and names where it is; the look-through is a table without a
  chart. On Holdings the Cash group holds only cash and No class yet only
  listed holdings; Where the money is has no currencies tile (the
  Currencies tab) and lists accounts only when there are several. On Trades
  the statistics row leaves the average win and loss to When you win and
  when you lose while that section is on. Every series card
  on Performance is live (`components/performance/performance-live.tsx`,
  client, `PerformanceLive`; Hamza, 19 Oct 2026): `liveSeriesBook` in
  `lib/live.ts` lays the session's prices on the value series and the
  benchmarks, so every figure is computed again with today in it, badged
  Live, and after the bell on the session's date. A row of figure tiles is
  always full (`tileSpans` in `components/dashboard/sections.tsx`). Then Good and bad days (slot
  `day_stats`, `dayStats` in `lib/performance.ts`,
  `components/performance/day-stats.tsx`: the share of up days, the best
  and worst, the longest runs, and the book's days against SPY's, how often
  it beat SPY and its capture on SPY's up and down days); the
  methodology's checks and the weights against caps are on Methodology and
  Holdings, not the Dashboard (Hamza, 15 Oct 2026); what is on watch, the latest
  review, then the methodology's own sections in its order. A section whose figures all read the value series
  (returns, volatility, beta, drawdown; `readsSeriesOnly` in
  `lib/screens.ts`) leads Performance instead, as tiles, when that screen
  is on; one that lists the holdings one by one or class by class (the
  holdings panel, or a figure grouped by holding, symbol or class;
  `readsByHolding`) is left to Holdings, whose positions, class donuts and
  Classification Register show them, and so is one that only measures what
  the book is made of (`readsComposition`); the Dashboard draws no holdings
  list of its own (Hamza, 15 Oct 2026) but the portfolio grid's table
  (Hamza, 21 Nov 2026: "a bloomberg terminal grid layout like that qualtrim
  portfolio page", overriding that rule for this one table): slot
  `portfolio_grid` right after the year strip (`PortfolioGrid` in
  `components/dashboard/portfolio-grid.tsx`, client, drawn inside
  `BookNow` on its live quotes; the pure `lib/portfolio-grid.ts`:
  `gridRows`, `GRID_TABS` Overview, Performance, Valuation, Fundamentals
  with `GRID_COLUMNS` and `cellOf`, `dayMovers`, `gridFair`,
  `foldAllocation` to `ALLOCATION_TOP` and Other and Cash), one ruled grid
  (`.term-grid`, `.term-cell`, `.term-label` in globals.css) of the value
  on its year's range, the allocation ring, every holding in a table with
  a sticky company column and `GRID_ROWS_SHOWN` before Show all, the day's
  contributors and detractors and the book against the person's bases; net
  worth and the day tile are then not drawn again under it. One with a figure over the market
  indicators is Markets' own (`marketSections`; the screen is named Macro, Hamza,
  19 Oct 2026, the first section's name under its title), so the Dashboard leaves it out while Markets is on (Hamza,
  18 Oct 2026). Holdings opens with one composition card
  (`DonutTabs` in `components/charts/donut-tabs.tsx`, client: pill tabs
  inside the Donut, `before`, and the list with shares and bars beside it,
  `aside`, `SliceBars`; Hamza, 19 Oct 2026), whose tabs are the slots
  that are on, in order: Holdings (`by_holding`), Classes (`by_class`),
  Asset classes and Currencies (`allocation`), Sectors
  (`holdings_by_sector`) and Regions (`revenue_regions`; `revenueByRegion`
  in `lib/exposure.ts`: each reported line in the one region it names, so
  no slice overlaps), each a `DonutView` built by `holdingView`,
  `classView`, `assetClassView`, `currencyView` and `regionView`; then the
  positions, the class groups, the correlation matrix, concentration, the
  Classification Register and where the money is (no donut of its own). After
  the positions come Against your fair value (`fair_value`; `fairValueBook`
  in the pure `lib/fair-value.ts`, `components/holdings/fair-value.tsx`;
  Hamza, 4 Nov 2026): each listed holding's price against the base of its
  record's `ownValuation`, the bear and bull beside it, and the valued book
  by value, its fair value each holding's worth times base over price,
  below, at (`AT_VALUE_PCT`) or above, the company page's `YourValueSection`
  the same for one company; then the portfolio's P/E (`portfolio_pe`; `portfolioPe` in
  the pure `lib/portfolio-pe.ts`: the harmonic mean of the listed
  holdings' `pe_ratio` by value, and the year's range from each holding's
  closes against its trailing EPS as known then, the filings' `epsTtm`
  from `ttmEpsHistory` in `lib/edgar-facts.ts`, a quarter known
  `EPS_KNOWN_AFTER_DAYS` after it ends, at today's shares and rate; a
  holding without them named; `components/holdings/portfolio-pe.tsx`) and
  what each holding made (`what_made`; `whatEachMade` in the pure
  `lib/holding-made.ts`, past year or since the start, `?made=`;
  `components/holdings/what-made.tsx`: a heat map, each holding sized by
  what it made or lost and coloured by its return, `moveFillAt` and
  `moveInkAt` in `lib/market-day.ts` at its own full scale; Hamza, 19 Oct
  2026). A composition
  section that only counts the holdings, takes the top few's share or
  weighs them by holding or sector repeats Concentration and Sectors and is
  not drawn (`repeatsConcentration` in `lib/screens.ts`); Sectors looks
  through funds (`sectorsLookingThrough` in `lib/exposure.ts`) and Where
  the money is has no net worth tile, asset-class list or themes list
  (Hamza, 19 Oct 2026). What needs a decision is on
  Notifications, not the Dashboard, and the Dashboard carries no
  unread-notifications link; the badge on Notifications does (Hamza, 18 Oct
  2026). The session's cards run in one piece
  under the chart (Hamza, 16 Oct 2026): the indices, the book's day right
  under them as a heat map (`BookDayCard`: each holding sized by weight,
  coloured by its move in the map's colours, `moveFill` and `moveInk` in
  `lib/market-day.ts`, every holding in view at a floor of its own,
  `inViewSize` in `lib/treemap.ts`, the list folded under it), the S&P 500 heat map
  with what drove the S&P 500 and QQQ inside its card as tiles (`HeatMap`
  takes `drivers`; the drivers card stands alone only without the map;
  Hamza, 19 Oct 2026), the movers (`BookNow` in
  `components/live/live.tsx`; After the close and What happened left for
  At the Close on 18 Oct 2026). Each session card keeps
  one title open or shut (How the US indices are doing, How your book is
  doing, What is driving the S&P 500 and QQQ), since its badge says which,
  and the book and drivers cards open with a line saying what a point is;
  the caps at today's prices are not on the Dashboard (Hamza, 18 Oct 2026); until the session's
  read comes back the holdings' own closes name the last session, so the
  tile is never blank, and the page asks again by itself
  (`RefreshWhilePending`). Above On watch, CNN's fear and greed index on a
  gauge (`fear_greed` slot; `fearGreedView` in `lib/markets.ts`, the card
  in `components/dashboard/fear-greed.tsx`; Hamza, 16 Oct 2026). Trades opens with Where the profit came from (slot `trade_costs`; Hamza, 20 Oct 2026): `profitSources` in `lib/trades.ts`, a waterfall on its side (`components/trades/profit-waterfall.tsx`) from capital gain, realised P&L, dividends received, taxes, fees paid and other transactions to the total, the total being the account's change over the window less the flows and `series.unlisted`, capital gain the rest; then `tradeCosts`: the commission and tax each Flex fill carries (`ibCommission`, `taxes`, kept as costs on the transaction, `commission` and `tax`), the tax withheld on dividends (`tax` on the withholding row) and the cash ledger's fees, a field the statement lacks unread, never zero. Trades lists the latest seven fills
  with a link to all of them, what a win makes against what a loss costs
  (`winLoss` in `lib/trades.ts`), the rotations (`rotationsOf`: a sale's
  proceeds shared over the buys of other symbols within `ROTATION_DAYS`,
  each judged by the closes since the sale, `rotationOutcomes`) and every
  company traded, each with its own page (`/trades/[symbol]`): the daily
  closes over six months, a year or five years (`TRADE_SPANS`, read by
  `loadCloses` with that many days) and every buy and sale marked on the
  line with what was bought or sold (Hamza, 15 Oct 2026). Trades, Trade check, Decision Log and
  the to-do hang on a practice (`PRACTICES` in `lib/ontology.ts`). Trades is
  on for everyone (`DEFAULT_PRACTICES`); the other three are off by default
  and drawn only once the person adds them on Customise, which marks
  the ones the methodology names (`practices`, or its own words for a
  methodology recorded before the field, `practicesOf` in `lib/screens.ts`)
  as a suggestion, never a switch. A new trade in the broker's ledger
  asks for its reason on Notifications (`tradeNotices` in `lib/alerts.ts`,
  keyed `trade:`); the answer is a Decision Log entry, kept whether or not
  that page is on. They and their slots are tables in `lib/ontology.ts` (`SCREENS`,
  `SLOTS`), each with the condition that draws it (`SHOWN_WHEN`);
  `lib/screens.ts` reads the methodology and the book and says what is on,
  and derives caps, weights, signals, clocks and notices from the
  methodology's own rules; `lib/screen-data.ts` hands every screen the same
  data. A slot the methodology asks for but the data cannot fill says what
  it needs; a slot it never asks for is not drawn. A new screen or slot goes
  in the tables with its condition, never in a page by hand, and
  `npm run check:screens` holds it.
- **Two layouts:** iOS patterns below 1024px (tab bar: Dashboard, Holdings,
  Performance, At the Close, More; the first three `tab` screens in the order
  `screensOn` gives, so Dividends takes Performance's place when a
  methodology puts it first, then At the Close, `LAST_TAB` in
  `components/app/nav-items.ts`, in Earnings' place; Hamza, 23 Oct 2026), a menu at the top of the page at 1024px and
  up (`components/app/top-bar.tsx`; Hamza, 19 Oct 2026: not a sidebar): the
  brand, then every screen under one of six places, always in this order,
  each a menu opened on hover or focus (`NAV_GROUPS` and `groupNav` in
  `components/app/nav-items.ts`; Hamza, 4 Nov 2026, replacing the 19 Oct
  Portfolio, Markets, Research, Rules and reviews): Today (Dashboard,
  Notifications, At the Close), Book (Holdings, Performance, Dividends,
  Trades, Options, Fixed income, Private funds, Real estate, Statements),
  Research (Companies, Watchlist, Theses, Earnings, Research, Analyst,
  Agents), Markets (Macro, Calendar, Screener, Top funds, Community; split
  from Research, Hamza, 6 Nov 2026: "too many pages to choose from"), Rules
  (Methodology with its Evaluation view, `extras`, Triggers and kill
  signals, Trade check, Decision Log, Methodology to-do) and Reviews; the
  person's order holds within a place, a place with one screen on draws it
  alone (Reviews), no More, and a screen no place names stays alone after
  them; then the search (`SearchButton`, below), the portfolio selector
  (`PortfolioMenu` in `components/app/top-menus.tsx`: one portfolio is
  named and offers no choice, `portfolioLabel` in `lib/portfolios.ts`,
  "Hamza's IBKR" for a default-named single account; several offer all
  together, one alone, or the ones ticked put together, `lensFor` saving
  their ids joined by `LENS_JOIN`, `lensIds` reading them back, `lensView`
  laying the union of their accounts under the setup's methodology), Settings, a menu
  opened on hover or focus with Setup and Customise as its tabs, and any
  screen set up once (`under: "more"`; none since Newsletters and the SEC
  contact moved onto Setup's cards, Hamza, 19 Oct 2026) (`SETTINGS`
  and `settingsHrefsFor` in `components/app/nav-items.ts`). The bar
  sits on the page's own ground with one hairline under it (`.top-menu` in
  globals.css; Hamza, 11 Nov 2026). The screen `more` is named Settings: on a phone the More
  tab opens it (`/more`, the same tabs and the boundaries, no Sources
  section); a laptop never links it. Stealth mode (Hamza, 19 Oct 2026) is
  the eye left of Settings and in a phone's title bar (`StealthToggle` in
  `components/app/stealth.tsx`): the `pos_stealth` cookie, read in the root
  layout into `data-stealth` on `<html>`, so the first paint is already
  hidden (globals.css hides the body until masked, two seconds at most);
  `StealthMask` walks the page and every change to it and puts
  `STEALTH_MASK` over each amount `maskMoney` finds (`lib/stealth.ts`,
  pure: a currency sign or code beside a number), text and titles alike,
  the person's own money only (Hamza, 7 Nov 2026): a screen under
  `PUBLIC_PATHS` (`publicPath`) keeps its amounts but those inside
  `data-private` (a holding's value on a company page); any other hides all
  but those inside `data-public` (the S&P 500 heat map, extended hours,
  company news),
  and puts them back when it is switched off. Percentages, counts and
  prices quoted without a currency stay; nothing is sent. What each source holds and since when
  is on Setup, where the IBKR card's state reads Current or Stale (a week).
  At the far right the account menu, the person's initials in a chip
  (`AccountMenu`, `initialsOf`): Account settings (`/account`: the sign-in,
  a password change for an email account, `changePassword` in
  `lib/users.ts`, the theme, sign out), Profile (Setup's Your account),
  Help and support (`/help`), Privacy, Cookies (`/cookies`, public, every
  cookie and local note) and a Dark, Light or System switch; on a phone the
  same links are on the More tab and the selector sits over the page
  (`LensBar`). Navigation shows only the screens `screensOn()` and
  `modulesFor()` switch on.
- **The verdict first, cited in the margin, and one search** (Hamza, 4 Nov
  2026). The Dashboard opens, before the year strip, with one line:
  Resonance (`resonanceOf` in the pure `lib/resonance.ts`, from the
  methodology's own findings, `evaluate`, the same the Checks view and
  `run_checks` read): the rules kept (pass or near) out of the rules the app
  can measure, rounded, watches counted apart as tripped since a watch is a
  level and not a rule; the breaches, the guidelines outside, the rules
  yours to check and those waiting for data each counted apart, never as
  kept; with nothing measurable no score, never a zero; and the decisions
  owed (`decisionsOwed`: the to-do's Now items whose action is a decision,
  `DECISION_ACTS`, and the new trades still asking for a reason, a sale
  counted once), each part a link to where it is answered (Methodology's
  checks, the to-do when it is on, else Notifications); `RESONANCE_ABOUT`
  says what it means beside an (i). With no confirmed methodology it says
  what it waits for; under one methodology per portfolio it says each is
  read below (`components/dashboard/resonance-line.tsx`). The line is a
  count with links, not the checks: they stay on Methodology, the decisions
  on Notifications and the to-do, the unread count on the Notifications
  badge. From 1024px a
  verdict card cites its rule in a narrow margin at its right behind a
  hairline, Plex Mono, tertiary (`Cited` in `components/ui/cite.tsx`,
  `.cite-margin` in globals.css; `sectionMark` in the pure `lib/cite.ts`:
  "§3.1", a named section as written): Methodology's checks (each with the
  figure it tests), the Resonance line (the rules not kept) and Holdings'
  class groups (the caps their weights are read against); below 1024px the
  margin is not drawn and the card's own inline section stays
  (`cite-inline`). The search palette (`Palette` and `SearchButton` in
  `components/app/palette.tsx`, client; `paletteResults` in the pure
  `lib/palette.ts`) opens on ⌘K or Ctrl+K, the top bar's Search and the
  phone title bar's magnifier: the tickers held, watched and traded
  (`tickerEntries`, each to `companyHref`), the person's own screens and
  Settings, the methodology's rules (`ruleEntries`, Methodology at
  `#rule-<id>` in Checks, else Rules), and anything else to the Companies
  search (`companiesSearchHref`, `/companies?q=`); matched in the browser,
  sent nowhere, no amount in an entry. `npm run check:screens`.
- **Every company has a page, opened from its ticker** (Hamza, 20 Oct 2026,
  after Qualtrim's Insights): `/company/[symbol]` (`companyHref` and the
  pure helpers in `lib/company.ts`, `historiesFor` in `lib/company-run.ts`)
  for a holding, a watchlist record, a company with a report or one traded:
  the price and the next results; the brief, the company now in parts
  (Hamza, 20 Oct 2026: the report after the results is one part, never the
  whole): the week's headlines and filings, the last and next results and
  the thesis on file, and for `BRIEF_DAYS` after the results the report
  after them with how the stock took it (`briefReport`) beside them; key figures from the filings'
  fields in four groups (`statGroups`: a field not read is left out, never a
  zero); the price over a year and the valuation metric over five years; the
  report's quarters and years, else the filings' own (`years` and
  `quarters` on the filings entry, `studyTable` and `quartersOf` at each
  read; Hamza, 23 Oct 2026: never waiting for the next results), and the
  filings' per-share figures as columns (`companyCharts`,
  `components/company/company-charts.tsx`); revenue by segment over time
  as stacked columns (Hamza, 4 Nov 2026, after Qualtrim: `SegmentRevenue`
  on `StackedColumns` in `components/charts/stacked-columns.tsx`, by
  segment or product, quarterly or annually, a hover with each part's
  amount, share of the column and growth on a year; `segmentChart` in
  `lib/company.ts`, the first `SEGMENT_HUES` lines and the rest as Other),
  read from the three latest 10-Qs and the latest annual report
  (`segmentHistory` in `lib/edgar.ts`, `segmentSeriesOf`,
  `mergeSegmentSeries` and `segmentHistoryFilings` in
  `lib/edgar-segments.ts`; a fourth quarter is the year less its first
  three, `derived`, said so) into the filings entry's `segmentHistory` by
  the filings read, read again only when the filings change or the history
  was kept under an earlier `SEGMENT_HISTORY_VERSION`; places never mixed
  with what the company sells (Hamza, 5 Nov 2026: `SEGMENT_FAMILIES`
  segment, product and geography; `lineKinds`: an axis whose members are
  all places is geography, one mixing places with businesses is no split,
  `mixed` and `mixedNote`; a geography period reconciled by
  `reconcileGeography`; a history kept before, `separateHistory`; the
  report's one business split, `businessLines`; each `SegmentLine` carries
  its `kind`); what it sells and where each its own chart over time, never
  a donut (Hamza, 7 Nov 2026: `segmentFamilies`, `SegmentRevenue` with
  `only`, the segments and products on one switch, the geography beside);
  insiders over the past year, year to date, six or three months
  (`INSIDER_PERIODS`, `InsiderPeriods`), no read date; any company the
  filings file does not keep, traded before or not, read on opening; the thesis and the record, linked; the week's news.
  Nothing is forecast by the app. The one analyst estimate read is Nasdaq's
  consensus EPS (Hamza's ruling of 23 Oct 2026, "both", overriding the rule
  that none is read): labelled as the analysts', read now only, never a
  verdict, a test or a line on a chart (below, Forward multiples), save
  the one card that draws them by year (Hamza, 21 Nov 2026, after
  Qualtrim's estimates: `estimateBars` in `lib/forward.ts`, the filed years'
  diluted EPS solid, `FILED_YEARS_SHOWN`, then Nasdaq's years hatched with
  their `low` and `high` as a whisker, each bar's growth on the one before,
  `EstimatesCard` in `components/company/estimates.tsx`, said to be theirs).
  The financials are one ruled grid of small charts, each with its latest
  figure and its change on a year before (`chartHeadline` in
  `lib/company.ts`), right after the key figures, themselves one grid of
  four groups. Its ecosystem (Hamza, 21 Nov 2026: "intrgrate these", with
  Qualtrim's ecosystem page; `lib/ecosystem.ts` pure, `lib/ecosystem-run.ts`
  server-only, `components/company/ecosystem.tsx`, the agent `ecosystem`,
  `shared`): the suppliers, customers, partners and competitors the latest
  10-K, 20-F or 40-F names (`latestAnnualOf`, `annualReport` in
  `lib/edgar.ts`), from its business section through the risk factors and
  the paragraphs elsewhere that give a customer's share of revenue
  (`businessSections`, `ECO_MAX_CHARS`), one Haiku call with no web search
  (`ecoRequestBody`, `record_ecosystem`); `parseEcoResponse` keeps a
  relation only when its quote is printed word for word in that text and
  names it, a ticker only on the SEC's list (`knownTickers`), a share only
  when its quote prints it. Kept in the registry's `company_figures` under
  kind `eco`, read again only for a newer report (`ecoCandidate`,
  `ecoNeedsRead`: from `ECO_RECHECK_DAYS` after the last, the SEC asked
  weekly), a failed read keeping the last good one; `ECO_PER_RUN` of the
  index the largest first at the 05:00 UTC run on the operator's meter
  (`readEcosystems`), and on opening the app the first held or watched
  company with none on the person's (`ecosystemOnOpen`). The demo reads
  none. The page carries Against its peers and its sector after the valuation chart
  (`PeerValuation`). The ticker links to it
  on Holdings (the donut list through `Slice.href`, the positions, the class
  groups), the heat maps, the watchlist, Earnings, Theses and Trades; the
  record (`/holdings/[symbol]`) stays where the rules, triggers and decisions
  on a holding are, linked from the page. Any public company has one too
  (Hamza, 21 Oct 2026): Companies (`/companies`, under Research, shown
  always) searches the SEC's list by ticker or name (`searchCompanies` in
  `lib/edgar-facts.ts`, matched in the app, `SEARCH_MAX` at most) above the
  holdings, the watchlist and the companies traded before; a company
  neither held, watched, reported nor traded is read when its page opens
  (`publicCompanyEntry` in `lib/company-run.ts`: facts, profile, Form 4s and
  short interest, no segment note or geography, shared for the day in the
  data cache under the ticker alone, kept in no vault), and Add to
  watchlist on the page puts it on the morning read. The demo opens only
  the companies it carries. A foreign private issuer (`foreignFiler`: a
  20-F, 40-F or 6-K, or figures in another currency) files no Form 4, and
  the insiders card says so.
- **Insiders, short interest, the options' move and what the markets bet on**
  (Hamza, 21 Oct 2026, after Unusual Whales). Insider trades come from the
  SEC's Form 4 (`lib/insiders.ts`, pure; `insiderForms` in `lib/edgar.ts`):
  each form on the issuer's submissions list since `INSIDER_READ_DAYS`, read
  once by its accession (`FORMS_PER_RUN` a company a run, newest first), the
  open-market purchases and sales alone (codes P and S; awards, exercises,
  tax withholding and gifts counted and left out), a 10b5-1 plan marked from
  the form's box or a footnote. Kept on the filings entry (`insiders`) by
  `readFilingsInto`; two fundamentals come from them over `INSIDER_DAYS`,
  `insider_net_buying` (US dollars) and `insider_buyers`, and each purchase
  filed within `INSIDER_NOTICE_DAYS` is an alert (`insiderNotices`, keyed
  `insider:`). The company page draws them under Peter Lynch's line
  (`LYNCH_QUOTE`, words and name exactly; `components/company/insiders.tsx`).
  Short interest is FINRA's twice-monthly file (`lib/short-interest.ts`,
  pure; `loadShortInterest` in `lib/markets-feed.ts`): the newest published
  settlement date (`settlementDates`, the 15th and the month's end moved back
  over weekends and `MARKET_HOLIDAYS`), the file read whole and the person's
  symbols picked out, either delimiter and either header naming; kept as
  `shortInterest` on the filings entry with `short_interest_pct` (over the
  filings' shares outstanding, none for a filer in another currency) and
  `days_to_cover`. The expected move (`lib/expected-move.ts`, pure;
  `loadExpectedMove`): the at-the-money straddle of the first expiry that
  trades on the results over the price, from Cboe's delayed quotes, read by
  the earnings run in the `EXPECTED_DAYS` before each report until the
  session that trades on it opens (`readExpected`, kept in the earnings
  file's `expected`), drawn on Earnings and the company page and set beside
  the move made on the report (`expectedMove`, `againstPriced`). The economic
  calendar is a table from the publishers' schedules (`lib/econ-calendar.ts`,
  `ECON_EVENTS`, extended each year like `MARKET_HOLIDAYS`; `econTableNote`
  says when it runs out), drawn as a month grid, Monday to Friday, a day's
  releases under it (`EconMonth`, `components/markets/econ-month.tsx`;
  Hamza, 23 Oct 2026; a week by default, the month on a switch, Hamza,
  6 Nov 2026), slots `market_calendar` on Macro and
  `economic_calendar` on Calendar, no consensus or forecast. Since 27 Oct
  2026 (Hamza) it also holds the ECB's, the Bank of England's, the Bank of
  Japan's, the Bank of Canada's and the SNB's decisions, OPEC+ meetings,
  the major summits and the national elections whose dates are set, each
  from its own official page, the whole week drawn in a month with a weekend
  event; `ECON_LAST` keeps each kind of release's last date and
  `ECON_THROUGH` is the earliest of them, so one kind running out (JOLTS,
  until the BLS sets 2027) is named by `econTableNote` even while the others
  reach further; elections, summits, deadlines and OPEC+ count for none. Each event says what it
  touches in the book (`eventReach` and `reachWords` in the pure
  `lib/econ-exposure.ts`: the revenue the holdings report in that economy, a
  wider region's line apart, the share held in its currency, and the
  methodology's figures and rules on the indicators it moves,
  `EVENT_READS`), and each day with events is an alert the day before and
  on the day (`econNotices`, keyed `econ:`), carrying that reach. One
  calendar holds every date (Hamza, 27 Oct 2026): the Calendar screen
  (shown always, `economic_calendar` first) draws the table, what the
  Calendar agent found and the followed companies' results
  (`resultsEvent`) in one `EconMonth`, built by `calendarView` in
  `lib/calendar-run.ts` (server-only); a past result with a kept report
  (`reportEvent`, `REPORTS_BACK_DAYS`) and a macro event with its report
  are drawn with a chip that opens it (`eventLinks` in the pure
  `lib/calendar-links.ts`, by `linkKey`: the earnings report, the event's
  report on the Calendar; Hamza, 6 Nov 2026); Macro's `market_calendar` is the
  next two weeks and a link (`NextOnCalendar`), and Earnings'
  `earnings_calendar` the next result and a link. Each event carries its
  history (`lib/event-sensitivity.ts`, pure, on the past dates and outcomes
  in `lib/event-history.ts`, a table extended as events pass): today's
  weights times each listed holding's close-to-close move on the session
  that traded each past occurrence, beside SPY's, by outcome (cut, hold or
  hike; inflation higher or not; unemployment up or not; a US election),
  each with its mean and Student's t interval, range and share of falls; a
  session with under half the book's closes is no reading. The prediction
  markets weigh an event's outcomes into one expected move where their
  question lines up with the history's (below, Each event's market); a company's results take
  its `reactionHistory` moves and the options' price. History at today's
  weights, labelled so, never a forecast. The Calendar agent
  (`lib/calendar-agent.ts`, pure; `lib/calendar-agent-run.ts`; the vault's
  `calendar_events`) looks `CALENDAR_AHEAD_DAYS` ahead once a month on the
  person's Claude key (web search, `CALENDAR_SEARCHES`) for the elections,
  summits, OPEC+ meetings and deadlines the table lacks, each with its
  official https page, read item by item and dropped when already held
  (`alreadyHeld`); its days are alerts under `FOUND_PREFIX`. The weekly and
  monthly review lay the next seven days' events with their reach and
  history (`withWeekAhead`, slot `review_week_ahead`, after Coming up; a
  page of the review). After each event
  (Hamza, 27 Oct 2026; `lib/macro-report.ts` pure,
  `lib/macro-report-run.ts` server-only, the vault's `macro_reports`, slot
  `event_reports` on Calendar): once the session that traded an event
  (`tradedOn`: its day, the next session for an election or a deadline, after
  a summit's last day) has closed (`closedBy`), within `MACRO_DAYS`, the
  report sets the session's close-to-close moves of SPY, QQQ, IWM, TLT, UUP,
  GLD, USO and the economy's fund (`gaugesFor`) and the book's at today's
  weights (`macroFigures`, the holdings that moved it most; under half the
  book's closes is no reading) beside its history on the outcome
  (`eventSensitivity`), what the deeper market priced the day before
  (`pricedSoon`, `stillPriced`, `withPriced` with `by`, kept in the file's
  `priced`; the report's `pricedBy`) and the reach; each reading of an
  outcome is kept (`readings`, `readingsOf`), and the Calendar opens with
  Being read now (`macroInProgress`, `BeingRead`: waiting for the close at
  the person's own time, due at the next run, or not final with each reading and
  the next), the same pill on the event's day (Hamza, 28 Oct 2026); on a Claude key
  the outcome, what was expected, what differed and why the markets moved
  come from the web (`macroRequestBody`, `record_outcome`, `MACRO_SEARCHES`,
  parsed item by item, `parseMacroResponse`; the moves are the app's), behind
  the agent `macro_reports` (`mayRun`). An outcome not out yet (a count
  going on, talks still sitting; `final: false`) is kept as not final, said
  so on the report, the deck and the email, and read again every
  `MACRO_RETRY_HOURS` (`retryDue`, `triedAt`, the last reading given back)
  within `MACRO_RETRY_DAYS` of the session, by the evening read, the morning
  refresh, the 18:00 UTC alert check and `catchUpOnOpen`; each reading
  again that brings news is an alert and an email of its own, saying when it
  was read and what is known (`isUpdate`, `newsReadings`, keyed with
  `UPDATE_MARK` and the time); one that says what the last said, by the
  model's `news` or in the same words (`sameWords`), is kept on the report
  and told to no one (Hamza, 29 Oct 2026: only an actual update), and once read final the outcome is
  one too (`outcomeAt`, keyed with `OUTCOME_SUFFIX`), each counted in the
  push (Hamza, 28 Oct 2026). An event is told in one step (Hamza, 7 Nov
  2026, replacing the two steps of 4 Nov: "investors will react
  momentarily"): the outcome and how investors took it are read together
  from `readFrom`, `REACTION_MINUTES` after `releaseAt` (the event's time on
  its calendar line, New York, Frankfurt or London, as an instant); with no
  clock, from midnight UTC after an election or a deadline, `BOJ_FROM_UTC_HOUR`
  for the Bank of Japan, else `EARLY_FROM_UTC_HOUR` on its last day; never
  waiting for the US close. Not final, it is read again every
  `EARLY_RETRY_HOURS` for `EARLY_RETRY_SPAN_HOURS`, then every
  `MACRO_RETRY_HOURS` (`retryHours`). Every report is `stage: "reaction"`;
  one kept with `"outcome"` before 7 Nov is read once more. The session's
  moves are kept only when its closes are in. The results watch reads them
  too (`macroReadDue`). No
  report is a deck, a page or a PDF (Hamza, 29 Oct and 4 Nov 2026: "just
  as emails or notifications ... much shorter"): three parts, what happened
  (`decided`), the outcome against what was expected (`againstExpected`)
  and how investors took it (`markets`: the model's reading of the day's
  reporting, rotations and the groups bought and sold, a move tied to the
  event only where the reporting does, no index figures), then the pages.
  The model is given no move and nothing of the book (`macroFacts`); the
  session's moves and the book's are still computed and kept
  (`macroFigures`) but drawn nowhere, since a day's index move cannot be
  told apart from the rest of the day's news. The Calendar draws the three
  parts (`components/markets/event-reports.tsx`), and it is an alert for
  `MACRO_NOTICE_DAYS` (`macroNotices`, keyed `macro-report:`, no figures),
  counted in the close's push and sent as its own short email, no
  attachment (`macroReportEmail` through `sendEarningsReport`). Run by the evening read, the morning refresh and
  `catchUpOnOpen`. The demo reads `data/samples/macro_reports.json`,
  fictional. `npm run check:exposure`. The prediction
  markets (`lib/odds.ts`, pure; `loadOdds`): Kalshi's KXFED markets read at
  the range's two bounds (the range from the effective rate) for the next
  meeting's cut, hold and hike, the meeting's own event first
  (`kalshiEvent`: 2026-10-28 is KXFED-26OCT, from `nextFomc`), else the
  series a page at a time by its cursor (`KALSHI_MAX_PAGES`), since its
  first page lists the meetings furthest out; no reading says which meeting
  and levels (`fedOddsGap`), and Polymarket's open US recession market;
  slot `market_odds`, the markets' prices, never the app's forecast. The
  Fed's reading is the deeper of Kalshi's and Polymarket's decision event
  (`parsePolymarketFed`, `deeperFed`, `fedSourceWords`: `source`, `traded`,
  `open`, the other's as `other`; Hamza, 28 Oct 2026). Each event's market
  (`lib/event-odds.ts`, pure; `loadEventBets`, Hamza, 28 Oct 2026): every
  non-results event within `ODDS_DAYS` is asked of both by its own
  question (`oddsQuery`: a bank's decision in its month, CPI's annual
  buckets, KXU3, KXGDP, an election by its country and day, a summit or a
  deadline by its name), each answer read by `polymarketBet` or
  `kalshiBet` into outcomes and, where they map onto the history's labels
  (cut, hold, hike; above the last reading or not, `lastReading`), its
  `prices`; `chooseBet` keeps the deeper with `MIN_TRADED` traded, the
  history-shaped first, and `noBetWords` says why none; the Calendar draws
  it under each event (What the markets bet on, `betView`) within
  `ODDS_BUDGET_MS`. The
  guard holds FINRA, Cboe, Kalshi and Polymarket to `lib/markets-feed.ts`
  and the pure `lib/event-odds.ts`.
  The demo reads `data/samples/odds.json` and the earnings sample's
  `expected`, fictional, and no insider form or short interest.
  `npm run check:research`, `check:markets`, `check:earnings`.
- **The screener runs the person's classes on the S&P 500 and the
  Nasdaq-100; the top funds are ranked by them** (Hamza, 21 Oct 2026,
  after Unusual Whales). The Screener (`/screener`; `lib/screener.ts` pure,
  `lib/screener-run.ts` server-only; shown `classes`, slots `screen_classes`
  and `screen_near`) reads the session's list (`universeOf` on
  `loadMarketDay`'s moves and others) into the vault's `screener` file a
  share at a time (`companiesToRead`: never read first, the largest first,
  then past `SCREEN_REFRESH_DAYS`, a failed read past `SCREEN_RETRY_DAYS`;
  `SCREEN_PER_RUN` at the 05:00 UTC cron, `/api/cron/screener`, and
  `SCREEN_ON_OPEN` in `catchUpOnOpen`), each company's fundamentals derived
  by `fundamentalsOf` at the close exactly as a holding's (`keptValues`: the
  ontology's fields alone, never a zero), shared for the week in the data
  cache (the symbol and the week alone in the key), short interest from
  FINRA's one file, and the engine from each company's own segment note
  (`segmentLines` and `engineOf`, as for a holding; until a company's note
  is read, `withEngineStandIn` lays company revenue growth in its place, as
  `engineOf` does for a filing with no segment line, and the screen counts
  them; Hamza, 23 Oct 2026). A company the person's filings read keeps that read.
  `screenOf` puts each in the first class whose `classTest` holds, the
  largest first, lists those one criterion short with what failed, and names
  the fields the screener reads for none (the engine, the insiders). The
  screen opens as a table, after TradingView's (Hamza, 23 Oct 2026;
  `lib/screener-table.ts` pure, slots `screen_table` and `screen_map`):
  every company of the session's lists a row (`tableRows`: price, move and
  market value from `loadMarketDay`, P/E, EPS and revenue growth, dividend
  yield and ROIC from the file, the class `screenOf` placed it in), filter
  pills of fixed choices in the address (`SCREEN_FILTERS`, `sectorFilter`,
  `classFilter`, `chosenFilters`; `FilterPills` in
  `components/screener/filter-pills.tsx`), every column sorting
  (`sortRows`, a figure not read last either way), `TABLE_SHOWN` rows before
  Show all, and a heat map of what the filters leave (`mapDay` into
  `HeatMap`); a filter on a figure leaves out a company not read, never
  passing it. No price band (Hamza, 24 Oct 2026: irrelevant to an
  investment screen); the methodology adds its own (`screenFilters`,
  `methodologyLevels`): each filings figure its classes compare with a
  number is a pill at that level both ways, and a level on a figure a fixed
  pill reads joins that pill's choices. Your classes is the third view (`ClassBoard` in
  `components/screener/class-board.tsx`; Hamza, 23 Oct 2026): one bar of the
  whole list by class in the classes' hues (`classColor`), each class a card
  in its hue with its test in words and its companies as tiles, the largest
  first, their criteria held as pips, then those one criterion short. The
  filter pills sit above the table (`relative z-30`), since each section of
  a page is its own layer while it rises in. Top
  funds (`/top-funds`; `lib/funds.ts` pure, `lib/funds-run.ts` server-only;
  slots `fund_ranking`, `fund_moves`) reads the latest two 13F-HRs of
  `FUNDS` (long-term managers, each CIK checked against its SEC record)
  through `thirteenFs` and `thirteenFTable` in `lib/edgar.ts` weekly
  (`fundsDue`): the information table by CUSIP, options left out
  (`parseInfoTable`), the `MAX_POSITIONS` largest kept, each matched to its
  company by `issuerCompany` in the SEC's list (the 13F's abbreviations
  written out, a cut name the start of exactly one company's; a table in
  thousands put in dollars, `inDollars`; a latest 13F `STALE_FILING_DAYS`
  old ranked last; `FUNDS_READ` reads a fund kept under an older reading (a company list the SEC does not answer throws, so a fund keeps its last good copy rather than none matched; a fund under `MIN_JUDGED_PCT` judged says Not ranked and why)
  again), the quarter's moves
  (`movesOf`). `closenessOf` runs the person's classes on the positions
  (the screener's `placed`) and `rankFunds` orders the funds by the share of
  what could be judged that the classes take, beside the overlap with the
  book. A 13F is US longs at the quarter's end, filed weeks later; the
  screen says so. Beside it, what each fund says it does (Hamza, 9 Nov
  2026: "fetch each fund's methodology and theses and use that to rank
  similarity to the user"; slot `fund_creeds`; `lib/fund-creeds.ts` pure,
  `lib/fund-creeds-run.ts` server-only; the agent `fund_creeds`, `shared`,
  so no one's switch or ceiling applies): once a quarter for everyone
  (`creedsDue`: `CREED_REFRESH_DAYS`, a failed read `CREED_RETRY_DAYS`, the
  last good one kept with `failedAt`), `CREEDS_PER_RUN` at the 05:00 UTC
  run after the shared companies, one Sonnet call with `CREED_SEARCHES`
  searches on the manager's own letters, site, filings and published words
  (`creedRequestBody`, `record_creed`, the fund's name alone in it),
  metered to the first of `OPERATOR_EMAILS`, kept in the registry's
  `company_figures` under kind `fund` (`keptCreeds`). `parseCreedResponse`
  lays it on fixed words item by item: `STYLES`, the figures it looks for
  and which way (`CREED_FIELDS`, the ontology's fields in groups) and its
  theses, each on a ticker or one of `THEMES` with its https page. The
  person's side has no model (`lensOf`: the tests their classes set, a
  figure tested both ways left out, the styles those imply, their stock
  theses, the market theses' baskets and the themes of their words,
  `themesOf`); `creedMatch` is the share of that approach the fund says it
  shares (a figure twice, a style once), less what it wants the other way,
  never below zero and none with nothing to lay it on, beside the companies
  and themes both hold a thesis on; `rankByCreed` orders them and
  `CreedView` draws each fund's words under it, in the app's words with
  every page. The demo's are fictional (`data/samples/fund_creeds.json`).
  Each creed is on the marketplace too (Hamza, 9 Nov 2026: "add the top
  fund's methodologies and theses to the methodology and theses
  marketplace"; `/methodology/market`, now named Marketplace, slots
  `market_funds` and `market_fund_theses`): `creedMethodology` makes a
  fund's approach a draft on the person's own figures and dashboard (the
  starter's when theirs names a class the draft lacks), each figure it
  looks for a guideline citing `STATED_SECTION`, test null, and one class
  on the levels it states alone (a test's `field` and `level`, kept by the
  parser only when `printedIn` finds the number in its words; never a level
  made up), credited through `lineage` with source "market"
  (`adoptFundAction`); a creed read before `CREED_VERSION` is read again.
  `takeFundThesis` takes a stated thesis in (`takeFundThesisAction`, found
  again by `creedThesis` from the kept creeds, never the form): on a company
  its folder, started with the fund's words and page when it has none, else
  an entry, and a company neither held nor watched joins the watchlist; on a
  theme a market thesis under its title, or an entry on the one by that
  title; each entry `via: "you"` naming the fund and its page
  (`fundThesisEntry`, `fundThesisTaken`).
  The demo's screener is the sample's fictional companies
  beside the showcase's holdings (`data/samples/screener.json`), its funds
  fictional (`data/samples/funds.json`), its studies beside the snapshot's
  in `data/samples/showcase.studies.json`. `npm run check:research`.
- **Each company is read once for everyone** (Hamza, 23 Oct 2026: "Shared
  figures only"). The registry's `company_figures` (`sharedFigures`,
  `keepSharedFigures` in `lib/registry.ts`; a company, a kind, its entry and
  when it was read, never an address or who asked; a failed read never
  replaces a good one) keeps the screener's rows (`screen`) and a company
  page's read (`page`). The 05:00 UTC run first reads `SHARED_PER_RUN`
  companies for everyone with the deployment's own SEC contact
  (`fillSharedCompanies` in `lib/screener-run.ts`, `operatorContact` in
  `lib/edgar.ts`: SEC_CONTACT, else the inbox address); a person's run lays
  the shared reads on their file first (`withShared` in `lib/screener.ts`),
  reads only what is still due and shares what it reads. A company page read
  on opening (`publicCompanyEntry`) is kept `PAGE_KEEP_DAYS` with its price.
  A read made at another price is laid at the latest close (`atPrice` in
  `lib/forward.ts`: the multiples with the price, the yield against it).
  Priced-in growth (`implied_growth_pct`, derived in `fundamentalsOf`) is
  the reverse DCF of `lib/dcf.ts` on the filings' trailing free cash flow at
  `dcfDefaults`' WACC and terminal growth, the base path scaled from
  mirrored to six times; a Screener column and filter and a company page
  figure, the app's arithmetic and never a forecast. Any prose stays on the
  person's own key. `npm run check:research`.
- **Forward multiples, peers and the watchlist's reference** (Hamza, 23 Oct
  2026: "use P/E and other relevant valuation metrics at NTM and compare
  valuations to other similar companies and the specific sector"; "both" on
  where the next twelve months come from). `lib/forward.ts` (pure): the
  filings' forward figure is the trailing per-share figure carried a year on
  at revenue growth, never its own (Hamza, 23 Oct 2026: AMZN's one-off gains
  doubled its EPS), held between `FORWARD_GROWTH_MIN` and
  `FORWARD_GROWTH_MAX`; a P/E or P/FCF week above `NOT_MEANINGFUL_ABOVE` is
  a gap on the five-year chart, counted and left out of the range (`grownForward`; `forwardRows` for the five-year
  history), the app's arithmetic and never a forecast; the fields
  `forward_pe`, `ps_ratio`, `forward_ps`, `pfcf_ratio` and `forward_pfcf`
  derived in `fundamentalsOf`, `consensus_forward_pe` from Nasdaq's
  analyst page (`parseNasdaqForecast`, `ntmConsensus`: the fiscal year in
  progress for its months left, the next for the rest; `consensusPe` for a
  price in dollars alone), read by `loadConsensus` in `lib/markets-feed.ts`
  with the filings for the companies held, watched or opened and kept on
  the filings entry (`consensus`). The valuation chart carries Fwd P/E, Fwd
  P/S and Fwd P/FCF (`HISTORY_METRICS`), the consensus as a sentence beside
  Fwd P/E, and the five-year-low alert watches the forward P/E beside the
  method chosen (`beside`, keyed `valuation-low:SYM:forward_pe`).
  `lib/peers.ts` (pure): the peers are the screener file's companies in the
  same GICS sub-industry (kept from the S&P 500's list, `subIndustry`), else
  the same SEC industry code at four, three, then two digits until
  `MIN_PEERS` (`sic`, from the profile), each multiple against the peers'
  median and the sector as a whole (its market value over the figure under
  it), slot `thesis_peers` on a thesis and the company page alike. The
  screener table carries a Fwd P/E column and pill (`forwardPeOf`, the P/E
  over its EPS growth for a read kept before the field). The watchlist
  starts the thesis (Hamza, 23 Oct 2026: "instead of note, it says
  thesis"): adding a symbol takes its thesis, kept on the Theses screen
  (`watchSymbolAction`; the demo keeps it as the note), and each card's
  `WatchEditor` (`components/watchlist/watch-editor.tsx`, client) draws a
  year of closes with the low, base, high and alerts as typed (`levels` on
  `LineChart`) beside a reference (`watchReference` in the pure
  `lib/watch-reference.ts`: the thesis's method, else the stage's useful
  metric, `referenceMetric`; its own five-year range, its peers' median, the
  sector whole and on Fwd P/E the analysts' EPS at its own median, each a
  price on today's per-share figure; Use these fills the five-year lower
  quartile, median and upper quartile, else the peers' median as the base,
  and the alerts at the low and the high) and the class the methodology
  places it in. `npm run check:theses`, `check:research`.
- **ChatGPT signs in like Claude** (Hamza, 21 Oct 2026). The same MCP
  server and OAuth (`lib/mcp-auth.ts`): ChatGPT's callbacks
  (`CHATGPT_CALLBACKS`, one app's under `/connector/oauth/`,
  `isChatgptCallback`) are allowed for a client that registers itself; a
  registration whose addresses are all ChatGPT's is named ChatGPT on the
  consent page; Claude's published client document never sends a code to
  ChatGPT (`clientRedirects`). Setup's card guides both (`CHATGPT_STEPS`:
  developer mode, Create, OAuth). `npm run check:mcp`.
- **No Quartr in the app** (Hamza, 4 Nov 2026: "remove it just in
  general"). No Setup card, prompt, address or tool names it, which
  `npm run check:mcp` holds. The call is the app's own read
  (`withCalls` in `lib/earnings-call-run.ts`), tried again every
  `TRANSCRIPT_RETRY_HOURS` while it has no analysts' Q&A, until
  `TRANSCRIPT_RETRY_DAYS` after the results (`callDue`); a retry that still
  finds none keeps the reading it had. No transcript service is read
  (Hamza, 9 Nov 2026: API Ninjas removed for the beta): the model reads
  the release's filed documents and, on a Claude key, the transcript's page
  it finds on the web. The person's own Claude may still
  write a thesis through `write_thesis`, and `get_results_to_read` says what
  it could read.
- **Lists of things are grids** (Hamza, 19 Oct 2026; drawn as one ruled grid,
  not cards, since 11 Nov 2026: "no cards ... no layers"): `ListSection
  grid` lays its rows out as cells, one to a row on a phone, two from 640px,
  three from 1024px; the rows keep their markup (`ListRow`, `ListLinkRow`, a
  block link) and `.grid-cards` in globals.css turns each into a cell of one
  hairline grid on the page's ground (the label on top, wrapping; the figure
  large at the foot; the chevron gone).
  Holdings, the watchlist, fills, lots, rotations, companies traded, people,
  decks, studies, Decision Log entries, notices, reviews, newsletters,
  senders, options, comparables, fixed-income
  lines, accounts and documents are grids; settings rows, forms and
  label-and-value rows (fundamentals, dates, caps, aggregates) stay rows,
  and so do a holding's triggers and its rules (Hamza, 23 Oct 2026).
  A page in two columns is `.flow-cols` with each column's sections in a
  `.flow-col` (globals.css): the sections flow down the first column and
  on into the second, each kept whole, so no column ends long before the
  other, and a card grid inside keeps two to a row (Hamza, 23 Oct 2026:
  never a long card beside empty space).
  The Theses screen's own grid is `components/theses/thesis-grid.tsx`.
  A card left alone on a grid's last row sits centred (Hamza, 19 Oct 2026):
  `.pair-grid` (two from 1024px), `.pair-grid-md`, `.pair-grid-sm` and
  `.trio-grid` in globals.css split each column in two so the lone card
  starts half a column in; a card that spans the row keeps it. A grid's
  only card fills the row, and two cards on a three-column row share it
  (Hamza, 19 Oct 2026).
- **Portfolios are filters on one book.** The vault's `portfolios` file
  (`lib/portfolios.ts`, pure) groups the book's accounts into named
  portfolios, each account in exactly one, and says whether one methodology
  applies to all (the setup's) or each portfolio keeps its own beside its
  accounts. The lens (`lens` in preferences, null for all) is applied once
  in `lib/workspace.ts` (`applyLens`): `ws.setup` and the book are the
  lens's, `ws.baseSetup` and `ws.fullBook` are as kept, and a save goes
  through `baseSetup` or the portfolio's own methodology, never the scoped
  setup. The combined view under one methodology per portfolio has none:
  the Dashboard and the alerts read each portfolio under its own, and the
  review is of the whole book without a verdict.
  Value series stay only where they are that portfolio's alone.
- **Brokers through the person's own keys, free and read-only.** Schwab,
  Wealthsimple, Questrade, Fidelity, Robinhood and the other brokers
  SnapTrade bridges are read with the person's own SnapTrade Personal key
  (free for their own accounts; nobody holds a deployment key), eToro with
  their own two keys made with Read permission. The keys sit in the vault's
  `connections` beside the Flex token, read only to fetch. `lib/snaptrade-api.ts`
  alone calls SnapTrade (accounts, positions, balances, and its own page to
  connect a broker, asked for read access) and `lib/etoro-api.ts` alone calls
  eToro (GET); the guard holds both. The morning refresh keeps each broker's
  last good copy in the vault's `brokers` file with the rates to the base
  currency read at the fetch (`loadFxRates`); `withBrokers` (`lib/brokers.ts`,
  pure) lays it beside the book wherever the book is read, after the
  statements, and a holding in a currency nothing converts is left out and
  said so. The Flex statement stays the book itself.
- **One holdings model:** `lib/holdings.ts`. Adapters in `lib/adapters/` turn
  each source into it; screens never read a source's own shape.
- **A card that states a market figure places it on a range** (Hamza, 19 Oct
  2026, after Pebble's risk cards): `MarketDef.scale` in `lib/markets.ts`
  gives an indicator a theoretical scale (the VIX 10 to 50, lower better;
  the yields 0 to 6; the curves −2 to 3 or 4, with no better end, since a steeper curve is not better by itself; the recession
  probability 0 to 100, lower better; ...), `rangeOf` falls back to the
  indicator's own year's low and high, and `marketRangeOf` reads a figure's
  recipe (a level, a change on a symmetric scale, better in the
  indicator's own direction or in none, the range position 0 to 100). `RangeBar` (`components/dashboard/range-bar.tsx`) draws the gradient
  track, the marker, the ends, which way is better and the rule's limit as a
  tick; `FigureTile` and `FigureView` take `markets` and `signal`, so the
  tone follows the rule's reading. Status colours never become a series.
- **Lawful sources on the beta** (Hamza, 9 Nov 2026: "Lawful only"). A
  deployment with `SOURCES=licensed` (`licensedOnly` in the pure
  `lib/licences.ts`) asks only the sources whose terms let an app run for
  others show them (`FEEDS`, each with its `why` and `credit`; FRED only
  for `FRED_PUBLIC`, its US government series); terms read 9 Nov 2026 in
  /mnt/project-files/app/invariant-data-without-licences-2026-11-09.md.
  Every feed asks `feedShut(url)` before it fetches (`lib/markets-feed.ts`,
  `lib/podcast-feed.ts`, `lib/sectors-feed.ts`; the guard holds it), and a
  host on no list is shut, so a new source is never shown by default. The
  switch is the deployment's, never a person's, so nothing a shut source
  holds reaches a shared cache. A shut source leaves its card a sentence
  (`shutWords`, "is not shown in the beta", read by `isShut`; many folded
  into one by `foldShut`); closes, live prices, the session, extended
  hours, headlines, odds, the expected move and short interest say so and
  stop. Treasury yields come from the Treasury's daily par yield curve
  (`parseTreasuryPar`, a `treasury` source on US3M to US30Y), currency
  rates from the ECB's daily reference rates through the euro
  (`parseEcbDaily`, `ecbCross` in `loadFxRates`), and Macro's indicators
  name their sources by `creditsForNames`. Results come from the SEC
  (`secCalendar` and `secResultsDue` in `lib/earnings.ts`; `secResultsOut`
  in `lib/earnings-run.ts` on the earnings file's `followed`, each
  company's submissions shared `SEC_POLL_MINUTES` under the deployment's
  contact, `operatorContact`): an 8-K with item 2.02 is the release, read
  by the results watch as soon as it is filed; no date ahead is known, so
  no alert the day before, and the report's alert and email stay. The main
  deployment has no such setting and reads as before. `npm run
  check:markets`.
- **Markets come from one feed, read-only.** The markets object
  (`lib/markets.ts`, pure: catalogue, parsers, rows, the merge into a book)
  is filled by `lib/markets-feed.ts` alone (Yahoo Finance first, FRED and stooq behind it, S&P 500 earnings from multpl, market values from the Nasdaq screener, the macro publishers below, no key, the
  indicator and a date range alone in the URL, cached an hour); the guard
  holds that. A methodology reads it with a measure over `markets` filtered
  on `market_symbol`; its series are lent to the benchmarks a series figure
  names. An indicator that cannot be read is a sentence in `problems`, never
  a zero; the demo reads `data/samples/markets.json`, fictional. The same
  feed reads the daily closes of the listed holdings (`loadCloses`, the
  ticker and a date range alone in the URL, a count and never a ticker in a
  log), which `withCloses` lays on the book as `series.holdings` for the
  correlation matrix on Holdings (`lib/correlation.ts`) and the review's
  contribution; the demo reads `data/samples/closes.json`, fictional.
  The last closed US session (`loadMarketDay`; the clock, schemas, parsers
  and views in the pure `lib/market-day.ts`, the layout in the pure
  `lib/treemap.ts`) is read once after 16:20 New York time and kept until
  the next close (a complete read in the shared data cache, so every
  instance and the next deployment open it at once): the S&P 500 list and sectors from Wikipedia, each
  company's daily close from Yahoo, market values from the Nasdaq screener
  (equal tiles when it cannot be read, and said so), the four US indices'
  five-minute session. The session is whatever ^GSPC last closed, so a
  holiday needs no table. The same read takes the Nasdaq-100 list's members
  outside the S&P 500 (kept apart from the map) and QQQ's own close, so
  `indexDrivers` can say what moved the S&P 500 and QQQ (each company's
  weight at the close before by market value, times its move), and
  `bookDay` lays the session on the person's listed holdings (their own
  closes for any the read does not carry; computed per request, never kept).
  It draws the index cards, the drivers, the heat map and the movers on
  the Dashboard (live in market hours: `/api/live/session` every minute,
  `loadLiveSession` reads the kept session's companies from Yahoo's spark
  in batches and `liveSession` lays them on the kept day; too few priced
  today and the close stays), and the book's day on Holdings under the
  positions; After the close and "What happened" are on After-Market Close
  Analysis (`/markets-today` only redirects there); Macro (the `markets` screen) keeps the indicators, cycle, liquidity, economy,
  world and major economies. "What happened" comes from what the person chose (`recap` in their
  preferences): the recap newsletters they forward, digested since the
  close (the app guides them to the free StockMKTNewz Daily Recap and a
  Gmail filter on its sender), and a recap their own Claude writes from the
  web after the close (`lib/market-recap.ts`, pure; `lib/market-recap-run.ts`,
  every point with its page, the session's figures from the app's own read,
  kept in the vault's `recaps` file), both run by the evening cron
  (`/api/cron/evening`, weekdays 20:35 and 21:35 UTC, 16:35 New York in
  summer and in winter, right after the close's read lands at 16:20, then
  22:30 and 23:45 UTC when the newsletters arrive, and 00:30 and 01:30 UTC for a recap that lands after midnight; Hamza, 17 and 23 Oct 2026); the
  Claude recap is also written by `catchUpOnOpen` when the app is opened
  after a close that has none yet, and until it is written After the close
  says the session's is being written and folds the close before away
  (`briefSession` on At the Close: the last closed session
  during market hours, today's from the bell). The same recap explains why each listed holding rose, fell or
  held flat (`holdingMoves`: the move is the app's read of the close, the
  reason the model's, a symbol not held dropped) and opens After-Market
  Close Analysis as "After the close" (`close_brief`, which opens with the
  recap's summary and every point with its page, "Your Claude, from the
  web", no longer under What happened; Hamza, 19 Oct 2026); a move of the person's own alert or more
  (`moveAlertPct` in their preferences, set on Notifications at
  `MOVE_ALERT_MIN` or more, no upper limit, `MOVE_ALERT_PCT` 2% unless set) is
  explained from a page of that day or said to have none, and is an alert
  (`moveNotices`, keyed `move:`) that the evening run checks and emails at once. Nothing is read from X or any paid feed. A
  page waits a short budget and the read finishes behind it; the morning
  cron warms it. The demo reads `data/samples/market-day.json`, fictional.
  The NY Fed's recession probability is computed from its published probit
  on the 10y less 3m spread, never fetched. The macro series come from their
  publishers, keyless (the NY Fed's rates and SOMA holdings, Freddie Mac's
  mortgage survey, the BLS, Michigan, CNN's fear and greed, the Treasury's
  monthly statement; parsers in the pure `lib/macro-sources.ts`); a weekly or
  monthly indicator carries its `cadence`, changes by the calendar and keeps
  five years. The major-economies map (`lib/economies.ts`, pure;
  `loadEconomies`) reads the OECD Economic Outlook (debt, current account,
  real and nominal growth, inflation, gross interest paid, with this year's
  projection), the BIS's policy rates and the OECD's broad money every twelve
  hours; the IMF is asked only for a figure the OECD did not give, since it
  answers 403 to Vercel. A
  series with no free current feed is left out, not shown with a placeholder
  (ISM, NFIB and NAAIM are licensed). While the US market is open
  (09:30 to 16:00 New York on a weekday) a page asks `/api/live` every 30
  seconds, only while it is in view: the symbols in the body, never the URL;
  `loadLive` reads each one's chart of the day from Yahoo (the ticker alone
  in the URL, kept 30 seconds in the shared data cache, so the load grows
  with distinct tickers, not people) and the four indices. The page lays the
  prices on the book it already has (`liveBook` in the pure `lib/live.ts`):
  a holding moves by its price against the book's own price, a quote in
  another currency, from before the last session or far from the book's
  price is named and not used, and nothing is kept or logged; the rules,
  alerts and reviews still read the close, so a cap crossed at today's
  prices is a warning, not a breach. After the bell the same read holds the
  last session's closes (`lastSession` in `lib/live.ts`: today from the
  open, else the trading day before), so no card falls back to the
  statement; the routes answer out of hours with `open: false`, the page
  asks once on opening, once after the bell and then every
  `LIVE_CLOSED_POLL_SECONDS`, and every card drawn from the read is badged
  "Live · Markets have closed" on the session's date (`closedOn` in
  `lib/freshness.ts`), with "at the close" wording (Hamza, 17 Oct 2026). A
  quote for a session a series already carries is not laid on it twice. The
  demo has none. The top right of every page (`MarketCountdownBadge` in
  `PageHeader`; Hamza, 19 Oct 2026) says "Market is live" in green with a
  blinking dot through the session; within two hours of the open or the close
  it counts down to it (`marketCountdown` in
  `lib/live.ts`, to 13:00 on an early close, none on a weekend or a day in
  `MARKET_HOLIDAYS`, NYSE's published list, extended each year; Hamza,
  15 Oct 2026); for two hours after the close it says how long ago the
  market closed (`sinceClose`), then that the markets have closed and when
  they open (`nextOpen`), and a live card outside the session is badged
  "Markets have closed" on the close's date (`asClosed` in
  `lib/freshness.ts`), never "At the close" (Hamza, 15 Oct 2026).
  `npm run check:markets`.
- **Dividends: a screen of its own, first for an income methodology**
  (Hamza, 19 Oct 2026, after Snowball's). `/dividends` (`lib/dividends.ts`,
  pure: `dividendsOf(book, today)`) reads the listed holdings and the
  ledger: projected income from the filings' `dividend_yield_pct` times the
  value (else what the ledger received in the last twelve months), the
  yield and the yield on cost, received in the last twelve months against
  the twelve before, by month and by year, the next twelve months' payments
  from each payer's months in the ledger (a payer with no history is named
  as undated), and a safety score per payer (`safetyOf`, `SAFETY_TESTS`:
  payout, years raised, five-year growth and a yield not stretched, 25
  points each, `SAFETY_MIN_TESTS` read or none; bands in `SAFETY_BANDS`
  with their word beside the colour; the app's own, from the filings). The
  slots are `dividend_*` in `lib/ontology.ts`, shown `dividends`
  (`paysDividends(book)` or a dividend methodology); `dividendFocused` in
  `lib/screens.ts` (a figure or class reading a dividend field, a
  transactions filter on `kind = dividend`, or the name or summary about
  dividends or income) moves the screen right after Holdings in
  `screensOn`, which the menu (`navFor` follows that order) and the phone
  tabs follow, and shows `dividend_glance`, its tiles on the Dashboard
  before the return chart, unless a headline figure already reads the
  dividends (`readsDividends`). The dividends come from the Flex statement's
  Cash Transactions (`cashTransactionsOf` in `lib/adapters/ibkr-flex.ts`:
  dividends and payments in lieu, the tax withheld on them, interest and
  fees in base at the row's rate, the detail rows over the summary;
  deposits and withdrawals by their sign, which `navIndex` and
  `moneyWeighted` in `lib/performance.ts` take out of the account's change,
  so money added is never a gain), which the Flex guide asks for; without them the
  projected figures stand and the page says what to tick. Grouped columns
  are `ColumnGroups` (`components/charts/column-groups.tsx`).
  `npm run check:exposure` and `npm run check:options` hold it.
- **Before the open, after the close and since the results** (Hamza,
  4 Nov 2026). `lib/extended-hours.ts` (pure) reads Yahoo's five-minute
  chart with the extended sessions (`parseExtendedChart`; `loadExtended`
  in `lib/markets-feed.ts`, the ticker alone in the URL, kept
  `EXTENDED_POLL_SECONDS`), by New York's clock (`sessionAt`: pre-market
  04:00 to 09:30, the session to 16:00 or the early close, after hours to
  20:00). `extendedMove` sets the last pre-market price against the last
  session's close and the last after-hours price against that day's
  close; `sinceResults` sets the price now, in any session, against the
  last trade before the SEC accepted the release (`accepted` on the
  release, from the submissions' `acceptanceDateTime`, New York's wall
  clock, `acceptedUnix`), else the close before the results. A signed-in
  page posts its symbols to `/api/live/extended` (the body, never the
  URL; nothing kept or logged) every minute in those sessions
  (`useExtended` in `components/live/extended-hours.tsx`). At the Close
  draws `ExtendedHours` (slot `extended_hours`, after `close_brief`;
  `extendedSubjects`: the listed holdings, then the watchlist, a company
  with results today or yesterday first), and Earnings draws
  `SinceResults` above the report for each report of the past
  `SINCE_RESULTS_DAYS`. The demo answers `/api/live/extended` once from
  `data/samples/extended-hours.json`, fictional, through the pure
  `lib/demo-markets.ts`, which also reads the demo's closes, odds and event
  bets. `npm run check:markets`.
- **Earnings: a calendar, an alert the day before, a report after.** The
  Earnings screen (`/earnings`; `lib/earnings.ts`, pure) follows each listed
  equity held, each watchlist symbol and each company the person adds
  (`earnings` in their preferences). The dates come from the Nasdaq earnings
  calendar, one public page per weekday from three weeks back to ten ahead,
  the date alone in the URL, read by `loadEarnings` in `lib/markets-feed.ts`
  (every company's row kept in the shared data cache, the person's picked
  out on the page; a day that cannot be read is named, never a quiet day).
  Nasdaq publishes some weeks ahead: a day answered with no data past the
  last day it answered for is not yet published (`calendarReach`; the page
  says to which day), never a quiet day; inside that range it is a gap,
  named.
  A report tomorrow is an alert (`earningsNotices`, keyed `earnings:`) the
  day before and through the day, checked and emailed by the twice-daily
  check. After the results, `lib/earnings-run.ts` (the evening read the same
  day and the morning refresh, before the filings are read again) reads what
  the company filed from its SEC submissions (an 8-K with item 2.02 or a
  6-K is the release, a 6-K only once its text reads as the quarter's results:
  `resultsSixK` tests the window's `sixKs`, a buyback or dividend notice kept in
  `earlierTried`, Hamza, 5 Nov 2026; the 10-Q, 10-K, 20-F or 40-F brings the figures, waited
  for up to 50 days), the quarter against a year before from its XBRL facts,
  and, before the 10-Q lands and always for a 6-K filer, the quarter's own
  figures from the release itself (Hamza, 16 Oct 2026): its documents
  fetched from the SEC as HTML (`releaseDocuments` in `lib/edgar.ts`),
  stripped to text (`htmlToText`), read on the person's own provider through
  one tool (`releaseRequestBody`, any provider), then every figure checked
  against the printed text (`checkReleaseRead`, the statements' check); a
  figure the text does not print is dropped and named, never used, and the
  10-Q's facts replace them when it lands. The report says where its figures
  came from (`figuresFrom`), keeps the read (`releaseFigures`: the quarter,
  the quarter before and a year before per line, the company's own KPIs),
  and the detail's quarterly series (`quartersOf`) lays the releases' quarters
  where the facts have none, the facts winning. A 6-K filer's earlier
  quarters come from their own releases (`readEarlierReleases` in
  `lib/earnings-run.ts`; the pure `releaseCoverage`, `missingQuarters`,
  `candidateReleases` and `looksLikeResults`): for each quarter within
  `QUARTERS_BACK` no release covers, the 6-Ks filed in the results window
  after its end are fetched and tested as text, the first that reads as
  results is read on the provider and kept on the report (`earlierReleases`)
  when the model's period is that quarter, at most
  `EARLIER_RELEASES_PER_RUN` reads per run; a 6-K that is not results is
  remembered (`earlierTried`), and `earlierNote` says what still waits. An
  annual filer's study table carries its years alone, since its trailing
  period is the last year itself (`studyTable`), and the deck drops a kept
  column that repeats the year (`withoutRepeatedYear`). Then
  the methodology's class test and rules on the new figures (`checkCompany`),
  the record's triggers and kill signals and the person's valuation; the
  headline (kill signals, the class, whether a decision is owed) is the
  app's, never a model's. On a Claude key their Claude reads the release and
  the call (eight searches at most, every point with its page, the app's
  figures given); another provider leaves a sentence. Every reading that
  searches the web is investigative (Hamza, 23 Oct 2026; `INVESTIGATIVE` in
  the pure `lib/investigate.ts`, set into the commentary, the reaction's
  why, the Thesis Hunter and the recap): when the company did something
  investors did not expect, it asks why, from who left and who was hired,
  the executives' records and what the company did before, never a motive
  the pages do not support, and it reads between the lines (Hamza, 4 Nov
  2026: "What's behind the news? ... for all the agents, researching";
  `READ_BEHIND`, in `INVESTIGATIVE` and on its own in the event reports,
  the reviews' news, studies, podcasts, the lens agents, Add to thesis and
  the property watch, the deck brief carrying `INVESTIGATIVE`): what changed
  from before, who gains, what the timing or wording shows, what is left
  unsaid, whether a move had another cause; the commentary keeps up to `MAX_UNEXPECTED` such
  findings (`unexpected`: what, why and its pages), drawn on the report as
  What investors did not expect, and why, and on both decks. How the stock took the
  results (Hamza, 20 Oct 2026; `reaction` on the report, `reactionMove`,
  `reactionWords`, `ReactionBlock` in `components/earnings/report.tsx`): the
  move from the last close before them to the close of the first session
  that traded on them (the report day before the open, the next session
  after the close, both for a time not given), beside SPY's, read by
  `withReaction` in `lib/earnings-run.ts` once that session has closed
  (16:20 New York) within `REACTION_DAYS`, the filings not read again for it
  (`contentDue`); on a Claude key, why, from that day's pages
  (`reactionRequestBody`, every point with its page; the move is the
  app's). Each stage (release,
  figures) is an alert (`reportNotices`, keyed `earnings-report:`). Each
  report is also a deck on the HCMP deep-dive skeleton (`lib/earnings-deck.ts`,
  pure, pptxgenjs from the kept report alone; Hamza, 15 Oct 2026: the
  HCMP ASML deck is the model, slide for slide): dark cover with the four
  tiles, how the deck follows the template, the case in four points, then
  the template's sections in order (core business, how it makes money,
  five-year record, the growth engine, profitability, profit and cash,
  segments and the engine marking, competition, moats, valuation, the
  earnings record, capital allocation, the owner's valuation, SWOT, the
  key question with the beta test against the methodology's first
  benchmark, investment questions, the classification test, the thesis,
  the engine and triggers, kill signals, where the evidence pushes back,
  conclusion), the position with a year of weekly closes, the verdict and
  the sources; Arial, the HCMP palette, cards, takeaway boxes and green
  tables. The run keeps what the slides need in the report's `detail`
  (`buildDetail` in `lib/earnings.ts`: the position and its cap, the
  filings' five years and eight quarters, the segment and geography lines,
  the engine, every criterion and rule, the latest finished study on
  Research, a year of weekly closes of the holding and the benchmark with
  `betaStats`); a slide whose data is missing says what it needs, and a
  slide that needs prose (competition, moats, SWOT, the questions) reads
  the study on file. A complete report kept before the detail is read once
  more. At the release stage the deck is the full deep dive on the last
  filed figures, the quarter's slide saying what it waits for, and a report
  read again that says the same (`sameReport`, both read as the file keeps
  them) keeps its deck (Hamza, 16 Oct 2026); a release is asked of the SEC
  again at most every `RELEASE_RECHECK_HOURS` (`checkedAt`), and a report
  with no deck is kept before one whose deck is remade. With no detail at all, the short deck (cover, record, kill signals,
  position, verdict, sources). The screen lists every followed company's latest deck, the
  watchlist's too, newest first (`decksBy`; Hamza, 23 Oct 2026), and,
  on All decks, every report's deck by company; pressing one embeds
  its latest deck as Google Slides, like Reviews, with the earlier ones
  under it (`withDecks` in `lib/earnings-run.ts` keeps each new report's
  deck in the vault, `saveEarningsDeck`, a few per run, and the report
  carries its `deck`); a deck Drive answers 5xx to converting twice is
  kept as the .pptx (`file` on the kept deck) and embedded through Drive's
  preview; `/api/earnings/deck` builds one on request. The
  demo's calendar and reports are a fictional sample whose days stay around
  today (`data/samples/earnings.json`). `npm run check:earnings`.
- **Theses: market theses and stock theses, the latter as holdings and
  watchlist** (Hamza, 18 Oct 2026), **one folder per holding, as HCMP keeps
  them in Drive** (Hamza, 16 Oct 2026). The Theses screen (`/theses`;
  `lib/theses.ts`, pure; the vault's `theses` file: `bySymbol` and
  `markets`) opens with the market theses (`/theses/market/[id]`: what the
  person believes about rates, a cycle or a theme, `marketThesisSchema`, its
  pillars tested on a market indicator's level, `marketReadings` from
  `book.markets.rows`, the id from the title, `marketThesisId`, at most
  `MAX_MARKET_THESES`), then the stock theses: the listed equities held, the
  watchlist (the records not held, `thesesSubjects(holdings, file,
  watchlist)`), each opened as a folder: the thesis in the person's words with its pillars (each with the
  ontology field and level that tests it, scored on today's figures as
  supported, mixed within a tenth of the level, at risk or unread,
  `pillarReadings`), the pathway and the watch items; the record's kill
  signals and triggers with today's reading; the Valuation calculator
  (Hamza, 16 Oct 2026; `lib/valuation.ts`, pure, after Brian Feroldi's
  "Valuation by Stage"): the stage the filings place the company in,
  decided by the ontology's `STAGE_TESTS` on the fundamental fields in
  order, first match wins, the rule and the figures named (`stageOf`:
  decline when revenue shrinks; hyper growth at 30%+ growth with free cash
  flow under a tenth of revenue; startup when loss-making below that
  growth; break even when free cash flow is positive but under a tenth;
  capital return when half or more of it goes back, `capital_returned_pct`,
  a field derived from buybacks and dividends over free cash flow; operating
  leverage when the margin held or widened with most cash kept; nothing is
  guessed when a field is unread, the reading says what it needs), the
  person's own stage when they set one, said to be theirs; the nine metrics
  (`VALUATION_METRICS`, `METRIC_USE`: the chart's matrix of useful, somewhat
  and not useful by stage) in the order of their use at that stage, each
  valued in the browser on the person's bear, base and bull estimate times
  the per-share figure the filings supply (sales, gross profit, trailing
  EPS and free cash flow; the person's own forward EPS and free cash flow;
  the addressable market times share times margin times a multiple over the
  shares), seeded at today's multiples (`valuationDefaults`); and inside it
  the DCF model (`lib/dcf.ts`, pure: by free cash flow less stock-based
  compensation or by earnings, a revenue path and an end margin per case,
  WACC and terminal growth, the balance sheet bridge, mid-year discounting,
  the WACC by terminal-growth grid, the reverse DCF; HCMP's ASML Q3 2026
  model is the reference, `npm run check:theses` holds it within 3%),
  seeded from the latest report's filings (`dcfDefaults`)
  (`components/theses/valuation-calculator.tsx`, `dcf-calculator.tsx`;
  the metrics folded under one row, the DCF under the calculator at full
  width; Hamza, 20 Oct 2026); beside it the chosen metric over five years
  (`lib/valuation-history.ts`, pure: each week's close over the trailing
  per-share figure known that week, a quarter counting from
  `EPS_KNOWN_AFTER_DAYS` after it ends, from the filings' `perShareTtm`,
  `ttmPerShareHistory` in `lib/edgar-facts.ts`, at the day's rate from
  `perShareCurrency`; a forward metric or a DCF shows its trailing twin,
  `historyMetricFor`; `components/theses/valuation-history.tsx`, the median
  as a flat line, now, low, median and high); a holding or watchlist company
  within `NEAR_LOW_PCT` of its five-year low on that metric, with
  `MIN_HISTORY_WEEKS` of history, is an alert (`valuationLowNotices`, keyed
  `valuation-low:`, checked by the twice-daily check, kept as it was when
  its closes cannot be read). The filings read takes the watchlist's records
  too, `MAX_WATCHED` at most;
  Keep writes the estimates and the DCF on the thesis (`valuation`, `dcf`)
  and the chosen method's bear, base and bull as the record's own valuation
  (`ownValuationFrom`, the method and stage in its basis); the latest
  post-earnings report with both decks
  embedded; the study on the stock template, or the form to queue one; and
  the archive. The earnings run reads the thesis (`thesisDetail`) into the
  report's detail (`thesis`, `pathway`, `watch`, `pillars`, `dcf`,
  `valuation` with the stage read on the new figures even with no thesis, `before`
  for the quarter before, `balance`, `prices.yearEnds`), and every trigger
  carries its `reading`. The demo's theses (`data/samples/theses.json`,
  fictional) are read-only.
- **Add to thesis runs in the app, on the person's own key, and nothing moves
  until they approve** (Hamza, 19 Oct 2026). On a stock or market thesis's
  page, one button (`AddToThesis`, `components/theses/add-to-thesis.tsx`, on
  `FileAction`) takes a PDF or a text, Markdown, CSV or JSON file;
  `proposeFromDocument` in `lib/thesis-review-run.ts` (server-only) reads it
  on the person's provider (the PDF's text layer, else the PDF itself on a
  Claude key alone; a text file as is; 4 MB at most) against the thesis as
  kept and the methodology it lives under (Hamza, 19 Oct 2026: "it should";
  `methodologyView` in `lib/thesis-review.ts`, built in the action by
  `methodologyFor`: the name and summary, every class's test in words,
  every rule with its section, its kind and how the app tests it, and for a
  stock where it stands today, `standingOf` from `checkCompany` on a
  one-holding book and `weightsFor`: the class its tests give it with each
  class's count, the weight against its cap, the rules on its figures, the
  figures; a stock not held and not read has no standing, said so; the
  proposal keeps the methodology's name as `against`), through one tool
  (`reviewRequestBody` in the pure `lib/thesis-review.ts`,
  `propose_changes`): a summary of what the document says that bears on the
  thesis and on the methodology's classes and rules as they apply, naming
  the section a figure bears on, and up to `MAX_CHANGES` changes, each
  naming a paragraph (copied exactly), the pathway, a watch item or a
  pillar, the words before and after, and why, with the class or rule it
  answers; the verdict (a class, a breach, a pass) stays the app's. `checkProposal` places each on the thesis
  (a paragraph, item or pillar the thesis does not have is dropped and named;
  a new pillar's test on a figure the subject cannot read loses its test; an
  unchanged or over-the-limit change is dropped) and lists every figure in
  the proposal the document's text does not print (`uncheckedFiguresIn`,
  the statements' check); the proposal is kept pending in the vault's
  `thesis_proposals` file (one per thesis, `proposalKey`), never the
  document. The page shows it (`ProposalReview`, client): each change
  highlighted by `wordDiff` (removed words struck, added words marked) with
  Approve, Deny or Amend (Amend opens the words); Apply
  (`applyProposalAction`, `decisionsFrom`, the pure `applyProposal`) writes
  the kept changes and an evidence entry (`via: "claude"`, the source, its
  date, the summary, what changed or that nothing did) and clears the
  proposal; Dismiss drops it. The demo reads nothing and proposes nothing.
  `npm run check:theses` holds it.
- **Community: follow others' theses and see their portfolios** (Hamza,
  18 Oct 2026; laid out after Blossom, 6 Nov 2026: a feed, `communityFeed`,
  of each shared thesis, a card's weight moves, `moves` on `changed` in
  percent before and after, or the card itself, For you or Following, a
  search by person or ticker, `matchesSearch`; Most held from the index and
  People with avatars and their largest holdings, `topHoldings`, beside it;
  `components/community/feed.tsx`; no post, like or comment is kept). The Community screen (`/community`; `lib/community.ts`,
  pure; the screen after Theses) lists everyone sharing on the deployment
  under a handle, the people the person follows first (`following` in the
  preferences, `withFollowing`, `splitFollowing`), and the person's own card:
  Share builds `communityProfileSchema` from their own files through
  `profileFrom` (their theses' words: text, pillars with their tests,
  pathway, watch, `sharedTheses`; each listed holding's weight in percent
  with its class, from `deriveScreens().weights`; a name, a line about them,
  the methodology's name) and keeps it in the registry's
  `community_profiles` (`shareProfile`, handle unique; `stopSharing`
  deletes the row). Never an amount, an account, a net worth, a valuation, a
  DCF, a decision, an alert, a statement or a thesis's evidence
  (`FORBIDDEN_KEYS`, held by `npm run check:community`); the address behind
  a handle is never read back. A profile page (`/community/[handle]`) draws
  the weights as a donut and a list and the theses as cards. The demo reads
  `data/samples/community.json`, fictional, and shares nothing; following
  in the demo lives in the cookie. The privacy and terms pages say so. The
  card follows the person's files by itself (Hamza, 19 Oct 2026: "updated in
  real time in sync"): `lib/community-run.ts` (server-only) rebuilds it from
  the vault through the same `profileFrom` (`cardFor`, `republishCard`) and
  replaces it in the registry only when it differs (`refreshedCard`,
  `sameCard`), from every save that can change it (`republishAfter` in
  `lib/workspace.ts` after a theses, book or setup write, run with `after`),
  the connector's `write_thesis` (`writeThesisInto` with the email), the
  morning refresh, the evening Flex fetch and opening the app
  (`catchUpOnOpen`); a book that cannot be read keeps the weights last
  shared, and the handle, name, line and choice stay as set. A difference
  worth telling of (`cardChanges`: a thesis added, removed or reworded, by
  symbol or title; a holding come or gone, or a weight moved by
  `WEIGHT_CHANGE_PTS`; a day's drift is not) is kept on the card as
  `changed` and is an alert for each follower for `CHANGE_NOTICE_DAYS`
  (`communityNotices`, keys `community:<handle>:<day>`): laid on
  Notifications when it is read (`followedNotices`), into the alerts file on
  opening the app (`catchUpCommunity`, `reconcilePrefix`) and at the
  twice-daily check, which emails it; a registry that cannot be read keeps
  them as they were (`COMMUNITY_PREFIX` kept). `npm run check:community`
  holds it.
- **Clubs: the club's own Drive folder, its members and virtual
  competitions** (Hamza, 9 Nov 2026, a university investment club the first
  use case: "... view the material synced to their club's google drive folder and
  ... hold virtual portfolio competitions among club members"). The Clubs
  screen (`/clubs`, `/clubs/[id]`, `/clubs/[id]/c/[cid]`; `lib/clubs.ts`
  pure, `lib/clubs-run.ts` server-only, actions in `app/(app)/clubs/actions.ts`;
  slots `club_list`, `club_material`, `club_competitions`, `club_members`,
  `competition_board`, `competition_book`) keeps a club in the registry
  (`clubs`, `club_members`, `club_competitions`, `club_entries`): its name,
  a line, the Drive folder its material is in (`driveFolderId` reads a
  pasted address), its join code (hashed to find it, sealed with
  `REPORT_KEY` to show it), each member's sign-in, chosen name and role
  (`CLUB_ROLES`; `runsClub`: the owner and officers link the folder, start
  competitions, hand out the code and see the addresses, `shareList`, to
  paste into Drive's Share box; everyone else sees names alone), and each
  member's virtual trades. The material is Google's own view of the folder
  in an iframe (`folderEmbedUrl`, `embeddedfolderview`) with Open in Drive:
  each member sees it with their own Google sign-in and the access the
  folder's owner gave, so it is always in sync, and the app never reads,
  lists or writes the folder (no Drive call outside `lib/user-drive.ts`).
  A competition (`competitionSchema`: days, virtual cash, `maxWeightPct`, a
  note) is virtual money, never the person's own: `withTrade` fills a buy
  or sale at the last close (`lastClose` through `loadCloses`), no short,
  no margin, no holding past the limit at the prices known, a reason kept
  with each trade; `leaderboard` ranks each entry at the last close (the
  last day's once ended) by return on the cash, SPY from the close before
  the first day beside it in points. Joining is rate-limited
  (`club-join`). Leaving deletes the member's row and entries; an owner
  deletes the club with all of it. The demo reads `data/samples/clubs.json`,
  fictional, and changes nothing. `npm run check:community`.
- **The moat, in the app** (Hamza, 9 Nov 2026). A Community card can carry
  the person's track record (`trackRecordFrom` in `lib/community.ts`,
  `recordFor` in `lib/community-run.ts`: the time-weighted return from
  `navIndex` since the first day with money, SPY's over the same days and
  `resonanceOf`'s rules kept today, percent alone, at least
  `RECORD_MIN_DAYS`), shared only when ticked (`sharing.record`) and kept
  in step with the statement like the rest of the card. The methodology's
  rule language is public as a JSON Schema (`/api/methodology/schema`,
  `openRulesDocument` in the pure `lib/open-rules.ts`, with the ontology's
  fields, measures and windows); the engine stays the app's. The Invariant
  skill for a person's own Claude (`skillMarkdown` in the pure
  `lib/invariant-skill.ts`, served as a zip by `/api/skill` through the pure
  `storedZip` in `lib/zip-store.ts`) tells Claude to call `get_overview`
  first, take every number from a tool, cite each rule's section, and never
  trade or advise; Setup's connector card links both. `npm run check:mcp`,
  `check:community`.
- **More of the moat** (Hamza, 9 Nov 2026: "implement them"). A club keeps
  a research library (`pitchSchema`, `libraryByTicker`; `club_pitches`, the
  author's club name, staying with the club), investment committee meetings
  (`meetingSchema`, `agendaFrom`: a "TICKER:" line tied to the newest pitch;
  `club_meetings`, `club_votes`: one vote a member and item until the
  minutes are written, read back only as tallies, `outcomeOf`). Each board
  read is kept as the league reads it (`boardRecords`, `keepBoard`: the
  competition's `summary` and each entry's `result`, percent, ranks and
  counts, never an amount); the league (`/clubs/league`, `leagueTable`) is
  the clubs an officer put on it (`league`), by their newest competition
  with `LEAGUE_MIN_ENTRIES` entries, the median member against SPY. A
  member's results are kept in `club_records` when they leave or the club
  is deleted (`keepRecords`), shown on Clubs as Your record
  (`recordSummary`) and forgotten on request. A card's track record carries
  its streak (`withStreak`, `streakWeeks`: `breaches` today and
  `cleanSince`, seeded from the breach alerts, `lastBreachEnd`), the
  methodology's `lineage` when adopted from the library (`adoptMethodology`,
  the card's `methodologyFrom`) and its `family` (`familyOf`), which
  `pooledBenchmarks` pools once `POOL_MIN_PEOPLE` share a record in it.
  Thesis receipts (`lib/receipts.ts`, pure: SHA-256 of `RECEIPT_VERSION`
  and `canonicalThesis`) are sealed in `thesis_receipts` (the hash and the
  time, never the words or whose) when a thesis page is drawn
  (`ThesisReceipt`) and when a card is shared (`sealedCard`), and checked at
  `/receipt/[hash]`, public. A card may be unlisted (`sharing.listed`) and
  read by a private link (`/card/[code]`, `link_hash` and `link_sealed`,
  noindex), the mentor view. The demo's are fictional, its receipts the
  real fingerprints of its words. `npm run check:community`.
- **Twenty more ways** (Hamza, 9 Nov 2026: "i like the twenty more ways ...
  implement them"; the marketplace "Listing now, royalties later"). Clubs:
  challenges between clubs (`challengeSchema`, `club_challenges`: accepted,
  each club runs its own copy, `challengeId` on the competition,
  `challengeResult` sets the medians against SPY side by side); a faculty
  `adviser` role that `runsClub`; course mode (`course` on a competition,
  `gradeOf`: reasons, holdings, the limit, out of 100, never the return);
  thesis bounties (`club_bounties`, `bounty_votes`, `bountyWinner`, a
  pitch's `bountyId`); peer review (`pitch_reviews`, 1 to 5 on the
  evidence, `reviewSummary`); the club's watchlist (`club_watch`,
  `clubWatchNotices` under `CLUB_WATCH_PREFIX`, laid by `clubWatchAlerts`
  in the alerts check and on Notifications); earnings nights (a meeting's
  `kind` and `symbol`); how the picks did (`picksScorecard`); alumni
  (`club_alumni`, chosen on leaving, `alumniByYear`); a competition's
  reasons judged against SPY (`judgedTrades`); and Your path
  (`graduationSteps`). The person: the reasoned-trade score on Trades
  (`reasonedTrades` in the pure `lib/judgement.ts`, slot `trades_reasoned`),
  the calibration of their own valuations on Theses (`calibrationOf`,
  `CALIBRATION_DAYS`, slot `thesis_calibration`), the sealed decision
  journal (`/decisions/pdf`, `JournalPdf`, `journalFingerprint` in
  `lib/receipts.ts`, sealed in `thesis_receipts`, amounts masked), the
  Verified analyst mark (`badgeOf`), the rules on a card for an adviser
  (`sharing.rules`, `sharedRulesOf`), rule packs (`RULE_PACKS`, `withPack`
  in the pure `lib/rule-packs.ts`: a draft to confirm, a rule held kept).
  The marketplace (`lib/marketplace.ts`, `methodology_listings`,
  `listing_adopters` under a keyed fingerprint; `listingProblem` refuses a
  draft and a class or figure on a ticker, name or account; `adoptListing`
  is a draft with `lineage.source` "market"; `/methodology/market`; no
  money yet). Open data (`lib/open-data.ts`: `donate` in the preferences,
  off by default, `donateQuietly` on opening the app, `research_donations`
  under a keyed fingerprint and the ISO week, `openData` pooled with
  `OPEN_MIN_PEOPLE` a row) on the public `/open-data`, and the annual report
  (`annualReport`, `yearCounts`, a count under five said as fewer than
  five) on the public `/annual/[year]`. Family accounts (`lib/households.ts`,
  `households`, `household_members`, a code like a club's; `householdView`
  draws only the members' shared cards, slot `community_family`). The demo
  reads `data/samples/clubs.json` and `data/samples/open-data.json`,
  fictional, and lists, adopts, donates and joins nothing.
  `npm run check:community`, `check:theses`, `check:setup`.
- **Twenty further ways** (Hamza, 9 Nov 2026: "now implement the Twenty
  further ways"). The person: cooling-off trades (Trade check's Plan it,
  trade tomorrow, slot `trade_plan`, files a Decision Log entry of kind
  `plan`; `plannedTrades` in `lib/judgement.ts` sets the trades planned
  `PLAN_MIN_DAYS` or more ahead against the rest, slot `trades_planned`);
  sale post-mortems (`postMortems`, each sale `POSTMORTEM_DAYS` on against
  SPY with its reason, slot `trades_postmortems`); the monthly letter on
  how they decided (`decidingLetter`, `letterFor` in the server-only
  `lib/judgement-run.ts`, `withDecidingLetter` in `lib/report.ts`, slot
  `review_letter` on the monthly review and `decision_letter` on the
  Decision Log); sealed methodology versions (`lib/methodology-versions.ts`:
  `methodologyFingerprint` sealed in `thesis_receipts` on confirming,
  `methodologyDiff` kept as a Decision Log entry answering `VERSION_ON`,
  slot `methodology_versions`); a shadow methodology (`shadow` in the
  preferences, `shadowCompare` in the pure `lib/shadow.ts`: a library or
  market methodology run beside theirs on the same book, slot
  `methodology_shadow`, never applied); public sealed calls
  (`lib/public-calls.ts`, `public_calls`: a thesis's words, its bear, base
  and bull and the price on the day, published by the person and checked
  at `/calls`, `callHolds` against the price since; slot `public_calls`);
  the verified record badge for a CV (`lib/badge.ts`, `/badge/[code]`, the
  card's percent alone, slot `community_badge`); the recruiter view (a
  card's `judgement`, `sharing.judgement`: the reasoned and planned shares
  and the calibration, percent and counts, slot `community_judgement`);
  mentor sessions, free for now (`lib/mentors.ts`, `mentor_offers`,
  `mentor_asks`, `/community/mentors`, slot `community_mentors`: a verified
  analyst offers, a member asks with a note, the review kept
  with the ask); packs from verified analysts (`packListingSchema`,
  `packListingProblem`, `pack_listings`, `pack_adopters`, slot
  `pack_listings` on `/methodology/market`, at most `PACK_MAX_RULES`
  rules); the public frameworks in the library (Graham, Greenblatt, Lynch
  and dividend growth, `data/library/`, credited "After" their author, each
  with its `gaps`, slot `methodology_frameworks`); family rules (a
  household's `pack`, `familyRules` and `familyGrid` in
  `lib/households.ts`, each member's result in percent kept by
  `publishClubAndFamily` in `lib/community-run.ts`, slot `family_rules`).
  Clubs: the course pack for universities (`COURSE_PACK`, `courseGrades`,
  slot `club_course`); the inter-university season with a final round
  (`seasonOf`, `seasonTable`, `FINALISTS` from `FINAL_FROM_MONTH`, slot
  `club_season` on the league); the club calibration board (a pitch's
  `valuation`, `pitchValuationSchema`, `clubCalibration` after
  `CLUB_CALIBRATION_DAYS`, slot `club_calibration`); the club pick fund
  (`pickFund`: each first pitch held in equal parts from its day against
  SPY, slot `club_fund`); treasury mode (`club_treasury`, `treasuryFrom`:
  the treasurer's linked book as weights in percent and the side and day of
  each trade within `TREASURY_TRADE_DAYS`, never a quantity or an amount;
  `votesAndTrades` sets the committee's votes against them, slot
  `club_treasury`); alumni mentoring (the `alumnus` role, `mentorsOnly`:
  reviews and notes, no competition or vote; a note on a review, slot
  `club_mentors`). Everyone: open data for researchers (`/open-data/research`,
  the CSV at `/open-data/download`, `openDataCsv`, `OPEN_LICENCE`, slot
  `open_research`) and the annual awards (`awardsOf`, `awardCardOf`: only
  what a card or the league already shares, `AWARD_MIN_JUDGED`,
  `AWARD_MIN_TRADES`, slot `annual_awards` on `/annual/[year]`). The demo
  reads `data/samples/clubs.json`, `community.json`, `mentors.json` and
  `public-calls.json`, fictional, and publishes, lists and asks nothing.
  `npm run check:community`, `check:theses`, `check:library`.
- **What Rallies.AI taught, built on the person's own rules** (Hamza, 23 Oct
  2026: "add them all, and agreed with what stays out"; no AI-run fund, no
  trading, no Plaid, no analyst target, no Reddit). Each thesis carries
  `since`, the day it first had words (`sinceFor`; `measuredFrom` falls back
  to its first evidence, marked approximate), and a market thesis a `basket`
  of up to `MAX_BASKET` tickers (`basketFrom`, `write_thesis` too); the
  Theses screen opens with the scorecard (slot `thesis_scorecard`,
  `thesisScorecard` in the pure `lib/thesis-scorecard.ts`: each stock thesis
  and each basket in equal parts against SPY from the close on or before
  that day, `returnSince`). Watchers (slot `watchers` on Notifications,
  `lib/watchers.ts`, pure) and screens asked in words (slot `screen_words`
  on the Screener, `lib/screen-words.ts`, pure) are words compiled once on
  the person's own provider (`lib/words-run.ts`, through `callModel`) into a
  test on the ontology's fields: one figure at one level for a company, any
  listed holding or a market indicator (`parseWatcherResponse`), or filters
  every one of which must hold (`screenClass`, run by `screenWith` on the
  screener's companies); the app says back how it reads them, runs them
  itself, and a watcher that holds is an alert (`watcherNotices`, keyed
  `watcher:`) the twice-daily check emails. The model never sees a figure
  of the book or a company. The company page carries How it took its
  results (`reactionHistory` in `lib/reaction-history.ts`: the kept reports,
  then the SEC's release days, `releaseDays`, an 8-K with item 2.02 timed by
  the acceptance clock, which is New York's, `releaseTime`; each move from
  `reactionMove` beside SPY's and the move priced) and Bull and bear
  (`bullBear` in `lib/bull-bear.ts`: the person's own cases against the
  price, the pillars as read today, the kill signals, the Thesis Hunter's
  finds; never a model's words). Community lists the community index (slot
  `community_index`, `communityIndex`: only companies `INDEX_MIN_HOLDERS`
  or more people sharing their weights hold, weights in percent, the rest
  only counted). The public research server (`/api/mcp/research`,
  `RESEARCH_TOOLS` in the pure `lib/mcp-research.ts`, read by
  `lib/mcp-research-run.ts`) takes no sign-in and offers a company's SEC
  figures, Form 4 trades, FINRA short interest and results dates, with the
  deployment's own SEC contact (`SEC_CONTACT`, else `INBOX_ADDRESS`), each
  read shared for the day in the data cache; it opens no vault, calls no
  model and reads no price, which the guard holds. `npm run check:theses`,
  `check:screens`, `check:earnings`, `check:community`, `check:mcp`.
- **The agents follow "PortfolioOS: Agents, Research Agent and Agent
  Builder"** (Hamza, 23 Oct 2026: "use the doc to build the agents and the
  agent page"). `lib/agents.ts` (pure) holds every agent's contract (`AGENTS`:
  layer, status, triggers, steps with their tier, inputs, output, weekly
  ceiling), the rules, rollout and decisions, the cost estimate from the
  usage the provider reports (`usageOf`, `costOf` at `PRICES`, list prices,
  always said to be an estimate), the runs (`agentRunSchema`, `weekSpend`),
  the gate (`mayRun`: off on Agents, `agentsOff` in the preferences, or at
  its ceiling, `agentBudgets` else the contract's), the ratings
  (`withRating`, `WRONG_REASONS`), lessons (`withLesson`, kept pending until
  approved, `lessonsFor` lays only approved ones on a brief, `lessonFromRatings`
  without a model), the learning curve (`learningCurve`, `wrongCounts`) and
  how calls aged against SPY (`agedCalls`, context and never a verdict).
  Every agent runs on one runtime (Hamza, 4 Nov 2026: "all the agents ...
  with the agent hierarchy"): each `callModel` names its agent and step
  (`CallTag`, the third argument), and `lib/agent-ledger.ts` (server-only)
  gates it with `mayRun` (`beforeCall`, a `SyncError` with its sentence when
  off or at its ceiling, counting the calls not kept yet, `runsWithPending`),
  lays the agent's approved lessons on its system prompt (`withLessons`),
  counts the usage (`afterCall`) and keeps one run per agent and subject in
  research_cache (`runsFromCalls`, `withRuns`) when the turn ends. A
  scheduled job's turn (`perform` in `lib/jobs-run.ts`) and opening the app
  (both `after` tasks in `lib/catch-up.ts`) hold one ledger
  (`withAgentLedger`); a server action or route gets one of its own, keyed on
  the request and kept by `after`; a call with no vault runs ungated and
  uncounted. The analyst is counted through LangChain's `handleLLMEnd`. A
  reading the app's check refuses is asked once more a tier up
  (`callChecked` in `lib/methodology-draft.ts`, `tierAbove`: Haiku to
  Sonnet, Sonnet to Opus, a Claude key only) for the statement, the release,
  a document for a thesis, a newsletter and a watcher's or screen's words.
  Each contract's steps carry the tier their call's model constant is on
  (Opus drafts the methodology, `DEFAULT_MODEL`), which `npm run
  check:agents` holds, with every tag naming a step its contract has and no
  agent left `own_path`. Agents opens with the hierarchy (`hierarchy` and
  `modelLabel` in `lib/agents.ts`, `HierarchyMap`; Hamza, 4 Nov 2026): Opus,
  Sonnet, Haiku and the app's own code, every agent on each tier its steps
  run on, an advisor's step on the tier it asks (`advisor` on a step).
  The hierarchy's top and the person's own agents (Hamza, 4 Nov 2026;
  `lib/agents-run.ts`, server-only, run by the morning refresh): the daily
  planner (`lib/planner.ts`, pure; one Haiku call since the beta, Sonnet on
  a plan that does not fit, `record_plan`, before the
  Research Agent) orders the due companies by what changed (`reasonsFor`:
  results within `RESULTS_NEAR_DAYS`, the alerts of `ALERT_DAYS` by kind,
  never a title) and adds at most `MAX_EXTRA` runs outside the schedule per
  agent; `checkPlan` drops a task for an agent off or at its ceiling, a
  subject not a candidate or a repeat, and the plan is kept as `plan` in
  research_cache, its extras run once (`runPlanExtrasInto`). Until the beta
  the Judge could ask Opus as an advisor before a hard call (`withAdvisor` in
  `lib/model-provider.ts`, the `advisor_20260301` tool under
  `ADVISOR_BETA`; a 400 is sent again without it, `withoutAdvisor`); since
  9 Nov 2026 a beta member's runs on Haiku with no advisor and a reading
  the check refuses whole is judged once more on Sonnet (`retry` in
  `runNewsResearch`), while the operator's and the allowlist's
  (`hostsOnDemand`) stays on Sonnet with the advisor (`HOSTED_JUDGE_MODEL`;
  Hamza, 9 Nov 2026). The lens agents (`lib/lens-agents.ts`, pure;
  `lensAgents` in the preferences) read the day's findings on Sonnet as a
  value, growth or dividend investor would (`LENS_CREED`, general words,
  never a person's methodology), each reading checked against the finding
  it cites (`parseLensResponse`, `lib/printed-figures.ts`), kept as
  `lenses` in research_cache, a second view and never a verdict. The Agent
  Builder (`lib/custom-agents.ts`, pure; the vault's `custom_agents`):
  words scanned (`wordsProblem`), compiled on Haiku (`compileRequestBody`,
  `parseCompile`: companies held or watched alone, the fixed
  `CUSTOM_SOURCES`, daily or weekly), tested on the past week on the
  Research Agent's steps with the question as its lens (`questionLens`,
  `runNewsResearch`), on only once tested and switched on, at most
  `MAX_CUSTOM_AGENTS`; its findings are alerts keyed `agent:` that
  `emailWorthy` leaves out. Every call goes to its tier's
  newest release (`newestModels` and `currentModel` in `lib/models.ts`,
  the list read by `lib/model-catalog.ts`, server-only, from GET
  /v1/models on the deployment's key, kept twelve hours, no tokens billed), sent again
  on the model as written when the new one answers 400 or 404. The Research Agent, the Thesis Hunter, the Calendar
  agent and the event reports keep their own runs as before. The
  Research Agent (`lib/research-agent.ts`, pure; `lib/research-agent-run.ts`,
  server-only) answers a company's news question against the person's lens
  (thesis, pillars, kill signals, watch items, the methodology's classes and
  rules) in five steps (`runNewsResearch`): Gather (`loadCompanyHeadlines`,
  `filingsOfWeek`, the earnings reports, the person's newsletter and podcast
  points), Filter with no model (`prefilter`: junk by source or headline, a
  repeat, stale, already reported), Sift on Haiku (`siftRequestBody`), Judge
  on Sonnet (`judgeRequestBody`, at most `MAX_FINDINGS`), Check (`parseJudge`:
  every ref given, every figure printed in a cited item or the lens; a finding with no
  figure, tied to nothing the lens names and only maybes dropped as too
  vague, `vagueFinding`), and the
  edge back to Gather (fewer than `MIN_KEPT` left widens `NEWS_WINDOW_DAYS` to
  `WIDE_WINDOW_DAYS` once); an open model runs every step on one model. It
  runs `RESEARCH_PER_MORNING` companies in the morning refresh and
  `RESEARCH_ON_OPEN` on opening the app (`companiesDue`), and keeps the
  findings, the dropped items with why, and every run with its steps in the
  vault's `research_cache`; ratings and lessons live in `agent_feedback`.
  The Thesis Hunter reads the kept items as `feed` refs (F1...) and records
  its runs there. What the price assumes (`pricedFactsFrom`: the reverse DCF
  at today's price, revenue growth delivered, the guidance, the person's
  cases; `pricedInRequestBody`, `parsePricedIn`, a pillar the thesis lacks
  dropped; `pricedInInto`) is asked on request on a thesis (slot
  `thesis_priced_in`) and kept `PRICED_KEEP_DAYS`. Agents (`/agents`, slots
  `agent_map`, `agent_cards`, `agent_curve`, `agent_rules`) and each agent's
  page (`/agents/[id]`: run now, off, ceiling, findings to rate, runs, aged
  calls, lessons) draw it; Company news marks each headline kept or left out
  (`NewsResearch`). The demo reads `data/samples/research_cache.json` and
  `agent_feedback.json`, fictional, and runs nothing. `npm run check:agents`.
- **A methodology is judged on the book, by the app** (Hamza, 23 Oct 2026:
  "not all methodologies are right, and this should be a page that acts as
  a judgment on that, relative to the benchmarks"). Methodology's Evaluation
  view (`?view=evaluation`; `lib/methodology-evaluation.ts`, pure;
  `components/methodology/evaluation.tsx`) reads since the day the person
  set, else the day the methodology was adopted with `ADOPTED_MIN_DAYS` of
  figures after it, else where the value series begins (`startOf`), and says
  which. Whether they invest under it (`adherenceOf`): the listed book's
  share its classes place, today's breaches, the buys since placed by a
  class today (inferred, said so), the sales with a Decision Log entry; no
  class read without filings is a gap, never a drift. Whether it works: the
  tests of the fixed kinds `EVAL_TESTS` (in `lib/methodology.ts`, the
  methodology's optional `evaluation`, which the drafter fills only from
  what the document states), else the tests the person's own model proposed
  and they confirmed (the vault's `evaluation` file, `proposeEvaluation` in
  `lib/methodology-evaluation-run.ts`: the methodology's words and the
  record's dates, never an amount; `parseEvaluationResponse` drops a class
  or section it lacks and a day outside the record), else `defaultTests`:
  the book against the methodology's first benchmark with prices, else SPY,
  with Jensen's alpha; its worst fall; each class from when each holding was
  bought; earnings against price over five years (`perShareTtm`, else
  `epsTtm`, the price over the same quarters). Every verdict is the app's
  arithmetic (`EDGE_PTS`, `CLASS_EDGE_PTS`, `TRACK_PTS`); under `EARLY_DAYS`
  it is read and called too early; only holdings held today are counted, and
  the page says so. `npm run check:performance`.
- **How revenue became profit, as a flow** (Hamza, 5 Nov 2026: "Have it show
  like this in the earnings reports, the companies pages in the app,
  everywhere where it can replace a table that includes these metrics, and
  also a portfolio look-through version of this in the holdings page").
  `lib/income-flow.ts` (pure) holds one model (`incomeFlowSchema`,
  `buildFlow`: the sources, revenue, gross profit and the cost of revenue,
  operating income and the operating expenses in their filed lines,
  `sellingMarketing` and `generalAdmin` among the facts' flows, tax and the
  rest, net income; a loss ends the flow in words; a level that does not
  add up is not drawn) and one layout (`flowLayout`, no two words meeting;
  narrower than `FLOW_MIN_WIDTH`, down to `FLOW_COMPACT_WIDTH`, a phone's
  card, it is drawn compact, names wrapped and values alone) that the report's page (`flowSvg`), its PDF,
  the app's `IncomeFlowChart` (`components/charts/income-flow.tsx`, the
  `--flow-*` tokens, a table view) all draw. A company's quarter and twelve
  months come from the facts (`flowFromFacts`, kept on the filings entry's
  `flows` by the filings read and `publicCompanyEntry`), else the series it
  keeps (`flowFromSeries`), with the segments of the period
  (`segmentSources`); the report's quarter from the release as printed
  (`flowFromRelease`, the release's opex and tax lines) until the facts
  carry it (`detail.flow`), drawn as the `flow` page of `EARNINGS_DOC`
  after the results, whose tiles then leave revenue, margins and profits to
  it, and on the Earnings card in place of those rows. Holdings' `book_flow`
  slot, after What each made: `lookThroughFlow`, each listed holding's
  value over its `ps_ratio` as its share of its company's twelve months,
  the lines scaled and summed, the holdings as the sources, a holding
  without either named. What lies behind the lines (Hamza, 5 Nov 2026:
  "justify anything that needs justification ... for the expenses showing
  what the company said about why they are spending this much and where is
  it all going"; `lib/flow-notes.ts` pure, `withFlowNotes` in
  `lib/earnings-call-run.ts`, the results reader's `flow` step): `flowAsks`
  picks the report flow's expenses, then a cost of revenue, a segment
  `SOURCE_GAP_PTS` apart from the whole, interest and other items, a tax
  rate outside `TAX_RANGE` and an operating margin that moved, at most
  `MAX_FLOW_NOTES`, never a look-through; one call reads them against the
  release's documents at the SEC, the call's transcript and the call as
  read, with `FLOW_SEARCHES` searches, investigative; `parseFlowNotes` keeps
  a note per line asked, why and where the money goes, a quote only when the
  release prints it word for word (the call never quoted), and drops one
  stating a figure no source prints. Kept on `detail.flowNotes`
  (`flowKey`, written again when the flow or the call moves on,
  `flowNotesDue`), a `DECK_NEEDS` the report waits for, drawn as the
  `flow_notes` page after the flow, under the flow on the Earnings card and
  on the company page's quarter when it is the report's. `npm run
  check:earnings`.
- **Credit stress on Macro, from the filings** (Hamza, 5 Nov 2026: the
  highest CDS of the S&P 500 and Nasdaq-100, holdings and watchlist first;
  no free source lets a market spread be shown, DTCC's tape and FINRA's
  TRACE both bar it, and the tape's corporate prints cannot be read as a
  spread). Slot `market_credit` (`lib/credit-stress.ts`, pure;
  `components/markets/credit-stress.tsx`): `creditStress` lays the
  `altman_z` field (Altman's 1968 weights, derived in `fundamentalsOf`
  from current assets, current liabilities, retained earnings, total
  assets, equity, operating income, revenue and the price) with interest
  cover and net debt to EBITDA, the person's own filings over the
  screener's, held and watched first, then the lowest `CREDIT_SHOWN`,
  drawn only once `CREDIT_READY_SHARE` of the judged index is scored
  (`ready`; Hamza, 6 Nov 2026: else they are mostly the person's own, read
  first; the screener reads again first a company read before
  `SCREEN_FIELDS_SINCE`); `NOT_JUDGED_SECTORS` are not scored, and a
  company with no score is left out (Hamza, 6 Nov 2026). Drawn like the
  value map (`creditPoints`: the score up, net debt to EBITDA across,
  Altman's lines dashed, a dot past an edge on it with its arrow, one with
  no EBITDA named), the table folded under it. Altman's zones, never a
  forecast. `npm run check:markets`,
  `check:research`.
- **Flows: where money is moving, a screen of its own** (Hamza, 21 Nov
  2026: "not really macro ... what's happening in the markets right now,
  the flows"; "All six"). `/flows` (screen `flows`, under Markets after
  Macro, `Shuffle`; shown always, public for stealth) draws six slots, each
  badged with the day it was last checked and a sentence when it cannot be
  read: `flow_etfs` and `flow_funds` (below), `flow_positioning`,
  `flow_foreign`, `flow_cash` and `flow_insiders` (`lib/flows.ts` pure,
  `lib/flows-run.ts` server-only, `components/markets/flow-cards.tsx`).
  Those four are read for everyone at the 05:00 UTC run (`readFlowSources`,
  `SOURCES_BUDGET_MS`), each when due (`flowSourcesDue`,
  `FLOW_SOURCE_DAYS`, a failure again after `FLOW_SOURCE_RETRY_DAYS`), kept
  as one row in `company_figures` (kind `flow`, `sources`, with `tried`
  per source: the last try and its sentence), a failed source keeping its
  last good copy. Positioning is the CFTC's Commitments of Traders
  (`COT_MARKETS` by contract code, `cotUrl` on the Socrata API,
  `parseCot`: asset managers' and leveraged funds' net on the S&P 500,
  the Nasdaq-100, the 10-year note and the dollar, managed money's on gold
  and crude), each as a share of open interest against its own
  `COT_WEEKS` (`positionRows`, `rankWords`). Foreign buying is the
  Treasury's TIC table 1 (`TIC_URL`, `parseTicTable1`: the all-countries
  row alone, `TIC_TOTAL_CODE` or Grand Total, by the file's field-code row;
  no total throws, the countries are never summed, since regional totals
  sit beside them; `foreignYear`). Cash is the OFR's Money Market Fund
  Monitor (`MMF_SERIES`, `mmfUrl`, `parseOfrSeries`, `cashNow`: the total
  and its instruments at month ends). Insiders is the SEC's quarterly
  insider transactions data set (`quartersBefore`, read by `secFile` at
  `insiderZipUrls` in `lib/edgar.ts` with the deployment's contact and opened
  by `unzip` in `lib/zip-read.ts`, server-only, stored and deflated
  alone): `insidersOf` sums each Form 4's P and S trades by the sector the
  screener keeps for the S&P 500 and Nasdaq-100 (`sectorsOfIndex`, a
  ticker matched without punctuation), `MAX_TRADE_USD` a row at most, the
  `TOP_BUYS` largest purchases. CFTC and OFR are licensed feeds (`cftc`,
  `ofr` in `lib/licences.ts`), TIC is the `treasury` feed, read through
  `getText` in `lib/markets-feed.ts` (`loadCot`, `loadTic`, `loadMmf`). The
  demo reads `data/samples/flow_sources.json`, fictional. Macro draws no
  flows. `npm run check:markets`.
- **Where the money in ETFs went, from the SEC** (Hamza, 20 Nov 2026, after
  The ETF Tracker's chart; "SEC filings" over the issuers' files). Slot
  `flow_etfs` on Flows, and the funds money moved most, `flow_funds`
  (`fundsMoved`, `FUNDS_PER_SIDE`, `FundsMovedCard`) (`lib/etf-flows.ts`
  pure, `lib/etf-flows-run.ts`
  server-only, `components/markets/etf-flows.tsx`): `FLOW_FUNDS`, the
  largest US ETFs by bucket (`BUCKETS`), each fund's monthly flows from its
  NPORT-P (Item B.6, `mon1Flow` to `mon3Flow` under fundInfo, `sales`,
  `reinvestment`, `redemption`; `parseNportFlows`, month 3 the report's
  own), its two latest reports (`REPORTS_PER_FUND`), read only to the end
  of fundInfo (`nportStart` in `lib/edgar.ts`, `FUND_INFO_END`). A fund's
  trust and series come from the SEC's fund list (`fundTickers`,
  `fundTickersOf`); a trust that files for many series is indexed once, each
  new filing's genInfo read for its series (`nportSeriesOf`, kept by CIK in
  `company_figures` kind `nport_index`); a unit trust (SPY, QQQ, DIA) carries
  its CIK and the words its filing's name must hold. Read weekly for
  everyone at the 05:00 UTC run with the deployment's own SEC contact
  (`readEtfFlows`, `fundsDue`, kept as kind `etf_flow` by ticker).
  `etfFlows` takes the latest `WINDOW_MONTHS` months that funds holding
  `MIN_COVERED_SHARE` of the read assets report, counts a fund only when it
  covers all of them and names the rest; `sankeySides` and `sankeyLayout`
  spread each outflow and the new money over the inflows in proportion,
  since money is not labelled. The public N-PORT is quarterly, about sixty
  days late, so the chart names its months (`windowWords`, `flowsNote`).
  Gold, silver and bitcoin trusts file no N-PORT. The demo reads
  `data/samples/etf_flows.json`, fictional. `npm run check:markets`.
- **The value map places each company by its forward P/E against its EPS
  growth** (Hamza, 24 Oct 2026, after Dividendology's Stock Value Map). Slot
  `value_map` on Holdings, after the portfolio's P/E (`lib/value-map.ts`,
  pure; `components/holdings/value-map.tsx`): every listed holding, filled,
  and every watchlist record, hollow, at the analysts' forward P/E
  (`consensus_forward_pe`), else the filings' (`forward_pe`, or `pe_ratio`
  carried a year at revenue growth by `grownForward`), against the EPS
  growth a year on a switch (`?vm=`): the analysts' projection from Nasdaq's
  yearly consensus, the fiscal year in progress to the furthest listed
  (`projectedGrowth`), or what the filings delivered over five years, else
  at least three (`deliveredGrowth`). The line is a PEG of 1, a reference
  and never a verdict; the axes reach 60% and 50x at least (`mapAxes`), a
  point past them grows them; labels are placed clear of each other
  (`placeLabels`); a table view, and each company it cannot place named
  with what it lacks. `npm run check:theses`.
- **Performance reads its figures through the methodology, on request**
  (Hamza, 23 Oct 2026: beside alpha, TWR and the rest, what each means in
  the context of the methodology, pressed for). Slot `perf_insights`
  (`lib/perf-insights.ts`, pure; `lib/perf-insights-run.ts`;
  `components/performance/insights.tsx`): `perfFacts` writes each card's
  figures as lines in percent and ratios (`INSIGHT_CARDS`: returns, irr,
  alpha, risk, drawdown, days, look_through, by_holding; the last two from
  `lookFacts` on the Look-through's groups and holdings, Hamza, 24 Oct
  2026), `methodologyLens` the methodology's name,
  classes, rules and tests, and one call on the person's own provider
  (`insightsRequestBody`, `record_insights`) returns an overall line and one
  reading per card with a tone (`INSIGHT_TONES`) and up to three sections.
  `parseInsights` drops a card not sent or read twice, a reading quoting a
  figure its card does not show (`figuresNotGiven`) and a section the
  methodology lacks, item by item, so one malformed reading (a fourth section, items sent as JSON text) costs that reading alone and a cut answer says so. The Look-through card carries `againstLines`: `againstFund` in `lib/look-through.ts` (pure) sets the book against the fund the methodology names (`comparisonFund`: its first benchmark the look-through reads, else SPY, else QQQ) on each figure, the figures being the fields its classes and figures read (`lookThroughFields`) in the ontology's units, which way the classes' own tests want it (`classFilters`: all upward, higher; all downward, lower), where the book stands, each class's average against its test, and the `MAX_PULLS` holdings pulling it the wrong way, each one's share of the book's reading times its distance from the fund, so the pulls add up to the gap; drawn as Against SPY, by your classes under the look-through (Hamza, 24 Oct 2026). Kept in the vault's `perf_insights` file with the
  windows read; `insightsCurrent` hides them when the page shows other
  windows or a later day. Each reading sits under its card (`InsightNote`),
  the overall and the button at the top (`InsightsBar`). No amount is
  sent; a holding goes only by symbol, class and weight in percent, at
  most `MAX_LOOK_HOLDINGS`. The demo shows `data/samples/perf_insights.json`, made by
  no model. `npm run check:performance`.
- **One earnings report per results, a document drawn as a page and a PDF,
  kept in the ontology** (Hamza, 4 Nov 2026: "one deck called the earnings
  deck", then the same day an HTML page embedded in the app and a PDF, no
  n/a, held until complete). `EARNINGS_DOC` (26 pages, each with what it
  shows, its template section and what it reads, `DECK_SOURCES`) in
  `lib/ontology.ts` is what `lib/earnings-doc.ts` lays out
  (`earningsDoc`, `EARNINGS_DOC_PAGES`) from the kept report alone, as a
  `ReportDoc` (`lib/report-doc.ts`: `cleanDoc` drops an empty value, a
  missing-words line or an unfinished one; `checkDoc` is the app's first
  pass), drawn by `reportHtml` (`lib/report-html.ts`) for the page the app
  embeds and `ReportDocPdf` (`components/reports/report-doc-pdf.tsx`,
  react-pdf, `DOC_FONTS`) for the PDF, both from the same chart geometry
  (`lib/report-charts.ts`); `/api/earnings/deck` serves `format=html` and
  `format=pdf` (`docViewHref`, `deckHref`). A figure the company does not
  report is left out and the last page says so; a gap of the app's is read.
  The review note (`review` on `detail.brief`, written with the brief,
  `BRIEF_VERSION`) reads the study through this quarter: what is new, what
  it bore out, what it changes, never the study's own words; the study
  itself stays a PDF beside the report. A report is drawn only once it is
  whole (`DECK_NEEDS` and `deckReadiness` in `lib/earnings.ts`: the
  figures, the call, a study finished since the results and its review
  note; on a person with no SEC contact only the figures; a study not
  written within `RESULTS_STUDY_DAYS` is not waited for; after
  `DECK_WAIT_DAYS` it is made with what is on file), then read by a
  reviewer (`lib/doc-review.ts` on the fast model, `docReviewRequestBody`,
  `parseDocReview`: a quote the report does not contain is dropped), whose
  drops are taken out (`reviewedDoc`) and whose holds keep it back until a
  later read mends it or the wait is over (`reviewVerdict`); the verdict is
  kept on the report (`doc`: `at`, `sig` from `docSig`, `ready`, `drop`,
  `held`), read again only when the words change (`withDecks` in
  `lib/earnings-run.ts`). `deckWaiting` says what it waits for on Earnings
  and Theses. From 4 Nov 2026 the release and figures stages are alerts
  but no email; the one email is the report's alert
  (`earnings-report:<key>:deck`) once `doc.ready`, with the PDF attached
  (`ReportFile`) and the move since the release beside SPY's
  (`sinceRelease` in `lib/alerts-run.ts`, from `loadExtended` at the SEC's
  acceptance time). No deck is made or kept in Drive.
  `npm run check:earnings` holds the page counts and the titles. The four
  call pages (Hamza, 29 Oct 2026): beats and misses (`beatsOf` in the pure
  `lib/earnings-call.ts`: the call's `beats` against the consensus or the
  company's guidance, `INLINE_PCT` in line, and the app's own row of the
  filed diluted EPS against Nasdaq's consensus, `consensusEps` on the
  report, when the reading has no EPS row and the figures are in dollars),
  the guidance (each item with what it was before and `change`), the
  guidance against the thesis (`bearsOn` matched to a pillar, watch item or
  the pathway, `matchTarget`) and the call (remarks and the analysts' `qa`).
  The call (`r.call`, `reportCallSchema`) is the one the person's own
  Claude writes on an evidence entry through `write_thesis` (`call`,
  `callFromNotes`, from "notes"), else read once on their model
  (`withCalls` in `lib/earnings-call-run.ts`, `callReadRequestBody`,
  `parseCallResponse` item by item, a page for each item; an empty read
  tried again after `CALL_RETRY_HOURS`), with no Quartr in the app (Hamza,
  4 Nov 2026): the release's own documents from the SEC (`releaseMaterial`,
  the press release and its exhibits, the CFO commentary, prepared remarks
  or letter many companies file, `CALL_DOCUMENT_CHARS` at most) and, on a
  Claude key with an app model, the transcript's page read whole after a
  search (`web_fetch`, `CALL_FETCHES`); `resultsToRead` counts a company
  read only when an entry since its results carries the call (`callRead`).
  The study's pages (competition, voices, moats, capital, SWOT, the
  questions, the outlook) carry the report's own words (`detail.brief`,
  `lib/deck-brief.ts`, written once per study and call by `withBriefs`,
  `briefDue`), never a pointer to the study. No text is cut with an
  ellipsis: a cut line ends at a whole sentence (`sentenceCut`,
  `wholeSentences`).
- **A class counts its passes.** `required` filters must all hold; `criteria`
  hold in at least `minimum` (all when none is given), or in at least
  `minimumShare` percent of those that could be measured; a criterion with no
  reading does not hold and is reported as unread, never as passed
  (`classTest` in `lib/recipes.ts`). A criterion may carry `given`
  (conditions; when one fails it is not measured and leaves the count) and
  `or` (alternatives, each with its own `given`, read when the criterion
  itself does not hold); the reading says which alternative met it.
- **The engine comes from the filing itself.** SEC company facts carry no
  segment lines, so `lib/edgar-segments.ts` (pure) reads the segment note
  and the revenue disaggregation of the latest 10-Q, 10-K, 20-F or 40-F from
  its XBRL instance, which `lib/edgar.ts` fetches (submissions, the filing
  index, the instance; the CIK and the accession alone in the URL). Setup
  and Research lay `engine_growth_pct` and `engine_share_pct` on the
  fundamentals with a note naming the line; a filing that cannot be read
  costs the lines, never the figures, and says so. What the facts cannot
  carry (price against volume, C3(b)) is the reader's to check, in the note.
  The same reader takes revenue by geography from the latest 10-K, 20-F or
  40-F (else 10-Q): revenue facts with one member on a geographic axis
  (`geographyRead`), in the company's own grain, reconciled to its total
  (`reconcileGeography`: a total or an overlapping line is dropped, never
  counted twice; lines that do not add up leave the company partial). The
  filings file keeps it with the form, period and accession
  (`revenueGeography`), `applyFilings` lays it on the holding, and Holdings
  shows "Revenue by country" (`revenueByGeography` in `lib/exposure.ts`)
  instead of the issuer's address country; what no filing places is a
  named remainder, never "Unknown".
- **A methodology's measurement bases are fields, never per-holding
  overrides.** How a ratio is measured (which debt, which tax rate, which
  period, when a lender's cash flow is not conversion) is a field of the
  ontology with its basis in its description, derived in
  `fundamentalsOf` (`lib/edgar-facts.ts`) from the filings; the methodology
  picks the field. The facts are read on one basis (Hamza's Claude's audit,
  19 Oct 2026): a split shows as a period filed twice at a whole-number
  ratio on the diluted EPS, the diluted shares or the shares outstanding
  (`splitsOf`), and every per-share figure and share count filed before the
  restating filing is put on today's count (`onTodaysShares`, said in
  `derived` and the notes); a twelve-month duration is a fiscal year only
  when a filing marks it FY (`periodsOf`; a 10-Q's trailing twelve months is
  not a year); a broker's `RevenuesNetOfInterestExpense` is read before the
  contract concept; `fundamentalsOf(t, price, priceCurrency, fx)` carries a price in
  another currency into the filings' at the day's rate (`listingRate` in
  `lib/markets-feed.ts`: listing units per filing unit, one listed share as
  one filed share; `valuationDefaults` and `dcfDefaults` take the same
  `fx`), and leaves the P/E and the yield as none, said so, when no rate
  can be read; the ontology's field descriptions say these bases; a
  balance last filed before the trailing period (`latestBalance` within its
  four quarters, `lastReported` for the note) is none, never counted. A
  class a person voted is reproduced by the rules that
  led to the vote, not recorded; no Records entry, preference or schema
  field sets a holding's class. The class a vote names is kept in its
  Decision Log entry as what was voted, never read as the holding's class.
- **Gaps grow the ontology.** A methodology carries `gaps`: what its document
  asks for that the ontology cannot express, recorded by the drafter and
  shown on the Methodology screen with a Copy button. They are read by a
  person and land as ontology changes in this repository for everyone;
  nothing adapts itself in production, and a gap never carries a figure of
  anyone's portfolio.
- **The software fixes itself; the operator merges** (Hamza, 4 Nov 2026).
  What the app learns from everyone is counted in the registry
  (`lib/improvements.ts` pure, `lib/improvements-run.ts` server-only):
  `improvement_signals` (a key from the kind and the normalised words, the
  kind `gap` or `rating`, the words at most `MAX_SIGNAL_WORDS`, the number
  of people, first and last seen) and `improvement_votes` (the signal and the
  keyed fingerprint `meterKey`, never the address). A confirmed methodology's
  gaps are signals (`gapSignals`: what is missing and what was asked,
  `scrubWords` masking money and taking out runs of five digits or more), and
  a finding rated not useful is one per reason (`ratingSignals`: the agent,
  `ratedStep` and the `WRONG_REASONS` reason, never the finding, the note or
  the company), and a figure the filings reader missed although the filings
  carry its line under a concept it does not read (`readerSignals`, kind
  `reader`, from the report's `fundamentalsNotes` when `withDecks` reads it
  through: the field and the standard concept names alone). Recording never fails the action it rides on. Help improve
  Invariant on Account settings (`improve` in the preferences, on by
  default, `recordsSignals`) switched off records nothing and deletes the
  person's votes (`forgetSignals`); the demo records nothing. A weekly
  Claude Code routine (`docs/SELF_FIX.md`, its prompt) reads the commonest
  through the Neon connector, makes at most two ontology, recipe or agent
  changes with a check case, runs every check and opens each as a pull
  request labelled `self-fix` (`SELF_FIX_LABEL`); it never merges and never
  reads a person's data. `/ops` lists the signals (`topSignals`,
  `rankSignals`: people, then the most recent) and the open self-fix pull
  requests with their checks (`checksWord`), each merged (squash, at the
  head shown) or closed there by an operator, each confirmed
  (`app/ops/actions.ts`); `lib/github-ops.ts` alone calls GitHub, on
  `OPS_GITHUB_TOKEN` and `OPS_GITHUB_REPO`, which the guard holds; without
  the token the page links GitHub. `npm run check:agents`.
- **Figures come from the methodology, never from a catalogue of views.** A
  methodology's figures, classes and rules are recipes (data, never generated
  code) that `lib/recipes.ts` computes. To let methodologies say something
  new, add a field, measure, window, grouping or panel to `lib/ontology.ts`
  and a case to `npm run check:setup`; never a style-specific figure family.
  The drafting prompt reads the ontology, so it learns the new entry without
  edits.
- **Every element carries its links.** A rule points at its section and the
  figure it tests; a figure at the fields it reads; the dashboard at what it
  shows. `graph()` exports them; the Graph screen shows them; `without()`
  keeps them consistent when the builder removes an element.
- **Pure logic in pure modules:** `lib/setup.ts`, `lib/ontology.ts`,
  `lib/recipes.ts`, `lib/methodology.ts`, `lib/screens.ts`,
  `lib/screen-data.ts`, `lib/decisions.ts`, `lib/trade-check.ts`,
  `lib/performance.ts`, `lib/trades.ts`, `lib/todo.ts`, `lib/library.ts`, `lib/holdings.ts`, `lib/positions.ts`, `lib/options.ts`,
  `lib/exposure.ts`, `lib/flex.ts`, `lib/adapters/*`, `lib/markets.ts`, `lib/property-watch.ts`,
  `lib/preferences.ts`, `lib/report.ts`, `lib/review.ts`, `lib/class-register.ts`, `lib/ontology-graph.ts`, `lib/parity.ts`, `lib/synthetic.ts`,
  `lib/draft-prompt.ts`, `lib/research.ts`, `lib/edgar-facts.ts`,
  `lib/research-prompt.ts`, `lib/analyst.ts`, `lib/model-provider.ts`, `lib/connections.ts`,
  `lib/statements.ts`, `lib/inbox.ts`, `lib/correlation.ts`, `lib/market-day.ts`, `lib/treemap.ts`, `lib/macro-sources.ts`, `lib/economies.ts`, `lib/donut-layout.ts`, `lib/compose-book.ts`, `lib/nport.ts`, `lib/look-through.ts`, `lib/alerts.ts`, `lib/review-pdf.ts`, `lib/review-html.ts`, `lib/newsletters.ts`, `lib/market-recap.ts`, `lib/custom-data.ts`, `lib/earnings.ts`, `lib/earnings-call.ts`, `lib/deck-brief.ts`, `lib/earnings-deck.ts`, `lib/portfolios.ts`, `lib/brokers.ts`, `lib/live.ts`, `lib/return-chart.ts`, `lib/freshness.ts`, `lib/mcp.ts`, `lib/mcp-tools.ts`, `lib/mcp-auth.ts`, `lib/greeting.ts`, `lib/dcf.ts`, `lib/theses.ts`, `lib/community.ts`, `lib/thesis-review.ts`, `lib/figure-range.ts`, `lib/company-news.ts`, `lib/portfolio-pe.ts`, `lib/holding-made.ts`, `lib/dividends.ts`, `lib/valuation-history.ts`, `lib/company.ts`, `lib/stealth.ts`, `lib/podcasts.ts`, `lib/thesis-hunter.ts`, `lib/thesis-pdf.ts`, `lib/push.ts`, `lib/reach.ts`, `lib/investigate.ts`, `lib/reaction-history.ts`, `lib/bull-bear.ts`, `lib/thesis-scorecard.ts`, `lib/watchers.ts`, `lib/screen-words.ts`, `lib/mcp-research.ts`, `lib/screener-table.ts`, `lib/forward.ts`, `lib/peers.ts`, `lib/watch-reference.ts`, `lib/earnings-email.ts`, `lib/agents.ts`, `lib/research-agent.ts`, `lib/methodology-evaluation.ts`, `lib/value-map.ts`, `lib/perf-insights.ts`, `lib/econ-exposure.ts`, `lib/event-history.ts`, `lib/event-sensitivity.ts`, `lib/calendar-agent.ts`, `lib/macro-report.ts`, `lib/macro-deck.ts`, `lib/metric-info.ts`, `lib/models.ts`, `lib/deployment.ts`, `lib/time.ts`, `lib/jobs.ts`, `lib/log.ts`, `lib/planner.ts`, `lib/lens-agents.ts`, `lib/custom-agents.ts`, `lib/printed-figures.ts`, `lib/extended-hours.ts`, `lib/resonance.ts`, `lib/palette.ts`, `lib/cite.ts`, `lib/licences.ts`, `lib/improvements.ts`, `lib/credit-stress.ts`, `lib/flow-notes.ts`, `lib/calendar-links.ts`, `lib/plans.ts`, `lib/clubs.ts`, `lib/open-rules.ts`, `lib/invariant-skill.ts`, `lib/zip-store.ts`, `lib/receipts.ts`, `lib/fund-creeds.ts`, `lib/methodology-versions.ts`, `lib/shadow.ts`, `lib/public-calls.ts`, `lib/badge.ts`, `lib/mentors.ts`, `lib/ask-claude.ts`, `lib/etf-flows.ts`, `lib/flows.ts`, `lib/portfolio-grid.ts`, `lib/ecosystem.ts`, `lib/db-usage.ts` import nothing server-only. `lib/analyst-graph.ts`, `lib/judgement.ts`, `lib/rule-packs.ts`, `lib/marketplace.ts`, `lib/open-data.ts`, `lib/households.ts` is the LangChain agent loop over a model
  the caller injects: no key, no network of its own, not for client components.
  `lib/workspace.ts`, `lib/vault.ts`, `lib/review-page-run.ts`, `lib/review-pdf-run.ts`, `lib/agent-ledger.ts`, `lib/agents-run.ts`, `lib/model-catalog.ts`, `lib/user-drive.ts`,
  `lib/google-user.ts`, `lib/methodology-draft.ts`, `lib/analyst-agent.ts`,
  `lib/edgar.ts`, `lib/markets-feed.ts`, `lib/property-watch-run.ts`,
  `lib/ibkr-flex.ts`, `lib/snaptrade-api.ts`, `lib/etoro-api.ts`, `lib/filings-run.ts`, `lib/daily-sync.ts`, `lib/report-run.ts`, `lib/report-mail.ts`, `lib/registry.ts`,
  `lib/pdf-text.ts`, `lib/statements-run.ts`, `lib/inbox-mail.ts`, `lib/inbox-run.ts`, `lib/benchmarks-run.ts`, `lib/alerts-run.ts`, `lib/market-recap-run.ts`, `lib/custom-data-run.ts`, `lib/podcast-feed.ts`, `lib/podcasts-run.ts`, `lib/thesis-hunter-run.ts`, `lib/thesis-pdf-run.ts`, `lib/push-send.ts`, `lib/notifications-run.ts`,
  `lib/inbox-tag.ts`, `lib/mcp-run.ts`, `lib/earnings-run.ts`, `lib/earnings-call-run.ts`, `lib/theses-run.ts`, `lib/thesis-review-run.ts`, `lib/company-news-run.ts`, `lib/company-run.ts`, `lib/words-run.ts`, `lib/mcp-research-run.ts`, `lib/research-agent-run.ts`, `lib/methodology-evaluation-run.ts`, `lib/perf-insights-run.ts`, `lib/study-run.ts`, `lib/calendar-run.ts`, `lib/calendar-agent-run.ts`, `lib/macro-report-run.ts`, `lib/catch-up.ts`, `lib/jobs-run.ts`, `lib/rate-limit.ts`, `lib/hosted-model.ts`, `lib/model-meter.ts`, `lib/improvements-run.ts`, `lib/github-ops.ts`, `lib/clubs-run.ts`, `lib/beta-run.ts`, `lib/fund-creeds-run.ts`, `lib/open-data-run.ts`, `lib/public-calls-run.ts`, `lib/judgement-run.ts`, `lib/ask-claude-run.ts`, `lib/etf-flows-run.ts`, `lib/flows-run.ts`, `lib/zip-read.ts`, `lib/ecosystem-run.ts`, `lib/neon-usage.ts` and `lib/auth.ts` are server-only.
- **Reviews are the methodology's slots, in HCMP's order.** The weekly and
  monthly review (`lib/review.ts`, pure; composed in `lib/report.ts`) follow
  the Reviews screen's slots in `lib/ontology.ts`: verdict (the worse of two
  pillars, Behaviour and Holdings and theses; returns are context and never
  decide it), alarms, returns against the benchmarks the methodology names,
  what moved the book (contribution and correlation from the closes per
  holding, `series.holdings`), insights, caps and capital, trades with their
  Decision Log entry and vote, the rulebook (every rule followed, partly, not
  followed or the person's to check), holdings and theses, markets this
  period (shown when the methodology reads markets), news, coming up, the
  month in numbers, sources and method. A slot the data cannot fill says
  what it needs. Each kept section carries its `slot` (and the news its
  `part`: holdings, macro, tech, geopolitics, upcoming), and the report
  keeps the figures its charts draw (`charts`: the period and year-to-date
  paths, contribution, caps, mix, the correlation matrix, market moves). The
  news comes from a web search on the person's own Claude provider
  (`newsRequestBody`, room for the whole answer in `NEWS_MAX_TOKENS`), each
  item with its source and topic, read item by item (`parseNewsResponse`: a
  date in any shape, a long line clipped, an item without a date or a page
  dropped and counted in a note, never the whole week's news; Hamza, 18 Oct
  2026); an open model skips it with a sentence. The commentary
  (`narrateReport`) counts every text block and is asked once more when it
  comes back empty; a second empty answer is a note saying what came back. The weekly goes out every scheduled day, the
  monthly in the first week of a month (`kindsDue`). Each review is a PDF
  report, with no PowerPoint and no Slides (Hamza, 4 Nov 2026), in its own
  look (Hamza, 18 Oct 2026, and again 5 Nov 2026: "keep this layout"; the
  HCMP 2026 YTD review is the model, page for page): `lib/review-pdf.ts`
  (pure) plans it from the kept report alone (`reviewPdfPlan`: the cover's
  tiles and bottom line, then numbered chapters that close up when a slot is
  off: performance, attribution, trades, methodology adherence, risk, news
  and newsletters, your questions, the action plan, the appendix; line, bar,
  donut and heat charts as geometry; `slotOfSection` reads a review kept
  before the tags by heading) and `components/reports/review-pdf.tsx` draws
  it with react-pdf (`lib/review-pdf-run.ts`, server-only): Inter from
  `public/fonts` (`registerPdfFonts` in `lib/pdf-fonts.ts`), black on
  white, blue kickers, the palette, status dots, callouts, the black
  verdict box, one page per chapter with the footer on each (one text; a
  second text for the page count beside the name breaks react-pdf past
  about ten pages). The page in the app is the same plan drawn as HTML
  (`reviewHtml` in the pure `lib/review-html.ts`): white A4 sheets, the
  cover and one per chapter, the same tables, chart geometry, colours and
  face, sized in the PDF's points (`--u`, larger on a phone, where the
  cover's tiles go two to a row), every chart with a table behind it.
  `lib/review-page-run.ts` (server-only) serves the page at
  `/api/reports/deck` and the PDF at `/api/reports/pdf` (or `format=pdf`).
  `withPdf` in `lib/report-run.ts` makes the PDF, a Drive vault keeps the
  last per kind (`savePdf`, keys `report_weekly` and `report_monthly`), and
  the email attaches it (`ReviewPdf`). Reviews embeds the page
  (`ReviewEmbed` in `components/reports/review-embed.tsx`, in
  `StableEmbed`, which puts the page back where it stood when the embed's
  focus scroll moves it; Hamza, 18 Oct 2026) with Open and the PDF, beside
  the last weekly and monthly as sent (`sentAt`), and draws nothing under it
  that repeats it (`embedsItself` in `lib/report.ts`; Hamza, 19 Oct 2026):
  the sections (`ReportView`) are drawn only for a daily report. A deck a
  review kept before 4 Nov 2026 still parses and is never linked. The person keeps up to `MAX_QUESTIONS`
  questions about their own portfolio (`reviewQuestions` in the
  preferences, the form on Reviews), each answered from the review's own
  figures on their key (`answerQuestion`, `questionRequestBody`) and laid
  on the review as the `review_questions` slot (`withQuestions`), a
  chapter; the commentary (`proseRequestBody`) asks for three
  paragraphs within `PROSE_MAX_TOKENS`, and a cut answer is kept and noted
  (`answerCut`). A digest dated by its arrival alone is dated again at the
  next inbox read (`redateInto` in `lib/inbox-run.ts`, `undatedDigests`,
  `redateDigest`, `newsletterDated`: the forwarded Date line, else the date
  printed at the top, `printedDate`, else the header, else the arrival,
  `dateFrom` saying which). `npm run check:report` and
  `npm run check:pdf` hold the shape; `npm run check:review-parity` reads
  a review against a week file from another system, on files kept outside
  this repository.
- **The app learns from fictional people, never from real ones.** The
  synthetic loop (`data/synthetic/`, `npm run check:synthetic`,
  `npm run synth:loop`) runs invented personas through the real pipeline and
  a judge names what the ontology, the recipe language or the drafter cannot
  say yet. Its proposals are read by a person and land as ordinary code
  changes; nothing adapts itself in production. The model half runs locally
  on a key in `.env.local` and its output stays in `synthetic-runs/`, which
  is not committed.
- **Research: figures from filings, verdicts from recipes, prose from the
  model.** A study follows the canonical template of the methodology's family
  (fundamentals, options, quant, macro; `lib/research.ts`), amended by the
  methodology's classes and rules; a person's own template lives in their
  vault, never in this repository. Figures come from SEC EDGAR company facts
  (`lib/edgar-facts.ts`, nothing estimated), the methodology's own recipes
  judge the subject, and the model only writes, on the person's key, with
  every figure traceable. `npm run check:research` holds all three. A
  study is written at every post-earnings report too (Hamza, 27 Oct 2026;
  `resultsStudyDue`, `resultsStudyQuestion` and `withStudiesOnReports` in
  `lib/earnings.ts`, run by `resultsStudiesInto` in `lib/study-run.ts`,
  server-only, which also holds `queueStudy` and `runStudy` for the Research
  screen): for each newest report within `RESULTS_STUDY_DAYS` with no study
  of the symbol asked since its results day, one queued and one written per
  run (catch-up and the morning refresh), marked `forResults` with the
  results day; once finished it is laid on the report's `detail.study` and
  the decks are made again (`keepDecksInto`), so competition, moats, SWOT and
  the questions are filled. The deck's detail also keeps the valuation
  history (`history`, `deckHistory`) and the peers (`peers`, `deckPeers`,
  from the vault's screener file), drawn as two charts on Valuation: history
  and peers; a company not held is priced at its last close and carried into
  the filings' currency (`listingRate`). Under an embedded deck the study
  downloads as a PDF (`studyHref`). IFRS filers' segments are read on
  `ifrs-full:SegmentsAxis` and `ProductsAndServicesAxis`. Every derived
  figure carries an (i) that says how it is calculated (`InfoTip` in
  `components/ui/info-tip.tsx`, CSS alone, on hover and focus; the words from
  `metricInfo` in the pure `lib/metric-info.ts`: the ontology field's own
  description with field ids as labels and code references dropped, plainer
  words where needed, `EXTRA_INFO` for figures beside the fields). A
  finished study downloads as a PDF in the stock template's own face
  (`components/research/study-pdf.tsx`: Space Grotesk from `public/fonts`,
  navy on vellum, charts from the pure `lib/study-charts.ts`, status colours
  only in a result cell); `npm run check:pdf` holds it.
- **One request shape, any provider.** Every prompt module writes the
  Anthropic Messages shape; `lib/model-provider.ts` (pure) translates it to
  and from an OpenAI-compatible endpoint, so every parser reads one shape.
  The calls are made in `lib/methodology-draft.ts` (`callModel`) and, for
  the analyst, `lib/analyst-agent.ts` alone; the guard holds that. What
  only Claude can do here (read a PDF, search the web) is refused on another
  provider with a sentence saying what to do instead, never attempted.
  `npm run check:model` holds the translation. A turn Claude pauses mid-search (`pause_turn`) is sent back as its own turn and the parts read as one answer (`continuedRequest`, `joinedResponses`, `PAUSE_TURNS`, in `callModel`; Hamza, 29 Oct 2026). On a Claude key every call is
  sent with its prompt cached (`withPromptCache`, applied in `callModel`: a
  breakpoint on the system prompt, the automatic one on a conversation; the
  analyst's loop through `anthropicPromptCachingMiddleware`; Hamza, 24 Oct
  2026), and the agents' cost counts cache writes and reads. The synthetic loop reads the
  same two provider kinds from `.env.local`, so an open model is scored
  against Claude on the same personas before anyone is told it is enough.
- **A statement is read by the model and checked by the app.** A bank
  statement, portfolio report or fund report (PDF) is read on the person's
  own provider (`lib/statements-run.ts`): its text layer (`lib/pdf-text.ts`)
  when it has one, so any provider can read it, else the PDF itself, which
  only Claude can. The model records what the document holds through one
  tool (`lib/statements.ts`, pure); the app then looks for every figure and
  ISIN in the document's printed text and checks the positions against the
  printed total. A document that passes is in use; any other waits on the
  Statements screen for the person to confirm or remove it, and a failure is
  a sentence. Only what each document said is kept, in the vault's
  `statements` file, never the document. `withStatements` lays the latest
  statement per account and the latest report per fund on the book, beside
  the broker's holdings, on the screens and in the reports alike; a position
  in a currency nothing converts is left out and said so. Statements also
  arrive by email: one operator inbox (`INBOX_ADDRESS`, an app password in
  `INBOX_PASSWORD`) with a tag per person (a hash of their sign-in), read by
  IMAP in `lib/inbox-mail.ts` alone, read-only, in the morning refresh and
  by "Check the inbox now". An email is read only when the receiving
  server's own Authentication-Results line shows the person's account sent
  or forwarded it (`lib/inbox.ts`, pure); anything else is set aside unread.
  Gmail's forwarding request is confirmed by the app itself
  (`latestForwarding`, `confirmForwarding` in `lib/inbox-run.ts`: one GET
  to Google's link, then one POST of the Confirm form Google's page
  answers with, read by the pure `readConfirmPage`; Confirmed only on
  Google's own words, else the Confirm in Google button,
  `ForwardingFallback`; Hamza, 18 Oct 2026) at the morning refresh, on Check the inbox now, and
  every half minute while Statements or Newsletters is open
  (`ForwardingWatch`, `watchForwardingAction`, one look per person every
  twenty seconds at most; Hamza, 18 Oct 2026); the code and link are shown
  to the person it names only when Google would not take it. A
  confirmation Google gave is kept in the vault's `forwarding` file (one
  per address, when the request came and when Google agreed, how, never a
  link or a code; `confirmForwardingInto`, the one path the refresh, the
  checks and the watch share), shown from the first paint and never opened
  again; Newsletters opens with "Is it working" (`forwardingProof` in
  `lib/newsletters.ts`, pure: what Gmail's filter forwarded, what came by
  hand, each digest's `via`), and its watch reads a newsletter the minute
  it lands and refreshes the page, since a Gmail filter forwards only what
  arrives from then on; the last `BACKFILL_DAYS` days come through the
  person's own Claude, which the finder prompt (`finderPrompt(address)`)
  and step 3's `backfillPrompt` ask to forward them to the address, the
  app reading no Gmail itself (Hamza, 18 Oct 2026). The link
  (`vf-` on mail.google.com since Oct 2026, or mail-settings.google.com;
  `isForwardingConfirmLink`, the only link the app opens) is read from the
  email's text, its HTML links or its HTML (`forwardingLinks(text, html)`),
  since the parser gives an HTML-only multipart email no text; an email
  with no readable link says so. An email read to
  the end is remembered by a hash of its Message-ID; the mailbox is never
  changed. `npm run check:statements`.
- **A newsletter becomes a digest on the person's key.** Each person also
  has a newsletters address on the same inbox (their tag plus `-news`,
  `newslettersAddressFor` in `lib/newsletters.ts`, pure), which a Gmail
  filter forwards to; the Newsletters card on Setup (`NewslettersCard`; the
  screen is gone and `/newsletters` opens it, Hamza, 19 Oct 2026) guides it in Gmail's own words
  and shows the forwarding code. `readNewslettersInto` (`lib/inbox-run.ts`)
  reads each one the person's own account forwarded, once, as text, on
  their own provider (any provider; `newsletterRequestBody`, one
  `record_newsletter` call) into a topic, a two-line summary and up to six
  points with the holdings each touches (a symbol outside the book is
  dropped). Only the digest is kept, in the vault's `newsletters` file,
  never the email; a failed read keeps a sentence and is tried again, a
  stranger's mail is set aside unread. The morning refresh reads them for
  everyone the inbox holds newsletters for; a review lays the period's
  digests on itself (`withNewsletters`: by sender, then the points that
  touch the most holdings) with no call of its own, and the deck draws them
  as HCMP's newsletters slide. The demo reads `data/samples/newsletters.json`,
  fictional. A newsletter's own pictures (Hamza, 18 Oct 2026: the
  StockMKTNewz recap is its screenshots of the day) are read from its HTML
  as it arrives (`newsletterImages`: https alone, each once, at most
  `MAX_IMAGES`, trackers, icons and logos left out) and kept on the digest
  by address and alt text alone (`images`), drawn from the newsletter's
  host with no referrer (`components/newsletters/newsletter-images.tsx`).
  The person's model places them (Hamza, 19 Oct 2026): it is shown each
  picture's number, alt text and the words before it, puts each under the
  one point it shows (`images` on a point) and leaves out advertisements,
  logos, promotions and what no point is about; the reading is marked
  `placed` and the screens draw only the placed ones, under their points. A
  shared recap read before placing is read again once on a model
  (`issuesToLay`). The SEC EDGAR contact is typed on Setup's Company filings
  card alone. Trades draws Realised by holding as a heat map across the
  page under both columns (`components/trades/realised-map.tsx`: sized by what the sales made or
  lost, coloured by `pct` from `realisedBySymbol`, the return on the cost
  of the lots that carry one).
  Each digest is dated by the newsletter's own date (`date`, from
  `newsletterDate`: the forwarded header's Date line for a hand forward,
  else the email's Date header, else its arrival), and every picture
  carries the newsletter's words before it (`section`); `MAX_IMAGES` is 40,
  a daily recap's worth. What happened on At the Close
  (`components/markets/what-happened.tsx`; Hamza, 18 Oct 2026) is two
  sections: "What happened today" opens with the day's recap newsletter
  (`isRecapDigest`: StockMKTNewz, or any newsletter calling itself a recap),
  open from the start, its screenshots of the day's stories first and the
  opening performance pictures folded away (`recapParts`, split where the
  newsletter's own words say the stories begin, and cut where its own
  videos to watch begin, since that part closes the issue; Hamza, 19 Oct
  2026; `NewsletterPictures`), the
  week's earlier recaps under a row, then the Claude recap and the sources;
  "Newsletters" (`ThemedNewsletters` in
  `components/markets/newsletter-cards.tsx`, client) holds the week's other
  digests (`digestsOfWeek`, seven days by their own date) by theme
  (`byTheme`), the day's on a switch, each theme ranked by how close it is
  to the theses (`rankDigests`: the holdings its points name, their share of
  the book, the theses among them) then the newest, each a closed row, the
  first newsletter open inside it. A newsletter not opened yet is marked
  unread: the opened ids are `newslettersRead` in the preferences
  (`markNewsletterReadAction`, `withRead`, `unreadOf`), the demo's in the
  page alone. A review counts newsletters by their own date (`digestsIn`),
  and says on Sources and method when some are on file but none is dated in
  its period. The
  StockMKTNewz Daily Recap is each person's own subscription (Hamza, 20 Oct
  2026, after a legal read: no pooled copy for everyone), and it comes
  through the same forwarding as the other newsletters (Hamza, 20 Oct 2026):
  they subscribe with their Gmail, and while the recap newsletter is on the
  one Gmail filter on Setup's Newsletters card carries its sender first
  (`filterSenders` in `lib/newsletters.ts`, the recap shown in the filter's
  list as always in it; the backfill prompt forwards its last week too), so
  it is forwarded to their newsletters address with the rest and
  `isRecapDigest` opens it under What happened today, apart from the
  Newsletters. Subscribing with the newsletters address itself also works:
  an issue from a known recap sender (`RECAP_NEWSLETTERS`) proven by the
  receiving server (`subscribedRecapSender` in `lib/inbox.ts`) is read as
  theirs, `via: "subscribed"`. A known recap names its writer and sign-up
  page however it came. The shared copy below is the
  operator's alone: `sharedRecapOn(email)` holds it to the addresses in
  `SHARED_RECAP_TO` (`sharedRecapFor` in `lib/newsletters.ts`). There the
  operator subscribes the app's own inbox (`INBOX_ADDRESS`) to it once;
  `lib/shared-recap-run.ts` reads the issues its known sender
  (`RECAP_NEWSLETTERS[].sender`) sent to the inbox itself, proven by the
  receiving server (`sharedRecapSender` in `lib/inbox.ts`: DMARC, DKIM or
  SPF for the From domain, never to a tagged address), as text and pictures
  (`readSharedIssues` in `lib/inbox-run.ts`, no model) and keeps the week's
  issues in the shared data cache under the session they were read for
  (`unstable_cache`, kept only once the session's own issue is in it);
  `laySharedRecapsInto` lays each issue a vault lacks as a digest `via:
  "shared"` read on the person's own key (with no model, the pictures and a
  sentence, read again once a model is added), the person's own forward of
  the same issue winning (`sameIssue`, `issuesToLay`, `withoutSharedTwins`),
  from the evening run, the morning refresh and `catchUpOnOpen`. The recap
  shown is the newest written on a trading weekday in New York
  (`recapToShow`, `isWeekendIssue`): a weekend shows Friday's, the weekend
  issues under it. A shared digest is drawn with its writer and sign-up page;
  the demo has none. `npm run check:statements`, `npm run check:screens` and
  `npm run check:report`.
- **A podcast becomes a write-up on the person's key, with a perspective on
  their book** (Hamza, 20 Oct 2026). The vault's `podcasts` file
  (`lib/podcasts.ts`, pure) keeps the shows a person follows on
  podscripts.co, All-In (`DEFAULT_SHOWS`) to begin with, at most
  `MAX_SHOWS`, and each episode's write-up, never its transcript. Setup's
  Podcasts card (`PodcastsCard`; `addPodcastAction` checks a show by reading
  its page once, `showSlugOf` takes its address or slug) adds and removes
  shows. `lib/podcast-feed.ts` alone reads podscripts.co (a show's page,
  `parseShowPage`, and an episode's, `parseEpisodePage`: the text between
  the Transcript heading and the discussion, the "Starting point is" markers
  dropped; the show's and the episode's names alone in the URL, cached an
  hour; a page that cannot be read is a sentence); the guard holds that.
  `readPodcastsInto` (`lib/podcasts-run.ts`) writes up the episodes of the
  past `PODCAST_DAYS` not yet read (`episodesToRead`, the shows in turn, at
  most `EPISODES_PER_RUN` in the morning refresh and one on opening the
  app, `catchUpOnOpen`) on the person's own provider (any provider;
  `podcastRequestBody`, one `record_episode` call, the transcript cut at
  `PODCAST_MAX_CHARS` and said so) into a summary, up to eight points with
  the holdings each touches, and a perspective: what it means for their
  holdings, watchlist, theses and methodology, naming the sections it
  touches (`contextFor`: weights in percent, classes, the watchlist's
  symbols, the theses' words, the classes' tests and the rules; never an
  amount). `parsePodcastResponse` drops a symbol outside the book and the
  watchlist and a section the methodology lacks; the verdict on a holding
  stays the methodology's. A failed read keeps a sentence and is tried
  again; a run with nothing to write up says on Setup what podscripts.co
  lists, its newest episode and date, or that it lists none with a date
  (`listingNotes`, `STALE_SHOW_DAYS`; Hamza, 4 Nov 2026). At the Close
  shows the fortnight's episodes after What happened
  (slot `podcasts`, `PodcastEpisodes` in
  `components/markets/podcast-episodes.tsx`), the newest open. The demo
  reads `data/samples/podcasts.json`, fictional. `npm run check:statements`.
- **The Thesis Hunter looks for what bears on each thesis, weekly** (Hamza,
  20 Oct 2026). `lib/thesis-hunter.ts` (pure) and `lib/thesis-hunter-run.ts`
  (server-only; the vault's `thesis_hunter` file, one hunt per thesis key,
  `huntKey`) hunt each stock and market thesis with words once a week
  (`subjectsDue`, `HUNT_EVERY_DAYS`, the longest unhunted first; Hamza,
  20 Oct 2026, for the cost on the person's key): `HUNTS_PER_RUN` at 04:00 UTC
  (`/api/cron/hunter`, enrolments in batches) and one on opening the app
  (`catchUpOnOpen`), on the person's own provider. One call
  (`hunterRequestBody`, `record_finds`) gets the thesis, its pillars, watch
  items and kill signals, what was already found, and the person's own
  newsletter points and podcast write-ups of the past `HUNTER_DAYS` that
  speak to it (`materialFor`, each with a ref, a newsletter point's pictures
  by ref), and on a Claude key the web (at most `HUNTER_SEARCHES` searches);
  another provider hunts the newsletters and podcasts alone and says so.
  `parseHunterResponse` keeps up to `FINDS_PER_HUNT` finds, each backing,
  challenging or updating the thesis with its pillar: a web find needs a
  public https page, a newsletter or podcast find a listed ref (its source,
  date and page are the app's), a repeat is dropped, and a chart (figures
  the source prints) or picture that does not fit costs the figure, never
  the find. The thesis page draws them as Added by Thesis Hunter (slot
  `thesis_hunter`, `HunterFinds` in `components/theses/hunter-finds.tsx`,
  Hunt now and Dismiss). A find is no alert (Hamza, 5 Nov 2026: "that
  should only show in the weekly report"): not on Notifications, in the push
  or in an email, and a `hunter:` alert kept before is dropped at every read
  and check (`retiredAlert` in `lib/alerts.ts`); the weekly and monthly
  review carry the period's finds summarised (Hamza, 5 Nov 2026: "not 3
  pages"; `withHunterFinds` in `lib/report.ts`, slot `review_hunter` after
  Holdings and theses, a table in the report's methodology chapter): a line
  a thesis with its counts backing, challenging and updating, the one to
  read first (a challenge first) with its source and the next one's title,
  at most `MAX_HUNTER_LINES` theses and the rest counted.
  Nothing is written on the thesis itself. The demo reads
  `data/samples/thesis_hunter.json`, fictional, and hunts nothing.
  `npm run check:theses`.
- **A thesis exports as a PDF to keep or share** (Hamza, 20 Oct 2026). Export
  as PDF on a stock or market thesis (`/theses/[symbol]/pdf`,
  `/theses/market/[id]/pdf`) draws everything on the page in one document
  marked PortfolioOS on every page (`lib/thesis-pdf.ts` pure, the charts'
  geometry; `components/theses/thesis-pdf.tsx`, react-pdf;
  `lib/thesis-pdf-run.ts`): the thesis, pillars read today, watch items,
  kill signals and triggers, the valuation per share, the latest results,
  the charts and pictures, Added to the thesis and Added by Thesis Hunter,
  and where to try the app. It is made to be sent, so it holds no amount
  of money (`factsHoldMoney`): a weight in percent, a price and a valuation
  per share. Its pictures are read once from their public addresses
  (`publicPicture` in `lib/custom-data-run.ts`, PNG or JPEG, the same
  checks as Add data); one that cannot be read is named with its page.
  `npm run check:pdf`.
- **One notification after each close** (Hamza, 20 Oct 2026). Notifications
  carries On this device (`PushCard`, `components/notifications/push-card.tsx`):
  Turn on registers `public/sw.js`, asks the browser and keeps the push
  address and keys in the vault's `push` file (`lib/push.ts`, pure, at most
  `MAX_DEVICES`); Send a test and Turn off. An iPhone sends them only to the
  app added to its Home Screen (`app/manifest.ts`), and the card says so.
  The evening run (`runEveningRead`) checks the alerts and sends one
  notification per session, on the close's own day in New York, to each
  device (`sendCloseRecapInto` in `lib/push-send.ts`, Web Push signed with
  `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`): the count and the three most
  pressing titles of what fired in the last `RECAP_DAYS` and was not told
  before (`recapItems`, `closeRecap`), every amount masked (`maskMoney`);
  nothing new, nothing sent. A device the push service says is gone is
  removed. The demo sends nothing. `npm run check:screens`.
- **The property watch runs in the app.** "Check now" on the Real estate
  screen (`lib/property-watch-run.ts`) makes one call per property on the
  person's Claude key, in which the model searches the web (the Anthropic
  server tool, at most six searches) and records nearby rents, the
  short-stay market and news that could move the price, every figure with
  the page it came from (`watchRequestBody` and `parseWatchResponse` in the
  pure `lib/property-watch.ts`). A property that could not be checked keeps
  a sentence; a suggested revaluation is never applied by itself.
- **The analyst plans; the app computes.** The Analyst screen is a LangChain
  tool-calling agent (`lib/analyst-graph.ts`) on the person's provider
  (`lib/analyst-agent.ts`, the only file that may name the Anthropic or
  OpenAI chat clients). Its tools run only the app's own pure functions on the person's own
  data: a question becomes recipes over the ontology that `computeFigure`
  computes, verdicts come from `evaluate()` and cite their sections, context
  comes from a BM25 search of the vault (methodology, studies, reports,
  records, approved lessons), never from the model's memory. A number the
  tools did not return does not appear. A lesson the analyst proposes is kept
  in the vault and used only once the person approves it; a figure it computed
  can be kept as one of their own. `npm run check:analyst` runs the loop over
  a fake tool-calling model. The demo shows one conversation built by the
  tools themselves and runs no model.
- **The library is a shelf, never a shortcut.** A ready-made methodology
  (`lib/library.ts`, `data/library/`) is a methodology file plus a plain
  summary and, when its author works from one, their stock template. It
  carries rules, classes and figures and nothing of anyone's portfolio, book,
  Decision Log or figures; a class in it is criteria on fields, never a list
  of symbols. Adopting it makes a draft the person confirms, like any other.
  `npm run check:library` holds this.
- **The to-do list is what the rules call for, read against what is on
  file.** `lib/todo.ts` derives it from the methodology's rules, the book,
  the records, the Decision Log and the filings: a breach, a sale without an
  entry, a holding no class places, a clock, a per-holding duty a manual rule
  names (a vote, a record, a valuation), the data a rule waits for. It never
  invents a task a rule did not ask for; a rule the app cannot read stays
  "yours to check". Each item names the action that answers it (`act`:
  trim, decide, vote, check, settle, log), and the form files a Decision Log
  entry whose `action` names the item's key and the terms (outcome, target
  weight, date, class voted). `withDecisions` lays them on the list: a dated
  trim, sale or probation is due on its date and back to now after it; a
  hold is decided for a quarter; a rule checked for a week; a clock whose
  date moved asks again. A vote's class is recorded and never applied: where
  it differs from the tests, a to-do item says so. A holding's record keeps
  its own triggers and kill signals (a price or a field at or past a
  level); `triggerNotices` makes a met one an alert and a decision.
  `npm run check:todo` holds it.
- **A person's own Claude reads through the app's tools.** The MCP server
  (`/api/mcp`, Streamable HTTP, stateless; `lib/mcp.ts`, pure) offers the
  analyst's tools and the screens' readings as read-only MCP tools
  (`lib/mcp-tools.ts`, pure): the overview, holdings as ontology fields, the
  methodology, its checks with their sections, figures computed from
  recipes, the alerts, the to-do, the Decision Log, the last review, a BM25
  search of the vault and a company's filings. The app computes; the model
  only reads, and nothing is kept, filed, sent or changed (the guard holds
  it, and every tool is listed `readOnlyHint`), with one exception (Hamza,
  18 Oct 2026) and a second (Hamza, 18 Oct 2026): `propose_newsletter_senders` lays the recurring investing
  newsletters the person's Claude found in their mail (through its own Gmail
  connector, over the last `FINDER_DAYS`) on the vault's `newsletter_senders`
  file as proposals; Setup's Newsletters card shows them to keep or remove,
  takes senders added by hand, and only the kept ones make the Gmail filter
  (`gmailFilter`, `gmailFilterUrl` in `lib/newsletters.ts`: Gmail's own
  Create filter box opens with the From line filled, the person ticks
  Forward it to and clicks Create filter). A removed sender is not proposed
  again; the demo proposes nothing. `write_thesis` (`get_theses` reads them
  first) writes or adds to one of the person's theses (`thesisWriteSchema`,
  applied by the pure `writeThesis`: each field given replaces, an evidence
  entry is added `via: "claude"`, a pillar's test must name a figure the
  subject reads, a market thesis past the limit is refused), through
  `writeThesisInto(vault, w, now, holdings)` in `lib/theses-run.ts` alone; it
  lands on the Theses screen marked as added by Claude, for the person to
  keep or change. For a stock it also writes the record (Hamza, 19 Oct 2026):
  `triggers` (kill signals and triggers, each on a figure the subject reads,
  `recordFromWrite`), `levels` (price alerts) and `valuation` (the
  calculator's inputs laid on the kept ones, else on the filings' seed,
  `valuationFromWrite`, `withValuationInputs`; or `cases`, a bear, base and
  bull per share), whose chosen cases become the record's own valuation
  (`ownValuationOf`); and `figures` (Hamza, 20 Oct 2026): charts and pictures on a
  stock or market thesis (`thesisFigureSchema`, `withFigures` in
  `lib/theses.ts`, at most `MAX_FIGURES`): a chart is labels and up to
  `MAX_FIGURE_SERIES` series of numbers the app draws itself (a line on
  dates, else bars; `FigureGrid` in `components/theses/figure-grid.tsx`,
  with a table view), a picture a public https address (`publicImageUrl`)
  drawn with no referrer, each with its source; one with the same title is
  replaced, `removeFigures` takes them off, and the person removes one on
  the page (`removeFigureAction`); slot `thesis_figures`; a symbol not held and not recorded gets a record, so it
  joins the watchlist with its thesis and what to watch. It touches no DCF,
  class, alert or order. `get_theses` reads the theses from the grant's vault
  (never the session's; the guard forbids `openVault` and `thesesFor` outside
  the demo branch of `lib/mcp-run.ts`) and its stock text carries the record
  with today's readings (`recordLines`). The Theses screen
  carries the prompt the person pastes into their Claude (`fillThesesPrompt`
  for the holdings owed a thesis and the market theses, `ClaudePromptCard`,
  above Market theses and folded shut until its arrow opens it; the theses
  themselves are a grid of cards, `GridSection` and `ThesisCard` in
  `components/theses/thesis-grid.tsx`; Hamza, 19 Oct 2026);
  Add to thesis runs in the app instead (below), and the person's own notes
  join the evidence through `addNoteAction` (`via: "you"`). Since the beta
  (Hamza, 9 Nov 2026: the write-back tools) `write_thesis` proposes:
  `proposeThesisWriteInto` checks the write against the thesis as kept and
  keeps it pending in the vault's `thesis_writes` (`lib/thesis-writes.ts`,
  pure: one per thesis, the newer replacing the older), drawn as Proposed by
  your Claude on Theses and the thesis's page (`ClaudeWrites`), where the
  person ticks the parts to keep, amends the thesis and the pathway
  (`chosenWrite`) and keeps it through `writeThesisInto`, or dismisses it; an
  evidence entry alone is applied at once, so a call read still reaches the
  report. The other writes: `record_decision` (`decisionFromWrite`, `via:
  "claude"`, never a day after today), `rate_finding` on what `get_findings`
  lists (`withRating`, and the improvement signal as the screen's rating),
  `get_studies_to_write` and `write_study` (the app's own writer's brief,
  `studyBrief`; a section kept only when every figure is printed in it or
  worked out on its line from printed ones, `checkSections` in the pure
  `lib/study-writes.ts`) and `report_price_checks` (which of the person's own
  levels and price triggers are met as their Claude read their broker's
  prices, never a price; `brokerNotices` and `withBrokerChecks` in
  `lib/alerts.ts`, keyed `broker:`, kept open by every reconcile until a
  later check says they no longer hold). The guard holds these writes to
  `lib/mcp-run.ts`, each once, and `npm run check:mcp` that only these
  tools are not listed read-only. A person adds the address as
  a custom connector in Claude (the guide is on Setup) and signs in with the
  same Google or Microsoft account: the app is its own OAuth 2.1
  authorization server (`lib/mcp-auth.ts`, pure; the consent page
  `/mcp/authorize`), with registration and Claude's published client
  document, PKCE S256, codes only to Claude's callback or a loopback
  address, and no database: the client id, the code and the tokens are
  sealed under a key derived from `AUTH_SECRET` and carry the sign-in's own
  refresh token, so each call opens the vault as the scheduled report does
  (`lib/mcp-run.ts`, `vaultForMcp`). Who may connect is read on every call
  and at every token (`mayConnect`: the allowlist, or an account made here,
  Hamza, 9 Nov 2026; `withAccess` asks it once for the address the sealed
  token carries), so a deleted account loses its connector at once. The public demo's server takes no sign-in and serves
  the showcase. `initialize` names the app's own icon (`app/icon.svg`,
  and `public/icon-256.png` rendered from it) and the app as its website
  (`serverInfoFor` in `lib/mcp.ts`); Claude itself draws a connector's
  icon from its domain's favicon through Google's favicon service, so the
  app also serves a classic `app/favicon.ico` (rendered from the SVG by
  `scripts/make-favicon.mjs`, run again after changing the icon) and the
  icon files alone are not marked noindex (`next.config.ts`; Hamza, 17 and
  18 Oct 2026). `npm run check:mcp`.
- **A greeting when the person comes back, never while they use the app**
  (Hamza, 4 Nov 2026: "it should greet the user back").
  `components/app/greeting.tsx` covers the screen only when the app opens or
  comes back into view, never on a timer, and never within `AWAY_MS` (a
  quarter hour) of the last tap, key or scroll on the device
  (`pos:last-active`, written as they happen and when the page is left);
  past that, on the first open on a device, on a launch after the app was
  quit (a load that is not a reload and finds no note of this window in
  sessionStorage, `isLaunch`; Hamza, 15 Oct 2026), or once `GREETING_GAP_MS`
  (an hour) has passed since the last greeting (`shouldGreet` in the pure
  `lib/greeting.ts`). Good morning, afternoon or evening by the device's own
  clock, happy earnings season from the 10th of the month after a quarter
  ends to the 20th of the next, and the person's next quote (`nextQuote`:
  one never shown first, in a fixed walk through the list Hamza approved on
  15 Oct 2026, else the one shown longest ago, so none comes round before
  every other has shown). The record is theirs, not the device's: the
  preferences' `quotesShown` (`withShown`, written by
  `noteQuoteShownAction` in `app/(app)/greeting-actions.ts` behind the
  greeting, never over a vault that could not be read), laid with the
  device's own `pos:quotes-shown` (`mergedShown`), so every device takes
  the next one. A quote shows its words and who said it, never a source; a
  line no one can be shown to have said shows its words alone; a satirical
  line carries the moment it came from. The demo greets no one by name and
  keeps its record on the device. A new quote is added only with Hamza's
  approval.
- **Customisation never touches a methodology.** Screens are put in order by
  dragging a grip on Customise (arrow keys too; `reorderNav` saves a
  permutation of what is shown, else refuses); by default Triggers and kill
  signals sit last, before Settings (Hamza, 15 Oct 2026). A screen
  the saved order does not name (added to the app, or switched on, after the
  save) sits right after the screen the skeleton puts before it (`orderNav`
  in `lib/preferences.ts`; Hamza, 18 Oct 2026), never at the bottom. Theme,
  screen order, headline
  tiles, a person's own figures and their records live in `preferences` and
  `records` in their vault (`lib/preferences.ts`); a custom figure is a recipe
  like any other, shown in its own section.
- **Add data is the person's own shelf, read-only.** On Customise a person
  names a figure or series, its format (number, line, bar, pie, table), how
  often it is read (daily, weekly, monthly) and its screen (Dashboard, Holdings,
  Performance, Markets; a `your_data_*` slot on each), from a public API or
  their own Claude (`lib/custom-data.ts`, pure). `lib/custom-data-run.ts`
  alone reads it: one GET to a public https address, checked as written and
  again at the connection (a lookup that refuses private addresses), no
  redirect followed, ten seconds and a megabyte at most, the key in the
  header or parameter they named and nowhere else; or a call on their Claude
  key with a few web searches, every figure with its page. Definitions and
  readings live in the vault's `custom_data` file, keys in `data_keys`,
  never shown again. A failed reading keeps the last good one with a
  sentence; the morning refresh reads each on its schedule. A rule never
  reads it. The demo shows fictional samples and reads nothing.
  `npm run check:data`.
- **A document that cannot be read never looks empty.** A Drive file that
  fails its schema throws a sentence (`SyncError`); a screen with no figures
  says what it is waiting for.
- **The figures refresh every morning.** The cron (`/api/cron/reports`, 06:00
  UTC) first runs the morning refresh (`lib/daily-sync.ts`) for every
  enrolment: the IBKR Flex statement through the Flex Web Service
  (`lib/ibkr-flex.ts`, the only file that names it) with the person's own
  token and query id from their vault (`connections`), then the brokers on
  their own SnapTrade and eToro keys, then the statements
  inbox for anyone who sends statements by email, then every listed
  holding's filings (`lib/filings-run.ts`), then, every morning
  (`REFRESH_HOURS`; Hamza, 24 Oct 2026: no button), SPY's and
  QQQ's look-through (`lib/benchmarks-run.ts`: each fund's latest N-PORT
  report from EDGAR, `lib/nport.ts`, and the largest companies' filings,
  averaged by `lib/look-through.ts` over the fields the methodology's
  classes and figures read; a company's figures come from the person's
  filings, else the registry's shared `company_figures`, else one SEC read). A source that fails keeps its
  last good copy and writes a sentence to the vault's `sync` file, which
  Setup shows; the token is never shown, logged or echoed. The reviews are
  built after it. The evening run asks IBKR again for anyone whose book is
  older than the session that closed (`fetchFlexEvening`, `flexEveningDue`
  in the pure `lib/connections.ts`) and keeps the statement only when it is
  newer, so a trade made today shows tonight when IBKR has made the
  statement, else at the morning refresh (Hamza, 17 Oct 2026). Every fetch
  and upload goes through `keepHistory` (`lib/holdings.ts`, pure): a Flex
  query covers a year at most, so the kept book's account values and ledger
  rows before the new statement's first day carry over, same source and
  accounts only, and an older statement uploaded later only lends its
  history (Hamza, 19 Oct 2026). The statement just read wins over the dates
  it covers, so a year uploaded again replaces what was kept for it, and the
  value series starts on the first day with money in it (`fromFirstValue`).
  Transfers (the Flex query's Transfers section, `transfersOf` in
  `lib/adapters/ibkr-flex.ts`) are deposits and withdrawals at their value in
  base; a statement whose Change in NAV counts flows its rows do not list
  keeps the gap on `series.unlisted` (`unlistedFlowOf`), and the upload and
  Performance say so (`unlistedSentence` in `lib/holdings.ts`). A series
  figure over `nav` reads the time-weighted index (`navIndex`), never the raw
  value. SPY and QQQ keep five years of closes (`years: 5`). Someone with no review schedule enrols with the cadence
  `none`. `npm run check:import` holds the shapes.
- **Scheduled runs are jobs, one per person** (Hamza, 2 Nov 2026, after the
  plan in `docs/ARCHITECTURE.md` and ADR 0002). Each cron reads what is the
  same for everyone first (the session, the economies, the screener's
  shared companies), then `runAsJobs` in `lib/jobs-run.ts` (server-only)
  enqueues one row per enrolment in the `jobs` table (`dedupeKey`: the kind,
  `who` of the address, `runSlot`; a second cron in the same run enqueues
  nothing) and starts `WORKERS` workers, each a POST to `/api/jobs/run`
  with `CRON_SECRET`, its own function, which takes due jobs with `for
  update skip locked` until its start window is up (`drain`). A job runs the
  same steps the run loops take for one person (`morningSyncFor`,
  `reportsFor`, `alertsFor`, `eveningFor`, `huntThesesInto`, the screener's
  and funds' share), in the person's zone; a sentence a step returns is the
  person's, a throw is retried after `BACKOFF_MINUTES` up to
  `MAX_ATTEMPTS`, a job past `EXPIRE_HOURS` is expired, a lock past
  `LOCK_MINUTES` is claimed again. On Vercel Pro (Hamza, 4 Nov 2026; ADR
  0008) the crons and workers take 800 seconds and the dispatcher
  (`/api/cron/dispatch`, at six past every hour since 25 Nov 2026, a
  minute after the reviews' run so the database wakes once, Hamza: the
  minute's dispatcher kept the free database awake and ran its month's
  compute out on 22 Nov; `dispatch` and `queueState` in
  `lib/jobs-run.ts`) starts `workersToStart(due, busy, DISPATCH_CAP)`
  workers for the jobs due and not being run, so a job a run left behind
  waits an hour at most; a retry is taken by the worker that set it, which
  waits for it while it falls inside its start window (`retryWait`). The
  results watch and the other crons keep their own times, so what is timed
  to the market is as quick as before. The database's month is drawn on
  /ops (The database this month) and logged once a day by the 05:00 UTC run
  as `db.usage` (`lib/db-usage.ts` pure: `parseNeonProject`, `paceOf`
  against `FREE_CU_HOURS`, `usageWords`; `lib/neon-usage.ts` alone calls
  Neon's API, on `NEON_API_KEY` and `NEON_PROJECT_ID`, which the guard
  holds; without them /ops says what to set). A page no longer asks the
  registry which vault a Google sign-in chose on every request: the kind
  is kept a day in the data cache (`vaultChoiceKind`, `vaultKindTag`,
  cleared by `chooseDrive`, `chooseBucket` and `dropBucket`), and when the
  registry cannot be reached a sign-in with its own folder opens it
  read-only (`READ_ONLY_SENTENCE` on every write), never Welcome. The results watch (`/api/cron/results`,
  every quarter hour, queuing anyone only in `resultsHours`, weekdays
  10:00 to 14:45 and 20:00 to 23:45 UTC, or while `eventWindowOpen`, the
  three hours after a calendar event can be read; kind `results`) reads each person's earnings file alone and, when
  `resultsWatchDue` says a followed company's results are out with no
  release read (the file's `upcoming`, kept by every earnings read through
  `upcomingOf`), reads them and emails the report at once, the app closed
  (Hamza, 4 Nov 2026). The reviews are their own kind, `reviews`
  (`/api/cron/reviews`, five past every hour): only the people whose slot is
  due are queued (`isDue`), so a review goes out at the person's own hour,
  not at the next morning run; a slot claimed by a run that was killed
  (`staleClaim`, `STALE_CLAIM_MINUTES`) is taken back at the next hour
  (4 Nov 2026: the 1 Nov review was claimed, cut off by a timeout and never
  sent). A claim keeps the kinds it has sent (`claimOutcome`, `sentKinds`),
  so a claim taken back, or a run that sent part and failed
  (`partlyOutcome`), sends only the rest (`reclaimable`); Send me one now
  and Send the monthly now mark the slot the schedule would send the same
  review in (`handSlot`, `markHandSent`), so no review goes out twice. The pure rules are `lib/jobs.ts`. Job
  rows keep the address, the kind, the times and the failing sentence,
  never a figure; `KEEP_DAYS` then deleted, and withdrawing deletes them.
  Logs from jobs are JSON lines (`logEvent` in `lib/log.ts`) with `who`, a
  keyed fingerprint, never the address. `/ops` (the addresses in
  `OPERATOR_EMAILS`, else `SHARED_RECAP_TO`; `operatorEmails` in
  `lib/deployment.ts`) and `/api/health/deep` read the last day's jobs,
  never a person. Sign-up codes are limited per address and per network
  (`codeLimit` in `app/sign-up/actions.ts` on `rate_limits`), and a sealed
  value opens with `REPORT_KEY` or `REPORT_KEY_PREVIOUS`, so the key can
  rotate. CI (`.github/workflows/ci.yml`) runs lint, typecheck, every
  check and the build in demo mode on each pull request.
- **Opening the app catches up.** The scheduled runs need the enrolment
  registry; so nothing waits on a button or a cron, opening the app
  (`lib/catch-up.ts`, from the app layout, at most every half hour per
  person across every instance, `allow` in `lib/rate-limit.ts`) reads, after the page is sent and with the
  signed-in person's own vault, the reports after any followed company's
  results (`readEarningsInto`, only what is due; a report written is checked
  for alerts at once) and the filings when they are a day old or a new
  holding has none (`filingsStale` in `lib/filings.ts`), and every three minutes at most the newsletters that reached the inbox, forwarded or the shared recap's (`newslettersOnOpen`; Hamza, 23 Oct 2026), so an open app, which draws itself again every five minutes, shows a recap within minutes of its arrival. A reading a little over a limit is clipped to fit (`fitReading` in `lib/newsletters.ts`), never thrown away. A sign-in whose refresh token differs from the one the
  enrolment keeps renews it (`renewAccess` in `lib/registry.ts`, the schedule
  left as it is; Hamza, 22 Oct 2026), so a token Google ended stops the
  scheduled runs only until the person signs in again. "Read results now"
  and "Read filings" stay for an immediate read.
- **Alerts are kept, checked twice a day and emailed once.** Every notice
  the app derives (`noticesFor`: breaches, watches, clocks and dates within
  a week, studies, filings reads; `statementNotices`: a statement waiting or
  unread) and every watchlist level a price has
  reached (`levelNotices`; a level is the person's own, in their records)
  is an alert in the vault's `alerts` file (`lib/alerts.ts`, pure): it
  fires when its condition starts to hold, clears when it stops, and fires
  again only after clearing. `lib/alerts-run.ts` checks every enrolment at
  06:00 UTC (after the refresh and the reports) and 18:00 UTC
  (`/api/cron/alerts`), and "Check now" on Notifications runs the same
  check. What fired today or yesterday and was not emailed goes out in one
  email through `lib/report-mail.ts`; a routine filings read does not. Each
  alert is claimed in the registry before the send (`claimMail`,
  `mail_claims`: a keyed fingerprint of the address and the alert, kept
  `MAIL_CLAIM_DAYS`), so checks side by side never send one twice, and a
  report after a company's results goes as its own email
  (`earningsReportEmail` in the pure `lib/earnings-email.ts`,
  `sendEarningsReport`): figures, classes, rules, signals, reaction and
  commentary, its decks linked in Slides and attached as PowerPoint, made
  from the kept report (Hamza, 23 Oct 2026). A
  screen lays today's notices on the kept file without writing it; Mark all
  read and Dismiss write it. A dismissed alert stays dismissed while it
  holds. Mark all read keeps each alert's id in the preferences
  (`notificationsRead`, `readIds`) beside the instant, so a marked alert
  reads quiet while it holds and one that fires later the same day is
  unread; the Notifications list is a client component
  (`components/notifications/notices.tsx`) that hides a dismissed row and
  marks every row read the moment the button is pressed, the vault written
  behind it (Hamza, 19 Oct 2026); Now holds the unread alerts alone and a
  read one that still holds folds under a closed Read row, still there to
  open or dismiss (`unreadNow`, `readNow`; Hamza, 4 Nov 2026). Both are sent to `/api/notifications`
  (`lib/notifications-run.ts`) by `sendNotice`
  (`components/notifications/send.ts`), one at a time and kept alive past
  leaving the page, never as a server action or inside a transition, since
  React holds the next screen until a pending transition ends (Hamza,
  23 Oct 2026); the menu's badge follows the count the page announces
  (`announceUnread`, `useBadges` in `components/app/unread.ts`) until the
  layout is drawn again. A Drive file this instance just wrote is
  read back as written until Drive's listing, a search that catches up a
  few seconds after a write, names the new time (`written` in
  `lib/user-drive.ts`). `npm run check:screens` holds the reconciling and
  the email.
- **A first visit offers sign in, sign up or the demo; a first sign-in
  lands on Welcome, then the tour** (Hamza, 16 Oct 2026). `/sign-in` is the
  first page for anyone without a session: Google, Microsoft when
  configured, email and password (`components/sign-in/password-form.tsx`,
  the credentials provider in `lib/auth.ts`), Create an account while
  sign-up is open, and Try the demo free. `/sign-up` makes the account
  (`app/sign-up/actions.ts`: the address and a password, then the code, then
  signed in straight to Welcome). `/welcome` (`app/welcome/page.tsx`,
  `components/welcome/first-setup.tsx`, outside the app shell) is where a
  person with no setup lands from every screen (`screen()` in
  `lib/workspace.ts`): a rail of stages on the left, one card on the right;
  for an email sign-in the first stage links their Google Drive; then who
  it is for, where the money is reported (each input with how it connects,
  what it brings in, what the app reads by itself), a few details, and the
  app built from the answers with what to do next, once. It says to pick
  what applies today, since every input is added on Setup afterwards.
  Building the app opens Welcome's second part (`/welcome?step=rules`,
  `components/welcome/second-setup.tsx`, steps in the pure `lib/welcome.ts`):
  what to give the app, in Setup's own cards, one group per step with why
  it matters: the rules (methodology, model), the money (one card per place
  chosen), the holdings (the Theses and valuations card: a few lines and
  the person's bear, base and bull per share for each listed holding,
  `saveFirstThesisAction`, kept on the thesis and as the record's own
  valuation; Hamza, 16 Oct 2026), what it reads (filings, the morning
  refresh, the Newsletters card with the address, the Gmail steps and the
  daily recap), then everything at a glance. Any step can be skipped; the
  cards read the same `setupData` (`components/setup/setup-data.ts`) as
  Setup, so the first telling and the place it is changed never disagree.
  Finishing (`finishWelcomeAction`) notes `welcomed` in the preferences and
  opens `/setup?built=1&tour=1` in drive mode, the tour of the person's own
  app (`TOUR_APP` in `lib/tour.ts`, drawn by the same `Tour` component as
  the showcase's `TOUR`): Setup first, where each input goes, then the
  Dashboard, Notifications, Holdings and Customise, and back to Setup's
  Your account, where the Welcome answers are changed. Every step is on
  before any methodology; `npm run check:screens` holds it. The Setup
  wizard stays on Setup for changes; the demo keeps its own first setup on
  Welcome too, with no Drive stage and no tour. `/privacy` and `/terms`
  (`components/legal/legal-page.tsx`) are public and dated: where the money
  stays, what the deployment keeps, what goes out and to whom, how to remove
  it; not advice, read-only. The sign-in and sign-up pages link them and
  Google's consent screen requires them (Hamza, 17 Oct 2026); a change to
  what the app keeps or sends changes those pages in the same PR.
- **Setup is the one inputs page.** Every input lives on Setup
  (`app/(app)/setup/page.tsx`), the first screen a new person sees: the
  overview (`components/setup/overview.tsx`), then one card per input
  (`components/setup/input-cards.tsx`, on `SetupCard`) in five groups. Each
  card says what the app holds now and since when, or that it holds nothing;
  its actions; its replace and remove folded away; its guide last. Choosing,
  uploading or suggesting a methodology and the model are there, not on the
  Methodology screen, which reads the methodology (a summary, then tabs:
  checks, classes, rules, figures, layout, gaps; `components/methodology/views.tsx`)
  and holds a draft for confirming. A new input gets a card, never a second
  section elsewhere.
- **Every connection setup guides the person.** The IBKR Flex upload carries
  a step-by-step guide (`components/setup/flex-guide.tsx`) in IBKR's own
  names: where the screen is, what to type, which sections to tick, the
  delivery settings; SnapTrade, eToro, Claude, the statements inbox, a
  property and other assets carry theirs (`components/setup/guides.tsx`, on
  `Steps`). Any new integration gets the same; no one is sent off
  to configure something unguided.
- **Every action says it worked.** A form or button runs through
  `ActionForm`, `ActionButton` or, for a file, `FileAction` (one button that
  opens the picker and reads the file; the file's name shows only while it
  is read): on success each draws a check with a word (`DoneMark`,
  `components/app/done-mark.tsx`), and a result that lives on another screen
  opens it after the mark (`doneHref`). An error is a sentence beside it.
  A trip to the server that fails (the network not back after sleep, a
  deployment since the page opened, a function past its time) is a sentence
  too, never thrown into the page (Hamza, 23 Oct 2026): every action goes
  through `reach` (`components/app/reach.ts`; `reached` for
  `useActionState`, `stamped` uses it, `quietly` for a background look tried
  again later), the kinds and words in the pure `lib/reach.ts`. A screen
  that fails anyway draws `PageFailed` (`app/(app)/error.tsx`,
  `app/global-error.tsx`), never Next's page: it reloads by itself, once a
  minute at most, when a reload mends it, and otherwise says what failed.
  `npm run check:screens`.
- **Every screen says how fresh it is.** Under each title a badge
  (`components/ui/freshness.tsx`; kinds and rhythms in the pure
  `lib/freshness.ts`): Live, green and pulsing, while the US market is open
  on a screen that lays live prices; At the close; Daily for a book fetched
  every morning, amber with the reason when the last fetch failed and never
  Uploaded for that (`bookFreshness`; a failed morning Flex fetch is asked
  again on opening, `retryFlexOnOpen`; Hamza, 27 Oct 2026); Uploaded; Weekly; the demo's Snapshot. Past its rhythm it
  turns amber. `ScreenFreshness` reads the workspace's `fresh`. Each card
  carries its own badge (`FreshBadge compact`: a chart's `badge`, a tile's,
  a list's trailing), Live only where its own figures are live (Hamza,
  15 Oct 2026). Everything that can be live is live (Hamza, 16 Oct 2026):
  a live card's badge never changes kind at the bell; shut, it stays Live
  with "Markets have closed" and the date beside it (`asClosed` in
  `lib/freshness.ts`), never Daily or At the close. The headline tiles a
  price moves (`readsPrices` in `lib/screens.ts`) are recomputed in the
  browser on the person's own book repriced with the quotes already read
  (`repriceHoldings`, then the same `contextFor` and `computeFigure`; the
  live path never reads the vault, the guard holds it), and the positions
  table on Holdings by `livePositions` (`lib/live.ts`), both every 30
  seconds in market hours.
- **The person's own time, never a city written in** (Hamza, 28 Oct 2026).
  Every day and clock time is read in the zone the person's device reports
  (`lib/time.ts`: `localDay`, `localTime`, `localMoment`, `atUtcHour`,
  `currentZone`; never `new Date().toISOString().slice(0, 10)`).
  `ZoneCookie` (`components/app/zone-cookie.tsx`) keeps the browser's zone
  in the `pos_tz` cookie and refreshes when it changes; on the server
  `lib/zone.ts` reads it from the request Next serves, else Vercel's
  `x-vercel-ip-timezone`, else `FALLBACK_ZONE` (UTC); `instrumentation.ts`
  and the root layout load it. A scheduled run holds each person's zone
  for their turn (`enterZone`, `withZone`) from their enrolment's
  `schedule.zone`, which opening the app keeps on the browser's zone
  (`keepZone` in `lib/registry.ts`, `keepZoneOnOpen` in `lib/catch-up.ts`);
  Reviews asks for no zone (`defaultSchedule`). A time a cron runs at is
  shown on the person's clock (`atUtcHour`), "your time".
- **Nothing about one person or one deployment is written in the code**
  (Hamza, 29 Oct 2026, agreeing the hardcoded overview). A Claude model's
  name lives in `lib/models.ts` alone (`MODELS`: fast, standard, best; each
  call's constant names its tier). What a deployment says about itself comes
  from its settings (`lib/deployment.ts`): the contact address the privacy,
  terms, cookies and help pages and the push subject give (`CONTACT_EMAIL`,
  else `INBOX_ADDRESS`, else none), and the public demo the sign-in page and
  the thesis PDF link (`DEMO_URL`; a demo deployment links its own `/try`,
  any other none). No user-visible text names HCMP or Hamza; the library's
  methodology keeps its credit, and the decks' layout is named PortfolioOS.
- **Copy:** terse and plain. No encouragement, no exclamation marks. Not
  investment advice.

## Commands

`npm run dev` · `npm run build` · `npm run check:setup` · `npm run check:screens` ·
`npm run check:performance` · `npm run check:decisions` · `npm run check:library` · `npm run check:todo` · `npm run check:data` ·
`npm run check:options` · `npm run check:exposure` · `npm run check:synthetic` ·
`npm run check:report` · `npm run check:vault` · `npm run check:statements` · `npm run check:import` ·
`npm run check:research` · `npm run check:analyst` · `npm run check:markets` · `npm run check:earnings` · `npm run check:theses` · `npm run check:community` · `npm run check:agents` · `npm run check:model` · `npm run check:mcp` · `npm run check:pdf` · `npm run check:guard` · `npm run synth:loop -- [--dry-run] [--persona <id>]` ·
`npm run check:parity -- <target> <methodology> [book]` ·
`npm run check:review-parity -- <book> <methodology> <week.json> [decisions.json] [--out report.md]` · `npm run smoke` ·
`npm run typecheck` · `npm run lint`

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
