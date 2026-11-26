# ADR 0002: Background jobs in a Postgres queue, fanned out each minute

Status: proposed, 2 Nov 2026.

## Context
Every cron loops over all enrolments in one 300 s function. The morning
refresh alone (Flex fetch up to 30 s, filings, inbox, reviews) stops
finishing at roughly 15 to 50 people. `after()` work on page open is also
bounded by the request's function.

## Decision
A `jobs` table with a unique `dedupe_key`, claimed with
`FOR UPDATE SKIP LOCKED` by a dispatcher cron that runs every minute on
Vercel Pro and calls `/api/jobs/run` per job (HMAC-signed), with a
concurrency cap per job kind and per external host (`rate_buckets`).
Retries with exponential backoff and jitter; a stale lock is reclaimed.
Each run writes a `job_runs` row. Per-person jobs are planned at the
person's own hour, spread by a hash of their id.

## Alternatives rejected
- Vercel Queues: at-least-once with retries and push consumers, but in
  beta, billed per operation with no published per-operation price.
  Revisit at GA.
- Inngest, Trigger.dev, QStash: good tools, but another vendor, another
  bill and another place where state lives, for load Postgres handles.
- One cron invocation per person: Vercel allows 100 cron entries.

## Consequences
No new vendor; cost is a few CU-minutes of Neon. Job history becomes the
main source of operational metrics. The queue's own load (about 100,000
jobs a day) is small for Postgres. Workers must be idempotent; the
existing "keep the last good copy" and `mail_claims` rules already are.
