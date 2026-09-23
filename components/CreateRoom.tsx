"use client";
import { useMemo, useState } from "react";
import { CopyButton, ErrorNote } from "./ui";

const addDays = (d: string, n: number) => {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const todayIST = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

type Created = { id: string; coordinatorToken: string; recoveryToken: string; name: string };

export function TryDemo({ className = "btn-primary" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const r = await fetch("/api/demo", { method: "POST" });
          const j = await r.json();
          if (!r.ok) {
            setErr(j.error ?? "Couldn't start the demo.");
            setBusy(false);
            return;
          }
          location.href = `/room/${j.id}?as=Karan`;
        }}
      >
        {busy ? "Setting up the demo…" : "Try the demo"}
      </button>
      <ErrorNote message={err} />
    </>
  );
}

export function CreateRoom({ policy }: { policy: string }) {
  const today = todayIST();
  const [name, setName] = useState("Our trip");
  const [me, setMe] = useState("");
  const [friends, setFriends] = useState(["", "", "", ""]);
  const [days, setDays] = useState(3);
  const [start, setStart] = useState(addDays(today, 7));
  const [end, setEnd] = useState(addDays(today, 63));
  const [deadline, setDeadline] = useState(addDays(today, 3));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Created | null>(null);
  const origin = typeof window !== "undefined" ? location.origin : "";

  const links = useMemo(
    () =>
      done && {
        group: `${origin}/room/${done.id}`,
        coord: `${origin}/room/${done.id}#c=${done.coordinatorToken}`,
        recovery: `${origin}/r/${done.id}#k=${done.recoveryToken}`,
      },
    [done, origin],
  );

  if (done && links) {
    try {
      localStorage.setItem(`cg_recovery_${done.id}`, links.recovery);
      localStorage.setItem(`cg_coord_${done.id}`, links.coord);
    } catch {}
    return (
      <div className="panel p-5 sm:p-6">
        <h3 className="text-xl">Your room is ready</h3>
        <p className="mt-1 text-muted">Three links. Only the first one goes in the group chat.</p>
        <LinkRow title="Group link" note="Share this in WhatsApp. Everyone taps their own name." url={links.group} />
        <LinkRow title="Your coordinator link" note="Private. It lets you set the deadline and focus, and send reminders. It can't answer for anyone." url={links.coord} />
        <LinkRow title="Your private link" note="Private. Gets you back in as yourself on another phone." url={links.recovery} />
        <a className="btn-primary mt-5 w-full sm:w-auto" href={`/room/${done.id}`}>
          Open the room
        </a>
      </div>
    );
  }

  return (
    <form
      className="panel space-y-5 p-5 sm:p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        setBusy(true);
        const [h, m] = [21, 0];
        const deadlineAt = new Date(Date.UTC(+deadline.slice(0, 4), +deadline.slice(5, 7) - 1, +deadline.slice(8, 10), h, m) - 5.5 * 3600_000).toISOString();
        const r = await fetch("/api/rooms", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, coordinator: me, members: [me, ...friends.filter((f) => f.trim())], trip_days: days, window_start: start, window_end: end, deadline_at: deadlineAt }),
        });
        const j = await r.json();
        setBusy(false);
        if (!r.ok) return setErr(j.error ?? "Couldn't create the room.");
        setDone(j);
      }}
    >
      <div>
        <label className="label" htmlFor="rname">Trip name</label>
        <input id="rname" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
      </div>
      <div>
        <label className="label" htmlFor="me">Your name</label>
        <input id="me" className="field" value={me} onChange={(e) => setMe(e.target.value)} maxLength={30} placeholder="Riya" required />
        <p className="hint mt-1">You'll coordinate. You answer for yourself like everyone else.</p>
      </div>
      <fieldset>
        <legend className="label">Friends' names</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {friends.map((f, i) => (
            <input
              key={i}
              aria-label={`Friend ${i + 1}`}
              className="field"
              value={f}
              maxLength={30}
              placeholder={["Siddharth", "Karan", "Aisha", "Preethi"][i] ?? "Name"}
              onChange={(e) => setFriends(friends.map((x, j) => (j === i ? e.target.value : x)))}
            />
          ))}
        </div>
        {friends.length < 11 && (
          <button type="button" className="btn-link mt-1" onClick={() => setFriends([...friends, ""])}>
            Add another person
          </button>
        )}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="days">Trip length</label>
          <select id="days" className="field" value={days} onChange={(e) => setDays(+e.target.value)}>
            {[2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>{d} days{d === 2 ? " (Sat–Sun)" : " (from a Friday)"}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="dl">Reply by (9 PM IST)</label>
          <input id="dl" type="date" className="field" value={deadline} min={addDays(today, 1)} onChange={(e) => setDeadline(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="ws">Earliest start</label>
          <input id="ws" type="date" className="field" value={start} min={today} onChange={(e) => setStart(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="we">Latest start</label>
          <input id="we" type="date" className="field" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
          <p className="hint mt-1">Between 1 week and 4 months.</p>
        </div>
      </div>
      <p className="rounded-lg bg-sage px-4 py-3 text-sm leading-relaxed">{policy}</p>
      <ErrorNote message={err} />
      <button className="btn-primary w-full sm:w-auto" disabled={busy}>
        {busy ? "Creating…" : "Create the room"}
      </button>
    </form>
  );
}

function LinkRow({ title, note, url }: { title: string; note: string; url: string }) {
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="font-bold">{title}</p>
      <p className="hint">{note}</p>
      <div className="mt-2 flex gap-2">
        <input readOnly value={url} className="field min-w-0 flex-1 text-sm" aria-label={title} onFocus={(e) => e.target.select()} />
        <CopyButton text={url} />
      </div>
    </div>
  );
}
