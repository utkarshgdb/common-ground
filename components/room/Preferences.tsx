"use client";
import { useState } from "react";
import { CITIES, DEALBREAKERS, VIBES } from "@/lib/catalogue";
import type { RoomView } from "@/lib/projection";
import type { Act } from "./Room";

type Form = {
  home_city: string; budget_max: string; budget_comfortable: string; slots: string[]; vibes: string[]; wont_do: string[];
  max_travel_hours: string; leave_days: string; note_private: string;
};

const s = (n: number | null | undefined) => (n == null ? "" : String(n));
const num = (v: string) => (v.trim() === "" ? null : Number(v));

export function Preferences({ view, act, busy, onSaved }: { view: RoomView; act: Act; busy: boolean; onSaved: () => void }) {
  const p = view.me?.prefs;
  const [f, setF] = useState<Form>({
    home_city: p?.home_city ?? "", budget_max: s(p?.budget_max), budget_comfortable: s(p?.budget_comfortable), slots: p?.slots ?? [],
    vibes: p?.vibes ?? [], wont_do: p?.wont_do ?? [], max_travel_hours: s(p?.max_travel_hours), leave_days: s(p?.leave_days), note_private: p?.note_private ?? "",
  });
  const [more, setMore] = useState(!!(p?.max_travel_hours != null || p?.leave_days != null || p?.note_private));
  const [saved, setSaved] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setSaved(null);
    setF({ ...f, [k]: v });
  };
  const toggle = (k: "slots" | "vibes" | "wont_do", id: string, max?: number) => {
    const has = f[k].includes(id);
    if (!has && max && f[k].length >= max) return;
    set(k, has ? f[k].filter((x) => x !== id) : [...f[k], id]);
  };
  const missing = [!f.home_city && "home city", !f.budget_max && "max budget", f.slots.length === 0 && "at least one date"].filter(Boolean) as string[];

  if (!view.viewer.name) return <p className="text-muted">Tap your name first to add preferences.</p>;

  return (
    <form
      className="max-w-read space-y-8"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await act("preferences", {
          home_city: f.home_city || null, budget_max: num(f.budget_max), budget_comfortable: num(f.budget_comfortable), slots: f.slots,
          vibes: f.vibes, wont_do: f.wont_do, max_travel_hours: num(f.max_travel_hours), leave_days: num(f.leave_days), note_private: f.note_private,
        });
        if (ok) {
          setSaved(missing.length ? `Saved. Still needed: ${missing.join(", ")}.` : "Saved.");
          if (!missing.length) onSaved();
        }
      }}
    >
      <div>
        <h2 className="text-2xl">Your preferences</h2>
        <p className="mt-1 text-muted">About two minutes. You can save part-way. Your budget, dates and notes are never shown to anyone else.</p>
        {view.people.find((x) => x.isMe)?.answer === "yes" && (
          <p className="mt-3 rounded-lg bg-compbg px-3 py-2 text-sm">Changing a limit reopens your own yes (and nobody else's). Saving the same values changes nothing.</p>
        )}
      </div>

      <section className="space-y-4">
        <div>
          <label className="label" htmlFor="city">Home city</label>
          <select id="city" className="field" value={f.home_city} onChange={(e) => set("home_city", e.target.value)}>
            <option value="">Choose your city</option>
            {CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="bmax">Max budget, all-in (₹)</label>
            <input id="bmax" className="field" inputMode="numeric" value={f.budget_max} onChange={(e) => set("budget_max", e.target.value.replace(/[^\d]/g, ""))} placeholder="18000" />
            <p className="hint mt-1">Travel, stay, food. Anything above this is a hard limit.</p>
          </div>
          <div>
            <label className="label" htmlFor="bcom">Comfortable budget (optional)</label>
            <input id="bcom" className="field" inputMode="numeric" value={f.budget_comfortable} onChange={(e) => set("budget_comfortable", e.target.value.replace(/[^\d]/g, ""))} placeholder="15000" />
            <p className="hint mt-1">Above this is a compromise, not a limit.</p>
          </div>
        </div>
      </section>

      <fieldset>
        <legend className="text-xl font-serif font-semibold">Which dates work?</legend>
        <p className="hint">Tick every start date you could do. Unticked means a hard no.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {view.slots.map((sl) => (
            <li key={sl.start}>
              <label className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 has-[:checked]:border-forest has-[:checked]:bg-fitbg">
                <input type="checkbox" className="h-5 w-5 accent-[#1E4A38]" checked={f.slots.includes(sl.start)} onChange={() => toggle("slots", sl.start)} />
                <span>
                  <span className="block font-bold">{sl.label}</span>
                  <span className="block text-sm text-muted">{sl.leave[0].toUpperCase() + sl.leave.slice(1)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="text-xl font-serif font-semibold">What kind of trip? <span className="font-sans text-base font-normal text-muted">(up to 3)</span></legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {VIBES.map((v) => (
            <label key={v.id} className="chip">
              <input type="checkbox" className="sr-only" checked={f.vibes.includes(v.id)} onChange={() => toggle("vibes", v.id, 3)} />
              {v.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xl font-serif font-semibold">Anything you won't do?</legend>
        <p className="hint">These are hard limits. Nobody can override them.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEALBREAKERS.map((d) => (
            <label key={d.id} className="chip">
              <input type="checkbox" className="sr-only" checked={f.wont_do.includes(d.id)} onChange={() => toggle("wont_do", d.id)} />
              {d.label}
            </label>
          ))}
        </div>
      </fieldset>

      <section>
        <button type="button" className="btn-link" aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? "Fewer details" : "More details (optional)"}
        </button>
        {more && (
          <div className="mt-3 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="mth">Max travel time, one way (hours)</label>
                <input id="mth" className="field" inputMode="numeric" value={f.max_travel_hours} onChange={(e) => set("max_travel_hours", e.target.value.replace(/[^\d]/g, ""))} />
              </div>
              <div>
                <label className="label" htmlFor="lv">Weekdays of leave you can take</label>
                <input id="lv" className="field" inputMode="numeric" value={f.leave_days} onChange={(e) => set("leave_days", e.target.value.replace(/[^\d]/g, ""))} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="pn">Private note</label>
              <textarea id="pn" className="field min-h-[88px]" maxLength={500} value={f.note_private} onChange={(e) => set("note_private", e.target.value)} placeholder="Only you can see this." />
              <p className="hint mt-1">Only you see this note. It isn't used as a limit.</p>
            </div>
          </div>
        )}
      </section>

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
        {saved && <p role="status" className="mb-2 text-sm font-bold text-forest">{saved}</p>}
        <button className="btn-primary w-full sm:w-auto" disabled={busy}>
          {missing.length ? "Save for now" : "Save my preferences"}
        </button>
        {missing.length > 0 && <span className="hint ml-0 mt-1 block sm:ml-3 sm:inline">Still needed to compare trips: {missing.join(", ")}.</span>}
      </div>
    </form>
  );
}
