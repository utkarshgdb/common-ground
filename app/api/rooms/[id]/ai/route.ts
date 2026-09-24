import { ActionError } from "@/lib/actions";
import { fingerprint, geminiNextStep, geminiParseNote, geminiSketch, nextStepInput, aiEnabled } from "@/lib/ai";
import { focusOption, validYesCount } from "@/lib/consent";
import { tripSlots, slotLabel } from "@/lib/engine";
import { rulesNextStep } from "@/lib/drafts";
import { nextMove } from "@/lib/deadline";
import { todayIST } from "@/lib/util";
import { actorFor, errorResponse, groupLink, json, loadRoom, rateLimit, readBody } from "@/lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Optional Gemini helpers. They only word or read; results never change limits, statuses or answers by themselves. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    rateLimit("ai", 40);
    const { job, as } = await readBody<{ job?: string; as?: string }>(req);
    const s = await loadRoom(params.id);
    const actor = actorFor(s, as ?? null);
    const now = new Date();

    if (job === "next_step") {
      if (!actor.coordinator) throw new ActionError("not_coordinator", "Only the coordinator sees the next step.", 403);
      const o = focusOption(s);
      const ctx = {
        roomName: s.room.name, groupLink: groupLink(req, s.room.id), deadlineAt: s.room.deadline_at,
        focus: o ? { name: o.name, start: o.start_date, days: o.days } : null,
        validYes: validYesCount(s), total: s.members.length, complete: s.prefs.filter((p) => p.complete).length, me: actor.member,
      };
      const before = fingerprint(nextStepInput(s, now));
      const step = await geminiNextStep(s, ctx, now);
      // Discard if the room changed while Gemini was writing.
      const after = await loadRoom(params.id);
      if (fingerprint(nextStepInput(after, now)) !== before) return json({ step: rulesNextStep(nextMove(after, todayIST(now)), ctx), stale: true });
      return json({ step, ai: aiEnabled() });
    }

    if (job === "sketch") {
      if (!actor.member) throw new ActionError("not_member", "Sign in first.", 401);
      const r = await geminiSketch(s);
      return json(r);
    }

    if (job === "parse_note") {
      if (!actor.member) throw new ActionError("not_member", "Sign in first.", 401);
      const note = s.prefs.find((p) => p.member === actor.member)?.note_private ?? "";
      if (!note.trim()) return json({ items: [], reason: "empty" });
      const slots = tripSlots(s.room.window_start, s.room.window_end, s.room.trip_days).map((st) => ({ start: st, label: slotLabel(st, s.room.trip_days) }));
      const items = await geminiParseNote(note, slots);
      return json(items ? { items, reason: "ok" } : { items: [], reason: aiEnabled() ? "failed" : "no_key" });
    }
    throw new ActionError("invalid", "Unknown AI job.");
  } catch (e) {
    return errorResponse(e);
  }
}
