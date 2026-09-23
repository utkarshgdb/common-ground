import { ActionError, setSession } from "@/lib/actions";
import { hashToken, newToken } from "@/lib/auth";
import { actorFor, errorResponse, json, mutateRoom, rateLimit } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Make a new private link for the signed-in member (the old one stops working). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    rateLimit("auth", 30);
    const recovery = newToken();
    await mutateRoom(params.id, (s) => {
      if (s.room.is_demo) throw new ActionError("demo", "Demo rooms don't have private links.", 400);
      const a = actorFor(s);
      if (!a.member) throw new ActionError("not_member", "Sign in first.", 401);
      return setSession(s, a.member, { recovery_hash: hashToken(recovery) });
    });
    return json({ recoveryToken: recovery });
  } catch (e) {
    return errorResponse(e);
  }
}
