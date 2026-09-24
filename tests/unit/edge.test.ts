// Stress / edge cases found while reviewing the product like a launch review.
import { describe, expect, test } from "vitest";
import { ActionError, addIdea, createRoom, respond, savePreferences, setFocus, setRoomStatus, withdraw } from "../../lib/actions";
import { focusOption, groupInput, isAgreed, validYesCount } from "../../lib/consent";
import { nextMove } from "../../lib/deadline";
import { buildDemo, demoFillKaran, demoSimulateFour } from "../../lib/demo";
import { personResult, suggest, tripSlots, type Idea } from "../../lib/engine";
import { project } from "../../lib/projection";
import type { RoomState } from "../../lib/types";
import { addDays, todayIST } from "../../lib/util";
import { NOW, RIYA_COORD, agreedRoom, as } from "./fixtures";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as ActionError).code;
  }
  return "no error";
};
const today = todayIST(NOW);
const mk = (names: string[], days = 3, start = addDays(today, 3)) =>
  createRoom("edge1", { name: "Edge", coordinator: names[0], members: names, trip_days: days, window_start: start, window_end: addDays(start, 50), deadline_at: new Date(NOW.getTime() + 86400e3).toISOString() }, "h", NOW);

describe("dates in the past", () => {
  test("a room can't start in the past", () => {
    expect(code(() => mk(["A", "B"], 3, addDays(today, -10)))).toBe("invalid");
  });

  test("weeks later, suggestions never propose a date that has passed", () => {
    const s = demoFillKaran(buildDemo("d", "h", NOW), NOW);
    const later = new Date(NOW.getTime() + 20 * 86400e3);
    const t = todayIST(later);
    for (const sc of suggest(groupInput(s, t)).all) expect(sc.idea.start > t).toBe(true);
    const v = project(s, { member: "Karan", coordinator: false }, { now: later, groupLink: "x" });
    expect(v.slots.every((x) => x.start > t)).toBe(true);
    // the old focus is flagged, a yes is refused, and the rules say "switch focus"
    expect(v.focus!.past).toBe(true);
    expect(code(() => respond(s, as("Karan"), { answer: "yes", confirm: true, ack_policy: true }, later))).toBe("past");
    expect(nextMove(s, t).kind).toBe("past");
  });

  test("forged focus keys are refused (outside window, past, silly length)", () => {
    const s = buildDemo("d", "h", NOW);
    const slots = tripSlots(s.room.window_start, s.room.window_end, 3);
    expect(code(() => setFocus(s, RIYA_COORD, "eng:goa:2099-01-02:3", NOW))).toBe("invalid");
    expect(code(() => setFocus(s, RIYA_COORD, `eng:goa:${addDays(today, -7)}:3`, NOW))).toBe("invalid");
    expect(code(() => setFocus(s, RIYA_COORD, `eng:goa:${slots[1]}:9`, NOW))).toBe("not_found");
    expect(code(() => setFocus(s, RIYA_COORD, `eng:goa:${addDays(slots[1], 1)}:3`, NOW))).toBe("invalid"); // not a start day
    expect(code(() => setFocus(s, RIYA_COORD, `eng:goa:${slots[1]}:3`, NOW))).toBe("no error");
  });

  test("a custom idea can't be added for a past date", () => {
    const s = buildDemo("d", "h", NOW);
    expect(code(() => addIdea(s, RIYA_COORD, { name: "X", default_estimate: 9000, start_date: today, days: 3 }, NOW))).toBe("invalid");
  });
});

describe("robust input", () => {
  test("non-list values for list fields are a clean 'invalid', not a crash", () => {
    const s = buildDemo("d", "h", NOW);
    for (const bad of [{ slots: "2026-10-09" }, { vibes: { a: 1 } }, { wont_do: 5 }])
      expect(code(() => savePreferences(s, as("Karan"), bad as never, NOW))).toBe("invalid");
  });
  test("names with symbols and emoji are fine", () => {
    const s = mk(["Ri<b>ya</b>", "Ai & sha", "Kar🙂n"]);
    expect(s.members.map((m) => m.name)).toEqual(["Ri<b>ya</b>", "Ai & sha", "Kar🙂n"]);
  });
});

describe("group shapes", () => {
  test("a 2-person room gets ideas as soon as both have added preferences", () => {
    let s = mk(["A", "B"]);
    const slots = tripSlots(s.room.window_start, s.room.window_end, 3);
    s = savePreferences(s, as("A"), { home_city: "mumbai", budget_max: 20000, slots }, NOW).state;
    expect(focusOption(s)).toBeNull();
    s = savePreferences(s, as("B"), { home_city: "pune", budget_max: 20000, slots }, NOW).state;
    expect(focusOption(s)).not.toBeNull();
  });

  test("nobody's dates overlap: still a focus, never 'agreed', and the rules offer a verified date move or say so", () => {
    let s = mk(["A", "B", "C"]);
    const slots = tripSlots(s.room.window_start, s.room.window_end, 3);
    ["A", "B", "C"].forEach((n, i) => {
      s = savePreferences(s, as(n), { home_city: "bengaluru", budget_max: 30000, slots: [slots[i]] }, NOW).state;
    });
    const f = focusOption(s)!;
    const g = groupInput(s, today);
    const limited = g.members.filter((m) => personResult(m, g.prefs.get(m), { key: f.id, source: "engine", destinationId: f.destination_id, name: f.name, start: f.start_date, days: 3, activities: [], defaultEstimate: null, version: 1, stored: true } as Idea).status === "limit");
    expect(limited.length).toBe(2);
    expect(isAgreed(s)).toBe(false);
    expect(["variant", "nudge", "limit"]).toContain(nextMove(s, today).kind);
  });

  test("12 people, 20 slots, several ideas: a projection stays fast", () => {
    const names = Array.from({ length: 12 }, (_, i) => `P${i}`);
    let s = createRoom("big", { name: "Big", coordinator: "P0", members: names, trip_days: 3, window_start: addDays(today, 2), window_end: addDays(today, 120), deadline_at: new Date(NOW.getTime() + 86400e3).toISOString() }, "h", NOW);
    const slots = tripSlots(s.room.window_start, s.room.window_end, 3);
    const cities = ["mumbai", "delhi", "bengaluru", "chennai", "kolkata", "pune"];
    names.forEach((n, i) => {
      s = savePreferences(s, as(n), { home_city: cities[i % 6], budget_max: 15000 + i * 1000, slots: slots.filter((_, j) => (i + j) % 3 !== 0), vibes: ["relaxed"], wont_do: i % 4 ? [] : ["no_flights"], max_travel_hours: 10 }, NOW).state;
    });
    for (const d of ["goa", "coorg", "udaipur"]) s = addIdea(s, RIYA_COORD, { destination_id: d, start_date: slots[4], days: 3 }, NOW).state;
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) project(s, { member: "P0", coordinator: true }, { now: NOW, groupLink: "x" });
    const ms = (performance.now() - t0) / 5;
    console.log(`projection for 12 people: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(250);
  });
});

describe("lifecycle", () => {
  test("withdrawing a yes removes it from the count", () => {
    const s = agreedRoom();
    const w = withdraw(s, as("Preethi"), NOW);
    expect(validYesCount(w)).toBe(4);
    expect(isAgreed(w)).toBe(false);
  });
  test("a closed room refuses answers and preference edits until reopened", () => {
    let s = demoSimulateFour(demoFillKaran(buildDemo("d", "h", NOW), NOW), NOW);
    s = setRoomStatus(s, RIYA_COORD, "closed", NOW);
    expect(code(() => respond(s, as("Karan"), { answer: "yes", confirm: true, ack_policy: true }, NOW))).toBe("room_not_open");
    expect(code(() => savePreferences(s, as("Karan"), { budget_max: 9000 }, NOW))).toBe("room_not_open");
    s = setRoomStatus(s, RIYA_COORD, "open", NOW);
    expect(isAgreed(respond(s, as("Karan"), { answer: "yes", confirm: true, ack_policy: true }, NOW))).toBe(true);
  });
  test("a member can't answer for the coordinator and vice versa", () => {
    const s: RoomState = demoFillKaran(buildDemo("d", "h", NOW), NOW);
    const r = respond(s, as("Karan"), { answer: "change" }, NOW);
    expect(r.responses.find((x) => x.member === "Riya")).toBeUndefined();
  });
});
