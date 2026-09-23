# Common Ground: Final PRD & Build Spec

**Version:** FINAL (v3 locked) · 23 Sep 2026 · **Owner:** Utkarsh (Mesa School of Business, PGP Cohort IV, AI-Native track, Section A)
**Purpose of this document:** the single source of truth for building, testing and deploying the MVP. It's self-contained: a builder with no prior context should be able to execute from this file alone.

---

## 0. Read this first (context for the builder)

### 0.1 Who you're building for
Utkarsh is an MBA student without a technical background. He will submit this build for a graded assignment. He needs:
- plain-English progress updates;
- to be asked before anything that costs money, needs his accounts or keys, or deploys;
- a working, live product. A beautiful plan that doesn't run is a fail.

### 0.2 The assignment (Mesa L2 Assessment, Part B, Section A)
- **Part 1 (already submitted):** nine checks + "The Cut", answered in a Google Form.
- **Part 2 (this build). Due Sat 26 Sep 2026, 11:59 PM IST** (one announcement says Sun 27; plan for Saturday). Submit:
  1. a **components map** as an image (the template is described in §15);
  2. **the first prompt typed into Claude Code** to start the build;
  3. a **live Vercel URL**.
- Required stack in the component-map template: **Gemini (LLM)**, **Supabase (database)**, a **Trip Planner App**, and optionally another API.

### 0.3 The case (summarised faithfully)
Riya, Siddharth, Karan, Aisha and Preethi are close college friends now working in different cities.
- For **3 months** they've tried to plan one trip: **1,200+ WhatsApp messages, zero confirmed plans.**
- The postponements aren't because anyone doesn't want to go. Five people with five schedules, budgets and opinions can't reach one decision in a group chat.
- The loop: someone suggests a place → emoji reactions → "can't do that weekend" → "what about Goa?" → two weeks of silence → repeat.
- There's no record of what anyone wants and no view of where preferences overlap.

Riya volunteered to coordinate and tried two things:
1. **A Google Form:** only **3 of 5** filled it, and she couldn't use incomplete responses.
2. **A group poll:** all 5 voted, **2 changed their minds the next day**, and the poll collapsed.

She is now **being blamed**. She wants a structured process that collects everyone's preferences (budget, dates, destination type, what they won't do), finds options that work best for the whole group, and presents 2–3 options showing how well each works for each person, so they make one decision.

> **Riya's ask:** "Build me a tool where everyone submits their preferences through one link, and it gives us our best trip options with everything we need to decide, including where each person stands on each option."

### 0.4 The Cut (already submitted; the product must honour it)
**Check 03 (Input available), backed by Check 06 (Failure risk), kills "everything we need to decide" when it means live fares, hotel availability and booking.** That data isn't reliably available to us, and a wrong price that busts someone's budget would recreate the blame Riya faces.

**We build instead:** one link where each friend saves their limits. Rules suggest 2–3 trips with checkable per-person cost estimates and show where each person stands. The trip is agreed only when all five explicitly say yes. Everyone books themselves.

### 0.5 How we got here (don't re-litigate these)
Three versions were compared: Quorum v1 (built), Quorum v2 (PRD), and Common Ground v3 (another model's PRD + demo). This spec merges their strongest parts.

**Rejected on purpose; do NOT reintroduce:**
- counting silence as consent;
- a "fewest No wins" rule;
- waiving hard limits when every option fails;
- the coordinator overriding or supplying anyone's yes;
- pre-committing people to an unknown trip;
- mandatory reasons for saying no;
- a deadline that auto-picks a winner;
- promising "zero reversals";
- numeric "happiness" scores shown to users;
- Riya having to research trips and type per-person prices by hand;
- live fares or booking;
- rewriting in a different stack.

### 0.6 What already exists (reuse if available)
- **A previous build, "Quorum" v1** (Next.js 14 + TypeScript + Tailwind + Supabase + Gemini). It had a working catalogue, travel/cost estimator, ranking engine, demo seeding and tests. If Utkarsh provides `quorum.zip` or the repo, reuse `lib/catalogue.ts` and the estimator logic in `lib/engine.ts`. The product logic changes substantially (see below). If it isn't provided, the catalogue data is in **Appendix A** and the formulas are in §7.
- **Supabase project "mesaAI"** (project ref `ngdgkqlehrhzjmnsthto`, URL `https://ngdgkqlehrhzjmnsthto.supabase.co`, region ap-southeast-2). It already contains other apps' tables (`couples, sessions, participants, pool_titles, swipes, ratings, ott_cache, api_usage`) and v1's tables (`trips, submissions, generations, reactions`). **Create all new tables with the `cg_` prefix. Never modify or drop existing tables.**

---

## 1. Product job
**Help five friends get from scattered limits to one trip all five have explicitly said yes to, with less effort for Riya and everyone else, and without ever faking agreement.**

## 2. Principles (use these to break ties)
1. **Rules check, AI helps, people decide.** Code owns limits, estimates, ranking and agreement status. Gemini only writes and asks. Only a person can say yes.
2. **Agreement is explicit, unanimous and tied to the terms.** Silence isn't a yes. Hard limits can't be overridden. Anyone can change their answer.
3. **One question at a time:** "Can *this* trip work for you?"
4. **Protect progress.** Only changes that affect what someone agreed to can reopen their yes.
5. **Never mislead.** Every ₹ has a basis and date. Unknowns are never shown as "fits". No live fares, no booking.
6. **Riya coordinates; she doesn't research or carry the blame.** The engine researches; each friend owns their own yes.

## 3. Users & ownership
| Who | Owns | Needs |
|---|---|---|
| **Riya (coordinator)** | Room, deadline, which idea is in focus, reminders, extend / postpone / close | Low effort, a defensible process, no blame |
| **Each friend** (Riya included) | Their limits, their estimate correction, their answer | To know in seconds whether *this* trip works for them |
| **Grader** | — | To see the whole loop in ~90 s on one device |

## 4. Decision policy (show verbatim on create, join and agree screens)
> "We'll suggest a few trips that fit everyone's limits and review one at a time. A trip is agreed only when everyone explicitly says yes to its current terms. Silence isn't a yes. Nobody can override someone's hard limit. Anyone can change their answer."

Acknowledging the policy = understanding the process. It's required before a person's **first yes**, not before saving preferences.

## 5. User flow
```
CREATE   Riya: room name · member names (default 5; 2–12) · trip length (2–5 days) ·
         date window (1 wk–4 mo) · reply deadline (default +3 days, 9 PM IST)
         → ONE group link + a private coordinator link
JOIN     Friend opens link → taps their name → private session cookie + private recovery link
LIMITS   Progressive form, partial save allowed (~2 min):
         home city · max budget (+ optional comfortable) · which date slots work ·
         up to 3 vibes · won't-do list · [more] max travel hours · leave days · private note
SUGGEST  When ≥3 have complete limits, the engine suggests 3 dissimilar ideas with per-person
         estimates. Riya can add a custom idea. The top-ranked idea is auto-set "Up for review"
         (Riya can change focus).
RESPOND  Each person sees THEIR view first → [Yes, I'm in] (one confirmation screen) ·
         [Needs a change] (reason chip + optional note) · [Can't join] (optional note) ·
         [Correct my estimate] · [Look up my journey ↗]
CONVERGE Coordinator "Next step" card: rules find the blocker → one suggested question +
         WhatsApp draft; fix hints can become a one-tap variant ("Gokarna, 13–15 Nov")
AGREED   5 valid current yeses → "Agreed for planning" → announcement + book-yourself checklist
DEADLINE On expiry: outcome recorded (agreed / unresolved, n/5) + suggested next move.
         Late answers still count toward the CURRENT state but never rewrite the record.
```

## 6. Scope

### P0: must ship
| ID | Feature |
|---|---|
| P0-1 | Create room with deadline; policy shown |
| P0-2 | One group link; claim-your-name session (HttpOnly cookie); private recovery link; separate coordinator token |
| P0-3 | Progressive preference form, partial save, policy acknowledgement before the first yes |
| P0-4 | Engine: per-person checks, 4 ordinal statuses, ordinal ranking, 3 dissimilar suggestions, per-person estimates with basis, fix hints (§7) |
| P0-5 | Focus: auto-focus the top idea; Riya can change focus or add a custom idea |
| P0-6 | Screens: Your trip (personal first) · Compare ideas · Your preferences · People sidebar |
| P0-7 | Respond: Yes (one confirmation screen) / Needs a change (chips + note) / Can't join; change or withdraw any time |
| P0-8 | Personal estimate correction (replaces the whole all-in total; basis + date checked) + journey lookup link |
| P0-9 | Versioned approvals + the 4 change rules (§8) |
| P0-10 | "Agreed for planning" state + WhatsApp announcement + book-yourself checklist |
| P0-11 | Deadline outcome record + history + extend / postpone / close / switch focus |
| P0-12 | Coordinator Next-step card (rules) + WhatsApp drafts (invite, update, personal reminder; coordinator picks the recipient) |
| P0-13 | Privacy projection: others' raw budgets, notes, date windows and review details never leave the server |
| P0-14 | Guided demo room: View-as switcher + steps (§14) |
| P0-15 | Everything works with no Gemini key (labelled rules fallback) |

### P1: only after P0 passes every gate
| ID | Feature |
|---|---|
| P1-1 | Gemini wording for the Next-step question + WhatsApp draft |
| P1-2 | Gemini note → allow-listed limits, with person confirmation + a 25-note eval |
| P1-3 | Gemini 3-line "what we'd do" sketch for the focused idea, validated against won't-dos |
| P1-4 | One-tap "create variant" from a fix hint |
| P1-5 | Season line per idea (typical month conditions, precomputed) |

### Out
Live fares / availability / booking, payments, itinerary generation, public-holiday inference, user accounts, chat, automated message sending, dynamic social preview cards, international trips.

## 7. Engine (deterministic, `lib/engine.ts`, pure functions, fully unit-tested)

### 7.1 Date slots
- Trip of N days (2–5). A slot = start date. If N = 2, slots start on **Saturdays**; otherwise on **Fridays**. List every such date inside the window (cap 20).
- Label: "Fri 16 Oct – Sun 18 Oct".
- **Leave needed** for a slot = the number of Mon–Fri days inside [start, start+N−1]. Show it next to each slot ("needs 1 weekday off"). No public-holiday inference; the person's own tick is the truth.

### 7.2 Travel estimate (per person, per destination; one way)
Let `air` = haversine km between home city and destination; `road = air × 1.3`. Round money to ₹50.
- **Ground** (not available if the destination is `flightOnly`):
  - if `road ≤ 350`: mode "road/train", hours = `road/50 + accessHours`, cost = `max(400, road×2.5)`, range ×0.8–×1.2;
  - else: mode "train/bus", hours = `road/55 + accessHours`, cost = `road×1.5`, range ×0.8–×1.25.
- **Flight:** hours = `3 + air/750 + (airHours ?? accessHours+1)`; cost = `2500 + air×2.5`, range ×0.85–×1.3.
- **Mode choice:**
  - "no flights" in won't-do → ground (if none exists → Limit "Needs a flight");
  - otherwise ground if `ground.hours ≤ min(10, maxTravelHours ?? 10)`, else flight.

### 7.3 All-in estimate (per person, per idea)
- `total_range = 2 × leg.cost_range + dayCost_range × N`.
- **Displayed estimate = midpoint**, rounded to ₹500, plus the range.
- Basis line, e.g. "Delhi → destination by flight (~6h each way) + 3 days stay/food/local · est. 23 Sep 2026".
- **Custom ideas:** Riya either picks a catalogue destination (the engine estimates) or enters one default all-in ₹ per person (basis: "coordinator estimate").
- **A person's correction replaces their total** (§8.3).

### 7.4 Per-person checks → status
| Check | Limit not met | Needs checking | Compromise |
|---|---|---|---|
| Dates | Slot not ticked | Preferences incomplete | — |
| Budget | Estimate (correction if present, else mid) > max | No estimate / stale correction | Estimate > comfortable (if set) |
| Travel | Hours > maxTravel + 1.5; or "no journeys > 8h" and hours > 8; or no-flights with a flight-only place | — | maxTravel < hours ≤ maxTravel + 1.5 |
| Won't-do | Trek / beach / party / crowds / cold-that-month hit | — | — |
| Leave | Weekdays needed > leave days (if given) | — | Equal |
| Vibe | — | — | No overlap with their vibes |
| Confirmed note limits (P1-2) | Per limit type | — | — |

- **Status precedence:** **Limit not met → Needs checking → Compromise → Fits stated inputs.**
- A member with no preferences = Needs checking.
- **Status is never approval.**
- Each status carries short human reasons ("~₹2k over your max", "Not free 16 Oct", "Involves trekking", "₹1,000 above comfortable").

### 7.5 Ranking & suggestions
- For each destination, pick its best slot: most members free → avoid off-season months → earliest.
- Order ideas by:
  1. the worst status across members (best first);
  2. fewer members with Limit;
  3. fewer Needs checking;
  4. fewer Compromise;
  5. more total vibe matches;
  6. off-season last;
  7. earliest date.
- **Dissimilarity:** don't pick two ideas whose tag overlap (Jaccard) ≥ 0.6, or that share a state and lead tag, unless no comparable alternative exists.
- Return the top 3, and show the ordering rule in plain words under the Compare view.

### 7.6 Fix hints (convergence without fake consent)
- For each member with Limit on the focused idea, try single changes in order:
  1. another slot they ticked;
  2. the other travel mode;
  3. one fewer day.
- Show the first change that clears that member's limit, and **re-score the whole group** to disclose side effects: "Works for Karan if moved to Fri 13 Nov (Aisha isn't free then)".
- Hints must be verified by re-scoring before display (test this).

## 8. Approvals & change rules

### 8.1 Validity
A response stores `focus_id, option_version, pref_version, cost_version`. **A yes is valid only if all four still match** the current values and the member has no Limit or Needs checking on that idea. "Agreed for planning" = valid yes from **every** member.

### 8.2 The 4 change rules
| Change | Effect |
|---|---|
| 1. Add / edit / remove a **non-focused** idea | Nothing reopens |
| 2. Change the **focused** idea's shared terms (dates, days, activities, shared assumptions, default estimate) | `option_version++` → **all** yeses on it reopen; personal corrections for it are marked **stale** |
| 3. A member edits **their own** preferences or corrects **their own** estimate | Only **that member's** yes reopens (`pref_version++` or `cost_version++`) |
| 4. Switch focus | New `focus_id`; fresh answers for the new focus; the old focus's answers are kept in history |

- Saving identical values = no change.
- Extending the deadline keeps valid yeses.
- Reopened yeses show as "Reopened: please re-confirm" with the reason.

### 8.3 Estimate correction
- A member enters their own **all-in total** (replaces, never adds), a short basis (e.g. "IndiGo DEL–GOI + hostel"), and the date checked.
- They confirm: "This changes only my total, not the trip for others."
- Removable. Rule 2 makes it stale.

## 9. Agree screen (one screen)
**Pre-filled summary:**
- idea, dates, days;
- your all-in estimate + basis + range;
- what's included (return travel, stay, food, local travel);
- **your trade-offs** (every Compromise reason);
- the policy line.

**One checkbox:**
> "I've checked my journey and this estimate. I accept the trade-offs above. Prices still need checking before booking."

**Button:** [Yes, I'm in].
- If any Limit or Needs checking applies, the button is disabled and shows the exact blockers, each with its fix action ("Add my dates", "Correct my estimate").
- First yes also requires the policy acknowledgement tick.

## 10. Deadline lifecycle
- **No background jobs.** On the first read or write after `deadline_at`, if no outcome exists for this deadline, record `{deadline_at, focus_option_id, valid_yes n/N, result: agreed|unresolved}` in `cg_outcomes`.
- Show: "At the deadline: unresolved, 4/5 yeses. Later answers don't rewrite this record."
- **Suggested next move (rules):**
  - missing answers → nudge those people;
  - a "Needs a change" with a date / budget / travel chip → the matching fix-hint variant;
  - a "Can't join" → switch focus or close.
- **Riya's actions:** extend deadline (keeps yeses; new round), postpone, close, switch focus, reopen. **None supplies anyone's yes.**

## 11. Screens & UX

**Design direction:** calm, trustworthy, editorial. Deep green / ink palette, one accent, generous whitespace, a serif for headings, a clean sans for body. No gradients, no emojis in UI chrome, no generic "AI" styling. Mobile-first at 390 px, no horizontal scroll, tap targets ≥ 44 px, Lighthouse accessibility ≥ 90, colour never the only signal (status pills always carry text).

**Layout:**
- **Header:** logo "common ground" · room name · "Reply by {date, time IST} · {countdown}" · [Share an update] [Invite friends ↗].
- **People sidebar** (a collapsible top section on mobile):
  - each member with state: Preferences incomplete · Ready to respond · Agreed · Needs a change · Can't join · Reopened;
  - "n/5 complete preferences · n/5 current yeses";
  - the policy card;
  - "Your private access" (recovery link).
- **Tabs:**
  1. **Your trip (default):**
     - banner "Gokarna is up for review. 2/5 have agreed.";
     - focused-idea card: dates, your all-in estimate + basis, your comfortable/max (only you see these), your status pill, "Your trade-offs", "Your next checks", fix hint;
     - actions [Yes, I'm in] [Needs a change] [Can't join] · [Correct my estimate] [Look up my journey ↗];
     - "Where everyone stands" chips (name · answer · status label, no amounts);
     - P1 sketch.
  2. **Compare ideas:**
     - 3 idea columns (a stacked cards list on mobile): each shows dates, *your* estimate, a count badge ("1 limit unmet"), then each member's status label + answer;
     - the ordering rule in plain words underneath.
  3. **Your preferences:** the progressive form.
- **Coordinator Next-step card** (coordinator only, top of Your trip):
  - one sentence + one suggested action;
  - [Copy WhatsApp draft] / [Open WhatsApp] (wa.me link with text);
  - personal reminder with a recipient picker;
  - buttons: extend / switch focus / add idea / create variant / postpone / close.
- **History:** deadline outcomes, focus switches, reopen events.
- **Footer:** "Estimates, not fares. Check prices and availability before booking."

**Copy tone:** plain, warm, short. Never say "optimal". Always say "estimate".

## 12. AI (Gemini): three jobs, none decides
- Env: `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.5-flash`; check the current model list in Google's docs and use a current Flash model).
- Structured JSON output with a response schema; 12 s timeout; results cached by a state fingerprint, and discarded if the state changed while generating.

| Job | Input sent | Guardrails | Fallback |
|---|---|---|---|
| **P1-1 Next step** | Anonymous: member slots A–E with statuses, answers, reason chips, counts, days to deadline | No names, budgets, amounts or notes; returns `{summary, question, whatsapp_draft}` with placeholders `{A}`… that the client replaces with names | Rules template |
| **P1-2 Note → limits** | One member's own private note only | Allow-list: `max_leave_days`, `max_travel_hours`, `add_wont_do(id)`, `unavailable_slots[]`, `info_only(text)`; shown as "We read your note as: … ✓/✗"; **only confirmed items count**; ambiguous → `info_only` | Note stays unchecked and the person is told |
| **P1-3 Sketch** | Focused idea name, tags, days, everyone's won't-do list (anonymous) | 3 lines (arrive / main day / leave); no prices; keyword validator (e.g. trek/hike/summit/climb for no-trek; club/party/pub crawl for no-party; beach/swim for no-beach); regenerate once, then drop | No sketch |

**Eval (P1-2):** 25 labelled notes (easy, ambiguous, out-of-scope, adversarial), target ≥ 90% exact match. Record the result in the README.

## 13. Privacy & security
- The server builds a **per-viewer projection**. Never send another member's `budget_max`, `budget_comfortable`, `note_private`, full slot list, correction basis or review details. Other people get only status labels, answers and shared notes.
- Show the viewer's own ₹ gap only to them.
- Disclose in the policy panel: "Fit labels against a known estimate can hint at someone's budget range."
- **Auth:**
  - random 32-byte tokens; store only SHA-256 hashes;
  - member session in an HttpOnly, SameSite=Lax, Secure (prod) cookie scoped per room;
  - separate coordinator token;
  - recovery link `/r/{roomId}#k={token}` (the fragment keeps it out of server logs; the client POSTs it to restore the session);
  - a name can't be claimed twice (coordinator can't impersonate).
- Validate every write server-side: membership, room open, versions. Responses `Cache-Control: no-store`. JSON body size limit. Simple per-IP rate limit on writes.
- Supabase via **service role key on the server only**; RLS enabled with no public policies. Never expose keys client-side. Never commit `.env*`.

## 14. Guided demo (the grader's path)
**"Try the demo"** on the landing page creates a fresh `is_demo` room: "The November escape", window = next 8 weeks, deadline = +2 days, 3-day trip. It opens **as Karan**.

**Seed (tune the values so the top-ranked idea has no Limit for any member once Karan is filled; this is an acceptance test):**

| Member | City | Max / comfortable ₹ | Vibes | Won't-do | Extras | Slots |
|---|---|---|---|---|---|---|
| Riya | Bengaluru | 18,000 / 15,000 | beach, relaxed, food | — | — | most slots |
| Siddharth | Delhi NCR | 25,000 / 20,000 | mountains, adventure, nightlife | — | note: "Done Goa three times already" | most slots |
| Aisha | Mumbai | 16,000 / 12,000 | relaxed, nature, food | no treks, no cold | leave 1 | most slots |
| Preethi | Chennai | 20,000 / 16,000 | beach, heritage, food | no party | leave 1 | most slots |
| Karan | Hyderabad | *(incomplete)* → filled: 15,000 / 13,000 | adventure, nature | no flights | max travel 12h | overlap slot |

**Demo bar** (visible only in demo rooms): **View as [select]** · 1. Fill Karan's sample preferences · 2. Simulate four friends (the other four give valid yeses to the focus where eligible) · 3. Reach deadline (sets `deadline_at` to now − 1 min) · Try 3/5 (resets to 3 complete preferences) · Reset.

**Expected stories:**
- Reset → 2 → 3 ⇒ "Unresolved, 4/5 yeses", with the next move "nudge Karan".
- Reset → 1 → 2 → Karan says Yes ⇒ **"Agreed for planning"**.
- Try 3/5 ⇒ provisional comparison with "Needs checking" rows, never "Fits".

View-as is accepted **only** for `is_demo` rooms (server-enforced). Purge demo rooms older than 7 days.

## 15. Deliverables for Form 2 (produce at the end)
1. **Live Vercel URL**, smoke-tested.
2. **Component map PNG** matching the template exactly:
   - title bar "SECTION A — GROUP TRIP PLANNER";
   - columns **Trigger · Input · Context · Processing · Output**;
   - rows **Riya (Coordinator) · Friends (x 4) · Trip Planner App · Gemini (LLM) · Supabase (Database) · Other API (Optional)**, with Other API filled as "None, on purpose (The Cut): no live fare/booking API";
   - render it from an HTML table with Playwright at 2× scale.
3. **README:** what it is, how it works, how to run, env vars, the test commands and results, known limits.
4. The **first prompt** is whatever Utkarsh pasted to start the build (no action needed; don't fabricate).

## 16. Tech stack & structure
- **Next.js 14 (App Router) + TypeScript + Tailwind**, deployed on **Vercel**. **Supabase** Postgres via `@supabase/supabase-js`, server-side only. **Gemini** via REST (`generativelanguage.googleapis.com`), server-side only.
- **Storage adapter:** Supabase when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set; otherwise a local JSON file store (dev/test only), so the app runs with zero config.
- **Suggested layout:**
```
app/                     landing, /room/[id], /r/[id] (recovery), api/ routes
app/api/rooms/...        create, get (projected), join, preferences, ideas, focus,
                         respond, correct, coordinator actions, demo actions, ai
lib/catalogue.ts         Appendix A data
lib/engine.ts            slots, travel, estimates, statuses, ranking, fix hints (pure)
lib/consent.ts           versions, validity, change rules, agreed state (pure)
lib/deadline.ts          outcome recording (pure + store call)
lib/projection.ts        per-viewer projection (pure)
lib/ai.ts                Gemini calls, schemas, validators, fallbacks
lib/store.ts             Supabase + local adapters
tests/                   vitest unit tests + Playwright e2e
supabase/migrations/     SQL (cg_ tables)
```

## 17. Data model (Supabase, all tables `cg_`-prefixed, RLS on, no public policies)
```sql
create table cg_rooms (
  id text primary key, name text not null, trip_days int not null check (trip_days between 2 and 5),
  window_start date not null, window_end date not null, deadline_at timestamptz not null,
  focus_option_id text, focus_id int not null default 0,
  status text not null default 'open' check (status in ('open','postponed','closed')),
  coordinator text not null, admin_token_hash text not null, is_demo boolean not null default false,
  created_at timestamptz not null default now());
create table cg_members (
  room_id text references cg_rooms(id) on delete cascade, name text not null,
  session_hash text, recovery_hash text, joined_at timestamptz, policy_ack_at timestamptz,
  pref_version int not null default 0, primary key (room_id, name));
create table cg_preferences (
  room_id text, member text, home_city text, budget_max int, budget_comfortable int,
  slots text[] default '{}', vibes text[] default '{}', wont_do text[] default '{}',
  max_travel_hours int, leave_days int, note_private text, parsed_limits jsonb default '[]',
  complete boolean not null default false, updated_at timestamptz default now(),
  primary key (room_id, member), foreign key (room_id, member) references cg_members on delete cascade);
create table cg_options (
  room_id text references cg_rooms(id) on delete cascade, id text, source text check (source in ('engine','custom','variant')),
  destination_id text, name text not null, start_date date not null, days int not null,
  activities text[] default '{}', shared_assumptions text, default_estimate int,
  version int not null default 1, archived boolean default false, created_at timestamptz default now(),
  primary key (room_id, id));
create table cg_corrections (
  room_id text, option_id text, member text, total int not null, basis text not null, checked_on date not null,
  option_version int not null, cost_version int not null default 1, stale boolean default false,
  primary key (room_id, option_id, member));
create table cg_responses (
  room_id text, member text, focus_id int, option_id text, option_version int, pref_version int, cost_version int,
  answer text check (answer in ('yes','change','cannot')), reason_chip text, note_shared text,
  at timestamptz default now(), primary key (room_id, member, focus_id));
create table cg_outcomes (
  room_id text references cg_rooms(id) on delete cascade, deadline_at timestamptz, focus_option_id text,
  valid_yes int, total int, result text check (result in ('agreed','unresolved')),
  recorded_at timestamptz default now(), primary key (room_id, deadline_at));
create table cg_events (
  id bigint generated always as identity primary key, room_id text, type text, member text,
  meta jsonb, at timestamptz default now());
-- enable RLS on every cg_ table; add no policies (server uses the service role key)
```
(Adjust as needed. Keep the versioning fields and the `cg_` prefix.)

## 18. Acceptance tests (the build is "done" only when all pass)
1. **Engine (randomized, ≥ 500 groups):**
   - an unknown is never "Fits";
   - over max is always Limit;
   - an unticked slot is always Limit;
   - a won't-do hit is always Limit;
   - ordering obeys §7.5;
   - 3 unique, dissimilar ideas when possible;
   - every displayed fix hint re-scores true.
2. **Consent:** "Agreed for planning" appears only with valid current yeses from all members. Silence, a missing member, a stale version, a Limit/Needs-checking member or any coordinator action never counts.
3. **Change rules:** one unit test per rule in §8.2 (including "edit a non-focused idea → 0 reopened", "my preference edit → only my yes reopens").
4. **Deadline:** the outcome is recorded exactly once per deadline; late yeses change the current state, not the record; extending keeps yeses.
5. **Privacy:** snapshot of the API response as Aisha contains no other member's budget, note, slots or correction basis.
6. **Demo:** the three stories in §14 pass end to end (Playwright).
7. **Fallback:** the full demo passes with no `GEMINI_API_KEY`.
8. **Mobile:** Playwright screenshots at 390 px of Your trip, Compare, Preferences and the Agree screen show no horizontal overflow; Lighthouse accessibility ≥ 90 on the room page.
9. **Production smoke:** on the Vercel URL, run the demo stories once; create a real room, join from a second browser context, confirm the privacy projection.

## 19. Build plan & gates (dates in IST)
| When | Scope | Gate |
|---|---|---|
| Day 1 (Thu 24) | Scaffold · catalogue · engine · consent · deadline · projection (pure libs) + tests 1–5 | All unit tests green |
| Day 2 (Fri 25) | API routes · store adapters · all screens · coordinator card · WhatsApp drafts · demo room | Tests 6–8 green; screenshots reviewed |
| Day 3 (Sat 26, morning) | P1 items in order (P1-1, P1-4, P1-3, P1-2, P1-5) only while green | Tests stay green |
| Day 3 (Sat 26, afternoon) | Supabase migration (`cg_`) · Vercel deploy · smoke test 9 · component map · README | Live URL works; submit Form 2 before 11:59 PM |

**If time runs short:** ship P0 only. A working, honest P0 beats a broken P1.

## 20. Success metrics (for the README / viva; not claimed as achieved)
- **North star:** rooms reaching all-member current yeses by their deadline (**denominator = all rooms with an elapsed deadline**, abandoned ones included).
- Time from room creation to agreement.
- Participation mix (complete / partial / none).
- Reopened yeses from relevant vs unrelated edits (unrelated target = 0).
- Outcome mix (agreed / unresolved / postponed / closed).
- Reversals and their reason chips.
- AI: note-parse accuracy, sketch violations, fallback rate.

## 21. Known limits (state honestly in the README)
- Estimates are a distance model, not fares.
- No identity verification beyond the room link + name claim.
- Unanimity can stall, so "unresolved" is a legitimate, visible outcome.
- Early focus may anchor the discussion; alternatives stay visible.
- Fit labels can hint at budget ranges.
- Catalogue is domestic India only.

---

## Appendix A: Catalogue data (curated; costs are per person per day for stay + food + local travel, ₹)

Tag vocabulary: beach, mountains, nature, adventure, relaxed, heritage, food, nightlife, city.

Won't-do ids:
- `no_trek` (No treks / strenuous hikes)
- `no_cold` (No cold places)
- `no_beach` (No beach trips)
- `no_party` (No party-heavy places)
- `no_flights` (No flights)
- `no_overnight` (No journeys over 8 hrs one way)
- `no_crowds` (No crowded tourist spots)

Mapping from won't-do to destination data:
- trek flag → `no_trek`;
- a cold month (the trip's start month is in the cold months) → `no_cold`;
- "beach" tag → `no_beach`;
- party flag → `no_party`;
- crowded flag → `no_crowds`;
- flightOnly flag, or a flight chosen with no ground option → `no_flights`.

| id | name | state | lat,lng | tags | day cost ₹ (low–high) | access h (ground) | air h | flags | cold months | off months (reason) |
|---|---|---|---|---|---|---|---|---|---|---|
| goa | North Goa | Goa | 15.55,73.75 | beach, nightlife, food, relaxed | 2500–5000 | 0.5 | 1 | party, crowded |  | 6,7,8,9 (monsoon, many shacks shut) |
| gokarna | Gokarna | Karnataka | 14.55,74.32 | beach, relaxed, nature | 1500–3000 | 1.5 | 3.5 |  |  | 6,7,8,9 (monsoon) |
| varkala | Varkala | Kerala | 8.73,76.72 | beach, relaxed, food | 2000–3500 | 1 | 1.2 |  |  | 6,7,8 (monsoon) |
| pondicherry | Pondicherry | Puducherry | 11.93,79.83 | beach, heritage, food, city | 2000–4000 | 0.5 | 3 |  |  | 11 (north-east monsoon rains) |
| havelock | Havelock, Andamans | Andaman & Nicobar | 11.97,92.99 | beach, adventure, nature | 4000–8000 | 3 | 3 | flightOnly |  | 5,6,7,8,9 (monsoon, rough seas) |
| alibaug | Alibaug | Maharashtra | 18.64,72.87 | beach, relaxed | 2500–5000 | 1 | 2.5 |  |  | 6,7,8 (monsoon) |
| alleppey | Alleppey backwaters | Kerala | 9.49,76.34 | nature, relaxed, food | 2500–5000 | 0.5 | 1.5 |  |  |  |
| munnar | Munnar | Kerala | 10.09,77.06 | mountains, nature, relaxed | 2000–4000 | 1.5 | 4 |  |  | 6,7,8 (heavy monsoon, landslide risk) |
| coorg | Coorg | Karnataka | 12.42,75.74 | mountains, nature, relaxed, food | 2500–5000 | 1 | 3 |  |  | 6,7,8 (heavy monsoon) |
| chikmagalur | Chikmagalur | Karnataka | 13.32,75.77 | mountains, nature, adventure, relaxed | 2000–4000 | 1 | 3.5 |  |  | 6,7,8 (heavy monsoon) |
| wayanad | Wayanad | Kerala | 11.68,76.13 | nature, mountains, adventure | 2000–4000 | 1 | 2.5 |  |  | 6,7,8 (heavy monsoon, landslide risk) |
| ooty | Ooty | Tamil Nadu | 11.41,76.7 | mountains, relaxed, nature | 2000–4000 | 1.5 | 3 | crowded | 12,1 |  |
| kodaikanal | Kodaikanal | Tamil Nadu | 10.24,77.49 | mountains, relaxed, nature | 2000–3500 | 2 | 3.5 |  | 12,1 |  |
| hampi | Hampi | Karnataka | 15.34,76.46 | heritage, adventure, relaxed | 1500–3000 | 0.5 | 2.5 |  |  | 4,5 (extreme heat) |
| lonavala | Lonavala | Maharashtra | 18.75,73.41 | mountains, relaxed, nature | 2000–4000 | 0 | 2 | crowded |  |  |
| mahabaleshwar | Mahabaleshwar | Maharashtra | 17.92,73.66 | mountains, relaxed, nature | 2000–4000 | 1 | 3.5 |  |  | 6,7,8 (monsoon closures) |
| udaipur | Udaipur | Rajasthan | 24.58,73.71 | heritage, city, food, relaxed | 2500–5000 | 0.5 | 0.7 |  |  | 4,5,6 (extreme heat) |
| jaipur | Jaipur | Rajasthan | 26.91,75.79 | heritage, city, food | 2000–4000 | 0 | 0.5 | crowded |  | 4,5,6 (extreme heat) |
| jaisalmer | Jaisalmer | Rajasthan | 26.91,70.92 | heritage, adventure | 2000–4500 | 1 | 1 |  | 12,1 | 4,5,6,7,8 (extreme heat) |
| varanasi | Varanasi | Uttar Pradesh | 25.32,83.01 | heritage, food | 1500–3000 | 0.5 | 0.8 | crowded |  | 5,6 (extreme heat) |
| rishikesh | Rishikesh | Uttarakhand | 30.09,78.27 | adventure, nature, relaxed | 1500–3500 | 1 | 1 | crowded |  | 7,8 (rafting closed in monsoon) |
| mussoorie | Mussoorie | Uttarakhand | 30.46,78.07 | mountains, relaxed | 2000–4000 | 1.5 | 1.8 | crowded | 12,1,2 |  |
| nainital | Nainital | Uttarakhand | 29.38,79.46 | mountains, relaxed, nature | 2000–4000 | 1.5 | 2.5 | crowded | 12,1,2 |  |
| corbett | Jim Corbett | Uttarakhand | 29.53,78.77 | nature, adventure | 3000–6000 | 1 | 3 |  |  | 7,8,9 (core zones closed in monsoon) |
| shimla | Shimla | Himachal Pradesh | 31.1,77.17 | mountains, heritage, relaxed | 2000–4000 | 2 | 3 | crowded | 12,1,2 |  |
| manali | Manali | Himachal Pradesh | 32.24,77.19 | mountains, adventure, nightlife, nature | 2000–4500 | 3 | 2.5 | crowded | 11,12,1,2,3 |  |
| kasol | Kasol & Parvati Valley | Himachal Pradesh | 32.01,77.31 | mountains, nature, relaxed, adventure | 1500–3000 | 4 | 3 | trek, party | 11,12,1,2,3 |  |
| mcleodganj | McLeod Ganj | Himachal Pradesh | 32.24,76.32 | mountains, heritage, relaxed, food | 1500–3000 | 2 | 1 |  | 12,1,2 |  |
| tirthan | Tirthan Valley | Himachal Pradesh | 31.64,77.47 | nature, mountains, relaxed | 1800–3500 | 3 | 3 |  | 12,1,2 |  |
| leh | Leh | Ladakh | 34.15,77.58 | mountains, adventure, heritage | 3500–7000 | 0.5 | 0.3 | flightOnly | 10,11,12,1,2,3,4 | 11,12,1,2,3 (deep winter, many routes shut) |
| darjeeling | Darjeeling | West Bengal | 27.04,88.26 | mountains, heritage, relaxed, food | 2000–3500 | 3 | 3 |  | 12,1,2 |  |
| gangtok | Gangtok | Sikkim | 27.33,88.61 | mountains, nature, heritage | 2500–4500 | 4 | 4 |  | 12,1,2 |  |
| meghalaya | Shillong & Cherrapunji | Meghalaya | 25.58,91.89 | nature, adventure, mountains | 2000–4000 | 3 | 3.5 | trek |  | 6,7,8 (extreme rainfall) |

| city id | name | lat,lng |
|---|---|---|
| bengaluru | Bengaluru | 12.97,77.59 |
| mumbai | Mumbai | 19.08,72.88 |
| delhi | Delhi NCR | 28.61,77.21 |
| hyderabad | Hyderabad | 17.39,78.49 |
| chennai | Chennai | 13.08,80.27 |
| pune | Pune | 18.52,73.86 |
| kolkata | Kolkata | 22.57,88.36 |
| ahmedabad | Ahmedabad | 23.02,72.57 |
| jaipur | Jaipur | 26.91,75.79 |
| chandigarh | Chandigarh | 30.73,76.78 |
| lucknow | Lucknow | 26.85,80.95 |
| indore | Indore | 22.72,75.86 |
| kochi | Kochi | 9.93,76.27 |
| guwahati | Guwahati | 26.14,91.74 |
