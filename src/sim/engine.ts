/**
 * Fight simulation engine.
 *
 * Exchange-based rather than tick-based: each iteration resolves one meaningful
 * exchange that consumes 3-25 seconds of clock. This produces play-by-play that
 * reads like a real fight instead of 300 one-second nothing-happened lines.
 *
 * Fully deterministic given (fighterA, fighterB, ruleset, seed).
 *
 * TUNING: every magic number lives in TUNING below. Run harness.ts after any
 * change and check the aggregate finish/decision split against real-world rates.
 */

import { Rng } from "./rng";
import { say } from "./commentary";
import type {
  Fighter, Ruleset, Position, FightResult, PlayByPlay,
  RoundStats, FinishMethod, Injury,
} from "./types";

export const TUNING = {
  /** Base probability a landed significant strike drops the opponent. */
  knockdownBase: 0.0150,
  /** Multiplier on KD chance for bare-knuckle (no gloves, less padding). */
  bareKnuckleKdMult: 1.75,
  /** Health below this + a knockdown = likely stoppage. */
  tkoHealthThreshold: 32,
  /** Probability a downed, badly hurt fighter is finished on follow-up. */
  followUpFinishBase: 0.55,
  /** Base success of a submission attempt before attribute modifiers. */
  subBase: 0.115,
  /** Stamina cost multipliers. */
  staminaStrike: 1.5,
  staminaTakedown: 6.5,
  staminaGrappleDefend: 3.0,
  /** Damage scaling. Raise to shorten fights. */
  damageScale: 1.0,
  /** Cut/laceration chance per clean head strike (bare-knuckle much higher). */
  cutBase: 0.006,
  bareKnuckleCutMult: 4.0,
};

interface FState {
  f: Fighter;
  side: "A" | "B";
  health: number;      // 100 -> 0, cumulative damage
  stamina: number;     // 100 -> 0
  cuts: number;
  knockdownsThisRound: number;
  dropped: boolean;
  stats: RoundStats[];
}

function blankRound(): RoundStats {
  return {
    sigStrikes: 0, sigStrikesAttempted: 0, takedowns: 0, takedownsAttempted: 0,
    subAttempts: 0, knockdowns: 0, controlSec: 0, damageDealt: 0,
  };
}

function mk(f: Fighter, side: "A" | "B"): FState {
  return {
    f, side,
    health: 60 + f.attributes.durability * 0.4,   // durable fighters start deeper
    stamina: 100,
    cuts: 0, knockdownsThisRound: 0, dropped: false,
    stats: [],
  };
}

/** Effective attribute after fatigue. Cardio protects against the drop-off. */
function eff(s: FState, key: keyof Fighter["attributes"]): number {
  const base = s.f.attributes[key];
  const fatigueFactor = s.stamina / 100;
  const cardioProtection = 0.35 + (s.f.attributes.cardio / 100) * 0.45;
  const penalty = (1 - fatigueFactor) * (1 - cardioProtection);
  // Chin and durability degrade harder when gassed — this is true to life.
  const sensitivity = key === "chin" || key === "strikeDef" || key === "speed" ? 1.35 : 1.0;
  return Math.max(10, base * (1 - penalty * sensitivity));
}

function drain(s: FState, amount: number) {
  const recovery = s.f.attributes.cardio / 100;
  s.stamina = Math.max(0, s.stamina - amount * (1.35 - recovery * 0.6));
}

export function simulateFight(
  fighterA: Fighter,
  fighterB: Fighter,
  ruleset: Ruleset,
  seed: string,
): FightResult {
  const rng = new Rng(seed);
  const A = mk(fighterA, "A");
  const B = mk(fighterB, "B");
  const pbp: PlayByPlay[] = [];
  const injuriesA: Injury[] = [];
  const injuriesB: Injury[] = [];

  let position: Position = "STANDING";
  let finish: { winner: "A" | "B"; method: FinishMethod; round: number; clock: number } | null = null;

  const log = (round: number, clock: number, actor: "A" | "B" | null, text: string, weight: PlayByPlay["weight"] = "minor") => {
    pbp.push({ round, clock: Math.round(clock), actor, text, weight });
  };

  for (let round = 1; round <= ruleset.rounds && !finish; round++) {
    A.stats.push(blankRound());
    B.stats.push(blankRound());
    A.knockdownsThisRound = 0;
    B.knockdownsThisRound = 0;
    position = "STANDING";

    log(round, 0, null, say.roundStart(round, ruleset), "notable");

    let clock = 0;
    while (clock < ruleset.roundLengthSec && !finish) {
      // ---- Initiative: who dictates this exchange ----
      const initA = eff(A, "speed") * 0.5 + eff(A, "aggression") * 0.3 + eff(A, "fightIq") * 0.2 + rng.normal(0, 12);
      const initB = eff(B, "speed") * 0.5 + eff(B, "aggression") * 0.3 + eff(B, "fightIq") * 0.2 + rng.normal(0, 12);
      const [act, def] = initA >= initB ? [A, B] : [B, A];

      const r = round - 1;
      let duration = rng.range(6, 18);

      // ---- Action selection ----
      const action = chooseAction(act, def, position, ruleset, rng);

      switch (action) {
        case "STRIKE": {
          const burst = rng.int(3, 9);
          for (let i = 0; i < burst && !finish; i++) {
            act.stats[r].sigStrikesAttempted++;
            drain(act, TUNING.staminaStrike);

            const hitChance = clamp(
              0.40 + (eff(act, "striking") - eff(def, "strikeDef")) / 290 + (eff(act, "speed") - eff(def, "speed")) / 620,
              0.16, 0.78
            );
            if (!rng.chance(hitChance)) {
              if (i === 0 && rng.chance(0.35)) log(round, clock, act.side, say.miss(act.f, def.f, rng), "minor");
              continue;
            }

            act.stats[r].sigStrikes++;
            const raw = (0.9 + eff(act, "power") / 55) * (1.9 - eff(def, "durability") / 100) * TUNING.damageScale * ruleset.damageMult;
            const dmg = raw * rng.range(0.40, 1.80) * (ruleset.gloves ? 1.0 : 1.3);
            def.health -= dmg;
            act.stats[r].damageDealt += dmg;

            // Cuts
            const cutMult = ruleset.gloves ? 1 : TUNING.bareKnuckleCutMult;
            if (rng.chance(TUNING.cutBase * cutMult * (dmg / 8))) {
              def.cuts++;
              log(round, clock, act.side, say.cut(act.f, def.f, def.cuts), "notable");
              if (def.cuts >= 3 && rng.chance(0.30)) {
                finish = { winner: act.side, method: "TKO_DOCTOR", round, clock };
                log(round, clock, null, say.doctorStoppage(def.f), "major");
                break;
              }
            }

            // Knockdown
            const kdMult = ruleset.kdMult;
            const freshness = round === 1 ? 2.15 : round === 2 ? 0.95 : 0.66;
            const healthFactor = 1 + Math.max(0, (70 - def.health) / 70);
            const kdChance = clamp(
              TUNING.knockdownBase * kdMult * healthFactor * freshness *
              (eff(act, "power") / Math.max(eff(def, "chin"), 25)),
              0, 0.40
            );
            if (rng.chance(kdChance)) {
              def.knockdownsThisRound++;
              act.stats[r].knockdowns++;
              def.health -= 8;
              log(round, clock, act.side, say.knockdown(act.f, def.f, rng), "major");

              // Follow-up finish
              const flush = rng.chance(clamp(
                (eff(act, "power") / (eff(act, "power") + eff(def, "chin"))) * 0.62,
                0.04, 0.55
              ));
              const hurt = def.health < TUNING.tkoHealthThreshold || flush;
              const finishChance = clamp(
                TUNING.followUpFinishBase *
                (hurt ? 1.0 : 0.55) *
                (eff(act, "aggression") / 70) *
                (1 - eff(def, "composure") / 220),
                0.02, 0.88
              );
              if (rng.chance(finishChance)) {
                const method: FinishMethod = def.health < 12 ? "KO" : "TKO";
                finish = { winner: act.side, method, round, clock: clock + rng.range(2, 9) };
                log(round, finish.clock, act.side, say.finish(act.f, def.f, method, rng), "major");
              } else {
                log(round, clock, def.side, say.survives(def.f, rng), "notable");
                drain(def, 9);
              }
              break;
            }

            // Accumulated-damage TKO (corner/ref stoppage without a clean KD)
            if (def.health <= 4 && rng.chance(0.45)) {
              finish = { winner: act.side, method: "TKO", round, clock };
              log(round, clock, act.side, say.accumulationStoppage(act.f, def.f), "major");
              break;
            }
          }
          duration = rng.range(5, 14);
          break;
        }

        case "TAKEDOWN": {
          act.stats[r].takedownsAttempted++;
          drain(act, TUNING.staminaTakedown);
          drain(def, TUNING.staminaGrappleDefend);
          const p = clamp(0.30 + (eff(act, "takedowns") - eff(def, "takedownDef")) / 190, 0.06, 0.88);
          if (rng.chance(p)) {
            act.stats[r].takedowns++;
            position = act.side === "A" ? "GROUND_A_TOP" : "GROUND_B_TOP";
            log(round, clock, act.side, say.takedown(act.f, def.f, rng), "notable");
          } else {
            log(round, clock, def.side, say.takedownStuffed(act.f, def.f), "minor");
          }
          duration = rng.range(8, 20);
          break;
        }

        case "GROUND_STRIKE": {
          const landed = rng.int(2, 7);
          act.stats[r].sigStrikesAttempted += landed + rng.int(0, 4);
          act.stats[r].sigStrikes += landed;
          act.stats[r].controlSec += Math.round(duration);
          drain(act, 2.5);
          const dmg = landed * (0.40 + eff(act, "power") / 150) * (1.8 - eff(def, "durability") / 100) * 0.60 * ruleset.damageMult;
          def.health -= dmg;
          act.stats[r].damageDealt += dmg;
          log(round, clock, act.side, say.groundStrikes(act.f, def.f, landed), "minor");
          if (def.health <= 6 && rng.chance(0.55)) {
            finish = { winner: act.side, method: "TKO", round, clock };
            log(round, clock, act.side, say.groundAndPoundStoppage(act.f, def.f), "major");
          }
          duration = rng.range(10, 25);
          break;
        }

        case "SUBMISSION": {
          act.stats[r].subAttempts++;
          drain(act, 5);
          drain(def, 7);
          const p = clamp(
            TUNING.subBase +
            (eff(act, "submissions") - eff(def, "subDefense")) / 420 +
            (def.stamina < 35 ? 0.06 : 0),
            0.01, 0.42
          );
          const subName = say.pickSubmission(rng);
          log(round, clock, act.side, say.subAttempt(act.f, def.f, subName), "notable");
          if (rng.chance(p)) {
            finish = { winner: act.side, method: "SUBMISSION", round, clock: clock + rng.range(3, 12) };
            log(round, finish.clock, act.side, say.subFinish(act.f, def.f, subName), "major");
          } else {
            log(round, clock + rng.range(4, 14), def.side, say.subEscape(def.f, subName), "minor");
          }
          duration = rng.range(12, 30);
          break;
        }

        case "GETUP": {
          drain(act, 4);
          const p = clamp(0.32 + (eff(act, "scrambling") - eff(def, "topControl")) / 160, 0.08, 0.85);
          if (rng.chance(p)) {
            position = "STANDING";
            log(round, clock, act.side, say.getUp(act.f), "minor");
          } else {
            def.stats[r].controlSec += Math.round(duration);
            log(round, clock, def.side, say.heldDown(def.f, act.f), "minor");
          }
          duration = rng.range(8, 18);
          break;
        }

        case "CLINCH": {
          position = "CLINCH";
          drain(act, 2);
          act.stats[r].controlSec += Math.round(duration * 0.6);
          log(round, clock, act.side, say.clinch(act.f, def.f), "minor");
          duration = rng.range(10, 22);
          break;
        }

        case "BREAK": {
          position = "STANDING";
          log(round, clock, null, say.separate(), "minor");
          duration = rng.range(3, 8);
          break;
        }

        case "CIRCLE":
        default: {
          const grounded = position === "GROUND_A_TOP" || position === "GROUND_B_TOP";
          log(round, clock, act.side,
            grounded ? say.groundStall(act.f, def.f, rng) : say.feeling(act.f, def.f, rng), "minor");
          act.stamina = Math.min(100, act.stamina + 1.5);
          duration = rng.range(6, 16);
          break;
        }
      }

      clock += duration;
    }

    if (!finish) {
      // Between-round recovery, scaled by cardio.
      for (const s of [A, B]) {
        s.stamina = Math.min(100, s.stamina + 14 + s.f.attributes.cardio * 0.16);
        // fewer, longer rounds recover less per break; many short rounds recover more
        s.health = Math.min(100, s.health + 7 + s.f.attributes.durability * 0.06);
      }
      log(round, ruleset.roundLengthSec, null, say.roundEnd(round), "notable");
    }
  }

  // ---- Result ----
  let result: FightResult;
  if (finish) {
    result = {
      winner: finish.winner,
      method: finish.method,
      endRound: finish.round,
      endClock: Math.round(finish.clock),
      statsA: A.stats, statsB: B.stats, pbp,
      fightRating: rateFight(A, B, finish.round, true, rng),
      injuriesA, injuriesB,
    };
  } else {
    const cards = scoreFight(A, B, ruleset, rng);
    const aWins = cards.filter(c => c.a > c.b).length;
    const bWins = cards.filter(c => c.b > c.a).length;
    let method: FinishMethod;
    let winner: "A" | "B" | null;
    if (aWins >= 2 || bWins >= 2) {
      winner = aWins > bWins ? "A" : "B";
      const wins = Math.max(aWins, bWins);
      const draws = cards.filter(c => c.a === c.b).length;
      method = wins === 3 ? "DECISION_UNANIMOUS" : draws > 0 ? "DECISION_MAJORITY" : "DECISION_SPLIT";
    } else {
      winner = null;
      method = "DRAW";
    }
    pbp.push({
      round: ruleset.rounds, clock: ruleset.roundLengthSec, actor: null,
      text: say.decision(fighterA, fighterB, winner, method, cards), weight: "major",
    });
    result = {
      winner, method,
      endRound: ruleset.rounds, endClock: ruleset.roundLengthSec,
      scorecards: cards, statsA: A.stats, statsB: B.stats, pbp,
      fightRating: rateFight(A, B, ruleset.rounds, false, rng),
      injuriesA, injuriesB,
    };
  }

  // Injuries scale with damage taken.
  applyInjuries(A, injuriesA, rng);
  applyInjuries(B, injuriesB, rng);
  return result;
}

// ---------------------------------------------------------------------------

type Action = "STRIKE" | "TAKEDOWN" | "GROUND_STRIKE" | "SUBMISSION" | "GETUP" | "CLINCH" | "BREAK" | "CIRCLE";

function chooseAction(act: FState, def: FState, pos: Position, rs: Ruleset, rng: Rng): Action {
  const a = act.f.attributes;
  const grapplingAllowed = rs.allowGrappling;
  const onTop = (pos === "GROUND_A_TOP" && act.side === "A") || (pos === "GROUND_B_TOP" && act.side === "B");
  const onGround = pos === "GROUND_A_TOP" || pos === "GROUND_B_TOP";

  // Hurt fighters with low composure tend to either swing or retreat.
  const desperation = act.health < 35 ? 1.5 : 1.0;

  if (onGround && grapplingAllowed) {
    if (onTop) {
      return rng.weighted<Action>([
        ["GROUND_STRIKE", rs.allowGroundStrikes ? 45 + a.power * 0.25 : 5],
        ["SUBMISSION", 3 + a.submissions * 0.07],
        ["CIRCLE", 12],
      ]);
    }
    return rng.weighted<Action>([
      ["GETUP", 40 + a.scrambling * 0.5],
      ["SUBMISSION", 2 + a.submissions * 0.05],
      ["CIRCLE", 10],
    ]);
  }

  if (pos === "CLINCH") {
    return rng.weighted<Action>([
      ["STRIKE", 28 + a.striking * 0.2],
      ["TAKEDOWN", grapplingAllowed ? 30 + a.takedowns * 0.4 : 0],
      ["BREAK", 22 + (100 - a.strength) * 0.15],
    ]);
  }

  // Standing
  return rng.weighted<Action>([
    ["STRIKE", (30 + a.striking * 0.35 + a.aggression * 0.30) * desperation],
    ["TAKEDOWN", grapplingAllowed ? 8 + a.takedowns * 0.42 : 0],
    ["CLINCH", grapplingAllowed ? 6 + a.strength * 0.14 : 5 + a.strength * 0.05],
    ["CIRCLE", 22 + (100 - a.aggression) * 0.28],
  ]);
}

function scoreFight(A: FState, B: FState, rs: Ruleset, rng: Rng) {
  const judges = ["J. Cardinal", "S. Bell", "D. Tirelli"];
  return judges.map((judge) => {
    // Each judge has a CONSISTENT style for the whole fight — one favours
    // volume, one favours damage, one favours control. That persistent bias
    // is what produces realistic split decisions in close fights, instead of
    // a fudge factor bolted on at the end.
    const strikeW = rng.range(0.65, 1.35);
    const ctrlW = rng.range(0.01, 0.14);
    const dmgW = rng.range(0.30, 1.30);

    let a = 0, b = 0;
    for (let r = 0; r < A.stats.length; r++) {
      const sa = A.stats[r], sb = B.stats[r];
      const scoreA = sa.sigStrikes * strikeW + sa.damageDealt * dmgW + sa.controlSec * ctrlW + sa.knockdowns * 11 + sa.subAttempts * 2.5 + sa.takedowns * 3;
      const scoreB = sb.sigStrikes * strikeW + sb.damageDealt * dmgW + sb.controlSec * ctrlW + sb.knockdowns * 11 + sb.subAttempts * 2.5 + sb.takedowns * 3;
      // Per-round perception noise: judges genuinely see close rounds differently.
      const margin = (scoreA - scoreB) + rng.normal(0, 9);
      // 10-10 rounds are vanishingly rare in reality — keep the band tiny.
      if (Math.abs(margin) < 0.1) { a += 10; b += 10; }
      else if (margin > 0) { a += 10; b += (sa.knockdowns > 1 || margin > 45) ? 8 : 9; }
      else { b += 10; a += (sb.knockdowns > 1 || -margin > 45) ? 8 : 9; }
    }
    if (a === b) {
      const dmgA = A.stats.reduce((n, x) => n + x.damageDealt, 0);
      const dmgB = B.stats.reduce((n, x) => n + x.damageDealt, 0);
      if (dmgA > dmgB) a += 1; else if (dmgB > dmgA) b += 1;
    }
    return { judge, a, b };
  });
}

function rateFight(A: FState, B: FState, rounds: number, finished: boolean, rng: Rng): number {
  const total = (s: FState, k: keyof RoundStats) => s.stats.reduce((n, x) => n + (x[k] as number), 0);
  const action = total(A, "sigStrikes") + total(B, "sigStrikes");
  const kds = total(A, "knockdowns") + total(B, "knockdowns");
  const subs = total(A, "subAttempts") + total(B, "subAttempts");
  const competitive = 1 - Math.abs(total(A, "damageDealt") - total(B, "damageDealt")) / Math.max(1, total(A, "damageDealt") + total(B, "damageDealt"));
  const raw =
    28 +
    Math.min(30, action / (rounds * 1.6)) +
    kds * 7 +
    subs * 3 +
    competitive * 18 +
    (finished ? 8 : 0);
  return Math.round(clamp(raw + rng.normal(0, 4), 1, 100));
}

function applyInjuries(s: FState, out: Injury[], rng: Rng) {
  const damageTaken = 100 - s.health;
  if (damageTaken > 55 && rng.chance(0.35)) {
    out.push({ type: rng.pick(["Concussion", "Orbital fracture", "Broken nose", "Rib injury"]), severity: rng.int(4, 8), daysRemaining: rng.int(30, 120) });
  }
  if (s.cuts > 0 && rng.chance(0.4)) {
    out.push({ type: "Laceration", severity: rng.int(1, 4), daysRemaining: rng.int(14, 42) });
  }
  if (rng.chance(0.06)) {
    out.push({ type: rng.pick(["Hand fracture", "Knee sprain", "Shoulder strain"]), severity: rng.int(3, 9), daysRemaining: rng.int(45, 210) });
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
