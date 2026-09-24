# Common Ground

**One link where five friends save their limits, a few rule-checked trip ideas with per-person cost estimates, and a trip that counts as agreed only when everyone explicitly says yes to its current terms.**

Built for the Mesa School of Business L2 assessment (Part B, Section A: group trip planner). The locked spec is [docs/PRD.md](docs/PRD.md).

- **Live app:** _(added after deploy)_
- **Component map:** [docs/component-map.png](docs/component-map.png)

## The problem

Riya, Siddharth, Karan, Aisha and Preethi have spent three months and 1,200+ WhatsApp messages failing to plan one trip. A Google Form got 3/5 replies; a 5/5 poll collapsed when two people changed their minds; Riya, who coordinates, is being blamed.

## How it works

**Rules check, AI helps, people decide.**

1. **Riya creates a room.** She gets one group link for WhatsApp and a private coordinator link.
2. **Everyone taps their own name** (each name can be claimed once) and saves their limits in about two minutes: home city, max and comfortable budget, which weekends work, up to 3 vibes, won't-dos, and optionally travel hours, leave days and a private note.
3. **Rules suggest 3 dissimilar trips** from a curated catalogue of 33 Indian destinations. For each person, the engine estimates travel from their home city plus stay, food and local travel, as a range with a basis and date. It labels every person's fit on every idea: *Limit not met*, *Needs checking*, *Compromise* or *Fits stated inputs*. Unknowns are never "fits".
4. **One trip is up for review at a time: "Can this trip work for you?"** Each person answers from their own view: *Yes, I'm in* (one confirmation screen), *Needs a change*, or *Can't join*. A yes is blocked while any hard limit is unmet or anything needs checking.
5. **"Agreed for planning"** appears only when every member has a valid, current yes. The group then gets an announcement and a book-it-yourself checklist.
6. **The deadline records an outcome** (agreed or unresolved, n/5) exactly once. It never picks a winner, and later answers never rewrite it.

### Rules that can't be bent

- Silence isn't a yes. Hard limits can't be overridden. The coordinator can never supply anyone's yes. Anyone can change their answer.
- **Versioned approvals, with the 4 change rules:**
  1. Editing an idea that isn't in focus reopens nothing.
  2. Changing the focused idea's dates, days or shared terms reopens every yes on it, and marks personal corrections stale.
  3. Editing your own preferences or estimate reopens only your own yes.
  4. Switching focus starts fresh answers for the new idea; old answers stay in History.
- **Privacy is server-side.** The server builds a separate view per person. Other members' budgets, notes, date lists, home cities and correction details never reach your browser. You see only their status label, their answer and anything they chose to share.
- **Every ₹ is an estimate** with a basis and date. Each person can replace their own all-in total with a checked figure.

### Where Gemini helps (optional, never decides)

| Job | What Gemini sees | Guardrails | Without a key |
|---|---|---|---|
| Next-step wording for Riya | Anonymous slots A–E with statuses, answers and counts | No names, money or notes; placeholders are filled server-side; any amount in the output is rejected; the rules still own the action | Rules wording, labelled "Suggested by the rules" |
| 3-line trip sketch | Focused idea name, tags, days, anonymous won't-dos | Keyword check against won't-dos and prices; regenerated once, then dropped | No sketch |
| Read my note | That person's own note only | Allow-listed limit types only; nothing counts until the person ticks it | Note stays unchecked and the person is told |

### What we cut, on purpose (The Cut)

No live fares, hotel availability or booking. That data isn't reliably available to us, and a wrong price that breaks someone's budget would recreate the blame Riya faces. Everyone books their own travel.

## Try it

**Try the demo** on the landing page opens a fresh demo room as Karan. The demo bar lets you *View as* anyone, and runs three stories:

- **Reset → 2. Simulate four friends → 3. Reach deadline** ⇒ "At the deadline: unresolved, 4/5 yeses", with the next move "nudge Karan".
- **Reset → 1. Fill Karan's sample preferences → 2. Simulate four friends → Karan says Yes** ⇒ "Agreed for planning".
- **Try 3/5** ⇒ a provisional comparison where missing people show "Needs checking", never "Fits".

View-as and simulated answers work only in demo rooms (enforced on the server), and simulated answers are labelled in History.

## Run it locally

Requires Node 20+.

```bash
npm install
npm run dev
```

With no environment variables, the app uses a local JSON store in `.data/` and the rules fallback for everything Gemini would do.

### Environment variables (production)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL (server only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server only, never sent to the browser) |
| `GEMINI_API_KEY` | Optional. Enables the three Gemini helpers |
| `GEMINI_MODEL` | Optional. Defaults to `gemini-3.8-flash` |

The database schema is in [supabase/migrations/](supabase/migrations/). Every table is prefixed `cg_`, with row-level security on and no public policies.

## Tests

```bash
npm test                                   # unit tests (Vitest)
npx next build && npx playwright test      # end-to-end, screenshots, accessibility (Playwright)
node scripts/lighthouse.mjs <baseUrl>      # Lighthouse accessibility score
npx vitest run --config vitest.eval.mts    # live Gemini note-parsing eval (needs GEMINI_API_KEY)
```

**Results (local, 23 Sep 2026):**

| PRD §18 test | Result |
|---|---|
| 1. Engine, 500 random groups | Pass. 83,886 person-checks and 187 fix hints re-verified. Checked that unknowns are never "fits"; over-max, unticked dates and won't-do hits are always "Limit not met"; ordering follows §7.5; the top 3 are unique and dissimilar when possible. |
| 2. Consent | Pass. Silence, a missing member, a stale version, a blocked member, and every coordinator action never count. |
| 3. Change rules | Pass. One test per rule, plus identical saves and deadline extension. |
| 4. Deadline | Pass. Recorded exactly once; late yeses don't rewrite the record; extending keeps yeses. |
| 5. Privacy | Pass. Aisha's projection contains no other member's budget, note, date list, city or correction; key structure is snapshotted. |
| 6. Demo stories (Playwright) | Pass. All three. |
| 7. No Gemini key | Pass. The whole end-to-end suite runs with no key. |
| 8. Mobile | Pass. No horizontal overflow at 390 px or 1280 px on Your trip, Compare, Preferences, Agree and the coordinator view. Lighthouse accessibility 100 on the landing and room pages; axe reports no violations. |
| 9. Production smoke | _(after deploy)_ |

Totals: 56 unit tests and 8 end-to-end tests passing. A deliberately planted bug (over-budget treated as a compromise) was caught by the suite.

**P1-2 note-parsing eval:** 25 labelled notes (easy, ambiguous, out-of-scope, adversarial) in [tests/eval/notes.json](tests/eval/notes.json); target ≥ 90% exact match. **Result: 25/25 = 100% exact match** with `gemini-3.8-flash` (24 Sep 2026), including all 4 adversarial notes. Server-side allow-list validation runs regardless of what the model returns, and nothing counts until the person ticks it.

## Project layout

```
app/                  landing, /room/[id], /r/[id] (private recovery link), api/ routes
components/           UI (room screens, sheets, Next-step card, demo bar)
lib/engine.ts         slots, travel and cost estimates, statuses, ranking, fix hints (pure)
lib/consent.ts        versions, validity, agreed state (pure)
lib/actions.ts        every write as a pure function, including the 4 change rules
lib/deadline.ts       outcome recording and next move (pure)
lib/projection.ts     per-viewer privacy projection (pure)
lib/ai.ts             Gemini calls, schemas, validators, fallbacks
lib/store.ts          Supabase and local JSON adapters
tests/unit, tests/e2e, tests/eval
supabase/migrations/  cg_ tables
```

## Known limits (honest)

- **Estimates are a distance model, not fares.** Travel cost and time are computed from straight-line distance and a mode rule; per-day costs are curated ranges. They can be wrong for any one journey, which is why every person can correct their own total.
- **No identity verification** beyond the room link and a one-time name claim. Anyone holding the group link can claim an unclaimed name. There are no accounts.
- **Unanimity can stall.** "Unresolved" is a legitimate, visible outcome, not a failure the app hides.
- **Early focus may anchor the discussion.** Alternatives stay visible on Compare, and Riya can switch focus.
- **Fit labels can hint at budget ranges.** A "Limit not met" against a known estimate says something about someone's ceiling. Fix hints can reveal that someone isn't free on one date. This is disclosed in the app.
- **The catalogue is domestic India only**: 33 destinations and 14 home cities. There is no public-holiday inference; each person's own date ticks are the truth.
- **Rate limiting is per server instance** (best-effort on serverless). Deadline outcomes are recorded on the next read or write after the deadline, not by a background job.
- **The private link** is shown once when you join and kept in your own browser. If you lose it, you can make a new one only from a device that's still signed in.
- **Workflow benefits are unproven.** Nothing here shows that friends will answer faster than they would to a pinned WhatsApp message. That needs real users.

## Success metrics (to measure, not claimed)

- **North star:** the share of rooms reaching all-member current yeses by their deadline (denominator: all rooms with an elapsed deadline, abandoned rooms included).
- Time from room creation to agreement.
- Participation mix: complete, partial or no preferences.
- Reopened yeses from relevant vs unrelated edits (target for unrelated: 0).
- Outcome mix: agreed, unresolved, postponed, closed.
- Reversals and their reason chips.
- AI: note-parse accuracy, sketch violations, fallback rate.
