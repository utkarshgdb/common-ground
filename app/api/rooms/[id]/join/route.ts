import { cookies } from "next/headers";
import { ActionError, claimName } from "@/lib/actions";
import { hashToken, memberCookie, newToken } from "@/lib/auth";
import { actorFor, cookieOpts, errorResponse, json, mutateRoom, rateLimit, readBody, view } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Claim your name: sets a private session cookie and returns your private recovery token (shown once). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    rateLimit("auth", 30);
    const { name } = await readBody<{ name?: string }>(req);
    const session = newToken();
    const recovery = newToken();
    const { state, now } = await mutateRoom(params.id, (s, at) => {
      if (s.room.is_demo) throw new ActionError("demo", "Use the View-as switcher in the demo.", 400);
      const current = actorFor(s);
      if (current.member) throw new ActionError("already_joined", `This browser is already signed in as ${current.member}.`, 409);
      return claimName(s, String(name ?? ""), hashToken(session), hashToken(recovery), at);
    });
    cookies().set(memberCookie(params.id), session, cookieOpts());
    const actor = { member: String(name), coordinator: actorFor(state).coordinator };
    return json({ recoveryToken: recovery, view: view(req, state, actor, now) });
  } catch (e) {
    return errorResponse(e);
  }
}

