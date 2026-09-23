"use client";
import { useState } from "react";
import type { RoomView } from "@/lib/projection";
import { CopyButton, ErrorNote } from "../ui";

export function JoinScreen({ view, roomId, onJoined }: { view: RoomView; roomId: string; onJoined: (v: RoomView) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState<{ link: string; view: RoomView } | null>(null);

  if (joined)
    return (
      <main className="mx-auto max-w-read px-4 py-10">
        <h2 className="text-2xl">You're in, {joined.view.viewer.name}</h2>
        <p className="mt-3">
          This is your private link. Save it somewhere (Notes, or message it to yourself). It's the only way back in as you on another phone or browser.
        </p>
        <div className="mt-4 flex gap-2">
          <input readOnly value={joined.link} className="field min-w-0 flex-1 text-sm" aria-label="Your private link" onFocus={(e) => e.target.select()} />
          <CopyButton text={joined.link} />
        </div>
        <button type="button" className="btn-primary mt-6" onClick={() => onJoined(joined.view)}>
          Continue to the trip
        </button>
      </main>
    );

  return (
    <main className="mx-auto max-w-read px-4 py-10">
      <h2 className="text-2xl">Who are you?</h2>
      <p className="mt-2 text-muted">Tap your name. Each name can be claimed once, so nobody can answer as you.</p>
      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {view.people.map((p) => (
          <li key={p.name}>
            <button
              type="button"
              disabled={p.joined || busy}
              className="btn-quiet w-full justify-between text-left disabled:opacity-60"
              onClick={async () => {
                setBusy(true);
                setErr(null);
                const r = await fetch(`/api/rooms/${roomId}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: p.name }) });
                const j = await r.json();
                setBusy(false);
                if (!r.ok) return setErr(j.error ?? "Couldn't join.");
                const link = `${location.origin}/r/${roomId}#k=${j.recoveryToken}`;
                try {
                  localStorage.setItem(`cg_recovery_${roomId}`, link);
                } catch {}
                setJoined({ link, view: j.view });
              }}
            >
              <span>{p.name}</span>
              <span className="text-sm font-normal text-muted">{p.joined ? "Already joined" : p.isCoordinator ? "Coordinator" : ""}</span>
            </button>
          </li>
        ))}
      </ul>
      <ErrorNote message={err} />
      <p className="hint mt-6">Already joined on another device? Open the private link you saved when you joined.</p>
      <section className="mt-8 rounded-lg bg-sage px-4 py-3 text-sm leading-relaxed">
        <p className="font-bold">How this room decides</p>
        <p className="mt-1">{view.policy}</p>
      </section>
    </main>
  );
}
