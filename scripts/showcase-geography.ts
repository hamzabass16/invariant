/**
 * Writes the showcase's revenue by geography into
 * data/samples/showcase.filings.json from each company's latest annual
 * filing, as the SEC renders the filing's own XBRL (the R pages of the
 * Financial Report): the members and figures below are the filed facts, the
 * period's undimensioned revenue the total. They go through the same pure
 * code the morning refresh uses (placeOf, reconcileGeography), so the demo
 * shows what a read of these filings gives. Run once, by hand, when the
 * showcase is rebuilt: npx tsx scripts/showcase-geography.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

import { placeOf, reconcileGeography, revenueGeographyOf } from "../lib/edgar-segments";
import { filingsFileSchema } from "../lib/filings";

type Filed = { form: string; accession: string; periodEnd: string; total: number; facts: [member: string, value: number][] };

// Units as filed (millions of the filing's currency; Birkenstock in thousands of euros). Only shares are kept.
const FILED: Record<string, Filed> = {
  AMZN: { form: "10-K", accession: "0001018724-26-000004", periodEnd: "2025-12-31", total: 716_924, facts: [["country:US", 489_657], ["country:DE", 45_900], ["country:GB", 43_212], ["country:JP", 30_688], ["amzn:RestOfWorldMember", 107_467]] },
  GOOGL: { form: "10-K", accession: "0001652044-26-000018", periodEnd: "2025-12-31", total: 402_836, facts: [["country:US", 194_229], ["goog:EMEAMember", 117_152], ["goog:APACMember", 67_680], ["goog:OtherAmericasMember", 23_902]] },
  META: { form: "10-K", accession: "0001628280-26-003942", periodEnd: "2025-12-31", total: 200_966, facts: [["meta:UnitedStatesAndCanadaMember", 78_866], ["srt:EuropeMember", 46_569], ["srt:AsiaPacificMember", 53_817], ["meta:RestOfWorldMember", 21_714], ["country:US", 74_780]] },
  BKNG: { form: "10-K", accession: "0001075531-26-000009", periodEnd: "2025-12-31", total: 26_917, facts: [["country:US", 2_579], ["us-gaap:NonUsMember", 24_338], ["country:NL", 21_700]] },
  MA: { form: "10-K", accession: "0001141391-26-000013", periodEnd: "2025-12-31", total: 32_791, facts: [["srt:AmericasMember", 14_044], ["ma:InternationalMarketsMember", 18_747]] },
  MELI: { form: "10-K", accession: "0001099590-26-000006", periodEnd: "2025-12-31", total: 28_893, facts: [["meli:BrazilMember", 15_201], ["meli:MexicoMember", 6_475], ["meli:ArgentinaMember", 5_962], ["meli:OtherCountriesMember", 1_255]] },
  UBER: { form: "10-K", accession: "0001543151-26-000015", periodEnd: "2025-12-31", total: 52_017, facts: [["uber:UnitedStatesAndCanadaMember", 26_469], ["srt:LatinAmericaMember", 3_327], ["us-gaap:EMEAMember", 16_364], ["srt:AsiaPacificMember", 5_857], ["country:US", 23_771], ["country:GB", 10_609], ["uber:AllOtherCountriesMember", 17_637]] },
  SPGI: { form: "10-K", accession: "0000064040-26-000013", periodEnd: "2025-12-31", total: 15_336, facts: [["country:US", 9_322], ["srt:EuropeMember", 3_531], ["srt:AsiaMember", 1_640], ["spgi:RestOfWorldMember", 843]] },
  IBKR: { form: "10-K", accession: "0001381197-26-000062", periodEnd: "2025-12-31", total: 6_205, facts: [["country:US", 4_324], ["us-gaap:NonUsMember", 1_881]] },
  SHOP: { form: "10-K", accession: "0001594805-26-000007", periodEnd: "2025-12-31", total: 11_556, facts: [["country:US", 7_331], ["country:CA", 567], ["us-gaap:EMEAMember", 2_426], ["srt:AsiaPacificMember", 1_128], ["srt:LatinAmericaMember", 104]] },
  ASML: { form: "20-F", accession: "0001628280-26-011378", periodEnd: "2025-12-31", total: 32_667.3, facts: [["country:JP", 1_420.9], ["country:KR", 8_159.6], ["country:SG", 608.4], ["country:TW", 8_337.9], ["country:CN", 9_519.7], ["asml:RestOfAsiaMember", 2.7], ["country:NL", 4.7], ["asml:RestOfEuropeAndMiddleEastMember", 524.3], ["country:US", 4_089.1]] },
  BIRK: { form: "20-F", accession: "0001193125-25-323599", periodEnd: "2025-09-30", total: 2_097_429, facts: [["country:DE", 206_732], ["country:US", 962_284], ["birk:RestOfWorldMember", 928_413]] },
  NVO: { form: "20-F", accession: "0000353278-26-000012", periodEnd: "2025-12-31", total: 309_064, facts: [["nvo:InternationalOperationsMember", 135_898], ["nvo:EUCANMember", 66_091], ["nvo:EmergingMarketsMember", 30_436], ["nvo:APACMember", 20_713], ["country:CN", 18_658], ["country:US", 173_166]] },
};

const path = "data/samples/showcase.filings.json";
const file = filingsFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
for (const [symbol, f] of Object.entries(FILED)) {
  const entry = file.bySymbol[symbol];
  if (!entry) throw new Error(`${symbol} is not in the showcase filings`);
  const given = f.facts.map(([member, value]) => ({ ...placeOf(member), value }));
  const r = reconcileGeography(given, f.total);
  if (!r) throw new Error(`${symbol}: nothing reconciled`);
  const geo = revenueGeographyOf({ ...r, form: f.form, period: `year to ${f.periodEnd}`, periodEnd: f.periodEnd, totalRevenue: f.total, given }, f.accession);
  entry.revenueGeography = geo;
  console.log(`${symbol} ${geo.form} ${geo.period}: ${geo.lines.map((l) => `${l.name} ${l.sharePct.toFixed(1)}%`).join(", ")}${geo.partial ? " (partial)" : ""}${geo.note ? ` [${geo.note}]` : ""}`);
}
writeFileSync(path, `${JSON.stringify(filingsFileSchema.parse(file))}\n`);
