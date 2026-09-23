// Acceptance test 2 (PRD §18.2): "Agreed for planning" only with valid current yeses from all members.
import { describe, expect, test } from "vitest";
import { ActionError, editIdea, extendDeadline, respond, savePreferences, setFocus } from "../../lib/actions";
import { answerFor, isAgreed, validYesCount } from "../../lib/consent";
import { buildDemo, demoFillKaran, demoSimulateFour } from "../../lib/demo";
import type { RoomState } from "../../lib/types";
import { NOW, RIYA_COORD, agreedRoom, as, focusId, fourYesRoom, later } from "./fixtures";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as ActionError).code;
  }
  return "no error";
};

describe("consent", () => {
  test("five valid current yeses → agreed", () => {
    const s = agreedRoom();
    expect(validYesCount(s)).toBe(5);
    expect(isAgreed(s)).toBe(true);
  });

  test("silence is not a yes", () => {
    const s = demoSimulateFour(demoFillKaran(buildDemo("r", "h", NOW), NOW), NOW);
    expect(validYesCount(s)).toBe(4);
    expect(isAgreed(s)).toBe(false);
    expect(answerFor(s, "Karan").state).toBe("none");
  });

  test("a member without preferences (Needs checking) can't say yes and blocks agreement", () => {
    const s = fourYesRoom();
    expect(code(() => respond(s, as("Karan"), { answer: "yes", confirm: true, ack_policy: true }, NOW))).toBe("blocked");
    expect(isAgreed(s)).toBe(false);
  });

  test("a yes row for a member who now has a Limit / Needs checking doesn't count", () => {
    const s = fourYesRoom();
    const forged: RoomState = {
      ...s,
      responses: [...s.responses, { room_id: s.room.id, member: "Karan", focus_id: s.room.focus_id, option_id: focusId(s), option_version: 1, pref_version: 0, cost_version: 0, answer: "yes", reason_chip: null, note_shared: null, at: NOW.toISOString() }],
    };
    expect(answerFor(forged, "Karan").validYes).toBe(false);
    expect(isAgreed(forged)).toBe(false);
  });

  test("a stale version doesn't count", () => {
    const s = agreedRoom();
    const edited = savePreferences(s, as("Siddharth"), { vibes: ["mountains", "adventure"] }, later(1)).state;
    expect(answerFor(edited, "Siddharth").state).toBe("reopened");
    expect(isAgreed(edited)).toBe(false);
  });

  test("a missing member (not in the room) never counts, and the coordinator can't answer for anyone", () => {
    const s = fourYesRoom();
    const k = demoFillKaran(s, NOW);
    // The coordinator answering records only her own answer.
    const r = respond(k, RIYA_COORD, { answer: "yes", confirm: true }, later(1));
    expect(answerFor(r, "Karan").state).toBe("none");
    expect(isAgreed(r)).toBe(false);
    // A coordinator token with no member name can't answer at all.
    expect(code(() => respond(k, { member: null, coordinator: true }, { answer: "yes", confirm: true }, NOW))).toBe("not_member");
    expect(code(() => respond(k, { member: "Stranger", coordinator: false }, { answer: "yes", confirm: true }, NOW))).toBe("not_member");
  });

  test("no coordinator action supplies a yes", () => {
    let s = demoFillKaran(fourYesRoom(), NOW);
    s = extendDeadline(s, RIYA_COORD, later(60 * 24 * 5).toISOString(), NOW);
    s = editIdea(s, RIYA_COORD, focusId(s), { name: "Hampi (boulders & ruins)" }, NOW);
    expect(validYesCount(s)).toBe(4);
    expect(isAgreed(s)).toBe(false);
    s = setFocus(s, RIYA_COORD, "eng:mahabaleshwar:" + s.options[0].start_date + ":3", NOW);
    expect(validYesCount(s)).toBe(0);
    expect(isAgreed(s)).toBe(false);
  });

  test("a yes needs the policy acknowledgement and the confirmation tick", () => {
    const s = demoFillKaran(fourYesRoom(), NOW);
    expect(code(() => respond(s, as("Karan"), { answer: "yes", confirm: true }, NOW))).toBe("policy");
    expect(code(() => respond(s, as("Karan"), { answer: "yes", ack_policy: true }, NOW))).toBe("confirm");
  });

  test("'Needs a change' and 'Can't join' need no reason; anyone can change or withdraw", () => {
    let s = agreedRoom();
    s = respond(s, as("Aisha"), { answer: "change" }, later(1));
    expect(answerFor(s, "Aisha").state).toBe("change");
    expect(isAgreed(s)).toBe(false);
    s = respond(s, as("Aisha"), { answer: "yes", confirm: true }, later(2));
    expect(isAgreed(s)).toBe(true);
  });
});
