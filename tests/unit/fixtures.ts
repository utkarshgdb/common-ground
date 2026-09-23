import { respond, type Actor } from "../../lib/actions";
import { focusOption } from "../../lib/consent";
import { buildDemo, demoFillKaran, demoSimulateFour } from "../../lib/demo";
import type { RoomState } from "../../lib/types";

export const NOW = new Date("2026-09-23T15:00:00Z");
export const later = (min: number) => new Date(NOW.getTime() + min * 60_000);
export const as = (member: string): Actor => ({ member, coordinator: member === "Riya" });
export const RIYA_COORD: Actor = { member: "Riya", coordinator: true };

/** Demo room with Karan filled and everyone's valid yes on the focus (Hampi). */
export function agreedRoom(): RoomState {
  let s = buildDemo("room1", "hash", NOW);
  s = demoFillKaran(s, NOW);
  s = demoSimulateFour(s, NOW);
  s = respond(s, as("Karan"), { answer: "yes", confirm: true, ack_policy: true }, NOW);
  return s;
}

export function fourYesRoom(): RoomState {
  return demoSimulateFour(buildDemo("room1", "hash", NOW), NOW);
}

export const focusId = (s: RoomState) => focusOption(s)!.id;
