"use client";
import type { RoomView } from "@/lib/projection";
import { formatIST } from "@/lib/util";

export function History({ view }: { view: RoomView }) {
  const name = (id: string | null) => view.ideas.find((i) => i.key === id)?.name ?? "the idea in focus";
  return (
    <div className="max-w-read space-y-8">
      <section>
        <h2 className="text-2xl">Deadline records</h2>
        {view.outcomes.length === 0 ? (
          <p className="mt-2 text-muted">Nothing recorded yet. When the reply deadline passes, the outcome is written here once and never rewritten.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {view.outcomes.map((o) => (
              <li key={o.deadline_at} className="rounded-lg border border-line bg-surface px-4 py-3">
                <p className="font-bold">
                  {o.result === "agreed" ? "Agreed" : "Unresolved"}, {o.valid_yes}/{o.total} yeses
                </p>
                <p className="text-sm text-muted">Deadline {formatIST(o.deadline_at)}, on {name(o.focus_option_id)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-2xl">What happened</h2>
        <ol className="mt-3 border-l-2 border-line">
          {view.history.map((h, i) => (
            <li key={i} className="relative pb-4 pl-5">
              <span className="absolute -left-[5px] top-2 h-2 w-2 rounded-full bg-forest" aria-hidden="true" />
              <p>{h.text}</p>
              <p className="text-xs text-muted">{formatIST(h.at)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
