import { Steps, type Step } from "@/components/setup/steps";
import { addDays } from "@/lib/performance";
import { longDate } from "@/lib/time";

/**
 * How to make the IBKR Flex query, step by step, for someone who has never
 * opened Flex Queries: where each screen is, what to type, which boxes to
 * tick, in IBKR's own names: part 1 the query, part 2 the token that lets
 * the app fetch it every morning. Shown once, on the IBKR card on Setup.
 */

/** The sections to tick, in IBKR's names, and what each gives the app. */
export const FLEX_SECTIONS: readonly { name: string; gives: string; needed: boolean }[] = [
  { name: "Account Information", gives: "the account's base currency", needed: true },
  { name: "Open Positions", gives: "every holding with its price and value; tick FX Rate to Base among its fields", needed: true },
  { name: "Trades", gives: "every buy and sell for the Trades screen and the Decision Log check; Select All includes FX Rate to Base and Net Cash in Base, which price a trade in another currency, and Realized P&L, which prices a sale of shares bought before the statement's year", needed: true },
  { name: "Cash Report", gives: "cash by currency", needed: true },
  { name: "Net Asset Value (NAV) in Base", gives: "the account's value by day, for returns, drawdown and beta on Performance", needed: true },
  { name: "Cash Transactions", gives: "dividends, the tax withheld on them, interest and fees, for the Dividends screen and What each holding made; deposits and withdrawals, so the IRR and the time-weighted return never count money you added as a gain. Its list is of kinds, each ticked on its own: press Select All there too, or Deposits & Withdrawals is left out", needed: false },
  { name: "Transfers", gives: "cash and shares moved in or out from another IBKR account or another broker, each on its date, so a transfer is never read as a gain; without it an account funded by transfer shows a jump on the day the money arrived", needed: false },
  { name: "Option Exercises, Assignments and Expirations", gives: "what happened to each option; only if you trade options", needed: false },
  { name: "Change in NAV", gives: "the period's totals, as a check on the daily series: when its deposits and transfers add up to more than the rows list, Performance says which period to upload again", needed: false },
];

export const FLEX_QUERY_STEPS: readonly { title: string; detail: string }[] = [
  { title: "Open Flex Queries", detail: "Sign in to IBKR Client Portal. In the menu choose Performance & Reports, then Flex Queries. (In the older Account Management it is Reports, then Flex Queries.)" },
  { title: "Create an Activity Flex Query", detail: "Under Activity Flex Query press the plus sign (Create). Not Trade Confirmation: that one has no positions." },
  { title: "Name it", detail: "Query Name: Invariant. Leave everything else in the top block as it is." },
  { title: "Tick the sections", detail: "In the Sections list tick the ones below. Each opens a list of fields: press Select All, then Save. Open Positions must include FX Rate to Base, which Select All covers." },
  { title: "Delivery configuration", detail: "Format: XML. Period: Last 365 Calendar Days, so the daily value covers a year. Date Format: yyyy-MM-dd. Time Format: HH:mm:ss. Date/Time Separator: ; (semicolon). Leave Include Canceled Trades, Include Audit Trail Fields and Display Account Alias off. Profit and Loss: Default." },
  { title: "Save and run", detail: "Press Continue, then Create. Back on the Flex Queries list press the run arrow beside Invariant, choose Period: Last 365 Calendar Days and Format: XML, and press Run. IBKR downloads a file ending in .xml." },
  { title: "Upload it here", detail: "On this card press Upload a statement and pick that file; it is read at once. A check says when it is in, and the card shows what the statement carried, as of when. A new upload replaces the last. To have it fetched every morning instead, do part 2." },
];

/** The Flex Web Service token and query id, for the morning refresh, in IBKR's own names. */
export const FLEX_TOKEN_STEPS: readonly { title: string; detail: string }[] = [
  { title: "Make the query first", detail: "The Activity Flex Query from part 1, saved as XML with Period: Last 365 Calendar Days. The morning fetch runs that same query." },
  { title: "Open the Flex Web Service settings", detail: "In Client Portal choose Performance & Reports, then Flex Queries. On the right is Flex Web Service Configuration; press the gear beside it." },
  { title: "Turn it on and make a token", detail: "Tick Flex Web Service Status so it is on, then press Generate a New Token. For Token Expiration choose the longest IBKR offers (one year). Leave IP Address empty: the app's server has no fixed address, and IBKR would refuse it." },
  { title: "Copy the token", detail: "Copy the Current Token, a long run of digits. Paste it in Token on this card. It can fetch reports and nothing else: it cannot trade, move money or change your account." },
  { title: "Find the query id", detail: "Back on the Flex Queries list, under Activity Flex Query, press the i beside Invariant. Copy the Query ID, a number, into Query id on this card." },
  { title: "Keep and fetch", detail: "Press Keep and fetch. The app fetches the statement at once and says what it carried. From then on it fetches it every morning at the morning refresh, while the morning refresh is on. When the token expires, the app says so; make a new one here and keep it again." },
];

/**
 * Earlier years (Hamza, 19 Oct 2026: "if users want their since inception
 * data"): a Flex statement covers 365 days at most, so the years before the
 * one fetched every morning come from past statements uploaded once, each
 * lending the days before what the app holds (keepHistory in lib/holdings.ts).
 * The dates are worked out from the first day the card holds, so the person
 * types what they read (Hamza, 20 Oct 2026: "much clearer... with an example").
 */
export function flexHistoryRuns(firstDay: string, runs = 2): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  let to = addDays(firstDay, -1);
  for (let i = 0; i < runs; i++) {
    // 365 days counting both ends, IBKR's longest custom range.
    const from = addDays(to, -364);
    out.push({ from, to });
    to = addDays(from, -1);
  }
  return out;
}

export function flexHistorySteps(firstDay: string | null): Step[] {
  const run = firstDay ? flexHistoryRuns(firstDay, 1)[0] : null;
  return [
    { title: "Open the query in IBKR", detail: "In Client Portal choose Performance & Reports, then Flex Queries, and press the run arrow beside Invariant." },
    {
      title: "Type these dates",
      detail: run
        ? `The app holds your account from ${longDate(firstDay!)}, so this run ends the day before and goes back one year, the most IBKR gives in one run. If the account opened after ${longDate(run.from)}, put its opening day in From instead.`
        : "Period: Custom Date Range. To is the day before the first day this card says the app holds; From is one year before To, or the day the account opened if that is later.",
    },
    { title: "Press Run, then upload the file here", detail: "IBKR downloads a file ending in .xml. Press Upload an earlier year below and pick it. Days the app already holds from a newer statement stay as they are." },
    { title: "Older account? Run the year before too", detail: "Do the same with the dates in the second row, and so on, until From is the day the account opened." },
    { title: "Fixing a year you already uploaded", detail: "Run that year again with the same dates and upload it. It replaces what was kept for those days, so a box ticked later, such as Transfers, counts from then on." },
  ];
}

/** The dates to type for the next runs back, as a small table. */
export function FlexHistoryDates({ firstDay }: { firstDay: string }) {
  const runs = flexHistoryRuns(firstDay);
  return (
    <div className="mt-2 overflow-hidden rounded-[8px] border border-hairline">
      <table className="w-full text-footnote">
        <caption className="sr-only">The dates to type in IBKR for each earlier year</caption>
        <thead className="bg-surface-2 text-left text-text-tertiary">
          <tr>
            <th scope="col" className="px-2.5 py-1.5 font-medium">Run</th>
            <th scope="col" className="px-2.5 py-1.5 font-medium">Period</th>
            <th scope="col" className="px-2.5 py-1.5 font-medium">From</th>
            <th scope="col" className="px-2.5 py-1.5 font-medium">To</th>
            <th scope="col" className="hidden px-2.5 py-1.5 font-medium sm:table-cell">Format</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r, i) => (
            <tr key={r.to} className="border-t border-hairline">
              <td className="px-2.5 py-1.5 text-text-secondary">{i === 0 ? "First" : "Then"}</td>
              <td className="px-2.5 py-1.5 text-text-secondary">Custom Date Range</td>
              <td className="data px-2.5 py-1.5 text-text">{longDate(r.from)}</td>
              <td className="data px-2.5 py-1.5 text-text">{longDate(r.to)}</td>
              <td className="hidden px-2.5 py-1.5 text-text-secondary sm:table-cell">XML</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


/** Both parts, once: the query to upload by hand, then the token for the morning fetch. */
export function FlexGuideBody() {
  return (
    <>
      <p className="mt-1 text-footnote font-medium text-text">Part 1 · The Flex query</p>
      <Steps
        steps={FLEX_QUERY_STEPS}
        extra={{
          3: (
            <ul className="mt-2 space-y-1">
              {FLEX_SECTIONS.map((sec) => (
                <li key={sec.name} className="text-footnote">
                  <span className="text-text">{sec.name}</span>
                  <span className="text-text-tertiary">
                    {" "}
                    · {sec.gives}
                    {sec.needed ? "" : " (optional)"}
                  </span>
                </li>
              ))}
            </ul>
          ),
        }}
      />
      <p className="mt-5 text-footnote font-medium text-text">Part 2 · The token, so it is fetched every morning</p>
      <Steps steps={FLEX_TOKEN_STEPS} note="The query and the token only report: they cannot trade, move money or change your account. The token stays in your vault, read only to fetch, and is never shown again." />
    </>
  );
}
