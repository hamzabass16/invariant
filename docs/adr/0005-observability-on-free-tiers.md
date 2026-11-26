# ADR 0005: Observability on free tiers, with no money data in any of it

Status: proposed, 2 Nov 2026.

## Context
There is no CI, no error tracking and, on Hobby, no retained runtime log.
A failed run is found only by reading the dates on screens.

## Decision
One logger (`lib/log.ts`) writing JSON lines with an HMAC of the user id,
never an address, amount, ticker list or token; a Vercel log drain to a
free log store; Sentry with a scrubbing `beforeSend`; `job_runs` as the
metrics store; an operator-only `/ops` screen; an uptime monitor on
`/api/health` and `/api/health/deep`; alerts by email and push to the
operator on queue lag, failure rate, Drive 429s, mail bounces and errors.
GitHub Actions runs every check on each PR.

## Alternatives rejected
- Datadog or New Relic: strong, but priced for teams, not one operator.
- Self-hosted Grafana: another thing to run.

## Consequences
Near zero cost until volumes pass free tiers; the guard extends to
`lib/log.ts` so a money figure in a log fails the build.
