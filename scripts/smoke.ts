/**
 * Runs the demo through its setups against a running server and fails on any
 * non-200, a horizontal page scroll, or a console error, at phone and laptop
 * width. It also walks the setup wizard once, end to end.
 *
 *   npm run build && STORAGE=demo DEMO_PUBLIC=1 npm start -- -p 3100
 *   SMOKE_URL=http://localhost:3100 SMOKE_SHOTS=./shots npm run smoke
 *   SMOKE_THEME=light npm run smoke
 */
import { mkdirSync } from "node:fs";
import path from "node:path";

import { chromium, type BrowserContext } from "playwright";

import { DEFAULT_PREFERENCES, EMPTY_RECORDS } from "../lib/preferences";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3100";
const SHOTS = process.env.SMOKE_SHOTS;
/** "light" or "dark" renders every page in that theme; unset follows the default. */
const THEME = process.env.SMOKE_THEME;
/** The device scheme the browser reports; dark is the primary theme, so it is the default. */
const SCHEME = THEME === "light" ? "light" : "dark";
const WIDTHS = [
  { name: "phone", width: 375, height: 812 },
  { name: "laptop", width: 1440, height: 900 },
];

type Scenario = { name: string; setup: Record<string, unknown> | null; routes: string[] };
const base = { version: 1, ownerName: "Sample", helperName: null, updated: "2026-10-11T00:00:00.000Z" };
const individual = { ...base, profile: "individual", baseCurrency: "USD", inputs: ["ibkr", "schwab"], tradesOptions: true };
const family = { ...base, profile: "family_office", baseCurrency: "EUR", inputs: ["bank_statements", "fund_reports", "property"], tradesOptions: false, helperName: "Sam" };
const ref = (sample: string, drop: string[] = []) => ({ sample, drop });
const SCENARIOS: Scenario[] = [
  { name: "new", setup: null, routes: ["/welcome", "/setup", "/sign-in", "/sign-up", "/privacy", "/terms", "/cookies", "/open-data", "/annual/2026", "/open-data/research", "/calls", "/calls/cost-b53f328dd5cc"] },
  { name: "individual", setup: { ...individual, methodology: null }, routes: ["/welcome?step=rules", "/welcome?step=money", "/welcome?step=holdings", "/welcome?step=reads", "/welcome?step=done", "/setup?built=1&tour=1", "/setup?tour=5", "/?tour=8", "/customise?tour=11", "/setup?tour=12", "/", "/holdings", "/holdings/AAPL", "/performance", "/performance?window=3M", "/performance?window=Since%20start", "/trades", "/trades?window=Since%20start", "/watchlist", "/check", "/decisions", "/notifications", "/holdings?corr=1Y", "/options", "/methodology", "/methodology/graph", "/setup", "/customise", "/more"] },
  { name: "individual-method", setup: { ...individual, methodology: ref("individual") }, routes: ["/", "/notifications", "/after-close", "/holdings", "/holdings/AAPL", "/performance", "/performance?window=YTD", "/earnings", "/earnings?month=2026-11&day=2026-11-03", "/markets", "/flows", "/trades", "/signals", "/watchlist", "/check", "/check?side=buy&symbol=AAPL&amount=1000", "/decisions", "/decisions?symbol=AAPL", "/decisions?kind=trade&symbol=AAPL&title=Trim&text=Draft", "/todo", "/calendar", "/methodology", "/methodology?view=evaluation", "/methodology/graph", "/methodology/ontology", "/reports", "/newsletters", "/research", "/analyst", "/theses", "/theses/AAPL", "/theses/market/rates-stay-higher", "/community", "/community/quiet-compounder", "/community/macro-first", "/clubs", "/clubs/riverside-investment-club", "/clubs/riverside-investment-club?tab=competitions", "/clubs/riverside-investment-club?tab=members", "/clubs/riverside-investment-club?tab=library", "/clubs/riverside-investment-club?tab=meetings", "/clubs/league", "/clubs/riverside-investment-club?tab=treasury", "/clubs/riverside-investment-club?tab=course", "/methodology?view=shadow", "/methodology?view=versions", "/community/mentors", "/clubs/riverside-investment-club?tab=watchlist", "/methodology/market", "/receipt/2c206941693805cbb7d9a7111598a80ef8f1d5359eb7bb6fe7ec9ddd2596405d", "/clubs/riverside-investment-club/c/riverside-investment-club-autumn-term-challenge-20261001", "/more", "/account", "/help", "/dividends", "/screener", "/screener?view=map&index=ndx", "/screener?view=classes", "/screener?cap=mega&sort=pe&dir=asc", "/top-funds", "/companies", "/companies?q=apple", "/agents", "/agents/company_news", "/agents/thesis_hunter", "/agents/lenses"] },
  { name: "individual-hcmp", setup: { ...individual, methodology: ref("hcmp") }, routes: ["/", "/earnings", "/markets", "/flows", "/holdings", "/performance", "/holdings/AAPL", "/signals", "/methodology", "/methodology?view=evaluation"] },
  { name: "individual-dividend", setup: { ...individual, methodology: ref("dividend_growth") }, routes: ["/", "/dividends", "/holdings", "/performance", "/todo", "/methodology", "/methodology/graph", "/research", "/analyst", "/analyst/0000000000d0"] },
  { name: "individual-draft", setup: { ...individual, methodology: null, draft: ref("dividend_growth", ["payout-ratio", "reinvest"]) }, routes: ["/methodology", "/methodology/graph?draft=1"] },
  { name: "showcase", setup: { ...individual, inputs: ["ibkr"], tradesOptions: false, methodology: ref("showcase"), showcase: true }, routes: ["/?tour=1", "/after-close?tour=2", "/notifications?tour=3", "/setup?tour=4", "/setup?tour=7", "/setup?tour=10", "/setup?tour=12", "/holdings?tour=13", "/performance?tour=14", "/earnings?tour=15", "/signals?tour=16", "/methodology?tour=17", "/customise?tour=18", "/research?tour=19", "/reports?tour=20", "/?tour=21", "/setup", "/methodology?view=evaluation", "/holdings?vm=delivered", "/methodology?view=classes", "/methodology?view=rules", "/methodology?view=figures", "/trades", "/decisions", "/notifications", "/after-close", "/markets-today", "/flows", "/earnings", "/earnings?report=MA%3A2026-10-14#report", "/earnings?decks=all#decks", "/trades?fills=all#fills", "/trades/MA", "/trades/MA?span=6M", "/trades/MA?span=5Y", "/theses", "/theses/MA", "/theses/ASML", "/theses/market/rates-stay-higher", "/community", "/community/quiet-compounder", "/reports", "/screener", "/screener?view=map", "/screener?view=classes", "/screener?pe=15-25&all=1", "/top-funds", "/companies", "/companies?q=ma", "/agents", "/agents/company_news", "/agents/research_agent", "/agents/thesis_hunter", "/company/MA"] },
  { name: "family", setup: { ...family, methodology: null }, routes: ["/", "/holdings", "/allocation", "/income", "/funds", "/properties", "/statements", "/newsletters", "/more", "/customise", "/reports"] },
  { name: "family-method", setup: { ...family, methodology: ref("family_office") }, routes: ["/", "/holdings", "/trades", "/signals", "/check", "/decisions", "/todo", "/calendar", "/methodology", "/methodology/graph", "/research", "/analyst", "/more"] },
  { name: "family-banks-method", setup: { ...family, inputs: ["bank_statements"], methodology: ref("family_office") }, routes: ["/"] },
];

/** The pages a person adds on Customise; off by default, so a scenario that visits one adds it first. */
const PRACTICE_PAGES: Record<string, string> = { "/trades": "trade_log", "/check": "trade_check", "/decisions": "decision_log", "/todo": "todo_list" };

async function setCookie(ctx: BrowserContext, setup: Record<string, unknown> | null, routes: readonly string[] = []) {
  await ctx.clearCookies();
  if (setup) await ctx.addCookies([{ name: "pos_demo_setup", value: encodeURIComponent(JSON.stringify(setup)), url: BASE }]);
  const practices = [...new Set(routes.map((r) => PRACTICE_PAGES[r.split("?")[0]]).filter(Boolean))];
  if (practices.length) await ctx.addCookies([{ name: "pos_demo_prefs", value: encodeURIComponent(JSON.stringify({ preferences: { ...DEFAULT_PREFERENCES, practices }, records: EMPTY_RECORDS })), url: BASE }]);
  if (THEME) await ctx.addCookies([{ name: "pos_theme", value: THEME, url: BASE }]);
}

async function main() {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  // Every page below opens as if the app was in use a moment ago, so the hour's greeting does not cover it; the greeting has its own step.
  const fresh = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const c = await fresh(options);
    await c.addInitScript(() => {
      try {
        window.localStorage.setItem("pos:last-greeted", String(Date.now()));
        window.sessionStorage.setItem("pos:opened", "1");
      } catch {}
    });
    return c;
  };
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const failures: string[] = [];
  let pages = 0;

  for (const size of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: SCHEME });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    // A server error inside a streamed page answers 200 and shows the error screen; React reports it as a page error.
    page.on("pageerror", (e) => errors.push(e.message));
    for (const sc of SCENARIOS) {
      await setCookie(ctx, sc.setup, sc.routes);
      for (const route of sc.routes) {
        errors.length = 0;
        const res = await page.goto(BASE + route, { waitUntil: "networkidle" });
        pages += 1;
        const where = `${size.name} ${sc.name} ${route}`;
        if (res?.status() !== 200) failures.push(`${where}: HTTP ${res?.status()}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) failures.push(`${where}: scrolls sideways by ${overflow}px`);
        if (errors.length) failures.push(`${where}: console error ${errors[0]}`);
        if (/This page couldn.t load/i.test(await page.locator("body").innerText())) failures.push(`${where}: the error screen`);
        // Every label a chart draws is whole: inside its drawing and inside its card.
        const clipped = await page.evaluate(() => {
          const out: string[] = [];
          for (const t of Array.from(document.querySelectorAll("svg text"))) {
            const svg = t.closest("svg");
            const card = t.closest("section");
            const r = t.getBoundingClientRect();
            if (!svg || !r.width) continue;
            for (const box of [svg.getBoundingClientRect(), card?.getBoundingClientRect()]) {
              if (box && (r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1)) {
                out.push((t.textContent ?? "").trim());
                break;
              }
            }
          }
          return out;
        });
        if (clipped.length) failures.push(`${where}: chart labels cut off: ${clipped.slice(0, 5).join(", ")}`);
        // ...and never drawn over another label of the same chart.
        const overlapping = await page.evaluate(() => {
          const out: string[] = [];
          for (const svg of Array.from(document.querySelectorAll("svg"))) {
            const texts = Array.from(svg.querySelectorAll("text"))
              .map((t) => ({ t: (t.textContent ?? "").trim(), r: t.getBoundingClientRect() }))
              .filter((x) => x.t && x.r.width);
            for (let i = 0; i < texts.length; i++)
              for (let j = i + 1; j < texts.length; j++) {
                const a = texts[i].r;
                const b = texts[j].r;
                const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                if (w > 2 && h > 3) out.push(`${texts[i].t} / ${texts[j].t}`);
              }
          }
          return out;
        });
        if (overlapping.length) failures.push(`${where}: chart labels overlap: ${overlapping.slice(0, 5).join(", ")}`);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${sc.name}-${size.name}${route === "/" ? "-overview" : route.replace(/[/?=]/g, "-")}.png`), fullPage: true });
      }
    }
    // A new visitor is sent to Welcome, the first setup.
    await setCookie(ctx, null);
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    if (!page.url().endsWith("/welcome")) failures.push(`${size.name}: a new visitor landed on ${page.url()}, not /welcome`);
    await ctx.close();
  }

  // Notifications: the individual sample's new option trades ask for their reason; keeping one answers it and the question clears.
  {
    const tctx = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: SCHEME });
    const tpage = await tctx.newPage();
    await setCookie(tctx, { ...individual, methodology: null });
    await tpage.goto(BASE + "/notifications", { waitUntil: "networkidle" });
    const asks = await tpage.getByRole("button", { name: "Keep the reason" }).count();
    if (!asks) failures.push("notifications: the sample's new trade does not ask for its reason");
    else {
      await tpage.getByLabel("Why you made this trade").first().fill("Selling premium above my level.");
      await tpage.getByRole("button", { name: "Keep the reason" }).first().click();
      await tpage.waitForFunction((n) => document.querySelectorAll("textarea[name=reason]").length < n, asks, { timeout: 15000 }).catch(() => failures.push("notifications: keeping a reason did not clear the trade's question"));
      if (SHOTS) await tpage.screenshot({ path: path.join(SHOTS, "notifications-trade-phone.png"), fullPage: true });
    }
    // Portfolios: two accounts make two portfolios; looking through Schwab's leaves IBKR's positions out.
    await tpage.goto(BASE + "/holdings", { waitUntil: "networkidle" });
    const lens = tpage.locator("details:has(> summary :text('Portfolio'))").first();
    if (!(await lens.count())) failures.push("portfolios: no switch at the top with two accounts");
    else {
      await lens.locator("summary").click();
      const schwab = lens.getByRole("menuitemradio", { name: /Schwab/ });
      if (!(await schwab.count())) failures.push("portfolios: the switch does not offer Schwab's portfolio");
      else {
        await schwab.first().click();
        await tpage.waitForLoadState("networkidle");
        await tpage.waitForTimeout(1500);
        await tpage.goto(BASE + "/holdings", { waitUntil: "networkidle" });
        // The portfolio chosen is the one the switch names after the page is read again.
        if (!/Schwab/.test(await tpage.locator("details:has(> summary :text('Portfolio')) summary").first().innerText())) failures.push("portfolios: the switch does not name Schwab's portfolio after choosing it");
        const text = await tpage.locator("main, body").first().innerText();
        if (/NVDA|MSFT/.test(text) || !/VOO/.test(text)) failures.push("portfolios: Schwab's lens still shows IBKR's positions, or not Schwab's");
        if (SHOTS) await tpage.screenshot({ path: path.join(SHOTS, "holdings-schwab-lens-phone.png"), fullPage: true });
        const bar = tpage.locator("details:has(> summary :text('Portfolio'))").first();
        await bar.locator("summary").click();
        await bar.getByRole("menuitemradio", { name: /All portfolios/ }).click();
        await tpage.waitForLoadState("networkidle");
      }
    }
    await tctx.close();
  }
  {
    // The methodology graph: a drag released before React renders must not take the page down.
    const gctx = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: SCHEME, hasTouch: true, isMobile: true });
    await setCookie(gctx, { ...individual, methodology: ref("individual") });
    const gpage = await gctx.newPage();
    const gerrors: string[] = [];
    gpage.on("pageerror", (e) => gerrors.push(e.message));
    await gpage.goto(BASE + "/methodology/graph", { waitUntil: "networkidle" });
    await gpage.evaluate(() => {
      const svg = document.querySelector("svg.touch-none");
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const o = { bubbles: true, pointerId: 1, pointerType: "touch", isPrimary: true, clientX: r.left + 20, clientY: r.top + 20 };
      svg.dispatchEvent(new PointerEvent("pointerdown", o));
      svg.dispatchEvent(new PointerEvent("pointermove", { ...o, clientX: o.clientX + 30 }));
      svg.dispatchEvent(new PointerEvent("pointerup", { ...o, clientX: o.clientX + 30 }));
    });
    await gpage.waitForTimeout(1000);
    if (gerrors.length || /couldn.t load/i.test(await gpage.locator("body").innerText())) failures.push(`graph: a quick drag broke the page (${gerrors[0] ?? "error screen"})`);
    await gctx.close();
  }

  // The demo's MCP server, as a person's own Claude reaches it: no sign-in, the showcase, read-only tools; and its address on Setup.
  {
    const rpc = async (body: unknown) => {
      const res = await fetch(BASE + "/api/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify(body) });
      return { status: res.status, json: (await res.json().catch(() => null)) as { result?: Record<string, unknown> } | null };
    };
    const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } } });
    if (init.status !== 200 || (init.json?.result?.serverInfo as { name?: string } | undefined)?.name !== "portfolio-os") failures.push(`mcp: initialize answered ${init.status}`);
    const listed = (await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json?.result?.tools as { name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean } }[] | undefined;
    if (!listed?.length || !listed.every((t) => t.annotations.readOnlyHint === !["propose_newsletter_senders", "write_thesis", "record_decision", "rate_finding", "get_studies_to_write", "write_study", "report_price_checks"].includes(t.name) && !t.annotations.destructiveHint)) failures.push("mcp: tools/list is empty or lists a tool that is not read-only (but those that write to the person's own vault for review) or is destructive");
    const over = (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_overview", arguments: {} } })).json?.result as { content?: { text: string }[]; isError?: boolean } | undefined;
    if (!over || over.isError || !/Net worth: \$/.test(over.content?.[0]?.text ?? "")) failures.push(`mcp: get_overview did not read the showcase (${(over?.content?.[0]?.text ?? "no answer").slice(0, 120)})`);
    const sctx = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: SCHEME });
    await setCookie(sctx, { ...individual, methodology: null });
    const spage = await sctx.newPage();
    await spage.goto(BASE + "/setup", { waitUntil: "networkidle" });
    const setupText = await spage.locator("main").first().innerText();
    if (!/Your own Claude/i.test(setupText) || !setupText.includes("/api/mcp")) failures.push("mcp: Setup does not show Your own Claude with the server's address");
    if (SHOTS) await spage.locator("h2", { hasText: /Your own Claude/i }).scrollIntoViewIfNeeded().then(() => spage.screenshot({ path: path.join(SHOTS, "setup-claude-phone.png") })).catch(() => undefined);
    await sctx.close();
  }

  // Live prices: the demo is a frozen snapshot, so its route reads nothing and says so.
  {
    const res = await fetch(BASE + "/api/live", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbols: ["AAPL"] }) });
    if (res.status !== 404) failures.push(`live: the demo's /api/live answered ${res.status}, not 404`);
  }

  // Post-earnings reports: the showcase's Earnings screen links each holding's latest report; the page is HTML and the download a PDF.
  {
    const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: SCHEME });
    await setCookie(dctx, SCENARIOS.find((sc) => sc.name === "showcase")!.setup, ["/"]);
    const dpage = await dctx.newPage();
    await dpage.goto(BASE + "/earnings?decks=all#decks", { waitUntil: "networkidle" });
    const href = await dpage.locator('a[href^="/api/earnings/deck"]').first().getAttribute("href").catch(() => null);
    if (!href) failures.push("decks: the Earnings screen links no deck");
    else {
      const page = await dpage.request.get(BASE + href.replace(/&format=pdf$/, ""));
      const html = await page.text();
      if (page.status() !== 200 || !/text\/html/.test(page.headers()["content-type"] ?? "") || /\bn\/a\b/i.test(html.replace(/<[^>]+>/g, " "))) failures.push(`decks: the report page answered ${page.status()} ${page.headers()["content-type"]}`);
      const pdf = await dpage.request.get(BASE + href.replace(/&format=pdf$/, "") + "&format=pdf");
      const body = await pdf.body();
      if (pdf.status() !== 200 || !/application\/pdf/.test(pdf.headers()["content-type"] ?? "") || body.subarray(0, 5).toString() !== "%PDF-") failures.push(`decks: the report PDF answered ${pdf.status()} ${pdf.headers()["content-type"]}`);
    }
    if (SHOTS) await dpage.locator("#decks").scrollIntoViewIfNeeded().then(() => dpage.screenshot({ path: path.join(SHOTS, "earnings-decks-desktop.png") })).catch(() => undefined);
    await dctx.close();
  }

  // The greeting: the first open on a device greets by the clock with the day's quote, closes on a tap, and does not show again on the next load.
  for (const size of WIDTHS) {
    const gctx = await fresh({ viewport: { width: size.width, height: size.height }, colorScheme: SCHEME });
    await setCookie(gctx, SCENARIOS.find((sc) => sc.name === "showcase")!.setup, ["/"]);
    const gpage = await gctx.newPage();
    await gpage.goto(BASE + "/", { waitUntil: "networkidle" });
    const hello = gpage.locator("[data-greeting]");
    const text = await hello.innerText({ timeout: 5000 }).catch(() => "");
    if (!/Good (morning|afternoon|evening)|Happy earnings season/i.test(text) || !/“.+”/s.test(text)) failures.push(`greeting (${size.name}): no greeting with a quote on the first open (${text.slice(0, 80)})`);
    if (SHOTS) await gpage.screenshot({ path: path.join(SHOTS, `greeting-${size.name}.png`) });
    await hello.click().catch(() => undefined);
    await hello.waitFor({ state: "detached", timeout: 5000 }).catch(() => failures.push(`greeting (${size.name}): a tap did not close it`));
    await gpage.reload({ waitUntil: "networkidle" });
    if (await hello.count()) failures.push(`greeting (${size.name}): shown again on the next load`);
    // The clocks are set back from a page outside the app, so the greeting cannot note itself or the visit first.
    const setClocks = async (greetedMin: number, activeMin: number) => {
      await gpage.goto(BASE + "/icon.svg");
      await gpage.evaluate(([g, a]) => {
        window.localStorage.setItem("pos:last-greeted", String(Date.now() - g * 60_000));
        window.localStorage.setItem("pos:last-active", String(Date.now() - a * 60_000));
      }, [greetedMin, activeMin] as const);
    };
    // Away a quarter hour or more: greeted again once an hour has passed. Used in the last quarter hour: never.
    for (const [greeted, active, due] of [[50, 20, false], [70, 20, true], [70, 5, false]] as const) {
      await setClocks(greeted, active);
      await gpage.goto(BASE + "/", { waitUntil: "networkidle" });
      const seen = await hello.waitFor({ timeout: 3000 }).then(() => true, () => false);
      if (seen !== due) failures.push(`greeting (${size.name}): ${seen ? "shown" : "not shown"} ${greeted} minutes after the last greeting and ${active} after the last use`);
    }
    // Quitting the app ends its window: a launch after a quarter hour away greets again however recent the last greeting; one within it does not.
    for (const [active, due] of [[20, true], [5, false]] as const) {
      await setClocks(0, active);
      const relaunched = await gctx.newPage();
      await relaunched.goto(BASE + "/", { waitUntil: "networkidle" });
      const seen = await relaunched.locator("[data-greeting]").waitFor({ timeout: 3000 }).then(() => true, () => false);
      if (seen !== due) failures.push(`greeting (${size.name}): ${seen ? "shown" : "not shown"} on a launch ${active} minutes after the last use`);
      await relaunched.close();
    }
    await gctx.close();
  }

  // The first setup on Welcome, end to end: family office, untick property, add IBKR, name, build.
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, colorScheme: SCHEME });
  const page = await ctx.newPage();
  await page.goto(BASE + "/welcome", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /Family office/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("checkbox", { name: /Real estate/ }).click();
  await page.getByRole("checkbox", { name: /Interactive Brokers/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill("Sample");
  await page.getByRole("button", { name: "Continue" }).click();
  const screens = await page.locator("section:not([hidden]) .text-body").allInnerTexts();
  if (screens.includes("Real estate")) failures.push("wizard: Real estate still listed after unticking it");
  await page.getByRole("button", { name: "Build my app" }).click();
  // The second part: what to give the app, one group per step, Setup's own cards; Continue through, then open the app.
  await page.waitForURL(BASE + "/welcome?step=rules", { timeout: 15000 }).catch(() => failures.push(`wizard: ended on ${page.url()}, not Welcome's second part`));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "welcome-built-phone.png"), fullPage: true });
  for (const step of ["money", "holdings", "reads", "done"]) {
    await page.getByRole("link", { name: "Continue" }).click();
    await page.waitForURL(BASE + `/welcome?step=${step}`, { timeout: 15000 }).catch(() => failures.push(`wizard: Continue did not reach step ${step} (${page.url()})`));
    if (step === "holdings" && !(await page.locator("#theses").count()) && !(await page.getByText("No listed holding yet").count())) failures.push("wizard: the holdings step draws neither the Theses card nor the sentence for an empty book");
  }
  await page.getByRole("button", { name: "Open the app" }).click();
  await page.waitForURL(BASE + "/setup?built=1", { timeout: 15000 }).catch(() => failures.push(`wizard: ended on ${page.url()}, not Setup's inputs`));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "welcome-finished-phone.png"), fullPage: true });
  const nav = await page.locator("nav[aria-label=Sections]").first().innerText();
  if (!/Fixed income/.test(nav) || /Real estate/.test(nav)) failures.push(`wizard: nav does not follow the inputs (${nav.replace(/\s+/g, " ")})`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "wizard-result-phone.png"), fullPage: true });

  // The builder, end to end in the demo: suggest a methodology on Setup, remove one rule, confirm, see the dashboard reshaped.
  await page.goto(BASE + "/setup#methodology", { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Try a fictional sample" }).click();
  await page.getByRole("button", { name: "Suggest one from my portfolio" }).click();
  await page.waitForURL(/\/methodology/, { timeout: 15000 }).catch(() => failures.push(`builder: Suggest ended on ${page.url()}, not the draft`));
  await page.getByRole("button", { name: "Confirm and rebuild" }).waitFor({ timeout: 15000 }).catch(() => failures.push("builder: no draft appeared after Suggest"));
  const rulesTab = page.locator('nav[aria-label="Parts of the methodology"] a', { hasText: "Rules" });
  const rulesBefore = await rulesTab.innerText().catch(() => "");
  await page.getByRole("button", { name: /^Remove / }).last().click();
  // A server action round trip: wait for the page to show its result, not for the network to go quiet.
  await page.getByRole("button", { name: /Put back 1 removed/ }).waitFor({ timeout: 15000 }).catch(() => failures.push("builder: no way to put a removed element back"));
  const rulesAfter = await rulesTab.innerText().catch(() => "");
  if (rulesBefore && rulesBefore === rulesAfter) failures.push(`builder: removing a rule left the count at "${rulesAfter}"`);
  await page.getByRole("button", { name: "Confirm and rebuild" }).click();
  await page.getByRole("button", { name: "Confirm and rebuild" }).waitFor({ state: "detached", timeout: 15000 }).catch(() => failures.push("builder: confirming did not close the draft"));
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const heading = await page.locator("main, body").first().innerText();
  if (!/Shaped by/.test(heading)) failures.push("builder: the Overview is not shaped by the confirmed methodology");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "builder-result-phone.png"), fullPage: true });

  // The graph explorer: a node can be selected and its details read.
  await page.goto(BASE + "/methodology/graph", { waitUntil: "networkidle" });
  const node = page.locator("svg [data-node]").first();
  if (!(await node.isVisible().catch(() => false))) failures.push("graph: no nodes drawn");
  else {
    await node.click();
    const aside = await page.locator("aside[aria-live]").innerText();
    if (!/Clear selection/.test(aside)) failures.push("graph: selecting a node did not open its details");
  }
  // Notifications: Dismiss takes one alert out of Now, and the count says so.
  await page.goto(BASE + "/notifications", { waitUntil: "networkidle" });
  const dismissBefore = await page.getByRole("button", { name: "Dismiss" }).count();
  if (!dismissBefore) failures.push("notifications: no alert to dismiss in the demo");
  else {
    await page.getByRole("button", { name: "Dismiss" }).first().click();
    await page.getByText(/1 dismissed/).waitFor({ timeout: 15000 }).catch(() => failures.push("notifications: Dismiss did not take the alert out of Now"));
    const dismissAfter = await page.getByRole("button", { name: "Dismiss" }).count();
    if (dismissAfter !== dismissBefore - 1) failures.push(`notifications: ${dismissBefore} alerts before Dismiss, ${dismissAfter} after`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "notifications-dismissed-phone.png"), fullPage: true });
  }
  // Reviews: the demo's weekly is embedded as its own page and downloads as a PDF, both made from the review on the screen.
  await page.goto(BASE + "/reports", { waitUntil: "networkidle" });
  const pdfLink = page.getByRole("link", { name: "Download the PDF" });
  const frame = page.locator('iframe[src^="/api/reports/deck?id="]');
  if (!(await pdfLink.count()) || !(await frame.count())) failures.push("reviews: the demo's review is not embedded with its PDF");
  else {
    const view = await page.request.get(BASE + ((await frame.first().getAttribute("src")) ?? ""));
    const html = await view.text();
    if (view.status() !== 200 || !/text\/html/.test(view.headers()["content-type"] ?? "") || !/<section class="sheet cover"/.test(html) || !/class="kicker">01 · /.test(html) || /\bn\/a\b/i.test(html)) failures.push(`reviews: the review's page answered ${view.status()} ${view.headers()["content-type"] ?? ""}`);
    const res = await page.request.get(BASE + ((await pdfLink.first().getAttribute("href")) ?? ""));
    const body = await res.body();
    if (res.status() !== 200 || !/application\/pdf/.test(res.headers()["content-type"] ?? "") || body.subarray(0, 5).toString() !== "%PDF-") failures.push(`reviews: the PDF answered ${res.status()} ${res.headers()["content-type"] ?? ""}`);
  }
  // Methodology to-do: Mark checked files a decision and moves the rule to Decided.
  await page.goto(BASE + "/todo", { waitUntil: "networkidle" });
  const checkBefore = await page.getByRole("button", { name: "Mark checked" }).count();
  if (!checkBefore) failures.push("todo: no rule to mark checked in the demo");
  else {
    await page.getByRole("button", { name: "Mark checked" }).first().click();
    await page.getByText(/^Checked \d{4}-\d{2}-\d{2}: /).first().waitFor({ timeout: 15000 }).catch(() => failures.push("todo: Mark checked did not move the rule to Decided"));
    const checkAfter = await page.getByRole("button", { name: "Mark checked" }).count();
    if (checkAfter !== checkBefore - 1) failures.push(`todo: ${checkBefore} rules to check before, ${checkAfter} after`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "todo-checked-phone.png"), fullPage: true });
  }
  await ctx.close();
  await browser.close();

  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log(`smoke ok: ${pages} pages across ${SCENARIOS.length} setups at ${WIDTHS.length} widths, and the first setup end to end`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
