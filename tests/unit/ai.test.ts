// P1 guardrails: Gemini only words and reads; its output is validated and never decides. Uses a mocked fetch.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createVariant, sanitizeParsed, savePreferences, setFocus } from "../../lib/actions";
import { acceptNextStep, acceptParsed, geminiNextStep, geminiSketch, nextStepInput, sketchViolations } from "../../lib/ai";
import { focusOption, validYesCount } from "../../lib/consent";
import { buildDemo, demoFillKaran, demoSimulateFour } from "../../lib/demo";
import { rulesNextStep, type DraftContext } from "../../lib/drafts";
import { nextMove } from "../../lib/deadline";
import { personResult, seasonLine, tripSlots, type Idea } from "../../lib/engine";
import type { RoomState } from "../../lib/types";
import { NOW, RIYA_COORD, agreedRoom, as } from "./fixtures";

const ctx = (s: RoomState): DraftContext => {
  const o = focusOption(s);
  return { roomName: s.room.name, groupLink: "https://cg.test/room/x", deadlineAt: s.room.deadline_at, focus: o ? { name: o.name, start: o.start_date, days: o.days } : null, validYes: validYesCount(s), total: 5, complete: 4, me: "Riya" };
};
const geminiReply = (obj: unknown) =>
  vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 }));

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
});
afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  vi.unstubAllGlobals();
});

describe("P1-1 next step", () => {
  test("the input sent to Gemini is anonymous: no names, budgets, notes or amounts", () => {
    const s = demoSimulateFour(demoFillKaran(buildDemo("d", "h", NOW), NOW), NOW);
    const json = JSON.stringify(nextStepInput(s, NOW));
    for (const n of ["Riya", "Siddharth", "Karan", "Aisha", "Preethi", "Goa three", "18000", "25000", "hyderabad", "Hampi"]) expect(json).not.toContain(n);
    expect(json).toContain('"slot":"A"');
  });

  test("valid wording is accepted and placeholders are filled server-side", () => {
    const s = buildDemo("d", "h", NOW);
    const fb = rulesNextStep(nextMove(s), ctx(s));
    const out = acceptNextStep({ summary: "Four of five are in.", question: "Nudge {C}?", whatsapp_draft: "{C}, can this work for you? {LINK}" }, ["Riya", "Siddharth", "Karan"], "https://cg.test/room/x", fb)!;
    expect(out.question).toBe("Nudge Karan?");
    expect(out.whatsapp).toBe("Karan, can this work for you? https://cg.test/room/x");
    expect(out.action).toBe(fb.action); // the rules still own the action
    expect(out.source).toBe("gemini");
  });

  test("amounts, unknown placeholders or empty fields are rejected", () => {
    const fb = rulesNextStep({ kind: "none" }, ctx(buildDemo("d", "h", NOW)));
    const names = ["Riya", "Karan"];
    expect(acceptNextStep({ summary: "It costs ₹14,000", question: "q", whatsapp_draft: "w" }, names, "L", fb)).toBeNull();
    expect(acceptNextStep({ summary: "s", question: "Ask {E}", whatsapp_draft: "w" }, names, "L", fb)).toBeNull();
    expect(acceptNextStep({ summary: "", question: "q", whatsapp_draft: "w" }, names, "L", fb)).toBeNull();
    expect(acceptNextStep({ summary: "s", question: "q", whatsapp_draft: "about 15000 each" }, names, "L", fb)).toBeNull();
  });

  test("no key → labelled rules fallback; bad output → rules; good output → Gemini wording", async () => {
    const s = demoSimulateFour(buildDemo("d", "h", NOW), NOW);
    delete process.env.GEMINI_API_KEY;
    expect((await geminiNextStep(s, ctx(s), NOW)).source).toBe("rules");
    process.env.GEMINI_API_KEY = "k";
    vi.stubGlobal("fetch", geminiReply({ summary: "Spend ₹9,000", question: "q", whatsapp_draft: "w" }));
    expect((await geminiNextStep(s, ctx(s), NOW)).source).toBe("rules");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    expect((await geminiNextStep({ ...s, room: { ...s.room, deadline_at: new Date(NOW.getTime() + 86400_000).toISOString() } }, ctx(s), NOW)).source).toBe("rules");
    vi.stubGlobal("fetch", geminiReply({ summary: "Four are in; {C} hasn't answered.", question: "Remind {C}?", whatsapp_draft: "{C}, one tap: {LINK}" }));
    const s2 = { ...s, room: { ...s.room, deadline_at: new Date(NOW.getTime() + 2 * 86400_000).toISOString() } };
    const r = await geminiNextStep(s2, ctx(s2), NOW);
    expect(r.source).toBe("gemini");
    expect(r.question).toBe("Remind Karan?");
  });
});

describe("P1-3 sketch", () => {
  test("keyword validator catches won't-do violations and prices", () => {
    expect(sketchViolations({ arrive: "Check in", main: "Sunrise trek to the summit", leave: "Head home" }, ["no_trek"])).toEqual(["no_trek"]);
    expect(sketchViolations({ arrive: "Beach shacks", main: "Swim", leave: "Home" }, ["no_party"])).toEqual([]);
    expect(sketchViolations({ arrive: "Arrive", main: "Pub crawl", leave: "Rs 500 cab" }, ["no_party"])).toEqual(["no_party", "price"]);
  });
  test("regenerates once, then drops", async () => {
    const s = demoFillKaran(buildDemo("d", "h", NOW), NOW); // Aisha: no treks
    const bad = { arrive: "Arrive", main: "Trek up Matanga hill", leave: "Leave" };
    const good = { arrive: "Arrive and settle in", main: "Cycle among the ruins", leave: "Slow breakfast, head home" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(bad) }] } }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(good) }] } }] })));
    vi.stubGlobal("fetch", fetchMock);
    expect((await geminiSketch(s)).sketch).toEqual(good);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const s2 = { ...s, options: s.options.map((o) => ({ ...o, version: 9 })) }; // new fingerprint
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(bad) }] } }] }))));
    expect((await geminiSketch(s2)).sketch).toBeNull();
  });
});

describe("P1-2 note → limits", () => {
  const slots = ["2026-10-09", "2026-10-16"];
  test("only allow-listed, in-range items survive; nothing is pre-confirmed", () => {
    const out = acceptParsed({ items: [
      { kind: "max_leave_days", number: 1 },
      { kind: "max_travel_hours", number: 400 }, // out of range
      { kind: "add_wont_do", wont_do: "no_beach" },
      { kind: "add_wont_do", wont_do: "no_everything" }, // not allow-listed
      { kind: "unavailable_slots", slots: ["2026-10-16", "2030-01-01"] },
      { kind: "set_budget", number: 1 }, // not allow-listed
      { kind: "info_only", text: "Vegetarian" },
    ] }, slots, "note");
    expect(out).toEqual([
      { kind: "max_leave_days", value: 1, confirmed: false },
      { kind: "add_wont_do", value: "no_beach", confirmed: false },
      { kind: "unavailable_slots", value: ["2026-10-16"], confirmed: false },
      { kind: "info_only", value: "Vegetarian", confirmed: false },
    ]);
  });
  test("server sanitises client-sent parsed limits", () => {
    expect(sanitizeParsed([{ kind: "max_leave_days", value: 99, confirmed: true }, { kind: "hack", value: 1 }, { kind: "add_wont_do", value: "no_trek", confirmed: true }], slots))
      .toEqual([{ kind: "add_wont_do", value: "no_trek", confirmed: true }]);
  });
  test("only confirmed items count as limits", () => {
    const idea: Idea = { key: "k", source: "engine", destinationId: "gokarna", name: "Gokarna", start: "2026-10-16", days: 3, activities: [], defaultEstimate: null, version: 1, stored: true };
    const base = { member: "X", home_city: "bengaluru", budget_max: 30000, budget_comfortable: null, slots, vibes: [], wont_do: [], max_travel_hours: null, leave_days: null, complete: true };
    const unconfirmed = personResult("X", { ...base, parsed_limits: [{ kind: "add_wont_do", value: "no_beach", confirmed: false }] }, idea);
    expect(unconfirmed.status).not.toBe("limit");
    const confirmed = personResult("X", { ...base, parsed_limits: [{ kind: "add_wont_do", value: "no_beach", confirmed: true }] }, idea);
    expect(confirmed.status).toBe("limit");
    const slot = personResult("X", { ...base, parsed_limits: [{ kind: "unavailable_slots", value: ["2026-10-16"], confirmed: true }] }, idea);
    expect(slot.reasons.map((r) => r.text)).toContain("Not free Fri 16 Oct");
  });
  test("confirming a note limit reopens only that member's yes (rule 3)", () => {
    const s = agreedRoom();
    const e = savePreferences(s, as("Karan"), { note_private: "Max 1 day leave", parsed_limits: [{ kind: "info_only", value: "x", confirmed: false }] }, NOW).state;
    expect(validYesCount(e)).toBe(4);
  });
});

describe("P1-4 variant from a fix hint", () => {
  test("creates a verified variant; nothing reopens", () => {
    let s = demoSimulateFour(demoFillKaran(buildDemo("d", "h", NOW), NOW), NOW);
    const slots = tripSlots(s.room.window_start, s.room.window_end, s.room.trip_days);
    s = setFocus(s, RIYA_COORD, `eng:hampi:${slots[5]}:3`, NOW); // Aisha isn't free on slot 5
    s = demoSimulateFour(s, NOW);
    const before = validYesCount(s);
    const { state, id } = createVariant(s, RIYA_COORD, "Aisha", NOW);
    const v = state.options.find((o) => o.id === id)!;
    expect(v.source).toBe("variant");
    expect(v.start_date).not.toBe(slots[5]);
    expect(validYesCount(state)).toBe(before);
    expect(() => createVariant(s, as("Karan"), "Aisha", NOW)).toThrow();
  });
});

test("P1-5 season line comes from catalogue data", () => {
  expect(seasonLine("goa", "2026-07-10")).toMatch(/July is off-season here: monsoon/);
  expect(seasonLine("manali", "2026-12-04")).toMatch(/December is cold here/);
  expect(seasonLine("hampi", "2026-10-09")).toMatch(/October is usually a good time/);
  expect(seasonLine(null, "2026-10-09")).toBeNull();
});
