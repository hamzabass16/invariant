# Synthetic personas

Fictional investors the app is tested against before a real one signs in.
Each folder is one persona:

- `persona.json`: who they are, their setup (profile, inputs, currency) and
  the spec of their book, which `lib/synthetic.ts` generates from the seed the
  same way on every run.
- `methodology.md`: the document they invest by, in their own words. The
  drafter reads it the way it reads a real person's document.
- `target.json`: what their dashboard must show, item by item, with a floor
  the hand-written methodology must reach. A note on an item says why it may
  wait or be missing.
- `methodology.json`: the same methodology written by hand in the recipe
  language. It proves what the ontology can say today; the drafter is measured
  against it.

Two scripts read them:

- `npm run check:synthetic` (no key, every build): generates each book, scores
  the hand-written methodology against the target, renders the dashboard in
  words, holds the score to the floor, and lists the data no input supplies
  yet by how many items wait for it.
- `npm run synth:loop` (a local key in `.env.local`, never committed): drafts
  each methodology from its document with the app's own request, scores the
  draft next to the hand-written one, and asks a judge what this investor
  would find missing or wrong, with the cause: the ontology cannot say it, the
  recipe language cannot, the drafter missed it, no input supplies the data,
  the target is wrong, or the app computed something wrongly. Reports and a
  proposals file land in `synthetic-runs/<date>/` (gitignored). `--dry-run`
  writes the requests without sending them; `--persona <id>` runs one.

The app learns from a run only through a reviewed change: a field or
statistic added to `lib/ontology.ts`, an option added to the recipe language
in `lib/recipes.ts`, a sentence in the drafting instructions in
`lib/draft-prompt.ts`, or an adapter that supplies a field no input did. The
loop proposes; a person applies; the check holds the gain. On 12 Oct 2026 the
first run found that a rule "my valuation must be under a year old" could not
be expressed, and `own_valuation_age_days` was added; it found that fees are
recorded negative and a share of fees needs a size, and `abs: true` was added
to measures.

Every name, figure and document here is made up. Never add a real person's
book or methodology to this folder; a real person's parity run keeps its files
outside the repository and uses `npm run check:parity`.
