/**
 * The greeting when the person comes back to the app, never while they are using it: good morning,
 * afternoon or evening by the person's own clock, happy earnings season in
 * the weeks the results come out, and one quote for the day (Hamza's list,
 * approved 15 Oct 2026). A quote shows its words and who said it; a line no
 * one can be shown to have said shows its words alone, and a satirical line
 * carries the moment it came from. Pure: the overlay and the checks read it.
 */

export type QuoteKind = "investor" | "ceo" | "satire" | "saying";
export type Quote = { text: string; by: string | null; context?: string; kind: QuoteKind };

const q = (kind: QuoteKind, text: string, by: string | null, context?: string): Quote => (context ? { kind, text, by, context } : { kind, text, by });

export const QUOTES: readonly Quote[] = [
  // Investors
  q("investor", "Those who want to build wealth, concentrate; those who want to manage wealth, diversify.", null),
  q("investor", "It's far better to buy a wonderful company at a fair price than a fair company at a wonderful price.", "Warren Buffett"),
  q("investor", "Time is the friend of the wonderful business, the enemy of the mediocre.", "Warren Buffett"),
  q("investor", "We simply attempt to be fearful when others are greedy and to be greedy only when others are fearful.", "Warren Buffett"),
  q("investor", "Price is what you pay; value is what you get.", "Warren Buffett"),
  q("investor", "You only find out who is swimming naked when the tide goes out.", "Warren Buffett"),
  q("investor", "We believe that a policy of portfolio concentration may well decrease risk if it raises, as it should, both the intensity with which an investor thinks about a business and the comfort-level he must feel with its economic characteristics before buying into it.", "Warren Buffett"),
  q("investor", "In the short run, the market is a voting machine, but in the long run, it is a weighing machine.", "Benjamin Graham"),
  q("investor", "The investor's chief problem, and even his worst enemy, is likely to be himself.", "Benjamin Graham"),
  q("investor", "It is remarkable how much long-term advantage people like us have gotten by trying to be consistently not stupid, instead of trying to be very intelligent.", "Charlie Munger"),
  q("investor", "In the stock market, the key organ isn't the brain. It's the stomach.", "Peter Lynch"),
  q("investor", "Time is on your side in the stock market.", "Peter Lynch"),
  q("investor", "Far more money has been lost by investors preparing for corrections, or trying to anticipate corrections, than has been lost in corrections themselves.", "Peter Lynch"),
  q("investor", "Bull markets are born on pessimism, grow on skepticism, mature on optimism and die on euphoria.", "John Templeton"),
  q("investor", "To buy when others are despondently selling and to sell when others are greedily buying requires the greatest fortitude and pays the greatest reward.", "John Templeton"),
  q("investor", "Stay the course. Regardless of what happens in the markets, stick to your investment program.", "John Bogle"),
  q("investor", "Being too far ahead of your time is indistinguishable from being wrong.", "Howard Marks"),
  q("investor", "We may never know where we're going, or when the tide will turn, but we had better have a good idea where we are.", "Howard Marks"),
  q("investor", "Never, ever invest in the present.", "Stanley Druckenmiller"),
  q("investor", "The way to build long-term returns is through preservation of capital and home runs.", "Stanley Druckenmiller"),
  q("investor", "It's not whether you're right or wrong that's important, but how much money you make when you're right and how much you lose when you're wrong.", "George Soros"),
  q("investor", "It never was my thinking that made the big money for me. It was always my sitting.", "Jesse Livermore"),
  q("investor", "Men who can both be right and sit tight are uncommon.", "Jesse Livermore"),
  q("investor", "Doing nothing takes iron discipline in the face of the fears and temptations of the markets.", "Terry Smith"),
  q("investor", "Someone once said that no one ever got poor by taking profits. This may be true but I doubt they got very rich by this approach either.", "Terry Smith"),
  q("investor", "Only by looking further out than the short-term crowd can we expect to beat them.", "Nick Sleep"),
  q("investor", "A cool head under pressure is what is required.", "Nick Sleep"),
  // CEOs
  q("ceo", "It's all about the long term. We believe that a fundamental measure of our success will be the shareholder value we create over the long term.", "Jeff Bezos"),
  q("ceo", "People with very high expectations have very low resilience, and unfortunately, resilience matters in success.", "Jensen Huang"),
  q("ceo", "Our industry does not respect tradition. It only respects innovation.", "Satya Nadella"),
  q("ceo", "You can't connect the dots looking forward; you can only connect them looking backwards. So you have to trust that the dots will somehow connect in your future.", "Steve Jobs"),
  q("ceo", "Move fast and break things. The idea is that if you never break anything, you're probably not moving fast enough.", "Mark Zuckerberg"),
  q("ceo", "If something is important enough, you should try, even if the probable outcome is failure.", "Elon Musk"),
  q("ceo", "Stagnation is almost certain, and stagnation is slow-motion failure.", "Tobi Lütke"),
  // Satire, each with its moment
  q("satire", "THIS IS A GREAT TIME TO BUY!!! DJT", "Donald Trump", "Truth Social, 9:37 a.m. ET, 9 April 2025. The 90-day tariff pause came at 1:18 p.m., and the S&P 500 closed up 9.5%."),
  q("satire", "BE COOL! Everything is going to work out well.", "Donald Trump", "Truth Social, the morning of 9 April 2025, hours before the tariff pause."),
  q("satire", "What a day, but more great days coming!!!", "Donald Trump", "Truth Social, the evening of 9 April 2025, after the tariff pause sent stocks up 9.5%."),
  q("satire", "They were getting yippy, you know, they were getting a little bit yippy, a little bit afraid.", "Donald Trump", "Explaining the tariff pause to reporters, 9 April 2025."),
  q("satire", "The Taco theory: Trump Always Chickens Out.", "Robert Armstrong", "May 2025, on markets learning to buy the dip after each tariff threat was walked back."),
  q("satire", "You call that chickening out? It's called negotiation.", "Donald Trump", "Asked about the TACO trade in the Oval Office, 28 May 2025."),
  q("satire", "We could all retire in six months if we let this lady manage our portfolios.", "Scott Jennings", "On Nancy Pelosi's retirement, November 2025."),
  q("satire", "2024: Pelosi Tracker +54%. The average hedge fund +10.7%.", null, "A tracker copying the trades disclosed for Paul Pelosi beat nearly every hedge fund that year."),
  q("satire", "Bear Stearns is fine. Do not take your money out.", "Jim Cramer", "Mad Money, 11 March 2008. Bear Stearns was sold to JPMorgan five days later."),
  q("satire", "Even the Inverse Cramer ETF couldn't make it.", null, "Launched March 2023 to bet against Jim Cramer's picks; closed February 2024."),
  q("satire", "Am considering taking Tesla private at $420. Funding secured.", "Elon Musk", "Twitter, 7 August 2018. The SEC disagreed about the funding."),
  q("satire", "GUH.", "r/wallstreetbets", "October 2019: the sound a member made on losing about $45,000 on leveraged Apple puts."),
  q("satire", "Haha money printer go brrrr.", "The internet", "March 2020, on the Federal Reserve."),
  q("satire", "October. This is one of the peculiarly dangerous months to speculate in stocks in. The others are July, January, September, April, November, May, March, June, December, August, and February.", "Mark Twain", "Pudd'nhead Wilson, 1894."),
  // Sayings no one can be shown to have said: the words alone
  q("saying", "Compound interest is the eighth wonder of the world. He who understands it, earns it; he who doesn't, pays it.", null),
  q("saying", "The market can remain irrational longer than you can remain solvent.", null),
  q("saying", "The stock market is a device for transferring money from the impatient to the patient.", null),
  q("saying", "The first rule of compounding: never interrupt it unnecessarily.", null),
  q("saying", "Know what you own, and know why you own it.", null),
  q("saying", "The four most dangerous words in investing are 'this time it's different.'", null),
  q("saying", "Time is your friend; impulse is your enemy.", null),
  q("saying", "Buy when there's blood in the streets.", null),
];

/** An hour after the last greeting before a return greets again (Hamza, 16 Oct 2026). */
export const GREETING_GAP_MS = 60 * 60 * 1000;

/** Away this long with no tap, key or scroll on the device before an open greets: activity in the last quarter hour never meets a greeting (Hamza, 4 Nov 2026). */
export const AWAY_MS = 15 * 60 * 1000;

/**
 * Whether the greeting shows, asked only when the app is opened or brought
 * back into view, never while it is in use (Hamza, 4 Nov 2026: "it should
 * greet the user back"). Never within AWAY_MS of the device's last activity;
 * past it, on the first open on a device, on a launch after the app was quit
 * (a page load that is not a reload and finds no note from this window, as
 * after quitting on a Mac or swiping the app away on a phone; Hamza, 15 Oct
 * 2026), or once GREETING_GAP_MS has passed since the last greeting.
 */
export function shouldGreet(o: { lastGreeted: number | null; lastActive: number | null; now: number; launch?: boolean }): boolean {
  const { lastGreeted, lastActive, now } = o;
  if (lastActive !== null && Number.isFinite(lastActive) && now - lastActive < AWAY_MS) return false;
  return !!o.launch || lastGreeted === null || !Number.isFinite(lastGreeted) || now - lastGreeted >= GREETING_GAP_MS;
}

/** A launch: a load that is not a reload or a step back, in a window with no note of an earlier load. */
export function isLaunch(navigation: string | undefined, notedInWindow: boolean): boolean {
  return !notedInWindow && navigation !== "reload" && navigation !== "back_forward";
}

/** Good morning from 5:00, good afternoon from 12:00, good evening from 18:00 until 5:00, by the person's own clock. */
export function timeGreeting(hour: number): "Good morning" | "Good afternoon" | "Good evening" {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Earnings season: from the 10th of the month after a quarter ends to the
 * 20th of the month after that (mid-January to late February, and the same
 * in April and May, July and August, October and November), when most US
 * companies report.
 */
export function isEarningsSeason(month: number, day: number): boolean {
  if ([1, 4, 7, 10].includes(month)) return day >= 10;
  if ([2, 5, 8, 11].includes(month)) return day <= 20;
  return false;
}

/** Days since 1 Jan 1970 for a local calendar date, so every open on one day shows the same quote. */
const dayNumber = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);

/** The quote for a local calendar date: a fixed walk through the list that steps by a number prime to its length, so neighbouring days differ. */
export function quoteOfDay(y: number, m: number, d: number, list: readonly Quote[] = QUOTES): Quote {
  const n = list.length;
  let step = 7;
  while (gcd(step, n) !== 1) step += 1;
  return list[(((dayNumber(y, m, d) * step) % n) + n) % n];
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/** A quote's key in the queue: a short hash of its words, so the queue survives a quote added or removed. */
export function quoteKey(q: Quote): string {
  let h = 5381;
  for (let i = 0; i < q.text.length; i++) h = ((h * 33) ^ q.text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Every quote in a fixed walk through the list that steps by a number prime to its length, so neighbours in the list are not neighbours on screen. */
function walk(list: readonly Quote[]): Quote[] {
  const n = list.length;
  let step = 7;
  while (gcd(step, n) !== 1) step += 1;
  return Array.from({ length: n }, (_, i) => list[(i * step) % n]);
}

/**
 * The next quote for a person (Hamza, 4 Nov 2026: "the user never really sees
 * the same quotes"): one never shown first, in the walk's order, else the one
 * shown longest ago, so each comes round only after every other has shown.
 * `shown` is the person's own record, oldest first, kept in their vault and
 * shared by every device they use, never one queue per device or a quote per
 * day, which put the same quote on each device on the same day.
 */
export function nextQuote(shown: readonly string[], list: readonly Quote[] = QUOTES): Quote {
  const order = walk(list);
  const at = new Map<string, number>();
  shown.forEach((k, i) => at.set(k, i));
  let best = order[0];
  let bestAt = Infinity;
  for (const q of order) {
    const i = at.get(quoteKey(q)) ?? -1;
    if (i < bestAt) {
      best = q;
      bestAt = i;
      if (i === -1) break;
    }
  }
  return best;
}

/** The record after a quote is shown: that quote moved to the end, keys no longer in the list dropped, one entry a quote. */
export function withShown(shown: readonly unknown[], key: string, list: readonly Quote[] = QUOTES): string[] {
  const valid = new Set(list.map(quoteKey));
  const out = shown.filter((k): k is string => typeof k === "string" && valid.has(k) && k !== key);
  return valid.has(key) ? [...new Set(out), key] : [...new Set(out)];
}

/** Two records laid together (the vault's and this device's, which may know of a greeting the page has not read back yet): the device's on top, in its order. */
export function mergedShown(kept: readonly unknown[], device: readonly unknown[], list: readonly Quote[] = QUOTES): string[] {
  let out = withShown(kept, "", list);
  for (const k of device) if (typeof k === "string") out = withShown(out, k, list);
  return out;
}

/** The whole greeting for a local date and hour: the headline, the line under it, and the quote (the person's next, else the day's). */
export function greetingFor(local: { y: number; m: number; d: number; hour: number }, name: string | null, quote?: Quote): { title: string; eyebrow: string | null; quote: Quote } {
  const hello = timeGreeting(local.hour);
  const first = name?.trim().split(/\s+/)[0] || null;
  const salute = first ? `${hello}, ${first}` : hello;
  const season = isEarningsSeason(local.m, local.d);
  return { title: season ? "Happy earnings season" : salute, eyebrow: season ? salute : null, quote: quote ?? quoteOfDay(local.y, local.m, local.d) };
}
