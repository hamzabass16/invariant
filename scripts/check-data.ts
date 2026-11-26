/**
 * Holds Add data (lib/custom-data.ts): only a public https address is read,
 * an API's answer becomes points by the fields the person named or a
 * sentence naming the field that was missing, a Claude reading keeps only
 * figures with their page, a failed reading keeps the last good one, each
 * piece is read again on its own schedule, and the demo's samples are
 * fictional. Run: npm run check:data
 */
import { readFileSync } from "node:fs";

import {
  addressWithKey,
  checkAddress,
  customDataFileSchema,
  DATA_FORMATS,
  DATA_SCREENS,
  dataDefSchema,
  dataDue,
  dataIdFor,
  dataOn,
  dataRequestBody,
  formatData,
  hostOf,
  isPrivateIp,
  nextReading,
  parseDataResponse,
  pickPath,
  pointsFromAnswer,
  toDate,
  type ApiSource,
  type DataDef,
} from "../lib/custom-data";
import { SCREENS, SLOTS } from "../lib/ontology";
import { VAULT_KEYS } from "../lib/vault-keys";
import { setZoneSource } from "../lib/time";

// The checks read days and clocks in one zone, as a person in Athens would see them.
setZoneSource(() => "Europe/Athens");

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` (${detail})` : ""}`);
}
const throws = (fn: () => unknown): string => {
  try {
    fn();
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : "thrown";
  }
};

// --- only public addresses -------------------------------------------------
check("a public https address may be read", checkAddress("https://api.example.org/v1/series?id=1") === null);
check("http is refused", /https/.test(checkAddress("http://api.example.org/x") ?? ""));
check("localhost, a private name, a bare name and a private or metadata IP are refused", ["https://localhost/x", "https://printer.local/x", "https://intranet/x", "https://10.0.0.1/x", "https://192.168.1.10/x", "https://169.254.169.254/latest", "https://[::1]/x", "https://172.20.0.1/x"].every((u) => /public/.test(checkAddress(u) ?? "")));
check("a name and password in the address are refused", /key field/.test(checkAddress("https://me:secret@api.example.org/x") ?? ""));
check("a port other than 443 is refused", /port/.test(checkAddress("https://api.example.org:8080/x") ?? ""));
check("private, loopback, link-local and mapped addresses are private", ["10.1.2.3", "127.0.0.1", "169.254.1.1", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "0.0.0.0"].every(isPrivateIp));
check("public addresses are not", !["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "151.101.1.69"].some(isPrivateIp));
const api: ApiSource = { kind: "api", url: "https://api.example.org/v1/obs?id=X", answer: "json", rows: "observations", x: "date", value: "value", keyIn: "query", keyName: "api_key" };
check("a key sent in the address goes in as its parameter", new URL(addressWithKey(api, "k123")).searchParams.get("api_key") === "k123" && addressWithKey({ ...api, keyIn: "header" }, "k123") === api.url);
check("the screen names the host alone, never the path or the query", hostOf("https://www.api.example.org/v1/obs?api_key=secret") === "api.example.org");

// --- reading an API's answer -----------------------------------------------
const today = "2026-10-14";
check("a dotted path reaches into objects and lists", pickPath({ a: { b: [{ c: 3 }] } }, "a.b.0.c") === 3 && pickPath({ a: [1, 2] }, "a[1]") === 2 && pickPath({ a: 1 }, "x.y") === undefined);
const fred = JSON.stringify({ observations: [{ date: "2026-08-01", value: "4.10" }, { date: "2026-07-01", value: "4.0" }, { date: "2026-09-01", value: "." }] });
const line = pointsFromAnswer(fred, api, "line", today);
check("a series reads its dates and numbers, skips a blank, and runs oldest first", line.length === 2 && line[0].x === "2026-07-01" && line[1].value === 4.1, JSON.stringify(line));
check("a number takes the latest dated row", JSON.stringify(pointsFromAnswer(fred, api, "number", today)) === JSON.stringify([{ x: "2026-08-01", value: 4.1 }]));
check("a path that leads to a number is the number, dated today", JSON.stringify(pointsFromAnswer(JSON.stringify({ quote: { price: "1,234.5" } }), { ...api, rows: "quote.price", x: "", value: "" }, "number", today)) === JSON.stringify([{ x: today, value: 1234.5 }]));
const pie = pointsFromAnswer(JSON.stringify({ weights: { Tech: 31.5, Energy: 6.4, Cash: "2%" } }), { ...api, rows: "weights", x: "", value: "" }, "pie", today);
check("an object of label to number reads as parts", pie.length === 3 && pie[0].x === "Tech" && pie[2].value === 2, JSON.stringify(pie));
const csv = 'year,"return, %"\n2024,15.3\n2025,"6.9"\n';
const bars = pointsFromAnswer(csv, { ...api, answer: "csv", rows: "", x: "year", value: "return, %" }, "bar", today);
check("a CSV reads by its column names, quoted cells included", bars.length === 2 && bars[1].x === "2025" && bars[1].value === 6.9, JSON.stringify(bars));
check("a missing field is a sentence naming it, never an empty reading", /"price"/.test(throws(() => pointsFromAnswer(fred, { ...api, value: "price" }, "line", today))));
check("rows not where the person said are a sentence", /"data"/.test(throws(() => pointsFromAnswer(fred, { ...api, rows: "data" }, "line", today))));
check("an answer that is not JSON says so", /not JSON/.test(throws(() => pointsFromAnswer("<html>", api, "line", today))));
check("a line without dates says so", /date/.test(throws(() => pointsFromAnswer(JSON.stringify({ observations: [{ name: "a", value: 1 }] }), { ...api, x: "name" }, "line", today))));
check("dates read in the usual shapes", toDate("2026-10-14T09:00:00Z") === "2026-10-14" && toDate("2026-10") === "2026-10-01" && toDate("2026Q3") === "2026-07-01" && toDate("10/14/2026") === "2026-10-14" && toDate(1791936000) === "2026-10-14" && toDate("1791936000000") === "2026-10-14" && toDate("soon") === null);

// --- reading through the person's Claude ------------------------------------
const def = (over: Partial<DataDef> = {}): DataDef => dataDefSchema.parse({ id: "data-copper", name: "Copper", about: "", format: "line", unit: "$/t", refresh: "monthly", screen: "markets", source: { kind: "claude", ask: "Copper's monthly LME price, two years." }, added: "2026-10-14T00:00:00Z", ...over });
const body = dataRequestBody(def(), today) as { system: string; tools: { type?: string; name: string; max_uses?: number }[] };
check("a Claude reading searches the web a few times and records through one tool", body.tools.some((t) => t.type === "web_search_20250305" && (t.max_uses ?? 0) <= 5) && body.tools.some((t) => t.name === "record_data") && /Never estimate/.test(body.system));
check("an API definition never goes to the model", /not a Claude source/.test(throws(() => dataRequestBody(def({ source: api }), today))));
const page = { title: "A page", url: "https://www.example.com/copper" };
const good = parseDataResponse({ content: [{ type: "tool_use", name: "record_data", input: { points: [{ x: "2026-09-01", value: 9800 }, { x: "2026-08-01", value: 9700 }], note: "LME monthly average.", pages: [page] } }] }, def());
check("recorded figures with their page are kept, by date", good.ok && good.points[0].x === "2026-08-01" && good.pages.length === 1);
const noPage = parseDataResponse({ content: [{ type: "tool_use", name: "record_data", input: { points: [{ x: "2026-09-01", value: 9800 }], note: "", pages: [] } }] }, def());
check("figures without their page are refused", !noPage.ok && /page/.test(noPage.reason));
const none = parseDataResponse({ content: [{ type: "tool_use", name: "record_data", input: { points: [], note: "No source publishes it.", pages: [] } }] }, def());
check("nothing found is a sentence carrying the reader's note", !none.ok && /No source publishes it/.test(none.reason));
check("an answer in words is refused", (() => { const r = parseDataResponse({ content: [{ type: "text", text: "About 9,800." }] }, def()); return !r.ok && !r.called; })());

// --- keeping and refreshing --------------------------------------------------
const t0 = new Date("2026-10-14T06:00:00Z");
const first = nextReading(undefined, { points: [{ x: today, value: 1 }] }, t0);
const failedRead = nextReading(first, { problem: "The API answered with an error (500)." }, new Date("2026-10-15T06:00:00Z"));
check("a failed reading keeps the last good points and says why", failedRead.points.length === 1 && failedRead.goodAt === first.goodAt && failedRead.problem !== null && failedRead.readAt !== first.readAt);
check("a good reading clears the problem", nextReading(failedRead, { points: [{ x: today, value: 2 }] }, t0).problem === null);
check("daily is due on the person's next day, not again the same day", !dataDue(def({ refresh: "daily" }), first, new Date("2026-10-14T18:00:00Z")) && dataDue(def({ refresh: "daily" }), first, new Date("2026-10-14T22:30:00Z")));
check("weekly waits a week and monthly a month", !dataDue(def({ refresh: "weekly" }), first, new Date("2026-10-17T06:00:00Z")) && dataDue(def({ refresh: "weekly" }), first, new Date("2026-10-21T06:00:00Z")) && !dataDue(def(), first, new Date("2026-10-30T06:00:00Z")) && dataDue(def(), first, new Date("2026-11-12T06:00:00Z")));
check("never read is due", dataDue(def(), undefined, t0));
check("a new id never takes one already used", dataIdFor("Copper price", ["data-copper-price"]) === "data-copper-price-2" && dataIdFor("!!!", []) === "data-data");
check("figures carry their unit", formatData(4.25, "%") === "4.25%" && formatData(1234.4, "$bn") === "1,234 $bn" && formatData(12.34, "") === "12.3");

// --- the samples, the slots and the vault ------------------------------------
const sample = customDataFileSchema.parse(JSON.parse(readFileSync("data/samples/custom_data.json", "utf8")));
check("the demo's data is fictional, on example.com, and names itself a sample", sample.defs.every((d) => /sample/i.test(d.name) && (d.source.kind === "claude" || hostOf(d.source.url) === "example.com")) && Object.values(sample.readings).every((r) => r.pages.every((p) => hostOf(p.url) === "example.com")));
check("the demo shows each screen and four formats", DATA_SCREENS.every((s) => dataOn(sample, s).length > 0) && new Set(sample.defs.map((d) => d.format)).size >= 4 && DATA_FORMATS.length === 5);
check("every screen that holds data has its own slot, shown always", DATA_SCREENS.every((s) => (SCREENS[s].slots as readonly string[]).includes(`your_data_${s}`) && SLOTS[`your_data_${s}` as keyof typeof SLOTS].shown === "always"));
check("definitions and keys live in their own vault files", (VAULT_KEYS as readonly string[]).includes("custom_data") && (VAULT_KEYS as readonly string[]).includes("data_keys"));
const builder = readFileSync("components/custom-data/data-builder.tsx", "utf8");
check("the key field is a password field and no key is passed to the browser", /name="key" type="password"/.test(builder) && !/keys\[|dataKeys|data_keys/.test(builder));
const page_ = readFileSync("app/(app)/customise/page.tsx", "utf8");
check("Customise never reads the keys file", !/data_keys|dataKeysSchema/.test(page_));
const sync = readFileSync("lib/daily-sync.ts", "utf8");
check("the morning refresh reads the person's data on its own schedule", /refreshData\(vault, now\)/.test(sync));

if (failed) {
  console.error(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`\ncheck:data ok (${passed} passed): only public https addresses are read, an answer becomes points or a sentence naming the field, a Claude reading keeps only figures with their page, a failure keeps the last good reading, and each piece is read on its own schedule.`);
