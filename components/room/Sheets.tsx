"use client";
import { useState } from "react";
import type { Reason } from "@/lib/engine";
import type { IdeaView, RoomView } from "@/lib/projection";
import { inr } from "@/lib/util";
import { ErrorNote, Sheet } from "../ui";
import type { Act, ApiError } from "./Room";

const todayIST = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

export function EstimateBlock({ idea }: { idea: IdeaView }) {
  const e = idea.mine?.estimate;
  if (!e) return <p className="text-muted">No estimate yet for you. Add your home city, or correct your estimate.</p>;
  return (
    <div>
      <p className="font-serif text-3xl font-semibold">{inr(e.mid)}</p>
      {e.kind === "model" && <p className="text-sm text-muted">Range {inr(e.low)} to {inr(e.high)}, all-in, per person</p>}
      <p className="mt-1 text-sm">
        {e.kind === "correction" ? <>Your correction: {e.basis}, checked {e.checkedOn}</> : e.basis}
      </p>
    </div>
  );
}

export const FIX_LABEL: Record<string, string> = {
  complete_prefs: "Finish my preferences",
  add_dates: "Update my dates",
  add_budget: "Add my budget",
  add_city: "Add my home city",
  correct_estimate: "Correct my estimate",
  check_journey: "Look up my journey",
};

export function Blockers({ reasons, onFix, journeyUrl }: { reasons: Reason[]; onFix: (fix: string) => void; journeyUrl: string | null }) {
  const list = reasons.filter((r) => r.level === "limit" || r.level === "check");
  if (!list.length) return null;
  return (
    <ul className="space-y-2">
      {list.map((r, i) => (
        <li key={i} className={`rounded-lg border px-3 py-2 ${r.level === "limit" ? "border-limit/30 bg-limitbg" : "border-dashed border-ink/40 bg-surface"}`}>
          <p className="font-bold">{r.level === "limit" ? "Limit not met" : "Needs checking"}: <span className="font-normal">{r.text}</span></p>
          {r.fix &&
            (r.fix === "check_journey" && journeyUrl ? (
              <a className="btn-link text-sm" href={journeyUrl} target="_blank" rel="noreferrer">Look up my journey <span aria-hidden="true">↗</span></a>
            ) : r.fix !== "check_journey" ? (
              <button type="button" className="btn-link text-sm" onClick={() => onFix(r.fix!)}>{FIX_LABEL[r.fix]}</button>
            ) : null)}
        </li>
      ))}
    </ul>
  );
}

export function AgreeSheet({ open, onClose, view, act, busy, error, onFix }: {
  open: boolean; onClose: () => void; view: RoomView; act: Act; busy: boolean; error: ApiError; onFix: (fix: string) => void;
}) {
  const f = view.focus!;
  const mine = f.mine!;
  const [checked, setChecked] = useState(false);
  const [ack, setAck] = useState(view.viewer.policyAcked);
  const tradeoffs = mine.reasons.filter((r) => r.level === "compromise");
  const blocked = mine.status === "limit" || mine.status === "check";
  return (
    <Sheet open={open} onClose={onClose} title="Can this trip work for you?">
      <p className="font-serif text-xl font-semibold">{f.name}</p>
      <p className="text-muted">{f.dates}, {f.days} days ({f.leave})</p>
      <div className="mt-4 rounded-lg bg-sage px-4 py-3">
        <EstimateBlock idea={f} />
        <p className="mt-2 text-sm">Includes return travel, stay, food and local travel.</p>
      </div>
      <div className="mt-4">
        <p className="font-bold">Your trade-offs</p>
        {tradeoffs.length ? (
          <ul className="mt-1 list-disc pl-5">{tradeoffs.map((t, i) => <li key={i}>{t.text}</li>)}</ul>
        ) : (
          <p className="text-muted">None. It fits everything you told us.</p>
        )}
      </div>
      {blocked ? (
        <div className="mt-4">
          <p className="mb-2 font-bold">Sort these out before you can say yes</p>
          <Blockers reasons={mine.reasons} onFix={(x) => { onClose(); onFix(x); }} journeyUrl={mine.journeyUrl} />
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {!view.viewer.policyAcked && (
            <label className="flex gap-3 rounded-lg border border-line p-3">
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#1E4A38]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span className="text-sm leading-relaxed"><strong>I understand how this room decides.</strong> {view.policy}</span>
            </label>
          )}
          <label className="flex gap-3 rounded-lg border border-line p-3">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#1E4A38]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>I've checked my journey and this estimate. I accept the trade-offs above. Prices still need checking before booking.</span>
          </label>
        </div>
      )}
      {!blocked && <p className="mt-3 text-sm text-muted">Your yes counts for these exact terms. If the dates change, you'll be asked to re-confirm.</p>}
      <ErrorNote message={error?.message ?? null} />
      <button
        type="button"
        className="btn-primary mt-4 w-full"
        disabled={blocked || !checked || !ack || busy}
        onClick={async () => {
          if (await act("respond", { answer: "yes", confirm: true, ack_policy: ack })) onClose();
        }}
      >
        Yes, I'm in
      </button>
    </Sheet>
  );
}

export function ChangeSheet({ open, onClose, view, act, busy, kind }: {
  open: boolean; onClose: () => void; view: RoomView; act: Act; busy: boolean; kind: "change" | "cannot";
}) {
  const [chip, setChip] = useState<string | null>(null);
  const [note, setNote] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title={kind === "change" ? "What would need to change?" : "Can't join this one?"}>
      {kind === "change" ? (
        <fieldset>
          <legend className="text-muted">Optional. It helps the coordinator find a version that works.</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {view.reasonChips.map((c) => (
              <label key={c.id} className="chip">
                <input type="radio" name="chip" className="sr-only" checked={chip === c.id} onChange={() => setChip(c.id)} />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-muted">No reason needed. You can change your answer any time.</p>
      )}
      <label className="label mt-4" htmlFor="note">Note for the group (optional)</label>
      <textarea id="note" className="field min-h-[88px]" maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "change" ? "e.g. A week later would work" : ""} />
      <p className="hint mt-1">Everyone in the room can see this note.</p>
      <button
        type="button"
        className="btn-primary mt-4 w-full"
        disabled={busy}
        onClick={async () => {
          if (await act("respond", { answer: kind, reason_chip: chip, note_shared: note })) onClose();
        }}
      >
        {kind === "change" ? "Send: needs a change" : "Send: can't join"}
      </button>
    </Sheet>
  );
}

export function CorrectSheet({ open, onClose, idea, act, busy, error }: {
  open: boolean; onClose: () => void; idea: IdeaView; act: Act; busy: boolean; error: ApiError;
}) {
  const c = idea.mine?.correction;
  const [total, setTotal] = useState(c ? String(c.total) : "");
  const [basis, setBasis] = useState(c?.basis ?? "");
  const [date, setDate] = useState(c?.checked_on ?? todayIST());
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="Correct my estimate">
      <p className="text-muted">
        Found a real fare or stay? Enter your whole all-in total for {idea.name}. It replaces our estimate for you only.
      </p>
      {idea.mine?.modelEstimate && <p className="mt-2 text-sm">Our estimate: {inr(idea.mine.modelEstimate.mid)} ({idea.mine.modelEstimate.basis})</p>}
      {c?.stale && <p className="mt-2 rounded-lg bg-compbg px-3 py-2 text-sm font-bold">The trip changed since you corrected this. Check it again.</p>}
      <div className="mt-4 space-y-4">
        <div>
          <label className="label" htmlFor="ctotal">My all-in total (₹)</label>
          <input id="ctotal" className="field" inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value.replace(/[^\d]/g, ""))} placeholder="14500" />
        </div>
        <div>
          <label className="label" htmlFor="cbasis">Basis</label>
          <input id="cbasis" className="field" maxLength={120} value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="IndiGo HYD–GOI + hostel, 3 nights" />
        </div>
        <div>
          <label className="label" htmlFor="cdate">Date you checked</label>
          <input id="cdate" type="date" className="field" value={date} max={todayIST()} onChange={(e) => setDate(e.target.value)} />
        </div>
        <label className="flex gap-3 rounded-lg border border-line p-3">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#1E4A38]" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          <span>This changes only my total, not the trip for others.</span>
        </label>
      </div>
      <ErrorNote message={error?.message ?? null} />
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary flex-1"
          disabled={!total || basis.trim().length < 3 || !confirm || busy}
          onClick={async () => {
            if (await act("correct", { option_id: idea.key, total: Number(total), basis, checked_on: date, confirm })) onClose();
          }}
        >
          Save my total
        </button>
        {c && (
          <button type="button" className="btn-quiet" disabled={busy} onClick={async () => { if (await act("remove_correction", { option_id: idea.key })) onClose(); }}>
            Remove my correction
          </button>
        )}
      </div>
    </Sheet>
  );
}

export function ExtendSheet({ open, onClose, act, busy }: { open: boolean; onClose: () => void; act: Act; busy: boolean }) {
  const d = new Date(Date.now() + 5.5 * 3600_000 + 2 * 86400_000).toISOString().slice(0, 10);
  const [date, setDate] = useState(d);
  const [time, setTime] = useState("21:00");
  return (
    <Sheet open={open} onClose={onClose} title="Extend the deadline">
      <p className="text-muted">Valid yeses carry over. The current deadline's outcome, if it has passed, stays on record.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="xd">New date</label>
          <input id="xd" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="xt">Time (IST)</label>
          <input id="xt" type="time" className="field" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <button
        type="button"
        className="btn-primary mt-5 w-full"
        disabled={busy}
        onClick={async () => {
          const [h, m] = time.split(":").map(Number);
          const iso = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), h, m) - 5.5 * 3600_000).toISOString();
          if (await act("extend", { deadline_at: iso })) onClose();
        }}
      >
        Extend the deadline
      </button>
    </Sheet>
  );
}
