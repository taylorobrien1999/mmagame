/**
 * Negotiation calibration harness.
 *
 * Run: npx tsx src/sim/negotiation-harness.ts
 *
 * Same philosophy as the fight harness: you can't unit-test whether one
 * negotiation was "right", so you test the distributions.
 *
 * What we assert:
 *  - A fair offer is mostly accepted; a lowball is mostly refused or insulting
 *  - Money-fighter quirks respond to money more than company men do
 *  - Weight mismatches produce refusals scaling with the gap
 *  - Personality axes don't collapse to the mean (a real spread exists)
 */

import { Rng } from "./rng";
import { buildFighter, type RawFighterStats } from "./derive";
import { generatePersonality, QUIRKS, type Personality } from "./personality";
import {
  evaluateContractOffer, evaluateBoutOffer, marketValue,
  type ContractOffer, type PromotionContext,
} from "./negotiation";
import type { Fighter } from "./types";

function fighter(name: string, tier: number, pop: number, rng: Rng): Fighter {
  const raw: RawFighterStats = {
    name, wins: Math.round(8 + tier * 20), losses: Math.round(8 - tier * 5), draws: 0,
    slpm: 1.6 + tier * 3.6, strAcc: 0.33 + tier * 0.21, sapm: 4.6 - tier * 2.2,
    strDef: 0.42 + tier * 0.22, tdAvg: tier * 3.2, tdAcc: 0.15 + tier * 0.42,
    tdDef: 0.35 + tier * 0.5, subAvg: tier * 1.6,
    winsByKo: Math.round((8 + tier * 20) * 0.34), winsBySub: Math.round((8 + tier * 20) * 0.2),
    lossesByKo: 2, lossesBySub: 1, stance: "Orthodox", weightClass: "Lightweight",
    nationality: "USA", dob: "1996-04-02",
  };
  const f = buildFighter(raw, rng, name.toLowerCase().replace(/\s/g, "-"));
  f.popularity = pop;
  return f;
}

const promo = (prestige: number, rep = 70): PromotionContext => ({
  id: "p1", name: "Apex Fighting", prestige, eventsPerYear: 12,
  country: "USA", reputation: rep, hasTitleInDivision: true,
});

function offerAt(mult: number, f: Fighter, p: Personality): ContractOffer {
  const v = marketValue(f, p);
  return {
    fightsTotal: 3, showMoney: Math.round(v * mult * 0.7), winBonus: Math.round(v * mult * 0.4),
    ppvPointsBps: 0, signingBonus: 0,
    championsClause: false, matchingRights: false, exclusive: true,
  };
}

// --- 1. Offer generosity vs acceptance -------------------------------------
console.log("\n=== Contract acceptance by offer size (n=3000 each) ===");
console.log("  offer/value   ACCEPT  COUNTER  REJECT  INSULTED");
for (const mult of [0.35, 0.6, 0.85, 1.0, 1.3, 1.8]) {
  const c: Record<string, number> = { ACCEPT: 0, COUNTER: 0, REJECT: 0, INSULTED: 0 };
  for (let i = 0; i < 3000; i++) {
    const rng = new Rng(`neg-${mult}-${i}`);
    const f = fighter("Test Fighter", 0.7, 50, rng);
    const p = generatePersonality(f, rng);
    const r = evaluateContractOffer(f, p, offerAt(mult, f, p), promo(60), rng);
    c[r.verdict]++;
  }
  const pc = (n: number) => `${((n / 3000) * 100).toFixed(0)}%`.padStart(7);
  console.log(`  ${mult.toFixed(2).padStart(9)}   ${pc(c.ACCEPT)} ${pc(c.COUNTER)} ${pc(c.REJECT)} ${pc(c.INSULTED)}`);
}

// --- 2. Does personality actually differentiate? ---------------------------
console.log("\n=== Same 0.75x offer, different quirks (n=2000 each) ===");
for (const qid of ["money_fighter", "company_man", "journeyman", "shark_manager", "title_or_nothing"]) {
  let accept = 0, insulted = 0;
  for (let i = 0; i < 2000; i++) {
    const rng = new Rng(`q-${qid}-${i}`);
    const f = fighter("Test Fighter", 0.7, 50, rng);
    const p = generatePersonality(f, rng);
    // Force the quirk under test
    const q = QUIRKS.find(x => x.id === qid)!;
    if (!p.quirks.some(x => x.id === qid)) {
      p.quirks.push(q);
      for (const [k, v] of Object.entries(q.mods)) (p.axes as any)[k] = Math.max(1, Math.min(99, (p.axes as any)[k] + v));
      for (const h of q.hooks ?? []) p.hooks.add(h);
    }
    const r = evaluateContractOffer(f, p, offerAt(0.75, f, p), promo(60), rng);
    if (r.verdict === "ACCEPT") accept++;
    if (r.verdict === "INSULTED") insulted++;
  }
  console.log(`  ${QUIRKS.find(x => x.id === qid)!.name.padEnd(20)} accept ${((accept / 2000) * 100).toFixed(0)}%   insulted ${((insulted / 2000) * 100).toFixed(0)}%`);
}

// --- 3. Weight mismatch: the mechanic that must feel right -----------------
console.log("\n=== Bout acceptance by weight gap (fair purse, n=2000 each) ===");
for (const gap of [0, 3, 5, 10, 15, 25]) {
  let accept = 0, posted = 0, moraleSum = 0;
  for (let i = 0; i < 2000; i++) {
    const rng = new Rng(`w-${gap}-${i}`);
    const f = fighter("Test Fighter", 0.7, 50, rng);
    const opp = fighter("The Opponent", 0.7, 50, rng);
    const p = generatePersonality(f, rng);
    const r = evaluateBoutOffer(f, p, {
      opponent: opp, boutWeightLbs: 155 + gap, naturalWeightLbs: 155,
      daysNotice: 60, cardPosition: 3, cardSize: 10, titleBout: false,
      purse: marketValue(f, p), sameGym: false, homeCountry: true,
    }, promo(60), rng);
    if (r.accepted) accept++;
    if (r.socialPost) posted++;
    moraleSum += r.moraleDelta;
  }
  console.log(`  +${String(gap).padStart(2)} lbs   accept ${((accept / 2000) * 100).toFixed(0)}%   avg morale ${(moraleSum / 2000).toFixed(1)}   went public ${((posted / 2000) * 100).toFixed(1)}%`);
}

// --- 4. Short notice --------------------------------------------------------
console.log("\n=== Bout acceptance by notice (n=2000 each) ===");
for (const days of [3, 7, 14, 21, 60]) {
  let accept = 0;
  for (let i = 0; i < 2000; i++) {
    const rng = new Rng(`n-${days}-${i}`);
    const f = fighter("Test Fighter", 0.7, 50, rng);
    const opp = fighter("The Opponent", 0.7, 50, rng);
    const p = generatePersonality(f, rng);
    const r = evaluateBoutOffer(f, p, {
      opponent: opp, boutWeightLbs: 155, naturalWeightLbs: 155,
      daysNotice: days, cardPosition: 3, cardSize: 10, titleBout: false,
      purse: marketValue(f, p), sameGym: false, homeCountry: true,
    }, promo(60), rng);
    if (r.accepted) accept++;
  }
  console.log(`  ${String(days).padStart(2)} days   accept ${((accept / 2000) * 100).toFixed(0)}%`);
}

// --- 5. Market value sanity -------------------------------------------------
// NOTE: set overall EXPLICITLY here. Deriving it from a "tier" produced
// overall 69 for a supposed regional prospect, which made this table lie.
console.log("\n=== Market value by overall/popularity (USD per fight) ===");
for (const [label, ovr, pop, real] of [
  ["Amateur / debut", 42, 4, "~$1k"],
  ["Regional prospect", 52, 10, "~$3k"],
  ["Regional main eventer", 60, 20, "~$10k"],
  ["UFC newcomer", 68, 30, "~$25k"],
  ["UFC mid-card", 74, 45, "~$80k"],
  ["Ranked contender", 82, 62, "~$250k"],
  ["Champion", 88, 80, "~$600k"],
  ["PPV superstar", 91, 96, "$1M+"],
] as const) {
  const vals: number[] = [];
  for (let i = 0; i < 400; i++) {
    const r2 = new Rng(`mv-${label}-${i}`);
    const f = fighter("X", 0.7, pop, r2);
    f.overall = ovr;
    vals.push(marketValue(f, generatePersonality(f, r2)));
  }
  vals.sort((a, b) => a - b);
  console.log(`  ${label.padEnd(23)} median $${vals[200].toLocaleString().padStart(10)}   (real ${real})`);
}

// --- 6. Axis spread: personality must not collapse to the mean -------------
console.log("\n=== Personality axis spread (n=4000) ===");
const axisVals: Record<string, number[]> = {};
for (let i = 0; i < 4000; i++) {
  const rng = new Rng(`ax-${i}`);
  const f = fighter("X", 0.7, 50, rng);
  const p = generatePersonality(f, rng);
  for (const [k, v] of Object.entries(p.axes)) (axisVals[k] ??= []).push(v);
}
for (const k of ["greed", "loyalty", "ego", "riskTolerance", "weightDiscipline"]) {
  const v = axisVals[k].slice().sort((a, b) => a - b);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
  const ok = sd > 14;
  console.log(`  ${k.padEnd(18)} mean ${mean.toFixed(1)}  sd ${sd.toFixed(1)}  p10 ${v[400]}  p90 ${v[3600]}  ${ok ? "PASS" : "FAIL — too narrow"}`);
}
