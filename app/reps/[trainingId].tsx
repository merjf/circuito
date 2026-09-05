/**
 * The logger — the one place a workout is performed and recorded.
 *
 * It used to be a read-only reference sheet whose Finish button wrote a
 * session of all zeros, because — in the old file's own words — "nothing here
 * observes how much you actually did". That was the single place Circuito was
 * strictly worse than the app this was modelled on, and closing it is the
 * whole of `PLAN_hevy_integration.md` phase 1.
 *
 * Since the type rewrite it is no longer the *reps* logger. There is one
 * screen for every workout, because there is no longer a kind of training for
 * it to be the other half of: a block can hold a bench press, a plank and a
 * farmer's walk at once, and each row asks for exactly the fields its own
 * exercise is measured in (`fieldsFor`). A timed row gets a clock — see
 * `setTimer` below — and everything else gets a check.
 *
 * ── ROUND-MAJOR, NOT EXERCISE-MAJOR ────────────────────────────────────────
 * Hevy's logging screen is one card per exercise with its sets stacked inside.
 * That is right for straight sets and WRONG here: a Circuito block is
 * performed as a circuit — every exercise once, then repeat (decision D6). So
 * this screen is a list of rounds, and a row per exercise inside each. Borrow
 * the row anatomy, not the page structure.
 *
 * It is also why `Step.setTargets` is indexed by round: `Block.repeat` means
 * exactly one thing everywhere.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────────
 * The plan prescribes, the log observes, neither writes to the other. A step's
 * target prefills an input as a PLACEHOLDER, never as a value: an untouched
 * row logs nothing, and the session then honestly records fewer rounds than
 * were planned. That is what `roundsCompleted` was always for.
 *
 * ── WHY THE SESSION ROW EXISTS FROM THE START ──────────────────────────────
 * `set_logs.sessionId` points at `sessions.id`, so the parent has to be there
 * before the first set can be written. That ordering also buys crash safety:
 * an hour of logged sets survives the app being killed. Leaving without
 * finishing offers the same discard-or-keep choice the player does.
 *
 * Light canvas, not the player's dark palette. The old file's reasoning holds
 * and is worth restating: this screen is read at rest and at length, not
 * glanced at mid-effort.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutAnimation,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { ActionSheet } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RestSheet } from '@/components/RestSheet';
import { Toast } from '@/components/Toast';
import { AnimatedPressable, Card, MonoLabel, PrimaryButton, ScreenHeader } from '@/components/ui';
import {
  deleteSession,
  deleteSetLog,
  getTraining,
  insertSession,
  listExercises,
  previousSetLogs,
  setLogsForExercises,
  updateSession,
  upsertSetLog,
} from '@/db/repo';
import { recordsBrokenBy } from '@/domain/records';
import { formatElapsed, totalRounds, totalSteps } from '@/domain/duration';
import { fieldsFor, type ExerciseType, type TypeFields } from '@/domain/exerciseType';
import { newSessionId, newSetLogId } from '@/domain/id';
import {
  formatLog,
  formatSetClock,
  hasAnyLog,
  logsForSlot,
  previousFor,
  roundsCompletedFrom,
  rowsNeeded,
} from '@/domain/logging';
import { exerciseTypesOf, type ExerciseTypes } from '@/domain/queue';
import { trimNumber } from '@/runner/cueText';
import {
  distanceAt,
  repsAt,
  secondsAt,
  weightForRound,
  type Exercise,
  type SetLog,
  type SetType,
  type Step,
  type Training,
} from '@/domain/types';
import { useConfirmedBack } from '@/hooks/useConfirmedBack';
import { useSettings } from '@/hooks/useSettings';
import { useCueSounds } from '@/runner/useCueSounds';
import { useRestTimer } from '@/runner/useRestTimer';
import { color, motion, radius, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

/** One editable row: a step, in a round, at a set index. */
const slotKey = (stepId: string, round: number, setIndex: number) =>
  `${stepId}:${round}:${setIndex}`;
const roundKey = (blockId: string, round: number) => `${blockId}:${round}`;

/**
 * What one row holds while it is being typed into.
 *
 * All four fields always exist, and rows simply do not render the ones their
 * exercise does not use. A per-type draft shape would mean four of these and a
 * cast at every read, to save nothing: an unused field is an empty string,
 * and an empty string parses to `undefined` and is never written.
 */
interface Draft {
  kg: string;
  reps: string;
  /** `m:ss`, or a bare number of seconds. */
  time: string;
  km: string;
}

const EMPTY_DRAFT: Draft = { kg: '', reps: '', time: '', km: '' };

/** A positive integer, or `undefined` — which is what "left blank" writes. */
function parseCount(raw: string): number | undefined {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** A positive decimal, comma or point. Italian keyboards give a comma. */
function parseDecimal(raw: string): number | undefined {
  const n = Number.parseFloat(raw.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Seconds from either `90` or `1:30` — both are things people type, and
 * refusing one of them mid-workout is a bad way to find out which.
 *
 * Colon-separated parts fold left as sexagesimal, so `1:02:30` works too
 * without a third branch.
 */
function parseClock(raw: string): number | undefined {
  const text = raw.trim();
  if (text.length === 0) return undefined;
  const parts = text.split(':');
  if (parts.length === 1) return parseCount(parts[0]!);

  let total = 0;
  for (const part of parts) {
    const n = Number.parseInt(part.trim(), 10);
    if (!Number.isFinite(n) || n < 0) return undefined;
    total = total * 60 + n;
  }
  return total > 0 ? total : undefined;
}

/**
 * A set being timed right now.
 *
 * One at a time, screen-wide: you are performing one exercise, and two clocks
 * running at once would mean at least one of them is measuring nothing. Held
 * as a wall-clock start rather than a countdown for the reason `useRestTimer`
 * spells out — an interval stalls the moment the phone sleeps, and a plank is
 * exactly when a phone gets put down.
 */
interface SetTimer {
  slot: string;
  step: Step;
  blockId: string;
  round: number;
  setIndex: number;
  /** What the plan asks for. The clock counts towards it and stops there. */
  target: number;
  startedAt: number;
}

/** The single letter in the SET column. Normal sets show their number. */
const SET_TYPE_MARK: Record<SetType, string | null> = {
  normal: null,
  warmup: 'W',
  drop: 'D',
  failure: 'F',
};

const SET_TYPE_LABELS: Record<SetType, string> = {
  normal: 'Normal set',
  warmup: 'Warm-up set',
  drop: 'Drop set',
  failure: 'Set to failure',
};

export default function RepsLoggerScreen() {
  const { trainingId } = useLocalSearchParams<{ trainingId: string }>();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const playSound = useCueSounds();
  const rest = useRestTimer(settings, playSound);
  /**
   * The timer's ACTIONS, pulled out separately.
   *
   * `useRestTimer` returns a fresh object every render — it has to, because
   * `remaining` is recomputed from the wall clock each time. Depending on that
   * object in a `useCallback` makes the callback new every render, and this
   * screen re-renders once a second from its own tick and again on every
   * keystroke. That churn propagated all the way to the set-clock's interval,
   * which was then torn down and rebuilt faster than it could fire: typing
   * while a set was being timed could starve the 250ms check and the set would
   * never auto-tick.
   *
   * These three are stable `useCallback`s, so depending on them instead is
   * both correct and still.
   */
  const { start: startRest, stop: stopRest } = rest;

  const [training, setTraining] = useState<Training | null>(null);
  const [exercises, setExercises] = useState<Map<string, Exercise>>(new Map());
  const [logs, setLogs] = useState<SetLog[]>([]);
  const [history, setHistory] = useState<Map<string, SetLog[]>>(new Map());
  /** Rows added beyond the one the plan asks for, keyed by step and round. */
  const [extraSets, setExtraSets] = useState<Map<string, number>>(new Map());
  /** Typed-but-not-yet-ticked input, keyed by slot. */
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  /** The one running set clock, or null. See `SetTimer`. */
  const [setTimer, setSetTimer] = useState<SetTimer | null>(null);
  const [openRound, setOpenRound] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [nothingLogged, setNothingLogged] = useState(false);
  const [typeFor, setTypeFor] = useState<{ log: SetLog } | null>(null);
  const [record, setRecord] = useState<{ title: string; message: string } | null>(null);
  /**
   * Everything logged for these exercises BEFORE today, by exercise.
   *
   * Loaded once and never refreshed mid-session, which is deliberate: the
   * comparison is against your history, not against the set you did ninety
   * seconds ago. Refreshing would make the second set of a first-ever workout
   * fire a PR, and "personal best" would come to mean "better than the last
   * one", which is news nobody needs three times a round.
   */
  const [priorLogs, setPriorLogs] = useState<Map<string, SetLog[]>>(new Map());

  /**
   * What each exercise is measured in. Read once with the library and passed
   * down, because every row needs it and re-deriving it per row would be the
   * same map rebuilt fifteen times a render.
   */
  const types: ExerciseTypes = useMemo(() => exerciseTypesOf(exercises.values()), [exercises]);

  const sessionId = useRef(newSessionId());
  const startedAt = useRef(new Date());
  const finishing = useRef(false);
  /** The slot whose clock is already being ended. See `endTimer`. */
  const endingRef = useRef<string | null>(null);
  /**
   * The logs, readable from a callback without putting them in its deps.
   *
   * `tickSet` needs to know whether this slot already has a row, but it is
   * also (transitively) what the set clock's interval hangs off — so making it
   * change on every tick would rebuild that interval on every tick.
   */
  const logsRef = useRef<SetLog[]>([]);
  /**
   * The drafts, for the same reason as `logsRef` and one the 1Hz tick did not
   * cover: `drafts` changes on every KEYSTROKE, in any input on the screen, and
   * every row except the one being timed stays editable while a set clock runs.
   * With `drafts` in `endTimer`'s deps the 250ms interval was rebuilt on each
   * character, so typing faster than four a second meant it never survived long
   * enough to fire and the set never auto-ticked at its target.
   */
  const draftsRef = useRef<Map<string, Draft>>(new Map());
  const [, tick] = useState(0);

  // ── Load, and open the session row ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [loaded, list] = await Promise.all([getTraining(trainingId), listExercises()]);
      if (cancelled || !loaded) return;

      setTraining(loaded);
      setExercises(new Map(list.map((e) => [e.id, e])));
      setOpenRound(roundKey(loaded.blocks[0]?.id ?? '', 1));

      // The parent row for every log this screen writes. Its numbers are
      // placeholders until Finish updates them — what matters now is that it
      // exists, so a set ticked in the first minute has somewhere to go.
      await insertSession({
        id: sessionId.current,
        trainingId: loaded.id,
        trainingName: loaded.name,
        startedAt: startedAt.current.toISOString(),
        endedAt: startedAt.current.toISOString(),
        elapsedSeconds: 0,
        workSeconds: 0,
        restSeconds: 0,
        roundsCompleted: 0,
        roundsPlanned: totalRounds(loaded),
        skippedRests: 0,
        completed: false,
      });

      const ids = [
        ...new Set(loaded.blocks.flatMap((b) => b.steps.map((s) => s.exerciseId))),
      ];
      // Two queries for the whole screen. Fifteen rows asking one at a time
      // for a column of grey hint text is not a trade worth making, and the
      // record check has the same shape.
      const [previous, prior] = await Promise.all([
        previousSetLogs(ids),
        setLogsForExercises(ids, sessionId.current),
      ]);
      if (cancelled) return;
      setHistory(previous);
      setPriorLogs(prior);
    })();
    return () => {
      cancelled = true;
    };
  }, [trainingId]);

  // The running clock, recomputed from the wall clock rather than counted
  // down. `useRunner`'s opening comment is the law here, and this screen is
  // MORE exposed to a backgrounded phone than the player is, not less.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const elapsedSeconds = (Date.now() - startedAt.current.getTime()) / 1000;

  // `_layout.tsx` disables the iOS swipe-back gesture on this screen for the
  // same reason the player's does — leaving mid-session should always go
  // through the discard/save-partial prompt below. That setting has no
  // effect on Android's hardware/gesture back button, which fires through a
  // separate OS-level event and, unguarded, popped the screen directly with
  // no prompt and no guarantee `finalise`/`discard` ever ran. Off once
  // `finishing` is already true — a second back press mid-navigation (e.g.
  // from the dialog's own buttons) should not fight the exit.
  //
  // `useCallback` with no deps: `setLeaving` is a stable setState identity,
  // and this screen re-renders once a second off its own clock — a fresh
  // closure every render would tear down and re-add the native
  // `BackHandler` listener at the same 1Hz.
  const onHardwareBack = useCallback(() => setLeaving(true), []);
  useConfirmedBack(training !== null && !finishing.current, onHardwareBack);

  // ── Writing a set ────────────────────────────────────────────────────────

  const restSecondsFor = useCallback(
    (step: Step, blockId: string, round: number): number => {
      const blockIndex = training?.blocks.findIndex((b) => b.id === blockId) ?? -1;
      const block = blockIndex >= 0 ? training!.blocks[blockIndex] : undefined;
      if (!block) return 0;
      const isLastOfRound = block.steps[block.steps.length - 1]?.id === step.id;
      // The plan's own rests, read back. The last step of a round runs into the
      // round rest and every other step into its own — the same rule the queue
      // plays, so a logged session rests where a hands-free one would (D8). No
      // new setting, no invented default.
      if (!isLastOfRound) return step.restAfterSeconds;
      if (round < Math.max(1, block.repeat)) return block.restBetweenRoundsSeconds;
      const hasFollowingBlock = training!.blocks
        .slice(blockIndex + 1)
        .some((nextBlock) => nextBlock.steps.length > 0);
      return hasFollowingBlock ? (block.restAfterBlockSeconds ?? 0) : 0;
    },
    [training],
  );

  const tickSet = useCallback(
    async (args: {
      step: Step;
      blockId: string;
      round: number;
      setIndex: number;
      draft: Draft;
      type: SetType;
    }) => {
      const exercise = exercises.get(args.step.exerciseId);
      // Only the fields this exercise is measured in. A weight parsed off a
      // draft belonging to a plank would be a number nobody entered, and it
      // would go on to break a record.
      const fields = fieldsFor(types.get(args.step.exerciseId) ?? 'weightReps');
      const weightKg = fields.weight ? parseDecimal(args.draft.kg) : undefined;

      /**
       * The id of the row this slot ALREADY has, if it has one.
       *
       * `upsertSetLog` writes ON CONFLICT over
       * (sessionId, stepId, roundIndex, setIndex) and deliberately does not
       * touch the id, so minting a fresh one for a second tick of the same
       * slot would leave the database holding the first id and this screen
       * holding the second. Unticking would then delete a row that is not the
       * one behind the checkbox, and orphan the one that is — invisible on
       * every screen, and still counted in every record derived from it.
       *
       * Reusing the id makes the second tick what it looks like: an edit.
       */
      const existing = logsRef.current.find(
        (l) =>
          l.stepId === args.step.id &&
          l.roundIndex === args.round &&
          l.setIndex === args.setIndex,
      );

      const log: SetLog = {
        id: existing?.id ?? newSetLogId(),
        sessionId: sessionId.current,
        exerciseId: args.step.exerciseId,
        // Denormalised, like `Session.trainingName`: this exercise can be
        // deleted once no training uses it, and history that loses its labels
        // is history nobody can read.
        exerciseName: exercise?.name ?? 'Unknown exercise',
        blockId: args.blockId,
        stepId: args.step.id,
        roundIndex: args.round,
        setIndex: args.setIndex,
        reps: fields.reps ? parseCount(args.draft.reps) : undefined,
        weightKg,
        // Per ROUND, like the queue and the player: a step can override its
        // weight for round three, and reading the base would record a set of
        // 3 kg as a set of 5 kg because that is what round one asked for.
        weightCount:
          weightKg != null
            ? (weightForRound(args.step, args.round).weightCount ?? 1)
            : undefined,
        seconds: fields.time ? parseClock(args.draft.time) : undefined,
        distanceKm: fields.distance ? parseDecimal(args.draft.km) : undefined,
        type: args.type,
        completedAt: new Date().toISOString(),
      };

      const withoutSlot = (list: SetLog[]) =>
        list.filter(
          (l) =>
            !(
              l.stepId === log.stepId &&
              l.roundIndex === log.roundIndex &&
              l.setIndex === log.setIndex
            ),
        );

      // Published to the ref BEFORE the await, not by the effect that mirrors
      // `logs` after a render. The effect is commit-time, and the window this
      // is guarding is two `tickSet` calls before the first one renders at all
      // — a fast double-tap, or the set clock reaching its target as a thumb
      // lands. Both would read a ref that did not yet know about the first
      // call, both would mint an id, and only the first would reach the row:
      // `upsertSetLog` conflicts on the slot and leaves `id` alone. State would
      // then hold an id no row has, unticking would delete nothing, and the set
      // would stay in the database — invisible here and counted everywhere
      // else. One synchronous line closes it.
      logsRef.current = [...withoutSlot(logsRef.current), log];

      await upsertSetLog(log);
      // Replace by slot rather than append, so a re-tick is one entry here
      // exactly as it is one row there.
      setLogs((prev) => [...withoutSlot(prev), log]);

      // Checked against history only, never against this session — see the
      // note on `priorLogs`. Several records can fall to one set, so they are
      // announced as one notice rather than three in a row.
      const broken = recordsBrokenBy(log, priorLogs.get(args.step.exerciseId) ?? []);
      if (broken.length > 0) {
        setRecord({
          title: broken.length === 1 ? broken[0]!.label : `${broken.length} records`,
          message: `${log.exerciseName} · ${broken.map((b) => b.label).join(', ')}`,
        });
      }

      // Drop sets are chained with no rest between them — that behaviour is
      // the reason the type is worth having at all, over and above the label.
      if (args.type !== 'drop') startRest(restSecondsFor(args.step, args.blockId, args.round));
    },
    [exercises, priorLogs, startRest, restSecondsFor, types],
  );

  const untickSet = useCallback(async (log: SetLog) => {
    // The ref first, for the same reason `tickSet` writes it first: an untick
    // followed immediately by a re-tick must not find the removed log still
    // sitting there and reuse its id.
    logsRef.current = logsRef.current.filter((l) => l.id !== log.id);
    await deleteSetLog(log.id);
    setLogs((prev) => prev.filter((l) => l.id !== log.id));
  }, []);

  // ── Timing a set ─────────────────────────────────────────────────────────

  const startTimer = useCallback(
    (args: { step: Step; blockId: string; round: number; setIndex: number; target: number }) => {
      // A rest and a work interval must not run at once: the rest sheet would
      // count down over a set that is already under way, and its end sound
      // would land in the middle of it.
      stopRest();
      endingRef.current = null;
      setSetTimer({
        slot: slotKey(args.step.id, args.round, args.setIndex),
        step: args.step,
        blockId: args.blockId,
        round: args.round,
        setIndex: args.setIndex,
        target: args.target,
        startedAt: Date.now(),
      });
    },
    [stopRest],
  );

  /**
   * End the running clock.
   *
   * Two ways out, and they mean different things. Running to the target ticks
   * the set at the prescribed time — that is what "I held the plank for 45
   * seconds" is. Stopping early does NOT tick it: it writes what the clock
   * actually read into the draft and leaves the row for you to confirm, so a
   * plank abandoned at 30 seconds is never recorded as 45.
   */
  const endTimer = useCallback(
    (reason: 'reached' | 'stopped') => {
      const timer = setTimer;
      // The interval below fires every 250ms and `setSetTimer(null)` does not
      // take effect until the next render, so without this the target can be
      // passed twice and the set ticked twice. A ref, not state, because the
      // guard has to hold WITHIN a render, which is exactly what state cannot
      // promise.
      if (!timer || endingRef.current === timer.slot) return;
      endingRef.current = timer.slot;

      const elapsed = Math.round((Date.now() - timer.startedAt) / 1000);
      const seconds = reason === 'reached' ? timer.target : Math.min(elapsed, timer.target);
      const draft = {
        ...(draftsRef.current.get(timer.slot) ?? EMPTY_DRAFT),
        time: formatSetClock(seconds),
      };

      setDrafts((prev) => new Map(prev).set(timer.slot, draft));
      setSetTimer(null);

      if (reason === 'reached') {
        void tickSet({
          step: timer.step,
          blockId: timer.blockId,
          round: timer.round,
          setIndex: timer.setIndex,
          draft,
          type: 'normal',
        });
      }
    },
    [setTimer, tickSet],
  );

  // Wall-clock, checked four times a second — never a decrementing counter.
  // The check is a comparison against a fixed end moment, so a set timed
  // through a locked screen is simply over when the screen comes back.
  useEffect(() => {
    if (!setTimer) return;
    const id = setInterval(() => {
      if (Date.now() - setTimer.startedAt >= setTimer.target * 1000) endTimer('reached');
    }, 250);
    return () => clearInterval(id);
  }, [setTimer, endTimer]);

  const setLogType = useCallback(async (log: SetLog, type: SetType) => {
    const next = { ...log, type };
    await upsertSetLog(next);
    setLogs((prev) => prev.map((l) => (l.id === log.id ? next : l)));
  }, []);

  // ── Finishing ────────────────────────────────────────────────────────────

  const finalise = useCallback(
    async (completed: boolean) => {
      if (!training || finishing.current) return;
      finishing.current = true;
      stopRest();
      setSetTimer(null);

      const rounds = roundsCompletedFrom(training, logs);
      const planned = totalRounds(training);
      await updateSession({
        id: sessionId.current,
        trainingId: training.id,
        trainingName: training.name,
        startedAt: startedAt.current.toISOString(),
        endedAt: new Date().toISOString(),
        // Measured, not invented. A logged session used to record zero here
        // by construction, which is why History still has to fall back to the
        // REPS placeholder for rows written before today.
        elapsedSeconds: Math.round(elapsedSeconds),
        workSeconds: 0,
        restSeconds: 0,
        roundsCompleted: rounds,
        roundsPlanned: planned,
        skippedRests: 0,
        completed: completed && rounds >= planned,
      });
      router.replace({ pathname: '/session/[id]', params: { id: sessionId.current } });
    },
    [training, logs, elapsedSeconds, stopRest],
  );

  /** Throw the whole session away, logs included (the DELETE cascades). */
  const discard = useCallback(async () => {
    finishing.current = true;
    stopRest();
    setSetTimer(null);
    await deleteSession(sessionId.current);
    router.back();
  }, [stopRest]);

  const onFinish = () => {
    // A session that recorded nothing should not become a workout. Otherwise
    // the streak, the month count and the calendar all count an hour that
    // holds no information — the same species of dishonesty as rendering
    // `00:00` for something that was never timed.
    if (!hasAnyLog(logs)) {
      setNothingLogged(true);
      return;
    }
    void finalise(true);
  };

  if (!training) return <View style={styles.screen} />;

  const steps = totalSteps(training);
  const rounds = totalRounds(training);

  return (
    <View style={styles.screen}>
      <ScreenHeader
        onBack={() => setLeaving(true)}
        action={
          <Text style={[t.monoValueLarge, { color: color.ink, fontSize: 15 }]}>
            {formatElapsed(elapsedSeconds)}
          </Text>
        }
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: space.gutter,
          paddingBottom: rest.running ? 220 : 120,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={[t.screenTitle, { color: color.ink }]}>{training.name}</Text>
        <MonoLabel tone={color.inkFaint}>
          {`${steps} ${steps === 1 ? 'exercise' : 'exercises'} · ${rounds} ${
            rounds === 1 ? 'round' : 'rounds'
          }`}
        </MonoLabel>

        {training.blocks.map((block) => (
          <View key={block.id} style={{ marginTop: space.xl }}>
            <MonoLabel tone={color.ink}>{block.label}</MonoLabel>

            {Array.from({ length: Math.max(1, block.repeat) }, (_, i) => i + 1).map((round) => {
              const key = roundKey(block.id, round);
              const done = block.steps.filter(
                (step) => logsForSlot(logs, step.id, round).length > 0,
              ).length;

              return (
                <RoundCard
                  key={key}
                  round={round}
                  open={openRound === key}
                  done={done}
                  of={block.steps.length}
                  onToggle={() => {
                    LayoutAnimation.easeInEaseOut();
                    setOpenRound(openRound === key ? null : key);
                  }}
                >
                  {block.steps.map((step) => (
                    <ExerciseGroup
                      key={step.id}
                      step={step}
                      exercise={exercises.get(step.exerciseId)}
                      type={types.get(step.exerciseId) ?? 'weightReps'}
                      round={round}
                      logs={logs}
                      history={history.get(step.exerciseId)}
                      extra={extraSets.get(`${step.id}:${round}`) ?? 0}
                      drafts={drafts}
                      timer={setTimer}
                      onDraft={(slot, value) =>
                        setDrafts((prev) => new Map(prev).set(slot, value))
                      }
                      onTick={(setIndex, draft) =>
                        void tickSet({
                          step,
                          blockId: block.id,
                          round,
                          setIndex,
                          draft,
                          type: 'normal',
                        })
                      }
                      onStartTimer={(setIndex, target) =>
                        startTimer({ step, blockId: block.id, round, setIndex, target })
                      }
                      onStopTimer={() => endTimer('stopped')}
                      onUntick={(log) => void untickSet(log)}
                      onTypeMenu={(log) => setTypeFor({ log })}
                      onAddSet={() =>
                        setExtraSets((prev) => {
                          const next = new Map(prev);
                          const k = `${step.id}:${round}`;
                          next.set(k, (next.get(k) ?? 0) + 1);
                          return next;
                        })
                      }
                    />
                  ))}
                </RoundCard>
              );
            })}
          </View>
        ))}
      </ScrollView>

      <View
        style={[
          styles.sticky,
          // Sits above the rest sheet rather than under it: Finish must stay
          // reachable while a rest is running.
          { paddingBottom: insets.bottom + 12, bottom: rest.running ? 96 : 0 },
        ]}
      >
        <PrimaryButton label="Finish workout" onPress={onFinish} />
      </View>

      <RestSheet
        remaining={rest.remaining}
        total={rest.total}
        onAdjust={rest.adjust}
        onSkip={rest.stop}
      />

      <Toast
        title={record?.title ?? null}
        message={record?.message}
        onDone={() => setRecord(null)}
      />

      <ActionSheet
        visible={typeFor !== null}
        title="Set type"
        actions={(['normal', 'warmup', 'drop', 'failure'] as SetType[]).map((type) => ({
          label:
            typeFor?.log.type === type ? `${SET_TYPE_LABELS[type]}  ✓` : SET_TYPE_LABELS[type],
          onPress: () => typeFor && void setLogType(typeFor.log, type),
        }))}
        onClose={() => setTypeFor(null)}
      />

      <ConfirmDialog
        visible={nothingLogged}
        title="Nothing logged yet"
        message="Tick a set to record it. If you finish now there is nothing to save."
        actions={[
          { label: 'Discard session', destructive: true, onPress: () => void discard() },
        ]}
        cancelLabel="Keep going"
        onCancel={() => setNothingLogged(false)}
      />

      {/* Same three-way choice the player offers on abandon, and for the same
          reason — except that here there may be twenty logged sets behind it,
          so "keep it as a partial run" is the option that matters most. */}
      <ConfirmDialog
        visible={leaving}
        title="Leave this session?"
        message="You can keep it in your history as a partial run."
        actions={[
          { label: 'Discard', destructive: true, onPress: () => void discard() },
          {
            label: 'Save partial',
            primary: true,
            onPress: () => {
              setLeaving(false);
              if (hasAnyLog(logs)) void finalise(false);
              else void discard();
            },
          },
        ]}
        cancelLabel="Keep going"
        onCancel={() => setLeaving(false)}
      />
    </View>
  );
}

// ── Round ──────────────────────────────────────────────────────────────────

/**
 * One round, collapsible.
 *
 * The caret-and-summary pattern is lifted from the builder's `BlockCard`
 * rather than invented: the app already has one way of saying "this section
 * is folded up and here is what is in it", and a second would be a second
 * thing to keep in step.
 */
function RoundCard({
  round,
  open,
  done,
  of,
  onToggle,
  children,
}: {
  round: number;
  open: boolean;
  done: number;
  of: number;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const complete = of > 0 && done >= of;
  return (
    <Animated.View
      layout={LinearTransition.duration(motion.layout.duration)
        .reduceMotion(ReduceMotion.System)}
    >
    <Card style={{ marginTop: space.sm, overflow: 'hidden' }}>
      <AnimatedPressable style={styles.roundHeader} onPress={onToggle} hitSlop={4} haptic="tap">
        <Text style={{ color: color.inkMuted, fontSize: 12, width: 14 }}>
          {open ? '⌄' : '›'}
        </Text>
        <MonoLabel tone={color.ink} style={{ flex: 1 }}>{`Round ${round}`}</MonoLabel>
        <Text
          style={[
            t.monoValue,
            { color: complete ? color.softGreenIcon : color.inkFaint },
          ]}
        >
          {complete ? 'done' : `${done}/${of}`}
        </Text>
      </AnimatedPressable>

      {open && <View>{children}</View>}
    </Card>
    </Animated.View>
  );
}

// ── One exercise, within one round ─────────────────────────────────────────

function ExerciseGroup({
  step,
  exercise,
  type,
  round,
  logs,
  history,
  extra,
  drafts,
  timer,
  onDraft,
  onTick,
  onStartTimer,
  onStopTimer,
  onUntick,
  onTypeMenu,
  onAddSet,
}: {
  step: Step;
  exercise: Exercise | undefined;
  /** Decides the columns. Everything below reads `fieldsFor(type)`. */
  type: ExerciseType;
  round: number;
  logs: SetLog[];
  history: SetLog[] | undefined;
  extra: number;
  drafts: Map<string, Draft>;
  timer: SetTimer | null;
  onDraft: (slot: string, value: Draft) => void;
  onTick: (setIndex: number, draft: Draft) => void;
  onStartTimer: (setIndex: number, target: number) => void;
  onStopTimer: () => void;
  onUntick: (log: SetLog) => void;
  onTypeMenu: (log: SetLog) => void;
  onAddSet: () => void;
}) {
  const mine = logsForSlot(logs, step.id, round);
  const rowCount = rowsNeeded(logs, step.id, round, extra);
  const rows = Array.from({ length: rowCount }, (_, i) => i + 1);
  const fields = fieldsFor(type);

  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={[t.exerciseRow, { color: color.ink, fontSize: 14, flex: 1 }]}>
          {/* Names are user data and often Italian — never translated. */}
          {exercise?.name ?? 'Unknown exercise'}
        </Text>
      </View>

      {/* The form cue, shown here and nowhere in the timed player. The old
          reps sheet already argued this screen is read at rest; a note you
          cannot read is a note that may as well not exist. */}
      {exercise?.note != null && exercise.note.trim().length > 0 && (
        <Text style={styles.note} numberOfLines={2}>
          {exercise.note}
        </Text>
      )}

      {/* One header per field this exercise actually has, in field order, and
          the rows below run the same four conditionals off the same table —
          which is what keeps a column and its inputs from drifting apart.

          `headerText` carries the colour separately: the same width style is
          applied to `Pressable`s further down, and a `color` on a ViewStyle is
          a type error. */}
      <View style={styles.columns}>
        <Text style={[t.monoLabelTiny, styles.colSet, styles.headerLeft]}>SET</Text>
        <Text style={[t.monoLabelTiny, styles.colPrev, styles.headerLeft]}>PREVIOUS</Text>
        {fields.weight && (
          <Text style={[t.monoLabelTiny, styles.colInput, styles.headerText]}>
            {/* +KG and −KG are opposite facts. See `WeightSign`. */}
            {fields.weightSign === 'plus' ? '+KG' : fields.weightSign === 'minus' ? '−KG' : 'KG'}
          </Text>
        )}
        {fields.reps && (
          <Text style={[t.monoLabelTiny, styles.colInput, styles.headerText]}>REPS</Text>
        )}
        {fields.distance && (
          <Text style={[t.monoLabelTiny, styles.colInput, styles.headerText]}>KM</Text>
        )}
        {fields.time && (
          <Text style={[t.monoLabelTiny, styles.colInput, styles.headerText]}>TIME</Text>
        )}
        <View style={styles.colCheck} />
      </View>

      {rows.map((setIndex) => {
        const slot = slotKey(step.id, round, setIndex);
        return (
          <SetRow
            key={setIndex}
            step={step}
            fields={fields}
            round={round}
            setIndex={setIndex}
            log={mine.find((l) => l.setIndex === setIndex)}
            previous={previousFor(history, round, setIndex)}
            draft={drafts.get(slot)}
            timer={timer?.slot === slot ? timer : null}
            onDraft={(value) => onDraft(slot, value)}
            onTick={(draft) => onTick(setIndex, draft)}
            onStartTimer={(target) => onStartTimer(setIndex, target)}
            onStopTimer={onStopTimer}
            onUntick={onUntick}
            onTypeMenu={onTypeMenu}
          />
        );
      })}

      <AnimatedPressable onPress={onAddSet} hitSlop={6} haptic="tap" style={styles.addSet}>
        <Text style={[t.monoLabel, { color: color.inkFaint }]}>+ Add set</Text>
      </AnimatedPressable>
    </View>
  );
}

// ── One row ────────────────────────────────────────────────────────────────

function SetRow({
  step,
  fields,
  round,
  setIndex,
  log,
  previous,
  draft,
  timer,
  onDraft,
  onTick,
  onStartTimer,
  onStopTimer,
  onUntick,
  onTypeMenu,
}: {
  step: Step;
  fields: TypeFields;
  round: number;
  setIndex: number;
  log: SetLog | undefined;
  previous: SetLog | undefined;
  draft: Draft | undefined;
  /** Non-null only while THIS row's clock is running. */
  timer: SetTimer | null;
  onDraft: (value: Draft) => void;
  onTick: (draft: Draft) => void;
  onStartTimer: (target: number) => void;
  onStopTimer: () => void;
  onUntick: (log: SetLog) => void;
  onTypeMenu: (log: SetLog) => void;
}) {
  const [showProvenance, setShowProvenance] = useState(false);

  // Values, placeholders and the difference between them. A target NEVER
  // becomes a value: an untouched row must log nothing, which is the only way
  // "I did four of the five" can be recorded honestly.
  const logged: Draft = {
    kg: log?.weightKg != null ? String(log.weightKg) : '',
    reps: log?.reps != null ? String(log.reps) : '',
    time: log?.seconds != null ? formatSetClock(log.seconds) : '',
    km: log?.distanceKm != null ? trimNumber(log.distanceKm) : '',
  };
  const value: Draft = {
    kg: draft?.kg ?? logged.kg,
    reps: draft?.reps ?? logged.reps,
    time: draft?.time ?? logged.time,
    km: draft?.km ?? logged.km,
  };

  // Resolved for THIS round — the player and the queue both do, and the
  // placeholder is meant to be the same prescription they are about to run.
  const prescribedWeight = weightForRound(step, round);
  const targetSeconds = secondsAt(step, round);
  const targetDistance = distanceAt(step, round);
  const targetReps = repsAt(step, round);
  const placeholder: Draft = {
    kg: prescribedWeight.weightKg != null ? String(prescribedWeight.weightKg) : '—',
    reps: targetReps != null ? String(targetReps) : '—',
    time: targetSeconds > 0 ? formatSetClock(targetSeconds) : '—',
    km: targetDistance != null ? trimNumber(targetDistance) : '—',
  };

  const mark = log ? SET_TYPE_MARK[log.type] : null;
  const previousLabel = previous ? formatLog(previous) : null;

  /**
   * What the TIME cell shows while a clock is running: seconds still to go.
   * Recomputed on the screen's one-per-second re-render rather than owned
   * here, so there is exactly one interval on this screen.
   */
  const remaining = timer
    ? Math.max(0, timer.target - Math.round((Date.now() - timer.startedAt) / 1000))
    : null;

  return (
    <Animated.View
      layout={LinearTransition.duration(motion.layout.duration)
        .reduceMotion(ReduceMotion.System)}
    >
    <View style={[styles.row, log && styles.rowDone]}>
      <AnimatedPressable
        style={styles.colSet}
        hitSlop={8}
        disabled={!log}
        haptic="tap"
        toScale={1}
        toOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={log ? 'Change set type' : `Set ${setIndex}`}
        onPress={() => log && onTypeMenu(log)}
      >
        <Text
          style={[
            t.monoValue,
            { color: mark ? color.softBlueIcon : color.inkGhost },
          ]}
        >
          {mark ?? setIndex}
        </Text>
      </AnimatedPressable>

      {/* Tapping shows where the number came from. It may be from a different
          circuit entirely (decision D7), and a bare number silently borrowed
          from another context is the kind of quiet fiction the rest of this
          app refuses. */}
      <AnimatedPressable
        style={styles.colPrev}
        hitSlop={6}
        disabled={previous == null}
        haptic="tap"
        toScale={1}
        toOpacity={0.7}
        onPress={() => setShowProvenance((v) => !v)}
      >
        <Text style={[t.monoValue, { color: color.inkGhost }]} numberOfLines={1}>
          {previousLabel ?? '—'}
        </Text>
        {showProvenance && previous && (
          <Text style={[t.monoLabelTiny, { color: color.inkGhostest, marginTop: 2 }]}>
            {new Date(previous.completedAt).toLocaleDateString()}
          </Text>
        )}
      </AnimatedPressable>

      {fields.weight && (
        <TextInput
          value={value.kg}
          onChangeText={(v) => onDraft({ ...value, kg: v })}
          placeholder={placeholder.kg}
          placeholderTextColor={color.inkGhostest}
          keyboardType="decimal-pad"
          accessibilityLabel={
            fields.weightSign === 'minus' ? 'Assistance in kilograms' : 'Weight in kilograms'
          }
          style={[styles.colInput, styles.input]}
        />
      )}

      {fields.reps && (
        <TextInput
          value={value.reps}
          onChangeText={(v) => onDraft({ ...value, reps: v })}
          placeholder={placeholder.reps}
          placeholderTextColor={color.inkGhostest}
          keyboardType="number-pad"
          accessibilityLabel="Reps"
          style={[styles.colInput, styles.input]}
        />
      )}

      {fields.distance && (
        <TextInput
          value={value.km}
          onChangeText={(v) => onDraft({ ...value, km: v })}
          placeholder={placeholder.km}
          placeholderTextColor={color.inkGhostest}
          keyboardType="decimal-pad"
          accessibilityLabel="Distance in kilometres"
          style={[styles.colInput, styles.input]}
        />
      )}

      {/* TIME is a field AND a clock. Typing into it is the honest fallback —
          you timed it on the wall clock, or you are correcting a set after the
          fact — and the ▶ starts this screen's one running timer, which fills
          the field itself when it reaches the prescribed duration. Tapping ■
          stops early and writes what it actually read, WITHOUT ticking the
          set: a plank abandoned at thirty seconds is not a forty-five-second
          plank. */}
      {fields.time && (
        <View style={[styles.colInput, styles.timeCell]}>
          <TextInput
            value={timer ? formatSetClock(remaining ?? 0) : value.time}
            onChangeText={(v) => onDraft({ ...value, time: v })}
            editable={!timer}
            placeholder={placeholder.time}
            placeholderTextColor={color.inkGhostest}
            keyboardType="numbers-and-punctuation"
            accessibilityLabel="Time"
            style={[
              styles.input,
              styles.timeInput,
              timer != null && { color: color.softGreenIcon },
            ]}
          />
          <AnimatedPressable
            hitSlop={6}
            disabled={targetSeconds <= 0}
            haptic="select"
            toScale={1}
            toOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={timer ? 'Stop timing this set' : 'Time this set'}
            onPress={() => (timer ? onStopTimer() : onStartTimer(targetSeconds))}
            style={styles.timeButton}
          >
            <Text
              style={[
                t.monoValue,
                {
                  fontSize: 11,
                  color: targetSeconds <= 0 ? color.inkDisabled : color.inkMuted,
                },
              ]}
            >
              {timer ? '■' : '▶'}
            </Text>
          </AnimatedPressable>
        </View>
      )}

      <AnimatedPressable
        style={styles.colCheck}
        hitSlop={6}
        haptic="success"
        toScale={1}
        toOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: log != null }}
        accessibilityLabel={`Set ${setIndex}`}
        onPress={() => {
          if (log) onUntick(log);
          // An empty row still logs: ticking it says "I did this set" even
          // when you did not stop to say with what. The prescription is
          // visible right there in the placeholder if you want the number.
          else onTick(value);
        }}
      >
        <View style={[styles.check, log && styles.checkOn]}>
          {log && <Text style={styles.checkGlyph}>✓</Text>}
        </View>
      </AnimatedPressable>
    </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  roundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: color.blockHeader,
    paddingHorizontal: space.m,
    paddingVertical: space.sm,
  },
  group: {
    paddingHorizontal: space.m,
    paddingTop: space.sm,
    paddingBottom: space.xs,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  note: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    lineHeight: 16,
    color: color.inkFaint,
    marginTop: 3,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: space.sm,
    paddingBottom: 4,
  },
  colSet: { width: 26, alignItems: 'flex-start' },
  colPrev: { flex: 1.3 },
  colInput: { flex: 1 },
  /** The TIME field and its ▶ share one column's width. */
  timeCell: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeInput: { flex: 1, paddingHorizontal: 2 },
  timeButton: { width: 18, alignItems: 'center' },
  colCheck: { width: 34, alignItems: 'flex-end' },
  headerText: { color: color.inkFaint, textAlign: 'center' },
  headerLeft: { color: color.inkFaint },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  rowDone: { backgroundColor: color.blockHeader, borderRadius: radius.fieldTight },
  input: {
    height: 38,
    borderRadius: radius.fieldTight,
    backgroundColor: color.sunken,
    borderWidth: 1,
    borderColor: color.hairline,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: color.ink,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  check: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: color.softGreen, borderColor: color.softGreenBorder },
  checkGlyph: { fontFamily: 'Inter_700Bold', fontSize: 15, color: color.softGreenIcon },
  addSet: { paddingVertical: 10 },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: space.gutter,
    paddingTop: 12,
    backgroundColor: color.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
});
