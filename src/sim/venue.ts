/**
 * Venue booking and post-event bonuses.
 *
 * Both are small systems, but both are where the player feels the size of
 * their promotion. A startup getting rejected by Madison Square Garden and
 * booking a fairground instead is more instructive than any tutorial.
 */

import { Rng } from "./rng";
import type { FightResult, Fighter } from "./types";

// ------------------------------------------------------------- venues ----

export interface Venue {
  id: string;
  name: string;
  city: string;
  country: string;
  capacity: number;
  baseCost: number;
  /** 1-10. Tier 10 is MSG / T-Mobile Arena. Tier 1 is a local rec centre. */
  tier: number;
  /** Below this prestige the venue won't even take the call. */
  minPrestige: number;
  /** Days ahead the venue expects to be booked. */
  leadTimeDays: number;
}

export type VenueStatus = "APPROVED" | "REJECTED" | "COUNTERED";

export interface VenueResponse {
  status: VenueStatus;
  quotedCost?: number;
  counteredDate?: string;
  /** Always populated. A rejection the player can't learn from is a bug. */
  reason: string;
  /** Days until the venue replies. Big venues take their time. */
  resolvesInDays: number;
}

export function requestVenue(
  venue: Venue,
  promo: { prestige: number; money: number; reputation: number; country: string },
  daysUntilEvent: number,
  rng: Rng,
): VenueResponse {
  const resolvesInDays = Math.max(1, Math.round(venue.tier * 1.4 + rng.range(0, 3)));

  // Hard gate: prestige floor.
  if (promo.prestige < venue.minPrestige) {
    return {
      status: "REJECTED",
      reason: `${venue.name} doesn't work with promotions at your level yet. They want to see you draw consistently first.`,
      resolvesInDays,
    };
  }

  // Lead time. Asking MSG for a date in three weeks is not a negotiation.
  if (daysUntilEvent < venue.leadTimeDays * 0.5) {
    return {
      status: "REJECTED",
      reason: `${venue.name} books roughly ${venue.leadTimeDays} days out. ${daysUntilEvent} days isn't enough notice.`,
      resolvesInDays,
    };
  }

  // Cost scales with tier and shrinks slightly for prestigious promotions
  // (venues want a name on the marquee).
  const prestigeDiscount = 1 - Math.min(0.22, (promo.prestige / 100) * 0.28);
  const quotedCost = Math.round(venue.baseCost * prestigeDiscount * rng.range(0.92, 1.14) / 500) * 500;

  if (promo.money < quotedCost) {
    return {
      status: "REJECTED",
      quotedCost,
      reason: `${venue.name} quoted $${quotedCost.toLocaleString()} and requires the deposit up front. You can't cover it.`,
      resolvesInDays,
    };
  }

  // Short-but-workable notice → counter with a later date rather than refuse.
  if (daysUntilEvent < venue.leadTimeDays) {
    const push = Math.round(venue.leadTimeDays - daysUntilEvent + rng.range(7, 30));
    if (rng.chance(0.65)) {
      return {
        status: "COUNTERED",
        quotedCost,
        counteredDate: `+${push}d`,
        reason: `${venue.name} has a conflict on your date but can offer one about ${push} days later.`,
        resolvesInDays,
      };
    }
  }

  // Reputation matters — venues talk to each other.
  const repPenalty = promo.reputation < 40 ? (40 - promo.reputation) * 0.01 : 0;
  const approveChance = Math.min(0.96, 0.55 + (promo.prestige - venue.minPrestige) / 110) - repPenalty;

  if (rng.chance(approveChance)) {
    return {
      status: "APPROVED",
      quotedCost,
      reason: `${venue.name} confirmed. Rental: $${quotedCost.toLocaleString()}.`,
      resolvesInDays,
    };
  }

  return {
    status: "REJECTED",
    quotedCost,
    reason: rng.pick([
      `${venue.name} has a scheduling conflict on that date.`,
      `${venue.name} passed — they've had issues with combat sports events recently.`,
      `${venue.name} went with another promoter for that window.`,
    ]),
    resolvesInDays,
  };
}

// ------------------------------------------------------------ bonuses ----

export type BonusType = "FOTN" | "POTN_KO" | "POTN_SUB" | "POTN" | "DISCRETIONARY";

export interface BonusAward {
  type: BonusType;
  fighterId: string;
  boutId: string;
  amount: number;
  autoAwarded: boolean;
  /** Morale bump. Scales with the amount relative to the fighter's purse. */
  moraleDelta: number;
}

export interface BonusSettings {
  fotn: number;
  potn: number;
  /** TWO = one KO + one submission. ONE = single best performance. */
  potnMode: "TWO" | "ONE" | "OFF";
  autoAward: boolean;
}

export interface ScoredBout {
  boutId: string;
  result: FightResult;
  fighterA: Fighter;
  fighterB: Fighter;
  /** Purse paid to each, used to scale the morale effect of a bonus. */
  purseA: number;
  purseB: number;
}

/**
 * Auto-selection. Also used to seed the manual picker's suggestions, so the
 * player sees "recommended" next to the obvious choice rather than staring at
 * a blank list.
 */
export function selectBonuses(
  bouts: ScoredBout[],
  settings: BonusSettings,
  auto: boolean,
): BonusAward[] {
  const awards: BonusAward[] = [];
  if (!bouts.length) return awards;

  const morale = (amount: number, purse: number) =>
    Math.round(Math.min(22, 6 + (amount / Math.max(1, purse)) * 14));

  // --- Fight of the Night: highest fightRating. Both fighters get it. ---
  if (settings.fotn > 0) {
    const best = bouts.slice().sort((a, b) => b.result.fightRating - a.result.fightRating)[0];
    for (const [f, purse] of [[best.fighterA, best.purseA], [best.fighterB, best.purseB]] as const) {
      awards.push({
        type: "FOTN", fighterId: f.id, boutId: best.boutId,
        amount: settings.fotn, autoAwarded: auto,
        moraleDelta: morale(settings.fotn, purse),
      });
    }
  }

  if (settings.potnMode === "OFF" || settings.potn <= 0) return awards;

  // --- Performance of the Night ---
  const winnerOf = (b: ScoredBout) => {
    if (b.result.winner === "A") return { f: b.fighterA, purse: b.purseA };
    if (b.result.winner === "B") return { f: b.fighterB, purse: b.purseB };
    return null;
  };
  // Score a finish by how emphatic it was: earlier is better, KO over TKO.
  const finishScore = (b: ScoredBout) => {
    const m = b.result.method;
    const base = m === "KO" ? 100 : m === "SUBMISSION" ? 80 : m === "TKO" ? 70 : 0;
    const earliness = Math.max(0, 40 - (b.result.endRound - 1) * 12 - b.result.endClock / 40);
    return base + earliness + b.result.fightRating * 0.25;
  };

  const strikeFinishes = bouts.filter(b => ["KO", "TKO", "TKO_DOCTOR"].includes(b.result.method));
  const subFinishes = bouts.filter(b => b.result.method === "SUBMISSION");

  const push = (b: ScoredBout | undefined, type: BonusType) => {
    if (!b) return;
    const w = winnerOf(b);
    if (!w) return;
    awards.push({
      type, fighterId: w.f.id, boutId: b.boutId,
      amount: settings.potn, autoAwarded: auto,
      moraleDelta: morale(settings.potn, w.purse),
    });
  };

  if (settings.potnMode === "TWO") {
    push(strikeFinishes.sort((a, b) => finishScore(b) - finishScore(a))[0], "POTN_KO");
    push(subFinishes.sort((a, b) => finishScore(b) - finishScore(a))[0], "POTN_SUB");
    // No finishes at all on the card? Award nothing — and the UI should say so.
  } else {
    const all = [...strikeFinishes, ...subFinishes].sort((a, b) => finishScore(b) - finishScore(a));
    push(all[0], "POTN");
  }

  return awards;
}

/** Total cost, so the event screen can warn before the player confirms. */
export function totalBonusCost(awards: BonusAward[]): number {
  return awards.reduce((n, a) => n + a.amount, 0);
}

/**
 * A promise of bonus money the promotion can't cover is worse than no bonus.
 * Call this before confirming; if it fails, the player picks smaller awards.
 */
export function canAffordBonuses(awards: BonusAward[], promotionMoney: number): boolean {
  return totalBonusCost(awards) <= promotionMoney;
}
