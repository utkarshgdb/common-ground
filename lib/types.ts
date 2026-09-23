// Row shapes mirror the cg_ tables (supabase/migrations). A room is loaded as one RoomState aggregate;
// every write is a pure function over it (lib/actions.ts) and the store persists the changed rows.

export type RoomStatus = "open" | "postponed" | "closed";

export type Room = {
  id: string;
  name: string;
  trip_days: number;
  window_start: string; // YYYY-MM-DD
  window_end: string;
  deadline_at: string; // ISO timestamp (UTC)
  focus_option_id: string | null;
  focus_id: number;
  status: RoomStatus;
  coordinator: string;
  admin_token_hash: string;
  is_demo: boolean;
  created_at: string;
};

export type Member = {
  room_id: string;
  name: string;
  session_hash: string | null;
  recovery_hash: string | null;
  joined_at: string | null;
  policy_ack_at: string | null;
  pref_version: number;
  position: number; // display order
};

/** A limit read from a private note (P1-2). Only confirmed items count. */
export type ParsedLimit =
  | { kind: "max_leave_days"; value: number; confirmed: boolean }
  | { kind: "max_travel_hours"; value: number; confirmed: boolean }
  | { kind: "add_wont_do"; value: string; confirmed: boolean }
  | { kind: "unavailable_slots"; value: string[]; confirmed: boolean }
  | { kind: "info_only"; value: string; confirmed: boolean };

export type Preferences = {
  room_id: string;
  member: string;
  home_city: string | null;
  budget_max: number | null;
  budget_comfortable: number | null;
  slots: string[]; // start dates the member can do
  vibes: string[];
  wont_do: string[];
  max_travel_hours: number | null;
  leave_days: number | null;
  note_private: string | null;
  parsed_limits: ParsedLimit[];
  complete: boolean;
  updated_at: string;
};

export type OptionSource = "engine" | "custom" | "variant";

export type TripOption = {
  room_id: string;
  id: string;
  source: OptionSource;
  destination_id: string | null;
  name: string;
  start_date: string;
  days: number;
  /** For custom ideas without a catalogue destination: what the trip involves (trek, beach, party, crowds, flight, cold). */
  activities: string[];
  shared_assumptions: string | null;
  default_estimate: number | null;
  version: number;
  archived: boolean;
  created_at: string;
};

export type Correction = {
  room_id: string;
  option_id: string;
  member: string;
  total: number;
  basis: string;
  checked_on: string;
  option_version: number;
  cost_version: number;
  stale: boolean;
  active: boolean; // false once removed (kept so cost_version keeps counting)
};

export type Answer = "yes" | "change" | "cannot";

export type ResponseRow = {
  room_id: string;
  member: string;
  focus_id: number;
  option_id: string;
  option_version: number;
  pref_version: number;
  cost_version: number;
  answer: Answer;
  reason_chip: string | null;
  note_shared: string | null;
  at: string;
};

export type Outcome = {
  room_id: string;
  deadline_at: string;
  focus_option_id: string | null;
  valid_yes: number;
  total: number;
  result: "agreed" | "unresolved";
  recorded_at: string;
};

export type EventRow = {
  id?: number;
  room_id: string;
  type: string;
  member: string | null;
  meta: Record<string, unknown>;
  at: string;
};

export type RoomState = {
  room: Room;
  members: Member[];
  prefs: Preferences[];
  options: TripOption[];
  corrections: Correction[];
  responses: ResponseRow[];
  outcomes: Outcome[];
  events: EventRow[];
};
