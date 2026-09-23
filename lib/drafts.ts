// Rules-based wording for the coordinator's Next-step card and WhatsApp drafts (the P0 fallback; P1-1 may reword).
// Drafts never contain amounts, budgets, notes or anyone's private limits.
import type { NextMove } from "./deadline";
import { slotLabel } from "./engine";
import { formatIST } from "./util";

export type DraftContext = {
  roomName: string;
  groupLink: string;
  deadlineAt: string;
  focus: { name: string; start: string; days: number } | null;
  validYes: number;
  total: number;
  complete: number;
  /** The coordinator viewing the card, so they aren't asked to nudge themselves. */
  me?: string | null;
};

export type NextStep = { summary: string; question: string; action: NextAction; whatsapp: string; source: "rules" | "gemini" };
export type NextAction = "nudge" | "create_variant" | "switch_focus" | "announce" | "invite" | "none";

const list = (n: string[]) => (n.length <= 1 ? n[0] ?? "" : n.slice(0, -1).join(", ") + " and " + n.at(-1));

export function focusLine(c: DraftContext) {
  return c.focus ? `${c.focus.name}, ${slotLabel(c.focus.start, c.focus.days)}` : "";
}

export function rulesNextStep(move: NextMove, c: DraftContext): NextStep {
  const by = formatIST(c.deadlineAt);
  const f = focusLine(c);
  switch (move.kind) {
    case "collect":
      return {
        summary: `${c.complete}/${c.total} have added their preferences. Trip ideas appear once three have.`,
        question: move.names.filter((n) => n !== c.me).length ? `Could ${list(move.names.filter((n) => n !== c.me))} add their limits (about 2 minutes)?` : move.names.length ? "Add your own preferences to get ideas started." : "Everyone's in. Ideas are on their way.",
        action: "invite",
        whatsapp: `Hi all! To finally lock our trip, add your limits here (about 2 minutes, budgets stay private): ${c.groupLink}\nReply by ${by}.`,
        source: "rules",
      };
    case "announce":
      return {
        summary: `Everyone has said yes to ${f}.`,
        question: "Share the announcement so everyone books their own travel.",
        action: "announce",
        whatsapp: announcement(c),
        source: "rules",
      };
    case "cannot":
      return {
        summary: `${list(move.names)} can't join ${c.focus?.name}.`,
        question: "Switch focus to another idea, or close this round?",
        action: "switch_focus",
        whatsapp: `Update on our trip: ${c.focus?.name} doesn't work for everyone, so we'll look at the next idea. Check where you stand: ${c.groupLink}`,
        source: "rules",
      };
    case "variant":
      return {
        summary: `${move.member} has a limit that ${c.focus?.name} doesn't meet as planned.`,
        question: `${move.hintText}. Create that version as an idea?`,
        action: "create_variant",
        whatsapp: `Quick one: ${move.hintText.replace(/^Works for/, "a small change works for")}. I'll add it as an option. Have a look: ${c.groupLink}`,
        source: "rules",
      };
    case "nudge": {
      const others = move.names.filter((n) => n !== c.me);
      const selfToo = !!c.me && move.names.includes(c.me);
      return {
        summary: `${f} is up for review. ${c.validYes}/${c.total} have said yes.`,
        question: others.length
          ? `Waiting on ${list(others)}.${selfToo ? " You haven't answered yet either." : ""} Send a reminder?`
          : "Only your own answer is missing. Answer below.",
        action: others.length ? "nudge" : "none",
        whatsapp: `${f} is up for review. ${c.validYes}/${c.total} are in so far. ${list(others.length ? others : move.names)}, can this trip work for you? Takes a minute: ${c.groupLink}\nReply by ${by}.`,
        source: "rules",
      };
    }
    case "limit":
      return {
        summary: `${list(move.names)} ${move.names.length === 1 ? "has" : "have"} a limit this idea doesn't meet, and no single change fixes it.`,
        question: "Consider switching focus to the next idea.",
        action: "switch_focus",
        whatsapp: `Update: ${c.focus?.name} doesn't fit everyone's limits. Let's look at the other ideas: ${c.groupLink}`,
        source: "rules",
      };
    default:
      return { summary: `${f} is up for review.`, question: "Nothing needs you right now.", action: "none", whatsapp: `Where we stand on the trip: ${c.groupLink}`, source: "rules" };
  }
}

export function announcement(c: DraftContext): string {
  return [
    `We're going! ${f(c)} is agreed for planning: all ${c.total} of us said yes.`,
    "Everyone books their own travel. Before you book:",
    "1. Check live fares and availability (our numbers were estimates).",
    "2. Book your own journey and share your arrival time.",
    "3. We'll split the stay once we pick a place.",
    c.groupLink,
  ].join("\n");
}
const f = (c: DraftContext) => focusLine(c);

export function reminderFor(name: string, c: DraftContext, state: string): string {
  const by = formatIST(c.deadlineAt);
  if (!c.focus || state === "Preferences incomplete")
    return `Hi ${name}! Could you add your trip limits? About 2 minutes, and your budget stays private: ${c.groupLink}\nReply by ${by}.`;
  if (state === "Reopened")
    return `Hi ${name}, something changed on ${focusLine(c)}, so your yes needs a quick re-confirm: ${c.groupLink}`;
  return `Hi ${name}! Can ${focusLine(c)} work for you? One tap: yes, needs a change, or can't join: ${c.groupLink}\nReply by ${by}.`;
}

export function groupUpdate(c: DraftContext, people: { name: string; state: string }[]): string {
  const lines = people.map((p) => `• ${p.name}: ${p.state}`);
  return [c.focus ? `Trip update: ${focusLine(c)} is up for review (${c.validYes}/${c.total} yes).` : `Trip update: ${c.complete}/${c.total} have added preferences.`, ...lines, c.groupLink].join("\n");
}

export const waLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
