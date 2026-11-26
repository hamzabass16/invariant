# ADR 0008: Vercel Pro, 800-second functions and a per-minute dispatcher

Status: accepted, 4 Nov 2026 (Hamza upgraded the account to Pro).

## Context
On Hobby every function stopped at 300 s and each cron ran once a day
anywhere within its hour. The jobs of ADR 0002 already ran one person at a
time in their own workers, but the workers were started only by the crons:
a job retried after its backoff, or one a run's workers did not reach,
waited for the next run, often the next day. On 4 Nov an evening run timed
out at 300 s.

## Decision
- The crons and `/api/jobs/run` take `maxDuration = 800`. A worker starts
  jobs for 600 s (`WORKER_START_MS`) and a job is given 180 s, so the last
  one ends inside the function.
- A job's lock lasts 14 minutes (`LOCK_MINUTES`), longer than any function
  can live, so a live worker's job is never claimed by another.
- `/api/cron/dispatch` runs every minute. It counts the jobs due (queued
  and due, or held past their lock) and the jobs being run, and starts
  `workersToStart(due, busy, DISPATCH_CAP)` workers, at most 8 busy at
  once. With nothing due it is one query.
- Indexes for the reads that grew with the table: `jobs (created_at)`,
  `jobs (email)`, `mail_claims (claimed_at)`.
- A results watch, `/api/cron/results`, every quarter hour on weekdays
  in the two results windows (10:00 to 14:45 and 20:00 to 23:45 UTC). Each
  person's job reads one file, the earnings file's `upcoming`, and makes the
  full read and the email only when a followed company's results are out
  and unread, so a report goes out within minutes of its release.
- A cron starts no more workers than it queued jobs (at least one).
- The crons still start their own workers at once, so a run does not wait
  for the dispatcher's next minute.

## Alternatives rejected
- A dispatcher that claims jobs and calls one function per job: more
  invocations and the same result, since a worker already takes jobs one
  after another.
- Vercel Queues: still in beta, see ADR 0002.

## Consequences
About 1,440 dispatcher invocations a day, nearly all a single query.
Retries land within a minute or two of their backoff. A backlog drains at
up to 8 workers beside the crons' own, a cap to raise once the sources'
rate limits are shared buckets (section 5.3).
