"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Status } from "@/lib/engine";

export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <a href="/" className={`font-serif font-semibold tracking-tight text-forest ${small ? "text-lg" : "text-xl"}`} aria-label="Common Ground home">
      common ground
    </a>
  );
}

const PILL: Record<Status, string> = {
  limit: "bg-limitbg text-limit border-limit/30",
  check: "bg-surface text-ink border-ink/50 border-dashed",
  compromise: "bg-compbg text-[#6B4712] border-marigold/40",
  fits: "bg-fitbg text-forest border-forest/30",
};
const GLYPH: Record<Status, string> = { limit: "✕", check: "?", compromise: "~", fits: "✓" };

export function StatusPill({ status, label, size = "md" }: { status: Status | null; label?: string | null; size?: "sm" | "md" }) {
  if (!status) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-bold ${PILL[status]} ${size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"}`}>
      <span aria-hidden="true">{GLYPH[status]}</span>
      {label}
    </span>
  );
}

export type StripPerson = { name: string; state: string; isMe?: boolean };

/** The consent strip: one circle per person, filled only for a valid, current yes. */
export function ConsentStrip({ people, size = "md" }: { people: StripPerson[]; size?: "md" | "lg" }) {
  const d = size === "lg" ? "h-14 w-14 text-lg" : "h-11 w-11 text-base";
  const ring = (me?: boolean) => (me ? "ring-2 ring-marigold ring-offset-2 ring-offset-paper" : "");
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-3 sm:gap-x-3" aria-label="Where everyone stands">
      {people.map((p) => {
        const agreed = p.state === "Agreed";
        const cls = agreed
          ? "bg-forest border-forest text-white"
          : p.state === "Can't join"
            ? "border-limit text-limit bg-limitbg"
            : p.state === "Needs a change"
              ? "border-marigold text-[#6B4712] bg-compbg"
              : p.state === "Reopened"
                ? "border-forest border-dashed text-forest bg-surface"
                : "border-line text-muted bg-surface";
        return (
          <li key={p.name} className="flex w-[3.9rem] flex-col items-center text-center sm:w-[4.25rem]">
            <span className={`flex items-center justify-center rounded-full border-2 font-serif font-semibold ${d} ${cls} ${ring(p.isMe)}`} aria-hidden="true">
              {agreed ? (
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 10.5l4 4 8-9" /></svg>
              ) : (
                p.name.slice(0, 1)
              )}
            </span>
            <span className="mt-1 max-w-full truncate text-[0.78rem] font-bold sm:text-sm">{p.name}{p.isMe && <span className="sr-only"> (you)</span>}</span>
            <span className="text-xs leading-tight text-muted">{p.state}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function CopyButton({ text, label = "Copy", className = "btn-quiet" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const t = document.createElement("textarea");
          t.value = text;
          document.body.appendChild(t);
          t.select();
          document.execCommand("copy");
          t.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      <span aria-live="polite">{done ? "Copied" : label}</span>
    </button>
  );
}

/** A modal sheet (bottom sheet on mobile, centred dialog on desktop) built on <dialog> for focus handling. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className="m-0 mt-auto w-full max-w-none rounded-t-2xl bg-surface p-0 text-ink backdrop:bg-ink/40 sm:m-auto sm:max-w-lg sm:rounded-2xl"
    >
      {open && (
        <div className="max-h-[88vh] overflow-y-auto px-5 pb-6 pt-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-xl">{title}</h2>
            <button type="button" onClick={onClose} className="-mr-2 -mt-1 flex h-11 w-11 items-center justify-center rounded-full text-2xl text-muted hover:bg-sage" aria-label="Close">
              ×
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto mt-16 max-w-5xl border-t border-line px-4 py-6 text-sm text-muted">
      Estimates, not fares. Check prices and availability before booking.
    </footer>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 rounded-lg border border-limit/30 bg-limitbg px-3 py-2 text-sm font-bold text-limit">
      {message}
    </p>
  );
}
