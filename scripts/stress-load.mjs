// Concurrency + load probe: 5 friends acting at the same moment, repeated; then a burst of reads.
//   node scripts/stress-load.mjs http://localhost:3600
// Checks: no 5xx, no lost writes (every member's final preferences and answers are what they last sent).
const B = process.argv[2] ?? "http://localhost:3600";
const add = (d, k) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

class C {
  constructor() { this.jar = new Map(); }
  async req(m, p, b) {
    const r = await fetch(B + p, { method: m, headers: { "content-type": "application/json", cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "), "x-forwarded-for": "10.0." + Math.floor(Math.random() * 250) + ".1" }, body: b ? JSON.stringify(b) : undefined });
    for (const c of r.headers.getSetCookie?.() ?? []) { const [kv] = c.split(";"); const i = kv.indexOf("="); this.jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    return { status: r.status, json: await r.json().catch(() => null) };
  }
}
const names = ["Riya", "Siddharth", "Karan", "Aisha", "Preethi"];
const riya = new C();
const created = await riya.req("POST", "/api/rooms", { name: "Load", coordinator: "Riya", members: names, trip_days: 3, window_start: add(today, 3), window_end: add(today, 60) });
const id = created.json.id;
const people = { Riya: riya };
for (const n of names.slice(1)) { people[n] = new C(); await people[n].req("POST", `/api/rooms/${id}/join`, { name: n }); }
const slots = (await riya.req("GET", `/api/rooms/${id}`)).json.slots.map((s) => s.start);

const statuses = [];
const t0 = Date.now();
const ROUNDS = 6;
const last = {};
for (let round = 0; round < ROUNDS; round++) {
  // everyone saves preferences at exactly the same time, with a distinctive budget per round
  await Promise.all(names.map(async (n, i) => {
    const budget = 20000 + round * 100 + i;
    last[n] = budget;
    const r = await people[n].req("POST", `/api/rooms/${id}/action`, { type: "preferences", payload: { home_city: "bengaluru", budget_max: budget, slots, vibes: ["relaxed"] } });
    statuses.push(r.status);
  }));
}
// everyone answers at the same moment
await Promise.all(names.map(async (n) => {
  const r = await people[n].req("POST", `/api/rooms/${id}/action`, { type: "respond", payload: { answer: "change", reason_chip: "dates", note_shared: `note-${n}` } });
  statuses.push(r.status);
}));
const writeMs = Date.now() - t0;

// verify no lost writes
const lost = [];
for (const n of names) {
  const v = (await people[n].req("GET", `/api/rooms/${id}`)).json;
  if (v.me?.prefs?.budget_max !== last[n]) lost.push(`${n} budget ${v.me?.prefs?.budget_max} != ${last[n]}`);
  const me = v.people.find((p) => p.isMe);
  if (me?.answer !== "change" || me?.noteShared !== `note-${n}`) lost.push(`${n} answer ${me?.answer}`);
}

// read burst
const t1 = Date.now();
const reads = await Promise.all(Array.from({ length: 200 }, (_, i) => people[names[i % 5]].req("GET", `/api/rooms/${id}`)));
const readMs = Date.now() - t1;
const bad = [...statuses, ...reads.map((r) => r.status)].filter((s) => s >= 500);

console.log(`writes: ${statuses.length} concurrent writes in ${writeMs} ms; 5xx: ${statuses.filter((s) => s >= 500).length}; non-200: ${statuses.filter((s) => s !== 200).length}`);
console.log(`reads: 200 concurrent reads in ${readMs} ms (${(readMs / 200).toFixed(1)} ms avg wall)`);
console.log(`lost writes: ${lost.length ? lost.join("; ") : "none"}`);
console.log(bad.length ? `FINDING: ${bad.length} server errors` : "no server errors");
