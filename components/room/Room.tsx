"use client";
import { useCallback, useEffect, useState } from "react";
import type { RoomView } from "@/lib/projection";
import { ErrorNote, Footer, Wordmark } from "../ui";
import { Compare } from "./Compare";
import { DemoBar } from "./DemoBar";
import { History } from "./History";
import { JoinScreen } from "./JoinScreen";
import { People } from "./People";
import { Preferences } from "./Preferences";
import { YourTrip } from "./YourTrip";

export type ApiError = { message: string; code?: string; details?: unknown } | null;
export type Act = (type: string, payload?: Record<string, unknown>) => Promise<boolean>;
export type Ai = <T = Record<string, unknown>>(job: string) => Promise<T | null>;
export type Tab = "trip" | "compare" | "prefs" | "history";

const TABS: { id: Tab; label: string; short: string }[] = [
  { id: "trip", label: "Your trip", short: "Your trip" },
  { id: "compare", label: "Compare ideas", short: "Compare" },
  { id: "prefs", label: "Your preferences", short: "Preferences" },
  { id: "history", label: "History", short: "History" },
];

function countdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "deadline passed";
  const h = Math.floor(ms / 3600_000);
  if (h >= 48) return `${Math.floor(h / 24)} days left`;
  if (h >= 1) return `${h} hour${h === 1 ? "" : "s"} left`;
  return `${Math.max(1, Math.floor(ms / 60_000))} min left`;
}

export function Room({ id, initialAs }: { id: string; initialAs: string | null }) {
  const [viewAs, setViewAs] = useState<string | null>(initialAs);
  const [view, setView] = useState<RoomView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<ApiError>(null);
  const [tab, setTab] = useState<Tab>("trip");
  const [busy, setBusy] = useState(false);

  const qs = viewAs ? `?as=${encodeURIComponent(viewAs)}` : "";
  const load = useCallback(async () => {
    const r = await fetch(`/api/rooms/${id}${qs}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) return setLoadError(j.error ?? "Couldn't open this room.");
    setView(j);
  }, [id, qs]);

  useEffect(() => {
    (async () => {
      const m = /^#c=([A-Za-z0-9_-]+)$/.exec(location.hash);
      if (m) {
        await fetch(`/api/rooms/${id}/coordinator`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: m[1] }) });
        try {
          localStorage.setItem(`cg_coord_${id}`, location.href);
        } catch {}
        history.replaceState(null, "", location.pathname + location.search);
      }
      await load();
    })();
  }, [id, load]);

  // Keep the shared state fresh (other people answer from their own phones).
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && !busy && load(), 20_000);
    const f = () => load();
    window.addEventListener("focus", f);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", f);
    };
  }, [load, busy]);

  const post = useCallback(
    async (url: string, body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, as: viewAs ?? undefined }) });
        const j = await r.json();
        if (!r.ok) {
          setError({ message: j.error ?? "That didn't work.", code: j.code, details: j.details });
          return false;
        }
        setView(j.view ?? j);
        return true;
      } catch {
        setError({ message: "You seem to be offline. Nothing was saved." });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [viewAs],
  );

  const act: Act = useCallback((type, payload = {}) => post(`/api/rooms/${id}/action`, { type, payload }), [id, post]);
  const demo = useCallback((step: string) => post(`/api/rooms/${id}/demo`, { step }), [id, post]);
  const ai: Ai = useCallback(
    async (job) => {
      try {
        const r = await fetch(`/api/rooms/${id}/ai`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job, as: viewAs ?? undefined }) });
        return r.ok ? await r.json() : null;
      } catch {
        return null;
      }
    },
    [id, viewAs],
  ) as Ai;

  if (loadError)
    return (
      <main className="mx-auto max-w-read px-4 py-16">
        <Wordmark />
        <h1 className="mt-10 text-3xl">This link doesn't open a room</h1>
        <p className="mt-3 text-muted">{loadError}</p>
        <a className="btn-primary mt-6" href="/">Go to the start page</a>
      </main>
    );
  if (!view) return <main className="mx-auto max-w-5xl px-4 py-16 text-muted" aria-busy="true">Opening the room…</main>;

  const v = view;
  const isCoord = v.viewer.coordinator;
  const invite = v.coordinator?.inviteUrl ?? `https://wa.me/?text=${encodeURIComponent(`Add your trip limits here (about 2 minutes, budgets stay private): ${typeof window !== "undefined" ? location.origin : ""}/room/${v.room.id}`)}`;

  return (
    <>
      {v.room.isDemo && (
        <DemoBar
          view={v}
          viewAs={viewAs ?? v.viewer.name ?? "Karan"}
          busy={busy}
          onViewAs={(n) => {
            setViewAs(n);
            const u = new URL(location.href);
            u.searchParams.set("as", n);
            history.replaceState(null, "", u.toString());
          }}
          onStep={async (s) => {
            await demo(s);
            if (s === "reset" || s === "three") setTab("trip");
          }}
        />
      )}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4">
          <div className="min-w-0">
            <Wordmark small />
            <h1 className="mt-1 truncate text-2xl">{v.room.name}</h1>
            <p className="text-sm text-muted">
              Reply by {v.room.deadlineLabel} · {countdown(v.room.deadlineAt)}
              {v.room.status !== "open" && <strong className="ml-2 text-limit">Room {v.room.status}</strong>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isCoord && v.coordinator && (
              <a className="btn-quiet" href={v.coordinator.updateUrl} target="_blank" rel="noreferrer">Share an update</a>
            )}
            <a className="btn-quiet" href={invite} target="_blank" rel="noreferrer">
              Invite friends <span aria-hidden="true">↗</span>
              <span className="sr-only">(opens WhatsApp)</span>
            </a>
          </div>
        </div>
      </header>

      {!v.viewer.name && !v.room.isDemo ? (
        <JoinScreen view={v} roomId={id} onJoined={(nv) => setView(nv)} />
      ) : (
        <div className="mx-auto max-w-5xl px-4 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10">
          <aside className="pt-4 lg:pt-8">
            <People view={v} roomId={id} />
          </aside>
          <main className="min-w-0 pb-6 pt-4 lg:pt-8" id="main">
            <nav aria-label="Room sections" className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4">
              <ul className="flex min-w-max gap-1" role="tablist">
                {TABS.map((t) => (
                  <li key={t.id} role="presentation">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === t.id}
                      onClick={() => setTab(t.id)}
                      aria-label={t.label}
                      className={`min-h-[44px] border-b-[3px] px-2.5 font-bold sm:px-3 ${tab === t.id ? "border-forest text-forest" : "border-transparent text-muted hover:text-ink"}`}
                    >
                      <span className="sm:hidden">{t.short}</span>
                      <span className="hidden sm:inline">{t.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
            <ErrorNote message={error && error.code !== "blocked" ? error.message : null} />
            <div role="tabpanel">
              {tab === "trip" && <YourTrip view={v} act={act} ai={ai} busy={busy} error={error} clearError={() => setError(null)} goTo={setTab} />}
              {tab === "compare" && <Compare view={v} act={act} busy={busy} />}
              {tab === "prefs" && <Preferences key={`${v.viewer.name}-${v.me?.prefs?.updated_at ?? ""}`} view={v} act={act} ai={ai} busy={busy} onSaved={() => setTab("trip")} />}
              {tab === "history" && <History view={v} />}
            </div>
          </main>
        </div>
      )}
      <Footer />
    </>
  );
}
