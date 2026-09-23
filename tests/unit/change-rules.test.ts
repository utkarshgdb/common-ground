// Acceptance test 3 (PRD §18.3): one test per change rule in §8.2.
import { describe, expect, test } from "vitest";
import { addIdea, correctEstimate, editIdea, extendDeadline, removeIdea, savePreferences, setFocus } from "../../lib/actions";
import { answerFor, answers, validYesCount } from "../../lib/consent";
import { karanPrefs } from "../../lib/demo";
import { tripSlots } from "../../lib/engine";
import type { RoomState } from "../../lib/types";
import { NOW, RIYA_COORD, agreedRoom, as, focusId, later } from "./fixtures";

const reopened = (s: RoomState) => [...answers(s).entries()].filter(([, a]) => a.state === "reopened").map(([m]) => m);
const slots = (s: RoomState) => tripSlots(s.room.window_start, s.room.window_end, s.room.trip_days);

function withCustomIdea() {
  const s = agreedRoom();
  return addIdea(s, RIYA_COORD, { destination_id: "coorg", start_date: slots(s)[3], days: 3 }, NOW);
}

describe("rule 1: add / edit / remove a non-focused idea → nothing reopens", () => {
  test("add", () => {
    const { state } = withCustomIdea();
    expect(validYesCount(state)).toBe(5);
  });
  test("edit a non-focused idea → 0 reopened", () => {
    const { state, id } = withCustomIdea();
    const e = editIdea(state, RIYA_COORD, id, { start_date: slots(state)[4], days: 2 }, later(1));
    expect(e.options.find((o) => o.id === id)!.version).toBe(2);
    expect(reopened(e)).toEqual([]);
    expect(validYesCount(e)).toBe(5);
  });
  test("remove a non-focused idea", () => {
    const { state, id } = withCustomIdea();
    expect(validYesCount(removeIdea(state, RIYA_COORD, id, later(1)))).toBe(5);
  });
});

describe("rule 2: change the focused idea's shared terms → all yeses reopen, corrections go stale", () => {
  test("dates change", () => {
    let s = agreedRoom();
    s = correctEstimate(s, as("Aisha"), focusId(s), { total: 14000, basis: "IndiGo BOM–HBX + homestay", checked_on: "2026-09-23", confirm: true }, NOW);
    const e = editIdea(s, RIYA_COORD, focusId(s), { start_date: slots(s)[4] }, later(1));
    expect(e.options.find((o) => o.id === focusId(s))!.version).toBe(2);
    expect(validYesCount(e)).toBe(0);
    expect(answerFor(e, "Riya").reopenReason).toMatch(/terms changed/);
    expect(e.corrections.find((c) => c.member === "Aisha")!.stale).toBe(true);
    expect(e.events.some((x) => x.type === "reopened")).toBe(true);
  });
  test("days change reopens; renaming alone does not", () => {
    const s = agreedRoom();
    expect(validYesCount(editIdea(s, RIYA_COORD, focusId(s), { days: 2 }, later(1)))).toBe(0);
    expect(validYesCount(editIdea(s, RIYA_COORD, focusId(s), { name: "Hampi ruins" }, later(1)))).toBe(5);
  });
  test("saving identical terms changes nothing", () => {
    const s = agreedRoom();
    const o = s.options.find((x) => x.id === focusId(s))!;
    const e = editIdea(s, RIYA_COORD, o.id, { start_date: o.start_date, days: o.days }, later(1));
    expect(e).toBe(s);
  });
});

describe("rule 3: a member's own edit reopens only that member's yes", () => {
  test("my preference edit → only my yes reopens", () => {
    const s = agreedRoom();
    const e = savePreferences(s, as("Aisha"), { vibes: ["relaxed", "food"] }, later(1)).state;
    expect(reopened(e)).toEqual(["Aisha"]);
    expect(validYesCount(e)).toBe(4);
    expect(answerFor(e, "Aisha").reopenReason).toBe("Preferences were edited");
  });
  test("my estimate correction → only my yes reopens", () => {
    const s = agreedRoom();
    const e = correctEstimate(s, as("Preethi"), focusId(s), { total: 13000, basis: "Train MAS–HPT + dorm", checked_on: "2026-09-23", confirm: true }, later(1));
    expect(reopened(e)).toEqual(["Preethi"]);
    expect(answerFor(e, "Preethi").reopenReason).toBe("The personal estimate changed");
  });
  test("saving identical values = no change", () => {
    const s = agreedRoom();
    const r = savePreferences(s, as("Karan"), karanPrefs(s), later(1));
    expect(r.changed).toBe(false);
    expect(validYesCount(r.state)).toBe(5);
  });
  test("editing only the private note doesn't reopen", () => {
    const s = agreedRoom();
    const r = savePreferences(s, as("Siddharth"), { note_private: "Actually Goa four times" }, later(1));
    expect(r.changed).toBe(true);
    expect(validYesCount(r.state)).toBe(5);
  });
});

describe("rule 4: switch focus → fresh answers; old answers kept", () => {
  test("switch and switch back", () => {
    const s = agreedRoom();
    const old = focusId(s);
    const oldFocusId = s.room.focus_id;
    const sw = setFocus(s, RIYA_COORD, `eng:coorg:${slots(s)[2]}:3`, later(1));
    expect(sw.room.focus_id).toBe(oldFocusId + 1);
    expect(validYesCount(sw)).toBe(0);
    expect(sw.responses).toHaveLength(s.responses.length); // history kept
    const back = setFocus(sw, RIYA_COORD, old, later(2));
    expect(back.room.focus_id).toBe(oldFocusId + 2);
    expect(validYesCount(back)).toBe(0); // answers are per focus round, so they start fresh
  });
});

test("extending the deadline keeps valid yeses", () => {
  const s = agreedRoom();
  expect(validYesCount(extendDeadline(s, RIYA_COORD, later(60 * 24 * 7).toISOString(), later(1)))).toBe(5);
});
