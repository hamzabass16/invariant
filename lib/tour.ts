/**
 * Two guided tours, pure, so the checks can hold every step to a screen that
 * is on and every target to a part that screen draws. TOUR walks the demo's
 * showcase: what the app does, then where each input goes on Setup and what
 * the app does with it, then the screens built from them. TOUR_APP walks a
 * person's own app right after Welcome built it: Setup first, where the
 * inputs go, then the screens, and back to Setup, where the first answers
 * are changed.
 */
export type Step = { href: string; target?: string; title: string; body: string };

/** The guided tour of the showcase, one part of a screen per step, in the order a first look would take. */
export const TOUR: readonly Step[] = [
  {
    href: "/",
    target: "headline",
    title: "A real portfolio, anonymized",
    body: "One investor's book as of 3 Nov 2026, with their methodology, filings and Decision Log. The Dashboard leads with this year against SPY and QQQ, net worth and the day, then the methodology's own headline figures. Each card carries how fresh it is: Live in green while the US market is open, At the close, Daily, or here a Snapshot that never updates.",
  },
  {
    href: "/after-close",
    target: "close-brief",
    title: "Why each holding moved",
    body: "At the Close, the screen after Notifications. Written by the owner's own Claude after the close: what drove the session and why each holding rose or fell. A move of 2% or more (or the move set on Notifications) is also an alert and an email. Under it, what happened today from the daily recap newsletter and the week's newsletters by theme.",
  },
  {
    href: "/notifications",
    target: "notifications",
    title: "What needs a decision",
    body: "Every alert the rules raise: a breach, a watch tripped, a date within a week, a trade with no reason yet, a report tomorrow. Each cites its section. Checked twice a day and emailed once; the rule checks themselves are on Methodology, the weights against caps on Holdings.",
  },
  {
    href: "/setup",
    target: "setup-overview",
    title: "Setup: everything you give the app",
    body: "The first screen a new person sees, and the one place every input lives. The top shows each input at a glance, whether it is in use and how fresh it is. Each card below says what the app holds now, since when, how to change it, and has its step-by-step guide folded away.",
  },
  {
    href: "/setup",
    target: "setup-methodology",
    title: "1. Your methodology",
    body: "The rules you invest by. Choose a ready-made one from the library, upload your own document (a PDF, text or a methodology file), or ask for a suggestion from your portfolio. It opens as a draft on Methodology; nothing changes until you confirm it.",
  },
  {
    href: "/setup",
    target: "setup-model",
    title: "2. The AI",
    body: "Claude, run by Invariant: it reads your document, writes studies, answers the analyst and writes the recap after the close. There is no key to make; the card says what this month's use has cost against your cap.",
  },
  {
    href: "/setup",
    target: "setup-ibkr",
    title: "3. Interactive Brokers",
    body: "Upload an Activity Flex statement once with Upload a statement, or keep your Flex token and query id so the app fetches it by itself, every morning and after the close. The card shows what the app has and as of when. The guide walks through IBKR's own screens: which sections to tick, the delivery settings, where the token is.",
  },
  {
    href: "/setup",
    target: "setup-brokers",
    title: "4. Other brokers",
    body: "Schwab, Wealthsimple, Questrade, Fidelity, Robinhood and others through your own free SnapTrade key; eToro through two read-only keys you make in eToro. Keep them here once and press Connect a broker. Nothing here can trade.",
  },
  {
    href: "/setup",
    target: "setup-statements",
    title: "5. Bank statements and fund reports",
    body: "Forward the PDFs to your own statements address, by hand or with a Gmail filter set once. Each is read by the AI and every figure is checked against the document; one that does not check waits on Statements for you to confirm.",
  },
  {
    href: "/setup",
    target: "setup-automatic",
    title: "6. What runs by itself",
    body: "Company filings are read from the SEC every morning and whenever you open the app, once you confirm the contact the SEC asks for. The morning refresh fetches your broker, inbox, results and filings early each morning, and says here what each did.",
  },
  {
    href: "/setup",
    target: "setup-portfolios",
    title: "7. Several portfolios",
    body: "Group your accounts into portfolios: a broker each, or private assets apart. A switch then appears at the top of every screen to show all of them together or one alone. Each portfolio can follow the shared methodology or keep its own.",
  },
  {
    href: "/setup",
    target: "setup-claude",
    title: "8. Your own Claude",
    body: "Copy this address into Claude as a custom connector and ask about your portfolio there. Claude reads the app's own figures and checks, each with its section, and cannot change anything.",
  },
  { href: "/holdings", title: "Holdings", body: "The book by holding and by class, every position grouped by the class the methodology's own tests place it in, how the holdings move together, concentration, revenue by region from the filings, the Classification Register and sectors. Prices now are on the Dashboard." },
  { href: "/performance", title: "Performance", body: "The methodology's own return and risk figures first, then returns against the benchmarks it names, drawdowns and concentration. Returns are context; the methodology's rules decide." },
  { href: "/earnings", target: "earnings-calendar", title: "Earnings", body: "When each holding and watched company reports, with an alert the day before. After the results, a report and a deck: the filing's figures, the class test and the rules on them, the owner's triggers and valuation." },
  { href: "/signals", title: "Triggers and kill signals", body: "Each holding's own triggers and kill signals, read against its latest filings." },
  { href: "/methodology", target: "methodology-hero", title: "The methodology, read", body: "What the app made of the document: its classes, rules and figures, how many it can test, and the checks grouped by what they need from you. The tabs open one part at a time; Inspect the graph shows how they connect." },
  { href: "/customise", target: "practices", title: "Pages you add", body: "Trade check, the Decision Log and the methodology to-do are off until you add them here. This methodology names all three, so each is marked; adding one puts it in the sidebar." },
  { href: "/research", title: "Research", body: "A study written on the owner's own model: every figure from SEC filings, the verdict from the methodology's own tests." },
  { href: "/reports", title: "Reviews", body: "The weekly and monthly review, built from the same data, sent by email with a slide deck." },
  { href: "/", title: "That is the tour", body: "Look around freely. Nothing here is saved or sent, and the snapshot does not update. In your own app, start on Setup." },
];

/**
 * The tour of a person's own app, opened once Welcome's second part is done. Every
 * step is on for anyone, with or without a methodology; it starts and ends on
 * Setup, since the inputs are the first thing to give and the answers from
 * Welcome are changed there.
 */
export const TOUR_APP: readonly Step[] = [
  { href: "/setup", target: "setup-overview", title: "Your app is built. This is Setup", body: "Everything you give the app lives here, and it is the one place to change it. The row at the top shows each input at a glance; the cards below say what the app holds now, since when, and how to change it." },
  { href: "/setup", target: "setup-methodology", title: "Your methodology", body: "The rules you invest by. Choose one from the library, upload your own document, or ask for a suggestion once your holdings are in. It opens as a draft; nothing changes until you confirm it. The Dashboard, the checks and the alerts are built from it." },
  { href: "/setup", target: "setup-model", title: "The AI", body: "Claude, run by Invariant, with no key to make. It reads your documents and writes the studies, the reviews and the recap after the close, up to a monthly cap the card counts down." },
  { href: "/setup", target: "setup-theses", title: "Your theses and valuations", body: "One folder per listed holding: why you hold it, in your own words, and your bear, base and bull per share. A few lines here are enough to start; the folder on Theses takes the pillars, the kill signals, the Valuation calculator and the DCF. Every report after results reads the new figures against them." },
  { href: "/setup", target: "setup-money", title: "Your money", body: "One card per place you chose on Welcome. Paste a read-only token or key once and the app fetches every morning by itself; each card has its step-by-step guide folded away. Nothing here can trade." },
  { href: "/setup", target: "setup-automatic", title: "What runs by itself", body: "Company filings, results, markets and the morning refresh run on their own, and say here when they last did. Nothing to press." },
  { href: "/setup", target: "setup-newsletters", title: "Newsletters and the daily recap", body: "Forward the newsletters you read to your own newsletters address, with a Gmail filter set once. Each is read by the AI into a few lines for your reviews, and the free daily recap becomes What happened today on At the Close." },
  { href: "/", target: "headline", title: "The Dashboard", body: "This year against SPY and QQQ, net worth and the day, then your methodology's own headline figures and the session. Each card says how fresh it is." },
  { href: "/notifications", target: "notifications", title: "Notifications", body: "What needs a decision: a breach, a watch tripped, a date within a week, a trade without a reason, a report tomorrow. Checked twice a day and emailed once." },
  { href: "/holdings", title: "Holdings", body: "The book by holding and by class, concentration, how the holdings move together and revenue by region from the filings." },
  { href: "/customise", target: "practices", title: "Make it yours", body: "Add Trade check, the Decision Log and the methodology to-do; drag the screens into your order; choose the theme and the headline tiles." },
  { href: "/setup", target: "setup-account", title: "Change your answers any time", body: "Who it is for, where your money is, your name and currency: the same questions as on Welcome, here under Your account. Your files stay in your own vault, and you can take it elsewhere." },
];
