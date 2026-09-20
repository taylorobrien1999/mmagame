/**
 * Deterministic seeded PRNG.
 *
 * THIS IS THE MOST IMPORTANT FILE IN THE PROJECT.
 *
 * Every random outcome in the game — fight results, AI bookings, injuries,
 * contract negotiations, crowd draw — MUST come from an Rng instance derived
 * from the world seed. Never call Math.random() anywhere else in the codebase.
 *
 * Why: if the same (worldSeed, eventId) always produces the same result, then
 *   - you and your brother always see an identical world with no syncing
 *   - the "live event" screen is just a paced replay of a precomputed result
 *   - you can run 10,000 headless seasons in CI and assert nothing breaks
 */

/** xoshiro128** — fast, good statistical quality, 128-bit state. */
export class Rng {
  private s: [number, number, number, number];

  constructor(seed: string | number) {
    const h = typeof seed === "number" ? splitmix(seed) : hashString(seed);
    // splitmix64-ish expansion so nearby seeds diverge immediately
    let x = h >>> 0;
    const next = () => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
      return (z ^ (z >>> 15)) >>> 0;
    };
    this.s = [next(), next(), next(), next()];
  }

  /** Raw 32-bit unsigned. */
  private nextU32(): number {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0;
    s[3] = (s[3] ^ s[1]) >>> 0;
    s[1] = (s[1] ^ s[2]) >>> 0;
    s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0;
    s[3] = rotl(s[3], 11);
    return result;
  }

  /** Uniform [0, 1). */
  float(): number {
    return this.nextU32() / 4294967296;
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.float() < p;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.float() * (max - min);
  }

  /** Approximate standard normal via Box-Muller. */
  normal(mean = 0, sd = 1): number {
    const u = Math.max(this.float(), 1e-12);
    const v = this.float();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Pick one element uniformly. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /**
   * Weighted choice. Weights need not sum to 1.
   * This is the workhorse for fighter action selection.
   */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const [, w] of entries) total += Math.max(0, w);
    if (total <= 0) return entries[0][0];
    let roll = this.float() * total;
    for (const [item, w] of entries) {
      roll -= Math.max(0, w);
      if (roll <= 0) return item;
    }
    return entries[entries.length - 1][0];
  }

  /** Fisher-Yates, returns a new array. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /**
   * Derive a child RNG for a sub-simulation.
   * Use this so adding a new random call in one place doesn't shift every
   * downstream result. e.g. rng.derive(`bout:${boutId}`)
   */
  derive(label: string): Rng {
    return new Rng(`${this.nextU32()}:${label}`);
  }
}

function rotl(x: number, k: number): number {
  return (((x << k) | (x >>> (32 - k))) >>> 0);
}

function splitmix(n: number): number {
  let z = (n + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  return (z ^ (z >>> 15)) >>> 0;
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
