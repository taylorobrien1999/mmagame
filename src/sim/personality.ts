/**
 * Fighter personality.
 *
 * DESIGN DECISION — read this before adding traits.
 *
 * Personality is 15 numeric AXES plus a handful of discrete QUIRKS drawn from a
 * pool. It is deliberately NOT a list of hundreds of hand-authored traits.
 *
 * Why: a hand-authored trait needs bespoke handling in negotiation, bout
 * acceptance, morale and social posts — four touchpoints each. 300 traits is
 * 1,200 code paths and it never ships.
 *
 * Axes compose instead. A fighter with greed 90 / loyalty 85 behaves nothing
 * like greed 90 / loyalty 15 at the negotiating table, and neither needed new
 * code. 15 axes at meaningful resolution plus 3 quirks from a pool of 40 gives
 * you more genuinely distinct fighters than a flat list ever would.
 *
 * Quirks are DATA. A quirk sets axis modifiers and raises named `hooks` that
 * the negotiation and booking code checks. Adding quirk #41 means adding a
 * row here — not touching the engine.
 */

import { Rng } from "./rng";
import type { Fighter } from "./types";

export interface PersonalityAxes {
  /** How heavily money outweighs everything else. */
  greed: number;
  /** Drive for titles and marquee fights. */
  ambition: number;
  /** Willingness to stay with a promotion that treats them well. */
  loyalty: number;
  /** Sensitivity to perceived disrespect — card position, opponent quality. */
  ego: number;
  /** Shows up, makes weight, takes short notice, honours the deal. */
  professionalism: number;
  /** Willingness to take a dangerous or unfavourable matchup. */
  riskTolerance: number;
  /** Appetite for press, trash talk, promotional obligations. */
  mediaAppetite: number;
  /** Caution about injury and long-term health. Drives fight refusals. */
  healthCaution: number;
  /** Desire to fight often. Low activity tanks morale for high values. */
  activityDesire: number;
  /** Cares about record and legacy over payday. */
  legacyFocus: number;
  /** Volatility — how far morale swings on any single event. */
  temperament: number;
  /** How hard they (or their management) negotiate, and how well they read market. */
  agentSavvy: number;
  /** Preference for fighting near home. */
  homeAttachment: number;
  /** How well they handle weight cuts and catchweight requests. */
  weightDiscipline: number;
  /** Likelihood of taking grievances public. */
  socialVolatility: number;
}

export type AxisKey = keyof PersonalityAxes;

/**
 * Hooks are named behavioural flags. Negotiation/booking code checks for a
 * hook by name, so quirks stay pure data.
 */
export type Hook =
  | "REFUSES_SHORT_NOTICE"
  | "REFUSES_CATCHWEIGHT"
  | "DEMANDS_PPV_POINTS"
  | "DEMANDS_TITLE_SHOT"
  | "WILL_NOT_LEAVE_HOME_REGION"
  | "ACCEPTS_ANYONE"
  | "HOLDS_OUT_FOR_MORE"
  | "TAKES_HOMETOWN_DISCOUNT"
  | "PUBLIC_COMPLAINER"
  | "NEVER_COMPLAINS_PUBLICLY"
  | "WANTS_LONG_DEAL"
  | "WANTS_SHORT_DEAL"
  | "MISSES_WEIGHT_OFTEN"
  | "RETIREMENT_CURIOUS"
  | "GYM_LOYALIST"
  | "CROSSOVER_CURIOUS";

export interface Quirk {
  id: string;
  name: string;
  /** Short line shown in the fighter profile UI. */
  blurb: string;
  /** Additive modifiers applied to axes, clamped 1-99 afterwards. */
  mods: Partial<Record<AxisKey, number>>;
  hooks?: Hook[];
  /** Relative frequency in the generated population. */
  weight: number;
}

export const QUIRKS: Quirk[] = [
  { id: "money_fighter", name: "Money Fighter", blurb: "Shows up when the cheque is right and not before.", mods: { greed: 28, legacyFocus: -18, loyalty: -12 }, hooks: ["HOLDS_OUT_FOR_MORE"], weight: 8 },
  { id: "title_or_nothing", name: "Title or Nothing", blurb: "Only interested in fights that move him toward gold.", mods: { ambition: 26, legacyFocus: 22, riskTolerance: 10 }, hooks: ["DEMANDS_TITLE_SHOT"], weight: 5 },
  { id: "company_man", name: "Company Man", blurb: "Loyal to the promotion that gave him a shot.", mods: { loyalty: 30, greed: -14, professionalism: 12 }, weight: 7 },
  { id: "free_agent_shopper", name: "Free Agent Shopper", blurb: "Tests the market every single time.", mods: { loyalty: -26, agentSavvy: 20 }, hooks: ["WANTS_SHORT_DEAL", "HOLDS_OUT_FOR_MORE"], weight: 6 },
  { id: "showman", name: "Showman", blurb: "Lives for the press conference as much as the fight.", mods: { mediaAppetite: 32, ego: 14 }, weight: 7 },
  { id: "recluse", name: "Recluse", blurb: "Wants to fight and go home. Media is a chore.", mods: { mediaAppetite: -34, socialVolatility: -20 }, hooks: ["NEVER_COMPLAINS_PUBLICLY"], weight: 6 },
  { id: "iron_will", name: "Iron Will", blurb: "Will fight anyone, anywhere, on any notice.", mods: { riskTolerance: 28, professionalism: 20, healthCaution: -22 }, hooks: ["ACCEPTS_ANYONE"], weight: 4 },
  { id: "cautious_veteran", name: "Cautious Veteran", blurb: "Has seen what this sport does to people.", mods: { healthCaution: 30, riskTolerance: -20, activityDesire: -14 }, hooks: ["REFUSES_SHORT_NOTICE"], weight: 5 },
  { id: "bad_weight_cutter", name: "Bad Weight Cutter", blurb: "The scale is a genuine opponent.", mods: { weightDiscipline: -34, professionalism: -10 }, hooks: ["MISSES_WEIGHT_OFTEN"], weight: 5 },
  { id: "professional_scale", name: "Professional to the Ounce", blurb: "Has never missed weight in his life.", mods: { weightDiscipline: 30, professionalism: 16 }, weight: 5 },
  { id: "hometown_hero", name: "Hometown Hero", blurb: "Draws a crowd at home and knows it.", mods: { homeAttachment: 34 }, hooks: ["TAKES_HOMETOWN_DISCOUNT", "WILL_NOT_LEAVE_HOME_REGION"], weight: 5 },
  { id: "road_warrior", name: "Road Warrior", blurb: "Hostile crowds don't bother him.", mods: { homeAttachment: -30, riskTolerance: 12 }, weight: 5 },
  { id: "hothead", name: "Hothead", blurb: "Reacts first, thinks later.", mods: { temperament: 32, ego: 20, socialVolatility: 26 }, hooks: ["PUBLIC_COMPLAINER"], weight: 6 },
  { id: "ice_cold", name: "Ice Cold", blurb: "Nothing rattles him, in or out of the cage.", mods: { temperament: -30, ego: -14 }, weight: 5 },
  { id: "workhorse", name: "Workhorse", blurb: "Wants to be booked four times a year.", mods: { activityDesire: 32, healthCaution: -12 }, weight: 6 },
  { id: "picky_booker", name: "Selective", blurb: "Two fights a year, both of them meaningful.", mods: { activityDesire: -28, legacyFocus: 16 }, weight: 5 },
  { id: "shark_manager", name: "Shark for a Manager", blurb: "His management team does not lose negotiations.", mods: { agentSavvy: 34, greed: 12 }, hooks: ["HOLDS_OUT_FOR_MORE", "DEMANDS_PPV_POINTS"], weight: 4 },
  { id: "self_managed", name: "Self-Managed", blurb: "No agent, no filter, no leverage.", mods: { agentSavvy: -30 }, weight: 5 },
  { id: "gym_loyalist", name: "Gym Loyalist", blurb: "Won't fight teammates. Ever.", mods: { loyalty: 14 }, hooks: ["GYM_LOYALIST"], weight: 5 },
  { id: "crossover_dreamer", name: "Crossover Dreamer", blurb: "Keeps mentioning a boxing match.", mods: { mediaAppetite: 20, greed: 16 }, hooks: ["CROSSOVER_CURIOUS"], weight: 4 },
  { id: "journeyman", name: "Journeyman", blurb: "Takes the fight, takes the cheque, moves on.", mods: { professionalism: 22, ambition: -24, riskTolerance: 18, ego: -18 }, hooks: ["ACCEPTS_ANYONE", "WANTS_SHORT_DEAL"], weight: 8 },
  { id: "prospect_hype", name: "Believes the Hype", blurb: "Convinced he's already a star.", mods: { ego: 30, agentSavvy: -14, ambition: 18 }, weight: 6 },
  { id: "quiet_pro", name: "Quiet Professional", blurb: "Never a problem, never a headline.", mods: { professionalism: 26, mediaAppetite: -16, socialVolatility: -22 }, hooks: ["NEVER_COMPLAINS_PUBLICLY"], weight: 7 },
  { id: "fading_star", name: "Fading Star", blurb: "Still being paid on last decade's name.", mods: { greed: 22, activityDesire: -18, healthCaution: 16 }, hooks: ["RETIREMENT_CURIOUS", "HOLDS_OUT_FOR_MORE"], weight: 4 },
  { id: "security_seeker", name: "Security Seeker", blurb: "Wants the long deal and the guaranteed money.", mods: { riskTolerance: -16, loyalty: 14 }, hooks: ["WANTS_LONG_DEAL"], weight: 6 },
  { id: "divisional_purist", name: "Divisional Purist", blurb: "Fights at his weight or not at all.", mods: { weightDiscipline: 14, professionalism: 8 }, hooks: ["REFUSES_CATCHWEIGHT"], weight: 5 },
  { id: "loud_online", name: "Extremely Online", blurb: "Posts through everything, good or bad.", mods: { socialVolatility: 36, mediaAppetite: 22 }, hooks: ["PUBLIC_COMPLAINER"], weight: 6 },
  { id: "old_school", name: "Old School", blurb: "Thinks fighters should shut up and fight.", mods: { mediaAppetite: -22, professionalism: 18, socialVolatility: -26 }, weight: 5 },
];

/** Weighted pick of `count` distinct quirks. */
export function rollQuirks(rng: Rng, count: number): Quirk[] {
  const pool = QUIRKS.slice();
  const out: Quirk[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const chosen = rng.weighted(pool.map(q => [q, q.weight] as const));
    out.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return out;
}

export interface Personality {
  axes: PersonalityAxes;
  quirks: Quirk[];
  hooks: Set<Hook>;
}

const AXIS_KEYS: AxisKey[] = [
  "greed", "ambition", "loyalty", "ego", "professionalism", "riskTolerance",
  "mediaAppetite", "healthCaution", "activityDesire", "legacyFocus",
  "temperament", "agentSavvy", "homeAttachment", "weightDiscipline", "socialVolatility",
];

/**
 * Generate a personality. Correlated with the fighter where it makes sense —
 * a 38-year-old with 40 fights should skew cautious, a high-popularity fighter
 * should skew toward ego and media appetite. Pure random personality makes
 * every roster feel like noise.
 */
export function generatePersonality(f: Fighter, rng: Rng): Personality {
  const age = f.dob ? (2026 - new Date(f.dob).getFullYear()) : 29;
  const fights = f.record.w + f.record.l + f.record.d;
  const pop = f.popularity;

  const axes = {} as PersonalityAxes;
  for (const k of AXIS_KEYS) axes[k] = clamp(rng.normal(50, 17), 1, 99);

  // Correlations — these are what stop the roster feeling like noise.
  axes.healthCaution += (age - 29) * 1.9 + Math.max(0, fights - 20) * 0.55;
  axes.activityDesire -= (age - 29) * 1.5;
  axes.ego += (pop - 45) * 0.32;
  axes.mediaAppetite += (pop - 45) * 0.30;
  axes.greed += (pop - 45) * 0.22;
  axes.agentSavvy += (pop - 45) * 0.26;
  axes.ambition += (30 - age) * 1.1;
  axes.professionalism += Math.min(fights, 30) * 0.35;
  axes.riskTolerance -= (age - 29) * 1.0;

  const quirks = rollQuirks(rng, rng.weighted([[1, 25], [2, 45], [3, 30]]));
  for (const q of quirks) {
    for (const [k, v] of Object.entries(q.mods)) {
      axes[k as AxisKey] += v as number;
    }
  }

  for (const k of AXIS_KEYS) axes[k] = Math.round(clamp(axes[k], 1, 99));

  const hooks = new Set<Hook>();
  for (const q of quirks) for (const h of q.hooks ?? []) hooks.add(h);

  return { axes, quirks, hooks };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
