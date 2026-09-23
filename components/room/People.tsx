"use client";
import { useEffect, useState } from "react";
import type { RoomView } from "@/lib/projection";
import { CopyButton } from "../ui";

const DOT: Record<string, string> = {
  Agreed: "bg-forest",
  Reopened: "border-2 border-dashed border-forest",
  "Needs a change": "bg-marigold",
  "Can't join": "bg-limit",
  "Ready to respond": "border-2 border-forest",
  "Preferences incomplete": "border-2 border-line",
};

export function People({ view, roomId }: { view: RoomView; roomId: string }) {
  const [recovery, setRecovery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setRecovery(localStorage.getItem(`cg_recovery_${roomId}`));
    } catch {}
    setOpen(window.matchMedia("(min-width: 1024px)").matches);
  }, [roomId]);

  const { complete, validYes, total } = view.counts;
  return (
    <details open={open} className="group rounded-xl border border-line bg-surface lg:sticky lg:top-6" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between px-4 py-3">
        <span>
          <span className="block font-serif text-lg font-semibold">People</span>
          <span className="block text-sm text-muted">{complete}/{total} complete preferences, {validYes}/{total} current yeses</span>
        </span>
        <span aria-hidden="true" className="text-xl text-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-line px-4 pb-4 pt-3">
        <ul className="space-y-1">
          {view.people.map((p) => (
            <li key={p.name} className="flex min-h-[40px] items-center gap-3">
              <span className={`h-3 w-3 shrink-0 rounded-full ${DOT[p.state] ?? "border-2 border-line"}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="font-bold">{p.name}</span>
                {p.isMe && <span className="text-muted"> (you)</span>}
                {p.isCoordinator && <span className="text-sm text-muted">, coordinator</span>}
                <span className="block text-sm text-muted">{p.state === "Reopened" ? `Reopened: please re-confirm` : p.state}</span>
              </span>
            </li>
          ))}
        </ul>

        <section className="mt-4 rounded-lg bg-sage px-3 py-3 text-sm leading-relaxed">
          <p className="font-bold">How this room decides</p>
          <p className="mt-1">{view.policy}</p>
          <p className="mt-2 text-muted">{view.privacyNote}</p>
        </section>

        {!view.room.isDemo && view.viewer.name && (
          <section className="mt-4 text-sm">
            <p className="font-bold">Your private access</p>
            {recovery ? (
              <>
                <p className="text-muted">Opens this room as you on another device. Don't share it.</p>
                <div className="mt-2"><CopyButton text={recovery} label="Copy my private link" /></div>
              </>
            ) : (
              <p className="text-muted">Your private link isn't saved on this device.</p>
            )}
            <button
              type="button"
              className="btn-link text-sm"
              onClick={async () => {
                if (!confirm("Make a new private link? Your old one will stop working.")) return;
                const r = await fetch(`/api/rooms/${roomId}/recovery-link`, { method: "POST" });
                const j = await r.json();
                if (!r.ok) return alert(j.error);
                const link = `${location.origin}/r/${roomId}#k=${j.recoveryToken}`;
                try {
                  localStorage.setItem(`cg_recovery_${roomId}`, link);
                } catch {}
                setRecovery(link);
              }}
            >
              Make a new private link
            </button>
          </section>
        )}
      </div>
    </details>
  );
}
