// Guided demo room (PRD §14). Everything here is only reachable for rooms with is_demo = true (enforced in the API).
// Simulated answers are labelled as simulated in History.
import { ackPolicy, createRoom, respond, savePreferences, type PrefsInput } from "./actions";
import { focusOption, groupInput } from "./consent";
import { recordOutcomeIfDue } from "./deadline";
import { ideaFromOption, personResult, tripSlots } from "./engine";
import type { RoomState } from "./types";
import { addDays, istToIso, todayIST } from "./util";

export const DEMO_MEMBERS = ["Riya", "Siddharth", "Karan", "Aisha", "Preethi"];
export const DEMO_COORDINATOR = "Riya";
export const DEMO_START_AS = "Karan";

/** Slot indices each member can NOT do ("most slots"). Everyone is free on index 2, Karan's overlap slot. */
const MISSING: Record<string, number[]> = { Riya: [0], Siddharth: [1], Aisha: [5], Preethi: [7] };

function seedPrefs(slots: string[]): Record<string, PrefsInput> {
  const pick = (name: string) => slots.filter((_, i) => !MISSING[name]?.includes(i));
  return {
    Riya: { home_city: "bengaluru", budget_max: 18000, budget_comfortable: 15000, vibes: ["beach", "relaxed", "food"], wont_do: [], slots: pick("Riya") },
    Siddharth: {
      home_city: "delhi", budget_max: 25000, budget_comfortable: 20000, vibes: ["mountains", "adventure", "nightlife"], wont_do: [],
      slots: pick("Siddharth"), note_private: "Done Goa three times already",
    },
    Aisha: { home_city: "mumbai", budget_max: 16000, budget_comfortable: 12000, vibes: ["relaxed", "nature", "food"], wont_do: ["no_cold", "no_trek"], leave_days: 1, slots: pick("Aisha") },
    Preethi: { home_city: "chennai", budget_max: 20000, budget_comfortable: 16000, vibes: ["beach", "heritage", "food"], wont_do: ["no_party"], leave_days: 1, slots: pick("Preethi") },
  };
}

export function karanPrefs(s: RoomState): PrefsInput {
  const slots = tripSlots(s.room.window_start, s.room.window_end, s.room.trip_days);
  return {
    home_city: "hyderabad", budget_max: 15000, budget_comfortable: 13000, vibes: ["adventure", "nature"], wont_do: ["no_flights"],
    max_travel_hours: 12, slots: [slots[2], slots[4]].filter(Boolean),
  };
}

const as = (member: string) => ({ member, coordinator: member === DEMO_COORDINATOR });
const note = (s: RoomState, text: string, now: Date): RoomState => ({
  ...s, events: [...s.events, { room_id: s.room.id, type: "demo", member: null, meta: { text }, at: now.toISOString() }],
});

/** A fresh demo room: 4 of 5 have preferences; Karan's are still empty. */
export function buildDemo(id: string, adminHash: string, now: Date, mode: "full" | "three" = "full"): RoomState {
  const today = todayIST(now);
  const windowStart = addDays(today, 1);
  let s = createRoom(
    id,
    {
      name: "The November escape", coordinator: DEMO_COORDINATOR, members: DEMO_MEMBERS, trip_days: 3,
      window_start: windowStart, window_end: addDays(windowStart, 55), deadline_at: istToIso(addDays(today, 2)), is_demo: true,
    },
    adminHash, now,
  );
  s = { ...s, members: s.members.map((m) => ({ ...m, joined_at: now.toISOString() })) };
  const seed = seedPrefs(tripSlots(s.room.window_start, s.room.window_end, s.room.trip_days));
  const who = mode === "three" ? ["Riya", "Siddharth", "Aisha"] : ["Riya", "Siddharth", "Aisha", "Preethi"];
  for (const name of who) s = savePreferences(s, as(name), seed[name], now).state;
  return note(s, mode === "three" ? "Reset with 3 of 5 preferences" : "Demo room ready: 4 of 5 have added preferences", now);
}

export function demoFillKaran(s: RoomState, now: Date): RoomState {
  return note(savePreferences(s, as("Karan"), karanPrefs(s), now).state, "Filled Karan's sample preferences", now);
}

/** The other four give valid yeses to the focus where eligible. Karan is never answered for. */
export function demoSimulateFour(s: RoomState, now: Date): RoomState {
  const o = focusOption(s);
  if (!o) return s;
  let out = s;
  for (const name of DEMO_MEMBERS.filter((n) => n !== "Karan")) {
    const g = groupInput(out);
    const corr = out.corrections.find((c) => c.member === name && c.option_id === o.id);
    const p = personResult(name, g.prefs.get(name), ideaFromOption(o), corr);
    if (p.status === "limit" || p.status === "check") continue;
    out = ackPolicy(out, as(name), now);
    out = respond(out, as(name), { answer: "yes", confirm: true }, now);
    const last = out.events[out.events.length - 1];
    out.events[out.events.length - 1] = { ...last, meta: { ...last.meta, simulated: true } };
  }
  return out;
}

export function demoReachDeadline(s: RoomState, now: Date): RoomState {
  const moved: RoomState = { ...s, room: { ...s.room, deadline_at: new Date(now.getTime() - 60_000).toISOString(), status: "open" } };
  return recordOutcomeIfDue(note(moved, "Moved the deadline to one minute ago", now), now).state;
}
