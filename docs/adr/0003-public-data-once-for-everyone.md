# ADR 0003: Public data is read once for everyone

Status: proposed, 2 Nov 2026.

## Context
Closes, the session, filings, the earnings calendar, odds, 13Fs and
screener rows are the same for everyone. Some are already shared
(`company_figures`, the data cache); others are read per person, which
multiplies calls to SEC (10 a second at most), Yahoo, Nasdaq and others by
the number of people.

## Decision
Shared jobs (no `user_id`) read public data once into Postgres tables,
under per-host rate limits, and per-person jobs only lay it on the book.
Live quotes are one shared read a minute, served as 32 CDN-cached shards
chosen by a hash of the symbol, so no ticker appears in a URL.

## Alternatives rejected
- The Next.js data cache alone: shared, but not durable and not queryable.
- Per-person reads with a cache in front: still one read per person on a
  miss, and every miss is a call a source may block.

## Consequences
External calls scale with distinct symbols, not people. Live price load on
the origin is about 64 requests a minute whatever the number of viewers.
This does not license the data: see ARCHITECTURE.md section 10.
