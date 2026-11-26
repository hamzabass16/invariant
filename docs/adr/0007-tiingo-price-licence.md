# ADR 0007: Prices shown to people come from Tiingo under a display licence

Status: accepted by Hamza, 2 Nov 2026 (decision card). Terms to be confirmed
with Tiingo in writing before signing.

## Context
Today the app reads prices from Yahoo's chart and spark endpoints, the
Nasdaq screener, CNN, Wikipedia and multpl. Their terms forbid commercial
reuse, and any of them can block the app overnight. A paid app that shows
prices needs a source whose licence covers displaying them to users.

Options considered (list prices, November 2026):
- Tiingo, end-of-day and IEX redistribution: about US$250 a month for a
  startup, US$500 for the enterprise tier. End-of-day closes for US
  listings and live IEX prices, with display rights.
- Twelve Data, Business Venture: from US$149 a month, external display
  allowed. Kept as the fallback if Tiingo's terms do not fit.
- EODHD, which Snowball uses: personal plans forbid display, the US$399
  plan is internal use only, and display needs the enterprise licence
  listed from US$2,499 a month. Broader coverage (exchanges abroad,
  fundamentals, foreign ETFs). Worth a startup quote; not at list price.
- Massive (formerly Polygon): from US$2,499 a month for display.
- SnapTrade is a broker bridge, not a price feed: positions and balances,
  no index, watchlist or history quotes, no redistribution rights. It stays
  on each person's own Personal key; its commercial plan (KYC, a card) is a
  later step for one-click broker sync.

Exchange fees apply on top for real-time consolidated data (Nasdaq Basic,
CTA). IEX's own prices are what keep the live tier inside Tiingo's fee.

## Decision
Before the first paid tier, `lib/markets-feed.ts` reads end-of-day closes
and live prices from Tiingo, once for everyone (ADR 0003), into Postgres
and the CDN-cached quote shards. Yahoo and the other pages stay only for
figures Tiingo does not carry and that are free to show (or are dropped).
Before signing, Tiingo confirms in writing: display to logged-in users of
a paid app, caching and serving from our own CDN, the number of users and
symbols covered, and attribution wording.

## Consequences
- About US$250 a month, fixed, the largest line at 10,000 users.
- The quote shards keep no ticker in any URL; the licence key lives in the
  deployment's secrets only, never in a person's vault.
- Prices outside the US (ASML in Amsterdam, a TSX listing) need Tiingo's
  coverage checked, or the US listing, or the person's own key.
- Revisit if Tiingo will not confirm display terms, or if users abroad need
  exchanges Tiingo lacks: then a startup quote from EODHD or Twelve Data.
