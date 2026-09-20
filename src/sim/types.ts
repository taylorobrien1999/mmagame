/** Core domain types for the fight simulation. */

export type Discipline = "MMA" | "BOXING" | "BAREKNUCKLE" | "KICKBOXING" | "GRAPPLING";

export type Stance = "Orthodox" | "Southpaw" | "Switch";

/**
 * All attributes are 0-100 where ~70 is a median UFC roster fighter,
 * ~85 is top-15, ~92+ is an all-time great. Regional/amateur sits 35-60.
 * This scale is enforced by derive.ts normalising against the real UFC pool.
 */
export interface Attributes {
  // Striking
  power: number;        // one-punch finishing ability
  striking: number;     // technique + accuracy
  volume: number;       // output rate
  strikeDef: number;    // head movement, blocking, distance management
  chin: number;         // ability to absorb a clean shot without going down

  // Grappling
  takedowns: number;    // offensive wrestling
  takedownDef: number;
  topControl: number;   // holding and advancing position
  submissions: number;  // offensive sub game
  subDefense: number;
  scrambling: number;   // getting back up, reversing

  // Physical
  cardio: number;       // stamina pool + recovery rate
  speed: number;        // affects who acts first and evasion
  strength: number;     // clinch, takedown power, GnP damage
  durability: number;   // cumulative damage resistance (distinct from chin)

  // Mental
  fightIq: number;      // picks better actions, adapts
  composure: number;    // resists panic when hurt or behind
  aggression: number;   // 0 = pure counter-fighter, 100 = pressure/brawler
}

export interface Fighter {
  id: string;
  name: string;
  nickname?: string;
  nationality: string;
  dob?: string;
  heightCm?: number;
  reachCm?: number;
  stance: Stance;
  weightClass: string;

  record: { w: number; l: number; d: number; nc: number };
  attributes: Attributes;

  /** 0-100. Completely separate from skill. Drives gate, PPV, social buzz. */
  popularity: number;
  /** 0-100. How much the fighter's brand grows/shrinks per performance. */
  marketability: number;

  /** Composite skill number shown in UI. Derived, never stored by hand. */
  overall: number;

  /** Current physical state, persisted between fights. */
  condition: {
    health: number;      // 0-100, recovers over world days
    fatigue: number;     // lingering camp/fight fatigue
    injuries: Injury[];
  };
}

export interface Injury {
  type: string;
  severity: number;     // 1-10
  daysRemaining: number;
}

export interface Ruleset {
  discipline: Discipline;
  rounds: number;
  roundLengthSec: number;
  /** Bare-knuckle has no gloves: more cuts, more KDs, fewer sub attempts. */
  gloves: boolean;
  /** Boxing/kickboxing disallow grappling entirely. */
  allowGrappling: boolean;
  allowGroundStrikes: boolean;
  /** Bare-knuckle rounds are traditionally 2 minutes. */
  tenPointMust: boolean;
  /** Per-strike damage scaling. Boxing is 36 min of striking-only exchanges,
   *  so MMA-scaled damage would finish every fight. Tuned per discipline. */
  damageMult: number;
  /** Knockdown likelihood scaling. Bare-knuckle up, gloved boxing down. */
  kdMult: number;
}

export const RULESETS: Record<string, Ruleset> = {
  MMA_3: { discipline: "MMA", rounds: 3, roundLengthSec: 300, gloves: true, allowGrappling: true, allowGroundStrikes: true, tenPointMust: true, damageMult: 1.0, kdMult: 1.0 },
  MMA_5: { discipline: "MMA", rounds: 5, roundLengthSec: 300, gloves: true, allowGrappling: true, allowGroundStrikes: true, tenPointMust: true, damageMult: 0.80, kdMult: 0.92 },
  BOXING_10: { discipline: "BOXING", rounds: 10, roundLengthSec: 180, gloves: true, allowGrappling: false, allowGroundStrikes: false, tenPointMust: true, damageMult: 0.34, kdMult: 0.45 },
  BOXING_12: { discipline: "BOXING", rounds: 12, roundLengthSec: 180, gloves: true, allowGrappling: false, allowGroundStrikes: false, tenPointMust: true, damageMult: 0.27, kdMult: 0.38 },
  BKFC_5: { discipline: "BAREKNUCKLE", rounds: 5, roundLengthSec: 120, gloves: false, allowGrappling: false, allowGroundStrikes: false, tenPointMust: true, damageMult: 0.72, kdMult: 1.25 },
  KICKBOX_3: { discipline: "KICKBOXING", rounds: 3, roundLengthSec: 180, gloves: true, allowGrappling: false, allowGroundStrikes: false, tenPointMust: true, damageMult: 0.85, kdMult: 1.05 },
};

export type Position = "STANDING" | "CLINCH" | "GROUND_A_TOP" | "GROUND_B_TOP";

export type FinishMethod =
  | "KO"
  | "TKO"
  | "TKO_DOCTOR"
  | "SUBMISSION"
  | "DECISION_UNANIMOUS"
  | "DECISION_SPLIT"
  | "DECISION_MAJORITY"
  | "DRAW";

/** One line of play-by-play. The live event screen replays these on a timer. */
export interface PlayByPlay {
  round: number;
  /** Seconds elapsed within the round. */
  clock: number;
  /** "A" | "B" | null for neutral events. */
  actor: "A" | "B" | null;
  text: string;
  /** Tag for UI emphasis — big moments get animation/sound. */
  weight: "minor" | "notable" | "major";
}

export interface RoundStats {
  sigStrikes: number;
  sigStrikesAttempted: number;
  takedowns: number;
  takedownsAttempted: number;
  subAttempts: number;
  knockdowns: number;
  controlSec: number;
  damageDealt: number;
}

export interface FightResult {
  winner: "A" | "B" | null;
  method: FinishMethod;
  endRound: number;
  endClock: number;
  /** For decisions: three judges' totals. */
  scorecards?: { judge: string; a: number; b: number }[];
  statsA: RoundStats[];
  statsB: RoundStats[];
  pbp: PlayByPlay[];
  /** Crowd/critic rating 0-100 — feeds event grade, buzz, PPV for next show. */
  fightRating: number;
  /** Injuries sustained, applied to world state after the event. */
  injuriesA: Injury[];
  injuriesB: Injury[];
}
