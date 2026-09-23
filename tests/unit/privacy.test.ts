// Acceptance test 5 (PRD §18.5): the projection sent to Aisha contains no other member's budget, note, slots or
// correction basis.
import { describe, expect, test } from "vitest";
import { correctEstimate, createRoom, respond, savePreferences } from "../../lib/actions";
import { focusOption } from "../../lib/consent";
import { tripSlots } from "../../lib/engine";
import { project } from "../../lib/projection";
import type { RoomState } from "../../lib/types";
import { NOW, later } from "./fixtures";

const SECRET = {
  budgets: [23417, 19873, 31259, 27611],
  comfortable: [21389, 17777, 29111, 25433],
  notes: ["PRIVNOTE-RIYA-alpha", "PRIVNOTE-SID-bravo", "PRIVNOTE-KARAN-charlie", "PRIVNOTE-PREETHI-delta"],
  basis: "SECRETBASIS-sid-indigo-6E123",
  aishaNote: "Aisha own note",
};

function room(): RoomState {
  const names = ["Riya", "Siddharth", "Karan", "Aisha", "Preethi"];
  let s = createRoom("priv1", { name: "Privacy check", coordinator: "Riya", members: names, trip_days: 3, window_start: "2026-10-01", window_end: "2026-11-30", deadline_at: later(60 * 72).toISOString() }, "h", NOW);
  const slots = tripSlots("2026-10-01", "2026-11-30", 3);
  const others = ["Riya", "Siddharth", "Karan", "Preethi"];
  const cities = ["bengaluru", "delhi", "hyderabad", "chennai"];
  others.forEach((n, i) => {
    s = savePreferences(s, { member: n, coordinator: false }, {
      home_city: cities[i], budget_max: SECRET.budgets[i], budget_comfortable: SECRET.comfortable[i], note_private: SECRET.notes[i],
      slots: slots.filter((_, j) => (j + i) % 3 !== 0), vibes: ["relaxed"], wont_do: i === 2 ? ["no_flights"] : [], max_travel_hours: i === 2 ? 11 : null,
    }, NOW).state;
  });
  s = savePreferences(s, { member: "Aisha", coordinator: false }, { home_city: "mumbai", budget_max: 16000, slots, note_private: SECRET.aishaNote }, NOW).state;
  const f = focusOption(s)!;
  s = correctEstimate(s, { member: "Siddharth", coordinator: false }, f.id, { total: 24111, basis: SECRET.basis, checked_on: "2026-09-23", confirm: true }, NOW);
  s = respond(s, { member: "Preethi", coordinator: false }, { answer: "change", reason_chip: "dates", note_shared: "Could we do a week later?" }, NOW);
  return s;
}

/** Walk the JSON and collect every object key path, to prove no private field names appear outside the viewer's own prefs. */
function keyPaths(v: unknown, path = "", out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x, i) => keyPaths(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.push(`${path}.${k}`); keyPaths(x, `${path}.${k}`, out); }
  return out;
}

describe("privacy projection", () => {
  const s = room();
  const view = project(s, { member: "Aisha", coordinator: false }, { now: NOW, groupLink: "https://x/room/priv1" });
  const json = JSON.stringify(view);

  test("no other member's budget, comfortable budget, note, correction basis or correction total", () => {
    for (const n of [...SECRET.budgets, ...SECRET.comfortable, 24111]) {
      expect(json).not.toContain(String(n));
      expect(json).not.toContain(n.toLocaleString("en-IN"));
    }
    for (const n of SECRET.notes) expect(json).not.toContain(n);
    expect(json).not.toContain(SECRET.basis);
  });

  test("no other member's home city or date list", () => {
    for (const city of ["Bengaluru", "Delhi", "Hyderabad", "Chennai", "bengaluru", "delhi", "hyderabad", "chennai"]) expect(json).not.toContain(city);
    const paths = keyPaths(view);
    const slotsPaths = paths.filter((p) => /\.slots$/.test(p));
    expect(slotsPaths.sort()).toEqual([".me.prefs.slots", ".slots"]); // own prefs + the room's shared calendar
    for (const bad of ["budget_max", "budget_comfortable", "note_private", "basis", "home_city"]) {
      const hits = paths.filter((p) => p.endsWith("." + bad) && !p.startsWith(".me.prefs") && !/\.mine\./.test(p));
      expect(hits, bad).toEqual([]);
    }
  });

  test("Aisha still sees her own data, shared answers and notes", () => {
    expect(json).toContain(SECRET.aishaNote);
    expect(view.me?.prefs?.budget_max).toBe(16000);
    expect(view.people.find((p) => p.name === "Preethi")!.noteShared).toBe("Could we do a week later?");
    // every per-idea "mine" block belongs to Aisha only (estimates are hers, not others')
    for (const i of view.ideas) expect(i.mine?.budget.max ?? 16000).toBe(16000);
    expect(view.coordinator).toBeNull();
  });

  test("the coordinator's view is just as private", () => {
    const cj = JSON.stringify(project(s, { member: "Riya", coordinator: true }, { now: NOW, groupLink: "x" }));
    for (const n of [SECRET.budgets[1], SECRET.budgets[2], SECRET.budgets[3], 24111]) expect(cj).not.toContain(String(n));
    for (const n of SECRET.notes.slice(1)) expect(cj).not.toContain(n);
    expect(cj).not.toContain(SECRET.basis);
  });

  test("snapshot of the key structure Aisha receives", () => {
    const shape = [...new Set(keyPaths(view).map((p) => p.replace(/\[\d+\]/g, "[]")))].sort();
    expect(shape).toMatchSnapshot();
  });
});
