import { ActionError } from "@/lib/actions";
import { buildDemo, demoFillKaran, demoReachDeadline, demoSimulateFour } from "@/lib/demo";
import { actorFor, errorResponse, json, mutateRoom, rateLimit, readBody, view } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Demo-bar steps. Refused for any room that isn't a demo room. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    rateLimit();
    const { step, as } = await readBody<{ step?: string; as?: string }>(req);
    const { state, now } = await mutateRoom(params.id, (s, now) => {
      if (!s.room.is_demo) throw new ActionError("not_demo", "Demo steps only work in demo rooms.", 403);
      switch (step) {
        case "fill": return demoFillKaran(s, now);
        case "simulate": return demoSimulateFour(s, now);
        case "deadline": return demoReachDeadline(s, now);
        case "three": return buildDemo(s.room.id, s.room.admin_token_hash, now, "three");
        case "reset": return buildDemo(s.room.id, s.room.admin_token_hash, now);
        default: throw new ActionError("invalid", "Unknown demo step.");
      }
    });
    return json(view(req, state, actorFor(state, as ?? "Karan"), now));
  } catch (e) {
    return errorResponse(e);
  }
}
