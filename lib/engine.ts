// Deterministic decision engine (PRD §7). Pure functions only: code owns limits, estimates, ranking and fit.
// Nothing in here calls the network or the LLM.
import { CITIES, DESTINATIONS, ESTIMATE_DATE, cityById, destinationById, vibeLabel, type Destination } from "./catalogue";
import type { Correction, Preferences, TripOption } from "./types";
import {
  MONTH_NAMES, addDays, approxK, inr, jaccard, longDate, monthOf, round50, round500, shortDate, weekday,
} from "./util";

// ---------------------------------------------------------------------------------------------- statuses

export type Status = "limit" | "check" | "compromise" | "fits";
export const STATUS_RANK: Record<Status, number> = { fits: 0, compromise: 1, check: 2, limit: 3 };
export const STATUS_LABEL: Record<Status, string> = {
  limit: "Limit not met",
  check: "Needs checking",
  compromise: "Compromise",
  fits: "Fits stated inputs",
};
export const worstOf = (statuses: Status[]): Status =>
  statuses.reduce<Status>((w, s) => (STATUS_RANK[s] > STATUS_RANK[w] ? s : w), "fits");

export type CheckKind = "dates" | "budget" | "travel" | "wontdo" | "leave" | "vibe" | "note";
export type FixAction = "complete_prefs" | "add_dates" | "add_budget" | "add_city" | "correct_estimate" | "check_journey";
export type Reason = { check: CheckKind; level: Exclude<Status, "fits">; text: string; fix?: FixAction };

// ---------------------------------------------------------------------------------------------- dates

/** Start dates inside the window: Saturdays for 2-day trips, Fridays otherwise. Capped at 20. */
export function tripSlots(windowStart: string, windowEnd: string, days: number): string[] {
  const startDay = days === 2 ? 6 : 5;
  const out: string[] = [];
  let d = windowStart;
  while (weekday(d) !== startDay) d = addDays(d, 1);
  while (d <= windowEnd && out.length < 20) {
    out.push(d);
    d = addDays(d, 7);
  }
  return out;
}

/** Weekdays (Mon–Fri) inside [start, start+days-1]. No public-holiday inference. */
export function leaveNeeded(start: string, days: number): number {
  let n = 0;
  for (let i = 0; i < days; i++) {
    const w = weekday(addDays(start, i));
    if (w >= 1 && w <= 5) n++;
  }
  return n;
}

/** "Fri 16 Oct – Sun 18 Oct" */
export const slotLabel = (start: string, days: number) => `${shortDate(start)} – ${shortDate(addDays(start, days - 1))}`;

export const leaveLabel = (n: number) =>
  n === 0 ? "no weekdays off" : n === 1 ? "needs 1 weekday off" : `needs ${n} weekdays off`;

// ---------------------------------------------------------------------------------------------- travel

export type Mode = "road/train" | "train/bus" | "flight";
export type Leg = { mode: Mode; hours: number; cost: [number, number] }; // one way

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(bLat - aLat);
  const dLng = toR(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** One-way options between a home city and a destination (PRD §7.2). */
export function travelOptions(cityId: string, dest: Destination): { ground: Leg | null; flight: Leg } {
  const city = cityById(cityId) ?? CITIES[0];
  const air = haversineKm(city.lat, city.lng, dest.lat, dest.lng);
  const road = air * 1.3;
  let ground: Leg | null = null;
  if (!dest.flightOnly) {
    if (road <= 350) {
      const c = Math.max(400, road * 2.5);
      ground = { mode: "road/train", hours: road / 50 + dest.accessHours, cost: [round50(c * 0.8), round50(c * 1.2)] };
    } else {
      const c = road * 1.5;
      ground = { mode: "train/bus", hours: road / 55 + dest.accessHours, cost: [round50(c * 0.8), round50(c * 1.25)] };
    }
  }
  const fc = 2500 + air * 2.5;
  const flight: Leg = {
    mode: "flight",
    hours: 3 + air / 750 + (dest.airHours ?? dest.accessHours + 1),
    cost: [round50(fc * 0.85), round50(fc * 1.3)],
  };
  return { ground, flight };
}

export type ForceMode = "ground" | "flight";

/** Mode choice (PRD §7.2). `needsFlight` = no ground option for someone who won't fly. */
export function chooseLeg(
  prefs: Pick<Preferences, "home_city" | "wont_do" | "max_travel_hours">,
  dest: Destination,
  force?: ForceMode,
): { leg: Leg; needsFlight: boolean; alternative: ForceMode | null } {
  const { ground, flight } = travelOptions(prefs.home_city!, dest);
  const noFly = prefs.wont_do.includes("no_flights");
  let leg: Leg;
  let needsFlight = false;
  if (force === "ground" && ground) leg = ground;
  else if (force === "flight" && !noFly) leg = flight;
  else if (noFly) {
    if (ground) leg = ground;
    else {
      leg = flight;
      needsFlight = true;
    }
  } else if (ground && ground.hours <= Math.min(10, prefs.max_travel_hours ?? 10)) leg = ground;
  else leg = flight;
  // The "other" mode a person could switch to (used by fix hints).
  let alternative: ForceMode | null = null;
  if (leg.mode === "flight" && ground) alternative = "ground";
  else if (leg.mode !== "flight" && !noFly) alternative = "flight";
  return { leg, needsFlight, alternative };
}

// ---------------------------------------------------------------------------------------------- ideas & estimates

/** An idea the engine can score: a stored option or a live catalogue suggestion. */
export type Idea = {
  key: string; // option id, or "eng:<dest>:<start>:<days>" for live suggestions
  source: "engine" | "custom" | "variant";
  destinationId: string | null;
  name: string;
  start: string;
  days: number;
  activities: string[];
  defaultEstimate: number | null;
  version: number;
  stored: boolean;
  createdOn?: string;
};

export const liveKey = (destId: string, start: string, days: number) => `eng:${destId}:${start}:${days}`;

export function ideaFromOption(o: TripOption): Idea {
  return {
    key: o.id,
    source: o.source,
    destinationId: o.destination_id,
    name: o.name,
    start: o.start_date,
    days: o.days,
    activities: o.activities,
    defaultEstimate: o.default_estimate,
    version: o.version,
    stored: true,
    createdOn: o.created_at.slice(0, 10),
  };
}

export type Estimate = {
  mid: number; // displayed estimate (rounded to ₹500)
  low: number;
  high: number;
  basis: string;
  kind: "model" | "coordinator" | "correction";
  leg: Leg | null;
  checkedOn?: string;
};

const modeWord = (m: Mode) => (m === "flight" ? "flight" : m);

export function modelEstimate(
  prefs: Pick<Preferences, "home_city" | "wont_do" | "max_travel_hours">,
  dest: Destination,
  days: number,
  force?: ForceMode,
): { estimate: Estimate; needsFlight: boolean; alternative: ForceMode | null } {
  const { leg, needsFlight, alternative } = chooseLeg(prefs, dest, force);
  const low = 2 * leg.cost[0] + dest.dayCost[0] * days;
  const high = 2 * leg.cost[1] + dest.dayCost[1] * days;
  const city = cityById(prefs.home_city)?.name ?? "Home";
  const estimate: Estimate = {
    mid: round500((low + high) / 2),
    low: round500(low),
    high: round500(high),
    basis: `${city} → ${dest.name} by ${modeWord(leg.mode)} (~${Math.round(leg.hours)}h each way) + ${days} days stay/food/local · est. ${longDate(ESTIMATE_DATE)}`,
    kind: "model",
    leg,
  };
  return { estimate, needsFlight, alternative };
}

// ---------------------------------------------------------------------------------------------- per-person check

export type PersonResult = {
  member: string;
  status: Status;
  reasons: Reason[];
  estimate: Estimate | null; // what the budget check used (correction, else model/coordinator)
  modelEstimate: Estimate | null;
  correctionStale: boolean;
  leaveNeeded: number;
  vibeMatches: number;
  alternativeMode: ForceMode | null;
};

type PrefsLike = Omit<Preferences, "room_id" | "updated_at" | "note_private"> & { note_private?: string | null };

/** Confirmed note limits (P1-2) folded into the effective preferences. */
export function effectivePrefs(p: PrefsLike): PrefsLike {
  const confirmed = (p.parsed_limits ?? []).filter((l) => l.confirmed);
  if (!confirmed.length) return p;
  const out = { ...p, wont_do: [...p.wont_do], slots: [...p.slots] };
  for (const l of confirmed) {
    if (l.kind === "max_leave_days") out.leave_days = out.leave_days == null ? l.value : Math.min(out.leave_days, l.value);
    if (l.kind === "max_travel_hours")
      out.max_travel_hours = out.max_travel_hours == null ? l.value : Math.min(out.max_travel_hours, l.value);
    if (l.kind === "add_wont_do" && !out.wont_do.includes(l.value)) out.wont_do.push(l.value);
    if (l.kind === "unavailable_slots") out.slots = out.slots.filter((s) => !l.value.includes(s));
  }
  return out;
}

/**
 * Check one person against one idea (PRD §7.4). Unknowns are never "fits": anything we can't evaluate becomes
 * "Needs checking". Precedence: Limit not met → Needs checking → Compromise → Fits stated inputs.
 */
export function personResult(
  member: string,
  rawPrefs: PrefsLike | undefined,
  idea: Idea,
  correction?: Correction,
  force?: ForceMode,
): PersonResult {
  const reasons: Reason[] = [];
  const add = (check: CheckKind, level: Reason["level"], text: string, fix?: FixAction) =>
    reasons.push({ check, level, text, fix });
  const dest = destinationById(idea.destinationId);
  const leave = leaveNeeded(idea.start, idea.days);

  if (!rawPrefs) {
    add("dates", "check", "Preferences not added yet", "complete_prefs");
    return {
      member, status: "check", reasons, estimate: null, modelEstimate: null, correctionStale: false,
      leaveNeeded: leave, vibeMatches: 0, alternativeMode: null,
    };
  }
  const p = effectivePrefs(rawPrefs);
  const complete = rawPrefs.complete;
  const month = monthOf(idea.start);

  // 1. Dates
  if (!complete && p.slots.length === 0) add("dates", "check", "Dates not added yet", "add_dates");
  else if (!p.slots.includes(idea.start)) {
    if (complete) add("dates", "limit", `Not free ${shortDate(idea.start)}`, "add_dates");
    else add("dates", "check", `${shortDate(idea.start)} not ticked yet`, "add_dates");
  }

  // 2. Travel (catalogue ideas are estimated; custom ideas without a destination can't be)
  let model: Estimate | null = null;
  let alternativeMode: ForceMode | null = null;
  const noFly = p.wont_do.includes("no_flights");
  const noLong = p.wont_do.includes("no_overnight");
  if (dest) {
    if (!p.home_city) {
      add("travel", "check", "Add your home city to estimate travel", "add_city");
    } else {
      const m = modelEstimate(p, dest, idea.days, force);
      model = m.estimate;
      alternativeMode = m.alternative;
      const h = m.estimate.leg!.hours;
      const hTxt = `~${Math.round(h)}h each way`;
      if (m.needsFlight) add("travel", "limit", "Needs a flight");
      if (noLong && h > 8) add("travel", "limit", `${hTxt} (you said no journeys over 8h)`, "check_journey");
      if (p.max_travel_hours != null) {
        if (h > p.max_travel_hours + 1.5) add("travel", "limit", `${hTxt} (your max ${p.max_travel_hours}h)`, "check_journey");
        else if (h > p.max_travel_hours) add("travel", "compromise", `${hTxt}, a bit over your ${p.max_travel_hours}h`);
      }
    }
  } else {
    if (idea.activities.includes("flight") && noFly) add("travel", "limit", "Needs a flight");
    else if (p.max_travel_hours != null || noLong)
      add("travel", "check", "Travel time not estimated for this idea", "check_journey");
  }

  // 3. Budget
  const active = correction && correction.active ? correction : undefined;
  const stale = !!active && (active.stale || active.option_version !== idea.version);
  let est: Estimate | null = null;
  if (active && !stale) {
    est = {
      mid: active.total, low: active.total, high: active.total, basis: active.basis, kind: "correction",
      leg: model?.leg ?? null, checkedOn: active.checked_on,
    };
  } else if (model) est = model;
  else if (!dest && idea.defaultEstimate != null) {
    est = {
      mid: idea.defaultEstimate, low: idea.defaultEstimate, high: idea.defaultEstimate,
      basis: `Coordinator estimate${idea.createdOn ? " · " + longDate(idea.createdOn) : ""}`, kind: "coordinator", leg: null,
    };
  }
  if (stale) add("budget", "check", "Your estimate correction is out of date (the trip changed)", "correct_estimate");
  else if (!est) add("budget", "check", "No estimate yet", "correct_estimate");
  else if (p.budget_max == null) add("budget", "check", "Add your max budget", "add_budget");
  else if (est.mid > p.budget_max) add("budget", "limit", `${approxK(est.mid - p.budget_max)} over your max`, "correct_estimate");
  else if (p.budget_comfortable != null && est.mid > p.budget_comfortable)
    add("budget", "compromise", `${inr(est.mid - p.budget_comfortable)} above your comfortable budget`);

  // 4. Won't-do
  const flags = {
    trek: dest ? !!dest.trek : idea.activities.includes("trek"),
    beach: dest ? dest.tags.includes("beach") : idea.activities.includes("beach"),
    party: dest ? !!dest.party : idea.activities.includes("party"),
    crowds: dest ? !!dest.crowded : idea.activities.includes("crowds"),
    cold: dest ? !!dest.coldMonths?.includes(month) : idea.activities.includes("cold"),
  };
  if (p.wont_do.includes("no_trek") && flags.trek) add("wontdo", "limit", "Involves trekking");
  if (p.wont_do.includes("no_beach") && flags.beach) add("wontdo", "limit", "It's a beach trip");
  if (p.wont_do.includes("no_party") && flags.party) add("wontdo", "limit", "Party-heavy place");
  if (p.wont_do.includes("no_crowds") && flags.crowds) add("wontdo", "limit", "Crowded tourist spot");
  if (p.wont_do.includes("no_cold") && flags.cold) add("wontdo", "limit", `Cold in ${MONTH_NAMES[month - 1]}`);

  // 5. Leave
  if (p.leave_days != null && leave > 0) {
    if (leave > p.leave_days) add("leave", "limit", `Needs ${leave} weekdays off (you have ${p.leave_days})`);
    else if (leave === p.leave_days) add("leave", "compromise", `Uses all ${leave === 1 ? "your 1 day" : `${leave} of your days`} of leave`);
  }

  // 6. Vibe
  const tags = dest?.tags ?? [];
  const vibeMatches = p.vibes.filter((v) => (tags as string[]).includes(v)).length;
  if (dest && p.vibes.length && vibeMatches === 0)
    add("vibe", "compromise", `Not your usual vibe (you picked ${p.vibes.slice(0, 2).map((v) => vibeLabel(v).toLowerCase()).join(", ")})`);

  // Incomplete preferences can never produce "fits".
  if (!complete && !reasons.some((r) => r.level === "check"))
    add("dates", "check", "Preferences not finished", "complete_prefs");

  const status: Status = reasons.length ? worstOf(reasons.map((r) => r.level)) : "fits";
  return {
    member, status, reasons: sortReasons(reasons), estimate: est, modelEstimate: model, correctionStale: stale,
    leaveNeeded: leave, vibeMatches, alternativeMode,
  };
}

const sortReasons = (r: Reason[]) => [...r].sort((a, b) => STATUS_RANK[b.level] - STATUS_RANK[a.level]);

// ---------------------------------------------------------------------------------------------- group scoring

export type GroupInput = {
  members: string[];
  prefs: Map<string, PrefsLike>;
  corrections?: Correction[];
  tripDays: number;
  slots: string[];
};

export type IdeaScore = {
  idea: Idea;
  people: PersonResult[];
  worst: Status;
  counts: Record<Status, number>;
  vibeTotal: number;
  offSeason: boolean;
  offReason: string | null;
  tags: string[];
  state: string | null;
};

export function scoreIdea(idea: Idea, g: GroupInput, override?: { member: string; force: ForceMode }): IdeaScore {
  const people = g.members.map((m) => {
    const corr = g.corrections?.find((c) => c.option_id === idea.key && c.member === m);
    return personResult(m, g.prefs.get(m), idea, corr, override?.member === m ? override.force : undefined);
  });
  const counts: Record<Status, number> = { limit: 0, check: 0, compromise: 0, fits: 0 };
  people.forEach((p) => counts[p.status]++);
  const dest = destinationById(idea.destinationId);
  const month = monthOf(idea.start);
  const offSeason = !!dest?.offMonths?.includes(month);
  return {
    idea,
    people,
    worst: worstOf(people.map((p) => p.status)),
    counts,
    vibeTotal: people.reduce((a, p) => a + p.vibeMatches, 0),
    offSeason,
    offReason: offSeason ? dest?.offReason ?? "off-season" : null,
    tags: dest?.tags ?? [],
    state: dest?.state ?? null,
  };
}

/** Ordering rule (PRD §7.5). Negative = a ranks before b. */
export function compareScores(a: IdeaScore, b: IdeaScore): number {
  return (
    STATUS_RANK[a.worst] - STATUS_RANK[b.worst] ||
    a.counts.limit - b.counts.limit ||
    a.counts.check - b.counts.check ||
    a.counts.compromise - b.counts.compromise ||
    b.vibeTotal - a.vibeTotal ||
    Number(a.offSeason) - Number(b.offSeason) ||
    a.idea.start.localeCompare(b.idea.start) ||
    a.idea.key.localeCompare(b.idea.key)
  );
}

export const ORDERING_RULE =
  "Ideas are ordered by the person they suit least: first those with no unmet limits, then fewer people with unmet limits, fewer unknowns, fewer compromises, more shared vibes, in-season before off-season, and earlier dates. No scores, no averages.";

/** Best start date for a destination: most members free → avoid off-season → earliest. */
export function bestSlot(dest: Destination, g: GroupInput): string | null {
  if (!g.slots.length) return null;
  const free = (s: string) => g.members.filter((m) => g.prefs.get(m)?.slots.includes(s)).length;
  const off = (s: string) => (dest.offMonths?.includes(monthOf(s)) ? 1 : 0);
  return [...g.slots].sort((a, b) => free(b) - free(a) || off(a) - off(b) || a.localeCompare(b))[0];
}

export function similar(a: IdeaScore, b: IdeaScore): boolean {
  if (!a.tags.length || !b.tags.length) return false;
  return jaccard(a.tags, b.tags) >= 0.6 || (a.state != null && a.state === b.state && a.tags[0] === b.tags[0]);
}

/** Pick up to `take` dissimilar ideas from a ranked list; a similar one is taken only if no comparable alternative remains. */
export function pickDissimilar(ranked: IdeaScore[], take = 3): IdeaScore[] {
  const picked: IdeaScore[] = [];
  for (let i = 0; i < ranked.length && picked.length < take; i++) {
    const c = ranked[i];
    if (picked.some((p) => p.idea.key === c.idea.key)) continue;
    if (picked.some((p) => similar(p, c))) {
      const comparable = ranked
        .slice(i + 1)
        .some((d) => STATUS_RANK[d.worst] <= STATUS_RANK[c.worst] && !picked.some((p) => similar(p, d)));
      if (comparable) continue;
    }
    picked.push(c);
  }
  return picked.sort(compareScores);
}

/** Rank the whole catalogue for this group and return dissimilar top ideas (live suggestions). */
export function suggest(g: GroupInput, take = 3): { top: IdeaScore[]; all: IdeaScore[] } {
  const all: IdeaScore[] = [];
  for (const dest of DESTINATIONS) {
    const start = bestSlot(dest, g);
    if (!start) continue;
    const idea: Idea = {
      key: liveKey(dest.id, start, g.tripDays), source: "engine", destinationId: dest.id, name: dest.name,
      start, days: g.tripDays, activities: [], defaultEstimate: null, version: 1, stored: false,
    };
    all.push(scoreIdea(idea, g));
  }
  all.sort(compareScores);
  return { top: pickDissimilar(all, take), all };
}

// ---------------------------------------------------------------------------------------------- fix hints

export type HintChange = { type: "slot"; start: string } | { type: "mode"; mode: ForceMode } | { type: "days"; days: number };

export type FixHint = {
  member: string;
  change: HintChange;
  /** Shared change (slot/days) → can become a variant idea; mode is personal. */
  shared: boolean;
  text: string;
  newlyLimited: string[];
  variantName?: string;
};

const withChange = (idea: Idea, change: HintChange): Idea =>
  change.type === "slot"
    ? { ...idea, key: idea.key + "~hint", start: change.start, version: idea.version + 1 }
    : change.type === "days"
      ? { ...idea, key: idea.key + "~hint", days: change.days, version: idea.version + 1 }
      : idea;

/** Re-score the group under a hint (used for display and by tests to verify hints). */
export function applyHint(idea: Idea, g: GroupInput, hint: Pick<FixHint, "member" | "change">): IdeaScore {
  if (hint.change.type === "mode") return scoreIdea(idea, g, { member: hint.member, force: hint.change.mode });
  // Corrections are tied to the old terms, so they don't carry over to a changed idea.
  return scoreIdea(withChange(idea, hint.change), { ...g, corrections: [] });
}

/** PRD §7.6: for each member with an unmet limit, the first single change that clears it, with side effects disclosed. */
export function fixHints(idea: Idea, g: GroupInput): FixHint[] {
  const base = scoreIdea(idea, g);
  const hints: FixHint[] = [];
  const limitedBefore = new Set(base.people.filter((p) => p.status === "limit").map((p) => p.member));

  for (const person of base.people.filter((p) => p.status === "limit")) {
    const m = person.member;
    const prefs = g.prefs.get(m);
    const candidates: HintChange[] = [];
    // 1. another slot they ticked (fewest new side effects first, then earliest)
    const slotChanges = (prefs ? effectivePrefs(prefs).slots : [])
      .filter((s) => s !== idea.start && g.slots.includes(s))
      .map((s) => ({ type: "slot", start: s }) as HintChange);
    // 2. the other travel mode (personal)
    const modeChanges: HintChange[] = person.alternativeMode ? [{ type: "mode", mode: person.alternativeMode }] : [];
    // 3. one fewer day
    const dayChanges: HintChange[] = idea.days > 2 ? [{ type: "days", days: idea.days - 1 }] : [];

    const evaluate = (change: HintChange) => {
      const after = applyHint(idea, g, { member: m, change });
      const mine = after.people.find((p) => p.member === m)!;
      if (mine.status === "limit") return null;
      const newlyLimited = after.people
        .filter((p) => p.member !== m && p.status === "limit" && !limitedBefore.has(p.member))
        .map((p) => p.member);
      return { change, after, newlyLimited };
    };

    let found: ReturnType<typeof evaluate> = null;
    const slotOk = slotChanges.map(evaluate).filter(Boolean) as NonNullable<ReturnType<typeof evaluate>>[];
    slotOk.sort((a, b) => a.newlyLimited.length - b.newlyLimited.length || (a.change as { start: string }).start.localeCompare((b.change as { start: string }).start));
    found = slotOk[0] ?? null;
    for (const c of [...modeChanges, ...dayChanges]) {
      if (found) break;
      found = evaluate(c);
    }
    if (!found) continue;

    const side = (names: string[], change: HintChange) => {
      if (!names.length) return "";
      const why = change.type === "slot" ? "isn't free then" : "then has an unmet limit";
      const list = names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + " and " + names.at(-1);
      return ` (${list} ${names.length === 1 ? why : why.replace("isn't", "aren't").replace("has", "have")})`;
    };
    const c = found.change;
    let text: string;
    let variantName: string | undefined;
    if (c.type === "slot") {
      text = `Works for ${m} if moved to ${shortDate(c.start)}${side(found.newlyLimited, c)}`;
      variantName = `${idea.name}, ${slotLabel(c.start, idea.days)}`;
    } else if (c.type === "days") {
      text = `Works for ${m} as a ${c.days}-day trip${side(found.newlyLimited, c)}`;
      variantName = `${idea.name}, ${c.days} days`;
    } else {
      text = `Works for ${m} travelling by ${c.mode === "flight" ? "flight" : "train or bus"} instead (${m} would correct their estimate)`;
    }
    hints.push({ member: m, change: c, shared: c.type !== "mode", text, newlyLimited: found.newlyLimited, variantName });
  }
  return hints;
}

// ---------------------------------------------------------------------------------------------- season line (P1-5)

/** Typical conditions for the trip's month, precomputed from the catalogue's season data (no live weather). */
export function seasonLine(destinationId: string | null, start: string): string | null {
  const dest = destinationById(destinationId);
  if (!dest) return null;
  const m = monthOf(start);
  const month = MONTH_NAMES[m - 1];
  if (dest.offMonths?.includes(m)) return `${month} is off-season here: ${dest.offReason ?? "check conditions"}.`;
  if (dest.coldMonths?.includes(m)) return `${month} is cold here. Pack warm layers.`;
  const next = [m % 12 + 1];
  if (dest.offMonths?.some((x) => next.includes(x))) return `${month} is in season, just before the ${dest.offReason?.split(",")[0] ?? "off-season"}.`;
  return `${month} is usually a good time: no monsoon, heat or winter closures in our data.`;
}
