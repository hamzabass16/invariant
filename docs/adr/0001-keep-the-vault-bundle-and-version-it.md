# ADR 0001: Keep the vault in the person's Drive; bundle it and version it

Status: proposed, 2 Nov 2026. Amended by ADR 0006: Drive becomes optional, the managed vault the default before the paid tier; bundling still applies to Drive vaults.

## Context
A screen reads about 23 vault files, each a separate Drive download, after
one listing: about 4,700 Drive quota units a view. At 10,000 users the
project passes Drive's daily threshold (about 400 M units, not raisable)
and its per-minute quota at peak. See docs/ARCHITECTURE.md section 3.

## Decision
Keep every figure of a person's money in their own vault (hard rule 1).
Bundle the 43 keys into 4 files read together (core, activity, research,
archive); decks and PDFs stay separate. Keep a `vault_versions` row per
person in Postgres, bumped by every write the app makes; an instance
serves its in-memory copy while the version matches and reads Drive only
when it does not. Writes take a per-user, per-bundle advisory lock.

## Alternatives rejected
- Move money data into Postgres, encrypted per person. Cheapest to run,
  but it ends the product's main promise and changes the privacy and terms
  pages, Google's review and every hard rule.
- A Redis cache of encrypted vault copies. Another vendor and another
  copy at rest, for less than the version check gives.
- Ask Google for more quota. Not guaranteed, and the daily threshold
  cannot be raised.

## Consequences
About 100 M units a day at 10,000 users instead of about 560 M. Most
views cost one Postgres query. A person who edits the files by hand in
Drive is not seen until the next app write or a daily full read, which is
acceptable: the files are the app's own. A one-time migration reads the
old single files when no bundle exists.
