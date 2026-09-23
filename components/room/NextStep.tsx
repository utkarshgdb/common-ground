"use client";
import { useState } from "react";
import type { RoomView } from "@/lib/projection";
import { waLink } from "@/lib/drafts";
import { CopyButton } from "../ui";
import type { Act, Tab } from "./Room";
import { ExtendSheet } from "./Sheets";

/** Coordinator-only: one sentence, one suggested action, WhatsApp drafts. Nothing here can supply anyone's yes. */
export function NextStep({ view, act, busy, goTo }: { view: RoomView; act: Act; busy: boolean; goTo: (t: Tab) => void }) {
  const c = view.coordinator!;
  const s = c.nextStep;
  const [recipient, setRecipient] = useState(c.drafts.reminders[0]?.name ?? "");
  const [extend, setExtend] = useState(false);
  const reminder = c.drafts.reminders.find((r) => r.name === recipient);
  const variantHint = c.hints.find((h) => h.shared);
  const status = view.room.status;

  return (
    <section className="rounded-xl border-2 border-forest bg-surface p-4 sm:p-5" aria-labelledby="ns-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ns-h" className="text-xl">Next step</h2>
        <span className="text-xs text-muted">{s.source === "gemini" ? "Worded by Gemini from the rules' result" : "Suggested by the rules"}</span>
      </div>
      <p className="mt-2">{s.summary}</p>
      <p className="mt-1 font-bold">{s.question}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {s.action === "create_variant" && variantHint && (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => act("variant", { member: variantHint.member })}>
            Add {variantHint.variantName ?? "that version"}
          </button>
        )}
        {s.action === "switch_focus" && <button type="button" className="btn-primary" onClick={() => goTo("compare")}>Compare other ideas</button>}
        <a className={s.action === "create_variant" || s.action === "switch_focus" ? "btn-quiet" : "btn-primary"} href={waLink(s.whatsapp)} target="_blank" rel="noreferrer">
          Open WhatsApp <span aria-hidden="true">↗</span>
        </a>
        <CopyButton text={s.whatsapp} label="Copy WhatsApp draft" />
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer py-2 font-bold text-forest">See the draft</summary>
        <p className="whitespace-pre-wrap rounded-lg bg-sage px-3 py-2">{s.whatsapp}</p>
      </details>

      {c.drafts.reminders.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <label className="label" htmlFor="rem">Personal reminder</label>
          <div className="flex flex-wrap gap-2">
            <select id="rem" className="field w-auto flex-1" value={recipient} onChange={(e) => setRecipient(e.target.value)}>
              {c.drafts.reminders.map((r) => {
                const p = view.people.find((x) => x.name === r.name);
                return <option key={r.name} value={r.name}>{r.name} ({p?.state})</option>;
              })}
            </select>
            {reminder && (
              <>
                <a className="btn-quiet" href={reminder.url} target="_blank" rel="noreferrer">Open WhatsApp <span aria-hidden="true">↗</span></a>
                <CopyButton text={reminder.text} label="Copy" />
              </>
            )}
          </div>
          <p className="hint mt-1">WhatsApp opens with the message ready. You pick the chat and press send.</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 border-t border-line pt-2">
        <button type="button" className="btn-link" onClick={() => setExtend(true)}>Extend deadline</button>
        <button type="button" className="btn-link" onClick={() => goTo("compare")}>Switch focus or add an idea</button>
        {variantHint && s.action !== "create_variant" && (
          <button type="button" className="btn-link" disabled={busy} onClick={() => act("variant", { member: variantHint.member })}>Create variant</button>
        )}
        {status === "open" ? (
          <>
            <button type="button" className="btn-link" disabled={busy} onClick={() => confirm("Postpone this trip? Answers are kept.") && act("postpone")}>Postpone</button>
            <button type="button" className="btn-link" disabled={busy} onClick={() => confirm("Close this room? Nobody can answer until it's reopened.") && act("close")}>Close</button>
          </>
        ) : (
          <button type="button" className="btn-link" disabled={busy} onClick={() => act("reopen")}>Reopen</button>
        )}
      </div>
      {c.hints.length > 0 && (
        <div className="mt-2 text-sm">
          <p className="font-bold">Fix hints (checked by re-scoring everyone)</p>
          <ul className="list-disc pl-5">{c.hints.map((h) => <li key={h.member}>{h.text}</li>)}</ul>
        </div>
      )}
      <ExtendSheet open={extend} onClose={() => setExtend(false)} act={act} busy={busy} />
    </section>
  );
}
