// Per-viewer projection (PRD §13). The ONLY shape that leaves the server for a room. Other members' raw budgets,
// private notes, date lists, estimates, home cities and correction bases are never included; others appear only as
// status labels, answers and what they chose to share.
import { cityById, destinationById, wontDoLabel } from "./catalogue";
import { answers, focusOption, groupInput, isAgreed, memberState, validYesCount, type AnswerState, type MemberState } from "./consent";
import { nextMove, outcomeForCurrentDeadline, isPastDeadline } from "./deadline";
import { rulesNextStep, reminderFor, groupUpdate, announcement, waLink, type NextStep, type DraftContext } from "./drafts";
import {
  ORDERING_RULE, STATUS_LABEL, fixHints, ideaFromOption, leaveLabel, leaveNeeded, scoreIdea, slotLabel, suggest,
  type Estimate, type FixHint, type IdeaScore, type Reason, type Status,
} from "./engine";
import { POLICY_TEXT, REASON_CHIPS } from "./actions";
import type { Outcome, Preferences, RoomState } from "./types";
import { formatIST, shortDate } from "./util";

export type Viewer = { member: string | null; coordinator: boolean };

export type PersonOnIdea = { name: string; status: Status | null; statusLabel: string | null; answer: AnswerState | null; outdated?: boolean };

export type MyFit = {
  status: Status;
  statusLabel: string;
  reasons: Reason[];
  estimate: Estimate | null;
  modelEstimate: Estimate | null;
  correction: { total: number; basis: string; checked_on: string; stale: boolean } | null;
  hints: FixHint[];
  journeyUrl: string | null;
  budget: { max: number | null; comfortable: number | null };
};

export type IdeaView = {
  key: string;
  stored: boolean;
  source: string;
  name: string;
  destinationId: string | null;
  place: string | null;
  tags: string[];
  start: string;
  days: number;
  dates: string;
  leave: string;
  offSeason: boolean;
  offReason: string | null;
  isFocus: boolean;
  version: number;
  activities: string[];
  sharedAssumptions: string | null;
  defaultEstimate: number | null;
  counts: Record<Status, number>;
  worst: Status;
  people: PersonOnIdea[];
  mine: MyFit | null;
};

export type PersonView = {
  name: string;
  joined: boolean;
  isCoordinator: boolean;
  isMe: boolean;
  state: MemberState;
  answer: AnswerState;
  reopenReason: string | null;
  reasonChip: string | null;
  noteShared: string | null;
  statusOnFocus: Status | null;
  statusLabel: string | null;
};

export type HistoryItem = { at: string; text: string };

export type RoomView = {
  room: {
    id: string; name: string; tripDays: number; windowStart: string; windowEnd: string; deadlineAt: string; deadlineLabel: string;
    status: string; coordinator: string; isDemo: boolean; focusId: number;
  };
  viewer: { name: string | null; coordinator: boolean; policyAcked: boolean };
  policy: string;
  privacyNote: string;
  slots: { start: string; label: string; leave: string }[];
  people: PersonView[];
  counts: { complete: number; validYes: number; total: number };
  agreed: boolean;
  focus: IdeaView | null;
  ideas: IdeaView[];
  orderingRule: string;
  suggestionsReady: boolean;
  me: { prefs: Omit<Preferences, "room_id"> | null } | null;
  deadline: { passed: boolean; outcome: Outcome | null };
  outcomes: Outcome[];
  history: HistoryItem[];
  coordinator: CoordinatorView | null;
  reasonChips: typeof REASON_CHIPS;
};

export type CoordinatorView = {
  nextStep: NextStep;
  hints: FixHint[];
  drafts: { invite: string; update: string; announcement: string | null; reminders: { name: string; text: string; url: string }[] };
  inviteUrl: string;
  updateUrl: string;
};

const PRIVACY_NOTE =
  "Your budget, dates and notes stay private: others see only a status label and your answer. Fit labels against a known estimate can hint at someone's budget range, and a date fix hint can show that someone isn't free on one date.";

function journeyUrl(prefs: Preferences | undefined, destId: string | null): string | null {
  const city = cityById(prefs?.home_city);
  const dest = destinationById(destId);
  if (!city || !dest) return null;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(city.name)}&destination=${encodeURIComponent(dest.name + ", " + dest.state)}&travelmode=transit`;
}

export function project(s: RoomState, viewer: Viewer, opts: { now: Date; groupLink: string; stepOverride?: NextStep | null }): RoomView {
  const g = groupInput(s);
  const me = viewer.member ? s.members.find((m) => m.name === viewer.member) ?? null : null;
  const myPrefs = me ? s.prefs.find((p) => p.member === me.name) : undefined;
  const ans = answers(s);
  const focus = focusOption(s);
  const complete = s.prefs.filter((p) => p.complete).length;
  const suggestionsReady = complete >= Math.min(3, s.members.length);

  // --- ideas: focus, then other stored ideas, then live suggestions (deduped against stored terms)
  const stored = s.options.filter((o) => !o.archived);
  const scored: IdeaScore[] = stored.map((o) => scoreIdea(ideaFromOption(o), g));
  if (suggestionsReady) {
    for (const sug of suggest(g).top) {
      const dup = stored.some((o) => o.destination_id === sug.idea.destinationId && o.start_date === sug.idea.start && o.days === sug.idea.days);
      if (!dup) scored.push(sug);
    }
  }
  const focusKey = focus?.id ?? null;
  scored.sort((a, b) => Number(b.idea.key === focusKey) - Number(a.idea.key === focusKey));

  const ideaView = (sc: IdeaScore): IdeaView => {
    const isFocus = sc.idea.key === focusKey;
    const dest = destinationById(sc.idea.destinationId);
    const opt = stored.find((o) => o.id === sc.idea.key);
    const mineP = me ? sc.people.find((p) => p.member === me.name) : undefined;
    const corr = me ? s.corrections.find((c) => c.member === me.name && c.option_id === sc.idea.key && c.active) : undefined;
    const mine: MyFit | null = mineP
      ? {
          status: mineP.status,
          statusLabel: STATUS_LABEL[mineP.status],
          reasons: mineP.reasons,
          estimate: mineP.estimate,
          modelEstimate: mineP.modelEstimate,
          correction: corr ? { total: corr.total, basis: corr.basis, checked_on: corr.checked_on, stale: mineP.correctionStale } : null,
          hints: isFocus ? fixHints(sc.idea, g).filter((h) => h.member === me!.name) : [],
          journeyUrl: journeyUrl(myPrefs, sc.idea.destinationId),
          budget: { max: myPrefs?.budget_max ?? null, comfortable: myPrefs?.budget_comfortable ?? null },
        }
      : null;
    return {
      key: sc.idea.key,
      stored: sc.idea.stored,
      source: sc.idea.source,
      name: sc.idea.name,
      destinationId: sc.idea.destinationId,
      place: dest ? dest.state : null,
      tags: sc.tags,
      start: sc.idea.start,
      days: sc.idea.days,
      dates: slotLabel(sc.idea.start, sc.idea.days),
      leave: leaveLabel(leaveNeeded(sc.idea.start, sc.idea.days)),
      offSeason: sc.offSeason,
      offReason: sc.offReason,
      isFocus,
      version: sc.idea.version,
      activities: opt?.activities ?? [],
      sharedAssumptions: opt?.shared_assumptions ?? null,
      defaultEstimate: opt?.default_estimate ?? null,
      counts: sc.counts,
      worst: sc.worst,
      people: sc.people.map((p) => ({
        name: p.member,
        status: p.status,
        statusLabel: STATUS_LABEL[p.status],
        answer: isFocus ? ans.get(p.member)?.state ?? "none" : null,
        outdated: isFocus ? ans.get(p.member)?.outdated : undefined,
      })),
      mine,
    };
  };
  const ideas = scored.map(ideaView);
  const focusView = ideas.find((i) => i.isFocus) ?? null;

  // --- people
  const people: PersonView[] = g.members.map((name) => {
    const a = ans.get(name)!;
    const m = s.members.find((x) => x.name === name)!;
    const onFocus = focusView?.people.find((p) => p.name === name);
    return {
      name,
      joined: !!m.joined_at,
      isCoordinator: name === s.room.coordinator,
      isMe: name === me?.name,
      state: memberState(s, name, a),
      answer: a.state,
      reopenReason: a.reopenReason,
      reasonChip: a.state === "change" || a.state === "cannot" ? a.response?.reason_chip ?? null : null,
      noteShared: a.state === "change" || a.state === "cannot" ? a.response?.note_shared ?? null : null,
      statusOnFocus: onFocus?.status ?? null,
      statusLabel: onFocus?.statusLabel ?? null,
    };
  });

  const validYes = validYesCount(s);
  const agreed = isAgreed(s);
  const current = outcomeForCurrentDeadline(s) ?? null;

  // --- coordinator
  let coordinator: CoordinatorView | null = null;
  if (viewer.coordinator) {
    const ctx: DraftContext = {
      roomName: s.room.name, groupLink: opts.groupLink, deadlineAt: s.room.deadline_at,
      focus: focus ? { name: focus.name, start: focus.start_date, days: focus.days } : null,
      validYes, total: s.members.length, complete,
    };
    const step = opts.stepOverride ?? rulesNextStep(nextMove(s), ctx);
    const invite = rulesNextStep({ kind: "collect", names: [] }, ctx).whatsapp;
    const update = groupUpdate(ctx, people.map((p) => ({ name: p.name, state: p.state })));
    coordinator = {
      nextStep: step,
      hints: focus ? fixHints(ideaFromOption(focus), g) : [],
      drafts: {
        invite,
        update,
        announcement: agreed ? announcement(ctx) : null,
        reminders: people.filter((p) => !p.isMe).map((p) => {
          const text = reminderFor(p.name, ctx, p.state);
          return { name: p.name, text, url: waLink(text) };
        }),
      },
      inviteUrl: waLink(invite),
      updateUrl: waLink(update),
    };
  }

  return {
    room: {
      id: s.room.id, name: s.room.name, tripDays: s.room.trip_days, windowStart: s.room.window_start, windowEnd: s.room.window_end,
      deadlineAt: s.room.deadline_at, deadlineLabel: formatIST(s.room.deadline_at), status: s.room.status,
      coordinator: s.room.coordinator, isDemo: s.room.is_demo, focusId: s.room.focus_id,
    },
    viewer: { name: me?.name ?? null, coordinator: viewer.coordinator, policyAcked: !!me?.policy_ack_at },
    policy: POLICY_TEXT,
    privacyNote: PRIVACY_NOTE,
    slots: g.slots.map((st) => ({ start: st, label: slotLabel(st, s.room.trip_days), leave: leaveLabel(leaveNeeded(st, s.room.trip_days)) })),
    people,
    counts: { complete, validYes, total: s.members.length },
    agreed,
    focus: focusView,
    ideas,
    orderingRule: ORDERING_RULE,
    suggestionsReady,
    me: me ? { prefs: myPrefs ? stripRoom(myPrefs) : null } : null,
    deadline: { passed: isPastDeadline(s, opts.now), outcome: current },
    outcomes: [...s.outcomes].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at)),
    history: history(s),
    coordinator,
    reasonChips: REASON_CHIPS,
  };
}

const stripRoom = ({ room_id: _r, ...rest }: Preferences) => rest;

const optName = (s: RoomState, id: unknown) => s.options.find((o) => o.id === id)?.name ?? "an idea";
const optLabel = (s: RoomState, id: unknown) => {
  const o = s.options.find((x) => x.id === id);
  return o ? `${o.name} (${shortDate(o.start_date)})` : "an idea";
};
const ANSWER_WORD: Record<string, string> = { yes: "said yes to", change: "asked for a change to", cannot: "can't join" };

/** Human-readable history. Built server-side so event metadata never needs to reach the client. */
export function history(s: RoomState): HistoryItem[] {
  const out: HistoryItem[] = [];
  for (const e of s.events) {
    const m = e.meta as Record<string, unknown>;
    let text: string | null = null;
    switch (e.type) {
      case "room_created": text = `${e.member} created the room`; break;
      case "auto_focus": text = `${optLabel(s, m.to)} is up for review (top-ranked idea)`; break;
      case "focus_set": text = `${e.member} switched focus to ${optLabel(s, m.to)}. Answers start fresh; earlier answers are kept here.`; break;
      case "idea_added": text = `${e.member} added ${m.name}`; break;
      case "variant_created": text = `${e.member} added a variant: ${m.name}`; break;
      case "idea_removed": text = `${e.member} removed ${m.name}`; break;
      case "idea_edited":
        text = m.focused && m.terms_changed ? `${e.member} changed ${optName(s, m.id)}'s terms. Everyone's yes on it reopened.` : `${e.member} edited ${optName(s, m.id)}`;
        break;
      case "reopened": text = `Reopened: ${(m.names as string[]).join(", ")}, please re-confirm (${m.cause})`; break;
      case "answer": text = `${e.member} ${ANSWER_WORD[m.answer as string] ?? "answered"} ${optName(s, m.option_id)}${m.simulated ? " (demo: simulated)" : ""}`; break;
      case "answer_withdrawn": text = `${e.member} withdrew their answer`; break;
      case "deadline_outcome": text = `At the deadline: ${m.result === "agreed" ? "agreed" : "unresolved"}, ${m.valid_yes}/${m.total} yeses${m.focus_option_id ? ` on ${optName(s, m.focus_option_id)}` : ""}. Later answers don't rewrite this record.`; break;
      case "deadline_extended": text = `${e.member} extended the deadline to ${formatIST(m.to as string)}. Valid yeses carry over.`; break;
      case "room_postponed": text = `${e.member} postponed the trip`; break;
      case "room_closed": text = `${e.member} closed the room`; break;
      case "room_reopened": text = `${e.member} reopened the room`; break;
      case "joined": text = `${e.member} joined`; break;
      case "demo": text = `Demo: ${m.text}`; break;
      default: text = null;
    }
    if (text) out.push({ at: e.at, text });
  }
  return out.reverse();
}

export { wontDoLabel };
