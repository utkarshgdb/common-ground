import { cookies } from "next/headers";
import { ActionError, setSession } from "@/lib/actions";
import { hashToken, memberCookie, newToken, tokenMatches } from "@/lib/auth";
import { cookieOpts, errorResponse, json, mutateRoom, rateLimit, readBody } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Restore a member session from the private recovery link (/r/{id}#k=token; the fragment never reaches server logs). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    rateLimit("auth", 30);
    const { token } = await readBody<{ token?: string }>(req);
    const session = newToken();
    let name = "";
    await mutateRoom(params.id, (s) => {
      const m = s.members.find((x) => tokenMatches(String(token ?? ""), x.recovery_hash));
      if (!m) throw new ActionError("bad_link", "That private link isn't valid any more. Ask the coordinator for the group link.", 403);
      name = m.name;
      return setSession(s, m.name, { session_hash: hashToken(session) });
    });
    cookies().set(memberCookie(params.id), session, cookieOpts());
    return json({ ok: true, name });
  } catch (e) {
    return errorResponse(e);
  }
}
