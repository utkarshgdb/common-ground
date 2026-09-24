// Every write as a pure function: (state, input, actor, now) → new state. The API layer authenticates the actor,
// runs one of these, then persists the diff. The four change rules of PRD §8.2 live here.
import { ACTIVITIES, CITIES, DEALBREAKERS, DESTINATIONS, VIBES, destinationById } from "./catalogue";
import { answers, focusOption, groupInput } from "./consent";
import { recordOutcomeIfDue } from "./deadline";
import { liveKey, personResult, ideaFromOption, suggest, tripSlots, fixHints, slotLabel, type HintChange } from "./engine";
import type { Answer, Correction, EventRow, Member, ParsedLimit, Preferences, ResponseRow, RoomState, TripOption } from "./types";
import { addDays, toDate, todayIST, shortDate } from "./util";

export class ActionError extends Error {
  constructor(public code: string, message: string, public status = 400, public details?: unknown) {
    super(message);
  }
}

export type Actor = { member: string | null; coordinator: boolean };

export const REASON_CHIPS: { id: string; label: string }[] = [
  { id: "dates", label: "Dates" },
  { id: "budget", label: "Budget" },
  { id: "travel", label: "Travel time" },
  { id: "place", label: "The place" },
  { id: "other", label: "Something else" },
];

export const POLICY_TEXT =
  "We'll suggest a few trips that fit everyone's limits and review one at a time. A trip is agreed only when everyone explicitly says yes to its current terms. Silence isn't a yes. Nobody can override someone's hard limit. Anyone can change their answer.";

const MIN_READY = 3;

// ---------------------------------------------------------------------------------------------- helpers

const ev = (s: RoomState, type: string, member: string | null, meta: Record<string, unknown>, now: Date): EventRow => ({
  room_id: s.room.id, type, member, meta, at: now.toISOString(),
});

function requireOpen(s: RoomState) {
  if (s.room.status !== "open") throw new ActionError("room_not_open", `This room is ${s.room.status}. The coordinator can reopen it.`, 409);
}
function requireMember(s: RoomState, actor: Actor): Member {
  const m = s.members.find((x) => x.name === actor.member);
  if (!m) throw new ActionError("not_member", "Open your private link or claim your name first.", 401);
  return m;
}
function requireCoordinator(actor: Actor) {
  if (!actor.coordinator) throw new ActionError("not_coordinator", "Only the coordinator can do this.", 403);
}
const str = (v: unknown, max: number): string | null => {
  if (v == null) return null;
  const t = String(v).trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
};
const int = (v: unknown, lo: number, hi: number): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < lo || n > hi) throw new ActionError("invalid", `Enter a number between ${lo} and ${hi}.`);
  return n;
};
/** Lists from the client must be arrays of strings; anything else is a 400, never a crash. */
const arr = (v: unknown, label: string): string[] => {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new ActionError("invalid", `${label} must be a list.`);
  return v.slice(0, 50).map(String);
};
const isYmd = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(toDate(v).getTime());

/** Log a "reopened" history event for every yes that stopped counting because of this action. */
function trackReopens(before: RoomState, after: RoomState, cause: string, now: Date): RoomState {
  const a = answers(before);
  const b = answers(after);
  const reopened = [...a.entries()].filter(([m, x]) => x.validYes && b.get(m)?.state === "reopened").map(([m]) => m);
  if (!reopened.length) return after;
  return { ...after, events: [...after.events, ev(after, "reopened", null, { names: reopened, cause }, now)] };
}

function uniqueId(s: RoomState, base: string): string {
  let id = base;
  let i = 2;
  while (s.options.some((o) => o.id === id)) id = `${base}-${i++}`;
  return id;
}

// ---------------------------------------------------------------------------------------------- room

export type CreateRoomInput = {
  name: string;
  coordinator: string;
  members: string[];
  trip_days: number;
  window_start: string;
  window_end: string;
  deadline_at: string;
  is_demo?: boolean;
};

export function createRoom(id: string, input: CreateRoomInput, adminHash: string, now: Date): RoomState {
  const name = str(input.name, 60);
  if (!name) throw new ActionError("invalid", "Give the trip a name.");
  const names = (input.members ?? []).map((n) => str(n, 30)).filter(Boolean) as string[];
  const coord = str(input.coordinator, 30);
  if (!coord) throw new ActionError("invalid", "Add your name.");
  if (!names.some((n) => n.toLowerCase() === coord.toLowerCase())) names.unshift(coord);
  const lower = names.map((n) => n.toLowerCase());
  if (new Set(lower).size !== names.length) throw new ActionError("invalid", "Each person needs a different name.");
  if (names.length < 2 || names.length > 12) throw new ActionError("invalid", "A room needs 2–12 people.");
  const days = int(input.trip_days, 2, 5);
  if (!days) throw new ActionError("invalid", "Trip length must be 2–5 days.");
  if (!isYmd(input.window_start) || !isYmd(input.window_end)) throw new ActionError("invalid", "Pick a date window.");
  const span = (toDate(input.window_end).getTime() - toDate(input.window_start).getTime()) / 86400_000;
  if (span < 6 || span > 123) throw new ActionError("invalid", "The date window should be between 1 week and 4 months.");
  if (input.window_start < todayIST(now)) throw new ActionError("invalid", "The date window can't start in the past.");
  if (tripSlots(input.window_start, input.window_end, days).length === 0) throw new ActionError("invalid", "The window has no possible start dates.");
  const deadline = new Date(input.deadline_at);
  if (isNaN(deadline.getTime()) || deadline.getTime() <= now.getTime()) throw new ActionError("invalid", "The reply deadline must be in the future.");
  const coordinator = names.find((n) => n.toLowerCase() === coord.toLowerCase())!;
  const room = {
    id, name, trip_days: days, window_start: input.window_start, window_end: input.window_end,
    deadline_at: deadline.toISOString(), focus_option_id: null, focus_id: 0, status: "open" as const,
    coordinator, admin_token_hash: adminHash, is_demo: !!input.is_demo, created_at: now.toISOString(),
  };
  const members: Member[] = names.map((n, i) => ({
    room_id: id, name: n, session_hash: null, recovery_hash: null, joined_at: null, policy_ack_at: null, pref_version: 0, position: i,
  }));
  const s: RoomState = { room, members, prefs: [], options: [], corrections: [], responses: [], outcomes: [], events: [] };
  s.events.push(ev(s, "room_created", coordinator, { members: names.length }, now));
  return s;
}

/** Claim a name. A name can be claimed once; after that only its private recovery link restores it. */
export function claimName(s: RoomState, name: string, sessionHash: string, recoveryHash: string, now: Date): RoomState {
  const m = s.members.find((x) => x.name === name);
  if (!m) throw new ActionError("not_found", "That name isn't in this room.", 404);
  if (m.session_hash) throw new ActionError("already_claimed", `${name} has already joined. Use your private link to get back in.`, 409);
  return {
    ...s,
    members: s.members.map((x) => (x.name === name ? { ...x, session_hash: sessionHash, recovery_hash: recoveryHash, joined_at: now.toISOString() } : x)),
    events: [...s.events, ev(s, "joined", name, {}, now)],
  };
}

export function setSession(s: RoomState, name: string, patch: Partial<Pick<Member, "session_hash" | "recovery_hash">>): RoomState {
  return { ...s, members: s.members.map((x) => (x.name === name ? { ...x, ...patch } : x)) };
}

export function ackPolicy(s: RoomState, actor: Actor, now: Date): RoomState {
  const m = requireMember(s, actor);
  if (m.policy_ack_at) return s;
  return { ...s, members: s.members.map((x) => (x.name === m.name ? { ...x, policy_ack_at: now.toISOString() } : x)) };
}

// ---------------------------------------------------------------------------------------------- preferences (rule 3)

export type PrefsInput = Partial<Pick<Preferences,
  "home_city" | "budget_max" | "budget_comfortable" | "slots" | "vibes" | "wont_do" | "max_travel_hours" | "leave_days" | "note_private" | "parsed_limits">>;

const LIMIT_FIELDS = ["home_city", "budget_max", "budget_comfortable", "slots", "vibes", "wont_do", "max_travel_hours", "leave_days", "parsed_limits"] as const;

export function normalizePrefs(s: RoomState, member: string, input: PrefsInput, prev: Preferences | undefined, now: Date): Preferences {
  const base: Preferences = prev ?? {
    room_id: s.room.id, member, home_city: null, budget_max: null, budget_comfortable: null, slots: [], vibes: [], wont_do: [],
    max_travel_hours: null, leave_days: null, note_private: null, parsed_limits: [], complete: false, updated_at: now.toISOString(),
  };
  const next = { ...base };
  const has = (k: keyof PrefsInput) => Object.prototype.hasOwnProperty.call(input, k);
  if (has("home_city")) {
    const c = input.home_city ? String(input.home_city) : null;
    if (c && !CITIES.some((x) => x.id === c)) throw new ActionError("invalid", "Pick a home city from the list.");
    next.home_city = c;
  }
  if (has("budget_max")) next.budget_max = int(input.budget_max, 1000, 1_000_000);
  if (has("budget_comfortable")) next.budget_comfortable = int(input.budget_comfortable, 1000, 1_000_000);
  if (next.budget_comfortable != null && next.budget_max != null && next.budget_comfortable > next.budget_max)
    throw new ActionError("invalid", "Your comfortable budget can't be above your max.");
  const roomSlots = tripSlots(s.room.window_start, s.room.window_end, s.room.trip_days);
  if (has("slots")) next.slots = [...new Set(arr(input.slots, "Dates"))].filter((x) => roomSlots.includes(x)).sort();
  if (has("vibes")) {
    const v = [...new Set(arr(input.vibes, "Vibes"))].filter((x) => VIBES.some((y) => y.id === x));
    if (v.length > 3) throw new ActionError("invalid", "Pick up to 3 vibes.");
    next.vibes = v;
  }
  if (has("wont_do")) next.wont_do = [...new Set(arr(input.wont_do, "Won't-dos"))].filter((x) => DEALBREAKERS.some((y) => y.id === x)).sort();
  if (has("max_travel_hours")) next.max_travel_hours = int(input.max_travel_hours, 1, 48);
  if (has("leave_days")) next.leave_days = int(input.leave_days, 0, 10);
  if (has("note_private")) {
    next.note_private = str(input.note_private, 500);
    if (next.note_private !== base.note_private && !has("parsed_limits")) next.parsed_limits = [];
  }
  if (has("parsed_limits")) next.parsed_limits = sanitizeParsed(input.parsed_limits, roomSlots);
  next.complete = !!(next.home_city && next.budget_max && next.slots.length > 0);
  return next;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Server-side allow-list for note-derived limits (P1-2). Only items the person confirmed ever count (engine.effectivePrefs). */
export function sanitizeParsed(v: unknown, roomSlots: string[]): ParsedLimit[] {
  if (!Array.isArray(v)) return [];
  const out: ParsedLimit[] = [];
  for (const it of v.slice(0, 8) as Record<string, unknown>[]) {
    const confirmed = it?.confirmed === true;
    const n = Number(it?.value);
    if (it?.kind === "max_leave_days" && Number.isInteger(n) && n >= 0 && n <= 10) out.push({ kind: "max_leave_days", value: n, confirmed });
    else if (it?.kind === "max_travel_hours" && Number.isInteger(n) && n >= 1 && n <= 48) out.push({ kind: "max_travel_hours", value: n, confirmed });
    else if (it?.kind === "add_wont_do" && DEALBREAKERS.some((d) => d.id === it.value)) out.push({ kind: "add_wont_do", value: String(it.value), confirmed });
    else if (it?.kind === "unavailable_slots" && Array.isArray(it.value)) {
      const ok = (it.value as unknown[]).map(String).filter((x) => roomSlots.includes(x));
      if (ok.length) out.push({ kind: "unavailable_slots", value: [...new Set(ok)].sort(), confirmed });
    } else if (it?.kind === "info_only" && typeof it.value === "string") out.push({ kind: "info_only", value: it.value.slice(0, 140), confirmed });
  }
  return out;
}

/** Rule 3: a member's own edit reopens only that member's yes. Identical values change nothing. */
export function savePreferences(s: RoomState, actor: Actor, input: PrefsInput, now: Date): { state: RoomState; changed: boolean } {
  const m = requireMember(s, actor);
  requireOpen(s);
  const prev = s.prefs.find((p) => p.member === m.name);
  const next = normalizePrefs(s, m.name, input, prev, now);
  const limitChanged = !prev || LIMIT_FIELDS.some((k) => !same(prev[k], next[k])) || prev.complete !== next.complete;
  const noteChanged = !!prev && prev.note_private !== next.note_private;
  if (prev && !limitChanged && !noteChanged) return { state: s, changed: false };
  next.updated_at = now.toISOString();
  let out: RoomState = {
    ...s,
    prefs: prev ? s.prefs.map((p) => (p.member === m.name ? next : p)) : [...s.prefs, next],
    members: limitChanged ? s.members.map((x) => (x.name === m.name ? { ...x, pref_version: x.pref_version + 1 } : x)) : s.members,
    events: limitChanged ? [...s.events, ev(s, "prefs_saved", m.name, { complete: next.complete }, now)] : s.events,
  };
  out = trackReopens(s, out, `${m.name} edited their preferences`, now);
  out = autoFocus(out, now);
  return { state: out, changed: true };
}

// ---------------------------------------------------------------------------------------------- focus (rule 4)

function materialize(s: RoomState, key: string, now: Date): { state: RoomState; id: string } {
  const existing = s.options.find((o) => o.id === key && !o.archived);
  if (existing) return { state: s, id: existing.id };
  const m = /^eng:([a-z0-9]+):(\d{4}-\d{2}-\d{2}):([2-5])$/.exec(key);
  if (!m) throw new ActionError("not_found", "That idea no longer exists.", 404);
  const [, destId, start, days] = m;
  // Only real start dates of this room that haven't passed yet.
  if (!groupInput(s, todayIST(now)).slots.includes(start)) throw new ActionError("invalid", "That start date isn't available in this room.", 400);
  const dest = destinationById(destId);
  if (!dest) throw new ActionError("not_found", "Unknown destination.", 404);
  // Reuse a stored idea with identical terms rather than duplicating it.
  const dup = s.options.find((o) => !o.archived && o.destination_id === destId && o.start_date === start && o.days === Number(days));
  if (dup) return { state: s, id: dup.id };
  const id = uniqueId(s, `${destId}-${start.slice(5).replace("-", "")}`);
  const opt: TripOption = {
    room_id: s.room.id, id, source: "engine", destination_id: destId, name: dest.name, start_date: start, days: Number(days),
    activities: [], shared_assumptions: null, default_estimate: null, version: 1, archived: false, created_at: now.toISOString(),
  };
  return { state: { ...s, options: [...s.options, opt] }, id };
}

/** Rule 4: switching focus starts fresh answers for the new idea; old answers stay in history. */
export function setFocus(s: RoomState, actor: Actor, key: string, now: Date, auto = false): RoomState {
  if (!auto) requireCoordinator(actor);
  requireOpen(s);
  const { state, id } = materialize(s, key, now);
  if (state.room.focus_option_id === id) return state;
  const from = state.room.focus_option_id;
  return {
    ...state,
    room: { ...state.room, focus_option_id: id, focus_id: state.room.focus_id + 1 },
    events: [...state.events, ev(state, auto ? "auto_focus" : "focus_set", auto ? null : actor.member, { from, to: id }, now)],
  };
}

/** When ≥3 members have complete preferences and nothing is in focus, the top suggestion becomes "Up for review". */
export function autoFocus(s: RoomState, now: Date): RoomState {
  if (s.room.focus_option_id || s.room.status !== "open") return s;
  if (s.prefs.filter((p) => p.complete).length < Math.min(MIN_READY, s.members.length)) return s;
  const top = suggest(groupInput(s, todayIST(now))).top[0];
  if (!top) return s;
  return setFocus(s, { member: null, coordinator: true }, top.idea.key, now, true);
}

// ---------------------------------------------------------------------------------------------- ideas (rules 1 & 2)

export type IdeaInput = {
  destination_id?: string | null;
  name?: string | null;
  start_date?: string;
  days?: number;
  activities?: string[];
  shared_assumptions?: string | null;
  default_estimate?: number | null;
};

function normalizeIdea(s: RoomState, input: IdeaInput, now: Date, prev?: TripOption) {
  const destination_id = input.destination_id !== undefined ? input.destination_id || null : prev?.destination_id ?? null;
  const dest = destinationById(destination_id);
  if (destination_id && !dest) throw new ActionError("invalid", "Unknown destination.");
  const name = dest && !input.name ? (prev?.destination_id === destination_id && prev ? prev.name : dest.name) : str(input.name ?? prev?.name, 60);
  if (!name) throw new ActionError("invalid", "Give the idea a name.");
  const start_date = input.start_date ?? prev?.start_date;
  if (!isYmd(start_date) || start_date < s.room.window_start || start_date > s.room.window_end)
    throw new ActionError("invalid", "Pick a start date inside the trip window.");
  if (start_date <= todayIST(now) && start_date !== prev?.start_date) throw new ActionError("invalid", "Pick a start date that hasn't passed.");
  const days = int(input.days ?? prev?.days, 2, 5);
  if (!days) throw new ActionError("invalid", "Trip length must be 2–5 days.");
  const activities = input.activities !== undefined
    ? [...new Set(arr(input.activities, "Activities"))].filter((a) => ACTIVITIES.some((x) => x.id === a)).sort()
    : prev?.activities ?? [];
  const shared_assumptions = input.shared_assumptions !== undefined ? str(input.shared_assumptions, 200) : prev?.shared_assumptions ?? null;
  const default_estimate = input.default_estimate !== undefined ? int(input.default_estimate, 500, 1_000_000) : prev?.default_estimate ?? null;
  if (!dest && default_estimate == null) throw new ActionError("invalid", "Pick a catalogue destination, or enter an all-in estimate per person.");
  return { destination_id, name, start_date, days, activities: dest ? [] : activities, shared_assumptions, default_estimate: dest ? null : default_estimate };
}

export function addIdea(s: RoomState, actor: Actor, input: IdeaInput, now: Date, source: "custom" | "variant" = "custom"): { state: RoomState; id: string } {
  requireCoordinator(actor);
  requireOpen(s);
  const n = normalizeIdea(s, input, now);
  const id = uniqueId(s, `${source === "variant" ? "v" : "c"}-${(n.destination_id ?? n.name.toLowerCase().replace(/[^a-z0-9]+/g, "")).slice(0, 12)}-${n.start_date.slice(5).replace("-", "")}`);
  const opt: TripOption = { room_id: s.room.id, id, source, ...n, version: 1, archived: false, created_at: now.toISOString() };
  return {
    state: { ...s, options: [...s.options, opt], events: [...s.events, ev(s, source === "variant" ? "variant_created" : "idea_added", actor.member, { id, name: n.name }, now)] },
    id,
  };
}

const SHARED_TERMS = ["destination_id", "start_date", "days", "activities", "shared_assumptions", "default_estimate"] as const;

/**
 * Rule 1: editing a non-focused idea reopens nothing. Rule 2: changing the focused idea's shared terms bumps its
 * version, so every yes on it reopens and personal corrections for it go stale.
 */
export function editIdea(s: RoomState, actor: Actor, id: string, input: IdeaInput, now: Date): RoomState {
  requireCoordinator(actor);
  requireOpen(s);
  const prev = s.options.find((o) => o.id === id && !o.archived);
  if (!prev) throw new ActionError("not_found", "That idea no longer exists.", 404);
  const n = normalizeIdea(s, input, now, prev);
  const termsChanged = SHARED_TERMS.some((k) => !same(prev[k], n[k]));
  if (!termsChanged && prev.name === n.name) return s;
  const next: TripOption = { ...prev, ...n, version: termsChanged ? prev.version + 1 : prev.version };
  let out: RoomState = {
    ...s,
    options: s.options.map((o) => (o.id === id ? next : o)),
    corrections: termsChanged ? s.corrections.map((c) => (c.option_id === id && c.active ? { ...c, stale: true } : c)) : s.corrections,
    events: [...s.events, ev(s, "idea_edited", actor.member, { id, terms_changed: termsChanged, focused: s.room.focus_option_id === id }, now)],
  };
  out = trackReopens(s, out, `${next.name}'s terms changed`, now);
  return out;
}

export function removeIdea(s: RoomState, actor: Actor, id: string, now: Date): RoomState {
  requireCoordinator(actor);
  if (s.room.focus_option_id === id) throw new ActionError("focused", "Switch focus to another idea before removing this one.", 409);
  const prev = s.options.find((o) => o.id === id && !o.archived);
  if (!prev) return s;
  return {
    ...s,
    options: s.options.map((o) => (o.id === id ? { ...o, archived: true } : o)),
    events: [...s.events, ev(s, "idea_removed", actor.member, { id, name: prev.name }, now)],
  };
}

/** P1-4: turn a verified shared fix hint (slot or days) into a new variant idea. Doesn't change focus. */
export function createVariant(s: RoomState, actor: Actor, member: string, now: Date): { state: RoomState; id: string } {
  requireCoordinator(actor);
  const o = focusOption(s);
  if (!o) throw new ActionError("no_focus", "Nothing is up for review yet.", 409);
  const hint = fixHints(ideaFromOption(o), groupInput(s, todayIST(now))).find((h) => h.member === member && h.shared);
  if (!hint) throw new ActionError("no_hint", "No date or length change clears that limit.", 409);
  const c = hint.change as Exclude<HintChange, { type: "mode" }>;
  const start = c.type === "slot" ? c.start : o.start_date;
  const days = c.type === "days" ? c.days : o.days;
  const name = o.destination_id ? `${destinationById(o.destination_id)!.name}, ${slotLabel(start, days)}` : `${o.name}, ${shortDate(start)}`;
  return addIdea(
    s, actor,
    { destination_id: o.destination_id, name, start_date: start, days, activities: o.activities, shared_assumptions: o.shared_assumptions, default_estimate: o.default_estimate },
    now, "variant",
  );
}

// ---------------------------------------------------------------------------------------------- estimate correction (rule 3)

export function correctEstimate(
  s: RoomState, actor: Actor, optionId: string,
  input: { total: unknown; basis: unknown; checked_on: unknown; confirm?: boolean }, now: Date,
): RoomState {
  const m = requireMember(s, actor);
  requireOpen(s);
  const o = s.options.find((x) => x.id === optionId && !x.archived);
  if (!o) throw new ActionError("not_found", "That idea no longer exists.", 404);
  if (!input.confirm) throw new ActionError("confirm", "Please confirm this changes only your total.");
  const total = int(input.total, 500, 1_000_000);
  if (!total) throw new ActionError("invalid", "Enter your all-in total.");
  const basis = str(input.basis, 120);
  if (!basis || basis.length < 3) throw new ActionError("invalid", "Add a short basis, e.g. \"IndiGo DEL–GOI + hostel\".");
  if (!isYmd(input.checked_on) || input.checked_on > addDays(todayIST(now), 1)) throw new ActionError("invalid", "Enter the date you checked.");
  const prev = s.corrections.find((c) => c.member === m.name && c.option_id === optionId);
  if (prev && prev.active && !prev.stale && prev.option_version === o.version && prev.total === total && prev.basis === basis && prev.checked_on === input.checked_on) return s;
  const next: Correction = {
    room_id: s.room.id, option_id: optionId, member: m.name, total, basis, checked_on: input.checked_on,
    option_version: o.version, cost_version: (prev?.cost_version ?? 0) + 1, stale: false, active: true,
  };
  let out: RoomState = {
    ...s,
    corrections: prev ? s.corrections.map((c) => (c === prev ? next : c)) : [...s.corrections, next],
    events: [...s.events, ev(s, "estimate_corrected", m.name, { option_id: optionId }, now)],
  };
  out = trackReopens(s, out, `${m.name} corrected their estimate`, now);
  return out;
}

export function removeCorrection(s: RoomState, actor: Actor, optionId: string, now: Date): RoomState {
  const m = requireMember(s, actor);
  const prev = s.corrections.find((c) => c.member === m.name && c.option_id === optionId && c.active);
  if (!prev) return s;
  let out: RoomState = {
    ...s,
    corrections: s.corrections.map((c) => (c === prev ? { ...c, active: false, cost_version: c.cost_version + 1 } : c)),
    events: [...s.events, ev(s, "estimate_correction_removed", m.name, { option_id: optionId }, now)],
  };
  out = trackReopens(s, out, `${m.name} removed their estimate correction`, now);
  return out;
}

// ---------------------------------------------------------------------------------------------- answers

export type RespondInput = { answer: Answer; reason_chip?: string | null; note_shared?: string | null; confirm?: boolean; ack_policy?: boolean };

/** Only the member themself can answer. A yes needs the policy acknowledgement, the confirmation tick and no blockers. */
export function respond(s: RoomState, actor: Actor, input: RespondInput, now: Date): RoomState {
  const m = requireMember(s, actor);
  requireOpen(s);
  const o = focusOption(s);
  if (!o) throw new ActionError("no_focus", "Nothing is up for review yet.", 409);
  if (!["yes", "change", "cannot"].includes(input.answer)) throw new ActionError("invalid", "Unknown answer.");
  if (input.answer === "yes" && o.start_date <= todayIST(now)) throw new ActionError("past", "This trip's dates have passed. The coordinator can put another idea up for review.", 409);
  let state = s;
  if (input.answer === "yes") {
    if (!m.policy_ack_at && !input.ack_policy) throw new ActionError("policy", "Please read and tick the decision policy first.");
    if (!input.confirm) throw new ActionError("confirm", "Please tick the confirmation box.");
    const g = groupInput(s);
    const corr = s.corrections.find((c) => c.member === m.name && c.option_id === o.id);
    const p = personResult(m.name, g.prefs.get(m.name), ideaFromOption(o), corr);
    const blockers = p.reasons.filter((r) => r.level === "limit" || r.level === "check");
    if (blockers.length) throw new ActionError("blocked", "Some checks need sorting first.", 409, blockers);
    if (!m.policy_ack_at) state = ackPolicy(state, actor, now);
  }
  const chip = input.answer === "yes" ? null : input.reason_chip && REASON_CHIPS.some((c) => c.id === input.reason_chip) ? input.reason_chip : null;
  const v = { option_version: o.version, pref_version: m.pref_version, cost_version: state.corrections.find((c) => c.member === m.name && c.option_id === o.id)?.cost_version ?? 0 };
  const row: ResponseRow = {
    room_id: s.room.id, member: m.name, focus_id: s.room.focus_id, option_id: o.id, ...v,
    answer: input.answer, reason_chip: chip, note_shared: input.answer === "yes" ? null : str(input.note_shared, 280), at: now.toISOString(),
  };
  const others = state.responses.filter((r) => !(r.member === m.name && r.focus_id === s.room.focus_id));
  return { ...state, responses: [...others, row], events: [...state.events, ev(state, "answer", m.name, { answer: row.answer, chip, option_id: o.id }, now)] };
}

export function withdraw(s: RoomState, actor: Actor, now: Date): RoomState {
  const m = requireMember(s, actor);
  const had = s.responses.find((r) => r.member === m.name && r.focus_id === s.room.focus_id);
  if (!had) return s;
  return {
    ...s,
    responses: s.responses.filter((r) => r !== had),
    events: [...s.events, ev(s, "answer_withdrawn", m.name, { was: had.answer }, now)],
  };
}

// ---------------------------------------------------------------------------------------------- coordinator lifecycle

/** Extending keeps valid yeses; it starts a new round with a new deadline. */
export function extendDeadline(s: RoomState, actor: Actor, deadlineIso: string, now: Date): RoomState {
  requireCoordinator(actor);
  const d = new Date(deadlineIso);
  if (isNaN(d.getTime()) || d.getTime() <= now.getTime()) throw new ActionError("invalid", "Pick a future deadline.");
  const recorded = recordOutcomeIfDue(s, now).state; // never lose the record of the deadline being replaced
  return {
    ...recorded,
    room: { ...recorded.room, deadline_at: d.toISOString(), status: "open" },
    events: [...recorded.events, ev(recorded, "deadline_extended", actor.member, { from: s.room.deadline_at, to: d.toISOString() }, now)],
  };
}

export function setRoomStatus(s: RoomState, actor: Actor, status: "open" | "postponed" | "closed", now: Date): RoomState {
  requireCoordinator(actor);
  if (s.room.status === status) return s;
  const type = status === "open" ? "room_reopened" : status === "postponed" ? "room_postponed" : "room_closed";
  return { ...s, room: { ...s.room, status }, events: [...s.events, ev(s, type, actor.member, {}, now)] };
}

export const liveIdeaKey = liveKey;
export { DESTINATIONS };
