// Shared plumbing for API routes: auth → load → deadline check → pure action → save diff → projected response.
import "server-only";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { ActionError, type Actor } from "./actions";
import { coordCookie, memberCookie, tokenMatches } from "./auth";
import { recordOutcomeIfDue } from "./deadline";
import { project, type RoomView } from "./projection";
import { getStore } from "./store";
import type { RoomState } from "./types";
import type { NextStep } from "./drafts";

export const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const MAX_BODY = 16 * 1024;

export function json(data: unknown, init: { status?: number } = {}) {
  return NextResponse.json(data, { status: init.status ?? 200, headers: NO_STORE });
}

export function errorResponse(e: unknown) {
  if (e instanceof ActionError) return json({ error: e.message, code: e.code, details: e.details ?? null }, { status: e.status });
  console.error(e);
  return json({ error: "Something went wrong on our side. Please try again.", code: "server" }, { status: 500 });
}

export async function readBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new ActionError("too_large", "That's too much text.", 413);
  if (!text) return {} as T;
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
    return v as T;
  } catch {
    throw new ActionError("bad_json", "Invalid request.", 400);
  }
}

// --- simple per-IP write rate limit (per server instance; best-effort on serverless)
const hits = new Map<string, number[]>();
export function rateLimit(bucket = "write", limit = 120, windowMs = 60_000) {
  const h = headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
  const now = Date.now();
  const key = `${bucket}:${ip}`;
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  if (arr.length > limit) throw new ActionError("rate_limited", "Too many changes at once. Wait a moment and try again.", 429);
}

// --- per-room write lock (serialises writes within an instance)
const locks = new Map<string, Promise<unknown>>();
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  locks.set(key, prev.then(() => mine));
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === mine) locks.delete(key);
  }
}

/** Who is making this request. View-as is honoured ONLY for demo rooms (server-enforced). */
export function actorFor(s: RoomState, viewAs?: string | null): Actor {
  if (s.room.is_demo && viewAs) {
    const m = s.members.find((x) => x.name === viewAs);
    if (m) return { member: m.name, coordinator: m.name === s.room.coordinator };
  }
  const jar = cookies();
  const mTok = jar.get(memberCookie(s.room.id))?.value;
  const member = mTok ? s.members.find((m) => tokenMatches(mTok, m.session_hash))?.name ?? null : null;
  const cTok = jar.get(coordCookie(s.room.id))?.value;
  const coordinator = tokenMatches(cTok, s.room.admin_token_hash);
  return { member, coordinator };
}

export function origin(req: Request) {
  const h = headers();
  const proto = h.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? new URL(req.url).host;
  return `${proto}://${host}`;
}

export const groupLink = (req: Request, roomId: string) => `${origin(req)}/room/${roomId}`;

export async function loadRoom(id: string): Promise<RoomState> {
  if (!/^[a-z0-9]{4,40}$/i.test(id)) throw new ActionError("not_found", "Room not found.", 404);
  const s = await getStore().load(id);
  if (!s) throw new ActionError("not_found", "Room not found. Check the link.", 404);
  return s;
}

/** Load a room, record a due deadline outcome (first read/write after expiry), apply `mutate`, save the diff. */
export async function mutateRoom(
  id: string,
  mutate: (s: RoomState, now: Date) => RoomState | Promise<RoomState>,
): Promise<{ state: RoomState; now: Date }> {
  return withLock(id, async () => {
    const loaded = await loadRoom(id);
    const now = new Date();
    const due = recordOutcomeIfDue(loaded, now).state;
    const next = await mutate(due, now);
    if (next !== loaded) await getStore().save(loaded, next);
    return { state: next, now };
  });
}

export function view(req: Request, s: RoomState, actor: Actor, now: Date, stepOverride?: NextStep | null): RoomView {
  return project(s, actor, { now, groupLink: groupLink(req, s.room.id), stepOverride });
}

export function cookieOpts(maxAgeDays = 180) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeDays * 86400,
  };
}
