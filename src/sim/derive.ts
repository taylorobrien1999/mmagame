/**
 * Turns real career statistics into 0-100 game attributes.
 *
 * Input shape matches the Kaggle "UFC Dataset (1994-2026)" fighter table,
 * which is itself scraped from UFCStats. Those columns are:
 *   Height_cm, Weight_kg, Reach_cm, Stance, DOB, Wins, Losses, Draws,
 *   SLpM, Str_Acc, SApM, Str_Def, TD_Avg, TD_Acc, TD_Def, Sub_Avg
 *
 * Strategy: map each raw stat to a percentile within the UFC population,
 * then stretch that percentile onto the 0-100 game scale so that the median
 * UFC fighter sits at 70. Anyone outside the UFC pool (regional, amateur,
 * generated prospects) is generated *below* that distribution, which is what
 * makes signing a UFC castoff feel meaningful in-game.
 *
 * Deliberately NOT hand-tuned. Hand-tuning 4,400 fighters is how this project
 * dies. Tune the *model*, re-run, spot-check the top 50 names.
 */

import type { Attributes, Fighter, Stance } from "./types";
import { Rng } from "./rng";

export interface RawFighterStats {
  name: string;
  heightCm?: number;
  weightKg?: number;
  reachCm?: number;
  stance?: string;
  dob?: string;
  wins: number;
  losses: number;
  draws?: number;
  /** Significant strikes landed per minute. */
  slpm?: number;
  /** Striking accuracy, 0-1. */
  strAcc?: number;
  /** Significant strikes absorbed per minute. */
  sapm?: number;
  /** Striking defence, 0-1. */
  strDef?: number;
  /** Takedowns landed per 15 min. */
  tdAvg?: number;
  /** Takedown accuracy, 0-1. */
  tdAcc?: number;
  /** Takedown defence, 0-1. */
  tdDef?: number;
  /** Submission attempts per 15 min. */
  subAvg?: number;

  /** Optional, from fight history: counts by method. Improves power/chin a lot. */
  winsByKo?: number;
  winsBySub?: number;
  lossesByKo?: number;
  lossesBySub?: number;

  weightClass?: string;
  nationality?: string;
}

/**
 * Reference distribution for the UFC population.
 * These are the anchors the percentile mapping uses: [p10, p50, p90].
 * Recalculate these from your actual dataset with scripts/fit-anchors.ts —
 * hardcoded here so the module works standalone.
 */
const ANCHORS = {
  slpm:   [1.85, 3.35, 5.10],
  strAcc: [0.35, 0.44, 0.545],
  sapm:   [2.10, 3.20, 4.60],   // lower is better — inverted below
  strDef: [0.45, 0.555, 0.655],
  tdAvg:  [0.00, 1.25, 3.60],
  tdAcc:  [0.00, 0.36, 0.60],
  tdDef:  [0.37, 0.64, 0.87],
  subAvg: [0.00, 0.55, 1.90],
} as const;

/** Map a raw value to 0-1 percentile using piecewise-linear anchors. */
function pct(value: number | undefined, anchors: readonly number[], invert = false): number {
  if (value === undefined || Number.isNaN(value)) return 0.5;
  const [p10, p50, p90] = anchors;
  let p: number;
  if (value <= p10) p = 0.10 * clamp01(value / Math.max(p10, 1e-6));
  else if (value <= p50) p = 0.10 + 0.40 * ((value - p10) / Math.max(p50 - p10, 1e-6));
  else if (value <= p90) p = 0.50 + 0.40 * ((value - p50) / Math.max(p90 - p50, 1e-6));
  else p = 0.90 + 0.10 * clamp01((value - p90) / Math.max(p90 - p50, 1e-6));
  p = clamp01(p);
  return invert ? 1 - p : p;
}

/**
 * Percentile -> game rating. Median UFC (p=0.5) lands on 70.
 * The curve is deliberately steep at the top so elite fighters separate.
 */
function toRating(p: number): number {
  const centred = clamp01(p);
  // 0 -> 40, 0.5 -> 70, 1.0 -> 97
  const r = 40 + 57 * Math.pow(centred, 0.85);
  return Math.round(clamp(r, 20, 99));
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function deriveAttributes(s: RawFighterStats, rng: Rng): Attributes {
  const fights = Math.max(1, s.wins + s.losses + (s.draws ?? 0));

  // --- Striking ---
  const volume = toRating(pct(s.slpm, ANCHORS.slpm));
  const striking = toRating(pct(s.strAcc, ANCHORS.strAcc) * 0.65 + pct(s.slpm, ANCHORS.slpm) * 0.35);
  const strikeDef = toRating(pct(s.strDef, ANCHORS.strDef) * 0.6 + pct(s.sapm, ANCHORS.sapm, true) * 0.4);

  // Power: KO rate is the single best real-world proxy we have.
  const koRate = s.winsByKo !== undefined ? s.winsByKo / fights : undefined;
  const power = koRate !== undefined
    ? toRating(clamp01(koRate / 0.55))
    : toRating(pct(s.slpm, ANCHORS.slpm) * 0.4 + 0.3);

  // Chin: getting KO'd often is the signal. Few losses = benefit of the doubt.
  const koLossRate = s.lossesByKo !== undefined ? s.lossesByKo / fights : undefined;
  const chin = koLossRate !== undefined
    ? toRating(clamp01(1 - koLossRate / 0.30))
    : toRating(pct(s.sapm, ANCHORS.sapm, true));

  // --- Grappling ---
  const takedowns = toRating(pct(s.tdAvg, ANCHORS.tdAvg) * 0.6 + pct(s.tdAcc, ANCHORS.tdAcc) * 0.4);
  const takedownDef = toRating(pct(s.tdDef, ANCHORS.tdDef));
  const submissions = toRating(
    pct(s.subAvg, ANCHORS.subAvg) * 0.7 +
    (s.winsBySub !== undefined ? clamp01(s.winsBySub / fights / 0.40) : 0.4) * 0.3
  );
  const subLossRate = s.lossesBySub !== undefined ? s.lossesBySub / fights : undefined;
  const subDefense = subLossRate !== undefined
    ? toRating(clamp01(1 - subLossRate / 0.25))
    : toRating(pct(s.tdDef, ANCHORS.tdDef) * 0.8 + 0.1);

  // Top control correlates with takedown volume + low sub losses.
  const topControl = toRating(pct(s.tdAvg, ANCHORS.tdAvg) * 0.55 + pct(s.tdAcc, ANCHORS.tdAcc) * 0.45);
  // Scrambling is the inverse-ish of being controlled: proxy off TD defence.
  const scrambling = toRating(pct(s.tdDef, ANCHORS.tdDef) * 0.7 + pct(s.subAvg, ANCHORS.subAvg) * 0.3);

  // --- Physical ---
  // No direct cardio stat exists. Proxy: high volume sustained + low absorb.
  const cardio = toRating(
    pct(s.slpm, ANCHORS.slpm) * 0.35 +
    pct(s.sapm, ANCHORS.sapm, true) * 0.25 +
    pct(s.tdAvg, ANCHORS.tdAvg) * 0.20 +
    0.20
  );
  const strength = toRating(pct(s.tdAvg, ANCHORS.tdAvg) * 0.5 + (koRate !== undefined ? clamp01(koRate / 0.55) : 0.45) * 0.5);
  const speed = toRating(pct(s.strAcc, ANCHORS.strAcc) * 0.5 + pct(s.strDef, ANCHORS.strDef) * 0.5);
  const durability = toRating((pct(s.sapm, ANCHORS.sapm, true) + clamp01(1 - (koLossRate ?? 0.10) / 0.30)) / 2);

  // --- Mental ---
  // No stats exist for these. Seed from record quality + deterministic noise.
  // This is honest: the game needs the axis, real data can't supply it.
  const winPct = s.wins / fights;
  const fightIq = toRating(clamp01(winPct * 0.7 + pct(s.strAcc, ANCHORS.strAcc) * 0.3) + rng.normal(0, 0.06));
  const composure = toRating(clamp01(winPct * 0.6 + clamp01(1 - (koLossRate ?? 0.1) / 0.3) * 0.4) + rng.normal(0, 0.07));
  // Aggression is a *style* axis, not a quality axis — flat-ish distribution.
  const aggression = Math.round(clamp(
    50 + (pct(s.slpm, ANCHORS.slpm) - 0.5) * 60 + rng.normal(0, 8),
    10, 95
  ));

  return {
    power, striking, volume, strikeDef, chin,
    takedowns, takedownDef, topControl, submissions, subDefense, scrambling,
    cardio, speed, strength, durability,
    fightIq, composure, aggression,
  };
}

/** Single headline number for UI. Weighted toward what actually wins fights. */
export function computeOverall(a: Attributes): number {
  const w: [keyof Attributes, number][] = [
    ["striking", 1.3], ["power", 1.2], ["strikeDef", 1.2], ["chin", 0.9],
    ["volume", 0.7],
    ["takedowns", 1.0], ["takedownDef", 1.1], ["topControl", 0.8],
    ["submissions", 0.9], ["subDefense", 0.8], ["scrambling", 0.7],
    ["cardio", 1.3], ["speed", 1.0], ["strength", 0.6], ["durability", 0.8],
    ["fightIq", 1.1], ["composure", 0.9],
    // aggression deliberately excluded — it's a style, not a quality
  ];
  let sum = 0, tw = 0;
  for (const [k, weight] of w) { sum += a[k] * weight; tw += weight; }
  return Math.round(sum / tw);
}

/**
 * Popularity is NOT derived from skill — that's the whole point.
 * Real signal would come from social following / main-event count / finish rate.
 * Until you wire that in, seed from KO rate (exciting fighters get known) +
 * win count (longevity) + noise, then let in-game performances move it.
 */
export function derivePopularity(s: RawFighterStats, rng: Rng): number {
  const fights = Math.max(1, s.wins + s.losses + (s.draws ?? 0));
  const finishRate = ((s.winsByKo ?? 0) + (s.winsBySub ?? 0)) / fights;
  const base =
    clamp01(s.wins / 25) * 35 +
    clamp01(finishRate / 0.6) * 30 +
    clamp01(fights / 30) * 15;
  return Math.round(clamp(base + rng.normal(0, 9), 1, 99));
}

export function buildFighter(s: RawFighterStats, rng: Rng, id: string): Fighter {
  const attributes = deriveAttributes(s, rng);
  return {
    id,
    name: s.name,
    nationality: s.nationality ?? "Unknown",
    dob: s.dob,
    heightCm: s.heightCm,
    reachCm: s.reachCm,
    stance: (s.stance as Stance) ?? "Orthodox",
    weightClass: s.weightClass ?? "Unknown",
    record: { w: s.wins, l: s.losses, d: s.draws ?? 0, nc: 0 },
    attributes,
    popularity: derivePopularity(s, rng),
    marketability: Math.round(clamp(attributes.aggression * 0.4 + rng.normal(50, 15) * 0.6, 1, 99)),
    overall: computeOverall(attributes),
    condition: { health: 100, fatigue: 0, injuries: [] },
  };
}
