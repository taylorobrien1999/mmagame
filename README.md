# mmagame

Two-player co-op combat sports promotion manager. Browser-based, mobile-first, private.

```bash
npm install
npm run dev                # starts the app at http://localhost:5173
npm run sim:calibrate      # runs ~18,000 simulated fights + invariant checks
npm run sim:negotiation    # runs the personality/negotiation calibration
npm run typecheck
```

Copy `.env.example` to `.env` and fill in your Supabase URL + publishable
key before `npm run dev` will start — see SETUP.md.

---

## The one rule

**Nothing calls `Math.random()`. Ever.**

Every random outcome comes from an `Rng` seeded off the world seed. This isn't
style — three things depend on it:

1. **Async co-op works without syncing.** Both clients replay the same tick log
   and land on byte-identical world state. No conflict resolution, no authority
   arguments, no "my version says he won."
2. **The game is testable.** You can't unit-test whether one fight was "correct."
   You *can* run 18,000 fights and assert the finish rate matches real MMA.
   `harness.ts` does exactly this and it's the only real quality gate you have.
3. **The live event screen is free.** It's a paced replay of a `PlayByPlay[]`
   the server already computed. No sim logic in the UI.

Break this rule and multiplayer stops working in a way that's very hard to debug.

---

## Current state

Phase 0 and 1 are done. The fight engine is built, runs, and is calibrated.

### Calibration vs real MMA (4,000 fights, evenly matched)

| Metric | Engine | Real | |
|---|---|---|---|
| Finish rate | 50.5% | 48–52% | on target |
| KO/TKO share of finishes | 65.1% | ~65% | on target |
| Submission share of finishes | 34.9% | ~35% | on target |
| Split decisions (of decisions) | 20.3% | 18–22% | on target |
| Round-1 share of finishes | 28.4% | ~45% | **still off** |

### Invariants that pass

- **Determinism** — same seed produces a byte-identical result
- **Seed sensitivity** — different seed produces a different result
- **Symmetry** — identical fighters on both sides win 51.2% / 48.8%, so there's
  no hidden engine bias toward side A

### Known gaps (deliberately left, not hidden)

- **Round-1 finishes are underweighted** (28% vs ~45%). Fights still skew toward
  finishing late. The `freshness` multiplier in `engine.ts` is the knob.
- **Skill gaps are slightly too decisive.** Elite vs good is 83.5%; ~72% would
  feel better. Widen the damage variance or flatten the attribute gradients.
- **Five-round MMA finishes 66.8%**, should be closer to 50%.
- **Boxing decisions are 39.7% split**, far too many. Boxing needs its own
  judging weights — 12 rounds compounds per-round noise.

All tuning lives in `TUNING` at the top of `engine.ts` and `damageMult`/`kdMult`
per ruleset in `types.ts`. Change a number, re-run `npm run sim:calibrate`,
compare the table. That's the whole loop.

---

## Files

```
src/sim/rng.ts          Seeded PRNG (xoshiro128**). The foundation.
src/sim/types.ts        Fighter, Attributes, Ruleset, FightResult.
src/sim/derive.ts       Real career stats -> 0-100 game attributes.
src/sim/engine.ts       The fight simulation. Exchange-based.
src/sim/commentary.ts   Play-by-play text. Expand this aggressively.
src/sim/harness.ts      Fight calibration + invariant checks.
src/sim/personality.ts  15 axes + 28 composable quirks.
src/sim/negotiation.ts  Contract + bout offer evaluation.
src/sim/venue.ts        Venue booking requests, PotN/FotN bonus selection.
src/sim/negotiation-harness.ts   Negotiation calibration.
db/schema.sql           Base Postgres schema.
db/schema-v2.sql        Divisions, titles, bonuses, venues, personality, RLS.

src/design/tokens.md    The design plan — why this palette/type, not defaults.
src/design/types.ts     UI-facing types, thin mirror of the DB schema.
src/lib/supabase.ts     Client using the PUBLISHABLE key only. Read before touching auth.
src/app/                Router, shell, global CSS.
src/components/         WorldClockBar, EventMarquee, StatLedger, FighterCard.
src/pages/              Dashboard (built out) + empty-state stubs for the rest.
```

---

## Personality & negotiation

Personality is **15 numeric axes + quirks drawn from a pool of 28**, not a flat
list of hundreds of traits. A hand-authored trait needs bespoke handling in
negotiation, bout acceptance, morale *and* social posts — four touchpoints each.
Three hundred traits is 1,200 code paths that never ship. Axes compose instead:
greed 90 / loyalty 85 negotiates nothing like greed 90 / loyalty 15, and neither
needed new code.

Quirks are pure data. A quirk sets axis modifiers and raises named `hooks` that
the negotiation code checks. Adding quirk #29 means adding a row, not touching
an engine.

Signing a fighter and being able to *book* them are separate systems on purpose.
`evaluateContractOffer` answers "will you sign?"; `evaluateBoutOffer` answers
"will you take this fight?" — and a contracted fighter can absolutely refuse.

Every refusal returns structured `reasons`. Show them in the UI. That's how the
player learns the system instead of brute-forcing offers.

### Negotiation calibration (`npm run sim:negotiation`)

| Offer vs value | Accept | Counter | Reject | Insulted |
|---|---|---|---|---|
| 0.35x | 0% | 12% | 27% | 61% |
| 0.60x | 2% | 71% | 19% | 8% |
| 0.85x | 28% | 70% | 1% | 0% |
| 1.00x | 65% | 35% | 0% | 0% |
| 1.30x | 96% | 4% | 0% | 0% |

Same 0.75x offer, different personalities — this is the test that matters,
because if quirks don't change behaviour the whole system is decoration:

| Quirk | Accepts |
|---|---|
| Money Fighter | 5% |
| Journeyman | 8% |
| Shark for a Manager | 11% |
| Company Man | 24% |
| Title or Nothing | 31% |

### Market value vs reality

| | Engine median | Real |
|---|---|---|
| Amateur / debut | $840 | ~$1k |
| Regional prospect | $2,164 | ~$3k |
| Regional main eventer | $9,752 | ~$10k |
| UFC newcomer | $33,468 | ~$25k |
| UFC mid-card | $95,349 | ~$80k |
| Ranked contender | $252,622 | ~$250k |
| Champion | $535,130 | ~$600k |
| PPV superstar | $895,127 | $1M+ |

Popularity is weighted more heavily than skill, as in reality. That's what makes
signing a mediocre draw a genuine strategic decision.

### Weight mismatches

Bout acceptance at a fair purse, by how far above natural weight you're asking:

| Gap | Accepts | Avg morale | Goes public |
|---|---|---|---|
| +0 lbs | 98% | -0.1 | 0% |
| +5 lbs | 80% | -4.2 | 0% |
| +10 lbs | 25% | -13.3 | 9.7% |
| +15 lbs | 15% | -23.3 | 17.5% |
| +25 lbs | 0% | -49.1 | 20.4% |

Cutting *below* natural weight is penalised separately and scales with the
fighter's `weightDiscipline`. Bad weight cutters revolt at cuts good ones shrug
off. Fighters with high `socialVolatility` (or the `PUBLIC_COMPLAINER` hook)
post about it, which feeds the news system and damages promotion reputation.

---

## Frontend

React + TypeScript + Vite + Tailwind, built as described in the original
plan. The dashboard is fully built with placeholder data shaped exactly like
what Supabase will return — swapping mock data for real queries is a
drop-in replacement, not a rewrite.

**Design direction:** read `src/design/tokens.md` before changing colors,
type, or adding a new card pattern. Short version — the visual language is
broadcast/stat-sheet (condensed display type, hairline-divided stat blocks,
a fight-bill event layout), not generic SaaS dashboard (rounded cards,
uniform shadows). `signal` (red) and `prestige` (gold) carry specific
meaning — live/urgent and earned/valuable respectively — and are never used
as decoration.

Every route in the sidebar renders — `Dashboard` is built out, the rest
(`Roster`, `Events`, `Negotiations`, `Promotion`, `League`, `Free agents`)
are real empty states rather than "coming soon" placeholders, ready to have
their real content dropped in as phase 2 continues.

**Not yet done:** none of it talks to Supabase yet. `src/lib/supabase.ts`
has the client ready; the pages need their mock data blocks replaced with
actual queries. That's the next piece of phase 2.

**Known follow-up, not a bug:** the font bundle currently includes every
language subset (Cyrillic, Greek, Vietnamese) of both typefaces, which is
unnecessary weight. Worth trimming to Latin-only subsets before this ships
anywhere real — flagging it rather than fixing it now to keep this batch
focused.

---

## Spectator mode

Needs no new tables. `bout.result` already holds the complete `PlayByPlay[]`,
so watching a UFC card is replaying that JSON with the booking controls hidden.
Another payoff from building deterministic.

What it *did* need was tighter RLS. The original blanket `in_world()` write
policy would have let player 1 edit player 2's promotion. `schema-v2.sql`
replaces it with read-any / write-own across promotions, events and contracts.

---

## Attribute scale

`70 = median UFC fighter`. 85 = top-15. 92+ = all-time great. 35–60 = regional
and amateur. This is enforced by `derive.ts` normalising against the real UFC
population, not by hand-rating anyone.

Eighteen attributes across striking, grappling, physical and mental. `overall`
is derived and never stored by hand. `popularity` is deliberately independent of
skill — that's what makes a mediocre draw worth signing.

---

## Data pipeline (phase 0, not yet written)

**Sources:**
- **ESPN public MMA API** — `site.api.espn.com/apis/site/v2/sports/mma/ufc/`.
  Free, no auth, no key. Covers UFC, PFL, ONE, Bellator and others.
- **Kaggle "UFC Dataset (1994–2026)"** — ~4,400 fighters with SLpM, striking
  accuracy, strikes absorbed, striking defence, takedown avg/acc/def, sub avg.
  `RawFighterStats` in `derive.ts` matches this schema exactly.

**Not Sherdog or Tapology.** Both prohibit scraping and will block you, and
you'd be rebuilding the parser every time their markup changes.

**Target mix:** ~2,500 real fighters, plus procedurally generated prospects and
amateurs seeded from the real nationality/gym/name distributions. The generation
being seeded from reality is what keeps the lower tiers feeling authentic.

**Before importing, re-fit the anchors.** `ANCHORS` in `derive.ts` is the p10/p50/p90
of each stat across the UFC population, hardcoded so the module runs standalone.
Recompute them from your actual downloaded dataset or every rating will be skewed.

---

## Build order

| Phase | | Est. | Status |
|---|---|---|---|
| 0 | Data pipeline + schema | 15h | schema done |
| 1 | Fight engine, headless | 25h | **done** |
| 2 | Single-player loop: book card, run event, earn money | 20h | UI shell done, needs wiring to Supabase |
| 3 | Mobile UI + live event screen | 25h | |
| 4 | Multiplayer, world clock, ready-up | 20h | |
| 5 | Creation suite, traits, facilities, news feed | 40h | deferred |
| 6 | AI promotion behaviour, free agency, cross-promotion | 40h | deferred |

### Added in round 2

| | | Est. | Status |
|---|---|---|---|
| Personality + negotiation | 15 axes, 28 quirks, contract & bout evaluation | 30h | **engine done** |
| Watch-event / spectator | replay `bout.result`, hide controls, RLS isolation | 4h | schema done |
| PotN / FotN bonuses | auto-select + manual override + payout | 6h | logic done |
| Venue booking requests | approve / reject / counter by prestige & lead time | 8h | logic done |
| Custom divisions & titles | incl. gimmick belts, reigns, defence windows | 15h | schema done |
| Promotion branding | logo upload, colours, cage, announcer | 12h | schema done |

Total added: **~75h of engine work done or specified**, leaving roughly 40–50h
of UI on top of the original plan. Realistically this pushes a playable
two-player build from ~14 weeks to ~20.

At 5–10 h/week, phases 0–4 is roughly 14 weeks to a playable two-player game
(~20 with the round-2 features folded in).
Phases 5 and 6 should stay cut until you're actually logging in to play.

**Phase 2 has no UI budget.** Ugly is fine. The point of phase 2 is proving the
economy doesn't break, and you can only prove that by playing 30 simulated events.

---

## Constraint: the second player doesn't code

No dev-only escape hatches. No "just edit the JSON to unstick that contract."
Every state the game can reach needs a UI path out of it. This mostly bites in
phase 2 — build the unhappy paths (fighter injured before a booked bout, event
with an empty card, promotion out of money) as you go rather than after.

---

## Stack

| | | Cost |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind, as a PWA | $0 |
| Backend | Supabase free tier — Postgres, auth, Realtime, RLS | $0 |
| Sim execution | Supabase Edge Functions (Deno) | $0 |
| World clock | pg_cron | $0 |
| Hosting | Cloudflare Pages | $0 |

PWA rather than native: installs to the home screen, no app store, no review.

Supabase free projects pause after 7 days of inactivity and wake on the next
request. For two people playing regularly that's a non-issue.

---

## Note on real names

Real fighters, promotions and arenas are fine for a private two-player game.
Two things to keep out of the codebase anyway, because they cost nothing to
avoid and are the only parts that could actually cause you a problem:

- **Don't use real journalists' or outlets' social handles** in the news feed.
  Invent in-game accounts. The feel is identical.
- **Don't commit bulk scraped datasets to a public repo.** Keep the import
  script in git and the data out of it. Make the repo private.
