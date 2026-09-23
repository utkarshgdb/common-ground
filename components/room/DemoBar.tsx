"use client";
import type { RoomView } from "@/lib/projection";

const STEPS: { id: string; label: string }[] = [
  { id: "fill", label: "1. Fill Karan's sample preferences" },
  { id: "simulate", label: "2. Simulate four friends" },
  { id: "deadline", label: "3. Reach deadline" },
];

export function DemoBar({ view, viewAs, busy, onViewAs, onStep }: {
  view: RoomView; viewAs: string; busy: boolean; onViewAs: (n: string) => void; onStep: (s: string) => void;
}) {
  return (
    <div className="bg-forest text-white">
      <div className="mx-auto max-w-5xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="font-serif text-lg font-semibold">Guided demo</p>
          <label className="flex items-center gap-2 text-sm font-bold">
            View as
            <select
              className="min-h-[44px] rounded-lg border border-white/40 bg-forest px-2 text-white"
              value={viewAs}
              onChange={(e) => onViewAs(e.target.value)}
            >
              {view.people.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}{p.isCoordinator ? " (coordinator)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Demo steps">
          {STEPS.map((s) => (
            <button key={s.id} type="button" disabled={busy} onClick={() => onStep(s.id)} className="min-h-[44px] rounded-lg bg-white px-3 text-sm font-bold text-forest hover:bg-sage disabled:opacity-60">
              {s.label}
            </button>
          ))}
          <button type="button" disabled={busy} onClick={() => onStep("three")} className="min-h-[44px] rounded-lg border border-white/50 px-3 text-sm font-bold hover:bg-white/10">
            Try 3/5
          </button>
          <button type="button" disabled={busy} onClick={() => onStep("reset")} className="min-h-[44px] rounded-lg border border-white/50 px-3 text-sm font-bold hover:bg-white/10">
            Reset
          </button>
        </div>
        <p className="mt-2 text-sm text-white/80">
          Demo only: simulated answers are labelled in History. In a real room nobody, including the coordinator, can answer for anyone else.
        </p>
      </div>
    </div>
  );
}
