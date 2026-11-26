# ADR 0004: Amazon SES out, Cloudflare Email Routing in, on the app's domain

Status: proposed, 2 Nov 2026.

## Context
Outbound mail uses one Gmail account over SMTP (about 500 sends a day).
Statements and newsletters arrive in one Gmail inbox read by IMAP each
morning and on open. At 10,000 people that is about 200,000 sends a month
and a mailbox Google may throttle or suspend.

## Decision
Buy a domain. Send through Amazon SES (US$0.10 per 1,000) with SPF, DKIM
and DMARC, and stop sending to addresses that bounce or complain. Receive
through Cloudflare Email Routing (free): an Email Worker posts each raw
message, signed, to `/api/inbound`, which keeps it encrypted at most 24
hours until a job reads it, then deletes it. The tag per person stays the
local part; the `Authentication-Results` check stays.

## Alternatives rejected
- SES inbound: also cheap, but adds S3 and SNS to configure.
- Postmark or Resend: simpler, dearer at this volume.
- A Google Workspace mailbox: higher limits, same polling model.

## Consequences
Mail scales and is measurable (bounces, complaints). The privacy page must
say an emailed statement is held encrypted up to a day before it is read.
The Gmail app password and IMAP code retire.
