/**
 * Negotiation: contracts and individual bout offers.
 *
 * Two separate systems that share a personality model:
 *
 *   evaluateContractOffer()  — "will you sign with my promotion?"
 *   evaluateBoutOffer()      — "will you take this specific fight?"
 *
 * A fighter under contract can still refuse a bout. That separation is what
 * makes the matchmaking game interesting: signing someone is not the same as
 * being able to book them.
 *
 * Every rejection returns structured REASONS, not just a no. The UI shows
 * those reasons, which is how the player learns the system instead of
 * brute-forcing offers.
 */

import { Rng } from "./rng";
import type { Fighter } from "./types";
import type { Personality, Hook } from "./personality";

// ---------------------------------------------------------------- types ---

export interface ContractOffer {
  fightsTotal: number;
  showMoney: number;
  winBonus: number;
  /** Basis points of PPV revenue. 100 bps = 1%. */
  ppvPointsBps: number;
  signingBonus: number;
  championsClause: boolean;
  matchingRights: boolean;
  exclusive: boolean;
}

export interface PromotionContext {
  id: string;
  name: string;
  /** 0-100. The single biggest non-money factor. */
  prestige: number;
  /** Events per year — drives whether an active fighter will be kept busy. */
  eventsPerYear: number;
  country: string;
  /** 0-100. Damaged by mistreating fighters; recovered slowly. */
  reputation: number;
  /** Does this promotion have a title in the fighter's division? */
  hasTitleInDivision: boolean;
}

export interface BoutOffer {
  opponent: Fighter;
  /** Contracted weight in lbs for the bout. */
  boutWeightLbs: number;
  /** The fighter's natural division limit in lbs. */
  naturalWeightLbs: number;
  /** Days between offer and fight. <21 is short notice. */
  daysNotice: number;
  /** 1 = main event. */
  cardPosition: number;
  cardSize: number;
  titleBout: boolean;
  purse: number;
  /** Same gym as the fighter? */
  sameGym: boolean;
  /** Is the event in the fighter's home country? */
  homeCountry: boolean;
}

export type Verdict = "ACCEPT" | "COUNTER" | "REJECT" | "INSULTED";

export interface NegotiationResult {
  verdict: Verdict;
  /** Present when COUNTER: what they'd actually sign. */
  counter?: ContractOffer;
  /** Human-readable, shown in the UI. This is how the player learns. */
  reasons: string[];
  /** -100..+100 change to the fighter's opinion of this promotion. */
  relationshipDelta: number;
  /** Set when the fighter goes public. Feeds the news system. */
  socialPost?: string;
  /** Internal score, exposed for the calibration harness. */
  score: number;
}

// ------------------------------------------------------------ valuation ---

/**
 * What this fighter believes they are worth, per fight, in USD.
 *
 * Real MMA pay is wildly non-linear: a regional main-eventer makes $5k, a UFC
 * mid-carder $50k, a PPV headliner $500k+ before points. The curve below is
 * exponential in overall and popularity and then modified by personality.
 */
export function marketValue(f: Fighter, p: Personality): number {
  const skill = Math.pow(Math.max(0, Math.min(55, f.overall - 35)) / 55, 4.0);
  const fame = Math.pow(Math.max(0, f.popularity - 5) / 95, 3.0);
  // Popularity matters MORE than skill for pay. This is true to life and it's
  // what makes signing a mediocre draw a real strategic decision.
  // Steep exponents on purpose: regional fighters must make regional money,
  // or the whole promotion-building economy collapses at the bottom.
  const base = 800 + skill * 140_000 + fame * 700_000;

  const greedMult = 0.78 + (p.axes.greed / 100) * 0.50;
  const savvyMult = 0.86 + (p.axes.agentSavvy / 100) * 0.34;
  return Math.round(base * greedMult * savvyMult);
}

// --------------------------------------------------- contract evaluation ---

export function evaluateContractOffer(
  f: Fighter,
  p: Personality,
  offer: ContractOffer,
  promo: PromotionContext,
  rng: Rng,
  /** -100..100 existing opinion of this promotion. */
  relationship = 0,
): NegotiationResult {
  const reasons: string[] = [];
  const ask = marketValue(f, p);
  const has = (h: Hook) => p.hooks.has(h);

  // ---- Money ----
  // Effective per-fight value including amortised signing bonus and PPV upside.
  const ppvExpectation = (offer.ppvPointsBps / 10000) * expectedPpvRevenue(f, promo);
  const perFight = offer.showMoney + offer.winBonus * 0.55 + ppvExpectation
    + offer.signingBonus / Math.max(1, offer.fightsTotal);
  const moneyRatio = perFight / ask;

  // Diminishing returns above ask; steep cliff below it.
  let score = moneyRatio >= 1
    ? 55 + Math.min(30, (moneyRatio - 1) * 45)
    : 55 - Math.pow(1 - moneyRatio, 1.20) * 78;

  const moneyWeight = 0.55 + (p.axes.greed / 100) * 0.45;
  score = 50 + (score - 50) * moneyWeight * 1.05;

  if (moneyRatio < 0.55) reasons.push(`The money is nowhere near his value (asking ~$${ask.toLocaleString()}/fight).`);
  else if (moneyRatio < 0.85) reasons.push(`He thinks he's worth more than $${Math.round(perFight).toLocaleString()} a fight.`);
  else if (moneyRatio > 1.25) reasons.push(`The money is well above his market value.`);

  // ---- Prestige & ambition ----
  const prestigeFit = (promo.prestige - 35) * (p.axes.ambition / 100) * 0.62;
  score += prestigeFit;
  if (promo.prestige < 25 && p.axes.ambition > 65) {
    reasons.push(`He's ambitious and doesn't see a path to anything here.`);
  }

  // ---- Activity ----
  const wantedFights = 1.4 + (p.axes.activityDesire / 100) * 2.6;
  const likelyFights = Math.min(wantedFights, promo.eventsPerYear * 0.55);
  if (likelyFights < wantedFights * 0.7) {
    score -= (p.axes.activityDesire / 100) * 18;
    reasons.push(`He wants to fight ${wantedFights.toFixed(1)}x a year; you can't keep him that busy.`);
  }

  // ---- Title path ----
  if (promo.hasTitleInDivision) score += (p.axes.legacyFocus / 100) * 12;
  else if (has("DEMANDS_TITLE_SHOT")) {
    score -= 25;
    reasons.push(`There's no title in his division for him to chase.`);
  }

  // ---- Loyalty / relationship ----
    score += relationship * (p.axes.loyalty / 100) * 0.50;
  // A loyal fighter values a stable home even with no history here yet.
  // Without this, loyalty only ever mattered on re-signings.
  score += ((p.axes.loyalty - 50) / 100) * (promo.reputation / 100) * 18;
  if (relationship < -35) reasons.push(`He hasn't forgotten how he was treated here.`);

  // ---- Reputation ----
  if (promo.reputation < 40) {
    score -= (100 - promo.reputation) * 0.22;
    reasons.push(`Your promotion's reputation with fighters is poor.`);
  }

  // ---- Home region ----
  if (has("WILL_NOT_LEAVE_HOME_REGION") && promo.country !== f.nationality) {
    score -= 30;
    reasons.push(`He doesn't want to fight regularly outside ${f.nationality}.`);
  }
  if (has("TAKES_HOMETOWN_DISCOUNT") && promo.country === f.nationality) score += 14;

  // ---- Deal length preference ----
  if (has("WANTS_LONG_DEAL") && offer.fightsTotal < 4) {
    score -= 12; reasons.push(`He wants security — a longer deal.`);
  }
  if (has("WANTS_SHORT_DEAL") && offer.fightsTotal > 3) {
    score -= 14; reasons.push(`He doesn't want to be locked up for ${offer.fightsTotal} fights.`);
  }

  // ---- Restrictive clauses ----
  if (offer.championsClause) {
    score -= 8 + (p.axes.agentSavvy / 100) * 16;
    reasons.push(`His team objects to the champion's clause.`);
  }
  if (offer.matchingRights) score -= 4 + (p.axes.agentSavvy / 100) * 10;
  if (!offer.exclusive) score += 8;

  // ---- PPV points demand ----
  if (has("DEMANDS_PPV_POINTS") && offer.ppvPointsBps === 0 && f.popularity > 55) {
    score -= 20;
    reasons.push(`A fighter at his level expects a share of the PPV.`);
  }

  // ---- Noise: negotiations are not deterministic in-fiction ----
  score += rng.normal(0, 6) * (0.5 + p.axes.temperament / 150);

  // ---- Verdict ----
  const insultThreshold = 18 + (p.axes.ego / 100) * 22;
  let verdict: Verdict;
  let relationshipDelta = 0;
  let socialPost: string | undefined;

  if (score >= 62) {
    verdict = "ACCEPT";
    relationshipDelta = 6;
  } else if (score < insultThreshold) {
    verdict = "INSULTED";
    relationshipDelta = -(14 + (p.axes.ego / 100) * 26);
    if (p.hooks.has("PUBLIC_COMPLAINER") || p.axes.socialVolatility > 72) {
      if (!p.hooks.has("NEVER_COMPLAINS_PUBLICLY")) {
        socialPost = `${f.name} on ${promo.name}: "They know what I'm worth. That offer was an insult and I'll be taking my career elsewhere."`;
      }
    }
    reasons.unshift(`He's offended by the offer.`);
  } else if (score >= 38) {
    verdict = "COUNTER";
    relationshipDelta = 1;
  } else {
    verdict = "REJECT";
    relationshipDelta = -4;
  }

  const result: NegotiationResult = { verdict, reasons, relationshipDelta, socialPost, score };
  if (verdict === "COUNTER") result.counter = buildCounter(f, p, offer, ask, promo);
  return result;
}

function buildCounter(
  f: Fighter, p: Personality, offer: ContractOffer, ask: number, promo: PromotionContext,
): ContractOffer {
  // Savvy fighters counter close to their real number; unsavvy ones overshoot
  // or undershoot. Holdouts add a premium.
  const savvy = p.axes.agentSavvy / 100;
  const premium = 1.0 + (p.hooks.has("HOLDS_OUT_FOR_MORE") ? 0.18 : 0.06) + (1 - savvy) * 0.15;
  const target = ask * premium;

  const wantsPpv = p.hooks.has("DEMANDS_PPV_POINTS") || (f.popularity > 60 && savvy > 0.6);
  const ppvBps = wantsPpv ? Math.min(500, Math.round(f.popularity * 3.2)) : offer.ppvPointsBps;
  const ppvValue = (ppvBps / 10000) * expectedPpvRevenue(f, promo);

  const show = Math.max(offer.showMoney, Math.round((target - ppvValue) * 0.72 / 1000) * 1000);
  return {
    fightsTotal: p.hooks.has("WANTS_LONG_DEAL") ? Math.max(offer.fightsTotal, 4)
      : p.hooks.has("WANTS_SHORT_DEAL") ? Math.min(offer.fightsTotal, 2)
      : offer.fightsTotal,
    showMoney: show,
    winBonus: Math.round(show * 0.9 / 1000) * 1000,
    ppvPointsBps: ppvBps,
    signingBonus: p.axes.greed > 70 ? Math.round(show * 0.5 / 1000) * 1000 : offer.signingBonus,
    championsClause: false,
    matchingRights: offer.matchingRights && savvy < 0.5,
    exclusive: offer.exclusive,
  };
}

function expectedPpvRevenue(f: Fighter, promo: PromotionContext): number {
  if (promo.prestige < 45) return 0;
  const buys = Math.pow(f.popularity / 100, 2.4) * (promo.prestige / 100) * 900_000;
  return buys * 45;
}

// ------------------------------------------------------- bout evaluation ---

export interface BoutVerdict {
  accepted: boolean;
  reasons: string[];
  /** -100..+100 morale change. Applied whether or not they accept. */
  moraleDelta: number;
  socialPost?: string;
  /** Extra money that would flip a refusal, if any amount would. */
  purseToAccept?: number;
}

export function evaluateBoutOffer(
  f: Fighter,
  p: Personality,
  offer: BoutOffer,
  promo: PromotionContext,
  rng: Rng,
): BoutVerdict {
  const reasons: string[] = [];
  let score = 55;
  let moraleDelta = 0;
  const has = (h: Hook) => p.hooks.has(h);

  // ---- WEIGHT: the mechanic you specifically asked for ----
  const weightGap = offer.boutWeightLbs - offer.naturalWeightLbs;
  if (weightGap > 0) {
    // Moving UP in weight. 5 lbs is a nothing catchweight; 20 lbs is an insult.
    const severity = Math.pow(weightGap / 11.5, 1.6);
    const tolerance = 0.5 + (p.axes.riskTolerance / 100) * 0.7 + (p.axes.professionalism / 100) * 0.4;
    const hit = severity * 26 / tolerance;
    score -= hit;
    moraleDelta -= hit * 0.55;
    if (weightGap >= 4) {
      reasons.push(`You're asking him to fight ${weightGap} lbs above his division.`);
    }
    if (has("REFUSES_CATCHWEIGHT") && weightGap >= 3) {
      score -= 40;
      reasons.push(`He fights at his weight or not at all.`);
    }
  } else if (weightGap < 0) {
    // Cutting BELOW natural weight — punishing, and bad cutters revolt.
    const cut = -weightGap;
    const disc = p.axes.weightDiscipline / 100;
    const hit = Math.pow(cut / 8, 1.5) * 22 * (1.6 - disc);
    score -= hit;
    moraleDelta -= hit * 0.6;
    if (cut >= 4) reasons.push(`That's a ${cut} lb cut below his natural weight.`);
  }

  // ---- Opponent quality vs risk appetite ----
  const gap = offer.opponent.overall - f.overall;
  if (gap > 0) {
    const risk = (p.axes.riskTolerance / 100);
    score -= gap * (1.5 - risk) * 0.9;
    if (gap > 8 && risk < 0.45) reasons.push(`He thinks ${offer.opponent.name} is a bad matchup for him right now.`);
  } else if (gap < -12 && p.axes.ego > 65) {
    score -= 10;
    reasons.push(`He feels ${offer.opponent.name} is beneath him.`);
  }
  if (has("ACCEPTS_ANYONE")) score += 30;

  // ---- Short notice ----
  if (offer.daysNotice < 21) {
    const pen = (21 - offer.daysNotice) * (1.8 - p.axes.professionalism / 100);
    score -= pen;
    reasons.push(`${offer.daysNotice} days' notice is very short.`);
    if (has("REFUSES_SHORT_NOTICE")) { score -= 35; reasons.push(`He doesn't take short-notice fights.`); }
  }

  // ---- Card position vs ego ----
  const positionRatio = 1 - (offer.cardPosition - 1) / Math.max(1, offer.cardSize - 1);
  const expected = (f.popularity / 100) * 0.7 + (f.overall - 55) / 100;
  if (positionRatio < expected - 0.22) {
    const slight = (expected - positionRatio) * (p.axes.ego / 100) * 45;
    score -= slight;
    moraleDelta -= slight * 0.5;
    reasons.push(`He expects to be higher on the card than #${offer.cardPosition}.`);
  }

  // ---- Teammates ----
  if (offer.sameGym && has("GYM_LOYALIST")) {
    score -= 100;
    reasons.push(`He will not fight a teammate under any circumstances.`);
  }

  // ---- Home ----
  if (offer.homeCountry) score += (p.axes.homeAttachment / 100) * 14;
  else if (has("WILL_NOT_LEAVE_HOME_REGION")) { score -= 22; reasons.push(`He doesn't want to travel for this one.`); }

  // ---- Health ----
  if (f.condition.health < 80) {
    const pen = (80 - f.condition.health) * (p.axes.healthCaution / 100) * 0.7;
    score -= pen;
    if (f.condition.health < 60) reasons.push(`He isn't fully recovered.`);
  }

  // ---- Title bout ----
  if (offer.titleBout) score += 18 + (p.axes.legacyFocus / 100) * 22;

  // ---- Purse ----
  const fair = marketValue(f, p);
  const ratio = offer.purse / Math.max(1, fair);
  score += (ratio - 1) * 34 * (0.5 + p.axes.greed / 100);
  if (ratio < 0.7) reasons.push(`The purse is below what he expects for this fight.`);

  score += rng.normal(0, 5);

  const accepted = score >= 50;
  if (!accepted) {
    moraleDelta -= 4;
    // How much money would flip it? Null if the objection isn't about money.
    const deficit = (50 - score) / (34 * (0.5 + p.axes.greed / 100));
    const purseToAccept = deficit < 2.5 ? Math.round(fair * (ratio + deficit) / 500) * 500 : undefined;

    let socialPost: string | undefined;
    if (moraleDelta < -14 && !has("NEVER_COMPLAINS_PUBLICLY") &&
        (has("PUBLIC_COMPLAINER") || p.axes.socialVolatility > 70)) {
      socialPost = weightGap >= 4
        ? `${f.name}: "They want me to fight a ${offer.boutWeightLbs}er on short money. I'm a ${offer.naturalWeightLbs} pounder. Do better."`
        : `${f.name}: "Turned down another fight that made no sense for me. ${promo.name} needs to figure out what they're doing."`;
    }
    return { accepted, reasons, moraleDelta: Math.round(moraleDelta), socialPost, purseToAccept };
  }

  if (offer.titleBout) moraleDelta += 8;
  return { accepted, reasons, moraleDelta: Math.round(moraleDelta) };
}
