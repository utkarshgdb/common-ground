// Versioned approvals (PRD §8). Pure: derives whether each member's answer still counts for the current terms.
// A yes is valid only if focus_id, option_version, pref_version and cost_version all still match AND the member
// has no "Limit not met" or "Needs checking" on the focused idea. Agreed = a valid yes from every member.
import { ideaFromOption, scoreIdea, tripSlots, type GroupInput, type IdeaScore, type PersonResult } from "./engine";
import type { Preferences, ResponseRow, RoomState, TripOption } from "./types";

export function groupInput(s: RoomState): GroupInput {
  const members = [...s.members].sort((a, b) => a.position - b.position).map((m) => m.name);
  return {
    members,
    prefs: new Map(s.prefs.map((p) => [p.member, p] as [string, Preferences])),
    corrections: s.corrections,
    tripDays: s.room.trip_days,
    slots: tripSlots(s.room.window_start, s.room.window_end, s.room.trip_days),
  };
}

export const focusOption = (s: RoomState): TripOption | null =>
  s.options.find((o) => o.id === s.room.focus_option_id && !o.archived) ?? null;

export function focusScore(s: RoomState): IdeaScore | null {
  const o = focusOption(s);
  return o ? scoreIdea(ideaFromOption(o), groupInput(s)) : null;
}

/** Counts every correction or removal a member made on an option; 0 if never corrected. */
export function costVersion(s: RoomState, member: string, optionId: string): number {
  return s.corrections.find((c) => c.member === member && c.option_id === optionId)?.cost_version ?? 0;
}

export function currentVersions(s: RoomState, member: string) {
  const o = focusOption(s);
  const m = s.members.find((x) => x.name === member);
  return {
    focus_id: s.room.focus_id,
    option_id: o?.id ?? null,
    option_version: o?.version ?? 0,
    pref_version: m?.pref_version ?? 0,
    cost_version: o ? costVersion(s, member, o.id) : 0,
  };
}

export type AnswerState = "none" | "yes" | "reopened" | "change" | "cannot";

export type AnswerInfo = {
  state: AnswerState;
  validYes: boolean;
  response: ResponseRow | null;
  reopenReason: string | null;
  /** A non-yes answer given to earlier terms of this idea (dates/days changed since). */
  outdated: boolean;
};

/** The member's answer for the current focus, and whether it still counts. */
export function answerFor(s: RoomState, member: string, person?: PersonResult | null): AnswerInfo {
  const none: AnswerInfo = { state: "none", validYes: false, response: null, reopenReason: null, outdated: false };
  const o = focusOption(s);
  if (!o) return none;
  const r = s.responses.find((x) => x.member === member && x.focus_id === s.room.focus_id && x.option_id === o.id);
  if (!r) return none;
  const cur = currentVersions(s, member);
  if (r.answer !== "yes") {
    if (r.option_version !== cur.option_version) return { ...none, response: r, outdated: true };
    return { state: r.answer, validYes: false, response: r, reopenReason: null, outdated: false };
  }
  let reopenReason: string | null = null;
  if (r.option_version !== cur.option_version) reopenReason = "The trip's dates or terms changed";
  else if (r.pref_version !== cur.pref_version) reopenReason = "Preferences were edited";
  else if (r.cost_version !== cur.cost_version) reopenReason = "The personal estimate changed";
  else {
    const p = person ?? focusScore(s)?.people.find((x) => x.member === member);
    if (!p || p.status === "limit" || p.status === "check")
      reopenReason = p?.status === "limit" ? "A limit is no longer met" : "Something needs checking again";
  }
  if (reopenReason) return { state: "reopened", validYes: false, response: r, reopenReason, outdated: false };
  return { state: "yes", validYes: true, response: r, reopenReason: null, outdated: false };
}

export function answers(s: RoomState): Map<string, AnswerInfo> {
  const score = focusScore(s);
  return new Map(
    groupInput(s).members.map((m) => [m, answerFor(s, m, score?.people.find((p) => p.member === m) ?? null)]),
  );
}

export function validYesCount(s: RoomState): number {
  return [...answers(s).values()].filter((a) => a.validYes).length;
}

/** "Agreed for planning": a focused idea and a valid current yes from every member. Nothing else counts. */
export function isAgreed(s: RoomState): boolean {
  if (!focusOption(s) || s.members.length === 0) return false;
  const a = answers(s);
  return s.members.every((m) => a.get(m.name)?.validYes === true);
}

export type MemberState =
  | "Preferences incomplete"
  | "Ready to respond"
  | "Agreed"
  | "Needs a change"
  | "Can't join"
  | "Reopened";

export function memberState(s: RoomState, member: string, info?: AnswerInfo): MemberState {
  const a = info ?? answerFor(s, member);
  if (a.state === "yes") return "Agreed";
  if (a.state === "reopened") return "Reopened";
  if (a.state === "change") return "Needs a change";
  if (a.state === "cannot") return "Can't join";
  const p = s.prefs.find((x) => x.member === member);
  return p?.complete ? "Ready to respond" : "Preferences incomplete";
}
