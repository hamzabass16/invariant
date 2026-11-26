# Design

Invariant is obsidian and platinum (Hamza, 11 Nov 2026): luxurious,
futuristic, techy and minimal. Dark is the primary theme; light is its
porcelain half; "system" follows the device. Each person picks theirs on the
Customise screen.

Three ideas carry the look.

1. **One surface.** No cards, no layers, no empty whitespace. A section sits
   on the page's own ground with one hairline above it; a list of things is
   one ruled grid; a tile inside a section is outlined, never filled. Only
   what floats over the page (a menu, a sheet, the tour, a tooltip) keeps a
   surface. The top bar and tab bar sit on the same ground.
2. **Platinum for actions, colour for data.** Platinum carries every action
   and selection. Colour is for what is read and what can be pressed (Hamza,
   11 Nov 2026: "keep the colorful elements"): `--viz` draws the charts, bars
   and heat cells, `--cat-1` to `--cat-6` the calendar's kinds and the agent
   tiers, and `--viz-line` the border of every clickable button, pill, tile
   and grid cell, brighter on hover. Text links are underlined.
3. **One signature.** The rule band on the Dashboard's Resonance card
   (`components/dashboard/rule-band.tsx`): every rule of the methodology as a
   strand of fine lines, unbroken while kept, broken in `--danger` for a
   breach and `--warn` outside a guideline, faint for a rule checked by hand,
   a bare hairline while it waits for data. Past about 25 rules on a laptop
   the rules of one state share a strand.

## Tokens

Every value lives in `app/globals.css` and is read through Tailwind's
`@theme inline` block. Components use the token names, never a hex.

### Colour

| Token | Dark | Light | Role |
| :-- | :-- | :-- | :-- |
| `--bg` | `#0a0a0b` | `#f7f7f5` | the one surface |
| `--surface` | `#111113` | `#ffffff` | only what floats: menus, sheets, the tour |
| `--surface-2` | `#141416` | `#efefec` | a control's track; a tile's fill is flattened to an outline in a page |
| `--surface-3` | `#1c1c1f` | `#e5e5e1` | pressed secondary controls |
| `--hairline` | `#1f1f23` | `#e3e3df` | every section rule, grid line and outline |
| `--hairline-strong` | `#2e2e33` | `#cfcfca` | input borders, a link's underline |
| `--text` | `#ededee` | `#0b0b0c` | primary |
| `--text-secondary` | `#a1a1a8` | `#55575d` | labels, subtitles |
| `--text-tertiary` | `#8a8a92` | `#666870` | timestamps, disabled |
| `--accent` | `#e6e6e8` | `#0b0b0c` | platinum (ink in light): primary action, selection fill |
| `--on-accent` | `#0a0a0b` | `#f7f7f5` | type on an accent fill |
| `--accent-text` | `#cdd5df` | `#2f3742` | accent as text and icon, a cool platinum |
| `--accent-subtle` | white 7% | ink 6% | selected row, hovered cell |
| `--shell`, `--shell-text`, `--shell-muted` | the ground, text, secondary | same | the top bar and tab bar |
| `--rule-ink` | `#d9d9dc` | `#0b0b0c` | a kept rule in the rule band |
| `--viz`, `--viz-text` | `#2f8488`, `#8fd0d3` | `#2a7a7e`, `#1f5d60` | data: charts, bars, heat cells, the P/E and valued-book panels |
| `--viz-2` | `#c9a96a` | `#a8853f` | data's other pole: a correlation below zero |
| `--viz-line` | `#8fd0d3` 42% | `#2a7a7e` 45% | the border of everything clickable |
| `--cat-1` to `--cat-6` | blue, violet, amber, green, rose, teal | the same, one step darker | the calendar's kinds; Sonnet, Opus and Haiku in the agent hierarchy |
| `--gilt` | `#2e2e33` | `#cfcfca` | the title rule (the name is kept from the earlier look) |
| `--ok` | `#5fa87f` | `#2f7a52` | within a limit, the Live dot |
| `--warn` | `#d1a24a` | `#8f6413` | near a limit, outside a guideline |
| `--danger` | `#e0705f` | `#b3372a` | a breach |
| `--info` | `#7ea6d6` | `#2f5f8f` | a watch tripped, a date |

Status colours are desaturated by design. The app reports broken rules and
missed deadlines; it must not look like a trading game. No candlestick
red-green, no tickers, no gradients on surfaces, no glow. Green is a status
only: an up move is blue, the "Market is live" pill is platinum with a green
dot.

Chart series have their own hues (`--series-*`, `--arch-*`), validated against
both surfaces for lightness, chroma, colour-vision separation and 3:1
contrast. Identity never rides on colour alone: every chart has a legend,
direct labels and a table view.

A day's move is diverging, never categorical: `--move-up` (blue) and
`--move-down` (red) mixed into the neutral `--move-mid`, full strength at
3%, with `--move-ink` for type on a full tile. Blue and red, not green and
red, so colour-blind readers keep the sign; the figure is always printed
beside the colour.

### Typography

| Role | Face | Notes |
| :-- | :-- | :-- |
| Interface | system stack (SF Pro on Apple) | iOS scale, fixed rem: large title 34, title 1 28, title 2 22, body 17, subhead 15, footnote 13, caption 12 |
| Figures | IBM Plex Mono (`.data`) | tabular digits, every price, weight, score and date |
| Titles | Newsreader (`.font-display`) | page titles 36px on a laptop, the Resonance score 48px, group headings 22px title case |
| Labels | Newsreader small capitals (`.section-header`) | tracked 0.06em, 15px |

Large titles track in by 2%; figures by 1%. Nothing is justified; nothing is
centred except an empty state.

### Space, shape, elevation

- Spacing on a 4px grid, tight: 14 above and below a section's content, 10
  to 14 between sections, more above a group heading than below it.
- Radii: `--radius-card` 8px for what floats, 0 for a section on the page,
  `--radius-control` 6px, `--radius-sheet` 12px.
- Elevation: none on the page. `--shadow-float` (a hairline ring and a soft
  drop) only for what floats over it.
- The desktop ceiling is 1400px (`max-w-content`); below 1024px the layout is a
  phone: tab bar, large titles that collapse into the nav bar, grouped inset
  lists.

### Motion

Short, decisive, eased out. Nothing bounces, nothing loops.

| Token | Value | Use |
| :-- | :-- | :-- |
| `--dur-1` | 160ms | colour and press transitions |
| `--dur-2` | 320ms | enter (`.reveal`, `.reveal-stack`) |
| `--dur-3` | 560ms | a figure landing (`.figure-in`) |
| `--ease-out-quint` | `cubic-bezier(0.22, 1, 0.36, 1)` | every enter |

- `.reveal-stack` on a page body: its children rise 8px and fade in, 40ms
  apart, so a screen is read top to bottom.
- `.figure-in` on a figure's value: lands 6px up and 2% large, unblurs and
  settles. It plays once, on render, never on a tick.
- Buttons press to 97%. Rows are pressed, not hovered, on the phone; the
  sidebar hovers on the laptop.
- `prefers-reduced-motion: reduce` collapses every duration to 0.01ms.

## Components

| Component | File | States |
| :-- | :-- | :-- |
| `.card` | `globals.css` | a section: in a page, no fill, no radius, one hairline above (the one-surface block at the end of the file); floating, a raised surface |
| `PageHeader` | `components/ui/page-header.tsx` | Newsreader title with its rule; collapses into a 44px nav bar on the phone |
| `PageBody` | `components/ui/page-body.tsx` | the measure, with `.reveal-stack` |
| `ListSection`, `ListRow`, `ListLinkRow`, `ListButtonRow` | `components/ui/list.tsx` | default, pressed, selected (`aria-pressed`) |
| `StatTile` | `components/app/figures.tsx` | neutral and the four status tones; the value is `.data .figure-in` |
| `Button` | `components/ui/button.tsx` | primary, secondary, danger, ghost; sm, md, lg; loading, disabled |
| `StatusPill` | `components/ui/status.tsx` | ok, warn, danger, info, neutral |
| `EmptyState` | `components/ui/empty-state.tsx` | icon, title, one instruction, one action |
| `ChartFrame` | `components/charts/frame.tsx` | chart or table, legend, direct labels |
| `TopBar`, `TabBar` | `components/app/` | on the ground with one hairline; current is text plus a 2px platinum underline; a count is ink on platinum |
| `BackButton` | `components/ui/back-button.tsx` | above the title of a page two levels deep (`isDetailPath` in `lib/back.ts`); back through the tab's history when the app opened the page, else `backFallback` |
| `RuleBand` | `components/dashboard/rule-band.tsx` | kept, breach, outside, by hand, waiting; per rule, or grouped by state past the width each rule needs |
| `Cited` (the citation margin) | `components/ui/cite.tsx`, `.cite-margin` | from 1024px a 7.5rem column at a verdict card's right, behind a hairline: the rule's section ("§3.1") and what it tests, Plex Mono 12px, tertiary, like a footnote on a statement; below 1024px not drawn, the card's inline section (`cite-inline`) stays |
| `Palette`, `SearchButton` | `components/app/palette.tsx`, `.palette-panel` | ⌘K sheet on `--radius-sheet` and `--shadow-float` over a blurred scrim; the row in focus on `--accent-subtle`; kinds under section headers |
| `ResonanceLine` | `components/dashboard/resonance-line.tsx` | the Dashboard's first card: the label as a section header with an (i), the score as a title-2 figure, the parts as links in secondary text, a breach in `--danger`, a decision owed in `--warn` |

A component that needs a colour not in the table above is a design change:
add the token in `globals.css` and a row here first.

## Copy

Terse and plain, in the person's own methodology's vocabulary. "Mastercard over
its 10% cap." "Sell about 0.25 sh." Empty states instruct; they never
apologise and never celebrate. No exclamation marks. Not investment advice.
