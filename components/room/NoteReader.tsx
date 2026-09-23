"use client";
import { useState } from "react";
import { wontDoLabel } from "@/lib/catalogue";
import type { RoomView } from "@/lib/projection";
import type { ParsedLimit } from "@/lib/types";
import type { Act, Ai } from "./Room";

function describe(l: ParsedLimit, view: RoomView): string {
  switch (l.kind) {
    case "max_leave_days": return `You can take at most ${l.value} weekday${l.value === 1 ? "" : "s"} off`;
    case "max_travel_hours": return `At most ${l.value} hours of travel each way`;
    case "add_wont_do": return `Won't do: ${wontDoLabel(l.value).toLowerCase()}`;
    case "unavailable_slots": return `Not free: ${l.value.map((s) => view.slots.find((x) => x.start === s)?.label ?? s).join("; ")}`;
    case "info_only": return `Noted, not a limit: ${l.value}`;
  }
}

/** P1-2: Gemini reads only your own saved note; nothing counts until you confirm it. */
export function NoteReader({ view, act, ai, busy }: { view: RoomView; act: Act; ai: Ai; busy: boolean }) {
  const saved = view.me?.prefs?.parsed_limits ?? [];
  const note = view.me?.prefs?.note_private ?? "";
  const [items, setItems] = useState<ParsedLimit[]>(saved);
  const [msg, setMsg] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  if (!note) return null;
  const dirty = JSON.stringify(items) !== JSON.stringify(saved);

  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-4">
      <p className="font-bold">Limits from your note</p>
      <p className="hint">Only items you tick count as limits. Unticked items are ignored.</p>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((l, i) => (
            <li key={i}>
              {l.kind === "info_only" ? (
                <p className="text-sm text-muted">{describe(l, view)}</p>
              ) : (
                <label className="flex min-h-[44px] items-center gap-3 rounded-lg border border-line px-3 has-[:checked]:border-forest has-[:checked]:bg-fitbg">
                  <input type="checkbox" className="h-5 w-5 accent-[#1E4A38]" checked={l.confirmed} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, confirmed: e.target.checked } as ParsedLimit : x)))} />
                  <span>{describe(l, view)}</span>
                </label>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Nothing read from your note yet.</p>
      )}
      {msg && <p role="status" className="mt-2 text-sm font-bold">{msg}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-quiet"
          disabled={reading || busy}
          onClick={async () => {
            setReading(true);
            setMsg(null);
            const r = await ai<{ items: ParsedLimit[]; reason: string }>("parse_note");
            setReading(false);
            if (!r || r.reason === "no_key" || r.reason === "failed") {
              setMsg("We couldn't read your note automatically, so it stays unchecked. Add any limits using the fields above instead.");
              return;
            }
            setItems(r.items);
            setMsg(r.items.length ? "We read your note as the items above. Tick the ones that are right." : "We didn't find any limits in your note.");
          }}
        >
          {reading ? "Reading…" : "Read my note for limits"}
        </button>
        {dirty && (
          <button type="button" className="btn-primary" disabled={busy} onClick={async () => { if (await act("preferences", { parsed_limits: items })) setMsg("Saved. Only ticked items count."); }}>
            Save these
          </button>
        )}
      </div>
    </div>
  );
}
