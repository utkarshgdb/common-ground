import { actorFor, errorResponse, json, readRoom, view } from "@/lib/server";

export const dynamic = "force-dynamic";

/** The room as the current viewer may see it (server-side projection). Records a due deadline outcome. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const as = new URL(req.url).searchParams.get("as");
    const { state, now } = await readRoom(params.id);
    return json(view(req, state, actorFor(state, as), now));
  } catch (e) {
    return errorResponse(e);
  }
}
