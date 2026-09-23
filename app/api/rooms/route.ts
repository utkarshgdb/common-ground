import { cookies } from "next/headers";
import { createRoom, claimName, type CreateRoomInput } from "@/lib/actions";
import { coordCookie, hashToken, memberCookie, newRoomId, newToken } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { cookieOpts, errorResponse, json, rateLimit, readBody } from "@/lib/server";
import { addDays, istToIso, todayIST } from "@/lib/util";

export const dynamic = "force-dynamic";

/** Create a room. Returns the group link, a private coordinator link and the creator's private recovery link (shown once). */
export async function POST(req: Request) {
  try {
    rateLimit("create", 30);
    const body = await readBody<Partial<CreateRoomInput>>(req);
    const now = new Date();
    const id = newRoomId();
    const admin = newToken();
    const session = newToken();
    const recovery = newToken();
    let s = createRoom(
      id,
      {
        name: String(body.name ?? ""),
        coordinator: String(body.coordinator ?? ""),
        members: Array.isArray(body.members) ? body.members.map(String) : [],
        trip_days: Number(body.trip_days ?? 3),
        window_start: String(body.window_start ?? ""),
        window_end: String(body.window_end ?? ""),
        deadline_at: body.deadline_at ? String(body.deadline_at) : istToIso(addDays(todayIST(now), 3)),
      },
      hashToken(admin),
      now,
    );
    s = claimName(s, s.room.coordinator, hashToken(session), hashToken(recovery), now);
    await getStore().save(null, s);
    const jar = cookies();
    jar.set(memberCookie(id), session, cookieOpts());
    jar.set(coordCookie(id), admin, cookieOpts());
    return json({ id, coordinatorToken: admin, recoveryToken: recovery, name: s.room.coordinator });
  } catch (e) {
    return errorResponse(e);
  }
}
