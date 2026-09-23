"use client";
import { useState } from "react";
import { ACTIVITIES, DESTINATIONS } from "@/lib/catalogue";
import type { IdeaView, RoomView } from "@/lib/projection";
import { inr } from "@/lib/util";
import { ErrorNote, StatusPill } from "../ui";
import type { Act } from "./Room";

const ANSWER: Record<string, string> = { yes: "Said yes", reopened: "Reopened", change: "Needs a change", cannot: "Can't join", none: "No answer" };

function badge(i: IdeaView) {
  if (i.counts.limit) return `${i.counts.limit} limit${i.counts.limit > 1 ? "s" : ""} unmet`;
  if (i.counts.check) return `No unmet limits, ${i.counts.check} to check`;
  return "No unmet limits";
}

export function Compare({ view, act, busy }: { view: RoomView; act: Act; busy: boolean }) {
  const isCoord = !!view.coordinator;
  const [adding, setAdding] = useState(false);
  if (!view.suggestionsReady && view.ideas.length === 0)
    return (
      <div className="max-w-read">
        <h2 className="text-2xl">Compare ideas</h2>
        <p className="mt-2 text-muted">Ideas appear once {Math.min(3, view.counts.total)} people have added preferences ({view.counts.complete}/{view.counts.total} so far).</p>
      </div>
    );
  return (
    <div>
      <div className="max-w-read">
        <h2 className="text-2xl">Compare ideas</h2>
        <p className="mt-1 text-muted">Your estimate is yours alone; everyone else appears as a fit label.{view.counts.complete < view.counts.total ? " Provisional until everyone has added preferences." : ""}</p>
      </div>
      <ul className="mt-5 grid gap-4 xl:grid-cols-3">
        {view.ideas.map((i) => (
          <li key={i.key} className={`flex flex-col rounded-xl border bg-surface ${i.isFocus ? "border-2 border-forest" : "border-line"}`}>
            <div className="px-4 pb-3 pt-4">
              {i.isFocus && <p className="mb-1 text-sm font-bold text-[#6B4712]"><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-marigold align-middle" aria-hidden="true" />Up for review</p>}
              <h3 className="text-xl">{i.name}</h3>
              <p className="text-sm text-muted">{i.dates}{i.place ? `, ${i.place}` : ""}</p>
              <p className="text-sm text-muted">{i.leave[0].toUpperCase() + i.leave.slice(1)}{i.source !== "engine" ? `, ${i.source === "variant" ? "variant" : "added by the coordinator"}` : ""}</p>
              {i.season && <p className={`mt-1 text-sm ${i.offSeason ? "font-bold text-limit" : "text-muted"}`}>{i.season}</p>}
              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-muted">Your estimate</p>
                  <p className="font-serif text-2xl font-semibold">{i.mine?.estimate ? inr(i.mine.estimate.mid) : "Not yet"}</p>
                </div>
                {i.mine && <StatusPill status={i.mine.status} label={i.mine.statusLabel} size="sm" />}
              </div>
              <p className={`mt-3 inline-block rounded-md px-2 py-0.5 text-sm font-bold ${i.counts.limit ? "bg-limitbg text-limit" : "bg-sage"}`}>{badge(i)}</p>
            </div>
            <ul className="flex-1 border-t border-line px-4 py-2 text-sm">
              {i.people.map((p) => (
                <li key={p.name} className="flex min-h-[36px] items-center justify-between gap-2">
                  <span className="font-bold">{p.name}{i.isFocus && p.answer ? <span className="font-normal text-muted">, {ANSWER[p.answer]}</span> : null}</span>
                  <StatusPill status={p.status} label={p.statusLabel} size="sm" />
                </li>
              ))}
            </ul>
            {isCoord && !i.isFocus && view.room.status === "open" && (
              <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
                <button type="button" className="btn-quiet flex-1" disabled={busy} onClick={() => confirm(`Put ${i.name} up for review? Everyone answers fresh for it; earlier answers stay in History.`) && act("focus", { key: i.key })}>
                  Put up for review
                </button>
                {i.stored && (
                  <button type="button" className="btn-quiet" disabled={busy} onClick={() => act("remove_idea", { id: i.key })}>Remove</button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-5 max-w-read text-sm text-muted"><strong className="text-ink">How ideas are ordered.</strong> {view.orderingRule}</p>
      {isCoord && view.room.status === "open" && (
        <div className="mt-6 max-w-read">
          {adding ? <AddIdea view={view} act={act} busy={busy} onDone={() => setAdding(false)} /> : (
            <button type="button" className="btn-quiet" onClick={() => setAdding(true)}>Add your own idea</button>
          )}
        </div>
      )}
    </div>
  );
}

function AddIdea({ view, act, busy, onDone }: { view: RoomView; act: Act; busy: boolean; onDone: () => void }) {
  const [mode, setMode] = useState<"catalogue" | "custom">("catalogue");
  const [dest, setDest] = useState(DESTINATIONS[0].id);
  const [name, setName] = useState("");
  const [start, setStart] = useState(view.slots[0]?.start ?? "");
  const [days, setDays] = useState(view.room.tripDays);
  const [est, setEst] = useState("");
  const [acts, setActs] = useState<string[]>([]);
  const [assume, setAssume] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="panel space-y-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        const payload = mode === "catalogue"
          ? { destination_id: dest, start_date: start, days, shared_assumptions: assume }
          : { destination_id: null, name, start_date: start, days, default_estimate: Number(est), activities: acts, shared_assumptions: assume };
        if (await act("add_idea", payload)) onDone();
        else setErr("Check the fields and try again.");
      }}
    >
      <h3 className="text-xl">Add an idea</h3>
      <p className="hint">Adding an idea doesn't change anything anyone has already agreed to.</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kind of idea">
        <label className="chip"><input type="radio" className="sr-only" checked={mode === "catalogue"} onChange={() => setMode("catalogue")} />From our list (we estimate)</label>
        <label className="chip"><input type="radio" className="sr-only" checked={mode === "custom"} onChange={() => setMode("custom")} />Somewhere else</label>
      </div>
      {mode === "catalogue" ? (
        <div>
          <label className="label" htmlFor="adest">Destination</label>
          <select id="adest" className="field" value={dest} onChange={(e) => setDest(e.target.value)}>
            {DESTINATIONS.map((d) => <option key={d.id} value={d.id}>{d.name}, {d.state}</option>)}
          </select>
        </div>
      ) : (
        <>
          <div>
            <label className="label" htmlFor="aname">Place</label>
            <input id="aname" className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
          </div>
          <div>
            <label className="label" htmlFor="aest">All-in estimate per person (₹)</label>
            <input id="aest" className="field" inputMode="numeric" value={est} onChange={(e) => setEst(e.target.value.replace(/[^\d]/g, ""))} required />
            <p className="hint mt-1">Shown to everyone as "Coordinator estimate". Each person can correct their own.</p>
          </div>
          <fieldset>
            <legend className="label">It involves</legend>
            <div className="flex flex-wrap gap-2">
              {ACTIVITIES.map((a) => (
                <label key={a.id} className="chip">
                  <input type="checkbox" className="sr-only" checked={acts.includes(a.id)} onChange={(e) => setActs(e.target.checked ? [...acts, a.id] : acts.filter((x) => x !== a.id))} />
                  {a.label}
                </label>
              ))}
            </div>
            <p className="hint mt-1">So we can check everyone's won't-do list. Travel time can't be estimated for places outside our list.</p>
          </fieldset>
        </>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="astart">Start</label>
          <select id="astart" className="field" value={start} onChange={(e) => setStart(e.target.value)}>
            {view.slots.map((s) => <option key={s.start} value={s.start}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="adays">Days</label>
          <select id="adays" className="field" value={days} onChange={(e) => setDays(+e.target.value)}>
            {[2, 3, 4, 5].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="aassume">Shared assumptions (optional)</label>
        <input id="aassume" className="field" maxLength={200} value={assume} onChange={(e) => setAssume(e.target.value)} placeholder="Shared homestay, 2 per room" />
      </div>
      <ErrorNote message={err} />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>Add idea</button>
        <button type="button" className="btn-quiet" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}
