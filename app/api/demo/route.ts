import { hashToken, newRoomId, newToken } from "@/lib/auth";
import { buildDemo } from "@/lib/demo";
import { getStore } from "@/lib/store";
import { errorResponse, json, rateLimit } from "@/lib/server";

export const dynamic = "force-dynamic";

/** "Try the demo": a fresh is_demo room. Demo rooms older than 7 days are purged. */
export async function POST() {
  try {
    rateLimit("create", 30);
    const store = getStore();
    const now = new Date();
    await store.purgeDemos(new Date(now.getTime() - 7 * 86400_000)).catch(() => 0);
    const id = newRoomId();
    const s = buildDemo(id, hashToken(newToken()), now);
    await store.save(null, s);
    return json({ id });
  } catch (e) {
    return errorResponse(e);
  }
}
