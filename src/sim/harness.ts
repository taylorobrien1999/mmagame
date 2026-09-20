/**
 * Calibration harness.
 *
 * Run: npx tsx src/sim/harness.ts
 *
 * This is how you "heavily test" a simulation. Individual fights can't be
 * unit-tested for correctness — there's no right answer. What you test is the
 * aggregate distribution against real-world rates. Real UFC benchmarks:
 *
 *   Finish rate          ~48-52%   (roughly half of fights go to a decision)
 *   Of finishes: KO/TKO  ~65%      Submissions ~35%
 *   Split decisions      ~18-22% of all decisions
 *   Round 1 finishes     ~45% of all finishes
 *
 * If your numbers drift from these, adjust TUNING in engine.ts and re-run.
 * Also asserted: a much better fighter should win ~75-80% of the time.
 * If it's 95%+, the sim is too deterministic and the game will be boring.
 * If it's 60%, skill doesn't matter and the game will feel random.
 */

import { Rng } from "./rng";
import { simulateFight } from "./engine";
import { buildFighter, type RawFighterStats } from "./derive";
import { RULESETS, type Fighter } from "./types";

function makeFighter(name: string, tier: "elite" | "good" | "average" | "low", rng: Rng): Fighter {
  const t = { elite: 1.0, good: 0.78, average: 0.55, low: 0.30 }[tier];
  const raw: RawFighterStats = {
    name,
    wins: Math.round(8 + t * 20), losses: Math.round(8 - t * 5), draws: 0,
    slpm: 1.6 + t * 3.6, strAcc: 0.33 + t * 0.21, sapm: 4.6 - t * 2.2,
    strDef: 0.42 + t * 0.22, tdAvg: t * 3.2, tdAcc: 0.15 + t * 0.42,
    tdDef: 0.35 + t * 0.50, subAvg: t * 1.6,
    winsByKo: Math.round((8 + t * 20) * 0.34), winsBySub: Math.round((8 + t * 20) * 0.20),
    lossesByKo: Math.round((8 - t * 5) * 0.33), lossesBySub: Math.round((8 - t * 5) * 0.20),
    stance: "Orthodox", weightClass: "Lightweight",
  };
  return buildFighter(raw, rng, name.toLowerCase().replace(/\s/g, "-"));
}

function run(n: number, tierA: any, tierB: any, rulesetKey: keyof typeof RULESETS) {
  const seedRng = new Rng("harness-v1");
  const a = makeFighter("Alex Vanguard", tierA, seedRng);
  const b = makeFighter("Bruno Castellan", tierB, seedRng);
  const rs = RULESETS[rulesetKey];

  const counts: Record<string, number> = {};
  let aWins = 0, finishes = 0, r1Finishes = 0, ratingSum = 0;

  for (let i = 0; i < n; i++) {
    const r = simulateFight(a, b, rs, `fight-${rulesetKey}-${i}`);
    counts[r.method] = (counts[r.method] ?? 0) + 1;
    if (r.winner === "A") aWins++;
    const isFinish = !r.method.startsWith("DECISION") && r.method !== "DRAW";
    if (isFinish) { finishes++; if (r.endRound === 1) r1Finishes++; }
    ratingSum += r.fightRating;
  }

  const pct = (x: number, d = n) => `${((x / d) * 100).toFixed(1)}%`;
  const decisions = n - finishes - (counts["DRAW"] ?? 0);
  console.log(`\n=== ${rulesetKey} | ${tierA} vs ${tierB} | n=${n} ===`);
  console.log(`  A win rate:        ${pct(aWins)}`);
  console.log(`  Finish rate:       ${pct(finishes)}   [target ~48-52% for MMA]`);
  console.log(`  KO/TKO of finishes:${finishes ? pct((counts["KO"] ?? 0) + (counts["TKO"] ?? 0) + (counts["TKO_DOCTOR"] ?? 0), finishes) : "n/a"}  [target ~65%]`);
  console.log(`  Subs of finishes:  ${finishes ? pct(counts["SUBMISSION"] ?? 0, finishes) : "n/a"}  [target ~35%]`);
  console.log(`  R1 of finishes:    ${finishes ? pct(r1Finishes, finishes) : "n/a"}  [target ~45%]`);
  console.log(`  Splits of decs:    ${decisions ? pct(counts["DECISION_SPLIT"] ?? 0, decisions) : "n/a"}  [target ~18-22%]`);
  console.log(`  Avg fight rating:  ${(ratingSum / n).toFixed(1)}`);
  console.log(`  Methods:`, counts);
}

/** Mirror test: the SAME fighter on both sides must win ~50%. Any deviation
 *  is engine bias (e.g. initiative ties always favouring side A). */
function symmetryCheck() {
  const rng = new Rng("sym");
  const f = makeFighter("Mirror Man", "good", rng);
  let aWins = 0, n = 4000;
  for (let i = 0; i < n; i++) {
    const r = simulateFight(f, f, RULESETS.MMA_3, `sym-${i}`);
    if (r.winner === "A") aWins++;
  }
  const rate = (aWins / n) * 100;
  const ok = Math.abs(rate - 50) < 2.5;
  console.log(`Symmetry (identical fighters -> ~50%): ${rate.toFixed(1)}%  ${ok ? "PASS" : "FAIL — engine bias"}`);
}

// --- Determinism check: the single most important invariant ---
function determinismCheck() {
  const rng = new Rng("det");
  const a = makeFighter("Determinism A", "good", rng);
  const b = makeFighter("Determinism B", "good", rng);
  const r1 = simulateFight(a, b, RULESETS.MMA_3, "same-seed");
  const r2 = simulateFight(a, b, RULESETS.MMA_3, "same-seed");
  const same = JSON.stringify(r1) === JSON.stringify(r2);
  console.log(`\nDeterminism (same seed -> identical result): ${same ? "PASS" : "FAIL"}`);
  const r3 = simulateFight(a, b, RULESETS.MMA_3, "other-seed");
  const differs = JSON.stringify(r1) !== JSON.stringify(r3);
  console.log(`Seed sensitivity (different seed -> different result): ${differs ? "PASS" : "FAIL"}`);
  if (!same) throw new Error("Determinism broken — the whole multiplayer model depends on this.");
}

determinismCheck();
symmetryCheck();
run(4000, "good", "good", "MMA_3");
run(4000, "elite", "good", "MMA_3");      // target A ~68-74%
run(4000, "elite", "average", "MMA_3");   // big gap, ~88-93% is realistic
run(2000, "good", "good", "MMA_5");
run(2000, "good", "good", "BKFC_5");
run(2000, "good", "good", "BOXING_12");

// Sample play-by-play so you can eyeball whether it reads like a fight.
const rng = new Rng("sample");
const a = makeFighter("Alex Vanguard", "good", rng);
const b = makeFighter("Bruno Castellan", "good", rng);
const demo = simulateFight(a, b, RULESETS.MMA_3, "demo-seed-42");
console.log(`\n\n===== SAMPLE FIGHT: ${a.name} (${a.overall} OVR) vs ${b.name} (${b.overall} OVR) =====`);
for (const line of demo.pbp) {
  const mm = String(Math.floor(line.clock / 60)).padStart(1, "0");
  const ss = String(line.clock % 60).padStart(2, "0");
  const tag = line.weight === "major" ? " ***" : "";
  console.log(`  R${line.round} ${mm}:${ss}  ${line.text}${tag}`);
}
console.log(`\n  Fight rating: ${demo.fightRating}/100`);
