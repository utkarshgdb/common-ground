import { cookies } from "next/headers";
import { ActionError } from "@/lib/actions";
import { coordCookie, tokenMatches } from "@/lib/auth";
import { cookieOpts, errorResponse, json, loadRoom, rateLimit, readBody } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Exchange the private coordinator link token (/room/{id}#c=token) for a coordinator cookie. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    rateLimit("auth", 30);
    const { token } = await readBody<{ token?: string }>(req);
    const s = await loadRoom(params.id);
    if (!tokenMatches(String(token ?? ""), s.room.admin_token_hash))
      throw new ActionError("bad_link", "That coordinator link isn't valid.", 403);
    cookies().set(coordCookie(params.id), String(token), cookieOpts());
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
