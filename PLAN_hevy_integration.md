# PLAN — Hevy → Circuito

**What this is.** A UI/UX proposal for borrowing from Hevy (hevyapp.com), screen by screen, against Circuito as it stands on 2026-08-17. Every item says which Circuito surface it touches and whether it **integrates** into what is there, **replaces** it, or is **rejected**.

**Scope agreed with the user (2026-08-17):** *hybrid*. Reps trainings get a real per-set log — Hevy's central idea. Timed circuits stay a timer and are never turned into a strength log.

**Decisions taken (2026-08-17), folded into everything below:**

| # | Question | Answer | Consequence |
|---|---|---|---|
| D1 | Dumbbells only, or barbell too? | **Both** | Plate calculator is in (§B9). Needs `Exercise.equipment` — §1.4. |
| D2 | Log actual reps on a gated step in a *timed* circuit? | **No — there are no reps in a timed circuit** | The timed player never writes a log. §3.4 shrinks; §1.5 states the boundary. |
| D3 | Program per-set variance (12 / 10 / 8)? | **Yes, include it** | `Step.targetReps` becomes `Step.setTargets` — §1.3. |
| D4 | Seed starter templates? | **No — from your own library** | Templates shelf dropped from the roadmap. |
| D5 | Live Activity / widgets? | **My call** | Ongoing notification first, Live Activity + widget deferred — §3.9. |
| D6 | Reps training with `repeat > 1` — circuit or straight sets? | **Circuit — all exercises, then repeat** | The logger is round-major, not exercise-major. `Block.repeat` keeps one meaning across both kinds. §3.3. |
| D7 | What does "Previous" compare against? | **This exercise, anywhere, most recent** | Always populated. Needs a provenance line so the comparison stays honest — §3.3. |
| D8 | When does the rest timer fire? | **Automatically, on every ✓** | Duration comes from `Step.restAfterSeconds`, which already exists and is currently dead on reps trainings — §3.3. |
| D9 | `+ Add set`, and RPE | **Log-only; ship RPE unwired** | An added set never edits the plan and renders as *extra*. RPE column exists from day one, no input — §6. |

---

## 0. Read this before the list

Hevy and Circuito are not the same product, and most of what makes Hevy good does not transplant.

|  | Hevy | Circuito |
|---|---|---|
| Unit of work | a **set** you record after doing it | a **cue** the clock hands you |
| Time | a rest timer between sets | the entire spine of the model |
| The plan | a routine = flat list of exercises × sets | a training = blocks × rounds × steps |
| The session | you type what happened | the runner observes what happened |
| Social | core (feed, leaderboards, sharing) | absent, and correctly so |

Two consequences that shape everything below:

1. **Circuito's block/round model is *better* than Hevy's for circuits.** Hevy bolts on "supersets" as a grouping hack; Circuito has real blocks with a repeat count and a round rest. Do not import supersets. Do not flatten blocks.
2. **Circuito's honesty rule ("never show an invented number") is a real asset.** `trainingHeadline` returns `hasUntimed` and the UI prints `10:55 +` rather than lying. Hevy would just print a number. Keep the rule; several proposals below are shaped by it.

**The one thing Circuito is genuinely missing** is not a screen — it is a fact. `Session` records `elapsedSeconds / workSeconds / restSeconds / roundsCompleted` and nothing about *what you lifted*. Every Hevy screen worth stealing (previous values, exercise history, records, volume charts) is downstream of per-set data. So §1 is a data change, and §2 onward spends it.

---

## 1. The enabling change: a set log

### 1.1 New table

```
set_logs
  id            TEXT PK
  sessionId     TEXT  → sessions.id
  exerciseId    TEXT  → exercises.id
  blockId       TEXT                    -- for grouping in the summary
  stepId        TEXT                    -- which slot in the plan produced this
  roundIndex    INTEGER                 -- 1-based, matches Block.repeat
  setIndex      INTEGER                 -- 1-based within the round (usually 1)
  reps          INTEGER  NULL
  weightKg      REAL     NULL
  weightCount   INTEGER  NULL           -- same "2 × 3 kg" convention as Step
  type          TEXT     DEFAULT 'normal'   -- normal | warmup | drop | failure
  rpe           REAL     NULL
  completedAt   TEXT
  updatedAt, deletedAt                  -- same soft-delete/sync discipline as every other table
```

Fits the existing conventions exactly: client UUID, `position`-style ordering via `roundIndex/setIndex`, `updatedAt` + `deletedAt` for the phase-8 sync. No change to `Training`, `Block`, `Session`.

There is deliberately **no `seconds` column**. Per D2 the timed player writes nothing, so a logged duration would have no producer.

### 1.2 The rule that keeps the model clean

> **The plan prescribes. The log observes. Neither writes to the other.**

`Step.setTargets` is the *plan*. `set_logs` rows are what happened. This preserves the "durations are derived, never stored" spirit and means a training can be edited without rewriting history — the same reason `Session.trainingName` is already denormalised.

The one bridge, and it goes one way only: when a step is opened for logging, its target prefills the input as a **placeholder**, never as a value. An untouched set logs nothing.

### 1.3 `targetReps` → `setTargets` (D3)

Today a step prescribes one number. `12 / 10 / 8` cannot be expressed. The fix that does **not** fight the existing model:

```ts
export interface SetTarget {
  reps?: number;
  weightKg?: number;
  weightCount?: number;
}

export interface Step {
  // ...
  /**
   * Per-round prescription. Length is either 1 (applies to every round) or
   * exactly `Block.repeat` (entry i is round i). Any other length is a
   * validation error — see domain/validation.ts.
   *
   * Replaces the scalar `targetReps`. Migration v_next reads the old column
   * into `[{ reps: targetReps }]`.
   */
  setTargets?: SetTarget[];
}
```

**Why length is tied to `Block.repeat` and not free.** A block with `repeat: 3` already means "three rounds". If a step also carried three independent sets, a 3-round block of a 3-set step would mean nine sets, and nobody could say which. Binding the array to the round index makes `12 / 10 / 8` read exactly as it is performed: round 1 is 12, round 2 is 10, round 3 is 8. It also gives descending *weight* for free, which is the other half of a pyramid.

Knock-on effects, all small:

- `validation.ts` — one new rule (length ∈ {1, repeat}).
- `duration.ts` / `stepMetaLine` — render `12 · 10 · 8` where it currently renders `×10 reps`.
- `queue.ts` — a gated cue reads `setTargets[round - 1] ?? setTargets[0]`.
- Builder `MiniStepper` "Reps" — becomes a row of per-round steppers when `repeat > 1`, collapsed behind a "vary by round" toggle so the common case stays one number.

### 1.4 `Exercise.equipment` (D1)

Barbells are in play, and `weightKg` + `weightCount` cannot distinguish "a 20 kg bar loaded to 60" from "a 60 kg dumbbell". One new optional field on the library entity:

```ts
equipment?: 'bodyweight' | 'dumbbell' | 'barbell' | 'kettlebell' | 'machine' | 'band' | 'other';
```

This is the right kind of field for `Exercise` by the file's own test: it is a property of the *movement*, not of a particular circuit — a barbell squat is a barbell squat everywhere. Same category as `kind` and `defaultWeightKg`.

It pays for itself three times: the plate calculator only appears for `barbell`, the library gets a second filter axis alongside tags, and the Records tab knows whether to say "heaviest" or "max reps".

### 1.5 The boundary (D2)

> **Only reps trainings write to `set_logs`. The timed player never does.**

Rep-gated steps inside a timed circuit keep working exactly as they do now — they show `targetReps` where the clock would be, wait for `DONE`, and record nothing. The timed player stays a screen you do not look at.

The honest consequence, which the UI must handle rather than paper over: **an exercise used only in timed circuits has no history and no records.** Its Records tab shows an empty state naming the reason ("Records come from reps trainings"), not a row of zeros. This is the same discipline as `REPS` instead of `00:00` in History.

---

## 2. Master list — Hevy pattern → Circuito

Verdicts: **REPLACE** (swap out an existing surface) · **INTEGRATE** (add into an existing surface) · **ADAPT** (the idea, not the implementation) · **REJECT**.

### 2.1 High value, do first

| # | Hevy pattern | Circuito surface | Verdict | Why |
|---|---|---|---|---|
| A1 | Active workout screen: set rows with a ✓ per set | `app/reps/[trainingId].tsx` | **REPLACE** | The reps screen is a read-only sheet with a single Finish button. It is the one place Circuito is strictly worse than Hevy. |
| A2 | "Previous" column beside each set | reps logger | **INTEGRATE** | Highest value-per-pixel feature in Hevy. Needs §1. |
| A3 | Auto rest timer fired by ✓ | reps logger | **INTEGRATE** | Circuito already owns the timing logic (`useRunner`, `useCueSounds`). Reuse it as a sheet, not a new screen. |
| A4 | Exercise detail = Summary / History / How-to tabs | `app/exercise/[id].tsx` | **INTEGRATE** | Today 1f is a form only. Add tabs above it. |
| A5 | Routine card with a **Start** button | `app/(tabs)/index.tsx` | **INTEGRATE** | Currently: tap card → detail → Start. Two taps to begin the thing the app exists for. |
| A6 | Folders for routines | Train tab | **ADAPT** | Use the existing tag idiom (filter pills, as in Library) rather than a folder tree. Same benefit, no new nav. |
| A7 | Workout calendar / consistency grid | `app/(tabs)/history.tsx` | **INTEGRATE** | The 8-bar minutes chart is good but answers only one question. A month grid answers "did I show up". |

### 2.2 Worth doing, second wave

| # | Hevy pattern | Circuito surface | Verdict | Why |
|---|---|---|---|---|
| B1 | Set types (warm-up / drop / failure), tap the set number to change | reps logger | **ADAPT** | Take *warm-up* and *failure*. Drop sets suppress the rest timer in Hevy — that behaviour is worth having; the label is optional. |
| B2 | Sets-per-muscle-group chart | History tab | **ADAPT** | Circuito has no muscle taxonomy — but it has **`Exercise.tags`**, already user-authored and already driving the library pills. Chart volume *per tag*. Zero new data, zero new taxonomy to maintain. |
| B3 | Per-exercise breakdown on the finished-workout summary | `app/session/[id].tsx` | **INTEGRATE** | 1k shows aggregates only. A list of what you actually did belongs under the split bar. |
| B4 | Live PR notification during a workout | reps logger | **INTEGRATE** | A toast on beating a set record. Cheap once §1 exists; disproportionately motivating. Reps logger only (D2). |
| B5 | Exercise notes surfaced during the workout | reps logger | **INTEGRATE** | `Exercise.note` exists and is deliberately *not* shown during play. Correct for the timed player; wrong for the reps sheet, which is read at rest. |
| B6 | Multi-select in the exercise picker | `components/ExercisePicker.tsx` | **INTEGRATE** | Building an 8-exercise block costs 8 open/close cycles. |
| B7 | Duplicate a routine | Train tab / training detail | **INTEGRATE** | "Same circuit, heavier" is the most common edit. There is no duplicate today. |
| B8 | Rest timer controls: −15s / +15s / skip | `app/player/[trainingId].tsx` | **INTEGRATE** | The player has ◀◀ / play / ▶▶ only. Skipping a rest is all-or-nothing. |
| B9 | Plate calculator | step edit sheet, reps logger | **INTEGRATE** | In, per D1. Gated on `equipment === 'barbell'` (§1.4) so dumbbell circuits never see it. |
| B10 | Live Activity / lock-screen state | player | **ADAPT** | Ongoing notification first, Live Activity later — see §3.9. |
| B11 | Monthly report / Year in review | History | **ADAPT** | A single "This month" card that expands, not a separate ceremony screen. |

### 2.3 Rejected — and why it matters that they are

| Hevy feature | Verdict | Reason |
|---|---|---|
| Social feed, likes, comments | **REJECT** | Requires accounts, moderation, a backend and a content policy. Circuito is local-first by design (`db/schema.ts`: "the app is fully usable signed out"). |
| Leaderboards, athlete profiles, discovery feed | **REJECT** | Same, plus they change what the app is *for*. |
| Coach / trainer platform, assigned workouts | **REJECT** | Different product. |
| HevyGPT, routine generator | **REJECT** | Would produce invented durations — a direct violation of the model's central rule. |
| Strava integration | **REJECT for now** | Depends on accounts. Revisit at phase 8. |
| Supersets | **REJECT** | Circuito's blocks already do this, better. Importing it would create two ways to express one idea. |
| **Routine library / starter templates** | **REJECT (D4)** | Trainings are built from your own library. No seeded content. |
| Progress photos, body measurements | **DEFER** | Legitimate, but a separate domain (a `measurements` table, a photo store, a privacy story). Not part of "improve the existing screens". |
| Home-screen widgets | **DEFER (D5)** | Needs a second native target. See §3.9. |
| Apple Watch / web app | **DEFER** | Platform work, not UX work. |

---

## 3. Screen by screen

### 3.1 Train tab — `app/(tabs)/index.tsx`

**Keep:** the `StructureStrip`, the `10:55 +` honesty, the `REPS` chip, the derived meta line. These are better than Hevy's routine card, which shows only a name and an exercise list.

**Change:**

1. **Card actions → overflow.** Every card currently carries a live `BinButton`. Hevy hides destructive actions behind `⋯`. Replace the bin + hairline with a `⋯` opening: *Start · Edit · Duplicate · Delete*. This also gives B7 a home for free.
2. **Primary action on the card (A5).** A small `▶` on the right of the card starts immediately (routing to `/player` or `/reps` by `kind`, mirroring the branch already in `training/[id]/index.tsx`).
3. **Filter pills (A6).** Reuse `FilterPill` from Library, driven by the union of each training's exercises' tags — no schema change, and it is honest: a "Gambe" circuit is one made of Gambe exercises. Search box, same component as Library's.
4. **Last session block.** Promote it above the list when it is from today — Hevy's home leads with recency, Circuito buries it under an arbitrarily long list.

```
┌──────────────────────────────────────┐
│ Trainings                        (+) │
│ 6 saved                              │
│ [Search trainings          ]         │
│ ( All 6 )( Gambe 3 )( Braccia 2 )    │
├──────────────────────────────────────┤
│ Circuito Gambe          10:55 +  ⋯   │
│ 3 rounds · 5 exercises · 2 × 3 kg    │
│ ▓▓░▓▓░▓▓▓░▓▓                    [▶]  │
└──────────────────────────────────────┘
```

### 3.2 Builder — `app/training/[id]/builder.tsx`

The builder is already stronger than Hevy's routine editor (live total, block repeats, per-step mode resolution, `LayoutAnimation` on kind switch). Borrows:

1. **Multi-select picker (B6).** `ExercisePicker` returns `Exercise[]`; `addExercise` loops. Sheet keeps a running "3 selected" footer.
2. **Drag between blocks.** Called out in the file header as a follow-up; Hevy makes reordering across the whole routine trivial and it is a real friction point. The model already supports it.
3. **Per-round targets (D3, §1.3).** The `Reps` `MiniStepper` gains a "vary by round" affordance when `Block.repeat > 1`, expanding to one stepper per round. Collapsed by default — the single-number case must stay a single number.
4. **Plate calculator entry point (B9).** In `StepEditSheet`, beside the weight field, only when the exercise is `equipment: 'barbell'`. Bar weight comes from Settings (§3.8).
5. **Do *not* import Hevy's per-exercise rest default.** Circuito deliberately keeps durations off `Exercise` (argued at length in `domain/types.ts`) and the argument is right: 45s here, 60s there.

### 3.3 Reps screen → **the logger** — `app/reps/[trainingId].tsx`

**This is the flagship change.** Today: a static list and a `Finish` that writes a session of all zeros with `roundsCompleted = roundsPlanned`, because — in the file's own words — "nothing here observes how much you actually did". That candour is exactly the gap to close.

#### Round-major, not exercise-major (D6)

Hevy's logging screen is *exercise-major*: one card per exercise, its sets stacked inside. That is correct for straight sets and **wrong for Circuito**, where a block is performed as a circuit — every exercise once, then repeat. Borrow the row anatomy, not the page structure.

So the logger is a list of **rounds**, and within a round, a row per exercise. This keeps `Block.repeat` meaning exactly one thing across timed and reps trainings, which was the whole reason `setTargets` is indexed by round (§1.3).

```
┌──────────────────────────────────────┐
│ ←   Circuito Braccia        00:12:41 │  ← elapsed, running
├──────────────────────────────────────┤
│ BLOCK A                              │
│ ⌄ ROUND 1                    done ✓  │  ← collapsed, tap to reopen
├──────────────────────────────────────┤
│ ⌃ ROUND 2                      2/5   │  ← current, expanded
│      PREVIOUS     KG    REPS     ✓   │
│ Curl bicipiti                        │
│ "gomiti fermi"                       │  ← Exercise.note (B5)
│      3×12        [3]   [12]     (✓)  │  ← previous ghosted, target as placeholder
│ Affondi                              │
│      —           [ ]   [10]     (✓)  │
│ Plank                                │
│      45s         [ ]   [ 12]    ( )  │
│ ...                        + Add set │
├──────────────────────────────────────┤
│ ⌄ ROUND 3                      0/5   │
├──────────────────────────────────────┤
│           [ Finish workout ]         │
└──────────────────────────────────────┘
```

The collapse/expand behaviour is **the one already in the builder** (`collapsed: Set<string>` + `LayoutAnimation.easeInEaseOut`, `BlockCard`'s caret and summary row). Reuse it rather than inventing a second idiom: finishing the last row of a round collapses it to a summary line and expands the next.

#### Rules

- **✓ is the only write.** An untouched row logs nothing; the session then honestly records fewer rounds than planned, which is what `roundsCompleted` was always for.
- **Placeholders come from `setTargets[round - 1]`** (§1.3), so a 12/10/8 step prefills differently each round. Placeholder, never value.
- **Previous (A2, D7)** = the most recent `set_logs` row for this `exerciseId`, from any training, matched on `roundIndex` where possible and falling back to that session's last row. Shown in `inkGhost`, tappable to copy into the inputs.
  - Because it may come from a different circuit, tapping the value shows its provenance — *"Circuito Gambe · 3 days ago"*. Hevy shows a bare number; a bare number that silently came from a different context is exactly the kind of quiet fiction the rest of this app refuses. One extra tap target, and the comparison stays honest.
- **`+ Add set` (D9)** appends a row for the *current round* with the next `setIndex`. It never writes back to `setTargets` — the plan is not edited by doing the workout (§1.2). The summary renders it as **extra**, not as a mismatch.
- **Elapsed clock in the header.** A reps session currently records `elapsedSeconds: 0` by construction. Once the screen is a live session rather than a sheet, the wall-clock is *measured*, not invented — so History can stop rendering `REPS` where a duration belongs, without breaking the honesty rule.
- **Keep the light canvas.** The file's reasoning holds: this screen is read at rest and at length. Do not give it the dark player palette.

#### The rest timer, and a field that comes back to life (A3, D8)

Auto-start on every ✓ — a bottom sheet with the countdown, −15 / +15, and Skip. Reuse `useCueSounds`, so the sound choices already in Settings apply here without a second configuration surface.

**Where the duration comes from is the neat part.** `Step.restAfterSeconds` and `Block.restBetweenRoundsSeconds` already exist and are already stored on reps trainings — currently written, never read, kept only so that switching a training's kind round-trips losslessly. The logger can simply *read* them:

- ✓ on an exercise row → rest for that step's `restAfterSeconds`
- ✓ on the last row of a round → rest for the block's `restBetweenRoundsSeconds`
- either value at `0` → no sheet at all

No new settings, no new fields, no invented defaults. It does mean amending the model's stated semantics — `domain/types.ts` says these are "stored but never read" on a reps training, and `domain/stepFields.ts` hides the Rest stepper there. Both need updating, and the builder must show **Rest** on reps trainings once it is live. That is a real change to a documented rule, so make it deliberately rather than by accident.

> **One risk, flagged not overridden.** Auto-rest after *every* exercise is Hevy's default because Hevy is straight sets. In a circuit you often move straight to the next movement, so the sheet may appear when it is not wanted. The escape hatch is already in the model: set that step's `restAfterSeconds` to 0 and no sheet appears. Worth watching in the first week of real use — if it turns out to be noise, the fix is a per-training default rather than a global setting.

### 3.4 Player — `app/player/[trainingId].tsx`

Per D2 the player logs nothing and its structure does not change. Two additions only:

1. **−15 / +15 during a rest cue (B8).** The side controls are ◀◀ / ▶▶ only; during a rest, relabel them or add a small row above the controls. Skipping a rest wholesale is a blunt instrument.
2. **Ongoing notification (B10, §3.9).**

Explicitly *not* doing: rep capture on gated steps, PR toasts, set types, previous values. The timed player stays a screen you glance at, not one you operate.

### 3.5 Session summary — `app/session/[id].tsx`

Keep `Done.` / `Stopped.`, the stat cards, the work-vs-rest split bar, the two-entry design (live vs history). All good, and more restrained than Hevy's.

Add, under the split bar, **for reps sessions only**:

- **What you did (B3):** the logged sets grouped by block — `Curl bicipiti — 12, 10, 8 @ 3 kg`. This is the payoff for §1 and turns the summary from a receipt into a record.
- **PR badges** inline on the rows that set one.
- **A note field.** Hevy's workout description. One line, saved to the session.
- **Share card.** Hevy's shareable is its best growth loop; a local image export needs no backend. Render the summary to a PNG via a hidden view. *Nice-to-have, not first wave.*

A timed session's summary is unchanged — it has nothing new to show.

### 3.6 Library & exercise detail — `app/(tabs)/library.tsx`, `app/exercise/[id].tsx`

**Library.** Nearly right already. Three fixes:

- Move the always-visible `BinButton` behind `⋯` (same argument as the Train tab — a destructive control on every row of a scrolling list is a mis-weighted affordance).
- Add a sort control: *Recent · A–Z · Most used*. `usage` is already computed.
- Second filter axis on `equipment` (§1.4), as a segmented row under the tag pills.

**Exercise detail (A4).** Today it is a single editable form. Give it Hevy's tabs:

| Tab | Contents |
|---|---|
| **About** | exactly what 1f is now — name, note, media, tags, kind, default weight — plus the new `equipment` picker. |
| **History** | every reps session containing this exercise, newest first, with the logged sets. Straight from `set_logs`. |
| **Records** | heaviest set · best session volume · est. 1RM (Epley, labelled *estimated*) · set records table (max weight per rep count). Line chart with 3m / 1y / all. |

Empty states carry the D2 boundary: a bodyweight exercise shows **max reps** instead of weight; an exercise that has only ever appeared in timed circuits shows *"Records come from reps trainings"* rather than zeros.

Also: the form currently saves on blur with no feedback. Add a brief "Saved" mono label near the header.

### 3.7 History tab — `app/(tabs)/history.tsx`

Keep the streak card and the minutes-per-week bars — both cleaner than Hevy's equivalents. Add:

1. **Consistency grid (A7).** A month calendar with a filled cell per training day, ~120px tall, above the bar chart. Answers "am I showing up" at a glance, which the 8-bar chart does not. Render it *empty* rather than hidden for a new user — an empty grid teaches the model; a missing one teaches nothing.
2. **Volume per tag (B2).** Horizontal bars: `Gambe 24 sets · Braccia 18 sets` for the last 7 days, from `set_logs` joined to `Exercise.tags`. This is Hevy's muscle-group chart, built on a taxonomy you already author.
3. **Filter the session list by training**, so History doubles as "how has *this* circuit gone".
4. **Real durations for reps sessions.** Once §3.3 measures elapsed time, the `REPS` placeholder in the duration column becomes a number. The fallback exists only because the number was never measured.

### 3.8 Settings — `app/(tabs)/settings.tsx`

The sound/lead-time/colour groups are more thoughtful than Hevy's. Add a **Workout** group:

- **Units — kg / lb.** `domain/weight.ts` hardcodes kg; this is a formatting-layer change, storage stays kg.
- **Bar weight** (20 kg / 15 kg / custom) — feeds the plate calculator.
- **Available plates** — the pairs you actually own.
- **1RM formula**, or "don't show estimated 1RM".
- **First day of week** — the streak and week bars assume one (`domain/dates.ts`).
- **Haptics on cue change.**

### 3.9 Background presence — my call on D5

Circuito is **not** a bare Expo Go app: `expo-dev-client` is a dependency, `eas.json` and `scripts/build-apk.sh` exist, config plugins are already in use, and the new architecture is on. Native work is therefore *possible*. But "possible" and "cheap" are different, and the two Hevy features differ sharply:

- **iOS Live Activity** needs a Widget Extension — a second Xcode target, injected by a custom config plugin, with its own build and provisioning story.
- **Home-screen widget** needs the same second target, plus a shared app group to read the database.
- **An ongoing notification** needs neither. And `app.json` already declares `FOREGROUND_SERVICE` + `WAKE_LOCK` on Android and `UIBackgroundModes: ["audio"]` on iOS — the app is *already* built to keep running with the screen off.

**Decision: do the ongoing notification, defer Live Activity and widgets.**

Phase 3 ships a persistent notification during a session showing phase, remaining time and exercise name, updating on each cue, with a tap-to-return. That is ~90% of the value of a Live Activity for a fraction of the work, and it works on both platforms from the config that is already there. Revisit the native targets only if the notification proves genuinely insufficient in daily use.

---

## 4. Cross-cutting UX notes (not from Hevy — from reviewing Circuito)

1. **Tab bar has no icons** and the labels sit at 11.5px. The comment in `(tabs)/_layout.tsx` concedes 9.5px was unreadable and bumped it. A 4-tab bar with text-only labels and a 5px dot is elegant but fails a glance test and a Dynamic Type test. Recommend: keep the dot, add a minimal 20px line icon above it.
2. **Destructive controls are too available.** Bins on training cards, library rows, and session rows. Three lists, three live delete targets. `⋯` everywhere.
3. **Empty states are thinner than the rest of the app.** History hides its entire stats block until the first session, so a new user sees one sentence.
4. **`stepMetaLine` and the meta lines are excellent** — dense, honest, no invented numbers. This is the app's voice. Every screen added above should be written in it.

---

## 5. Suggested order

| Phase | Contents | Rough shape |
|---|---|---|
| **0** | Card overflow menus (A5, B7), library sort, multi-select picker (B6), rest ±15s (B8), Settings/Workout group, tab-bar icons | Pure UI. No schema. |
| **1** | Migration: `setTargets` (§1.3) + `equipment` (§1.4) + `set_logs` (§1.1). Reps screen → logger (A1, A2, A3, B1, B5, B9) | The big one. Everything else waits on it. |
| **2** | Session summary breakdown (B3), exercise detail tabs (A4), PR toast (B4) | Spends phase 1. |
| **3** | History: calendar grid (A7), volume per tag (B2), list filters. Ongoing notification (§3.9) | Charts + one native touch. |
| **4** | Train tab pills/search (A6), monthly card (B11), share card | Polish. |
| **later** | Measurements, accounts/sync (existing phase 8), Live Activity + widget if warranted | |

Phase 1 is the only one with a migration. Split the migration from the screen rewrite — ship the schema and keep the old reps sheet for one build, so a bad migration is not entangled with a new screen.

---

## 6. Resolved (D9)

**`+ Add set` extends the log, never the plan.** An extra row is written with the next `setIndex` for the current round and no matching `setTargets` entry. That is legal by §1.2 — the log observes, it does not write back — and the session summary renders it as *extra* rather than surfacing it as a plan/log mismatch. If you find yourself adding the same extra set every time, that is a signal to go and edit the training, and the app should not do it for you behind your back.

**RPE: ship the column, wire nothing.** `set_logs.rpe` exists from the first migration, so adding the input later costs no schema change. No input in phase 1, for one concrete reason: the logger row is already `PREVIOUS · KG · REPS · ✓` on a phone width, and a fifth field would be the thing that breaks it. If RPE turns out to be wanted, it belongs behind a tap on the set row — a small sheet, the way Hevy does set types — not as another column.

Nothing else is blocking. Phase 1 is fully specified.

---

## 7. Review pass — corrections and edge cases (2026-08-17)

A second read of the codebase against the plan. Fifteen findings; six are things that would have shipped as bugs.

### 7.1 Corrections to the plan as written

**R1 — `−15 / +15` silently corrupts the session summary.** `useRunner.goTo` banks time as `Math.min(elapsed, current.seconds)`, and `totalRemaining` sums `cue.seconds` off the queue. Extending a rest past its planned length therefore banks *less* rest than was taken, and the "left" readout keeps quoting the original total. The fix is a per-cue `adjustment: number` in `RunnerState`, reset on every `goTo`, threaded through four places: the tick's `left`, `remaining`, `progress`, and the banking clamp. Not optional — without it, B8 makes 1k lie.
> Related decision: **trimming a rest is not skipping one.** `skippedRests` stays owned by the ▶▶ button alone, or the summary's "2 rests skipped" starts counting deliberate adjustments.

**R2 — multi-select in the picker will silently drop all but the last pick.** `addExercise` closes over `draft` and calls `patchBlock`, which rebuilds from that same closed-over `draft`. Calling it in a loop applies each patch to the *stale* draft, so N picks land as 1. B6 needs a batch `addExercises(blockId, Exercise[])` that maps once — not a loop over the existing function.

**R3 — the overflow menu cannot be a `ConfirmDialog`.** Its own header says so: "no arbitrary button lists… anything more complex belongs in a sheet". It needs a new `ActionSheet` primitive. And because a destructive item inside it must still confirm, two `Modal`s would end up stacked — flaky on iOS. Sequence them instead: the sheet closes, *then* the dialog opens.

**R4 — duplicating a training must regenerate every id.** `saveTraining` inserts blocks and steps by primary key; reusing the source's `bl_` / `st_` ids would violate the PK on the second insert. Duplicate needs fresh `newBlockId()` / `newStepId()` throughout, a new `createdAt`, and a name suffix.

**R5 — the History `REPS` fallback must survive the change.** §3.7.4 says reps sessions get real durations once the logger measures them. True for new rows — but every *existing* reps session has `elapsedSeconds: 0` on disk, and would start rendering `00:00`. Keep the fallback conditional on the value, not the kind: `kind === 'reps' && elapsedSeconds === 0 ? 'REPS' : formatDuration(…)`.

**R6 — `setTargets` has two knock-ons §1.3 missed.** `Cue.targetReps` in `queue.ts` and the player's reps chip both read the scalar. Both must read `setTargets[round - 1] ?? setTargets[0]` or the gated cue shows the wrong round's target.

**R7 — lowering `Block.repeat` invalidates a `setTargets` array the user just authored.** Set 12/10/8 at `repeat: 3`, then tap the repeat stepper down to 2, and the draft is now unsaveable by §1.3's own rule — with the error surfacing on Save, far from the tap that caused it. The builder owns the draft, so it should truncate or pad on the spot; validation stays as a backstop, not as the user-facing mechanism.

### 7.2 Edge cases for the phase-1 logger

**R8 — deleting a session must delete its logs.** `deleteSession` is a hard `DELETE` (sessions have no `deletedAt`). Without `ON DELETE CASCADE` on `set_logs.sessionId`, every deleted workout leaves orphan rows that skew records and charts permanently — and invisibly, since no screen lists them.

**R9 — `set_logs` needs a denormalised `exerciseName`.** Same argument that already put `trainingName` on `Session`. `deleteExercise` is blocked only while a *training* uses the exercise; once it is removed from every training it can be deleted, and the History tab's rows lose their label. One column now, or unnameable history later.

**R10 — define "round completed" before writing `roundsCompleted`.** A round counts as completed when **every** step in it has at least one log. The loose reading (any log) makes one tick equal a whole round and quietly inflates every stat downstream of it.

**R11 — finishing with nothing logged should not write a session.** Prompt to discard instead. Otherwise the streak, the month count and the calendar all count a workout that recorded nothing — the same class of dishonesty as `00:00`.

**R12 — guard the double-tick.** A fast double-tap on ✓ writes two rows. Either the `saving.current` ref idiom already used in the player and reps screen, applied per row, or a unique index on `(sessionId, stepId, roundIndex, setIndex)` and an upsert. Prefer the index — it survives a code path nobody thought of.

**R13 — the logger's elapsed clock must be wall-clock derived.** `useRunner`'s opening comment is the law here: never decrement a counter on an interval, because it stalls when the phone locks in a pocket. The logger is *more* exposed to this than the player, not less.

### 7.3 Two existing issues worth fixing while nearby

**R14 — the Library tab runs an N+1 on every focus.** `library.tsx` calls `countTrainingsUsing(e.id)` once per exercise, each a separate `SELECT`. With 40 exercises that is 41 queries every time the tab gains focus. One `GROUP BY` returns the whole map. This also has to be fixed *before* the "Most used" sort (§3.6), or the list re-sorts under the user's finger when the counts resolve.

**R15 — the tab bar cannot take a third stacked element.** §4.1 asks for icons, but icon + 5px dot + label in a 64px bar (minus safe-area inset) will not sit comfortably. Better: keep two elements and let the **icon itself** carry the active state — filled when focused, outlined when not — retiring the dot rather than stacking above it. Same information, same height, one less thing in the column.

---

*Sources: [hevyapp.com/features](https://www.hevyapp.com/features/) · [Hevy tutorial](https://www.hevyapp.com/hevy-tutorial/) · [2025 features guide](https://help.hevyapp.com/hc/en-us/articles/33106320824727-Everything-You-Need-to-Know-About-the-Hevy-App-2025-Features-Guide) · [set types](https://www.hevyapp.com/features/workout-set-types/) · [exercise performance](https://www.hevyapp.com/features/exercise-performance/)*
