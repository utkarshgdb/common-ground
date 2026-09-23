import {
  ActionError, ackPolicy, addIdea, correctEstimate, createVariant, editIdea, extendDeadline, removeCorrection, removeIdea,
  respond, savePreferences, setFocus, setRoomStatus, withdraw, type IdeaInput, type PrefsInput, type RespondInput,
} from "@/lib/actions";
import type { Actor } from "@/lib/actions";
import type { RoomState } from "@/lib/types";
import { actorFor, errorResponse, json, mutateRoom, rateLimit, readBody, view } from "@/lib/server";

export const dynamic = "force-dynamic";

type Body = { type?: string; as?: string; [k: string]: unknown };

/** Every write goes through here. The server works out who is asking; the client never says who it is (except View-as in demo rooms). */
function run(s: RoomState, a: Actor, b: Body, now: Date): RoomState {
  const p = (b.payload ?? {}) as Record<string, unknown>;
  switch (b.type) {
    case "preferences": return savePreferences(s, a, p as PrefsInput, now).state;
    case "ack_policy": return ackPolicy(s, a, now);
    case "respond": return respond(s, a, p as unknown as RespondInput, now);
    case "withdraw": return withdraw(s, a, now);
    case "correct": return correctEstimate(s, a, String(p.option_id), p as never, now);
    case "remove_correction": return removeCorrection(s, a, String(p.option_id), now);
    case "focus": return setFocus(s, a, String(p.key), now);
    case "add_idea": return addIdea(s, a, p as IdeaInput, now).state;
    case "edit_idea": return editIdea(s, a, String(p.id), p as IdeaInput, now);
    case "remove_idea": return removeIdea(s, a, String(p.id), now);
    case "variant": return createVariant(s, a, String(p.member), now).state;
    case "extend": return extendDeadline(s, a, String(p.deadline_at), now);
    case "postpone": return setRoomStatus(s, a, "postponed", now);
    case "close": return setRoomStatus(s, a, "closed", now);
    case "reopen": return setRoomStatus(s, a, "open", now);
    default: throw new ActionError("invalid", "Unknown action.");
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    rateLimit();
    const body = await readBody<Body>(req);
    let actor: Actor = { member: null, coordinator: false };
    const { state, now } = await mutateRoom(params.id, (s, now) => {
      actor = actorFor(s, typeof body.as === "string" ? body.as : null);
      return run(s, actor, body, now);
    });
    return json(view(req, state, actor, now));
  } catch (e) {
    return errorResponse(e);
  }
}
