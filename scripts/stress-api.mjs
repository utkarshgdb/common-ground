// Abuse / robustness probe for the API (run against a local server with the local store):
//   node scripts/stress-api.mjs http://localhost:3600
// Every case states what a correct server should do. Anything returning 500, or accepting what it should refuse, is a finding.
const B = process.argv[2] ?? "http://localhost:3600";
const findings = [];
let n = 0;

class Client {
  constructor() { this.cookies = new Map(); }
  async req(method, path, body, raw) {
    const headers = { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") };
    if (body !== undefined) headers["content-type"] = "application/json";
    const r = await fetch(B + path, { method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
    for (const c of r.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      this.cookies.set(kv.slice(0, i), kv.slice(i + 1));
    }
    let json = null;
    const text = await r.text();
    try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  }
  get(p) { return this.req("GET", p); }
  post(p, b, raw) { return this.req("POST", p, b, raw); }
}

function expect(name, cond, detail = "") {
  n++;
  if (!cond) findings.push(`${name}${detail ? ` — ${detail}` : ""}`);
}
const ok = (r) => r.status >= 200 && r.status < 300;
const clientErr = (r) => r.status >= 400 && r.status < 500;

const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const add = (d, k) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };

async function makeRoom(extra = {}) {
  const riya = new Client();
  const r = await riya.post("/api/rooms", { name: "Stress", coordinator: "Riya", members: ["Riya", "Aisha", "Karan"], trip_days: 3, window_start: add(today, 3), window_end: add(today, 60), ...extra });
  return { riya, r, id: r.json?.id };
}

// ---------------------------------------------------------------- room creation validation
{
  const c = new Client();
  const bad = [
    ["no name", { coordinator: "R", members: ["R", "A"], trip_days: 3, window_start: add(today, 3), window_end: add(today, 40) }],
    ["1 member", { name: "x", coordinator: "R", members: ["R"], trip_days: 3, window_start: add(today, 3), window_end: add(today, 40) }],
    ["13 members", { name: "x", coordinator: "R", members: Array.from({ length: 13 }, (_, i) => "P" + i), trip_days: 3, window_start: add(today, 3), window_end: add(today, 40) }],
    ["dup names (case)", { name: "x", coordinator: "Riya", members: ["Riya", "riya"], trip_days: 3, window_start: add(today, 3), window_end: add(today, 40) }],
    ["trip_days 9", { name: "x", coordinator: "R", members: ["R", "A"], trip_days: 9, window_start: add(today, 3), window_end: add(today, 40) }],
    ["window 200 days", { name: "x", coordinator: "R", members: ["R", "A"], trip_days: 3, window_start: add(today, 3), window_end: add(today, 203) }],
    ["window in the past", { name: "x", coordinator: "R", members: ["R", "A"], trip_days: 3, window_start: add(today, -60), window_end: add(today, -20) }],
    ["deadline in past", { name: "x", coordinator: "R", members: ["R", "A"], trip_days: 3, window_start: add(today, 3), window_end: add(today, 40), deadline_at: "2020-01-01T00:00:00Z" }],
    ["members not array", { name: "x", coordinator: "R", members: "R,A", trip_days: 3, window_start: add(today, 3), window_end: add(today, 40) }],
    ["garbage dates", { name: "x", coordinator: "R", members: ["R", "A"], trip_days: 3, window_start: "yesterday", window_end: "soon" }],
  ];
  for (const [label, body] of bad) {
    const r = await c.post("/api/rooms", body);
    expect(`create rejects ${label}`, clientErr(r), `got ${r.status} ${r.text.slice(0, 120)}`);
  }
  const big = await c.post("/api/rooms", null, JSON.stringify({ name: "x".repeat(20000) }));
  expect("oversized body rejected with 413", big.status === 413, `got ${big.status}`);
  const notJson = await c.post("/api/rooms", null, "{not json");
  expect("invalid JSON → 400", notJson.status === 400, `got ${notJson.status}`);
  const arr = await c.post("/api/rooms", null, "[1,2]");
  expect("JSON array body → 400", arr.status === 400, `got ${arr.status}`);
}

// ---------------------------------------------------------------- auth & cross-room access
const A = await makeRoom();
const B2 = await makeRoom();
expect("room A created", ok(A.r), A.r.text);
{
  const aisha = new Client();
  const j = await aisha.post(`/api/rooms/${A.id}/join`, { name: "Aisha" });
  expect("Aisha joins A", ok(j), j.text);
  const again = await aisha.post(`/api/rooms/${A.id}/join`, { name: "Karan" });
  expect("same browser can't claim a second name", again.status === 409, `got ${again.status}`);
  const stranger = new Client();
  const riyaClaim = await stranger.post(`/api/rooms/${A.id}/join`, { name: "Riya" });
  expect("can't claim an already-claimed name", riyaClaim.status === 409, `got ${riyaClaim.status}`);
  const ghost = await stranger.post(`/api/rooms/${A.id}/join`, { name: "Nobody" });
  expect("can't claim a name not in the room", ghost.status === 404, `got ${ghost.status}`);

  // Aisha's cookie for room A must not work in room B
  const cross = await aisha.post(`/api/rooms/${B2.id}/action`, { type: "preferences", payload: { budget_max: 5000 } });
  expect("room-A session can't write to room B", cross.status === 401, `got ${cross.status}`);
  // Riya's coordinator cookie for A must not work in B
  const crossC = await A.riya.post(`/api/rooms/${B2.id}/action`, { type: "close" });
  expect("room-A coordinator can't close room B", crossC.status === 403 || crossC.status === 401, `got ${crossC.status}`);
  // Member (not coordinator) can't do coordinator things
  for (const type of ["close", "postpone", "extend", "focus", "add_idea", "edit_idea", "remove_idea", "variant"]) {
    const r = await aisha.post(`/api/rooms/${A.id}/action`, { type, payload: { key: "x", id: "x", member: "Karan", deadline_at: add(today, 9) + "T10:00:00Z" } });
    expect(`member can't ${type}`, r.status === 403, `got ${r.status} ${r.text.slice(0, 80)}`);
  }
  // Wrong coordinator / recovery tokens
  const badC = await stranger.post(`/api/rooms/${A.id}/coordinator`, { token: "x".repeat(43) });
  expect("wrong coordinator token rejected", badC.status === 403, `got ${badC.status}`);
  const badR = await stranger.post(`/api/rooms/${A.id}/recover`, { token: "y".repeat(43) });
  expect("wrong recovery token rejected", badR.status === 403, `got ${badR.status}`);
  const noTok = await stranger.post(`/api/rooms/${A.id}/recover`, {});
  expect("missing recovery token rejected (not 500)", clientErr(noTok), `got ${noTok.status}`);
  // Recovery works and is reusable
  const rec = await new Client().post(`/api/rooms/${A.id}/recover`, { token: j.json?.recoveryToken });
  expect("valid recovery token restores session", ok(rec) && rec.json?.name === "Aisha", rec.text);
  // Demo endpoints refuse real rooms
  const demo = await A.riya.post(`/api/rooms/${A.id}/demo`, { step: "reset" });
  expect("demo reset refused on a real room", demo.status === 403, `got ${demo.status}`);
  // Unknown / malformed room ids
  for (const id of ["nope1234", "../../etc", "a", "%00"]) {
    const r = await stranger.get(`/api/rooms/${encodeURIComponent(id)}`);
    expect(`bad room id ${JSON.stringify(id)} → 404`, r.status === 404, `got ${r.status}`);
  }
  // AI endpoint auth
  const aiNs = await aisha.post(`/api/rooms/${A.id}/ai`, { job: "next_step" });
  expect("member can't fetch coordinator next step", aiNs.status === 403, `got ${aiNs.status}`);
  const aiAnon = await stranger.post(`/api/rooms/${A.id}/ai`, { job: "sketch" });
  expect("anonymous can't fetch sketch", aiAnon.status === 401, `got ${aiAnon.status}`);
}

// ---------------------------------------------------------------- malformed payloads (should be 4xx, never 500)
{
  const aisha = new Client();
  await aisha.post(`/api/rooms/${A.id}/recover`, { token: (await A.riya.get(`/api/rooms/${A.id}`)) && undefined }); // no-op
  const karan = new Client();
  await karan.post(`/api/rooms/${A.id}/join`, { name: "Karan" });
  const payloads = [
    ["slots as string", { type: "preferences", payload: { slots: "2026-10-09" } }],
    ["vibes as object", { type: "preferences", payload: { vibes: { a: 1 } } }],
    ["wont_do as number", { type: "preferences", payload: { wont_do: 5 } }],
    ["budget negative", { type: "preferences", payload: { budget_max: -5 } }],
    ["budget string", { type: "preferences", payload: { budget_max: "lots" } }],
    ["budget huge", { type: "preferences", payload: { budget_max: 1e15 } }],
    ["comfortable > max", { type: "preferences", payload: { budget_max: 10000, budget_comfortable: 20000 } }],
    ["unknown city", { type: "preferences", payload: { home_city: "atlantis" } }],
    ["4 vibes", { type: "preferences", payload: { vibes: ["beach", "food", "city", "nature"] } }],
    ["parsed_limits garbage", { type: "preferences", payload: { parsed_limits: "yes" } }],
    ["payload null", { type: "preferences", payload: null }],
    ["unknown action", { type: "drop_tables" }],
    ["answer invalid", { type: "respond", payload: { answer: "maybe" } }],
    ["correct w/o option", { type: "correct", payload: { total: 100 } }],
    ["__proto__ payload", { type: "preferences", payload: JSON.parse('{"__proto__":{"admin":true},"budget_max":12000}') }],
  ];
  for (const [label, body] of payloads) {
    const r = await karan.post(`/api/rooms/${A.id}/action`, body);
    expect(`payload "${label}" → not a 500`, r.status !== 500, `got ${r.status} ${r.text.slice(0, 100)}`);
  }
  const v = await karan.get(`/api/rooms/${A.id}`);
  const p = v.json?.me?.prefs;
  expect("junk never stored as slots/vibes", Array.isArray(p?.slots ?? []) && Array.isArray(p?.vibes ?? []), JSON.stringify(p));
  expect("__proto__ didn't grant anything", v.json?.viewer?.coordinator === false, JSON.stringify(v.json?.viewer));
  // coordinator focusing a forged key: out-of-window date or silly days
  const forged = [`eng:goa:2099-01-02:3`, `eng:goa:${add(today, -30)}:3`, `eng:goa:${add(today, 10)}:9`, `eng:../../x:${add(today, 10)}:3`];
  for (const key of forged) {
    const r = await A.riya.post(`/api/rooms/${A.id}/action`, { type: "focus", payload: { key } });
    expect(`forged focus key ${key} refused`, clientErr(r), `got ${r.status} ${r.text.slice(0, 100)}`);
  }
  const extPast = await A.riya.post(`/api/rooms/${A.id}/action`, { type: "extend", payload: { deadline_at: "2020-01-01T00:00:00Z" } });
  expect("extend into the past refused", clientErr(extPast), `got ${extPast.status}`);
  const note = await karan.post(`/api/rooms/${A.id}/action`, { type: "preferences", payload: { note_private: "x".repeat(15000) } });
  expect("15k-char note handled (413 or truncated)", note.status === 413 || ok(note), `got ${note.status}`);
}

// ---------------------------------------------------------------- headers
{
  const r = await fetch(`${B}/api/rooms/${A.id}`);
  expect("API responses are no-store", (r.headers.get("cache-control") ?? "").includes("no-store"), r.headers.get("cache-control"));
  const page = await fetch(`${B}/room/${A.id}`);
  expect("pages send X-Frame-Options DENY", page.headers.get("x-frame-options") === "DENY", page.headers.get("x-frame-options"));
  expect("no X-Powered-By header", !page.headers.get("x-powered-by"), page.headers.get("x-powered-by"));
  const cookieHdr = (await new Client().post(`/api/rooms`, { name: "C", coordinator: "R", members: ["R", "A"], trip_days: 3, window_start: add(today, 3), window_end: add(today, 40) })).status;
  expect("create still works after abuse", cookieHdr === 200, `got ${cookieHdr}`);
}

console.log(`\n${n} checks, ${findings.length} findings`);
for (const f of findings) console.log("  FINDING: " + f);
