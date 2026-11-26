# ADR 0006: A managed, encrypted vault becomes the default; Drive stays a choice

Status: accepted by Hamza, 2 Nov 2026 (decision card). Amends ADR 0001.

## Context
Drive holds 43 files per person: 4 credentials, 14 money, 20 private and 4
public copies. The deployment keeps each enrolled person's sealed Google
refresh token, so a leak of the database and `REPORT_KEY` opens every
vault; Drive's benefit is custody, not breach resistance. With bundling,
Drive's daily project threshold caps the app at about 40,000 people.
Peers (Snowball, Sharesight, Getquin, Kubera) keep data in their own
encrypted databases.

## Decision
Before the first paid tier, add a fourth vault kind, `managed`, behind the
existing `Vault` interface: a `vault_files(user_id, key, ciphertext,
dek_version, version, updated_at)` table, one AES-256-GCM data key per
person, wrapped by AWS KMS, unwrapped once per active session. New people
get it by default; Google Drive, OneDrive and a bucket stay as choices.
Account deletion destroys the wrapped key (crypto-shredding). An export
writes the same files, readable, into the person's Drive. Stored sign-in
tokens and bucket credentials move under KMS too. Until then, ADR 0001's
bundling and version check apply to Drive vaults.

## Consequences
The privacy page, terms and the hard rule on where files live change in
the same PR that ships it. The guard extends to the new adapter: no money
figure in a log, a URL or a cross-person query. About US$20 to 40 a month
at 10,000 people. Moving between kinds is one copy, file by file.
