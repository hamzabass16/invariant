# Changelog

## 27 Nov 2026 (the allocation's count)

- The number of holdings in the middle of the Dashboard's allocation ring is drawn in the page's text colour, so it reads in dark and light alike. Before, it was drawn almost black and could not be read on the dark page.

## 26 Nov 2026 (open source)

- Invariant is open source under the MIT licence. The front page says so in place of the plans and prices, with a link to the code when the deployment sets one.
- The founding plan is gone from Account settings, /ops, the privacy policy and the terms; nothing is charged for. A plan now sets only a person's monthly AI allowance.
- The demo's showcase keeps its holdings, weights, returns and dates, with every amount of money scaled, so it no longer shows the size of a real account.
- The README explains what the app is, how it is built and how to run your own copy on your own Vercel, database and Anthropic key, with one-click deploys, and which data sources allow an app run for others.

## 25 Nov 2026 (the app opens when its database is down)

- When the app's database cannot be reached, a Google sign-in opens its own Drive folder and shows everything in it, with a sentence on any save that it waits until the database is back. Before, the app fell back to Welcome as if nothing had been set up.
- Jobs a run could not finish are picked up within the hour instead of within the minute, so the database can sleep between runs; a retry is still taken within minutes by the run that set it, and the results watch, the alerts and the reviews keep their times.
- /ops shows how much of the database's monthly compute has been used and where the month is heading, once its Neon key and project are set.

## 21 Nov 2026 (the Dashboard as one grid, financials, estimates and ecosystem)

- The Dashboard opens with the portfolio as one ruled grid, after a terminal's layout: net worth with the day, the unrealized gain and cash on its year's range; the allocation by holding, the five largest and the rest folded; every holding in one table with Overview, Performance, Valuation and Fundamentals tabs, live in market hours; the day's largest contributors and detractors; and the book against your fair values. The headline tiles follow under it.
- A company page draws its financials as a grid of small charts, each with its latest figure and its change on a year before, and the key figures as one grid of four groups.
- A company page shows the analysts' EPS by year from Nasdaq, with their lowest and highest estimate and how many there are, beside the filed years, each with its growth on the year before. The figures are labelled as the analysts', never the app's.
- A company page shows its ecosystem: the suppliers, customers, partners and competitors its latest annual report names, each opening to the report's own sentence, with a customer's share of revenue where the report prints it. A name is kept only when the sentence is printed word for word in the report. Read once per report for everyone: the S&P 500 and the Nasdaq-100 each morning, and a company you hold or watch when you open the app.

## 21 Nov 2026 (Flows)

- Flows is a screen of its own, under Markets after Macro, with six cards on where money is moving: where the money in the largest US ETFs went and the funds it moved most, how the big futures traders are positioned (the CFTC's Commitments of Traders, each market against its own three years), what foreigners bought and sold of US stocks and bonds (the Treasury's TIC report), the cash in money market funds and what it holds (the Office of Financial Research), and what insiders of S&P 500 and Nasdaq-100 companies bought and sold on the open market, by sector (the SEC's quarterly insider data). Each is read once for everyone, says the day it was last checked and the months it covers, and a source that cannot be read says so. Macro no longer carries the ETF chart.

## 20 Nov 2026 (where the money in ETFs went)

- Macro shows where the money in the largest US ETFs went over three months: the buckets that lost money and the new money on the left, the buckets that gained it on the right, from each fund's own monthly flows in its N-PORT reports to the SEC. The reports go public about two months after each fund's quarter, so the chart names the months it covers and the funds that have not filed for them. A table view lists every bucket with its funds.

## 20 Nov 2026 (a methodology that nearly reads)

- When a methodology is read but a few of its parts point at something it does not record (a rule testing a figure it never defines, say), the AI is told what is wrong and records it once more, where before the whole reading was refused with "its rules could not be turned into checks".

## 20 Nov 2026 (the methodology card says 20 MB)

- Setup's methodology card says a document may be up to 20 MB, where it still said 4 MB.

## 19 Nov 2026 (larger methodology documents)

- A methodology document up to 20 MB can be uploaded on Setup. One over 4 MB goes from your browser straight to the Portfolio OS folder in your Google Drive and is read from there. Any other upload over 4 MB (a statement, a document for a thesis) is stopped before it is sent, with its size and what to do, where it used to come back as "The server did not finish this one".

## 16 Nov 2026 (gross margin for a company with no cost of sales line)

- A company reporting under IFRS that files no cost of sales and no gross profit line now has a gross margin: revenue less the cost of inventories it says it expensed in the year. The note beside it says so, since that cost leaves out anything that never passed through inventories.

## 11 Nov 2026 (Back)

- Every page opened from another (a company, a holding, a thesis, a trade, an agent, a club, a review, the methodology's graph and the rest) has a Back button above its title: it goes back to the page you came from, or, opened straight from a link, to the screen it sits under.

## 11 Nov 2026 (notifications without boxes)

- Notifications, the to-do, On watch and the other lists of things lose the lines round every item and the box that sat tight against each notice's text. Items sit on the page with room between them, a notice's mark in a soft disc of its colour, and Dismiss a small button at its foot on the right.

## 11 Nov 2026 (the icon and the front page)

- The app's icon, favicon and Home Screen icon are the knot in platinum on obsidian, with a teal rule under it.
- The front page matches the app: obsidian and platinum, one flat surface with hairlines, platinum buttons and the data teal for its figures.

## 11 Nov 2026 (colour back where it reads)

- The correlation matrix, concentration, the portfolio's P/E, your valued book and the look-through draw in colour again.
- Every clickable button, pill, tile and grid cell has a coloured border, brighter on hover.
- The calendar colours each kind of date in its own hue, and the selected event, day and switch are readable: they no longer print white on the light fill.
- How the agents are built is drawn as a diagram: a node per tier in its colour, the agents as chips, the work handed down a spine.
- Credit stress is taller and leaves room on every side, so every company's dot shows.

## 11 Nov 2026 (obsidian and platinum)

- A new look: near-black with platinum type, platinum the only colour for actions and selection, and a porcelain light theme beside it. The status colours are now the only colour on a screen.
- One surface: no cards, fills or shadows. Each section sits on the page with one hairline above it, a list of things is one ruled grid, and the top bar and tab bar sit on the page's own ground.
- The Dashboard's Resonance card draws every rule of your methodology as a band of fine lines: unbroken while a rule holds, broken in red for a breach and amber outside a guideline, faint for a rule you check by hand.
- Titles and labels are set in Newsreader; text links are underlined; the selected part of a switch is filled; an up move prints in blue, never green.

## 11 Nov 2026 (retries that end)

- A newsletter that cannot be read is tried again an hour later, at most three times, and then says it is not tried again, instead of on every run and every few minutes while the app is open.
- A statement sent by email that fails in a way a later morning could mend is read again at most three times; the last failure says to upload it to try once more.
- A study written after a company's results is taken up again by itself only within three days of being asked.
- A scheduled run whose function stops before it finishes three times is marked failed with a sentence, instead of being run again until the day's run expires.
- An alert email that could not go out on an unexpected error is sent by the next check.

## 9 Nov 2026 (lawful sources for the beta)

- A deployment set to licensed sources only shows the sources whose terms let an app run for others show them: the SEC, FRED's US government series, the US Treasury, the BLS, the Federal Reserve, the BEA, the New York Fed, Freddie Mac, the OECD, the BIS, the IMF, the ECB and Wikipedia. Every other source is not asked, and each card that loses it says which source and why. The main app is unchanged.
- On it, Treasury yields come from the Treasury's daily par yield curve, currency rates from the ECB's reference rates, and Macro names each source with the credit its terms ask for.
- On it, results are found by asking the SEC for each followed company's filings every quarter hour in the results windows, and the report is emailed as soon as it is read. No date ahead is shown, so there is no alert the day before.
- No transcript service is asked for a company's call any more; the call is read from the release's filed documents and, on a Claude key, the transcript's page found on the web.

## 9 Nov 2026 (ask your Claude)

- The analyst, Add to thesis, a study you ask for, Performance's reading through your methodology, the property watch, how to judge your methodology and a figure fetched from the web now run on your own Claude: each screen has an Ask your Claude card with the prompt to paste and whether the connector is added. The operator's own addresses keep the buttons.
- Setup's AI card says which AI runs on Invariant's account and which on your own Claude.
- The daily planner, the Research Agent's judge, the recap after the close, a review's commentary, answers and news, and a report's commentary and why the shares moved now run on Haiku first, and on Sonnet only when the app's check refuses the first answer. For members of the beta the Research Agent no longer asks Opus for advice; the operator's own addresses keep its Sonnet judge with the Opus advisor.

## 9 Nov 2026 (the top funds on the marketplace)

- The methodology marketplace is now the Marketplace, with two new parts. From the top funds: each fund's approach as it states it, to adopt as a draft on your own figures and dashboard, each figure it looks for a guideline to check and only the levels it states a class, credited to the fund. Theses the top funds state: each with its page, to add to your theses, starting your thesis with the fund's words or adding them as an entry on the one you have; a company you neither hold nor watch joins your watchlist.

## 9 Nov 2026 (twenty further ways)

- Trade check: Plan it, trade tomorrow, keeps the trade as a plan in the Decision Log in your words; Trades sets the trades planned a day to a month ahead against the rest, each judged against SPY a month on, and lists the plans still open.
- Trades: Sales a year on, each sale looked back on a year later with the reason written then and what the stock did since against SPY.
- Methodology: every version you confirm is kept in the Decision Log with what changed word for word, its fingerprint sealed like a thesis receipt; the Versions view lists them.
- Methodology: Run beside mine, a framework from the library or a listing from the marketplace read on the same book as your own, every rule where the two disagree named.
- Library: four public frameworks, after Benjamin Graham, Joel Greenblatt and Peter Lynch, and dividend growth, each with what the app cannot yet say listed as gaps.
- Marketplace: packs from verified analysts, a few tested rules from their own methodology laid on yours as a draft.
- Monthly review and Decision Log: How you decided this month, a letter on the month's entries, reasons, plans, valuations a year on, rules kept and sales looked back on.
- Community: How I decide on your card when ticked (reasons, plans, calibration and club record in percent), a record badge for a CV, mentors who are verified analysts (free now, the later price shown) and public sealed calls, a thesis published with its fingerprint and how it has done against SPY.
- Clubs: a course pack for universities with the instructor's grades, the inter-university season with a final round on the league, a calibration board for pitches valued bear to bull, the club's pick fund against SPY, alumni mentors who review with a note, and a treasury that sets the club's real trades against its votes, in percent alone.
- Family: rules the household keeps together, each member's own app reading them on their own book.
- Open data for researchers: the pooled weeks as a CSV under CC BY 4.0 with its columns explained; the annual report carries the year's awards.

## 9 Nov 2026 (Top funds: what each fund says it does)

- Top funds now reads how each fund says it invests and the theses it states, once a quarter from its own letters, site and filings, with every page linked, and ranks the funds by how much of your approach they say they share: the figures your classes test, wanted the same way, and the styles both follow, less what they want the other way. The companies and themes you both hold a thesis on are named. It sits beside the ranking by what the funds own, which stays.

## 9 Nov 2026 (the beta: your own Claude writes back)

- A thesis your Claude writes through the connector now waits on Theses under Proposed by your Claude: tick the parts to keep, amend the thesis or the pathway, then keep it or dismiss it. An evidence entry alone (what a call or a document said) is still added at once.
- Your Claude can file an entry in your Decision Log in your words (marked as written by Claude), rate an agent's finding as you tell it to, and write the studies you queued on Research from the app's own brief; a section stating a figure the brief does not print is sent back.
- Price checks from your broker: your Claude can read your broker's prices through its own connector and tell the app which of your price levels and price triggers are met. Each met one is an alert in your own numbers; the app keeps no price.
- The connector's get_theses now lists each trigger's id, for those checks.

## 9 Nov 2026 (the beta: invitations, plans, Delete my account, counts)

- Sign-up can be invite-only (SIGN_UP=invite): Create an account asks for the invitation code first, then offers Google, Microsoft or email as before. The operator makes codes on /ops, each for a number of people, a number of days and a plan, and can end one there.
- Plans: an account made here carries a plan (beta, founding member, core, pro) whose monthly AI allowance comes from PLAN_CAPS_USD (beta $3, core $1.50, pro $6 unless set). Setup's AI card shows the month against your plan's allowance; past it the written parts pause and the figures, checks and alerts keep running.
- Account settings: your plan, the founding plan to commit to when the deployment offers one (nothing is charged), and Delete my account, which deletes everything the deployment keeps about you; your files stay in your Drive.
- /ops: the AI's estimated cost this month and last by agent, with the average per person; the six beta steps as people and shares of those who signed up; founding commitments against the goal; the invitations.
- An account made by sign-up can now add the connector to Claude; before, only addresses on the allowlist could.

## 9 Nov 2026 (twenty more ways)

- Clubs: challenge another club by its id to a term on the same days and rules; once accepted each club runs its own side, and the challenge sets the two medians against SPY side by side.
- Clubs: a faculty adviser role, who runs the club beside the owner and officers. Course mode on a competition grades each entry out of 100 on reasons written, holdings held and the weight limit, never on the return.
- Clubs, Library: thesis bounties an officer posts on a ticker, answered with pitches and won by the members' votes; a peer review of each pitch, 1 to 5 on its evidence; and how the picks did, each first pitch against SPY since the day it was written.
- Clubs: a shared watchlist with levels, whose crossings are alerts on Notifications for every member; earnings nights, a meeting on a company's results with a link to its page; alumni listed by the year they left, when they choose to be; and Your path, from a club to a book of one's own.
- Competitions: each entry's reasons are judged against SPY since the trade, beside the return.
- Trades: Your reasons, scored, the past year's trades with a reason in the Decision Log and how the reasoned ones fared against SPY, judged a month on.
- Theses: Your valuations, a year on, whether each bear-to-bull range you set held the price a year later.
- Decision Log: export the journal as a sealed PDF, every entry oldest first with amounts masked, its fingerprint checkable at /receipt so it cannot be backdated.
- Community: a Verified analyst mark on a track record of a year or more, twelve weeks without a breach and 80% of rules kept. Share your methodology's rules on your card for an adviser or mentor to read. Your family: a household of up to eight who see each other's shared cards side by side.
- Methodology: rule packs (concentration, diversification, drawdown, a cash buffer) added as a draft to confirm, and the methodology marketplace: list yours, rules only and credited to you, or adopt one as a draft. Free for now.
- Account settings: give open data, once a week and pooled, never an amount. Open data and the annual Invariant report are public pages.

## 9 Nov 2026 (club library, meetings, a league, records that go with you, thesis receipts)

- Clubs, a club's page: a Library tab where any member keeps a pitch or thesis on a ticker for the club, grouped by ticker, newest first; the author or an officer removes one, and it stays with the club when the author leaves.
- Clubs, Meetings: an officer calls an investment committee meeting with its day and agenda (a line starting "TSM:" ties to the library's newest pitch on it). Each member votes for, against or abstains on each item until the minutes are written; everyone sees the tallies and the outcome, never who voted how.
- Clubs, the league: an owner or officer puts the club on it from the Competitions tab. The league ranks clubs by their newest competition with three or more entries, by the median member's return against SPY; never a member's name or an amount.
- Clubs, Your record: every competition you entered, with your return, points against SPY, rank and trades with a reason. It stays yours when you leave a club or it closes, and Forget my kept record deletes it.
- Theses: each thesis page carries a receipt, a fingerprint of its words and when the app first saw them, so a call can be checked later and never backdated. Shared theses show theirs on Community, and anyone can check one at its receipt page.
- Community: your card can carry a streak (the weeks since a rule was last breached), where your methodology came from when you adopted it from the library, and its family. How methodologies did pools the shared track records by family once three or more people share one.
- Community: give your card a private link for a mentor, a professor or a hiring manager, read without a sign-in, and keep the card off the lists if you like. A new link ends the old one.
- Methodology: one adopted from the library says it was forked from it and by whom; your changes are your own.

## 9 Nov 2026 (self-fix: no false unread note)

- Company figures: a line the app already reads under another name, such as other short-term borrowings read as short-term debt, is no longer named in a figure's note as one "the app does not read yet".

## 9 Nov 2026 (self-fix: findings too vague)

- Company news and the Research Agent: a finding that states no figure, bears on nothing in your thesis and only says something may or could matter is left out as too vague, and the agent is told to say what happened, who and when, with the figure and the pillar or rule it bears on. A plain fact with no figure, and a maybe tied to one of your pillars, still show.

## 9 Nov 2026 (self-fix: D&A filed in two lines)

- Company figures: a company that files depreciation and amortisation as two lines and no combined one (many IFRS filers add them back apart on the cash flow statement) now has its D&A read as their sum, so net debt to EBITDA is shown instead of named as a gap. A year with a combined line keeps it.

## 9 Nov 2026 (Clubs, a track record, the rule language and a skill)

- Clubs, under Markets beside Community: start a club or join one with its code. A club's material is its own Google Drive folder, shown in the app as Google draws it, so a lecture, a deck or notes added in Drive are there at once; Open in Drive to add a file. The app never reads or changes the folder. The owner and officers link the folder, hand out the join code (and make a new one), see members' addresses to paste into Drive's Share box, and name officers.
- Clubs: virtual portfolio competitions among members. Each entry starts with the same virtual cash, buys and sells listed tickers at the last close with a reason for the club to read, and is ranked by return against SPY over the same days. No short selling, no margin, and a weight limit a holding (25% unless the competition says otherwise). Virtual money; nothing is traded. The demo carries a fictional club and its term challenge.
- Community: share your track record, read by the app from your statement: the time-weighted return since the first day against SPY over the same days and the share of your rules kept today, in percent, never an amount. It follows your statement by itself, like the rest of the card.
- Setup, Your own Claude: download the Invariant skill and add it in Claude's Skills, so Claude calls the app's tools first, takes every number from them and cites each rule's section. The methodology's rule language is published as a JSON Schema at /api/methodology/schema.

## 7 Nov 2026 (Fetch now)

- Setup: Fetch now reads your broker statements alone and answers within seconds; it no longer runs the whole morning refresh (results, studies, agents, filings), which ran past the button's time and said it may not have been kept. Those still run each morning and when you open the app. On the Every morning card the button reads Fetch statements now.

## 6 Nov 2026 (cash from IBKR, a Markets menu, Community after Blossom)

- Calendar events: one report, read half an hour after the event comes out, with the outcome and how investors took it together. It no longer waits for the US close, and there is no step two. An event's time on the calendar (08:30 New York, 14:15 Frankfurt, 12:00 London) sets when; an election is read from midnight UTC after it, the Bank of Japan in Tokyo's morning. An outcome not final yet is read again every two hours for two days, then every six. The results watch now runs every quarter hour, all day, for the three hours after an event.
- Stealth mode hides only your own money. A company's revenue, market value or price, the S&P 500's day, prices before and after the session and company news stay. Company, Companies, Screener, Macro, Calendar, Earnings, Top funds, Community, Watchlist, Research and Agents keep their amounts; on a company's page your holding's value is still hidden.
- Company page: revenue by segment or product and revenue by geography are each a chart over time, side by side on a wide screen; the donuts are gone.

- Community, laid out after Blossom: a feed of what the people sharing wrote and moved (each shared thesis, a card's weights that moved a point or more with their percent before and after, or the card itself), For you or Following, with a search by person or ticker; beside it Most held, as bars of how many hold each company, and People, each with an avatar and their three largest holdings as chips. A profile opens with the same head: avatar, name, line, methodology, what they share and their largest holdings. Still percent only, never an amount; no post, like or comment is kept.
- Macro: Credit stress is a chart like the value map, Altman's Z-score up and net debt to EBITDA across, Altman's two lines dashed and the zones named, a dot for each company held, watched or among the lowest, each opening its page, with the table folded under it. A company with no score is left out. The lowest in the S&P 500 and Nasdaq-100 show only once most of them are scored: until the screener reads them again they were mostly your own holdings, read first. The screener reads again first the companies read before the score was added.
- Top funds: Pershing Square is read from its public parent, Pershing Square Inc., which files the 13F for it from the quarter to 30 June 2026; the quarters before come from the old filer.
- Company page: a segment or product name a filer ran together reads as words ("Advertising and other revenues"), and a legal matter filed on the product axis is no longer drawn as a product line.

- Calendar: it opens on this week, with the month on a switch. A past result or event with a report is underlined; its chip opens the earnings report or the event's report, and the day under the grid links it too. The calendar now goes back to the earliest one.
- Holdings: the cash in an IBKR account is now in the book, from the Flex statement's Cash Report, one line per currency (else the Equity Summary in base). It was read before but left out, so a sale showed no cash and net worth fell by it. A statement with neither section says to tick the Cash Report.
- The top menu has a sixth place, Markets: Macro, Calendar, Screener, Top funds and Community moved there from Research, which keeps Companies, Watchlist, Theses, Earnings, Research, Analyst and Agents.
- Notifications: a company's results are one alert. Once the earnings report reads whole, its alert takes the place of the figures alert and carries the revenue and the reading with it.

## 5 Nov 2026 (behind the flow's lines)

- Earnings: each report's revenue flow now says what lies behind its lines. Every expense the flow draws is explained: why the company spends that much and where the money goes, as the release, the call and a few pages of the web tell it. So are a gross margin that moved, a segment growing apart from the rest, a tax rate out of the ordinary, large interest or other items, and an operating margin that moved.
- Each note says where it came from. The company's own words are quoted only when the release prints them word for word. The call is put in plain words and never quoted. A note that states a figure no source prints is left out.
- The notes are their own page after the flow in the earnings report and its PDF, sit under the flow on the Earnings card, and sit under the quarter's flow on the company page when that quarter is the report's. The report waits for them before it is emailed, like the call and the study.
- The flow's expense lines show their growth on a year where both years are filed.
- Earnings report on a phone: the footer of each page sits under the page's content, so a long source line no longer covers the last card.

## 5 Nov 2026 (credit stress)

- Macro: Credit stress. Altman's Z-score for each company you hold and watch, then the S&P 500 and Nasdaq-100 companies with the lowest scores, each with interest cover and net debt to EBITDA and Altman's zone: distress below 1.81, grey to 2.99, safe above. Banks, insurers and real estate trusts are not judged. Each company opens its page.
- Company figures: the Altman Z-score, from the latest balance sheet, the trailing twelve months and the price, for the screener, the filings and any methodology that asks for it.

## 5 Nov 2026 (what it sells, apart from where)

- Company pages: revenue by segment no longer mixes places with what the company sells. A company whose segments are countries or regions (MercadoLibre's Brazil and Mexico, Birkenstock's Americas and Europe) has them under By geography, and its products and services under By product. Segments that put regions beside a business in one split (Amazon's North America, International and AWS) are drawn as no split of their own, and the note says why.
- The stacked revenue chart has a third tab, By geography, quarter by quarter or year by year from the filings, the places made to add up to revenue so no country is counted beside the region that holds it.
- The revenue donut beside the geography donut shows one split, the segments or else the products, never both and never a place; the earnings report's revenue table the same. The flow from revenue to profit starts from what the company sells, never from its regions.
- A study and the commentary read the segments, the revenue lines and the places as separate splits and never add one to another.

## 5 Nov 2026 (the reviews without PowerPoint)

- Reviews: the weekly and monthly no longer make a PowerPoint or a Google Slides deck. The PDF report keeps its layout: the cover with its tiles, the bottom line and the verdict, then the numbered chapters from Performance to the Appendix.
- Reviews draws that report in the app as a page of the same sheets, chapters, tables and charts, with Open and Download the PDF beside it, so the page and the PDF say the same. Every chart on the page has a table view.
- The email attaches the PDF report alone and no longer links a deck.
- The Thesis Hunter's part of the weekly and monthly is a summary: a line a thesis with how many finds back it, challenge it or update it, and the one to read first with its source, eight theses at most. Every find stays on the thesis's page.

## 5 Nov 2026 (where the revenue goes)

- Earnings: the report after a company's results draws the quarter as a flow, from revenue by segment to gross profit and the cost of revenue, operating income and the operating expenses in their own lines, and net income with tax and the rest, each with its margin and its change on a year. The report's page and its PDF have it as a page of their own after the results, and the card on Earnings draws it in place of the revenue and profit rows of its table.
- Company pages: the same flow for the latest quarter and the past twelve months, on a switch, from the SEC filings, with a table view.
- Holdings: Where your share of the revenue goes. Each listed holding's share of its company's past twelve months, sized by what you hold over its price to sales, added up into one flow from revenue by holding to net income. A holding with no filed revenue or price to sales is named.
- On a phone the flow fits the screen: names and amounts alone, the margins and growth in the table view.
- Earnings: every row of a results report with a year before now shows its change, in the email, the page, the PDF and the app. A margin moves in points (+3.2 pts), and a figure that was a loss a year before moves in its own amount (+22.5m), since a percent of a loss means nothing.

## 5 Nov 2026 (dismissed stays dismissed)

- Notifications: Dismiss and Mark all read now reach every alert the page shows, including those after a company's results, a macro event, a day the Calendar agent found and a followed card. Before, one of those dismissed came back on the next visit, and dismissing it again said it was no longer there.
- A screen opened right after an update, from a tile or a link, loads the new version by itself instead of saying it could not be shown.

## 5 Nov 2026 (the filings reader learns from its own gaps)

- Help improve Invariant also counts the figures a results report could not work out although the company's filings carry the line under a name the app does not read yet: the figure and the filings' standard name for the line, never the company or a number. The weekly fix reads the commonest and teaches the reader the name. Privacy says so.
- Methodology, Classes: a class tested on company figures no longer lists every figure as one "no connection supplies yet". Those figures come from the SEC filings read on Setup: once they are read the class waits for nothing, and before then it says so in one line.
- Earnings, a company that files its results on 6-K (Novo Nordisk, say): the report is read only from the 6-K that carries the quarter's results. A buyback or dividend notice filed the day before is no longer taken for the release, so the quarter's figures and their table are read from the results themselves.
- Notifications: the study written after a company's results no longer has a notice or email of its own. The results report waits for it and arrives once, with it.
- Notifications: the Thesis Hunter's finds are no longer notifications, in the list, the badge or the notification after the close. They are on the thesis page and in the weekly and monthly review.

## 4 Nov 2026 (the software fixes itself)

- Account settings: Help improve Invariant, on unless you switch it off. When a methodology you confirm asks for something the app cannot express yet, the words of that gap are counted with everyone else's, any amount masked; when you rate an agent's finding not useful, the agent, its step and the reason you ticked are counted, never the finding, your note or the company. Each is counted once per person, never under your address. Switching it off deletes what you raised. The demo counts nothing.
- The operator's page lists the gaps and reasons raised by the most people, and the pull requests a weekly routine opens to fix the commonest for everyone, each tested by every check, with its checks' state. The operator merges or closes each there; nothing changes in the app until one is merged.
- Privacy: says what is counted, how and how to stop it.

## 4 Nov 2026 (the earnings report as a page and a PDF, shorter event reports)

- Earnings: the report after a company's results is now a document, drawn on Earnings, Theses and the company page as pages you scroll, and the same pages as a PDF to download. It replaces the PowerPoint deck: no slides are made or kept in your Drive.
- Earnings: no "n/a" anywhere. A figure the app could read but had missed (ROIC from the filings, a quarter's margin) is now read; one the company does not report is left out, and the last page names what was left out and why.
- Earnings: the report is made only once it is complete, and read once more before it is sent by a reviewer that names any line that is unfinished, cut short, repeated or wrong for the company. A line it says to drop is taken out; a page missing what it promises holds the report until it reads whole, and after the wait it goes with the held lines left out.
- Earnings: one email per report, once it is complete, with the PDF attached and how the stock has moved since the release, beside SPY. The emails at each stage are gone. A rule or signal the filings give no figure for this quarter is named in one line instead of a table row reading "not read".
- Calendar: event reports are shorter, as an alert and an email: what happened, the outcome against what was expected, and how investors took it, told from the day's reporting (which groups were bought and sold, a rotation, and why). The index moves and the line on your book are gone, since a day's index move cannot be told apart from the rest of the day's news.
- Every agent that researches now reads between the lines: what changed from before, who gains, what the timing or wording shows, what is left unsaid, and whether a move had another cause that day; never a motive the pages do not support. This covers the Research Agent, the Thesis Hunter, the results commentary and call, the event reports, the reviews' news, studies, podcasts, the lens agents, Add to thesis and the property watch.

## 4 Nov 2026 (the front page, no Quartr, the demo as of today)

- The greeting greets you back: it shows when you open the app or come back to it after a quarter hour away, never while you are tapping, typing or scrolling, and no longer on a timer while the app is open. Quotes no longer repeat: the ones you have seen are kept with your preferences, so every device shows the next one, and a quote comes round again only after every other has shown.
- A front page for anyone not signed in, at the app's own address: what the app is, how it works, the plans and questions, with Log in and Sign up at the top right and Try the demo. Signed in, the address opens the Dashboard as before.
- The app is named Invariant everywhere you see it: the menu, sign-in and sign-up, emails, decks, PDFs, the push notifications and the connector in Claude or ChatGPT. Your Drive folder keeps its name, Portfolio OS, so nothing moves.
- Setup: the Quartr card and its prompt are gone; nothing in the app points to Quartr. The app reads each earnings call itself, from the company's own filings and the call's transcript, and reads it again every six hours for three days after the results while it has no analysts' Q&A. The call is read from its own transcript, from API Ninjas, licensed for this use, once the deployment holds its key; until then from the company's filed remarks and the day's pages as before.
- Reviews: each weekly and monthly review now goes out at the hour you chose, not at the next morning run; a Sunday 09:00 review had been arriving on Monday. A review cut off by a timeout is sent at the next hour instead of being skipped; the 1 Nov weekly and the October monthly, which were, go out at the first run after this is live.
- Reviews: a review is never sent twice. Send me one now marks the slot the schedule would send the same review in, so it does not come again; a first-week slot still sends the monthly. A run cut off after the weekly sends only the monthly when it is taken back. Send the monthly now emails the monthly by hand.
- Demo: the showcase book is as of 3 Nov 2026, with its full year of trades, dividends and fees.
- Demo: every screen is filled as of 3 Nov 2026. The company pages show five years, quarters, segments, valuation history, insiders, short interest, peers and the analysts' consensus, marked illustrative; Earnings follows every holding with a fictional report, call and deck; the Screener, Top funds and Research are filled.
- Demo: prices, the session of 3 Nov, the indicators, the Calendar's odds and event reports, and the prints before the open and after the close run up to the snapshot's date, all fictional.
- Demo: each holding has a thesis and a record with triggers, kill signals, levels and a valuation; the watchlist, market theses, Decision Log, Evaluation and Community are filled.
- Demo: the weekly and monthly review for the snapshot's last week and month, with decks and PDFs; every agent has runs, findings and lessons; Notifications and Setup show what a real account would.
- Demo: At the Close, the recap newsletter, the other newsletters, the podcast and the study are invented, with pictures drawn for the demo; no real newsletter or show is reproduced.
- Calendar: a market's bet on an event with no history no longer says its chances weigh the history below.
- Theses: a company that earns an operating profit is no longer read as a startup because its free cash flow is negative.
- Holdings: the value map's labels no longer overlap.

## 4 Nov 2026 (the daily planner, the advisor, the lens agents and the Agent Builder)

- Holdings: Against your fair value, right after the positions. Each listed holding's price against the base case of the valuation you set on its thesis, as a bar from zero (the rise to your base, or how far the price stands over it), with where it sits among your bear and bull. Above them, your whole valued book weighted by what each holding is worth: below, at (within 5%) or above your value, the move to your bears, bases and bulls, and what share of the listed book you have valued. The holdings with no valuation of yours are named, each a link to its thesis's Valuation calculator.
- Company page: Against your fair value, above the price and valuation charts: the price against your bear, base and bull, and a link to set or change them on the thesis.
- Agents: the daily planner runs each morning on Opus before the Research Agent. It reads what changed (results due or just out, the alerts of the last three days, by kind and never their amounts), puts the companies with news first, and may add up to two runs outside the schedule per agent: a thesis hunted early, an agent you built run early. The app drops any task for an agent that is off or at its ceiling, or for a company you neither hold nor watch, and its page shows today's plan and what was dropped.
- Agents: the Research Agent's Judge, on Sonnet, may now ask Opus once or twice before a hard call (a kill signal nearer, a pillar broken). The hierarchy shows it advising on Opus.
- Agents: three lens agents, value, growth and dividend, each turned on on its page. After the morning's research each reads the day's findings as that way of investing would and says which matter, whether each favours the company or cuts against it, and why. A reading that cites a finding it was not given, or a figure the finding does not print, is dropped and counted. A second view beside your methodology, never a verdict.
- Agents: the Agent Builder. Say in a line what to look for ("watch my holdings for any change in management or the board"); the app compiles it into an agent, tests it on the past week, and switches it on only once you have read the result. Up to five, daily or weekly. Their findings are on Agents and Notifications, marked as from your agent, and in the push after the close, never emailed one by one.
- Every AI call now goes to the newest model of its tier as soon as Anthropic releases it: the app reads Anthropic's model list, which costs nothing, at most twice a day. A new model that refuses a request is asked again on the one it replaced. The hierarchy on Agents shows each tier's model.

## 4 Nov 2026 (the agents' hierarchy)

- Agents opens with the hierarchy: Opus, Sonnet, Haiku and the app's own code as four bands, each with its model and every agent with a step on it, the steps named, from the top down. The daily planner, the lens agents and the Agent Builder are on it as planned.

## 4 Nov 2026 (the AI is run by PortfolioOS)

- The AI now runs on PortfolioOS's own Claude account. There is no key to make: the "Your model" card on Setup is now "The AI", which says whether it runs here and what this month's use has cost against your monthly allowance ($15 at list price unless the deployment sets another), resetting on the 1st. The open-model and own-key choices are gone; a key kept before is no longer read.
- Past the allowance, a call that needs the AI says so and waits for the 1st; everything that does not need the AI keeps running.
- Privacy and terms say what goes to Anthropic, under PortfolioOS's account, and that a fingerprint of your sign-in is kept with each month's estimated spend.

## 4 Nov 2026 (the verdict first, five places, search)

- Dashboard: the first line is now Resonance, how closely the book keeps your own rules: the rules kept out of the rules the app can measure, with the breaches, the rules yours to check, those waiting for data and the decisions owed beside it, each a link to where it is answered. A rule the app cannot measure never counts as kept, and a watch is counted apart. Without a confirmed methodology the line says what it waits for.
- On a laptop, the Methodology checks, the Resonance line and the class groups on Holdings cite their rule's section in a narrow margin at the right, like footnotes on a statement. On a phone the section stays in the card.
- The top menu has five places: Today (Dashboard, Notifications, At the Close), Book, Research, Rules (with Methodology's Evaluation) and Reviews.
- Search: ⌘K or Ctrl+K, the Search button in the top menu or the magnifier at the top of a phone screen opens one search for a ticker, a screen or a rule. Anything else opens the Companies search.

## 4 Nov 2026 (every agent on one runtime)

- Agents: every model job the app runs is now a Live agent with its own page: the Reader (statements, releases, documents added to a thesis), the Writer (review commentary, your questions, studies, the deck's words), Results reader and reaction, the market recap, the review's news, the newsletter and podcast reader, the property watch, watchers, screens and Add data, the Analyst, and two new ones, the Methodology drafter and Performance readings. Each shows its runs, what each step ran on and its estimated cost, and can be switched off or given a weekly ceiling.
- Agents: the lessons you approve now ride every agent's brief, not only the Research Agent's.
- Agents: a reading the app's check refuses (a statement, a release, a newsletter, a watcher's or a screen's words, a document for a thesis) is asked once more on the next model up, Haiku to Sonnet or Sonnet to Opus. The run says so.

## 4 Nov 2026 (revenue by segment, prices before the open and after the close)

- Company page: revenue by segment as stacked columns, quarter by quarter or year by year, by segment or by product, from the company's own 10-Qs and annual report. Hover or focus a column for each segment's revenue, its share of the column and its growth on a year; the table view carries every figure. A fourth quarter is the year less its first three quarters, and the note says which columns are. The history arrives with the next morning's read of the filings.
- At the Close: Before the open and after the close, a tile for each holding and watchlist company that has traded pre-market or after hours since the last close, its price and its move against that close, the companies with results first. It is asked every minute while those sessions trade (04:00 to 09:30 and 16:00 to 20:00 New York), and between them the last prints stay with their time.
- Earnings: beside each report from the past week, a live tile with the move since the results reached the SEC: the price now, pre-market, in the session or after hours, against the last trade before the release was accepted, else the close before the results.

## 4 Nov 2026 (read alerts fold away, Thesis Hunter in the weekly review)

- Notifications: Mark all read now empties Now. An alert you have read that still holds moves into a closed Read row under it, where you can still open or dismiss it.
- The Thesis Hunter's finds are no longer emailed one by one. The weekly and monthly review carry them instead, as "What the Thesis Hunter found", in the review, its deck and its PDF, a challenge first. They stay on Notifications and on each thesis as before.
- Podcasts: when no new episode is written up, Setup says why, naming the newest episode podscripts.co lists and its date, or that it lists episodes with no date the app can read.
- Earnings: a followed company's results are now read within about a quarter of an hour of their release, before the open or after the close, and the report is emailed then, whether or not the app is open. Before, a report waited for the evening or the morning run unless you opened the app.
- Calendar: an event is now told in two steps. Step one is the outcome, posted and alerted as soon as it is out (an election result the morning after the vote). Step two is how the markets and your book took it, after the US close of the session that trades it, as before. Until then the event says which close it waits for.
- Earnings: one earnings deck per report instead of two. It is the deep dive with the reaction deck's own slides in it (the quarter against a year before, its KPIs by quarter, the highlights, what changed in the thesis) and a review note on page three that reads the study through this quarter: what is new, what the quarter bore out and what it changes. The study PDF is unchanged.
- Earnings: the deck is made only once the figures, the call, a study since the results and its review note are in, so no deck says "study not yet done". Earnings and Theses say what it waits for. The report's email still goes at once; the deck follows in its own email, attached. After five days the deck is made with what is on file.
- Earnings: gross margin is no longer n/a for a company whose release prints cost of revenue but no gross profit line.
- Earnings: the call is read without Quartr. The app gives your model the release's own documents from the SEC (the press release and its exhibits, where many companies file the CFO commentary or prepared remarks), and on a Claude key it reads the transcript's page in full once a search finds it.
- Scheduled runs: a run retried after a failure, or one a run did not reach, is now picked up within a minute instead of at the next day's run, and each run has more time before it stops (Vercel Pro).

## 2 Nov 2026 (scheduled runs as jobs)

- The scheduled runs (the morning refresh with the reviews and alerts, the evening read, the evening alert check, the Thesis Hunter, the Screener) now run one person at a time as jobs, several at once, each in its own server function. A run no longer stops part way when many people are signed up, a person whose run fails is tried again after 1, 4 and 16 minutes, and a person a run could not reach is taken first by the next one.
- Sign-up: a code can be sent to one address three times an hour, and asked for from one network ten times an hour. Past that the page says to use the latest code or wait.
- Opening the app catches up at most once every half hour across all of the app's servers, not once per server.
- The operator has an Operations page (/ops, for the addresses in OPERATOR_EMAILS, else SHARED_RECAP_TO) with the last day's jobs, and /api/health/deep for an uptime monitor. Neither names a person.
- The privacy page says what the job rows and the counters keep.

## 29 Oct 2026 (paused answers)

- A reading that searches the web (a deck's words, an event's outcome, the recap, the Thesis Hunter) no longer fails when Claude pauses partway through its searches: the app lets it carry on and reads the whole answer.

## 29 Oct 2026 (study sections)

- An event whose outcome is not out yet (an election count) is read again every six hours as before, but you are told only when a reading brings something new. A reading that says what the last one said is kept on the Calendar and sends no alert or email.
- A study no longer stops when the writer sends its sections in another shape (as text, or keyed by section): they are read and kept. A part that still cannot be kept is asked again by itself, then in halves, before the study stops for Continue.

## 29 Oct 2026 (earnings call)

- Post-earnings decks: four new slides in both decks. Beats and misses lists every reported line against the analysts' consensus or the company's own guidance for the quarter, with the filed diluted EPS against Nasdaq's consensus as the app's own row. Guidance lists every item guided, with what it was before and whether it was raised, lowered or kept. Guidance against your thesis sets each item against the pillar or watch item it bears on. The call carries the prepared remarks and the analysts' questions with management's answers. The deep dive is now 35 slides and the reaction deck 15.
- The call comes from your own Claude when the Quartr routine writes it on the thesis, else your model reads it from the notes and, on a Claude key, the day's pages. Paste the Quartr prompt from Setup again so the routine writes the guidance, the questions and the beats.
- The results routine now reads a company again when nothing added since its results carries the call, so the theses that already have a note get the call once.
- Competition, voices, moats, the SWOT, the five questions, capital allocation and the outlook are now written into the slides from the study, the release and the call on your model, with the rivals named, instead of pointing to the study on file.
- No sentence on a deck is cut with "..." any more: each box sizes its text to fit, and a slide that cannot hold everything leaves out whole lines.
- The report on Earnings and its email show the beats and misses, the guidance against your thesis and the call; the company page shows the guidance and the beats.
- Decks made before this are made again by themselves.

## 29 Oct 2026

- Calendar events: no PowerPoint deck any more. After each event the Calendar shows the summary with the session's moves as bars from zero, the alert on Notifications carries your book's and the markets' moves as coloured chips, and the email opens with the same moves as tiles. Decks stay for company results and the reviews.
- Notifications: set the move that makes an alert. A listed holding that moves this much or more in a session, either way, is an alert and an email after the close, and is marked on At the Close. 2% unless you set your own, 0.5% or more with no upper limit.
- Calendar: the BEA's 2027 dates for GDP and personal income and outlays (PCE) are on it. The note that a table runs out now names each kind that runs out within the window: JOLTS stops at 1 December until the BLS sets its 2027 dates.
- The Methodology screen's descriptions, the decks and the deck embeds no longer name HCMP or one person. The library's methodology keeps its credit.
- The privacy, terms, cookies and help pages give the deployment's own contact address, and the sign-in page and the thesis PDF its own demo, from the deployment's settings rather than an address written in.

## 28 Oct 2026

- Every day and clock time is on your own time zone, the one your device reports, never Athens or UTC written in: Being read now on the Calendar, the reviews' schedule and build times, the alert checks, the morning refresh, the sync lines on Setup, company news, newsletters and the event report emails. The Reviews schedule no longer asks for a zone; it follows yours, and moves with you when your device's zone changes.
- Reviews: a new schedule is Sundays at 08:00 on your own clock, so it lands on Sunday with the morning run in Europe in winter and summer alike. A schedule already saved keeps its hour.
- Cookies: the pos_tz cookie keeps your device's time zone for the app's server.

## 28 Oct 2026 (PR 146)

- Calendar: what the markets bet on, for every event of the next two weeks. For each rate decision, release, election, summit or deadline the app looks on Kalshi and Polymarket for a question that is that event's own, and shows the deeper of the two (more traded) with its odds, how much is traded and open on each, and a link. A question with under $25k traded is not used, and the event says so. For the Fed's meeting today that is Polymarket, with about $85M traded against $0.5M on Kalshi.
- Calendar: where the market's outcomes line up with the history's (a cut, hold or hike; inflation above the last reading or not; unemployment up or not), the history of your book on that kind of event is weighed by the market's odds, and says whose. Elections, GDP and the rest show the market beside the history without weighing it.
- Calendar: Being read now. At the top of the page and on its day, each event whose report is waiting says so: after the close at what time, due at the next run, or not final yet with each reading so far, when it was read and when the next one is. The Israeli election shows there until its outcome is final.
- Event reports: the prices kept the day before come from the same deeper market, for every event that has one, not only the Fed, and the report, deck and email name whose prices they are.

## 28 Oct 2026 (PR 145)

- Calendar: an event whose outcome is not out yet, such as an election still being counted, is no longer read twice and left. The report says "Not final yet" with what is known so far, and your Claude reads it again every six hours for a week after the session. Each new reading is told what the last one found, and each one reaches you as an alert and an email saying when it was read and what is known so far, so a quiet six hours never looks like a skipped one. Once the outcome is final, it comes as its own alert, counted in the notification after the close and sent as its own email with the deck made again.
- Calendar: the list of rules the app cannot measure is gone from the bottom of the page. None of them has a date; they stay on Methodology under Checks as yours to check.

## 27 Oct 2026 (PR 144)

- Calendar, Earnings and Methodology: the pages no longer time out. Opening the app catches up behind the page (reports after results and events, studies), and on these three it was cut off after two minutes. They now have five, as the Dashboard and Notifications do.

## 27 Oct 2026 (PR 143)

- Calendar: After each event. Once the session that traded a rate decision, a release, an election, a summit or a deadline closes, a report says what came out of it against what was expected and what differed, read from the official page and that day's reporting on your own Claude key, each point with its page. It shows how the markets took it on the session (SPY, QQQ, small caps, Treasuries, the dollar, gold, oil and the economy's own fund) and how your book took it, with the holdings that moved it most. Beside them sit your book's history on the same outcome and, for the Fed, what Kalshi priced the day before. It also says what the event touches in your book. Each report is a seven-slide reaction deck, embedded as Google Slides and downloadable.
- Notifications: each event report is an alert for three days, a warning when your book fell 2% or more on the session. It is counted in the notification after the close and sent as its own email with the deck attached. The event reports are on Agents with a weekly ceiling of $2 and Run now. Without a Claude key the report still gives the moves, the history and the reach, and says what the outcome needs.

## 27 Oct 2026 (PR 142)

- Earnings: your Claude's reading of the results is no longer thrown away when one part runs past its length. A long summary, guidance or point is cut at a sentence, a point without its page is left out, and the rest is kept. The same goes for why the shares moved.
- Notifications: the page no longer times out. Opening the app catches up behind the page, a report's reading or a study for example, and on Notifications that work was cut off after a minute. It now has five minutes, as the Dashboard does.

## 27 Oct 2026 (PR 141)

- Calendar: one calendar for every date. The releases, the central banks, the elections, summits and deadlines and your companies' results sit in one month, each with what it touches in your book. Macro now lists the next two weeks and links to the Calendar. Earnings shows your next result and links there too; its reports, reads and decks stay.
- Calendar: each event shows how your book moved on the same kind of event before. It uses today's weights and the closes since 2019, split by what was decided: a cut, a hold or a hike; inflation higher or not; unemployment up or not; a US election. Each outcome shows the mean with its 95% interval, the range, SPY beside it and how often the book fell. For the Fed, the prediction markets' odds weigh the outcomes into one expected move. A company's results show its last reactions either way, what that is as a share of your book, and the move the options price. This is history, never a forecast.
- Calendar agent: at the start of each month it looks three months ahead on your own Claude key. It finds the elections, summits, OPEC+ meetings and trade, sanctions and funding deadlines the calendar does not hold yet, each with its official page. They join the Calendar and alert you the day before. It is on Agents with a weekly ceiling of $1 and Run now.
- Reviews: the weekly and monthly review add Next week on the calendar. It lists each event of the seven days after the review with what it touches in your book and how your book took the same kind of event before. It is a slide in the deck and a table in the PDF's action plan.

## 27 Oct 2026 (PR 140)

- Research: a study no longer stops on one section the writer got wrong. Each section is kept on its own, a section past the study's length is cut at a paragraph and says so, and an answer that runs too long is asked again in halves. Only what failed waits for Continue, and the message names those sections. A study written after results that stops is taken up again by itself six hours later, for three days.
- Macro and Calendar: the economic calendar adds the ECB, the Bank of England, the Bank of Japan, the Bank of Canada and the Swiss National Bank's rate decisions, OPEC+ meetings, the major summits (G20, APEC, European Council, COP31, the IMF and World Bank meetings, Davos, China's party plenum), dates set in law or a published order (US government funding, US tariffs and port fees on China), and the national elections whose dates are set (Israel's Knesset, the US midterms, France's presidential election, Mexico's and Argentina's), each with its official source. A month with a weekend election shows the whole week.
- Macro and Calendar: each event says what it touches in your book: the revenue your holdings report in that economy, the share you hold in its currency, and your methodology's rules on what it moves.
- Notifications: each day on the economic calendar is an alert the day before and on the day, emailed with the other alerts, carrying what the event touches in your book.

## 27 Oct 2026 (PR 139)

- Earnings: every post-earnings report gets a study, written by itself on your own model key. The study follows your stock template (competition, what customers and staff say, moats, SWOT, the investment questions and the rest) and is laid on the report, so both decks fill those slides. One study is written per run, after the results are read, on opening the app and in the morning refresh. A study costs about four model calls on your key.
- Earnings and Theses: under each embedded deck, Download the study (PDF) opens the study written after those results. Research lists it as written after the results of its day.
- Decks: Valuation: history and peers is two charts. The left one draws the multiple week by week over five years, with its median, low, high and today marked. The right one sets the company's multiples against its peers' median and its sector as a whole. The valuation slide gives the market value and price in the listing's currency.
- Decks: a company you watch but do not hold is priced at its last close, carried into the filings' currency, so its P/E, yield and DCF read correctly. SPOT, for one, lists in dollars and files in euros.
- Segments: a company that files under IFRS (a 20-F or 6-K filer like SPOT) has its segment lines read. The note no longer says the filing carries no segment line.
- Figures: each derived figure carries a small (i). Hover it, or tap it on a phone, to see how the figure is calculated. It appears on the company page's key figures, the screener's columns, Against its peers and its sector, the valuation history, the portfolio's P/E and the value map. Priced-in growth, for one, explains the reverse DCF behind it.

## 27 Oct 2026 (PR 138)

- Agents: a finding is rated with a green thumb up or a red thumb down. Once rated, it shows the thumb you chose and what you said, with Change your mind? to rate it again. After a thumb down, the reasons fold away once they are saved.
- At the Close: Company news and reports now sits below What happened today and the newsletters.
- Podcasts: transcripts are read again. podscripts.co had put a "Discussion (0)" line between the Transcript heading and the transcript, and a category badge ("Technology") before each episode's title, so every episode read as having no transcript and was titled Technology. The note under the podcasts now counts only the fortnight's episodes, the ones still tried again, and says what the latest read found.
- Freshness: the book's badge on the Dashboard, Holdings, Performance and every other screen says Daily while your broker fetches it every morning. A morning whose fetch failed used to read "Uploaded"; now the badge stays Daily, turns amber and says why. The date beside it is the day your statement covers.
- IBKR: a dropped connection or a 5xx from Interactive Brokers is asked again twice before the fetch fails, and a morning whose fetch failed is fetched again when you open the app, instead of waiting for the evening run.
- Earnings: the day's companies no longer start with an empty card. A link anchor inside the grid was drawn as a card; it is the section's own anchor now, and an empty item in any card grid is never drawn.
- Holdings: the value map and the Classification Register carry the filings' badge, Daily with the day they were read, since they read the filings rather than the statement.

## 26 Oct 2026 (PR 137)

- Setup: the Quartr routine sets its own schedule from your results calendar. It runs every week while none of your companies reports, every day in the week before one does, and every 6 hours from its results day until they are read. A month with no results costs about four runs, each one small call to PortfolioOS and a one-line answer. The card says the task has its own model, and paste the prompt again to take the new schedule.

## 26 Oct 2026 (PR 136)

- Setup: the Quartr card has one prompt, pasted once. It asks your Claude to make itself a routine, a scheduled task every 6 hours with its tools always allowed, and to run straight away. Each run first asks PortfolioOS, which keeps the results calendar, whether anything reported; with nothing new it stops after that one call and opens nothing in Quartr. Otherwise it reads the results of every company that reported with nothing read since, and writes to its thesis what bears on the pillars, watch items and kill signals, what bears on your methodology's rules and class tests with their sections, and the figures the call gives that the filings do not. A company Quartr has not posted yet stays on the list for the next run, 6 hours later. The two prompts for one company are folded into it: name a company after the prompt to read it now.

## 26 Oct 2026 (PR 135)

- Setup: a Quartr card under Your own Claude. With Quartr Pro, you add Quartr's connector beside PortfolioOS in your own Claude, read-only, and paste one of two prompts: the latest results into a thesis, which Claude adds on the Theses screen for you to review, or the results set against your methodology's rules, which writes nothing. The app itself reads nothing from Quartr and keeps no Quartr sign-in, as Quartr's terms ask.
- Quartr reads by themselves: the card's first prompt, After every results, by itself, asks PortfolioOS which companies reported in the past three weeks with nothing read since (a new read-only tool, get_results_to_read), reads their call, slides and report in Quartr, and writes what bears on each thesis back to it, dated the results day. Set it as a scheduled task in your Claude, where your plan offers one, and it runs after every results without you.
- Earnings: a new section, Read after the results, lists each company that reported in the past three weeks with what your Claude read and wrote to its thesis, or To read when nothing has been read yet. The report itself shows Added to the thesis since the results, and its reaction deck puts those reads first under What changed in the thesis, made again when a new read lands.
- Research Agent: what your Claude wrote to a thesis in the window is gathered with the headlines, filings and newsletters, as primary reporting, so the findings weigh what management said on the call.

## 24 Oct 2026 (PR 134)

- Performance: Look-through has a new table, Against SPY, by your classes. For each figure your methodology tests it shows your book, SPY and the gap; which way your classes want the figure, read from their own tests; whether your book is ahead of or behind SPY there; and the holdings pulling it the wrong way most, each with its pull in points, so the pulls add up to the gap. The reading in your methodology now flags any figure your classes prize where SPY has more, and names those holdings. The figures are the ones your methodology reads, and the fund is the first benchmark it names that the look-through reads, else SPY.
- Performance: Read again no longer fails all at once when one card's reading comes back malformed. That reading is left out and the rest are kept. A reading cut short by the model's limit now says so, and the model has more room.

## 24 Oct 2026 (PR 133)

- On a Claude key, every call the app makes now caches its prompt: the instructions and tools a run shares, and each step of the Analyst's loop, are read back at a tenth of the price instead of paid again. The Agents screen's cost estimates count the cache.
- Screener: the price filter is gone, since a share's price says nothing of the business. Each figure your classes test is a filter at your own level (for example Gross margin, 50% or more, your level), and a level on a figure that already has a filter joins its choices.
- Performance: the Look-through and By holding sections now carry their reading in your methodology when you ask for the readings, the groups against your classes' levels and the holdings furthest from their class's tests. The look-through of SPY and QQQ is read again each morning, from the companies' figures the app already shares, so a company's new results count once its filing is read; the button to read it is gone.

## 24 Oct 2026 (PR 132)

- Screener: each S&P 500 and Nasdaq-100 company is read once for everyone on the app and kept in its database, instead of once per person, so a new account's Screener fills at once and the whole list is read in a few days; each company is read again weekly. Your own run lays what was read for everyone first and reads only what nobody has.
- Screener: a company read earlier in the week shows its P/E, forward multiples and dividend yield at the latest close.
- Priced-in growth: every company read from its filings now carries the revenue growth a year its price assumes, from a reverse DCF on free cash flow (WACC 9%, terminal growth 3%), below zero when the price asks for revenue to shrink. It is a column and a filter on the Screener (including Below what it grows) and a line in the company page's Valuation figures, and a methodology can test it.
- Company pages: a company outside your holdings, watchlist and the lists is read on opening and then kept for everyone for a week, so the next person, any day that week, opens it at once.

## 24 Oct 2026 (PR 131)

- Performance: Read through my methodology writes one line under each card (returns, IRR, alpha, risk, the worst fall, good and bad days) saying what the figure means for how you invest, whether it is in line, worth watching, against your methodology or noise for now, and the sections it bears on; one reading of the page as a whole sits at the top with when it was read and on which windows. It runs on your own model, from the figures on the page alone; a reading that quotes a figure the card does not show is left out, and the page says when the windows have changed since.

## 24 Oct 2026 (PR 130)

- Methodology: a new Evaluation tab judges whether your methodology works. It opens with one verdict (holding up, mixed, not holding up) over the period read, called too early under a year, with your return against the benchmark and Jensen's alpha.
- It says whether you are investing under it: how much of the book its classes place, the rules broken today, how many companies bought since were ones its classes place, and how many sales have a reason logged.
- Since when: from the day you set, else the day the methodology was adopted when enough figures follow it, else where your figures begin. Your own model can suggest the day and how to judge a methodology that states no proof of its own; nothing it suggests counts until you confirm it.
- Each test is a card with its claim, where it comes from (your methodology, your model's suggestion you confirmed, or the app's default), its verdict and its figures: the book against the benchmark, its worst fall against the benchmark's, each class against the benchmark from when each holding was bought, and share prices against earnings growth over five years, holding by holding.
- Holdings: a value map places each holding and watchlist company by its forward P/E against its EPS growth a year, the analysts' projection or what the filings delivered on a switch, with the line where a point of P/E buys a point of growth (a PEG of 1), a table view and the companies it cannot place yet.

## 24 Oct 2026 (PR 129)

- Filings: when the SEC answers with its rate limit or a passing error, the app waits and asks again, and it keeps its last copy of the SEC's company list, so one refusal no longer stops the morning's filings read for every company. The logs no longer name the company a read failed for.

## 23 Oct 2026 (PR 128)

- Agents: a new screen under Research shows every agent from "PortfolioOS: Agents, Research Agent and Agent Builder". It draws the three layers, the Research Agent's five steps (Gather, Filter, Sift, Judge, Check, with the edge back to Gather), each agent's last run, this week's estimated cost on your own key against its ceiling, how its findings were rated, and the learning curve across all of them. It closes with the rules every agent follows, the rollout and the decisions taken.
- Each agent has its own page. It shows its contract, its steps and what model each runs on, its latest findings to rate, the runs step by step with what each read, kept and cost, how its earlier calls aged against SPY, and its lessons. You can run it now, switch it off, or set its weekly ceiling.
- The Research Agent is live. Each morning, and a few companies at a time when you open the app, it reads the week's headlines, filings, results reports and your own newsletter and podcast points for every company you hold or watch, against your thesis, its pillars, the kill signals and your methodology. A small model sifts, a larger one writes up to eight findings, and the app keeps a finding only when every figure in it is printed in its sources. An open model runs both steps on one model.
- Company news on At the Close and on a company page now opens with What bears on your theses: the findings, the ones that challenge a thesis first, each with the pillar it bears on, how sure the sources make it, its sources and Useful or Not useful. Each headline card says whether it was kept and what it bears on, or why it was left out.
- Rating a finding Not useful asks what was wrong (off the thesis, wrong, old, a repeat, a poor source, missed the point, vague). From those ratings, your model, or the app when there is none, proposes a lesson. A lesson rides the agent's later runs only once you approve it; you can also write your own.
- Thesis Hunter: it now reads the items the Research Agent kept for that company. Its runs and costs show on Agents.
- Theses: What the price assumes, after the Valuation calculator. The app's own figures come first: the revenue growth the price needs from a reverse DCF, what the company delivered, the guidance on file and your cases. Then, when you ask, your model reads each pillar as priced in, partly priced in, not priced in, or bet against by the price, each with its evidence and pages. A reading is kept for a week.
- Company page: the revenue and other money charts no longer redraw themselves on opening. The server wrote "$7.0B" where the browser wrote "$7B", and the page threw the server copy away.

## 23 Oct 2026 (PR 127)

- The day's recap newsletter shows within minutes while the app is open: the inbox is read every three minutes from an open app, the evening reads run again at 00:30 and 01:30 UTC for a recap that lands after midnight, and a reading a little over a limit is clipped to fit rather than dropped, which had kept the 23 Oct recap out.
- Screener: Your classes now covers the whole S&P 500 and Nasdaq-100. Every class tests the disruption engine, which the screener did not read, so only your own holdings could pass. Each company's engine is now read from its own segment note with its weekly refresh. Until it is, company revenue growth stands in, as it does for a holding whose filing has no segment line, and the page says how many companies that applies to.
- Screener: Your classes is redrawn. A bar shows where all the companies fall, class by class, in each class's colour. Each class is a card in its colour, with its test in words and its companies as tiles, largest first, with dots for the criteria that held. The companies one criterion short follow.
- Screener: the filter menus open above the table instead of behind it.
- Phone: At the Close takes Earnings' place on the tab bar, just left of More. Earnings is under More.
- Company page: revenue by segment and by geography are donuts.
- Company page: insiders can be read over the past year, the year to date, six months or three months, each with its dates. The read date is gone, since the forms are read every morning.
- Company page: a company you traded before but neither hold nor watch is read from its filings when its page opens, as any public company is. JNJ's page showed nothing because of this.
- Forward multiples from the filings carry the trailing figure a year on at revenue growth, not at the figure's own growth. A one-off gain no longer doubles forward EPS: AMZN's 2026 gains had made its Fwd P/E 10.5x against the analysts' 24.5x. On the five-year charts, a P/E or P/FCF week above 100x is left out as not meaningful and counted. Before, a year of near-zero earnings drew AMZN at 680x.
- Top funds: a fund read while the SEC's company list was not answering kept no companies and stayed unrated until its next 13F. Now it keeps its last good copy, and every fund is read once more. A fund under 25% judged says Not ranked and why.
- Earnings: each report after a company's results is now its own email. It carries the headline, the quarter's figures against a year before, your classes, the rules, the kill signals and triggers, how the stock took it and your Claude's commentary. It links both decks in Google Slides and attaches them as PowerPoint. Other alerts still come as one digest.
- Alerts: an alert is emailed once even when two checks run at the same moment. Some alert emails had arrived two or three times within seconds.

## 23 Oct 2026 (PR 125)

- Valuation chart on a thesis and the company page: Fwd P/E, Fwd P/S and Fwd P/FCF over five years beside the trailing multiples. The forward figure is the trailing one carried a year on at its own growth, held between −50% and +100%. On Fwd P/E, the analysts' consensus from Nasdaq stands beside the line, labelled as theirs.
- Against its peers and its sector: a new card on a thesis and on the company page sets each trailing and forward multiple against the median of its peers (the same GICS sub-industry in the S&P 500 and the Nasdaq-100, else the same SEC industry code) and against its sector taken as a whole, with the largest peers named.
- Alerts: a holding or watchlist company near its five-year low forward P/E is an alert, beside the method you chose.
- Screener: a Fwd P/E column and filter.
- Watchlist: adding a company now asks for its thesis instead of a note, and the thesis appears on the Theses screen. Each card shows a year of the price with your low, base, high and alerts drawn on it as you type, a reference from the company's own five-year range, its peers and its sector, a Use these button that fills the fields from that reference, and the class your methodology puts it in.

## 23 Oct 2026 (PR 124)

- Screener: opens as a table of every company in the S&P 500 and the Nasdaq-100, after TradingView's: price, move and market value from the last close, P/E, EPS and revenue growth, dividend yield and ROIC from the filings, and the class your methodology puts it in. Filter pills for the index, price, move, market value, sector, the figures and your class; every column sorts; a heat map draws what the filters leave, by sector, sized by market value and coloured by the move. Your classes stays as the third view.

## 23 Oct 2026 (PR 122)

- After Dismiss or Mark all read on Notifications, another screen now opens at once. Before, it waited until the change was saved, which could take several seconds. The change is now saved in the background, and the unread count in the menu follows it.
- Earnings: every company you follow now gets its decks, watchlist companies included, and the decks run newest first. When Google Drive will not turn a deck into Slides (META's), it is kept as the PowerPoint file and embedded from Drive.
- Company page: the Financials' yearly and quarterly charts come from the filings the app already reads, so they no longer wait for the next results. The report after the results still wins where it has them. The Insiders card says the dates it covers.
- Holding page: triggers and kill signals, and the rules on the holding, are lists instead of narrow cards. Revenue by geography is a donut above its lines, and amounts such as net debt read $23.5B instead of 23458000000.
- Pages with two columns (a holding, a thesis, Trades, Account, Help, Trade check) now flow their sections through both columns, so one column never ends long before the other. A grid inside a half column keeps two cards to a row.
- Community: the form for what you share is folded shut until opened.
- Macro and Calendar: the economic calendar is a month grid, Monday to Friday, with each day's releases as chips; a day opens its releases under the grid.
- Macro: the Fed odds card reads the next meeting's own markets on Kalshi, which list today's range, instead of the first page of the series, which only reached meetings in 2027. When there is still no reading, it says which meeting and which levels Kalshi lists.
- At the Close: a recap newsletter from an earlier session is dated in the header instead of "What happened today", and says the day's has not arrived yet. The issue's other story pictures follow its points, so none is hidden.

## 23 Oct 2026 (PR 126)

- Earnings: a company's decks are made once per new reading of its results, not again every few minutes while you have the app open, and META's decks, which waited behind them, are made. A report that has its release is asked of the SEC again every six hours until its quarterly filing lands.

## 23 Oct 2026 (PR 121)

- Theses opens with a scorecard: each stock thesis, held or watched, against SPY since the day it was written, and how many are ahead. A thesis written before today is measured from its first evidence and marked as approximate. A market thesis can now name a basket of up to twelve companies that express it, measured together against SPY on the scorecard and on its own page.
- Notifications: Watchers. Write what to be told of in your words ("MA's operating margin falls below 50%", "any position over 15%", "the VIX above 25"). Your model turns it into one figure at one level once, the app says back how it reads it, and the check twice a day raises an alert and emails it when it holds.
- Screener: Ask in words. Type a screen ("cash-rich software with operating margins over 30%") and your model turns it into filters on the filings' figures once. The app runs them on the same companies as your classes and shows each filter before the results; what no figure can read is named.
- Company page: How it took its results. The stock's move on each of its last eight results against SPY's over the same sessions, from the SEC's release days and the closes, with how often it rose and how often it moved more than the options priced.
- Company page: Bull and bear, from what you keep: your bull, base and bear per share against the price, your pillars as today's figures read them, your kill signals, and what the Thesis Hunter found. Nothing on either side is a model's opinion.
- Community: the community index. The companies five or more of the people sharing their weights hold, with how many hold each and its average weight. Companies held by fewer are only counted, so no one's weight can be read from it.
- Your own Claude or ChatGPT, on Setup: a second, public address with no sign-in, for any US-listed company's SEC figures, insider trades, short interest and results dates. It reads public filings alone, never anyone's portfolio, a price or a model.

## 23 Oct 2026 (PR 123)

- Top funds: more of each fund's positions are matched to their company. A 13F abbreviates and cuts names short (BANK OF AMER CORP, APPLIED MATLS INC, TAIWAN SEMICONDUCTOR MANUFAC), and these now find the company, so more of each fund can be judged against your classes. Every fund is read again once.
- Top funds: a fund that files its 13F in thousands of dollars (Baupost, Duquesne) now shows its real total, not one a thousand times smaller.
- Top funds: Greenlight's 13F is read from its adviser, DME Capital Management, which has filed it since 2024. A fund whose latest 13F is two quarters old or more is ranked last and says so.

## 23 Oct 2026 (PR 118)

- Signing in again now renews the sign-in the scheduled runs use (the morning refresh, the alerts, the screener, the Thesis Hunter and the reviews), so they start again by themselves after Google ends the old one. Before, the schedule had to be kept again on Reviews.

## 23 Oct 2026 (PR 120)

- Every reading your Claude does on the web is now investigative. When a company does something investors did not expect, such as layoffs, a deal or a new leader, it looks for why: who left and who was hired, the executives' records, and what the company did before. This applies to the reading of the results, why the shares moved on them, the Thesis Hunter and the recap after the close.
- An earnings report now has "What investors did not expect, and why": up to three such findings, each with its pages. They also appear on both decks. The reading of the results may use up to eight web searches on your key, up from four.

## 23 Oct 2026 (PR 119)

- Coming back to the app no longer shows "This page couldn't load". A button or a background check that cannot reach the server (often right after the computer wakes, or after a new version is deployed) now says so beside the button, and nothing else on the page changes.
- A screen that does fail now says what failed in the app's own words. It reloads by itself when the cause was the connection or a new version, waiting for the connection to come back. Otherwise it offers Reload and Back to the Dashboard.
- Next.js is updated to 16.4.3, which fixes the security advisories published against 16.4.0.

## 21 Oct 2026 (PR 117)

- Companies, under Research: search every company that files with the SEC by ticker or name, and open its page; your holdings, watchlist and the companies you traded before are listed under the search.
- A company page now opens for any public company, not only those you hold or watch. Its filings, insiders and short interest are read when the page is opened, and Add to watchlist on the page has them read each morning.
- The insiders card says when a company files as a foreign private issuer (20-F and 6-K, like ASML), whose insiders file no Form 4 with the SEC, and when no insider bought or sold in the past year.

## 21 Oct 2026 (PR 116)

- Screener: your methodology's classes run on every company in the S&P 500 and the Nasdaq-100, with the filings' own figures. Each class lists the companies it would take, the largest first, and the companies one criterion short show which criterion failed. The list is read a share at a time each morning and kept fresh weekly.
- Top funds: the latest 13F filings of nineteen long-term managers (Berkshire Hathaway, Akre, Fundsmith, Himalaya, Pershing Square, Baupost and others), ranked by how much of each your classes would own and by the overlap with your book. Each fund shows what it bought, added to, trimmed and sold in the quarter, and its largest positions.

## 21 Oct 2026 (PR 115)

- Company page: Insiders, past year. What the company's directors, officers and largest holders bought and sold on the open market, from their Form 4 filings at the SEC, under Peter Lynch's line: "Insiders might sell their shares for any number of reasons, but they buy them for only one: they think the price will rise." Bought, sold, the net, how much of the selling was under a plan set in advance, and every trade as a card. An insider's purchase in a company you hold or watch is an alert on Notifications.
- Company page: Short interest, from FINRA's twice-monthly file: the shares sold short as a share of the shares outstanding, days to cover and the change since the date before.
- Methodologies can now name four more fields: insider net buying and insiders buying over the past year, short interest and days to cover.
- Earnings: in the days before a company reports, the move the options price for the results (the at-the-money straddle, from Cboe's delayed quotes) on its calendar card and on its company page; after the results, the report sets it beside the move the shares made.
- Macro and Calendar: the economic calendar, the next six weeks of the Fed's rate decisions, the jobs report, CPI, PPI, job openings, GDP and PCE on their publishers' own dates, each with the last reading the app holds.
- Macro: What the markets bet on. The chance of a cut, a hold or a hike at the Fed's next meeting from Kalshi, and of a US recession from Polymarket, as their prices stand.
- Setup: add PortfolioOS to ChatGPT as well as Claude, with the same address and sign-in, guided step by step.

## 20 Oct 2026 (PR 113)

- Theses: the Thesis Hunter looks for what bears on each thesis once a week instead of every day, to keep the cost on your key down. Hunt now on a thesis still runs one at any time.

## 20 Oct 2026 (PR 112)

- Theses: Added to the thesis sits right under Add to thesis, in the right column, as a list rather than a grid of cards.
- Theses: Export as PDF on every stock and market thesis. The file carries everything on the page: the thesis, its pillars read today, what to watch, kill signals and triggers, your valuation per share, the latest results, the charts and pictures, Added to the thesis and Added by Thesis Hunter, with the PortfolioOS mark on every page and where to try the app. It holds no amount of money, so it can be sent to a friend.
- Theses: the Thesis Hunter. Each morning, and when you open the app, it looks for what bears on each of your theses in your own newsletters and podcasts and, on a Claude key, on the web: research, data, news, charts and pictures, each marked as backing the thesis, challenging it or an update, with its pillar and source. They show under Added by Thesis Hunter on the thesis, with Hunt now and Dismiss, and each new find is an alert on Notifications, a challenge as a warning.
- Notifications: turn on notifications for a phone or browser. After each US close, one notification recaps what fired that day, the three most pressing named and the rest counted, amounts masked; nothing new, nothing sent. Send a test shows it working. On an iPhone, add PortfolioOS to the Home Screen first, as the card says.
- Notifications: with nothing to tell you, the empty state sits centred across the card instead of in a narrow column on the left.
- Dashboard: the day tile's move is green when the book is up and red when it is down, the percent and the amount alike.
- Dashboard and Performance: the Net worth card's figure sits centred in the card, larger, with no empty space under it.

## 20 Oct 2026 (PR 111)

- Podcasts: follow the shows you listen to on Setup's new Podcasts card, All-In with Chamath, Jason, Sacks & Friedberg to begin with. Each new episode's transcript on podscripts.co is written up on your own model each morning and when you open the app: what was said, the points that touch your holdings, and what it means for your holdings, watchlist, theses and methodology, naming the rules it touches. The past fortnight's episodes are on At the Close after What happened. Only the write-up is kept, never the transcript.
- Theses: your own Claude can add charts and pictures to a stock or market thesis through the connector (write_thesis): a chart from the figures it gives, drawn by the app with a table view, or a picture from a public web address, each with its source. They show under Charts and pictures, marked as added by Claude, each with Remove.

## 20 Oct 2026 (PR 110)

- Trades: Realised by holding runs across the page under both columns, its tiles laid out wide on a laptop, so it no longer sits alone beside empty space.
- Performance: no card says the same thing twice. The small Alpha tile is gone, since the Alpha card below carries it; in its place a Sortino ratio tile, the year's return per unit of downside swing, a figure any methodology can now name (`sortino` in the ontology). The risk grid leaves out what another card on the page already shows (Return when Returns by period is on, Volatility and Beta when the methodology has their tiles, Worst fall beside Good and bad days, Max drawdown beside the drawdown chart) and says where they are. The look-through card keeps its table and drops the bar chart that repeated it.
- Holdings: the class groups no longer list the unclassed holdings twice, under Cash and under No class yet. Where the money is drops the currencies tile, which the Currencies tab draws, and lists the accounts only when there are several.
- Trades: the statistics row leaves the average win and loss to When you win and when you lose, and that section no longer repeats the share of sales won.
- Company news and reports: twelve cards before Show all, so the last row is full at two, three or four across.

## 20 Oct 2026 (PR 109)

- Newsletters: the StockMKTNewz Daily Recap comes through the same Gmail forward as your other newsletters. Subscribe with your Gmail; the filter made on Setup's Newsletters card always carries its sender, shown in the filter's list, and the last week's prompt forwards its recent issues too. It opens What happened today on At the Close on its own, apart from the Newsletters, with its writer and sign-up page named. A filter made before needs opening in Gmail once more to add the sender.
- Company: the Brief is the company now, in parts: the week's headlines and filings, the last and next results and your thesis on file, and for ten days after the results the report after them with how the stock took it, beside the headlines rather than in their place.

## 20 Oct 2026 (PR 108)

- Earnings: after the results, How the stock took it: the move from the last close before the results to the close of the first session that traded on them, beside SPY's over the same sessions, and, on a Claude key, why, from that day's reports with each page named (a company declining to confirm next year's growth, guidance against what was expected). An after-the-close report gets it after the next session's close.
- Company: a page for every holding and watchlist company, opened from its ticker on Holdings (the donut list, the positions, the class groups, the heat maps), the watchlist, Earnings, Theses and Trades. It carries the price and the next results, a brief (the report after the results, with how the stock took it, for ten days after them; else the week's headlines), key figures from the filings, the price over a year, the valuation metric over five years, the quarters, years and per-share figures as columns, revenue by segment and geography, your thesis and record, and the week's news.

## 20 Oct 2026 (PR 107)

- Newsletters: the StockMKTNewz Daily Recap is each person's own. Subscribe with your newsletters address and its issues are read as yours, no Gmail filter needed; the copy the app's inbox receives is shown only to the operator.
- Theses: the Valuation calculator is smaller, its metrics folded under one row that opens when pressed, and the DCF sits under it at full width.
- Theses: the chosen valuation metric over five years beside the calculator: each week's close over the trailing figure known that week, the five-year median, and today against the low, median and high. Tabs show P/S, P/GP, P/E and P/FCF; a forward metric or a DCF shows its trailing twin.
- Notifications: a holding or watchlist company near its five-year low on the metric chosen in its Valuation calculator (within 5%, with two years of history at least) is an alert, checked twice a day and emailed.
- Setup: the filings read covers the watchlist too, up to 25 companies, and keeps five years of quarterly figures per share.

## 20 Oct 2026 (PR 106)

- Trades: Where the profit came from, a waterfall over the chosen window from capital gain, realised P&L, dividends received, taxes, fees paid and other transactions to the total profit, each with its figure, and a table view. The total is the account's own change less the money put in or taken out, so the bars always add up.
- Trades: fees and taxes. Commission, tax on trades, tax withheld on dividends and other fees over the window, the fills' costs as a share of the money traded, and the holdings that cost most. Each fill shows its commission and tax. A statement without them says to tick Select All in the Flex query's Trades section.
- Setup: Add your history since the start gives the dates to type in IBKR, worked out from the first day the app holds, in a table for this run and the one before, and says how to fix a year already uploaded.

## 19 Oct 2026 (PR 105)

- Performance: every card is live in market hours. The page asks for today's prices every 30 seconds and lays them on the value series and the benchmarks, so the tiles, the IRR, alpha, the returns by period, the growth chart, the risk figures, the good and bad days and the drawdown include today; after the bell they hold the session's close, badged with its date.
- Performance: Alpha, a large card after the IRR: Jensen's alpha a year against the methodology's first benchmark (else SPY) over a chosen period, its 95% interval, the t statistic and two-sided p-value, beta, R², the equation with the window's numbers and the returns as dots under the fitted line. An Alpha tile sits beside Worst drawdown and opens it.
- Every row of figure tiles is full: four to a row on a laptop, a short last row shared out across the width, an odd last tile across on a phone.
- At the Close: the freshness badge follows the last closed session, not the book's statement date, and until your Claude has written that session's recap the title says it is being written.
- At the Close: Where it comes from is gone; the recap source is chosen on Setup's Newsletters card.
- Newsletters: a newsletter's pictures are placed by the person's model under the points they show, advertisements, logos, promotions and pictures no point is about left out. A recap read before this is read again once on a model.
- Newsletters has no page of its own: the address, Gmail's forwarding, the filter, the last week's backfill, the senders and where the recap comes from are on Setup's Newsletters card; /newsletters opens it.
- The SEC EDGAR contact is on Setup's Company filings card only; Research links there when none is set, and the Settings menu is Setup and Customise.
- Earnings: After the results picks the company with small chips, like Post-earnings decks.
- A lone card on a grid's last row fills the row when it is the only card, and two cards on a three-column row share it evenly.
- Theses: All theses is a button with a background and a border, set apart from the market badge.
- Performance, with earlier years uploaded: the account's history starts on the day it was first funded, so the IRR and the return since inception show again instead of disappearing on the empty day before it.
- Performance: SPY and QQQ are kept for five years, so an account older than a year is drawn against them from its start, and their return since inception covers the same dates as yours.
- Performance: a figure the methodology computes over the account's value (a return, volatility, beta, a drawdown) reads the time-weighted series, so money added is never counted as a return.
- IBKR: transfers from another IBKR account or another broker (the Flex query's Transfers section) are flows on their own dates, like deposits. When a statement's own Change in NAV counts transfers its rows do not list, the upload and Performance say how much, over which dates, and to tick Transfers and upload that year again; a year uploaded again replaces what was kept for its dates. The IBKR guide on Setup lists Transfers.
- Trades: a column chart with many columns keeps each column inside its slot and its labels apart.
- Trades: Spread per rotation spans the section, taller, with the rotations under it; Realised by holding is a heat map, each holding sized by what its sales made or lost and coloured by the return on the cost of the lots closed.

## 19 Oct 2026 (PR 104)

- Performance: when the broker's ledger has dividends but no deposits or withdrawals, the IRR card says to tick Deposits & Withdrawals inside the Flex query's Cash Transactions section. The IBKR guide on Setup says that section's list is ticked kind by kind, and a deposit IBKR gives only in summary is now read.
- Setup: the Interactive Brokers card says from which day it holds the account's history, and Add your history since the start guides running the Flex query for each earlier year and uploading it, so Since start, the IRR and the time-weighted return begin at the account's first day. An earlier year that adds no days says so and leaves the book as it was.

## 19 Oct 2026 (PR 103)

- Dashboard: Today so far is a wide card washed in the heat map's colour for the day's move, the move large with the money beside it, how much of the book is up and down as a split bar, and the holdings that made and cost the most. The tiles around it fill every row.
- Every page: the top right says Market is live in green with a blinking dot while the US market is open, with the countdown to the close in its last two hours; before the open and after the close it says what it said on the Dashboard.
- How your book is doing and What each holding made: every holding has a tile in view, however small its weight.
- At the Close: After the close opens with your Claude's recap from the web, its summary and every point with its page, instead of the one-line overview; What happened no longer repeats it. Company news and reports shows the newest seven, with Show all for the rest.
- At the Close: Where it comes from opens from a proper row again, its arrow on the right inside the card, as the other folded rows.
- Earnings: under After the results, the companies to choose from sit above the report they open.
- Performance: the IRR card has its own period, 3M, YTD, 1Y or since the start. The history now grows: each Interactive Brokers fetch or upload keeps the account values and the ledger from before it, since a Flex query covers a year at most, and a past year's statement uploaded on Setup lends its earlier history to the book. Growth of 100 draws QQQ beside SPY.
- Dividends: the Each payer rows sit on one grid, the figures right-aligned and the scores in one column.
- Watchlist: Watched shows two cards to a row, each with its whole symbol; Remove wraps under it when there is no room.
- Research: the Template section is folded, its name and number of sections on the row.
- Reviews: a kept schedule shows as it stands, with Replace to open the form; the form shows at once only when there is no schedule yet.
- The Markets screen is named Macro, in the menu and on the page; the methodology's own section name leads the line under the title.
- Macro and the Dashboard: a range bar shows a better end only where the indicator has one. The gold to silver ratio, the yields, the dollar and the yield curves (10y less 2y and 10y less 3m) show none, for the level and for the change; the curves say that below zero is inverted. The VIX reads lower as better, an index higher.
- A card left alone on a grid's last row sits centred: on Macro, Dividends, the theses' decks, the methodology's classes and library, Trades and every grid of cards.
- Macro: the US dollar index is drawn once, the one-year chart across the page; the smaller copy beside the tax receipts is gone.
- Performance: deposits and withdrawals are read from the Interactive Brokers Flex statement's Cash Transactions section, so the time-weighted return, the IRR and the chart no longer count money you added as a gain. The Flex guide says so; with no flows on file the IRR card says where they come from.

## 19 Oct 2026 (PR 102)

- Reviews: under the embedded deck and PDF report, the verdict, returns and sections that repeated them are gone, on the Reviews screen and on a review's own page; the Last weekly and Last monthly as sent follow straight after. A review with no deck or report kept still shows its sections.
- Dashboard and Performance: every card that states a figure carries the Markets range bar: net worth on its year's low and high; the year's return, the return since the start and the distance below the high on a scale; volatility, beta, Sharpe, Calmar and the drawdowns on theirs; a methodology figure a rule tests on a track from zero with the rule's limit as a tick. While the market is open the marker moves with the live figure.
- Performance: an IRR card. The money-weighted return since the start, a year or over the period, beside the time-weighted return, with a line saying whether the timing of deposits and withdrawals helped or cost, and a short note on what the IRR means, what went in and what the book is worth now.
- Top bar: an account menu with your initials, opened on hover like Settings: Account settings (sign-in, password change for an email account, theme, sign out), Profile, Help and support, Privacy, Cookies and a Dark, Light or System switch. A portfolio selector sits left of Settings: with one portfolio it names it ("Hamza's IBKR"), with several it offers all of them together, one alone, or the ones ticked put together.
- New pages: Account settings, Help and support, and a public Cookies page listing every cookie and local note the app keeps. The privacy page names the news feeds and the cookies.
- The menu bar has no More: every screen sits under a category (Portfolio, Markets, Research, Rules and reviews), opened on hover, the Dashboard and Notifications alone.
- At the Close: After the close draws each holding as a card in a grid, the largest move first, with its move, the reason and the page, and a ring on a move that was alerted. A new Company news and reports grid follows it: the past week's headlines and SEC filings for every holding and watchlist company, newest first, each card opening the article or the filing, with the post-earnings reports the app wrote.
- Dashboard: the largest holding and the VIX tiles are gone. How your book is doing is a heat map, each holding sized by its weight and coloured by its move, with its move, points and money on the tile and the holding-by-holding list folded under it. The S&P 500 heat map comes before the drivers, and what drove the S&P 500 and QQQ is drawn inside the map's card, as tiles in its colours.
- Holdings: a Portfolio P/E card after the positions. Today's P/E of the listed holdings, weighted by value, with its earnings yield and the S&P 500's beside it; where it sits on the year's low to high, coloured; the year as a line with the median, low and high marked; and each holding's own P/E by weight. The year reads each holding's closes against its trailing earnings as they were known then, from the filings; a holding without them is named, and the range appears after the next filings read.
- Holdings: What each holding made, past year or since you started. The total, then every holding as a heat map, sized by what it made or lost and coloured by its return, with its dividends and whether it was sold; the table lists them all, and interest and fees sit on a line of their own.
- Holdings: the methodology's Diversification section is gone where it only repeats Concentration and Sectors. Where the money is drops the net worth tile, the By asset class list (the donut stays) and Themes, looking through funds; Sectors now looks through funds instead, a fund's companies counting toward their own sectors.
- Holdings: one large composition card replaces the separate donuts. Pill tabs switch it between Holdings, Classes (the methodology's), Asset classes, Sectors, Regions and Currencies, each with the donut on the left and the list with its share and a bar on the right; the tabs follow what the methodology shows.
- Performance: Good and bad days. The share of days the book rose, its best and worst day, the longest run up and down, and the book's days beside SPY's: how often it beat SPY, on SPY's up days and down days, with its capture on each.
- A Dividends screen: the yield and the yield on cost, the dividends a year and a month with their growth, yield and payout by holding, where the income comes from, a safety score per payer (the app's own four tests from the filings: the payout, years of raises, five-year growth and a yield not stretched), average growth, the payments due in the next twelve months, those received in the last twelve, by company and by month year on year. It is shown when the book pays dividends or the methodology reads them, and a methodology about dividends or income puts it right after Holdings, as a phone tab, with its tiles on the Dashboard unless the methodology's own headline already shows the dividends.
- The Interactive Brokers Flex guide asks for the Cash Transactions section: the dividends, the tax withheld on them, interest and fees, read for the Dividends screen and What each holding made. A statement without it shows the projected figures from the filings and says what to tick.
- Stealth mode: the eye beside Settings (and in a phone's title bar) hides every money amount on every screen, kept on this device until it is pressed again. Percentages, share counts and prices quoted without a currency stay.

## 19 Oct 2026 (PR 101)

- Notifications: Dismiss takes the row off the list the moment it is pressed, and Mark all read marks every alert read at once (the dot goes, the row reads quiet, the subtitle says nothing is unread), the vault written behind them; a refusal brings the row back with its sentence. Each alert marked read is kept by id, so one that fires later the same day is unread. A dismissed alert no longer came back on the next page until Drive's listing caught up: a file just saved reads back as written.
- Community: the card a person shares follows their files by itself. A thesis written or changed on Theses or over the connector, a document folded in, the morning or evening statement or a new methodology rebuilds it and replaces it in the registry when it differs; a book that cannot be read keeps the weights last shared. The card says when it last changed and which theses.
- Followers are told: when someone a person follows changes a thesis (by symbol or title) or a weight moves by a point or more, or a holding comes or goes, it is an alert on Notifications (laid on when the app is opened and at the twice-daily check, which emails it) and a line on the Community rows for a week. A day's drift in the weights is not a change.
- Theses: the market theses, the holdings and the watchlist are drawn as a grid of cards (the symbol and weight, the name, the class, the thesis date, pillars, kill signals, stage, valuation and latest results, the verdict pill), two to a row on a phone and three on a laptop, instead of a list. "Fill the theses in with your own Claude" sits above Market theses, folded shut; the arrow opens it.
- Earnings: the Coming up list is gone, since the calendar shows every date.
- Markets: every card that states a figure is coloured and placed on a range (the VIX, the yields, the curve, the dollar, oil, gold against silver, the S&P 500 earnings yield, the recession probability, the mortgage rate, inflation, unemployment, sentiment, fear and greed on a theoretical scale; any other indicator on its own year's low and high; a change on a symmetric scale): a gradient track, a marker where today's reading sits, the low and high at its ends, which way is better, and the rule's limit as a tick when a rule tests it, the card's tone following the rule's reading.
- Every list of things is a grid of cards: holdings, the watchlist, fills, lots, rotations and companies traded, people on Community, decks, studies, Decision Log entries, notices, reviews, newsletters and senders, triggers and rules on a holding, options, properties' comparables, fixed-income lines, accounts, documents. Settings rows, forms and label-and-value rows stay rows.
- A menu at the top of the page replaces the sidebar from 1024px: the brand at the left, the screens in a row (five, seven from 1280px, nine from 1536px; the rest under More), and Settings at the right, a menu opened on hover with Setup, Customise, Newsletters and the SEC contact as its tabs. The background blends the accent into the surface behind a blur. Sources & settings is gone: what each source holds, and since when, is on Setup, where the Interactive Brokers card now says Current or Stale; on a phone the More tab opens Settings with the same tabs.

## 19 Oct 2026 (PR 100)

- What happened today, on At the Close, shows the StockMKTNewz recap's stories without its closing "Some new YouTube videos you need to watch" part: the pictures from that heading on are left out, a play button is never kept as a picture, and the digest's points leave the newsletter's own videos out.
- The connector's get_theses reads the theses from the person's own vault, so a thesis their Claude just wrote reads back at once instead of "no thesis yet"; a vault that cannot be opened is said so, never shown empty. Its stock text now carries the record: each kill signal and trigger with today's reading, the price levels, the own valuation and the Valuation calculator's method and stage.
- write_thesis also fills a stock's kill signals and triggers, its price levels and the Valuation calculator (the method, the multiples, the forward figures and a note laid on the filings' seed, or a bear, base and bull per share directly), which become the record's own valuation; a stock not held is added to the watchlist with its thesis and what to watch. The Theses screen's prompt asks for all of it; nothing else moves.
- The filings' figures: a share split the later filings restated (Booking's 25-for-1) puts every earlier per-share figure and share count on today's count, so the trailing EPS and the P/E are on one basis; a price in another currency than the filings' (an ADR in dollars, earnings in kroner) is carried into the filings' currency at the day's rate, named in the note, one listed share taken as one filed share, and the Valuation calculator and the DCF seed at that rate too (a rate that cannot be read leaves them as none and says so); a 10-Q's trailing twelve months is no longer read as a fiscal year, so Amazon's years are the 10-K's; a broker's total revenue is read from its net revenue line (Interactive Brokers) rather than commissions alone; a balance last filed before the trailing period (Uber's non-current securities, 2019) is read as none, with the quarter it was last filed at, instead of as cash.

## 19 Oct 2026 (PR 99)

- The screen after Notifications is named At the Close (it was After-Market Close Analysis); its address and contents are unchanged.

## 18 Oct 2026 (PR 98)

- Theses is split into Market theses and Stock theses, the latter as Holdings and Watchlist. A market thesis is what you believe about rates, a cycle or a theme, with pillars read every day on the market indicators (the ten-year yield, CPI, the VIX, the dollar...); each opens on its own page, with its indicators, and is written here or by your Claude.
- Your own Claude fills the theses in through the PortfolioOS connector: the Theses screen carries the prompt to paste (the holdings owed a thesis named), with the steps; Claude reads each holding's figures, filings, class and rules through the connector and writes the thesis, its pillars, pathway and watch items, which land here marked as written by Claude for you to keep or change. Two new connector tools: get_theses reads them, write_thesis writes one; nothing else moves (no valuation, DCF, record, class, alert or order).
- Add to thesis, on every stock and market thesis, in the app: choose a report, a transcript, a filing, a note or a table (PDF, text, Markdown, CSV or JSON) and your own model reads it against the thesis and your methodology (its classes, its rules and where the holding stands under them today) and proposes what to change: a paragraph, the pathway, a pillar or a watch item, each shown highlighted with what it was and what it becomes, and why, naming the rule or class it answers; the class, a breach and a pass stay the app's to decide. You approve, deny or amend each one; Apply writes the kept changes and the document under Added to the thesis (the source, its date, what it said, what changed). A figure the document does not print is named before you approve; a change to words the thesis does not have is left out and said so. The document is read once on your key and never kept.
- Community, a new screen after Theses: follow other people's theses and see their portfolios. Everyone who shares on this deployment is listed under a handle, with their theses in their words and each holding's weight of their book in percent, as a donut and a list; follow or unfollow with one press. Share your own card, or stop (which deletes it): what goes out is listed in full, and never an amount, an account, your net worth, a valuation, a DCF, a decision, an alert, a statement or what was added to a thesis. The privacy and terms pages say so.
- The Setup card for Claude and the connector's guide say what your Claude may now write: a thesis and a newsletter proposal, each left on its screen for you to review.

## 18 Oct 2026 (PR 97)

- After-Market Close Analysis is in the sidebar, right after Notifications (and on the phone's More list); the row on Notifications is gone.
- A screen added to the app after you saved a screen order on Customise now lands where the skeleton puts it (After-Market Close Analysis right after Notifications), not at the bottom of the sidebar.
- The Dashboard's session cards keep one title whether the market is open or shut, since the badge beside it says which: How the US indices are doing, How your book is doing, What is driving the S&P 500 and QQQ. The book and drivers cards open with a line saying what a point (pt) is; the book card's footnote keeps only what that line does not say.
- The Caps at today's prices card left the Dashboard; the weights against caps stay on Holdings and Methodology.

## 18 Oct 2026 (PR 96)

- A methodology section whose figures read the market indicators (Macroeconomic Analysis & Time-Horizon Framework, Long-term supply-side indicators) is drawn on Markets alone, which is named after it, and no longer repeated on the Dashboard while Markets is on.
- The "unread notifications" link left the Dashboard; the badge on Notifications in the sidebar and the tab bar carries the count.
- After the close, What happened today and the Newsletters moved from the Dashboard to a new page, After-Market Close Analysis, reached from a row at the top of Notifications (not in the sidebar). The Dashboard's session keeps the indices, the book's day, the drivers, the heat map and the movers. The old /markets-today link lands on the new page, and the tour's "Why each holding moved" step opens it.

## 18 Oct 2026 (PR 95)

- Each weekly and monthly review is now also a PDF report on the HCMP year-to-date review's skeleton and look: a white cover with the kicker, the title, eight tiles (the return, the first benchmark, the gap, year to date, the verdict, the rules followed, the trades, the alarms), the bottom line and the verdict box, then one chapter a page, numbered: performance (returns and the two cumulative charts, what the numbers mean, the month in numbers), attribution (contribution bars, by class, by holding), trades, methodology adherence (the pillars, the rulebook, the book by class and by holding as donuts, every weight against its cap, the holdings and theses), risk (the correlation heat map, the markets), news and newsletters, your questions, the action plan (the alarms numbered, coming up) and the appendix. Inter, black on white, blue kickers, the deck's palette, status dots. The email attaches it first, Reviews embeds it from your Drive and downloads it, and a Google Drive vault keeps the last one per kind.
- Questions for every review: on Reviews you keep up to six questions about your own portfolio (is the book too concentrated, what did the options add), and every review answers each from its own figures on your key, as a section, a slide and a chapter. A question the model could not answer says so.
- The commentary is three paragraphs again: the model had room for 600 tokens and was asked for 110 words, so a model that thinks first ran out mid-sentence; it now has room for 4,000 and is asked for 180 to 260 words, kept as paragraphs on the screen, the slide and the cover. A commentary cut short is kept and noted.
- Newsletters dated by their arrival alone (the ones your Claude forwarded on a Sunday carried no readable Date line) are dated again at the next inbox read, from the forwarded header, else the date the newsletter prints at its top, so the review's newsletters section fills for the week they were written in. The reviews screen shows the last weekly and the last monthly, each with its deck and its report.

## 18 Oct 2026 (PR 94)

- The StockMKTNewz Daily Recap comes with the app: the app's own inbox subscribes to it once, and each weekday evening its screenshots of the day's stories open "What happened today" on everyone's Dashboard, read on each person's own key, with its writer's name and sign-up page. Nobody has to subscribe or make a Gmail filter for it; a person who forwards it anyway is shown it once.
- On a weekend the recap shown is Friday's: the weekend issues carry no pictures and go under it, and the section is dated.
- The recap guide, the Newsletters screen, the Setup card and the privacy page say so.

## 18 Oct 2026 (PR 93)

- What happened on the Dashboard is now two sections. "What happened today" opens with the day's recap newsletter (the StockMKTNewz Daily Recap the app guides you to, or any recap you forward), its screenshots of the day's stories first and the opening performance pictures (the heat map, the indices, the movers) folded away, since the Dashboard draws the session itself; the week's earlier recaps sit under a row, then your Claude's recap and the sources. "Newsletters" holds the week's other newsletters by theme, with a switch to the day's; the week is the default, since newsletters do not come every day.
- Each theme is ranked by how close it is to your theses (the holdings its points name and their share of the book), then by the newest. A newsletter you have not opened is marked unread, with the unread count on each theme and on the switch; opening it marks it read, on this device and in your vault.
- A newsletter is dated by its own date (the forwarded header's for one you or your Claude forwarded by hand, the email's own otherwise), not by when it arrived, so a Friday recap forwarded on Sunday is still Friday's: the weekly and monthly review now count newsletters by that date, and when newsletters are on file but none is dated in the review's period the Sources and method slide says so, instead of "None forwarded".
- A newsletter's pictures keep the newsletter's own heading or caption before each run, and up to forty are kept, enough for a daily recap's screenshots.

## 18 Oct 2026 (PR 92)

- What happened on the Dashboard is no longer a block of text: each newsletter is filed under a theme (your holdings, markets and macro, tech and AI, geopolitics, other), ranked by how much it bears on your theses (the holdings its points name, their share of the book, the theses among them), and the themes are closed rows you open, the first newsletter open inside each and the rest a press away. Your Claude's recap and the sources sit under their own rows.
- Newsletters now keep their own pictures: the charts and screenshots a newsletter carries (the StockMKTNewz recap is made of them) are read from its HTML when it arrives and drawn on the Dashboard and on Newsletters from the newsletter's own host, with no referrer. Trackers, icons and logos are left out; the email is still never kept.
- The Newsletters screen moved under Sources & settings: it is set up once and then runs by itself, so it no longer takes a place in the sidebar or the phone's More list.
- The embedded Google Slides on Reviews, Earnings and Theses no longer scroll the page to the top of the section on each slide: the page is put back where it stood.
- A weekly or monthly review's news is read item by item: a date written in any shape is read, a line too long is clipped, and an item without a date or a page is left out and counted, instead of one such item costing the whole week's news; the model is given room for the whole answer. The commentary counts every text block of the answer and is asked for once more when it comes back empty, and the note says what came back.

## 18 Oct 2026 (PR 91)

- Newsletters shows that the forwarding works. Hamza (18 Oct 2026) had
  the app confirm his address and made the filter, and nothing showed until
  the next newsletter would come. Now a confirmation Google gave is kept in
  the vault's `forwarding` file (`confirmForwardingInto` in
  `lib/inbox-run.ts`: one record per address with when Gmail asked, when
  Google agreed and how, never a link or a code) and shown from the first
  paint on Statements and Newsletters, today and after; Google's page is
  not opened again for a request already confirmed. Newsletters opens
  with "Is it working": the address (confirmed, or verified because
  Gmail's filter forwarded to it), what Gmail's filter forwarded and since
  when, what came by hand, and what was read on the person's key
  (`forwardingProof` in `lib/newsletters.ts`; each digest now carries
  `via`, the filter or by hand, and the Read list says which). While the
  page is open its watch also reads a newsletter the minute it lands and
  refreshes the page, so a forwarded one is the proof. A new step 3, See
  it work, says a filter forwards only what arrives from now on, how to
  forward one by hand to see a read at once, and how to fill the last
  month through the person's own Claude. Times read in Athens time
  (`athensMoment` in `lib/time.ts`).
- The last week arrives at setup (Hamza, 18 Oct 2026: visible proof as
  soon as it is set up). The app never reads anyone's Gmail and a filter
  forwards only new mail, so the prompt the person pastes into their own
  Claude in step 2 now also forwards the last `BACKFILL_DAYS` (7) days'
  newsletters from the senders it found to their address, where the page
  reads them within a minute; step 3, Start with the last week, carries a
  second prompt with the kept senders (`backfillPrompt`) for anyone who
  ran the finder earlier. Such newsletters are counted as forwarded by
  you.

## 18 Oct 2026 (PR 90)

- Gmail's forwarding request is confirmed by pressing Google's Confirm.
  Google's confirmation link opens a page with a Confirm button (Hamza's,
  18 Oct 2026); the app followed the link, read the page as a confirmation
  and showed a check mark while Gmail still showed the address unverified.
  Now `readConfirmPage` (`lib/inbox.ts`) reads Google's page: on its
  Confirm form the app submits that form once with the page's own fields
  and cookies (`confirmForwarding` in `lib/inbox-run.ts`), and says
  Confirmed only when Google's page says so (Confirmation Success, already
  verified). When Google wants the press from the person, Statements and
  Newsletters show a Confirm in Google button that opens Google's page in a
  new tab for that one press (`ForwardingFallback`), with the reason and
  the code when Gmail printed one; never a check mark Google did not give.

## 18 Oct 2026 (PR 89)

- Gmail's forwarding request is confirmed again. Google's confirmation email
  now links to mail.google.com (Hamza's of 18 Oct 2026), and the reader
  knew only the older mail-settings.google.com link, so the request was
  found and nothing confirmed, with nothing said. `forwardingLinks(text,
  html)` in `lib/inbox.ts` knows both hosts and a link under `/u/0/`, reads
  the email's text, every `href` with its entities decoded, then the HTML
  (the parser gives an HTML-only part inside a multipart email no text), and
  never the cancel link; `confirmForwarding` opens that one kind of link and
  no other. When no link can be read the screen says so and what to do,
  never a bare line, and a link Google answers with a sign-in page is
  reported, not taken as confirmed. The same reading gives a newsletter
  whose words are HTML alone a text to digest.

## 18 Oct 2026 (PR 88)

- The app now serves a classic `favicon.ico` (16, 32 and 48 px, rendered
  from the app icon by `scripts/make-favicon.mjs`) beside the SVG icon, and
  the icon files are no longer marked noindex. Claude draws a custom
  connector's icon from its domain's favicon through Google's favicon
  service, which reads a `favicon.ico` and skips files it may not index;
  with only an SVG and a noindex header, the PortfolioOS connector showed no
  icon. When it appears depends on Google's and Claude's caches, not on
  reconnecting the connector.
- Gmail's forwarding request is confirmed by itself while the Statements or
  Newsletters screen is open: the page watches the inbox every half minute
  (for twenty minutes after it opens or comes back into view), confirms
  Google's request the moment it arrives and says so, and Gmail then shows
  the address as verified with nothing typed. Before, the request waited
  for Check the inbox now or the morning refresh. A link Google reports as
  already confirmed now counts as confirmed instead of as a refusal.

## 18 Oct 2026 (PR 87)

- The Gmail filter for newsletters is written for you. On Newsletters, a
  prompt to paste into your own Claude has it read your last 30 days of
  mail (through its Gmail connector) for newsletters that keep coming about
  investing and hand them to PortfolioOS through the connector's new
  `propose_newsletter_senders` tool; they appear on the screen as proposals
  you keep or remove, one by one, and a removed one is not proposed again.
  Senders can also be added by hand, as addresses or whole From lines, and
  the list stays yours after the filter is made: remove a kept sender, keep
  a removed one again or add more at any time, then Open in Gmail again. The
  kept senders make the filter, and Open in Gmail opens Gmail's own Create
  filter box with them filled in: tick Forward it to, click Create filter.
  The daily recap's step opens Gmail the same way. Nothing is created in
  Gmail from the app or by Claude.
## 17 Oct 2026 (PR 86)

- Gmail's forwarding request is confirmed by the app itself: Check the inbox
  now, Check for newsletters now and the morning refresh open Google's link
  in the confirmation and say so, so nothing is typed into Gmail. A
  confirmation that carries only a link (no code in its subject) is known
  as one, never counted as a newsletter and set aside; when Google does not
  take the link from here, the code and the link are shown to finish by
  hand. The Newsletters button is called Check for newsletters now, as its
  guide says.

## 17 Oct 2026 (PR 85)

- A page left open keeps up by itself: every five minutes while it is in
  view, and when it comes back into view after longer, it asks the server
  for the page again, so the evening statement, a recap written after the
  close, a new alert or a report read in the background appear without a
  reload.

## 17 Oct 2026 (PR 84)

- On a phone the market countdown sits under the Dashboard's title instead
  of beside it, so the title and the subtitle keep the full width; on a
  laptop it stays top right.

## 17 Oct 2026 (PR 83)

- The app's name reads PortfolioOS in the sidebar, on the sign-up page and
  on the privacy and terms pages, as written and no longer in capitals
  (`brand-mark`).

## 17 Oct 2026 (PR 82)

- The app is called PortfolioOS, one word, everywhere it names itself:
  titles, Setup, the guides, the emails' sender, the Claude connector. The
  folder in a person's Drive keeps its name, Portfolio OS, so nothing moves.
- Privacy and Terms: two public pages (`/privacy`, `/terms`) say where a
  person's money stays, what the deployment keeps, what the app sends out
  and to whom, how to remove everything, and that the app is read-only and
  not advice. The sign-in and sign-up pages link them, and Google's consent
  screen can, which publishing the OAuth app requires.

## 17 Oct 2026 (PR 81)

- Every page carries Google Search Console's ownership tag for the home
  page, which Google's brand verification of the OAuth app asks for.
- Interactive Brokers: the evening run asks IBKR for the Flex statement
  again when the one on file is older than the session that closed, and
  keeps it when it is newer, so a trade made today shows the same evening
  once IBKR has made the statement, else the next morning. Setup says the
  statement is fetched every morning and after the close.
- Connector: the PortfolioOS server now tells Claude its icon (the app's
  own, as PNG and SVG) and its website, so the connector shows the same
  mark as the app's favicon where the client draws server icons.

## 17 Oct 2026 (PR 80)

- After the close: the recap your Claude writes now follows the close
  instead of waiting for the evening newsletters. The close is read at
  16:20 New York and the recap is written right after (a run at 16:35, and
  the app writes it when you open it after a close that has none yet).
  Until then the card says today's recap is being written, offers to write
  it now, asks the page again by itself, and folds the close before away
  rather than showing it as today's.

## 17 Oct 2026 (PR 79)

- After the close, every live card keeps the last session's prices instead
  of going back to the statement: net worth, the session's move, the
  headline tiles a price moves, the book holding by holding, the caps, the
  return chart's last point, the year strip and the positions table on
  Holdings all hold Friday's closes through the weekend, and their badge
  reads "Live · Markets have closed · 16 Oct", the session's own date, never
  the statement's. The page asks for prices once when it opens while the
  market is shut, once more right after the bell, then every ten minutes.

## 16 Oct 2026 (PR 78)

- Earnings: a company that files its quarters on 6-K (ASML, a 20-F filer)
  now has its earlier quarters read from their own releases, a few each
  run, until the quarterly series on the deck reaches eight quarters. Each
  release is found on the SEC's filing list in the results window after the
  quarter's end, tested as text, read on your model and checked against the
  printed figures; the report says how many are in and what still waits.
- Decks: the cash slide of the reaction deck, and every slide reading the
  years, no longer shows the last fiscal year twice for a company that
  files no quarters with the SEC; a deck kept before the fix drops the
  repeated column when it is next built.

## 16 Oct 2026 (PR 77)

- The first page: sign in with Google, Microsoft or an email and password,
  create an account, or try the demo. Sign-up, while the deployment has it
  open, is by Google or by email with a six-digit code sent to the address;
  the app's own accounts hold an address and a password hash and nothing of
  anyone's money.
- Welcome: the first page after signing up, outside the app. An email
  sign-in first connects its Google Drive, where the app keeps everything it
  builds; then who the app is for, where the money is reported (each place
  with how it connects, what it brings in, and what the app reads by
  itself), a few details, and the app built from the answers with what to
  do next, once. Pick what applies today; every input is added on Setup
  afterwards.
- Welcome, second part: once the app is built, what to give it, one group
  per step with why it matters: your rules, your money, your holdings (a
  few lines of thesis and your bear, base and bull per share for each
  listed holding), what the app reads (filings, the morning refresh,
  newsletters and the daily recap), then everything at a glance. Each step
  shows Setup's own cards and can be skipped; the last opens the app with
  the tour.
- Setup gains two cards: Theses and valuations (a thesis and a valuation
  per listed holding, with the folder on Theses a link away) and Newsletters
  and the daily recap (your address, the Gmail steps, what was read). The
  tour of your own app stops at both.
- A tour of your own app after it is built: Setup first, where each input
  goes, then the Dashboard, Notifications, Holdings and Customise, and back
  to Setup, where the Welcome answers are changed.

## 16 Oct 2026 (PR 76)

- Theses: the DCF calculator is now the Valuation calculator, after Brian
  Feroldi's Valuation by Stage. The app decides which of six stages the
  company is in from its filings alone (startup, hyper growth, break even,
  operating leverage, capital return, decline), names the rule and the
  figures that decided it, and lists the nine valuation metrics in the
  order of their usefulness at that stage. You estimate the bear, base and
  bull multiple on the per-share figures the filings supply (sales, gross
  profit, trailing and your own forward earnings and free cash flow, or the
  addressable market), the DCF stays inside it, and the method you choose
  becomes the holding's own valuation. You can set the stage yourself; the
  app then says it is yours. The stages, the tests and the matrix are in
  the ontology; a new field, capital returned, reads buybacks and dividends
  over free cash flow.
- Every post-earnings report and deck carries the stage read on the new
  figures, and the valuation slide draws the chosen metric's cases, the
  stage and every metric's use at it.
- The greeting shows every hour after the last one, whether the page was
  open, in use or closed in between, instead of after six hours without use.

## 16 Oct 2026 (PR 75)

- Earnings: the quarter's figures are read from the release itself before
  the 10-Q lands, and always for a company that files its quarters on 6-K
  (ASML, Novo). The release's documents are fetched from the SEC, stripped
  to text, read on your own model, and every figure is checked against the
  printed text; one the text does not print is dropped and named. The
  reaction deck's cover, the case in four points, the results against the
  quarter before and a year before, the KPIs by quarter (with the company's
  own measures: bookings, installed base, units) and the deep dive's record
  all draw them, and the Earnings screen's report shows them with a
  "Quarter before" column. The quarterly series grows with each release
  where the filings carry no quarters.

## 16 Oct 2026 (PR 74)

- Theses: a new screen, one folder per holding as HCMP keeps them in
  Drive. Each holding's page carries the thesis in your own words with its
  pillars (each tested on a figure of the ontology and scored on today's
  reading: supported, mixed, at risk or unread), the pathway and what to
  watch; the record's kill signals and triggers with today's reading; a DCF
  calculator by free cash flow or by earnings, seeded from the latest
  filings, computed as you type, with the WACC by terminal-growth grid and
  the reverse DCF, whose bear, base and bull become your valuation when you
  keep it; the latest results with both decks embedded; the study on the
  stock template, or the form to queue one; and the archive. "Still owed"
  lists what the folder lacks.
- Earnings: the post-earnings deep dive now follows the HCMP kit slide for
  slide, 31 slides: competition voices, the valuation history (P/E at each
  year end), the thesis and its pillars from Theses, your own DCF with its
  sensitivity and reverse DCF, and what changed since the last report. A
  new eleven-slide reaction deck (the quarter in four points, results
  against a year before and the guidance, KPIs by quarter, cash and the
  engine, highlights, kill signals and triggers re-scored, what changed in
  the thesis, the valuation after the results, the decision owed) is kept
  beside it as Google Slides and downloads from Earnings and Theses. Kill
  signals print today's reading.

## 16 Oct 2026 (PR 73)

- Dashboard: everything that can be live is live. The headline tiles a
  price moves (the largest holding, a weight, a gain) are recomputed in
  your browser every 30 seconds while the US market is open, on your book
  at the prices now; the positions table on Holdings moves the same way. Shut, a live card keeps its Live badge and says "Markets have
  closed" with the date beside it, never "Daily" or "At the close".
- Dashboard: the session's cards sit in one run under the chart: how the
  indices closed, then your book at the close right under them, After the
  close, What happened, what drove the S&P 500 and QQQ, the heat map and
  the movers.
- Dashboard: "Last session" is never blank. Until the session's read of all
  five hundred companies comes back, your holdings' own closes name the
  last session and its move, and the page asks again by itself until the
  cards appear.
- Dashboard: the year strip's SPY and QQQ sit on cards of their own, and each
  arrow runs card to card with the lead in points on it, so the arrows sit
  against the figures.
- Dashboard: CNN's Fear & Greed index on a gauge above On watch, after
  CNN's own: the five bands with the one the score sits in tinted, the
  needle and the score, then the previous close, a week, a month and a year
  ago, each with its band. Read with the market indicators every hour.
- Earnings: a post-earnings deck at the release stage (results out, the
  10-Q or 20-F not yet filed) is the full deep dive on the last filed
  figures, every slide of the HCMP skeleton, with the quarter's slide saying
  what it waits for; no more a six-slide skeleton with "no class" and
  "revenue n/a". A report read again that says the same thing keeps its
  deck instead of remaking it.
- Trades: the rotations, By company and Realised by holding show seven with
  Show all and Show the latest only, like the fills.
- Customise: dragging a screen follows the pointer. The rows are measured
  once when the drag starts, the others step aside, and the order is saved
  on the drop; a press is never a drag.

## 15 Oct 2026 (PR 72)

- Dashboard: a chart of the portfolio against SPY and QQQ, as the
  time-weighted return or the value (each benchmark then drawn as the same
  starting money in it), over YTD, 3M, 6M, 1Y, 2Y, 5Y or two dates of your
  own, switched on the chart; live while the US market is open, with today
  at the prices now as the last point. The choice is remembered on the
  device.
- Trades: "When you win and when you lose" (the average win against the
  average loss, in money and as a percent of cost, the ratio between them,
  what a sale earns on average, the best and worst, and each sale as a bar)
  and "Rotations" (each sale paired with the buys of other holdings it funded
  within ten days, judged by what each side did since, with the spread per
  rotation and what the moved money gained or lost against staying put).
- Trades: "By company" lists every company with a fill; each opens its own
  page with the price over six months, a year or five years and every buy
  and sale marked on it, the readout on a day showing the units, the price,
  the money paid or received and the broker's realised gain; the fills and
  the lots closed under it.

## 15 Oct 2026 (PR 71)

- Earnings: each post-earnings deck follows the HCMP deep-dive skeleton
  slide for slide (the case in four points, the template's sections in
  order with the filings' figures, the engine marking, the beta test
  against the benchmark, the classification test, the thesis, the kill
  signals, the position, the verdict, the sources), in the HCMP look. A
  slide that needs a study reads the latest one on Research. Reports
  already written get the fuller deck at the next read.

## 15 Oct 2026 (PR 70)

- Dashboard: the session (indices, drivers, heat map, movers, What
  happened) sits above Your book now; After the close follows the book.
- After the close, while the US market is open: says today's is written by
  itself about two hours after the close, offers to write the last close's
  now when it is missing, and folds the last close's recap behind a button.
- Dashboard: wider arrows on the This year strip.
- Holdings: the positions table fits a laptop without sideways scrolling
  (smaller type, tighter cells, a shorter weight bar).
- Markets: the US Treasury yield curve and the Major economies map carry a
  freshness badge like every other card.
- Dashboard: Methodology checks and Weights against caps are gone from it;
  the checks are on Methodology, the weights against caps on Holdings. The
  demo tour's third step shows Notifications instead.
- Dashboard: after the bell the top right says how long ago the market
  closed, for two hours, then "Markets have closed" and when they open; a
  live card outside the session is badged "Markets have closed" rather than
  "At the close". The live clock now honours NYSE holidays and early closes.

## 15 Oct 2026 (PR 69)

- Dashboard: a "This year" strip leads it: SPY, your portfolio, then QQQ,
  each its return this year, with your lead or lag over each on the arrow
  between them. Live while the US market is open, else to the last close
  and the statement.
- Dashboard: Net worth now and Today so far are Live only while prices come
  back; otherwise Net worth (with the statement's date) and the last
  session, each badged. No Total portfolio tile and no Holdings count.
- Dashboard: the headline adds SPY's and QQQ's return beside yours and the
  VIX by default; the weights by class and the class mix, the holdings with
  no class, diversification and weight by sector move to Holdings.
- Dashboard: "Your book now" (live, with prices) or "Your book at the
  close"; the index cards, what drove the S&P 500 and QQQ, the heat map and
  the movers follow the session live, refreshed every minute.
- Every card says how fresh it is, on the Dashboard, Holdings, Performance
  and Markets, instead of one badge per section.
- Markets: gold per ounce, oil per barrel, yields and the curve in percent,
  the dollar index in points; changes in basis points for yields. No
  Indicators table; no duplicate VIX.
- Holdings: the two pies first, then positions, the class groups, the
  correlation matrix (centred), concentration (moved from Performance),
  revenue by region as one donut whose regions never overlap, the
  Classification Register without sideways scrolling, sectors as a pie.
  Prices now moved to the Dashboard.
- Performance: the look-through tables By class and By holding are shaded
  by weight, with class colours.
- Earnings: press a holding to see its post-earnings decks, embedded as
  Google Slides like the reviews, with the earlier decks under it.
- Trades: Show all fills stands apart from the fills. Watchlist: a larger
  Watch button. Methodology: "Yours to check" is a set of coloured cards.
- Customise: drag screens into order by the grip (arrow keys work too).
  The default order puts Triggers and kill signals last, before Sources
  and settings; Reset order takes it.
- The greeting's quotes are a queue: each greeting shows the next, and it
  goes to the back, so no quote repeats until all have shown.

## 15 Oct 2026 (PR 68)

- Setup is the one place for every input, and the first screen a new person
  sees: an overview of each input (in use, needs you, missing), then cards
  in five groups (your rules, your money, what the app reads for you, how
  you see it, your account). Each card says what the app holds now and
  since when, its actions, and its step-by-step guide folded away.
- Setup: choosing a ready-made methodology, uploading your document, asking
  for a suggestion, your model and removing the methodology moved here from
  the Methodology screen.
- Setup, Interactive Brokers: says what the app has, as of when, whether it
  is fetched every morning with your Flex token, and what the last fetch
  lacked. One Upload a statement button opens the picker and reads the file;
  no "Choose file" or "No file chosen" until you pick one. Once the token is
  kept its fields are folded under Replace the Flex token.
- Setup: the "How to connect each input" section and "One input chosen" are
  gone; each card carries its own guide.
- Company filings: no Read again button; they are read every morning and
  when the app is opened.
- Every upload and action shows a check mark that draws in with a word
  (Uploaded, Kept, Drafted, Confirmed...) when it succeeds, across the app.
- Every screen says how fresh its figures are under its title: Live (green,
  pulsing) while the US market is open, At the close, Daily, Uploaded, or
  the demo's Snapshot; a stale one turns amber.
- Methodology: a summary at the top (name, where it came from, classes,
  rules, how many the app tests, figures), then one part at a time behind
  tabs: Checks grouped by broken, near, within, yours to check and waiting
  for data; Classes with their tests; Rules by section; Figures; Layout;
  Gaps.
- Dashboard: a countdown in the top right within two hours of the US open
  or close (to 13:00 on an early close, none on a holiday or weekend).
- The greeting also shows when the app is opened after being quit (on a
  Mac, or swiped away on a phone), not only after six hours without use.
- Demo tour: 21 steps, with one step per input on Setup (methodology, model,
  Interactive Brokers, other brokers, statements, what runs by itself,
  several portfolios, your own Claude) and where each goes.

## 15 Oct 2026 (PR 67)

- Dashboard: the "Your holdings" list (each holding and its weight, shown
  until the last session was read) is gone; Holdings already shows them in
  full. The book's day still appears once the session is read.
- Dashboard: the methodology's sections that list the holdings one by one
  or class by class (in HCMP's: Archetype caps, the holdings table and the
  Classification Test inputs) are left to Holdings, which shows them in its
  positions, class donuts and Classification Register.
- Opening the app reads what is due by itself: a followed company's results
  as soon as it has reported, and the filings when they are a day old or a
  new holding has none. The buttons stay for an immediate read.
- Earnings: days Nasdaq has not published yet are no longer counted as
  unreadable; the page says how far ahead the calendar is published.
- Earnings: a Post-earnings decks section with each holding's latest
  results deck, in the HCMP post-earnings style (cover with the headline,
  the quarter's figures, class tests, triggers and rules, valuation,
  commentary, sources), to download as PowerPoint. All decks lists every
  report's deck by company.
- Dashboard: Needs you is gone; what needs a decision is on Notifications.
- Trades: Fills shows the latest seven, with Show all.

## 15 Oct 2026 (PR 66)

- A new Earnings screen: a month calendar of the days your holdings, your
  watchlist and any company you add report, before the open or after the
  close, with the next reports listed in order and the consensus estimate.
  Add or remove companies at the bottom of the screen.
- The day before a company on that calendar reports, you get an alert, on
  Notifications and by email.
- After the results, a report on the Earnings screen and as an alert: what
  the company filed, the quarter against a year before from its filing, your
  methodology's class test and rules on the new figures, your triggers, kill
  signals and valuation, and a headline in HCMP's words ("No kill signal
  met; MA stays a Compounding Machine (7 of 7); no decision owed"). On a
  Claude key, your Claude adds what the release and the call said, every
  point with its page. The first version comes the evening of the results;
  the figures follow when the 10-Q is filed.
- Today and the Dashboard are one screen now, called Dashboard, first in the
  menu and the first phone tab. It leads with your methodology's headline
  tiles, then your book's last session and why each holding moved, the
  session itself right under After the close (the indices, what drove the
  S&P 500 and QQQ, the heat map, the movers, what happened), what needs a
  decision, your methodology's checks, weights against caps and the class
  mix, what is on watch, the latest review, and then your methodology's own
  sections (Diversification, macro, how current the figures are). Old links
  to the Dashboard and to Markets today open it.
- Performance now leads with your methodology's own return and risk tiles
  (this year and since inception against SPY, volatility, beta, worst
  drawdown), which left the Dashboard.
- Earnings is a phone tab in the Dashboard's old place.
- Holdings: "By country" is now "Revenue by country": where each company
  earns its revenue, as its latest annual filing reports it, weighted by
  what you hold, with a chart and a table. Each company's own lines are
  kept, a country or a region; cash and holdings with no geographic split
  are one named line with how many and what weight, never "Unknown". A
  holding's page shows its company's split and the filing it came from. The
  split is read with the other filings, on Setup and every morning.
- A greeting when you open the app after six hours without using it: good
  morning, afternoon or evening by your own clock (happy earnings season in the reporting weeks),
  with a quote of the day from great investors, CEOs and a few satirical
  lines with their context. A tap, a key or a few seconds close it.

## 15 Oct 2026 (PR 65)

- Trade check, the Decision Log and the methodology to-do are off until you
  add them on Customise, even when your methodology names them; Customise
  marks the ones it names and lets you add or remove each. If you used them,
  add them again there. Trades is on for everyone, and a new trade still asks
  for its reason on Notifications.
- The demo's tour shows where to add those pages instead of opening the
  to-do.
- The methodology graph no longer fails with "This page couldn't load" when
  you drag it and let go quickly, which happened most on a phone.
- The portfolio switch at the top keeps the portfolio you chose; it used to
  go back to "All portfolios" after the screens had already changed.
- Performance and the Dashboard say why one portfolio shows no returns: the
  account value series covers more than its accounts, so choose All
  portfolios for them. They used to ask for the Flex statement again.

## 14 Oct 2026 (PR 64)

- Prices move while the US market is open. Today shows net worth now and the
  day so far, with every listed holding's move and its part in the whole;
  Holdings shows each holding's price, value and weight now against its cap;
  the Dashboard warns when a capped holding is over its cap at today's
  prices, citing the cap's section; Markets today shows the four US indices
  so far today. All of it refreshes every 30 seconds from Yahoo Finance while
  the page is open, and nothing is kept: the rules, alerts and reviews still
  read the close.
- A price in another currency than the holding, or far from the book's own
  price (another listing or a split), is not used and is named. Cash, funds,
  bonds, options and private assets stay as the book has them.
- The demo is a frozen snapshot and has no live prices.

## 14 Oct 2026 (PR 63)

- Your own Claude can read Portfolio OS. Setup has a "Your own Claude"
  section with the server's address and a step-by-step guide: add it in
  Claude under Customize, Connectors, Add custom connector, sign in with the
  same Google account and allow read-only access. Claude then answers from
  the app's own tools: the overview, holdings, the methodology and its
  checks with their sections, figures the app computes, alerts, the to-do,
  the Decision Log, the last review, a search of your vault and a company's
  filings. It cannot change anything.
- With several portfolios, Claude can read one alone by name; under one
  methodology per portfolio it says to name one before any verdict.
- The demo's address works in Claude with no sign-in and reads the
  anonymized snapshot.
- Dismiss on Notifications works in the evening too: an alert whose day had
  already begun in Athens but not yet in UTC changed its id on every page
  load, so Dismiss said it was no longer there.

## 14 Oct 2026 (PR 62)

- Schwab, Wealthsimple, Questrade, Fidelity, Robinhood and the other brokers
  SnapTrade bridges connect through the person's own free SnapTrade Personal
  key: Setup has the form, a step-by-step guide, and Connect a broker, which
  opens SnapTrade's own page asking for read access only. Each account shows
  on Holdings and under Portfolios by its broker and name.
- eToro connects with two keys the person makes in eToro with Read
  permission, with its own guide. Positions show in US dollars at what each
  is worth now; a leveraged or short position is named as a CFD, and a trader
  copied is an account of its own.
- Both are fetched again every morning beside IBKR. A broker that cannot be
  fetched keeps its last good copy and says why on Setup; a position in a
  currency no rate converts is left out and said so.
- eToro is a new choice among the places money is reported. The deployment
  keeps no broker key of its own.

## 14 Oct 2026 (PR 61)

- Several portfolios. Setup, Portfolios groups the accounts the app reads
  into portfolios the person names (an IBKR one, a Schwab one, private
  assets); each account sits in exactly one, a new account joins the first
  until it is moved, and a portfolio can be renamed, added or removed.
- With more than one portfolio, a switch at the top of every page shows
  all of them together or one alone. The choice is kept. A portfolio's
  performance uses the broker's value series only when the portfolio is
  exactly that broker's accounts; otherwise it says it needs one.
- One methodology for all, or one per portfolio, chosen on Setup. Per
  portfolio, each confirms its own the usual way (or none, for assets only
  tracked); the combined view carries no verdict of its own and the
  Dashboard lists each portfolio's findings under its name, as do the
  alerts; the weekly review covers the whole book without a verdict. The
  demo keeps one methodology for all.

## 14 Oct 2026 (PR 60)

- Today is shorter: net worth, how the book did in the last session with
  every listed holding's move and part, why each moved, and the few things
  most urgent. Everything else that was on Today (the methodology's
  headline, needs you in full, the to-do, caps, class mix, every rule
  checked and its sections) is on a new Dashboard page, a phone tab in
  Trade check's place. The book's day moved from Holdings to Today.
- Trades, Trade check, Decision Log and the Methodology to-do are off unless
  the methodology names the practice (a written record or vote, a review of
  the trades, a check before a trade, duties per holding on a clock) or the
  person adds them under Customise, Pages you can add.
- A new trade in the broker's ledger (the last fortnight, a day's fills of
  one symbol on one side) asks for its reason on Notifications and in the
  alerts email. The reason is kept as a Decision Log entry with the trade,
  shown on the holding's page, and the question clears; Dismiss lets it go.
- The demo's tour opens on the book's day, then why it moved, then the
  Dashboard.

## 14 Oct 2026 (PR 59)

- The demo's After the close is the owner's own recap of 13 Oct 2026,
  written by their Claude, with why each holding moved; the 9 Oct recap stays
  behind it.

## 14 Oct 2026 (PR 58)

- Markets today: QQQ's drivers come back. The session read kept from before
  the Nasdaq-100 list moved is dropped, a read that misses the list is no
  longer kept until the next close, and the Nasdaq-100 companies outside the
  S&P 500 (ASML, MELI, ARM and the rest) count in QQQ's drivers and the
  book's day even though their list gives no sector.

## 14 Oct 2026 (PR 57)

- The demo has a showcase: a real portfolio, anonymized and dated 10 Oct
  2026, with its methodology, filings, Decision Log, a study and the recap
  of its last session. `/try` opens it on Today with a guided tour of ten
  steps; the sidebar's footer restarts it.
- The sign-in page has "Try the demo free", which opens the showcase and
  its tour.
- Charts on a phone: a loss's value no longer runs off the left edge of a
  bar chart, and a column chart's last date no longer lands on the one
  before it.

## 14 Oct 2026 (PR 56)

- Today opens with "After the close": what drove the last US session and
  why each of your listed holdings rose, fell or held flat, written by your
  own Claude from the web after the close, each reason with its page. Turn
  it on from Today or Markets today; "Write the last session's recap now"
  writes it at once.
- A holding that moves 2% or more either way in a session is explained from
  that day's news (or said to have none) and becomes an alert on
  Notifications and in the alert email, with the move and Claude's reason.

## 14 Oct 2026 (PR 55)

- "Your book today" moved from Markets today to Holdings, under the
  positions table.
- The positions table has four tiles (market value, daily and unrealized
  P&L, cash), gains and losses tinted blue and red by size, a weight bar on
  each market value, and kind chips for ETFs, options, bonds and funds.
- Holdings by country reads each company's country from its SEC business
  address and the Flex statement's issuer country, instead of "Unknown".
  Press "Read filings" on Setup once to fill it in.
- Concentration on Performance is a picture: net worth as one strip by
  holding, the three largest strongest, the effective number of holdings
  against the number held, and what the figures say in plain sentences.
  The effective number is now measured over the listed holdings alone, so
  cash no longer makes the book look more spread than it is.
- Trades: a sale of shares bought before the ledger begins takes the
  broker's own realised P&L when the Flex statement carries it, so the
  statistics count it and the windows differ. Sales with no figure are one
  short line, not one sentence each, and a window that reaches before the
  ledger says so.

## 14 Oct 2026 (PR 54)

- Holdings has a positions table under the two pie charts: each holding's
  position, last price, change over the day, the year, six months and since
  bought, cost basis, market value, average price, daily and unrealized P&L,
  then the cash and the totals.

## 14 Oct 2026 (PR 53)

- The Nasdaq-100 members are read from Wikipedia's new list page, so QQQ's
  drivers show on Markets today from the next session read.

## 14 Oct 2026 (PR 52)

- Markets today shows your book's day: its move in percent and in money, and
  every listed holding's weight, move and part in it, largest first.
- Markets today shows what drove the S&P 500 and QQQ: the companies that
  added most and took most away, each with its weight, its move and its part
  in percentage points, beside the index's own move.

## 14 Oct 2026 (PR 51)

- Markets today keeps a finished session read for every visit, so the indices,
  heat map and movers stay on the page instead of being read again on a new
  server or after a deploy.

## 14 Oct 2026 (PR 50)

- The icon is now three rising bars in teal on graphite, in place of the P.

## 14 Oct 2026 (PR 49)

- A new icon for the browser tab and the iPhone home screen: a P in vellum
  with a teal point, on graphite.

## 14 Oct 2026 (PR 48)

- Markets today, a screen of its own: the last session's US indices, the
  S&P 500 heat map, the top movers and What happened. Markets keeps the
  indicators, cycle signals, liquidity, the US economy, world equities and
  the major economies.

## 14 Oct 2026 (PR 47)

- Major economies sits above the indicators table.
- Its nominal growth is the OECD's own GDP growth in money, so Germany,
  France, Italy and the UK have one; their inflation is the harmonised
  figure they report.
- Interest growth is what each government pays in interest, gross, this
  year on last, so Japan and Switzerland, whose net interest is below zero,
  have one too, and growth less interest fills for every economy.

## 14 Oct 2026 (PR 46)

- Markets shows its charts first, then the indicators table and the major
  economies.
- The major economies' debt, current account, growth, inflation and
  interest columns come from the OECD Economic Outlook, which answers from
  the app, with its projection for this year; the IMF, which refused the
  app, is asked only for a figure the OECD does not give.

## 14 Oct 2026 (PR 45)

- Add data, on Customise: name a figure or series, choose how it is shown
  (a number, a line over time, bars, a pie or a table), how often it is read
  again (every morning, weekly or monthly) and the screen it sits on (Today,
  Holdings, Performance or Markets).
- Each piece comes from a public API you point at (JSON or CSV, the fields
  you name, a key kept in your own vault and never shown again) or from
  your own Claude, which searches the web on your key and links every page
  a figure came from.
- A reading that fails keeps the last good one and says why; "Read again
  now" and "Remove" sit beside each piece.

## 14 Oct 2026 (PR 44)

- "What happened" on Markets comes from the source you choose, either or
  both: a free recap newsletter you forward, or a recap your own Claude
  writes from the web after each close, every point linked to its page.
- A step-by-step guide on Markets and Newsletters for the free StockMKTNewz
  Daily Recap: where to subscribe, the Gmail forwarding address and the
  filter on its sender, ready to copy.
- The app looks for the recap each weekday evening, about two hours after
  the US close, and again later in case it is late; "Write it now" writes
  your Claude's recap at once.

## 14 Oct 2026 (PR 43)

- Liquidity on Markets: the Fed's bond holdings week by week for five years
  with their change in a month, and the fed funds rate and SOFR each day.
- The US economy: mortgage rates, the fed funds rate and inflation on one
  chart over five years; unemployment, Michigan consumer sentiment, CNN's
  fear and greed index, federal income tax receipts over twelve months and
  the dollar index.
- Major economies: a heat map of the US, Germany, France, Italy, the UK,
  Japan, Canada, Australia and Switzerland by policy rate, current account,
  government debt, real and nominal growth, the growth of the interest their
  governments pay against the growth of their economies, and broad money.
- Charts that span years name the month and year on their axis; on a phone a
  chart's end labels carry the value and the legend names the line.

## 14 Oct 2026 (PR 42)

- Markets shows the last closed US session, read after the close and kept
  until the next one: the S&P 500, Nasdaq, Dow and IWM through the day, a
  heat map of every S&P 500 company by sector sized by market value, and
  the ten biggest gainers and losers, with your holdings marked.
- "What happened" on Markets: the newsletters you forward, digested since
  the close (a market recap's main stories, up to six points each).
- Cycle signals: the US Treasury curve from three months to thirty years
  against a month and a year ago, the NY Fed's recession probability
  computed from its own model, Dow Industrials against Transports, and the
  homebuilders ETF (XHB).
- The world: the S&P 500 against developed, developed outside the US and
  emerging markets, indexed to 100, and the FTSE 100, DAX 40, Nikkei 225,
  Nifty 50 and Shanghai Composite.

## 13 Oct 2026 (PR 41)

- A Newsletters screen. Each person has a newsletters address beside their
  statements address; a Gmail filter forwards the newsletters they choose,
  with the steps in Gmail's own words and the forwarding code shown on the
  screen. Each newsletter is read once on your own model key into a few
  lines (what it argues, and which of your holdings each point touches);
  only that digest is kept in your vault, never the email.
- The weekly and monthly review carry the period's newsletters: how many
  from each sender, and the points that touch your holdings most, with a
  slide like HCMP's in the deck.

## 13 Oct 2026 (PR 40)

- The review deck follows the HCMP weekly review's skeleton and look: a navy
  cover with the verdict, its two pillars and the returns as tiles, then
  white slides with a title that says what happened: alarms, the period's
  returns and the year to date as line charts against the benchmarks, what
  moved the book, what the numbers mean, caps as bars inside their tracks,
  where the capital sits, the correlation matrix, trades, the rulebook, the
  theses, markets, the news by topic, coming up, and sources. Only the
  slides your methodology asks for are drawn.
- A new review section, Markets this period, for methodologies that read
  market indicators: each price's move in percent and each yield or spread
  in points.
- The review's news beyond the holdings is filed under markets and macro,
  tech and AI, or geopolitics, each on its own slide.
## 13 Oct 2026 (PR 39)

- Every weekly and monthly review is also a slide deck, in the review's own
  order: the cover with the verdict, its two pillars and the returns as
  context; the commentary; then each section, the returns with a chart of
  the book against its benchmarks, a long section continued on the next
  slide. In a Google Drive vault the deck is kept in your Portfolio OS
  folder as Google Slides; the one before it of the same kind goes to the
  bin.
- The review email links the deck and attaches it as slides and as a PDF.
- Reviews shows the last weekly and the last monthly as they went out, with
  when each was sent, and the deck embedded above each review with Open in
  Google Slides and Download the slides. The demo's weekly downloads too.

## 13 Oct 2026 (PR 38)

- Every to-do item carries the action that answers it, on the to-do list and
  on the holding's own page. Over a cap: plan the trim, with the weight and
  the date. A red signal, a met kill signal or a clock: hold, trim, sell, or
  probation until a date. A vote: the outcome, the class you voted and your
  reasons. A rule the app cannot measure: Mark checked, good for a week. An
  option expiry or a maturity: rolled, closed or let go. Each files a
  Decision Log entry naming the item; nothing goes to a broker.
- A decision moves its item: a dated trim, sale or probation goes to Due on
  that date and back to Do now once the date passes with the item still
  open; a hold goes to a new Decided group for up to a quarter, then asks
  again. A clock whose date moves asks again.
- A vote's class is kept beside the class the tests give and never applied.
  Where they differ, a to-do item says so, until an amendment's rules give
  the voted class.
- Each holding's page has Triggers and kill signals: a price or any filing
  figure at or below, or at or above, a level, with a note. One that is met
  is an alert and a decision to take; a kill signal is a breach.
- Decision Log entries can be edited, keeping their date and place. Red
  signals say what was decided and when.
- On Real estate, a suggested revaluation can be accepted, which uses it for
  the property from then on, or kept as yours; either is logged.
- Watched symbols can be edited in place: levels, valuation and note.

## 13 Oct 2026 (PR 37)

- Alerts are checked every twelve hours, at 06:00 and 18:00 UTC, for
  everyone enrolled on Reports (any schedule, or none). Every alert the app
  produces counts: a breach or watch from your methodology's rules, a clock
  or date within a week, a study finished or stopped, a filings read that
  failed, a statement waiting for you or one that could not be read, and
  the watchlist's levels. Each new one is emailed once, when it
  fires, to your sign-in address, with a link to where it is decided.
- Notifications keeps them: what holds now, worst first, with when it fired
  and whether it was emailed; then what fired and cleared in the last 30
  days. Dismiss hides one until it clears and fires again. Check now runs
  the check at once. A sentence says when the last check ran and why an
  email could not go.
- The watchlist takes alert levels: a price at or below one level, or at or
  above another. A price at or below your low valuation alerts too. Watched
  symbols now show their latest close from the market feed.
- Today and the menu count unread the same way, studies included.

## 13 Oct 2026 (PR 36)

- Performance has a look-through: the figures your methodology tests (for
  HCMP's, ROIC, ROIC excluding goodwill, gross margin, revenue growth, engine
  growth, FCF per share growth and the rest) as the weighted average of each
  listed holding's own figure from its filings, for the whole book and for
  each class, beside SPY and QQQ worked out the same way. A chart sets the
  percentages side by side; a table gives every figure by class; another
  gives each holding's own. Each average says how much of the book or the
  fund it covers, and a figure no company reports is "no reading", never a
  zero. Another methodology gets its own fields.
- SPY's and QQQ's companies come from each fund's latest N-PORT holdings
  report to the SEC, and the 60 largest across both are read from their SEC
  filings, with the contact you confirmed on Research. The morning refresh
  reads them again once a week; "Read SPY and QQQ" on Performance reads them
  now. Each fund's note gives the report date and how much of it was read. A
  fund that cannot be read keeps its last copy, with a sentence on Setup.
- Chart labels never sit on one another: date labels thin out on narrow line
  charts, bar charts on a phone put each name above its bars, and the
  methodology graph shortens a name to fit beside its value.

## 13 Oct 2026 (PR 35)

- Holdings and Allocation are one screen. Holdings now opens with the
  portfolio by holding and by class (moved from Performance, which now shows
  only performance), then the holdings by class, a correlation matrix, the
  Classification Register and sectors, and closes with where the money is:
  net worth by asset class, themes, overlap, country and account. An old
  Allocation link lands there.
- The correlation matrix shows how every listed holding of 1% or more moved
  with every other and with SPY and QQQ (and any other benchmark your
  methodology names), over one month, three months or a year of daily
  closes, teal for moving together and gilt for moving apart, with the
  value in every cell and a table of every pair. A holding the price feed
  cannot read is named, never filled in.
- Every chart label is shown whole. Donut labels sit in two columns joined
  to their slice; long names wrap and the drawing grows rather than cut a
  name off. Axis figures and line-end labels get the room they need.
- The weekly and monthly reviews read the same daily closes, so "What moved
  the book" shows each holding's contribution and the correlation instead
  of saying the closes are missing.

## 13 Oct 2026 (PR 33)

- Statements arrive by email. Forward a bank's or a fund's emails to your
  own statements address and every PDF attached is read each morning, or at
  once with Check the inbox now on Statements, and checked like an upload.
  Only mail sent or forwarded from your own account is read; anything else
  is listed as set aside, unread. An email without a PDF (a bank's "your
  statement is ready") is listed so you know which statement to fetch.
  Check the inbox now also shows Gmail's forwarding confirmation code, so
  forwarding is set up without help. Setup's morning lines include
  "Statements by email".
## 13 Oct 2026 (PR 34)

- The weekly and monthly reviews are built on the same figures as the
  screens: the filings' fundamentals and sectors, your research studies and
  the market feed. A review now shows SPY and QQQ beside your returns and
  each holding's class, where before it said there was no SPY series and
  nothing classified. The kept review on Reviews says when it was built, so
  an older one is not taken for today's.

## 13 Oct 2026 (PR 32)

- Statements reads bank statements, portfolio reports and fund reports.
  Choose up to six PDFs and each is read on your own model key: the
  positions of a statement (cash, deposits, bonds, shares, funds), and a
  fund report's value of your share, commitment, paid-in, distributions and
  the companies it holds. Every figure and ISIN is then looked for in the
  document's own printed text, and the positions are added up against its
  total. A document that passes goes on the books at once, as of its own
  date and beside your broker's holdings; any other waits on Statements
  with what did not check, for you to use or remove. Only what each
  document said is kept in your vault, never the document. A report that
  gives only the whole fund's figures says that your share is in your
  capital account statement.

## 13 Oct 2026 (PR 31)

- A screen you opened in the last five minutes opens again at once, from
  your browser's own copy, instead of reading your Drive again. Saving
  anything clears that copy, so a change shows straight away; the morning
  refresh shows within five minutes. The market readings were already
  shared for an hour.

## 13 Oct 2026 (PR 30)

- Moving between screens no longer waits on a blank page. The frame stays
  and the screen's shape appears while your files are read, after a short
  pause so a quick screen never flashes it.
- A file Google Drive is slow to send is asked for again after under a
  second, and whichever copy arrives first is used. Drive's files here are
  small; the slow pages were single downloads that waited seconds. A Drive
  call that has not answered in 20 seconds now says so instead of hanging.

## 13 Oct 2026 (PR 29)

- The figures refresh every morning. Setup has a new section, Every
  morning: keep your IBKR Flex Web Service token and query id there (a
  step-by-step guide says where IBKR shows them) and the app fetches the
  Flex statement at once, then again each day at about 06:00 UTC, and reads
  every listed holding's SEC filings again after it, before any review is
  built. Each source's last refresh is a line on Setup with its time and
  what it found; one that fails keeps the last good figures and says why.
  The token can fetch reports and nothing else, stays in your vault and is
  never shown again. Fetch now runs the same refresh at once. Someone who
  wants the refresh without a review picks "No review" on Reviews, or Turn
  on under Every morning.

## 13 Oct 2026 (PR 28)

- The S&P 500 earnings yield reads. It is S&P's trailing twelve-month
  reported earnings per share, as multpl.com publishes them each month, over
  each day's close of the index (Yahoo Finance ^GSPC, else FRED). The
  earnings step once a month and arrive some weeks after a quarter ends; the
  price moves daily, so the yield does too. HCMP's library entry no longer
  lists it as something the app cannot say. The demo shows a fictional one.

## 13 Oct 2026 (PR 27)

- Holdings has a Classification Register, like the HCMP Classification
  Register sheet. Each holding is a row and each criterion of the
  methodology's classes a column. A cell shows the holding's reading and
  whether it passes, fails, has no reading or is not measured because its
  condition fails. Beside each holding are its class, its count against what
  the class needs ("5 of 7 hold (5 needed)"), and a line for every class
  ahead of it saying what kept it out ("Compounding Machine: required
  disruption engine growth at most 20 does not hold (34.0%)"). The gates
  come first. A criterion two classes share is one column. Holdings no
  criterion reads (options, cash, a holding with no filings yet) are named
  under the table. On a phone each holding folds open. Nothing is filed: it
  is the Classification Test on today's figures.

## 13 Oct 2026 (PR 26)

- VIX, the 10-year and 2-year yields, the curve, the dollar index and oil
  read again. FRED does not answer the servers the app runs on, even given
  fifteen seconds, so each of these now comes from Yahoo Finance first
  (^VIX, ^TNX, the 2-year yield future 2YY=F, DXY as DX-Y.NYB, WTI as the
  front-month future CL=F) and from FRED only when Yahoo has nothing. The
  S&P 500 and the Nasdaq-100 read the indices on Yahoo (^GSPC, ^NDX) first,
  so a page no longer waits on FRED before the benchmarks arrive. The dollar
  index is now the ICE DXY its name says; FRED's broad trade-weighted index,
  on a different scale, is only the fallback. A source that fails now says
  whether it timed out or refused.
- A study's PDF downloads again when it runs to many pages. A methodology
  with many classes and criteria (HCMP v3.4) made the Classification Test
  long enough that the page-numbered footer broke the renderer (an HTTP 500
  on Download PDF). The footer is now one static line without page numbers,
  and a table taller than a page runs on to the next page between rows
  instead of being forced onto one.
- Pages no longer wait on FRED. Every page waited up to two and a half
  seconds for the market feed on a fresh server, because FRED was asked
  first and never answered; Yahoo Finance now answers first. The server log
  records how long each page spent reading the vault and waiting for the
  feed, in milliseconds and nothing else, so a slow page can be traced.

## 13 Oct 2026 (PR 25)

- Weekly and monthly reviews, per methodology. Reports is now Reviews: the
  weekly covers Monday to Friday of the last full week and the monthly the
  previous calendar month, each in the order of the HCMP Sunday deck. The
  cover gives a verdict (Backed, Partly backed, Not backed) as the worse of two
  pillars, Behaviour (the rulebook and the period's trades) and Holdings and
  theses; returns against the benchmarks the methodology names are context
  and never decide it. Then alarms, returns for the period and the year to
  date, what moved the book (contribution by holding and by class, and how
  the holdings moved together over 21 sessions, from daily closes per
  holding when the book carries them), what the numbers mean, caps by class
  and where the capital sits, every trade with its Decision Log entry and IC
  vote, the rulebook (x of y followed; a cap over by price alone is partly
  followed, bought into is not), holdings and theses with a standing each,
  coming up and open items, and sources and method. The monthly adds the
  month in numbers: worst fall, up and down capture, tracking error, Sharpe
  and Calmar since the series began, trade quality, realised P&L and each
  sale scored 30 days on. Every section is a slot of the Reviews screen in
  the ontology, drawn only when the methodology asks for it and saying what
  it needs when the data cannot fill it.
- The schedule has a cadence: weekly, monthly, or both (the monthly in the
  first week of each month). "Build the weekly" and "Build the monthly" on
  the Reviews screen; the demo builds the weekly on each visit.
- News on your own provider. With the commentary on and Claude as the
  provider, the review searches the web for the period's news on each
  holding, the markets and macro, and the next four weeks of dated events,
  each item with the page it came from, and places them before Coming up.
  An open model cannot search, so the review says the news was skipped.
- A Decision Log entry filed after its date counts from its filing day, so an
  entry back-filled after a trade reads as "entry 3d after", as HCMP's does.
  A decided sale is a vote or note that says sell; a trade entry records one
  already made.
- Tested against HCMP: the weekly Portfolio OS derives from the HCMP book,
  methodology and Decision Log for the week of 5 to 9 Oct 2026 matches the
  HCMP Sunday deck on 75 of 81 figures (returns for the week and the year to
  date, every weight, every holding's return and contribution, the
  correlation figures, the UBER trade with its late vote and back-filled
  entry, the rulebook's verdicts, both pillars and the verdict); the six
  differences are explained (a dividend the closes do not carry, and watch
  standings that come from quarterly signals the fixture does not hold).
  `npm run check:review-parity` runs it on files kept outside the repository.
- The ontology, as a graph. Methodology has "The ontology" beside "Inspect
  the graph": every input, object, field, operation, panel, slot, screen and
  condition the app knows, laid out and explorable the same way, with each
  element's words and what it connects to, and a JSON download.

## 13 Oct 2026 (PR 24)

- Your model, your choice. The Methodology screen's key form is now a
  provider form: an open model (Kimi, Llama, Gemma) at any OpenAI-compatible
  endpoint on a host's free tier (Groq, OpenRouter, Together are listed with
  their addresses and where the key comes from), which costs nothing, or
  Claude on your own API key for better answers. Every model call runs on it:
  reading, suggesting or revising a methodology, writing a study, the
  analyst, the report's commentary and the property watch. The provider is
  kept in your vault; the app holds no key. A model that cannot follow a tool
  call is refused with a sentence and nothing changes. A PDF methodology and
  the property watch need Claude; on an open model the form says so, and a
  methodology uploads as text or Markdown.
- The property watch runs in the app. "Check now" on the Real estate screen
  checks every property side by side on your Claude key: the model searches
  the web (up to six searches each) for asking rents nearby, the short-stay
  market and news that could move the price, and records what it found with
  the page each figure came from. A property that could not be checked says
  so; a suggested revaluation is never applied by itself. The screen no
  longer waits for a file nothing wrote.
- The synthetic loop runs on either provider from `.env.local`, so an open
  model is scored against Claude on the same personas.

## 13 Oct 2026 (PR 23)

- A failover for the segment note, inside EDGAR: when the latest 10-Q or
  10-K has no XBRL instance or its instance cannot be read, the filing
  before it is read instead, and the engine note and the study's facts say
  so. A refusal or an unreachable SEC is not retried on an older filing.

## 13 Oct 2026 (PR 22)

- The disruption engine is read from the filing itself. The SEC's company
  facts carry no segment lines, so Setup's "Read filings" and a Research
  study now fetch the latest 10-Q, 10-K, 20-F or 40-F's own XBRL instance
  and read every operating segment and revenue line for the filing's period
  against the same period a year before, with its share of company revenue.
  The engine is company revenue growth or, when a line at least 15% of
  revenue grows faster than 20%, that line's growth (D.1(a), C3); a line
  named as installed-base service, maintenance, upgrades or parts is excluded
  (C3(a)), and whether price rather than volume drove a line (C3(b)) is in
  the filing's text, so the note says it is yours to check. The HCMP
  library's growth gate now reads the engine, so a holding whose engine is
  a segment tests as Transitional. Filings read before this keep company
  growth as the engine until read again. The writer's facts carry the
  lines. A filing that cannot be read costs the lines, never the figures.
- The HCMP library methodology is v3.4 as adopted (IC vote 1-0, 13 Oct
  2026), no longer a draft.

## 13 Oct 2026 (PR 21)

- The methodology's own measurement rules now decide a holding's class, with
  no override anywhere. A class criterion can carry conditions ("FCF
  conversion, when loans receivable are at most equity"; when the condition
  fails the threshold is not measured and leaves the count) and alternatives
  ("interest cover above 15, or net interest at most zero when cash covers
  75% of debt"; the reading names which alternative met it), and a class can
  ask for a share of the measurable thresholds (71%) instead of a fixed
  count. The holdings screen, the Methodology graph, the study, its PDF and
  the writer's brief show each criterion with its conditions and the note.
- The filings reader derives the bases the HCMP v3.4 draft writes down:
  return on invested capital on operating income after a 21% tax over equity
  with minority interests plus debt and finance leases less cash and current
  securities (no reading when capital is not positive; ROIC excluding
  goodwill and goodwill's share of capital alongside), free cash flow less
  purchases of intangibles, FCF conversion on operating income for a company
  whose net income carries non-operating items, loans receivable to equity,
  net interest expense and net interest cover, cash and investments to debt,
  net debt, and the operating margin against the prior twelve months in
  points. Total debt now includes short-term borrowings and finance leases.
- The HCMP library methodology is the v3.4 draft (13 Oct 2026, awaiting the
  IC vote): the seven thresholds written on those bases, Compounding Machine
  at 71% and Transitional at 57% of the measurable thresholds behind the
  growth gate, invested capital at or below zero passing ROIC, a lender's
  FCF conversion not measured, net cash passing interest cover. The
  disruption engine still stands in as company revenue growth above 20%;
  reading it from the segment note needs the filing's own XBRL instance and
  is recorded as a gap, as is the basis-point adjustment of C9.
- The drafter is told how to write conditions, alternatives and a share, and
  to pick the field whose basis matches the document's.

## 13 Oct 2026 (PR 20)

- A study downloads as a PDF in the stock template's own style: Space
  Grotesk, navy on vellum, white tables with a grey header row, the closing
  "What to take from this" line bold and underlined, status colours only in a
  result cell. It carries the methodology checks and the Classification Test
  as tables, every section, two charts drawn from the filings table (revenue,
  operating income and free cash flow as bars; gross, operating and free cash
  flow margins as lines, in the template's navy and its tints) and the
  figures table. The Markdown download stays.
- The writer gets more to work from and tighter rules. Its figures now carry
  thousands separators, the derived margins, free cash flow and cash
  conversion per year, and the latest quarter against the year before; it
  sees the methodology's ratios, every class's test criterion by criterion,
  the holding (price, weight, cap, the registered class, your own valuation)
  and the market readings when the study started. It may do arithmetic on
  two figures when it shows the working, marks general knowledge once per
  paragraph, states each check once, writes impersonally and closes every
  section with "What to take from this:".

## 13 Oct 2026 (PR 19)

- The market indicators no longer drop out when a source is slow. A page
  waits two and a half seconds for the feed and no longer: a reading under an
  hour old is served as it is, an older one stands in (marked "earlier
  reading") while the source is asked again behind the page, and a source
  may take up to fifteen seconds to answer before it is said to be
  unreachable. VIX, the yields, the curve, the dollar and oil, which FRED
  took longer than six seconds to send, return.
- Gross margin reads for companies that file no gross profit line (a
  retailer, a platform, a card network, a broker): gross profit is revenue
  less cost of revenue, said so in the holding's notes and in a study's
  figures. The filings table also carries cost of revenue, research and
  development, selling and administrative cost, share-based compensation,
  repurchases, acquisitions, receivables, inventory and goodwill, and the
  trailing share count is never built by subtraction (a weighted average does
  not add up over quarters), so per-share figures hold.
- Official sectors. "Read filings" on Setup now reads the GICS sector and
  sub-industry off the S&P 500 and Nasdaq-100 constituents lists for every
  holding they carry, and falls back to the SEC industry code for the rest,
  saying which on the holding's page. A sector can also be set per holding
  under Customise, Records. Every sector says where it came from.

## 12 Oct 2026 (PR 18)

- A study runs in the background and says when it is ready. Starting a
  study, or pressing Continue on one that stopped, reads the filings and
  writes every section in the background of that request, a few sections
  per call on your key, the calls side by side; each group is kept in your
  vault as it lands. You can leave the page: the study page refreshes itself
  while the run is on, and Notifications carries "study ready" or "study
  stopped" on the day it finished, with a link. A run cut short (nothing
  written for eight minutes) is said so on the study with a Continue button
  that writes only the rest. Before, the page drove one step per visit and a
  study stood still the moment you left it, which is why a study could sit
  at "10 of 16 sections" for hours.
- Filings become figures again. The SEC's company-facts reader now builds
  quarters and years from each fact's own dates (a year-to-date figure less
  the one before it) instead of the SEC's "frames", which skip the fourth
  quarter and change concept names, so the trailing-twelve-month column was
  empty for every holding and no class could be placed ("No class yet", "no
  cap"). The reader also takes IFRS concepts for 20-F filers and falls back
  to the latest fiscal year, said so, for a company that files no quarterly
  reports; the note on the Research screen says which basis the figures
  are on, and a share split the older filings never restated is named so
  per-share figures are not compared across it. Press "Read filings" on
  Setup once more after this lands.
- Sectors, GICS-style, from the SEC's industry code. Reading the filings now
  keeps each company's SIC code and description, mapped to the eleven GICS
  sectors; Holdings gains a "Sectors" section, a holding's page a Sector row
  with the industry and code, and Themes falls back to the sector when a
  holding carries no theme of its own. The mapping is approximate where the
  SIC is broad (a payments network or a marketplace lands in Industrials
  under code 7389); overrides can come later.
- Markets read from sources Vercel can reach. stooq refuses requests from
  Vercel (403), so the S&P 500 and the Nasdaq-100 now come from FRED and
  stand in for SPY and QQQ, gold and silver fall back to Yahoo's chart feed,
  a source that fails is rested for ten minutes instead of being asked on
  every page, and a request gives up after six seconds instead of twelve.
  Each indicator's problem names which sources answered what.
- The analyst answers again. Current Claude models refuse a temperature
  other than the default, so every question failed before the first tool
  call; the setting is gone and the log line now carries the error's name
  and message (never a key), so the next failure says why.
- The app's functions run in Frankfurt (`regions` in vercel.json) instead
  of Mumbai, so every page's Drive reads make a shorter trip for a person in
  Europe; the Methodology tab was the slowest to open.

## 12 Oct 2026 (PR 17)

- A trade in a currency the statement never priced no longer takes every
  screen down. The first real Flex upload carried a trade in EUR from a
  market left since, so no open position supplied a EUR rate, and every page
  threw "No EUR to USD rate in the FX table". Now a trade's own "Net Cash in
  Base" prices it, a currency with no open position takes its latest trade's
  "FX Rate to Base", and whatever still cannot be converted is left out and
  said so: a "Left out" row on Trades, a "Flows left out" row on Performance,
  a note on Setup after the upload, and the Flex guide names both columns.
  A figure over transactions reads a missing amount as no reading.

## 12 Oct 2026 (PR 16)

- A markets object and a Markets screen. The ontology now carries market
  indicators (VIX, the US 10-year and 2-year yields and their spread, gold,
  silver and their ratio, the dollar index, WTI oil, SPY and QQQ) from two
  public daily feeds, FRED and stooq, read once an hour, with no key and
  nothing about you in the request. A methodology's macro section becomes
  figures over them and watch rules at the levels it names; the Markets
  screen is titled after that section (for the HCMP methodology,
  "Macroeconomic Analysis & Time-Horizon Framework") and shows its figures,
  its rules as signals, the board of every indicator with its level, changes
  and one-year range, and a year of each indicator it names. An indicator the
  feed could not read is a sentence, never a zero; the S&P 500 earnings yield
  is named with no source yet. SPY and QQQ are lent to Performance when the
  statement carries no benchmark series. The demo reads a fictional sample.
  `npm run check:markets`; the guard confines the feed to one file.
- Classes count their passes. A class can name required filters (a growth
  gate) and a minimum number of criteria that must hold, so "five of seven
  thresholds" is now the Classification Test as written, with a threshold
  that has no reading counted as not passed and said so. The holding page
  shows "passes 4 of 7, 2 without a reading" and, for a holding no class
  places, how close each class came. The HCMP library entry uses it: seven
  thresholds, five for a Compounding Machine, four for Transitional.
- What the app cannot say yet. The drafter now records the asks in a
  methodology document that the ontology cannot express (an indicator the
  feed lacks, a figure of a kind with no name), and the Methodology screen
  lists them with a Copy button, so they can go to the Portfolio OS project
  as ontology changes for everyone. The HCMP entry carries its three.
- SEC filings read for every holding. Reading company facts failed for most
  US filers because one odd fact among thousands failed the parser's shape;
  a fact is now read for its value, end date and frame alone and an odd one
  is skipped, and a failure names what it tripped on in the log.
- A step-by-step guide for every input. Setup lists, for each input you
  chose, how to connect it, written for someone who has never done it: the
  IBKR Flex query (where Flex Queries is, what to name the query, which
  sections to tick in IBKR's own names, the delivery settings, how to run
  and download it; also under the upload itself), Schwab and other brokers
  through SnapTrade (and that the Connect button is not switched on yet),
  bank statements and fund reports by email (the statements address, Gmail
  forwarding, forwarding by hand, "statement is ready" notices), and what to
  have ready for real estate and other assets. Where a connection is not
  live yet, the guide says so. The daily account value is read from "Net
  Asset Value (NAV) in Base" as well as the Equity Summary section, since
  the Flex section list offers the former.

## 12 Oct 2026 (PR 15)

- Signing in to a Drive vault no longer fails with "Google Drive returned an
  error". The one-request file listing from PR 12 asked Drive for every file
  tagged by key alone, which Drive refuses; it now names each file the app
  keeps, as Drive asks. While a vault cannot be read, the Setup screen says
  so and keeps the four steps out of the way instead of offering to start
  over on files that are still there.

## 12 Oct 2026 (PR 14)

- A library of ready-made methodologies. The Methodology screen offers the
  HCMP Investment Methodology v3.3, credited to its author, with a plain
  summary of what it is, whom it suits, what it asks of you and what the app
  does with it. One press makes it a draft to confirm, with no key and no
  reading, because the file is the graph itself; in the vault it can bring
  HCMP's sixteen-section Standardized Stock Template to the Research screen
  as well, and the Research screen offers that template on its own. The
  library carries rules, classes and figures and nothing of anyone's
  portfolio; `npm run check:library` holds that.
- A Methodology to-do list: what your methodology requires that is not on
  file yet, holding by holding, each item citing its section and saying what
  done looks like. Do now: breaches, holdings no class places, sales in the
  last year with no Decision Log entry. Due by a date: every clock, expiry,
  maturity and report. Owed, no date: what each rule that speaks of every
  holding asks (a vote, a record, your own valuation) and has no record of,
  the data a waiting rule needs, holdings near their cap. Today shows the
  first few. `npm run check:todo`.

## 12 Oct 2026 (PR 13)

- One skeleton for everyone: the app now has HCMP OS's screens, in its order,
  for every methodology. Today (what needs you, weights against caps, the
  class mix, the latest review, the rules checked, then the methodology's own
  sections), Notifications, Holdings with a page per holding, Performance,
  Trades, Triggers & kill signals, Watchlist, Research, Analyst, Trade check,
  Decision Log, Calendar, Reviews, Methodology, the input screens, and
  Sources & settings. The phone tab bar is Today, Holdings, Performance,
  Trade check and More.
- The screens and their slots live in the ontology (`SCREENS`, `SLOTS`), each
  with the condition that draws it: a slot the methodology asks for (a cap
  rule, a watch rule, a series figure, a class) is drawn and says what it
  needs when the data cannot fill it yet; a slot it never asks for is not
  drawn. The drafter reads the table, and the checks hold it.
- Caps are read out of the rules (a rule that caps a percentage figure by
  holding), weights are of net worth with the same share at two brokers as
  one, signals are every tested rule per holding from red to clear, clocks
  come from rules on days in a standing or since a valuation, and Needs you
  lists breaches with the holding that causes each.
- A Decision Log in the vault (`decisions`), filed by hand or from the Trade
  check's draft; the Trades screen says which sales have no entry.
- The Trade check lays a buy or a sale on a copy of the book and runs every
  rule again; it never places an order.
- Watchlist: symbols recorded without being held, with a valuation and a
  note; the Trade check takes them as subjects.
- Performance: an account index chain-linked with deposits and withdrawals
  taken out (a time-weighted return), returns by period against the
  methodology's benchmarks, growth of 100, risk (volatility, beta,
  correlation, Sharpe, worst fall, Calmar) over the chosen window, the
  distance below the high-water mark, a monthly grid, weights by holding
  and by class, and concentration. A series the statement lacks says which
  Flex section supplies it.
- Trades: fills from the ledger matched first in, first out, win rate,
  profit factor, average win and loss, days held, realised by holding,
  monthly bought and sold, and the sales with no Decision Log entry.
- Triggers & kill signals groups every tested rule by status; Calendar lists
  every clock, expiry, maturity and next report with its countdown, and the
  rules only the person can check; Notifications lists the day's breaches,
  near misses, due dates and filings, marked read with one press.
- `npm run check:screens`, `check:performance` and `check:decisions`.

## 12 Oct 2026 (PR 10)

- The Overview shows every holding by weight, for every methodology: a donut
  with the class the methodology gives each holding in its table view. A
  methodology can place the "holdings" panel itself; otherwise it sits under
  the headline. The same symbol held at two brokers is one slice.
- "Unknown" in a by-class figure is now "No class yet", and every group over
  holdings lists the holdings in it, in the chart's table and in table views,
  so a reader sees which holding sits where and why a slice exists.
- A figure summed over transactions when the statement carried none now says
  "Nothing to measure yet" instead of $0; a sum that matches nothing among
  transactions that do exist is still zero.
- One pass over SEC filings: Setup gets a "Read filings" button that fetches
  each listed holding's XBRL facts from EDGAR with the confirmed contact,
  derives the same fundamentals the research studies derive, and keeps them in
  the vault's `filings` file with the date. Quality rules and the
  Classification Test read them from then on; a Research study of the same
  company lays its own figures over them. A holding the SEC does not list
  keeps a sentence, and a failed read never replaces a good one. No model
  is involved.
- Faster: the Drive vault lists every file once per request instead of
  searching for each, reads them in parallel, and a file unchanged since a
  warm instance last parsed it is served from memory, keyed by its id and
  modified time so a stale copy is never served. A button press that read
  about twenty Drive responses now reads about half as many, and fewer on a
  warm instance.

## 12 Oct 2026 (PR 9)

- A study of "NVIDIA" read no filings and was written from general
  knowledge, because the SEC lists the company as NVDA and the app matched
  tickers alone. A subject is now matched against the SEC's company list by
  ticker and by name (NVIDIA, Nvidia Corporation, Berkshire Hathaway, Uber),
  the study records the ticker it resolved to, and the Analyst's filing tool
  does the same. A single word the SEC does not list as a ticker or a company
  now stops the study with a sentence asking for the ticker or the full name,
  instead of writing a study with no figures; a theme or a market written as a
  phrase still runs without filings.

## 12 Oct 2026 (PR 8)

- The SEC asks every program that reads its filings for a contact address,
  and refused the first real study because the deployment sent none. The
  Research screen now has an "SEC EDGAR" section: it says exactly what the
  SEC will see ("Portfolio OS (your address)" and the ticker, nothing else),
  offers the sign-in address, takes any other, and asks for a tick before
  the first filing is read. The address is kept in the vault and can be
  withdrawn there; without one, a ticker study and the analyst's filing tool
  say what they need and the SEC is never called. The operator setting
  `EDGAR_USER_AGENT` is gone: the deployment holds no address, and the guard
  fails on one.

## 12 Oct 2026 (PR 7)

- Reading a methodology document, suggesting one and writing a research study
  failed with "The reading service returned an error" on every try: the
  requests forced the model's tool call, which the current models reject.
  The requests now ask for the one call in the instructions, an answer
  without the call is its own sentence, and the server log names the API's
  error type and message (never the key or the document) so the next such
  failure is diagnosable.

## 12 Oct 2026 (PR 6)

- Analyst screen, for anyone with a confirmed methodology: a conversation in
  which the model plans and the app computes. A question becomes recipes over
  the ontology, validated and computed the way the Overview computes its
  tiles; a rule, cap or class question runs the methodology's own rules and
  cites the section; what the vault knows (the methodology element by element,
  research studies, past reports, records, approved lessons) is searched, not
  recalled. A number the tools did not return does not appear, and a recipe
  reading data no input supplies says what it needs. Every answer shows how it
  was worked out, step by step.
- Outputs become inputs: a figure the analyst computed can be kept as one of
  your own figures and shows on the Overview from then on. When the
  methodology is silent on a question, the analyst proposes a lesson, a
  standing instruction kept in your vault and used only once you approve it;
  the methodology itself is never changed. Conversations and lessons are kept
  in your vault.
- Built on LangChain's tool-calling agent, on your own Claude API key; the
  deployment holds no model key. `npm run check:analyst` runs the loop over a
  fake tool-calling model and holds the search, the recipes, the checks and
  the prompt. The guard confines the model client to one file and the agent
  loop to another. The demo shows one conversation built by the tools
  themselves and runs no model. New optional setting `ANTHROPIC_ANALYST_MODEL`.
- A recipe naming a field outside the ontology now comes back with that one
  issue instead of failing to validate at all.

## 12 Oct 2026 (PR 5)

- Research screen, for anyone with a confirmed methodology. A study of a
  ticker or a subject follows the canonical template of the methodology's
  family (business fundamentals: sixteen sections from core business to
  conclusion; options income; systematic; macro and allocation), read off what
  the methodology measures. The methodology amends the template: its classes
  and the rules on the family's fields become the classification and checks,
  its own-valuation rules the valuation section. Your own template (a text or
  Markdown file split by headings) replaces the canonical one and stays in
  your vault; each section's guidance can be edited; another family's template
  can be chosen.
- A study reads SEC EDGAR company facts (five calendar years and the trailing
  twelve months; nothing estimated, a missing concept named as missing), runs
  the methodology's own recipes on those figures (class, every relevant rule
  with its limit and the result), then writes the sections a few at a time on
  your Claude API key, every figure traceable to the facts and anything from
  general knowledge marked as not verified. Studies are kept in your vault,
  readable in the app and downloadable as Markdown. A finished study lays its
  fundamentals on the matching holding, so a figure that said "needs data"
  computes.
- `npm run check:research` holds the filing reader to a fictional filing, each
  family to its template, the checks to the methodology's recipes, and the
  writer's request to no key. The guard confines EDGAR to its one file. The
  demo shows the template and runs nothing. New optional settings
  `EDGAR_USER_AGENT` and `ANTHROPIC_RESEARCH_MODEL`.

## 12 Oct 2026 (PR 4)

- Setup has a "Your figures" section: upload an IBKR Flex statement (XML) or
  a Portfolio OS book file (JSON) and it becomes your figures, in your vault,
  until a connection feeds them. Exchange rates come from the statement's own
  FX Rate to Base column; a currency without one is refused, never guessed.
  What the statement lacked (trades, account value by day, cash) is said on
  Setup. `npm run check:import` holds the reading to the Flex sample.
- The Methodology screen takes a Portfolio OS methodology file (.json) as it
  is, no key needed; it becomes the draft for you to confirm, then the Graph
  screen shows it.

## 12 Oct 2026 (PR 3)

- The vault has three backends behind one contract. Google sign-in keeps the
  Portfolio OS folder in Drive as before. Microsoft sign-in (personal, work or
  school) keeps an Apps/Portfolio OS folder in OneDrive under the app-folder
  permission alone; it appears on the sign-in page once the operator
  registers an Entra app (`.env.example`). The strictest paste an
  S3-compatible bucket in their own cloud account on Setup (AWS, Cloudflare
  R2, Backblaze, Google Cloud Storage); it is tested with a small file before
  it is kept, its credential is kept encrypted in the registry, and files are
  never moved between vaults. Setup says where your files are.
- Scheduled reports open whichever vault you enrolled with. Wording that said
  "Drive" now says "vault".
- `npm run check:vault`: the S3 signer against the signatures AWS publishes
  for its example requests, and the OneDrive and bucket adapters against
  fake servers. The guard allows Graph and S3 calls in their adapters only
  and refuses any files scope wider than the app folder.

## 12 Oct 2026 (PR 2)

- New look. Dark graphite with a one-pixel light edge on every card, a lapis
  teal accent and a gilt hairline under each title; a light theme derived
  from it; "match the device" by default. Figures land with a short settle,
  screens rise in, nothing bounces; reduced motion is honoured. Design tokens
  and components in DESIGN.md.
- Customise screen: theme, the order and visibility of screens (the tab bar
  and sidebar follow), which tiles lead the Overview, figures of your own
  written in the recipe language, and records about your holdings (your own
  valuation, a date, a note) that the methodology can read. Kept in your
  vault, in a cookie for the demo; the methodology is untouched.
- Reports screen: your figures and checks as plain sections, built now or on a
  schedule (day, hour and time zone of your choosing), kept in your vault and
  sent to your sign-in address only; with your own key on file, a short
  commentary opens it. The demo builds its report on the screen and keeps
  nothing. New deployment settings in `.env.example`.
- The ontology learned from the HCMP parity run and from five fictional
  personas: the age of your own valuation, measures of size regardless of
  sign, a benchmark carried in the book counts as supplied.
- `npm run check:synthetic` and `npm run synth:loop`: fictional personas
  through the real pipeline, a judge that names what is missing and why, and
  proposals for a person to read. `npm run check:report` holds the report to
  its figures and clock. The smoke run covers dark and light.
- Sign-in page says what the app is for rather than naming a portfolio
  manager.

## 12 Oct 2026

- The methodology is now a context graph over an ontology. Figures, classes
  and rules are recipes the app computes itself; the drafter writes them from
  the document, so a dividend investor gets dividend income and growth charts,
  an options seller gets premium and assignment risk, and nobody gets a view
  their methodology did not ask for. The fixed metric catalogue is gone.
- Methodology builder: with no document, "Suggest one from my portfolio"
  proposes a starting methodology from the profile, inputs and the shape of
  the book. Every figure, class and rule in a draft can be removed (what
  pointed at it follows), and a change can be asked for in words. Nothing
  takes effect until confirmed.
- Graph screen: the methodology's relationships, explorable. Hover for
  neighbours, select to trace what a node depends on and what depends on it,
  details with the recipe in words and the current value, filters, search,
  pan, zoom and a JSON download.
- Own key: reading or suggesting a methodology runs on the person's Claude
  API key, kept in their own Drive and never logged. The deployment holds no
  model key.
- Every figure and rule says what it needs when the data is not connected,
  instead of showing a zero. Demo: a dividend growth sample methodology, and
  fictional dividends in the individual sample.
- `npm run check:parity` scores a methodology in recipes against a dashboard
  someone already approved.

## 11 Oct 2026

- One app for everyone. Setup asks who it is for (individual investor or
  family office) and where the money is reported; the screens follow from the
  answers. The per-person instance files are gone.
- Methodology screen: attach the document you invest by; the app drafts its
  rules and a dashboard, and nothing changes until you confirm. The Overview
  then leads with the methodology's figures, in its order, as charts or tables,
  with every rule checked and cited by section.
- Each person's setup and figures are kept in a Portfolio OS folder in their
  own Google Drive (`STORAGE=drive`); a public demo runs on fictional samples
  (`STORAGE=demo`), live at portfolio-os-demo.vercel.app.
- Wealth is now Allocation; Getting started is now Statements, with a
  personal statements address. More holds the screens a phone's tab bar has no
  room for.

- Portfolio OS template, built from HCMP OS without HCMP's data, screens or
  Drive ids. One instance per person, chosen by `INSTANCE`.
- Options: open contracts, computed Greeks, strategies, delta-adjusted
  exposure, premium by month, realised results, expiry and assignment notices.
  IBKR Flex now keeps option rows; SnapTrade adapter for Schwab.
- Wealth: net worth, themes looking through funds, overlap across funds,
  brokers and direct holdings.
- Fixed income, Private funds and Real estate (with the weekly property watch
  shape), and a Getting started screen for owners who are not technical.
- Fictional sample books for both first instances.
