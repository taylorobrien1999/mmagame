/**
 * Play-by-play text generation.
 *
 * This file is where the game's *personality* lives. It's deliberately simple
 * template selection so you can add 500 more lines without touching the engine.
 * Expand it aggressively — variety here is what makes watching an event fun
 * on the 30th playthrough.
 */

import type { Rng } from "./rng";
import type { Fighter, FinishMethod, Ruleset } from "./types";

const last = (f: Fighter) => f.name.split(" ").slice(-1)[0];

const STRIKES = [
  "a stiff jab", "a straight right", "a left hook", "an overhand right",
  "a low kick", "a body kick", "a head kick", "a check hook",
  "a knee up the middle", "a spinning back fist", "a lead uppercut", "a jabbing cross",
];

const SUBS = [
  "rear-naked choke", "guillotine", "armbar", "triangle choke", "kimura",
  "heel hook", "D'Arce choke", "anaconda choke", "arm-triangle", "americana",
];

export const say = {
  roundStart: (round: number, rs: Ruleset) =>
    `— Round ${round} of ${rs.rounds} — ${Math.round(rs.roundLengthSec / 60)} minute${rs.roundLengthSec >= 120 ? "s" : ""} —`,

  roundEnd: (round: number) => `The horn sounds to end round ${round}.`,

  feeling: (a: Fighter, b: Fighter, rng: Rng) =>
    rng.pick([
      `${last(a)} circles on the outside, measuring distance.`,
      `${last(a)} feints and resets. ${last(b)} isn't biting.`,
      `Both men reset in the centre of the cage.`,
      `${last(a)} switches stance, looking for an angle.`,
      `${last(a)} paws with the jab, hunting a read on ${last(b)}.`,
    ]),

  miss: (a: Fighter, b: Fighter, rng: Rng) =>
    rng.pick([
      `${last(a)} swings and ${last(b)} slips it clean.`,
      `${last(a)} comes up short with ${rng.pick(STRIKES)}.`,
      `${last(b)} rolls under and steps off at an angle.`,
      `${last(a)} loads up and misses badly.`,
    ]),

  land: (a: Fighter, b: Fighter, rng: Rng) =>
    `${last(a)} lands ${rng.pick(STRIKES)} on ${last(b)}.`,

  knockdown: (a: Fighter, b: Fighter, rng: Rng) =>
    rng.pick([
      `DOWN GOES ${last(b).toUpperCase()}! ${last(a)} drops him with ${rng.pick(STRIKES)}!`,
      `${last(b)} is hurt badly — his legs go and he hits the canvas!`,
      `KNOCKDOWN! ${last(a)} times it perfectly and ${last(b)} crumples!`,
    ]),

  survives: (b: Fighter, rng: Rng) =>
    rng.pick([
      `${last(b)} scrambles back to his feet, still wobbly.`,
      `${last(b)} survives the storm and ties him up!`,
      `${last(b)} covers up and somehow weathers it.`,
      `${last(b)} is back up — the crowd is on its feet.`,
    ]),

  finish: (a: Fighter, b: Fighter, method: FinishMethod, rng: Rng) =>
    method === "KO"
      ? rng.pick([
          `IT'S ALL OVER! ${last(b)} is out cold! ${last(a)} has knocked him unconscious!`,
          `KNOCKOUT! ${last(b)} is flat on his back and the referee waves it off instantly!`,
        ])
      : rng.pick([
          `The referee has seen enough! TKO victory for ${last(a)}!`,
          `${last(b)} isn't defending himself — the fight is stopped! ${last(a)} wins by TKO!`,
        ]),

  accumulationStoppage: (a: Fighter, b: Fighter) =>
    `${last(b)} is completely spent and eating everything — the referee steps in. ${last(a)} by TKO.`,

  groundAndPoundStoppage: (a: Fighter, b: Fighter) =>
    `${last(a)} is raining down elbows from the top and ${last(b)} has stopped moving — it's waved off!`,

  cut: (a: Fighter, b: Fighter, count: number) =>
    count === 1
      ? `${last(b)} has been opened up above the eye — blood is flowing.`
      : `Another cut on ${last(b)}. That's ${count} now and his face is a mess.`,

  doctorStoppage: (b: Fighter) =>
    `The doctor takes a long look at ${last(b)} and won't let it continue. Doctor's stoppage.`,

  takedown: (a: Fighter, b: Fighter, rng: Rng) =>
    rng.pick([
      `${last(a)} shoots a double leg and puts ${last(b)} on his back!`,
      `${last(a)} times a reactive takedown beautifully.`,
      `Body lock from ${last(a)} — he trips ${last(b)} down to the mat.`,
    ]),

  takedownStuffed: (a: Fighter, b: Fighter) =>
    `${last(a)} shoots but ${last(b)} sprawls and shrugs him off.`,

  groundStrikes: (a: Fighter, b: Fighter, n: number) =>
    n > 4
      ? `${last(a)} is teeing off from the top — ${n} unanswered shots landing on ${last(b)}.`
      : `${last(a)} postures up and lands ${n} short shots.`,

  subAttempt: (a: Fighter, b: Fighter, sub: string) =>
    `${last(a)} is going for the ${sub} — it looks tight!`,

  subFinish: (a: Fighter, b: Fighter, sub: string) =>
    `${last(b)} taps! ${last(a)} wins by ${sub}!`,

  subEscape: (b: Fighter, sub: string) =>
    `${last(b)} works the grip free and escapes the ${sub}.`,

  getUp: (a: Fighter) => `${last(a)} scrambles and pops right back to his feet.`,

  heldDown: (top: Fighter, bottom: Fighter) =>
    `${top.name.split(" ").slice(-1)[0]} keeps the weight on top, smothering ${last(bottom)}.`,

  clinch: (a: Fighter, b: Fighter) =>
    `${last(a)} closes the distance and pins ${last(b)} against the fence.`,

  separate: () => `The referee separates them for inactivity.`,

  groundStall: (top: Fighter, bottom: Fighter, rng: Rng) =>
    rng.pick([
      `${last(top)} works to pass the guard, ${last(bottom)} fighting the hands.`,
      `${last(bottom)} controls the wrists from the bottom, stalling the offence.`,
      `${last(top)} resets his base and looks to advance position.`,
      `The referee warns them both for inactivity on the mat.`,
    ]),

  pickSubmission: (rng: Rng) => rng.pick(SUBS),

  decision: (
    a: Fighter, b: Fighter,
    winner: "A" | "B" | null,
    method: FinishMethod,
    cards: { judge: string; a: number; b: number }[],
  ) => {
    const scores = cards.map(c => `${c.a}-${c.b}`).join(", ");
    if (winner === null) return `We go to the scorecards: ${scores}. It's a draw.`;
    const w = winner === "A" ? a : b;
    const label = method === "DECISION_UNANIMOUS" ? "unanimous decision"
      : method === "DECISION_SPLIT" ? "split decision" : "majority decision";
    return `To the scorecards: ${scores} — ${w.name} wins by ${label}.`;
  },
};
