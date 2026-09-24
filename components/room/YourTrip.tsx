"use client";
import { useEffect, useState } from "react";
import type { RoomView } from "@/lib/projection";
import { inr, formatIST } from "@/lib/util";
import { ConsentStrip, StatusPill } from "../ui";
import { NextStep } from "./NextStep";
import type { Act, Ai, ApiError, Tab } from "./Room";
import { AgreeSheet, Blockers, ChangeSheet, CorrectSheet, EstimateBlock } from "./Sheets";

const ANSWER_WORD: Record<string, string> = {
  yes: "Said yes",
  reopened: "Reopened",
  change: "Needs a change",
  cannot: "Can't join",
  none: "No answer yet",
};

export function YourTrip({ view, act, ai, busy, error, clearError, goTo }: {
  view: RoomView; act: Act; ai: Ai; busy: boolean; error: ApiError; clearError: () => void; goTo: (t: Tab) => void;
}) {
  const [sheet, setSheet] = useState<null | "agree" | "change" | "cannot" | "correct">(null);
  const open = (s: typeof sheet) => {
    clearError();
    setSheet(s);
  };
  const f = view.focus;
  const me = view.people.find((p) => p.isMe);
  const mine = f?.mine;
  const outcome = view.deadline.outcome;
  const onFix = (fix: string) => (fix === "correct_estimate" ? open("correct") : goTo("prefs"));
  const isOpen = view.room.status === "open";

  return (
    <div className="max-w-read space-y-6">
      {view.agreed && f && <AgreedBanner view={view} />}
      {!view.agreed && f && (
        <section aria-labelledby="banner-h">
          <h2 id="banner-h" className="text-[1.65rem] leading-tight">
            {f.name} is up for review. {view.counts.validYes}/{view.counts.total} have agreed.
          </h2>
          <div className="mt-4"><ConsentStrip people={view.people.map((p) => ({ name: p.name, state: p.state, isMe: p.isMe }))} /></div>
        </section>
      )}

      {outcome && (
        <p className="rounded-lg border border-line bg-surface px-4 py-3">
          <strong>At the deadline ({formatIST(outcome.deadline_at)}): {outcome.result === "agreed" ? "agreed" : "unresolved"}, {outcome.valid_yes}/{outcome.total} yeses.</strong>{" "}
          Later answers don't rewrite this record.
        </p>
      )}
      {!isOpen && (
        <p className="rounded-lg border border-limit/30 bg-limitbg px-4 py-3 font-bold text-limit">
          This room is {view.room.status}. Answers are paused until the coordinator reopens it.
        </p>
      )}

      {view.coordinator && <NextStep view={view} act={act} ai={ai} busy={busy} goTo={goTo} />}

      {!f && <NoFocus view={view} goTo={goTo} />}

      {f && mine && (
        <section className="panel overflow-hidden" aria-labelledby="focus-h">
          <div className="border-b border-line bg-sage px-4 py-4 sm:px-5">
            <p className="text-sm font-bold text-[#6B4712]">
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-marigold align-middle" aria-hidden="true" />
              Up for review
            </p>
            <h3 id="focus-h" className="mt-1 text-2xl">{f.name}</h3>
            <p className="text-muted">
              {f.dates}, {f.days} days{f.place ? `, ${f.place}` : ""}. {f.leave[0].toUpperCase() + f.leave.slice(1)}.
            </p>
            {f.past && <p className="mt-2 rounded-lg bg-limitbg px-3 py-2 text-sm font-bold text-limit">These dates have passed. The coordinator can put another idea up for review.</p>}
            {f.season && <p className={`mt-1 text-sm ${f.offSeason ? "font-bold text-limit" : ""}`}>{f.season}</p>}
            {f.sharedAssumptions && <p className="mt-1 text-sm">Assumes: {f.sharedAssumptions}</p>}
          </div>

          <div className="space-y-5 px-4 py-5 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-muted">Your all-in estimate</p>
                <EstimateBlock idea={f} />
              </div>
              <div>
                <p className="text-sm font-bold text-muted">For you</p>
                <StatusPill status={mine.status} label={mine.statusLabel} />
              </div>
            </div>
            {(mine.budget.max || mine.budget.comfortable) && (
              <p className="text-sm">
                Your budget: {mine.budget.comfortable ? `comfortable ${inr(mine.budget.comfortable)}, ` : ""}max {mine.budget.max ? inr(mine.budget.max) : "not set"}.{" "}
                <span className="text-muted">Only you see these.</span>
              </p>
            )}

            {mine.reasons.some((r) => r.level === "compromise") && (
              <div>
                <p className="font-bold">Your trade-offs</p>
                <ul className="mt-1 list-disc pl-5">
                  {mine.reasons.filter((r) => r.level === "compromise").map((r, i) => <li key={i}>{r.text}</li>)}
                </ul>
              </div>
            )}
            {mine.reasons.some((r) => r.level !== "compromise") && (
              <div>
                <p className="mb-2 font-bold">Your next checks</p>
                <Blockers reasons={mine.reasons} onFix={onFix} journeyUrl={mine.journeyUrl} />
              </div>
            )}
            {mine.hints.map((h) => (
              <p key={h.text} className="rounded-lg bg-compbg px-3 py-2 text-sm"><strong>Fix hint:</strong> {h.text}.</p>
            ))}

            <TripSketch ideaKey={`${f.key}:${f.version}`} ai={ai} />
            {me && <MyAnswer view={view} />}

            {isOpen && (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  {me?.answer === "yes" ? (
                    <p className="btn border-2 border-forest bg-fitbg text-forest" role="status">
                      <span aria-hidden="true">✓</span> You're in
                    </p>
                  ) : (
                    <button type="button" className="btn-primary" onClick={() => open("agree")} disabled={busy}>
                      {me?.answer === "reopened" ? "Re-confirm my yes" : "Yes, I'm in"}
                    </button>
                  )}
                  <button type="button" className="btn-quiet" onClick={() => open("change")} disabled={busy}>Needs a change</button>
                  <button type="button" className="btn-quiet" onClick={() => open("cannot")} disabled={busy}>Can't join</button>
                </div>
                <div className="flex flex-wrap gap-x-5">
                  {f.stored && <button type="button" className="btn-link" onClick={() => open("correct")}>Correct my estimate</button>}
                  {mine.journeyUrl && (
                    <a className="btn-link" href={mine.journeyUrl} target="_blank" rel="noreferrer">
                      Look up my journey <span aria-hidden="true">↗</span>
                    </a>
                  )}
                  {me && me.answer !== "none" && (
                    <button type="button" className="btn-link" onClick={() => act("withdraw")} disabled={busy}>Withdraw my answer</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {f && (
        <section aria-labelledby="stands-h">
          <h2 id="stands-h" className="text-xl">Where everyone stands</h2>
          <p className="hint">Answers and fit labels only. Nobody sees anyone else's budget, dates or notes.</p>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
            {view.people.map((p) => (
              <li key={p.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span className="min-w-[6.5rem] font-bold">{p.name}{p.isMe ? " (you)" : ""}</span>
                <span className="text-sm">{ANSWER_WORD[p.answer]}{p.reasonChip ? ` (${view.reasonChips.find((c) => c.id === p.reasonChip)?.label.toLowerCase()})` : ""}</span>
                <span className="ml-auto"><StatusPill status={p.statusOnFocus} label={p.statusLabel} size="sm" /></span>
                {p.noteShared && <p className="w-full text-sm text-muted">"{p.noteShared}"</p>}
              </li>
            ))}
          </ul>
          <p className="hint mt-2">A fit label isn't an answer. Only "Said yes" counts, and only for the current terms.</p>
        </section>
      )}

      {f && mine && (
        <>
          <AgreeSheet key={`a${f.key}${f.version}${sheet}`} open={sheet === "agree"} onClose={() => setSheet(null)} view={view} act={act} busy={busy} error={error} onFix={onFix} />
          <ChangeSheet key={`c${sheet}`} open={sheet === "change"} onClose={() => setSheet(null)} view={view} act={act} busy={busy} kind="change" />
          <ChangeSheet key={`n${sheet}`} open={sheet === "cannot"} onClose={() => setSheet(null)} view={view} act={act} busy={busy} kind="cannot" />
          {f.stored && <CorrectSheet key={`x${sheet}`} open={sheet === "correct"} onClose={() => setSheet(null)} idea={f} act={act} busy={busy} error={error} />}
        </>
      )}
    </div>
  );
}

type SketchResp = { sketch: { arrive: string; main: string; leave: string } | null };
/** P1-3: optional Gemini sketch, validated server-side against everyone's won't-dos. Shows nothing without a key. */
function TripSketch({ ideaKey, ai }: { ideaKey: string; ai: Ai }) {
  const [sk, setSk] = useState<SketchResp["sketch"]>(null);
  useEffect(() => {
    let live = true;
    setSk(null);
    ai<SketchResp>("sketch").then((r) => live && setSk(r?.sketch ?? null));
    return () => {
      live = false;
    };
  }, [ideaKey, ai]);
  if (!sk) return null;
  return (
    <div className="border-l-2 border-marigold pl-3">
      <p className="font-bold">What we might do</p>
      <dl className="mt-1 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-sm">
        <dt className="text-muted">Arrive</dt><dd>{sk.arrive}</dd>
        <dt className="text-muted">Main day</dt><dd>{sk.main}</dd>
        <dt className="text-muted">Leave</dt><dd>{sk.leave}</dd>
      </dl>
      <p className="hint mt-1">A sketch by Gemini, checked against everyone's won't-do list. Not a plan or a booking.</p>
    </div>
  );
}

function MyAnswer({ view }: { view: RoomView }) {
  const me = view.people.find((p) => p.isMe)!;
  const text: Record<string, string> = {
    yes: "You said yes. It counts for the trip's current terms.",
    reopened: `Reopened: please re-confirm. ${me.reopenReason ?? ""}.`,
    change: "You said this needs a change.",
    cannot: "You said you can't join this one.",
    none: "You haven't answered yet. Silence doesn't count as a yes.",
  };
  return (
    <p className={`rounded-lg px-3 py-2 text-sm font-bold ${me.answer === "yes" ? "bg-fitbg text-forest" : me.answer === "reopened" ? "border border-dashed border-forest" : "bg-sage"}`}>
      {text[me.answer]}
    </p>
  );
}

function NoFocus({ view, goTo }: { view: RoomView; goTo: (t: Tab) => void }) {
  const mineDone = view.me?.prefs?.complete;
  const need = Math.min(3, view.counts.total);
  return (
    <section className="panel px-5 py-6">
      <h2 className="text-2xl">{mineDone ? "Waiting for a few more people" : "Start with your limits"}</h2>
      <p className="mt-2 text-muted">
        Trip ideas appear once {need} people have added their preferences ({view.counts.complete}/{view.counts.total} so far). Your budget, dates and notes stay private.
      </p>
      {!mineDone && (
        <button type="button" className="btn-primary mt-4" onClick={() => goTo("prefs")}>Add my preferences</button>
      )}
      <div className="mt-6"><ConsentStrip people={view.people.map((p) => ({ name: p.name, state: p.state, isMe: p.isMe }))} /></div>
    </section>
  );
}

function AgreedBanner({ view }: { view: RoomView }) {
  const f = view.focus!;
  const announcement = view.coordinator?.drafts.announcement;
  return (
    <section className="rounded-xl bg-forest px-5 py-6 text-white" aria-labelledby="agreed-h">
      <p className="font-bold text-white/80">Agreed for planning</p>
      <h2 id="agreed-h" className="mt-1 text-[1.75rem] leading-tight">{f.name}, {f.dates}</h2>
      <p className="mt-2">All {view.counts.total} said yes to these exact terms.</p>
      <div className="mt-4 rounded-lg bg-white/10 px-4 py-3">
        <p className="font-bold">Book it yourself</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>Check live fares and availability. Our numbers are estimates.</li>
          <li>Book your own journey and share your arrival time.</li>
          <li>Pick the stay together and split it.</li>
        </ol>
      </div>
      {announcement && (
        <div className="mt-4 flex flex-wrap gap-2">
          <a className="btn bg-white text-forest hover:bg-sage" href={`https://wa.me/?text=${encodeURIComponent(announcement)}`} target="_blank" rel="noreferrer">
            Announce on WhatsApp <span aria-hidden="true">↗</span>
          </a>
        </div>
      )}
      <div className="mt-5 rounded-lg bg-surface p-3 text-ink"><ConsentStrip people={view.people.map((p) => ({ name: p.name, state: p.state, isMe: p.isMe }))} /></div>
    </section>
  );
}
