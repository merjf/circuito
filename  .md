# What's left — Circuito, after the exercise-type rewrite

**Status as of 2026-08-23.** `npx tsc --noEmit` clean, `npx jest` 295/295.

This picks up where `PLAN_hevy_integration.md` stops. That document is still the
reference for *why* things are shaped the way they are; this one is only the
list of what has not been done, in the order it is worth doing.

One thing to be clear about up front, because it colours everything below:
**none of this has been run on a phone.** The type rewrite touched the data
model, the migration, the queue, and every screen. It compiles and its tests
pass, and neither of those things has ever caught a layout that overflows a
320pt width or a stepper you cannot hit with a thumb.

---

## 1. Run it — before anything else on this list

`npx expo start` (dev client build, not Expo Go — `expo-sqlite` and
`expo-dev-client` rule that out), then walk the paths that changed. In rough
order of how much is riding on each:

**The migration, on your real database.** v6 backfills `Exercise.type` from the
old `kind`, rebuilds the `equipment` column to widen its CHECK, drops four
columns and adds two. It is tested against fixtures and against a half-applied
v3, and it has never touched a database with your actual trainings in it. Copy
the app's SQLite file off the device first if there is anything in it you would
miss. What to check afterwards:

- Every exercise has a sensible type. The backfill maps timed → `duration`,
  reps with a default weight → `weightReps`, reps without → `bodyweightReps`.
  Anything that was a *weighted* timed exercise — which is most of the seed
  circuit — lands on `duration` and needs one tap to become `durationWeight`.
  That is expected, not a bug, but it is a chore proportional to your library.
- Old `equipment` values survive. `bodyweight` and `band` no longer exist as
  values; `asEquipment` narrows anything unrecognised to *unstated*, so those
  rows come back blank rather than wrong.
- History still reads. Sessions written before today have no per-set data and
  fall back to the REPS placeholder.

**A mixed circuit.** The thing the rewrite exists for: build one block with a
weight-and-reps exercise, a duration exercise, and a duration-and-weight
exercise. Then run it in the player and check that the rep-counted step waits
for DONE while the other two count down, and that each shows its own units.

**The player as the way in.** Start from a card, start from the detail screen.
Both go to the player now. Check the first frame of the first exercise
specifically — the load race there was fixed by holding the screen until both
the training and the library have landed, and the failure mode it replaced
(every cue silently tap-gated for a few frames) was invisible except in that
first second.

**The logger's set clock.** Start a timed exercise's clock with ▶, let it reach
the target, confirm the set ticks itself with the right duration. Then start
another and stop it early with ■ — it should write what the clock actually read
into the field and *not* tick the set. Then type in another row while a clock
runs, which is the case that used to starve the timer.

**The two picker pages**, and the exercise form rows that open them.

---

## 2. Blocking on you: the equipment art

`assets/equipment/*.png` are ten flat grey placeholders I generated. I cannot
download images — the web tools return page text, and fetching binaries by
other means is not something I am able to do — so this one needs you.

Overwrite them in place, keeping the filenames:

```
none.png   barbell.png   dumbbell.png   kettlebell.png   machine.png
plate.png  resistanceBand.png  suspensionBand.png  cord.png  other.png
```

Transparent PNG, square, 256×256 or larger. Nothing in the code changes —
`src/domain/equipmentArt.ts` maps by filename and says so in its header. The
`exerciseType` test already asserts every value has art, so a missing file
fails a test rather than shipping a blank square.

---

## 3. Verify the second round of review fixes

A reviewer went over the rewrite and found eight defects. The first pass of
fixes was re-reviewed and confirmed. The **second** pass was not — it is
compiler-clean and test-green, but nobody has read it back. Those four:

| Fix | File | What to look at |
|---|---|---|
| Distance float drift | `src/domain/types.ts` — `withUniformDistance` | Rounds to 2dp at the source and treats `< 0.005` as clearing. A 0.05 stepper does not land on zero — up-then-down gives `1.39e-17`, which is not zero, so it persisted as a prescription and rendered as "0 km". Check a legitimately small target (10 metres = 0.01) still survives. |
| Timer starved by typing | `app/reps/[trainingId].tsx` — `draftsRef` | `drafts` changed on every keystroke and was in `endTimer`'s deps, so the 250ms interval was rebuilt per character. Now read through a ref. Check it cannot write a stale draft. |
| Set-log id divergence | `app/reps/[trainingId].tsx` — `tickSet` / `untickSet` | `logsRef` is now written synchronously before the await, so a double-tap's second call sees the first call's id. Check untick-then-retick. |
| Home tab cold start | `app/(tabs)/index.tsx` | `types` is `ExerciseTypes \| null`, because an empty map and a not-yet-loaded map were the same value and meant opposite things — every timed circuit flashed REPS at launch. |

---

## 4. Known, accepted, documented — not bugs to fix now

**`useRunner` fires callbacks from inside a `setState` updater.**
`src/runner/useRunner.ts`. React is entitled to re-invoke an updater, so this
is correct by circumstance rather than by design: nothing enables StrictMode,
and `onFinish` is idempotent behind the player's own `saving` ref. `onSound` is
not guarded — turn StrictMode on and every bell fires twice, a symptom that
reads as an audio bug and gets hunted in the wrong file. There is a comment at
the site naming the constraint and pointing at the shape it should become
(compute the transition in the updater, fire from an effect keyed on
`state.index` / `state.finished`). Worth doing the next time there is a reason
to be in that file. Not worth doing blind.

**RPE has a column and no input.** Deliberate, from `PLAN_hevy_integration.md`
§6: the logger row is already four fields wide on a phone and a fifth would be
the one that breaks it. If it turns out to be wanted, it belongs behind a tap
on the set row, the way set types already are — not as another column.

**Steps keep values their exercise no longer uses.** A step that was
`weightReps` keeps its `weightKg` after the exercise becomes bodyweight. This
is on purpose — changing an exercise's type back and forth is lossless — and
it is why every renderer asks `fieldsFor(type)` before reading a field. If you
add a new surface that shows a weight, a rep count, a duration or a distance,
gate it the same way. Three of the eight review findings were exactly this
mistake.

---

## 5. Not built from the original plan

Three items from `PLAN_hevy_integration.md` never landed, each for a reason.

**Plate calculator (B9).** Never started. Not blocked by anything — it needs
`equipment === 'barbell'`, which now exists properly, and a bar weight setting.
This is the cheapest remaining feature and the most self-contained.

**Ongoing notification (§3.9, B10).** Needs `expo-notifications`, which is not
in `package.json`. I cannot add it: the machine this session reaches your files
through has no network, so `npm install` fails. Install it yourself and this
becomes buildable — it is the one thing that would make the player usable with
the screen off, which for a phone-on-the-floor app is not a small gap.

**Share card (phase 4).** Needs `react-native-view-shot`. Same blocker, same
fix.

Everything else from phases 0–4 is in: overflow menus, library sort,
multi-select picker, rest ±15s, the logger and its set log, session summary
breakdown, exercise detail tabs, PR toast, calendar grid, volume per tag, Train
tab pills and search, monthly card.

---

## 6. Housekeeping

**`.scratch/` — delete it.** The mount I write to your machine through cannot
`rm`, so anything I removed is parked in `.scratch/deleted/` and the transfer
bundles are in `.scratch/*.tgz`. The directory is gitignored. Nothing in the
app references it. Files sitting there:

```
.scratch/deleted/convert.ts        .scratch/deleted/ModeSwitch.tsx
.scratch/deleted/stepFields.ts     .scratch/deleted/stepFields.test.ts
.scratch/deleted/reps.test.ts      .scratch/deleted/.rmtest
.scratch/xfer*.tgz
```

**`.expo/types/router.d.ts` is hand-patched.** Three lines, adding
`/pick/equipment` and `/pick/exercise-type` to the typed-route union. It is a
generated file and the dev server rewrites it on the next `expo start`, at
which point the patch is redundant and harmless. Mentioned only so it is not a
surprise in a diff.

**Nothing is committed to git.** The repo has no `.git` reachable from where I
work, so every change above is on disk and uncommitted. Worth a commit before
anything else touches it.

---

## 7. Later

Unchanged from `PLAN_hevy_integration.md` §5 and §2.3: measurements and progress
photos, accounts and sync, Live Activity and a home-screen widget, Apple Watch.
All of them are separate domains rather than improvements to existing screens,
and the rejections in §2.3 — social, leaderboards, coaching, AI generation,
Strava, supersets, starter templates — should stay rejected for the reasons
given there. The one worth re-reading before anyone reopens it is supersets:
Circuito's blocks already express that idea, and importing Hevy's version would
create two ways to say one thing.
