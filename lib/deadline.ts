// Deadline lifecycle (PRD §10). No background jobs: on the first read or write after deadline_at, record the outcome
// once. The record never picks a winner and later answers never rewrite it.
import { answers, focusOption, focusScore, groupInput, isAgreed, validYesCount } from "./consent";
import { fixHints, ideaFromOption } from "./engine";
import type { Outcome, RoomState } from "./types";

export function isPastDeadline(s: RoomState, now: Date): boolean {
  return now.getTime() > new Date(s.room.deadline_at).getTime();
}

export function outcomeForCurrentDeadline(s: RoomState): Outcome | undefined {
  return s.outcomes.find((o) => o.deadline_at === s.room.deadline_at);
}

/** Returns a new state with the outcome recorded if the deadline has passed and none exists for it yet. */
export function recordOutcomeIfDue(s: RoomState, now: Date): { state: RoomState; recorded: Outcome | null } {
  if (s.room.status !== "open" || !isPastDeadline(s, now) || outcomeForCurrentDeadline(s)) return { state: s, recorded: null };
  const agreed = isAgreed(s);
  const outcome: Outcome = {
    room_id: s.room.id,
    deadline_at: s.room.deadline_at,
    focus_option_id: s.room.focus_option_id,
    valid_yes: validYesCount(s),
    total: s.members.length,
    result: agreed ? "agreed" : "unresolved",
    recorded_at: now.toISOString(),
  };
  return {
    state: {
      ...s,
      outcomes: [...s.outcomes, outcome],
      events: [
        ...s.events,
        { room_id: s.room.id, type: "deadline_outcome", member: null, meta: { result: outcome.result, valid_yes: outcome.valid_yes, total: outcome.total, focus_option_id: outcome.focus_option_id }, at: now.toISOString() },
      ],
    },
    recorded: outcome,
  };
}

export type NextMove =
  | { kind: "collect"; names: string[] }
  | { kind: "nudge"; names: string[] }
  | { kind: "variant"; member: string; hintText: string; variantName: string | null; chip: string | null }
  | { kind: "limit"; names: string[] }
  | { kind: "cannot"; names: string[] }
  | { kind: "announce" }
  | { kind: "past" }
  | { kind: "paused"; status: string }
  | { kind: "none" };

/** The single most useful next move, by rules (used by the Next-step card and after a deadline). */
export function nextMove(s: RoomState, today?: string): NextMove {
  const g = groupInput(s, today);
  const o = focusOption(s);
  if (s.room.status !== "open") return { kind: "paused", status: s.room.status };
  if (!o) {
    const missing = g.members.filter((m) => !s.prefs.find((p) => p.member === m)?.complete);
    return { kind: "collect", names: missing };
  }
  if (isAgreed(s)) return { kind: "announce" };
  if (today && o.start_date <= today) return { kind: "past" };
  const a = answers(s);
  const score = focusScore(s)!;
  const cannot = g.members.filter((m) => a.get(m)?.state === "cannot");
  if (cannot.length) return { kind: "cannot", names: cannot };
  const hints = fixHints(ideaFromOption(o), g);
  const changeAsks = g.members.filter((m) => a.get(m)?.state === "change");
  for (const m of changeAsks) {
    const chip = a.get(m)?.response?.reason_chip ?? null;
    const h = hints.find((x) => x.member === m);
    if (h && ["dates", "budget", "travel", null].includes(chip))
      return { kind: "variant", member: m, hintText: h.text, variantName: h.variantName ?? null, chip };
  }
  const limited = score.people.filter((p) => p.status === "limit").map((p) => p.member);
  for (const m of limited) {
    const h = hints.find((x) => x.member === m);
    if (h) return { kind: "variant", member: m, hintText: h.text, variantName: h.variantName ?? null, chip: null };
  }
  const waiting = g.members.filter((m) => {
    const st = a.get(m)?.state;
    return st === "none" || st === "reopened";
  });
  if (waiting.length) return { kind: "nudge", names: waiting };
  if (limited.length) return { kind: "limit", names: limited };
  if (changeAsks.length) return { kind: "nudge", names: changeAsks };
  return { kind: "none" };
}
