// Acceptance test 4 (PRD §18.4) plus the three demo stories (§14) at the logic level.
import { describe, expect, test } from "vitest";
import { extendDeadline, respond } from "../../lib/actions";
import { focusScore, isAgreed, validYesCount } from "../../lib/consent";
import { nextMove, recordOutcomeIfDue } from "../../lib/deadline";
import { buildDemo, demoFillKaran, demoReachDeadline, demoSimulateFour } from "../../lib/demo";
import { project } from "../../lib/projection";
import { NOW, RIYA_COORD, as, fourYesRoom, later } from "./fixtures";

describe("deadline outcome", () => {
  test("not recorded before the deadline", () => {
    expect(recordOutcomeIfDue(fourYesRoom(), NOW).recorded).toBeNull();
  });

  test("recorded exactly once per deadline", () => {
    const s = fourYesRoom();
    const after = new Date(new Date(s.room.deadline_at).getTime() + 60_000);
    const once = recordOutcomeIfDue(s, after);
    expect(once.recorded).toMatchObject({ result: "unresolved", valid_yes: 4, total: 5 });
    const twice = recordOutcomeIfDue(once.state, new Date(after.getTime() + 3600_000));
    expect(twice.recorded).toBeNull();
    expect(twice.state.outcomes).toHaveLength(1);
  });

  test("late yeses change the current state, not the record", () => {
    let s = demoFillKaran(fourYesRoom(), NOW);
    const after = new Date(new Date(s.room.deadline_at).getTime() + 60_000);
    s = recordOutcomeIfDue(s, after).state;
    s = respond(s, as("Karan"), { answer: "yes", confirm: true, ack_policy: true }, after);
    s = recordOutcomeIfDue(s, new Date(after.getTime() + 1000)).state;
    expect(isAgreed(s)).toBe(true);
    expect(s.outcomes).toHaveLength(1);
    expect(s.outcomes[0]).toMatchObject({ result: "unresolved", valid_yes: 4 });
  });

  test("extending keeps yeses and starts a new round with its own record", () => {
    let s = fourYesRoom();
    const past = new Date(new Date(s.room.deadline_at).getTime() + 60_000);
    s = extendDeadline(s, RIYA_COORD, new Date(past.getTime() + 86400_000).toISOString(), past);
    expect(s.outcomes).toHaveLength(1); // the replaced deadline was recorded first
    expect(validYesCount(s)).toBe(4);
    s = recordOutcomeIfDue(s, new Date(past.getTime() + 2 * 86400_000)).state;
    expect(s.outcomes).toHaveLength(2);
  });
});

describe("demo stories (logic level)", () => {
  test("Reset → Simulate four → Reach deadline ⇒ unresolved 4/5, next move: nudge Karan", () => {
    let s = buildDemo("d", "h", NOW);
    s = demoSimulateFour(s, NOW);
    s = demoReachDeadline(s, later(1));
    expect(s.outcomes.at(-1)).toMatchObject({ result: "unresolved", valid_yes: 4, total: 5 });
    expect(nextMove(s)).toEqual({ kind: "nudge", names: ["Karan"] });
  });

  test("Reset → Fill Karan → Simulate four → Karan says yes ⇒ Agreed for planning", () => {
    let s = buildDemo("d", "h", NOW);
    s = demoFillKaran(s, NOW);
    s = demoSimulateFour(s, NOW);
    s = respond(s, as("Karan"), { answer: "yes", confirm: true, ack_policy: true }, later(1));
    expect(isAgreed(s)).toBe(true);
    expect(nextMove(s).kind).toBe("announce");
  });

  test("the top-ranked idea has no Limit for any member once Karan is filled (seed acceptance)", () => {
    // Hold across the next few weeks of possible demo dates, not just today.
    for (let d = 0; d < 28; d++) {
      const now = new Date(NOW.getTime() + d * 86400_000);
      const s = demoFillKaran(buildDemo("d", "h", now), now);
      const f = focusScore(s)!;
      expect(f.counts.limit, `day +${d}: ${f.idea.name}`).toBe(0);
      expect(f.people.every((p) => p.status !== "check")).toBe(true);
    }
  });

  test("Try 3/5 ⇒ provisional comparison with Needs checking rows, never Fits", () => {
    const s = buildDemo("d", "h", NOW, "three");
    const v = project(s, { member: "Karan", coordinator: false }, { now: NOW, groupLink: "x" });
    expect(v.suggestionsReady).toBe(true);
    expect(v.ideas.length).toBeGreaterThanOrEqual(3);
    for (const i of v.ideas)
      for (const p of i.people.filter((x) => x.name === "Karan" || x.name === "Preethi")) expect(p.status).toBe("check");
  });
});
