import { CITIES, DEALBREAKERS, DESTINATIONS, VIBES } from "../../lib/catalogue";
import type { Preferences } from "../../lib/types";

/** Deterministic PRNG (mulberry32) so failures are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)];
  const some = <T,>(xs: readonly T[], p: number) => xs.filter(() => next() < p);
  const chance = (p: number) => next() < p;
  return { next, int, pick, some, chance };
}

export type R = ReturnType<typeof rng>;

export function randomPrefs(r: R, member: string, slots: string[]): Preferences | undefined {
  if (r.chance(0.08)) return undefined; // never opened the link
  const complete = r.chance(0.8);
  const p: Preferences = {
    room_id: "t", member,
    home_city: complete || r.chance(0.5) ? r.pick(CITIES).id : null,
    budget_max: complete || r.chance(0.5) ? r.int(6, 40) * 1000 : null,
    budget_comfortable: null,
    slots: r.some(slots, r.pick([0.3, 0.6, 0.9])),
    vibes: r.some(VIBES.map((v) => v.id), 0.25).slice(0, 3),
    wont_do: r.some(DEALBREAKERS.map((d) => d.id), 0.15),
    max_travel_hours: r.chance(0.4) ? r.int(3, 16) : null,
    leave_days: r.chance(0.4) ? r.int(0, 3) : null,
    note_private: null,
    parsed_limits: [],
    complete: false,
    updated_at: "2026-09-23T00:00:00Z",
  };
  if (p.budget_max && r.chance(0.6)) p.budget_comfortable = Math.max(1000, p.budget_max - r.int(1, 6) * 1000);
  if (complete && p.slots.length === 0) p.slots = [r.pick(slots)];
  p.complete = !!(p.home_city && p.budget_max && p.slots.length > 0) && complete;
  return p;
}

export const randomDest = (r: R) => r.pick(DESTINATIONS);
