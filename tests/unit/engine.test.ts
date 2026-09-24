// Acceptance test 1 (PRD §18.1): the engine, including the randomized ≥500-group property test.
import { describe, expect, test } from "vitest";
import { DESTINATIONS, destinationById } from "../../lib/catalogue";
import {
  STATUS_RANK, applyHint, compareScores, fixHints, leaveNeeded, modelEstimate, personResult, pickDissimilar, scoreIdea,
  similar, slotLabel, suggest, travelOptions, tripSlots, type GroupInput, type Idea, type IdeaScore,
} from "../../lib/engine";
import type { Preferences } from "../../lib/types";
import { addDays, monthOf } from "../../lib/util";
import { randomPrefs, rng } from "./helpers";

const prefs = (p: Partial<Preferences>): Preferences => ({
  room_id: "t", member: "X", home_city: "bengaluru", budget_max: 20000, budget_comfortable: null, slots: ["2026-10-16"],
  vibes: [], wont_do: [], max_travel_hours: null, leave_days: null, note_private: null, parsed_limits: [], complete: true,
  updated_at: "", ...p,
});
const idea = (destId: string, start = "2026-10-16", days = 3): Idea => ({
  key: `t:${destId}`, source: "engine", destinationId: destId, name: destinationById(destId)!.name, start, days,
  activities: [], defaultEstimate: null, version: 1, stored: true,
});

describe("dates", () => {
  test("3-day trips start on Fridays, 2-day trips on Saturdays, capped at 20", () => {
    const f = tripSlots("2026-10-01", "2026-10-31", 3);
    expect(f).toEqual(["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"]);
    expect(tripSlots("2026-10-01", "2026-10-31", 2)).toEqual(["2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"]);
    expect(tripSlots("2026-01-01", "2026-12-31", 4)).toHaveLength(20);
  });
  test("labels and leave", () => {
    expect(slotLabel("2026-10-16", 3)).toBe("Fri 16 Oct – Sun 18 Oct");
    expect(leaveNeeded("2026-10-16", 3)).toBe(1); // Fri
    expect(leaveNeeded("2026-10-16", 4)).toBe(2); // Fri + Mon
    expect(leaveNeeded("2026-10-17", 2)).toBe(0); // Sat–Sun
  });
});

describe("travel & estimate formulas (PRD §7.2–7.3)", () => {
  test("short hops are road/train with a ₹400 floor; long ground is train/bus; flight formula", () => {
    const lonavala = destinationById("lonavala")!;
    const t = travelOptions("mumbai", lonavala);
    expect(t.ground!.mode).toBe("road/train");
    expect(t.ground!.cost[0]).toBeGreaterThanOrEqual(300); // 400 × 0.8 floor
    const goa = travelOptions("delhi", destinationById("goa")!);
    expect(goa.ground!.mode).toBe("train/bus");
    expect(goa.flight.hours).toBeGreaterThan(3);
    expect(travelOptions("delhi", destinationById("leh")!).ground).toBeNull(); // flightOnly
  });
  test("no-flights person with a flight-only place → Limit 'Needs a flight'", () => {
    const r = personResult("X", prefs({ wont_do: ["no_flights"] }), idea("havelock"));
    expect(r.status).toBe("limit");
    expect(r.reasons.map((x) => x.text)).toContain("Needs a flight");
  });
  test("estimate midpoint rounds to ₹500 and carries a dated basis", () => {
    const { estimate } = modelEstimate(prefs({ home_city: "delhi" }), destinationById("goa")!, 3);
    expect(estimate.mid % 500).toBe(0);
    expect(estimate.basis).toMatch(/Delhi NCR → North Goa by (flight|train\/bus) \(~\d+h each way\) \+ 3 days stay\/food\/local · est\. 23 Sep 2026/);
  });
  test("comfortable vs max (Learnings example: 13k comfortable, 15k max)", () => {
    const base = { ...idea("hampi"), destinationId: null, defaultEstimate: 14000 };
    const p = prefs({ budget_max: 15000, budget_comfortable: 13000 });
    expect(personResult("X", p, base).status).toBe("compromise");
    expect(personResult("X", p, { ...base, defaultEstimate: 16000 }).status).toBe("limit");
  });
  test("a person's correction replaces the whole total", () => {
    const p = prefs({ budget_max: 10000 });
    const i = idea("goa");
    const corr = { room_id: "t", option_id: i.key, member: "X", total: 9000, basis: "IndiGo + hostel", checked_on: "2026-09-23", option_version: 1, cost_version: 1, stale: false, active: true };
    const r = personResult("X", p, i, corr);
    expect(r.estimate!.mid).toBe(9000);
    expect(r.estimate!.kind).toBe("correction");
    const stale = personResult("X", p, { ...i, version: 2 }, corr);
    expect(stale.status).toBe("check");
  });
});

// ------------------------------------------------------------------------------------------ randomized property test

const WONT_DO_HIT = (w: string, i: Idea) => {
  const d = destinationById(i.destinationId)!;
  const m = monthOf(i.start);
  return (
    (w === "no_trek" && !!d.trek) || (w === "no_beach" && d.tags.includes("beach")) || (w === "no_party" && !!d.party) ||
    (w === "no_crowds" && !!d.crowded) || (w === "no_cold" && !!d.coldMonths?.includes(m))
  );
};

/** Independent re-statement of §7.5 as a sort key. */
const sortKey = (s: IdeaScore) => [
  STATUS_RANK[s.worst], s.counts.limit, s.counts.check, s.counts.compromise, -s.vibeTotal, Number(s.offSeason), s.idea.start,
];
const cmpKey = (a: (number | string)[], b: (number | string)[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
};

describe("randomized engine properties (500 groups)", () => {
  const GROUPS = 500;
  test(`invariants hold for ${GROUPS} random groups`, () => {
    const r = rng(20260923);
    let checkedPeople = 0;
    let hintsChecked = 0;
    let dissimilarChecked = 0;
    for (let gi = 0; gi < GROUPS; gi++) {
      const days = r.int(2, 5);
      const start = addDays("2026-09-24", r.int(0, 200));
      const slots = tripSlots(start, addDays(start, r.int(7, 120)), days);
      if (!slots.length) continue;
      const members = Array.from({ length: r.int(2, 8) }, (_, i) => `M${i}`);
      const map = new Map<string, Preferences>();
      for (const m of members) {
        const p = randomPrefs(r, m, slots);
        if (p) map.set(m, p);
      }
      const g: GroupInput = { members, prefs: map, tripDays: days, slots };
      const { top, all } = suggest(g);

      // Per-person invariants over every scored idea
      for (const sc of all) {
        for (const pr of sc.people) {
          checkedPeople++;
          const p = map.get(pr.member);
          // an unknown is never "Fits"
          if (!p || !p.complete || !p.home_city || p.budget_max == null) expect(pr.status).not.toBe("fits");
          if (!p) continue;
          // over max is always Limit
          if (p.budget_max != null && pr.estimate && pr.estimate.mid > p.budget_max) expect(pr.status).toBe("limit");
          // an unticked slot is always Limit (complete preferences)
          if (p.complete && !p.slots.includes(sc.idea.start)) expect(pr.status).toBe("limit");
          // a won't-do hit is always Limit
          if (p.wont_do.some((w) => WONT_DO_HIT(w, sc.idea))) expect(pr.status).toBe("limit");
          // status is the worst reason; "fits" only with no reasons
          if (pr.status === "fits") expect(pr.reasons).toHaveLength(0);
        }
      }

      // ordering obeys §7.5
      for (let i = 1; i < all.length; i++) expect(cmpKey(sortKey(all[i - 1]), sortKey(all[i]))).toBeLessThanOrEqual(0);
      for (let i = 1; i < top.length; i++) expect(compareScores(top[i - 1], top[i])).toBeLessThanOrEqual(0);

      // 3 unique, dissimilar ideas when possible
      expect(new Set(top.map((t) => t.idea.key)).size).toBe(top.length);
      expect(top.length).toBe(Math.min(3, all.length));
      for (let i = 0; i < top.length; i++)
        for (let j = i + 1; j < top.length; j++) {
          if (!similar(top[i], top[j])) continue;
          dissimilarChecked++;
          const later = top[j];
          const others = top.filter((t) => t !== later);
          const alternative = all.find(
            (d) => !top.includes(d) && STATUS_RANK[d.worst] <= STATUS_RANK[later.worst] && !others.some((o) => similar(o, d)),
          );
          expect(alternative, "a comparable dissimilar idea existed").toBeUndefined();
        }

      // every displayed fix hint re-scores true
      const focus = top[0] ?? all[0];
      if (focus) {
        for (const h of fixHints(focus.idea, g)) {
          hintsChecked++;
          const after = applyHint(focus.idea, g, h);
          expect(after.people.find((p) => p.member === h.member)!.status).not.toBe("limit");
          const before = scoreIdea(focus.idea, g);
          const newly = after.people
            .filter((p) => p.member !== h.member && p.status === "limit" && before.people.find((b) => b.member === p.member)!.status !== "limit")
            .map((p) => p.member);
          expect(h.newlyLimited).toEqual(newly);
        }
      }
    }
    expect(checkedPeople).toBeGreaterThan(10000);
    expect(hintsChecked).toBeGreaterThan(50);
    console.log(`engine property test: ${GROUPS} groups, ${checkedPeople} person-checks, ${hintsChecked} hints verified, ${dissimilarChecked} similar pairs justified`);
  }, 60_000);

  test("pickDissimilar skips a near-duplicate when a comparable alternative exists", () => {
    const g: GroupInput = { members: ["A"], prefs: new Map([["A", prefs({ member: "A", slots: ["2026-10-16"], budget_max: 99000 })]]), tripDays: 3, slots: ["2026-10-16"] };
    const scores = ["lonavala", "mahabaleshwar", "hampi", "udaipur"].map((d) => scoreIdea(idea(d), g)).sort(compareScores);
    const picked = pickDissimilar(scores, 3).map((p) => p.idea.destinationId);
    expect(picked).not.toEqual(expect.arrayContaining(["lonavala", "mahabaleshwar"]));
  });

  test("every catalogue destination is well-formed", () => {
    for (const d of DESTINATIONS) {
      expect(d.dayCost[0]).toBeLessThan(d.dayCost[1]);
      expect(d.tags.length).toBeGreaterThan(0);
    }
  });
});
