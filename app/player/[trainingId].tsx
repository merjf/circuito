/**
 * 1h / 1j — the interval player, and the DEFAULT way a workout is run.
 *
 * Starting a training lands here. That was true before the type rewrite and it
 * stays true after it: the point of this app is a circuit you perform with the
 * phone on the floor, and a screen you have to type into is not that.
 *
 * What the rewrite changed is what it can run. There is no longer such a thing
 * as a training this player refuses — a block can hold a bench press, a plank
 * and a farmer's walk, and each cue arrives carrying the fields ITS exercise is
 * measured in. Timed cues count down. Everything else is tap-gated: the screen
 * shows what to do, and waits for DONE rather than inventing a duration for it.
 * The centre readout, the chips and the up-next line all read off the cue and
 * the exercise's type, so a mixed circuit describes itself correctly step by
 * step without this screen knowing anything about types in the aggregate.
 *
 * The logger (`app/reps/[trainingId].tsx`) is the other way in, offered second,
 * for when you want to record what you actually lifted rather than just run.
 *
 * ONE screen, not two. The handoff is explicit that rest should keep the work
 * layout and change only tone ("a layout that jumps every 45 seconds is worse
 * than one that only changes tone"), and the prototype behaves that way, so the
 * mock's centred-timer rest variant is deliberately not built. Everything below
 * reads its colours from `playerPalette(state, settings)` and nothing moves
 * across the flip. Since 2026-08-16 there are THREE states rather than two —
 * work, warning and rest — and the backgrounds may be user-chosen, which is why
 * the palette is computed rather than looked up.
 *
 * The background IS the progress: a `#202023` block grows from the bottom to
 * the elapsed fraction of the *current* cue, capped by a 1px hairline. It is
 * animated toward each tick's value over exactly one tick, linearly — so it
 * renders at 60fps while staying pinned to the clock rather than free-running.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { getTraining, insertSession, listExercises } from '@/db/repo';
import { formatClock, formatDuration,
  formatQueueDuration, totalRounds } from '@/domain/duration';
import { newSessionId } from '@/domain/id';
import { fieldsFor } from '@/domain/exerciseType';
import { buildQueue, exerciseTypesOf, roundsCompletedAt } from '@/domain/queue';
import type { Exercise, Session, Training } from '@/domain/types';
import { formatWeightChip, weightOf } from '@/domain/weight';
import { gatedReadout, NOTHING, trimNumber, upNextMeta } from '@/runner/cueText';
import { useCueSounds } from '@/runner/useCueSounds';
import { useRunner, type RunnerState } from '@/runner/useRunner';
import { useSessionNotification } from '@/runner/useSessionNotification';
import { useSettings } from '@/hooks/useSettings';
import { playerPalette, playerStateFor } from '@/theme/playerPalette';
import { color, radius, size, space, transition } from '@/theme/tokens';
import { type as t } from '@/theme/type';

/**
 * How much −/+ moves a rest.
 *
 * 15 rather than the builder's 5-second increment: this is a mid-session
 * gesture made with one thumb while breathing hard, not a considered edit, and
 * a control you have to press three times is a control you skip past instead.
 */
const REST_ADJUST_SECONDS = 15;

export default function PlayerScreen() {
  const { trainingId } = useLocalSearchParams<{ trainingId: string }>();
  const [loaded, setLoaded] = useState<{
    training: Training;
    exercises: Map<string, Exercise>;
  } | null>(null);

  /**
   * BOTH, or neither. The two reads used to be separate `.then`s, and the
   * training almost always won — it is a keyed lookup against a library scan —
   * so `Player` mounted with an empty exercise map.
   *
   * That is not a cosmetic flash. An empty map means no step resolves to a
   * type, `stepIsTimed` answers false for all of them (the safe direction,
   * deliberately), and every work cue in the queue is built tap-gated. With
   * `prepareSeconds: 0` the very first frame of a 45-second plank shows a dash
   * where the countdown belongs and DONE where pause belongs — and a tap in
   * that window skips the exercise outright. The queue is only as right as the
   * map it was built from, so the screen waits for the map.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [training, list] = await Promise.all([getTraining(trainingId), listExercises()]);
      if (cancelled || !training) return;
      setLoaded({ training, exercises: new Map(list.map((e) => [e.id, e])) });
    })();
    return () => {
      cancelled = true;
    };
  }, [trainingId]);

  if (!loaded) {
    return (
      <View style={[styles.loading, { backgroundColor: color.darkBg }]}>
        <ActivityIndicator color={color.darkMuted} />
      </View>
    );
  }

  // Keyed so the runner is rebuilt from scratch if the training is swapped.
  return (
    <Player
      key={loaded.training.id}
      training={loaded.training}
      exercises={loaded.exercises}
    />
  );
}

function Player({
  training,
  exercises,
}: {
  training: Training;
  exercises: Map<string, Exercise>;
}) {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const playSound = useCueSounds();
  const saving = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const { settings } = useSettings();
  // Declared before `save`, which closes over it to rebuild the queue.
  const types = useMemo(() => exerciseTypesOf(exercises.values()), [exercises]);

  /**
   * Write the session and hand off to the summary. Guarded by a ref because
   * both the natural finish and the abandon prompt can reach it, and a
   * double-write would put two rows in history for one workout.
   *
   * The queue is rebuilt here rather than read off the runner: it is a pure
   * function of the training, and taking it from the runner would make this
   * callback depend on state it does not otherwise need.
   */
  const save = useCallback(
    async (state: RunnerState, completed: boolean) => {
      if (saving.current) return;
      saving.current = true;

      const work = Math.round(state.elapsedByKind.work);
      const rest = Math.round(state.elapsedByKind.rest);
      const session: Session = {
        id: newSessionId(),
        trainingId: training.id,
        trainingName: training.name,
        startedAt: new Date(state.sessionStartedAt).toISOString(),
        endedAt: new Date().toISOString(),
        elapsedSeconds: work + rest,
        workSeconds: work,
        restSeconds: rest,
        roundsCompleted: roundsCompletedAt(buildQueue(training, types), state.index, completed),
        roundsPlanned: totalRounds(training),
        skippedRests: state.skippedRests,
        completed,
      };
      await insertSession(session);
      router.replace({ pathname: '/session/[id]', params: { id: session.id } });
    },
    [training, types],
  );

  const runner = useRunner(
    training,
    types,
    settings,
    {
      onSound: playSound,
      onFinish: (state) => void save(state, true),
    },
    { autoStart: true },
  );

  // The warning state is new: the work screen changes colour for the final
  // lead-in seconds. It does not apply to a gated cue, which has no known end
  // to count down to — same reason its warning sound does not fire.
  const playerState = playerStateFor({
    isRest: !runner.dark,
    secondsRemaining: runner.remaining,
    leadSeconds: settings.leadSeconds.beforeRoundEnd,
  });
  const palette = playerPalette(playerState, settings);

  // ── The draining fill ────────────────────────────────────────────────────
  const fill = useSharedValue(0);
  useEffect(() => {
    // Snap back to empty at the start of a cue, then chase the tick.
    if (runner.progress < 0.02) fill.value = runner.progress;
    else fill.value = withTiming(runner.progress, { duration: 120, easing: Easing.linear });
  }, [runner.progress, fill]);

  const fillStyle = useAnimatedStyle(() => ({ height: `${fill.value * 100}%` }));

  const exercise = runner.cue?.exerciseId ? exercises.get(runner.cue.exerciseId) : undefined;
  const nextExercise = runner.next?.exerciseId
    ? exercises.get(runner.next.exerciseId)
    : undefined;
  // What THIS cue's exercise is measured in. Read per cue rather than per
  // training: within one circuit the answer changes from step to step, which
  // is the entire point of the type model.
  const fields = fieldsFor(exercise?.type ?? 'weightReps');

  const phaseLabel =
    runner.phase === 'prepare' ? 'Prepare' : runner.phase === 'rest' ? 'Rest' : 'Work';

  const title =
    runner.cue?.kind === 'work'
      ? (exercise?.name ?? 'Exercise')
      : runner.cue?.kind === 'prepare'
        ? 'Get ready'
        : runner.cue?.kind === 'roundRest'
          ? `Round ${runner.cue.round} done`
          : 'Rest';

  const contextLabel =
    runner.cue?.kind === 'prepare' || !runner.cue
      ? training.name
      : `Round ${runner.cue.round} / ${runner.cue.roundsInBlock}` +
        (runner.cue.kind === 'work'
          ? ` · Ex ${runner.cue.stepIndex} / ${runner.cue.stepsInRound}`
          : '');

  const nextTitle = !runner.next
    ? 'Finish'
    : runner.next.kind === 'work'
      ? (nextExercise?.name ?? 'Exercise')
      : runner.next.kind === 'roundRest'
        ? 'Round rest'
        : 'Rest';

  const nextMeta = upNextMeta(runner.next, nextExercise?.type);
  const gated = runner.cue
    ? gatedReadout(runner.cue, exercise?.type)
    : { value: NOTHING, unit: null };

  /**
   * §3.9 — the ongoing notification. Deliberately not `runner.remaining`: a
   * number that stops updating outside this screen would silently start
   * lying the moment the phone locks, which is exactly the kind of invented
   * precision the rest of the app refuses. `cue.seconds` is the PLAN's
   * length, a fact as static as `stepMetaLine`'s, not a claim about what is
   * left right now.
   */
  const notifBody =
    runner.remaining === null
      ? `${phaseLabel} · ${gated.value}${gated.unit ? ` ${gated.unit}` : ''}`
      : runner.isPaused
        ? `${phaseLabel} · Paused`
        : `${phaseLabel} · ${formatClock(runner.cue?.seconds ?? 0)}`;
  useSessionNotification({ active: !runner.finished, title, body: notifBody });

  /**
   * The prescription, as chips under the exercise name.
   *
   * Gated on the TYPE first and the value second, in that order. The value
   * check alone is not enough: a step keeps its `weightKg` when its exercise
   * is reclassified as bodyweight, and a chip reading "3 KG" on a movement
   * that is no longer weighted is a number nobody prescribed.
   *
   * Then: whatever the centre readout is already showing is not repeated
   * underneath it. Asked as "which unit is the centre showing" rather than as
   * "is this cue gated", because those are the same answer only by accident of
   * the current field table — every rep-counted type happens to be untimed
   * today, and a chip rule that silently turns into dead code the moment that
   * changes is worse than no rule.
   */
  const inCentre = runner.remaining === null ? gated.unit : null;
  const weight = runner.cue ? weightOf(runner.cue) : null;
  const chips = [
    fields.reps && runner.cue?.targetReps != null && inCentre !== 'reps'
      ? `×${runner.cue.targetReps} reps`
      : null,
    fields.weight && weight ? formatWeightChip(weight, fields.weightSign) : null,
    fields.distance && runner.cue?.targetDistanceKm != null && inCentre !== 'km'
      ? `${trimNumber(runner.cue.targetDistanceKm)} KM`
      : null,
  ].filter(Boolean) as string[];

  /** Handoff § "Abandon": closing mid-session prompts discard or save partial. */
  const savePartial = () =>
    void save(
      {
        index: runner.index,
        startedAt: Date.now(),
        pausedAt: null,
        accumulatedPause: 0,
        isPaused: true,
        skippedRests: runner.skippedRests,
        // The partial save reads only the banked totals, so the current cue's
        // adjustment is already spent by the time we get here.
        adjustment: 0,
        elapsedByKind: runner.elapsedByKind,
        sessionStartedAt: runner.sessionStartedAt,
        finished: false,
      },
      false,
    );

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]}>
      {/* Progress fill, pinned to the bottom, with its hairline cap. */}
      <Animated.View
        style={[styles.fill, { backgroundColor: palette.fill }, fillStyle]}
        pointerEvents="none"
      >
        <View style={[styles.fillCap, { backgroundColor: palette.hairline }]} />
      </Animated.View>

      <View style={[styles.content, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => {
              // Pause first: the prompt should not eat into the round.
              if (!runner.isPaused) runner.toggle();
              setLeaving(true);
            }}
            hitSlop={14}
            style={{ width: 28 }}
          >
            <Text style={{ fontSize: 20, lineHeight: 24, color: palette.muted }}>×</Text>
          </Pressable>
          <Text style={[t.monoLabel, { color: palette.muted }]}>{contextLabel}</Text>
          <Text style={[t.monoValueSmall, { color: palette.muted }]}>
            {formatQueueDuration(runner.totalRemaining)} left
          </Text>
        </View>

        {/* Centre block — the two things that carry the screen */}
        <View style={styles.centre}>
          <Text style={[t.monoPhase, { color: palette.muted }]}>{phaseLabel}</Text>
          {/* A gated step shows what it prescribes where the clock would be —
              reps for a rep-counted movement, kilometres for a carry. There is
              no time to display and a frozen 0:00 would look broken, so the
              screen shows the thing that IS being counted, and names the unit,
              because "12" alone could be reps, kilograms or minutes.

              The unit is nested inside the same Text rather than placed under
              it, so the exercise name below does not shift down every time the
              session reaches a gated cue. */}
          <Text style={[t.playerTimer, { color: palette.ink, marginTop: 14 }]}>
            {runner.remaining === null ? (
              <>
                {gated.value}
                {gated.unit && (
                  <Text style={[t.playerTimerUnit, { color: palette.ink2 }]}>
                    {` ${gated.unit}`}
                  </Text>
                )}
              </>
            ) : (
              formatClock(runner.remaining)
            )}
          </Text>
          <Text
            style={[t.playerExercise, { color: palette.ink, marginTop: 26 }]}
            numberOfLines={3}
          >
            {title}
          </Text>
          {chips.length > 0 && (
            <View style={styles.chips}>
              {chips.map((chip) => (
                <View key={chip} style={[styles.chip, { backgroundColor: palette.chip }]}>
                  <Text style={[t.monoLabel, { color: palette.ink2, letterSpacing: 1 }]}>
                    {chip}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Up next */}
        <View style={styles.upNext}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[t.monoLabelTiny, { color: palette.faint }]}>Up next</Text>
            <Text
              style={[t.exerciseRow, { color: palette.ink2, fontSize: 14, marginTop: 6 }]}
              numberOfLines={1}
            >
              {nextTitle}
            </Text>
          </View>
          <Text style={[t.monoValue, { color: palette.faint }]}>{nextMeta}</Text>
        </View>

        {/* Trim or stretch a rest without skipping it outright.
            Rests only: on a work interval the length is the prescription, and
            a button that quietly rewrites it would make the training's own
            total a fiction. ▶▶ already exists for "I am done with this".
            The row is rendered at a fixed height whether or not it has
            buttons in it, so the controls below never move between cues. */}
        <View style={styles.adjustRow}>
          {runner.phase === 'rest' && runner.canAdjust && (
            <>
              <Pressable
                onPress={() => runner.adjust(-REST_ADJUST_SECONDS)}
                accessibilityLabel={`Take ${REST_ADJUST_SECONDS} seconds off this rest`}
                hitSlop={8}
                style={[styles.adjustButton, { backgroundColor: palette.button }]}
              >
                <Text style={[t.monoLabel, { color: palette.ink2 }]}>
                  {`−${REST_ADJUST_SECONDS}s`}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => runner.adjust(REST_ADJUST_SECONDS)}
                accessibilityLabel={`Add ${REST_ADJUST_SECONDS} seconds to this rest`}
                hitSlop={8}
                style={[styles.adjustButton, { backgroundColor: palette.button }]}
              >
                <Text style={[t.monoLabel, { color: palette.ink2 }]}>
                  {`+${REST_ADJUST_SECONDS}s`}
                </Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Controls */}
        <View style={[styles.controls, { paddingBottom: Math.max(insets.bottom, space.xxl) }]}>
          <Pressable
            onPress={runner.previous}
            style={[styles.sideControl, { backgroundColor: palette.button }]}
          >
            <Text style={{ fontSize: 14, color: palette.ink2 }}>◀◀</Text>
          </Pressable>

          {/* On a gated step the centre control becomes Done rather than
              play/pause. There is no clock to pause, so a pause button would be
              a control that does nothing; Done is the only thing the runner is
              actually waiting for. */}
          <Pressable
            onPress={runner.remaining === null ? runner.complete : runner.toggle}
            style={[styles.centreControl, { backgroundColor: palette.ink }]}
          >
            {runner.remaining === null ? (
              <Text style={[t.monoLabel, { color: palette.bg }]}>DONE</Text>
            ) : runner.isPaused ? (
              <View style={[styles.playTriangle, { borderLeftColor: palette.bg }]} />
            ) : (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <View style={[styles.pauseBar, { backgroundColor: palette.bg }]} />
                <View style={[styles.pauseBar, { backgroundColor: palette.bg }]} />
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={runner.skip}
            style={[styles.sideControl, { backgroundColor: palette.button }]}
          >
            <Text style={{ fontSize: 14, color: palette.ink2 }}>▶▶</Text>
          </Pressable>
        </View>
      </View>

      <ConfirmDialog
        visible={leaving}
        title="Leave this session?"
        message="You can keep it in your history as a partial run."
        actions={[
          {
            label: 'Discard',
            destructive: true,
            onPress: () => {
              setLeaving(false);
              router.back();
            },
          },
          {
            label: 'Save partial',
            primary: true,
            onPress: () => {
              setLeaving(false);
              savePartial();
            },
          },
        ]}
        cancelLabel="Keep going"
        onCancel={() => {
          setLeaving(false);
          if (runner.isPaused) runner.toggle();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  fillCap: { position: 'absolute', left: 0, right: 0, top: 0, height: 1 },
  content: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.gutter,
    paddingTop: 10,
  },
  centre: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.gutterPlayer,
    minHeight: 0,
  },
  chips: { flexDirection: 'row', gap: 7, flexWrap: 'wrap', marginTop: 14 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.fieldTight },
  upNext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.gutterPlayer,
    paddingBottom: 14,
  },
  controls: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: space.gutterPlayer,
  },
  // Fixed height, always rendered: the transport controls below must not jump
  // up and down as the session moves between work and rest.
  adjustRow: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: space.gutterPlayer,
  },
  adjustButton: {
    minWidth: 74,
    height: 34,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideControl: {
    flex: 1,
    height: size.playerControl,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centreControl: {
    flex: 2,
    height: size.playerControl,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBar: { width: 5, height: 22, borderRadius: 1 },
  playTriangle: {
    width: 0,
    height: 0,
    marginLeft: 4,
    borderLeftWidth: 18,
    borderTopWidth: 11,
    borderBottomWidth: 11,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
});

// The palette cross-fade duration is a token; referenced here so the constant
// stays wired to the design system even though RN animates colour per-property.
void transition.themeFlip;
