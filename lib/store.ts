// Storage adapters. Supabase (server-side service role key) when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set;
// otherwise a local JSON file store under .data/ (dev/test only) so the app runs with zero config.
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RoomState } from "./types";

export interface Store {
  kind: "supabase" | "local";
  load(roomId: string): Promise<RoomState | null>;
  /** Persist `next`. `prev` is the state that was loaded (null for a new room); only changed rows are written. */
  save(prev: RoomState | null, next: RoomState): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;
  purgeDemos(olderThan: Date): Promise<number>;
}

// ------------------------------------------------------------------------------------------ local JSON

class LocalStore implements Store {
  kind = "local" as const;
  constructor(private dir: string) {}
  private file(id: string) {
    if (!/^[A-Za-z0-9_-]{4,40}$/.test(id)) throw new Error("bad id");
    return path.join(this.dir, `${id}.json`);
  }
  async load(id: string) {
    try {
      return JSON.parse(await fs.readFile(this.file(id), "utf8")) as RoomState;
    } catch {
      return null;
    }
  }
  async save(_prev: RoomState | null, next: RoomState) {
    await fs.mkdir(this.dir, { recursive: true });
    const events = next.events.map((e, i) => ({ ...e, id: e.id ?? i + 1 }));
    const tmp = this.file(next.room.id) + "." + process.pid + ".tmp";
    await fs.writeFile(tmp, JSON.stringify({ ...next, events }));
    await fs.rename(tmp, this.file(next.room.id));
  }
  async deleteRoom(id: string) {
    await fs.rm(this.file(id), { force: true });
  }
  async purgeDemos(olderThan: Date) {
    let n = 0;
    try {
      for (const f of await fs.readdir(this.dir)) {
        if (!f.endsWith(".json")) continue;
        const s = await this.load(f.slice(0, -5));
        if (s?.room.is_demo && new Date(s.room.created_at) < olderThan) {
          await this.deleteRoom(s.room.id);
          n++;
        }
      }
    } catch {
      /* no data dir yet */
    }
    return n;
  }
}

// ------------------------------------------------------------------------------------------ Supabase

type Table = { name: string; key: (r: any) => string; pk: string[]; field: keyof Omit<RoomState, "room"> | "room" };
const TABLES: Table[] = [
  { name: "cg_members", field: "members", pk: ["room_id", "name"], key: (r) => r.name },
  { name: "cg_preferences", field: "prefs", pk: ["room_id", "member"], key: (r) => r.member },
  { name: "cg_options", field: "options", pk: ["room_id", "id"], key: (r) => r.id },
  { name: "cg_corrections", field: "corrections", pk: ["room_id", "option_id", "member"], key: (r) => `${r.option_id}|${r.member}` },
  { name: "cg_responses", field: "responses", pk: ["room_id", "member", "focus_id"], key: (r) => `${r.member}|${r.focus_id}` },
  { name: "cg_outcomes", field: "outcomes", pk: ["room_id", "deadline_at"], key: (r) => r.deadline_at },
];

const iso = (v: unknown) => (v == null ? v : new Date(v as string).toISOString());
const TS_FIELDS = ["deadline_at", "created_at", "joined_at", "policy_ack_at", "updated_at", "at", "recorded_at"];
function normalize<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const k of TS_FIELDS) if (k in out && out[k] != null) out[k] = iso(out[k]);
  return out as T;
}

class SupabaseStore implements Store {
  kind = "supabase" as const;
  constructor(private db: SupabaseClient) {}

  async load(id: string): Promise<RoomState | null> {
    const q = (t: string) => this.db.from(t).select("*").eq("room_id", id);
    const [room, members, prefs, options, corrections, responses, outcomes, events] = await Promise.all([
      this.db.from("cg_rooms").select("*").eq("id", id).maybeSingle(),
      q("cg_members"), q("cg_preferences"), q("cg_options"), q("cg_corrections"), q("cg_responses"), q("cg_outcomes"),
      q("cg_events").order("id", { ascending: true }),
    ]);
    for (const r of [room, members, prefs, options, corrections, responses, outcomes, events]) if (r.error) throw r.error;
    if (!room.data) return null;
    const n = (rows: any[] | null) => (rows ?? []).map(normalize);
    return {
      room: normalize(room.data),
      members: n(members.data),
      prefs: n(prefs.data),
      options: n(options.data),
      corrections: n(corrections.data),
      responses: n(responses.data),
      outcomes: n(outcomes.data),
      events: n(events.data),
    } as RoomState;
  }

  async save(prev: RoomState | null, next: RoomState) {
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const check = async (q: PromiseLike<{ error: unknown }>) => {
      const { error } = await q;
      if (error) throw error;
    };
    const syncTable = async (t: Table) => {
      const before = new Map(((prev?.[t.field] as any[]) ?? []).map((r) => [t.key(r), r]));
      const after = new Map((next[t.field] as any[]).map((r) => [t.key(r), r]));
      const upserts = [...after.entries()].filter(([k, r]) => !same(before.get(k), r)).map(([, r]) => r);
      const deletes = [...before.entries()].filter(([k]) => !after.has(k)).map(([, r]) => r);
      const ops: Promise<void>[] = [];
      // Deadline outcomes are write-once: if another server instance recorded this deadline first, keep its record.
      const writeOnce = t.name === "cg_outcomes";
      if (upserts.length) ops.push(check(this.db.from(t.name).upsert(upserts, { onConflict: t.pk.join(","), ignoreDuplicates: writeOnce })));
      for (const r of deletes) {
        let del = this.db.from(t.name).delete();
        for (const k of t.pk) del = del.eq(k, r[k]);
        ops.push(check(del));
      }
      await Promise.all(ops);
    };
    const byName = (n: string) => TABLES.find((t) => t.name === n)!;
    const syncEvents = async () => {
      const keptIds = new Set(next.events.map((e) => e.id).filter((x) => x != null));
      const dropped = (prev?.events ?? []).map((e) => e.id).filter((x): x is number => x != null && !keptIds.has(x));
      if (dropped.length) await check(this.db.from("cg_events").delete().eq("room_id", next.room.id).in("id", dropped));
      const newEvents = next.events.filter((e) => e.id == null).map(({ id: _id, ...e }) => e);
      if (newEvents.length) await check(this.db.from("cg_events").insert(newEvents));
    };
    const roomChanged = !prev || !same(prev.room, next.room);
    const upsertRoom = () => check(this.db.from("cg_rooms").upsert(next.room));
    if (!prev) {
      // New room: the room row, then its members, must exist before rows that reference them.
      await upsertRoom();
      await syncTable(byName("cg_members"));
    }
    // Members are only ever created with their room, so for an existing room every table is independent and all
    // writes go out in one parallel round trip.
    await Promise.all([
      prev && roomChanged ? upsertRoom() : Promise.resolve(),
      prev ? syncTable(byName("cg_members")) : Promise.resolve(),
      ...["cg_preferences", "cg_options", "cg_corrections", "cg_responses", "cg_outcomes"].map((n) => syncTable(byName(n))),
      syncEvents(),
    ]);
  }

  async deleteRoom(id: string) {
    await this.db.from("cg_events").delete().eq("room_id", id);
    await this.db.from("cg_corrections").delete().eq("room_id", id);
    await this.db.from("cg_responses").delete().eq("room_id", id);
    const { error } = await this.db.from("cg_rooms").delete().eq("id", id); // cascades members/prefs/options/outcomes
    if (error) throw error;
  }

  async purgeDemos(olderThan: Date) {
    const { data, error } = await this.db.from("cg_rooms").select("id").eq("is_demo", true).lt("created_at", olderThan.toISOString()).limit(50);
    if (error) throw error;
    for (const r of data ?? []) await this.deleteRoom(r.id);
    return data?.length ?? 0;
  }
}

// ------------------------------------------------------------------------------------------ factory

let cached: Store | null = null;
export function getStore(): Store {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    cached = new SupabaseStore(
      createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        // Next.js caches fetch() by default; room state must always be read fresh (a stale read loses sessions and answers).
        global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
      }),
    );
  } else {
    cached = new LocalStore(process.env.CG_DATA_DIR || path.join(process.cwd(), ".data", "rooms"));
  }
  return cached;
}
