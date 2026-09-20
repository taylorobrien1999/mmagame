# Design tokens — the reasoning, not just the values

This file is the design plan for the app, kept in the repo so future changes
have to justify themselves against it rather than drift toward generic
defaults. Read this before adding a new color, a new card style, or a new
type size.

## Why this direction

The subject is a **combat sports promotion**. The visual world that content
already lives in is fight-night broadcast graphics, tale-of-the-tape
stat cards, and fight posters — not SaaS dashboards. Borrowing that
vernacular (stat blocks with hairline dividers, condensed display type for
numbers, a fight-bill layout for events) makes the app feel like it belongs
to its subject. A rounded-card admin panel would fight the content instead
of carrying it.

## Color

| Token | Hex | Use |
|---|---|---|
| `ink` | `#0E1116` | App base. Cool, not flat black. |
| `surface` | `#171B22` | Panels, nav. |
| `surface-raised` | `#1F242D` | Modals, popovers — one step up only. |
| `hairline` | `#2A303B` | Dividers. Structure, not decoration — see below. |
| `signal` | `#E4362A` | Live/urgent ONLY: an event in progress, a rejection, a deadline. Never decorative. |
| `prestige` | `#C9A227` | Titles, championships, money increasing. Earned, not an accent to reach for. |
| `text` | `#F2F0EA` | Primary. Warm off-white, not pure white. |
| `text-muted` | `#8B92A0` | Secondary text, labels. |
| `win` / `loss` | `#3FA66A` / `#8B92A0` | Record indicators only. |

**Rule:** if you're using `signal` or `prestige` to make an element "pop"
rather than because it means live/urgent or earned/valuable, use `text` or
`prestige-dim`/`signal-dim` instead. These two colors carry meaning; spending
them as decoration erodes that meaning fast.

**A promotion's own brand color** (set in the creation suite, stored in
`promotion.branding.primary_color`) is applied via a CSS custom property,
`--promotion-accent`, scoped to that promotion's own pages only. It never
overrides `ink`/`surface` — those are the app's identity. Two promotions with
wildly different brand colors should still feel like the same app.

## Type

**Barlow Condensed** (weight 600–800) for numbers, stat blocks, and section
headlines — condensed type reads as broadcast/stat-sheet, which is exactly
the register fight numbers live in. **IBM Plex Sans** for everything else:
body copy, buttons, form labels, navigation. Two families, two clearly
separate jobs. Never use Barlow Condensed for a paragraph of body text — it's
tuned for short, large, numeric or declarative content only.

Line length stays under 80 characters for body copy. Display type is a
structural element, not a neutral label — when a fighter's name appears at
`stat-lg` size on their profile, it's doing a job (this is the headline of
this screen), not decorating.

## Structural devices

Hairline dividers (`border-hairline`) separate stat blocks instead of boxing
them in cards. This is deliberate: a page full of identical rounded cards
with identical shadows is the single most common tell of a templated
dashboard. A divided ledger reads as considered instead.

Numbered markers (01 / 02 / 03) are used ONLY for genuinely sequential
content — fight card position, round number. Never as decoration on
non-sequential content.

## Motion

One orchestrated moment per screen, if any. The event marquee's entrance on
the dashboard is the one place motion is used to draw attention; everything
else is instant or responds directly to a user action (a panel expanding,
a save confirming). No scroll-triggered fade-ins on every section.

## Accessibility floor — non-negotiable, not aspirational

- Visible keyboard focus rings on every interactive element (`focus-visible`,
  never `outline-none` without a replacement)
- Color is never the only signal — win/loss, live/scheduled, accepted/rejected
  all pair color with text or an icon
- Contrast: body text against `ink`/`surface` meets WCAG AA (4.5:1) at minimum
- `prefers-reduced-motion` is respected — the one orchestrated entrance
  becomes an instant appearance
- Every image (fighter photos, promotion logos) has real alt text describing
  what it is, not the filename
