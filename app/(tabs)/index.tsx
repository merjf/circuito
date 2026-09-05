/**
 * 1a — Home / training list.
 *
 * Deliberately the first screen built after the model: it renders nothing that
 * is stored, so if the durations and structure strips look right here, the
 * derived-duration maths and the queue are right.
 */

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { ActionSheet } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { StructureStrip } from '@/components/StructureStrip';
import {
  AddCircle,
  AnimatedPressable,
  Card,
  FilterPill,
  MonoLabel,
  MoreButton,
  OutlineChip,
  PlayButton,
} from '@/components/ui';
import {
  deleteTraining,
  duplicateTraining,
  listExercises,
  listTrainings,
  listSessions,
} from '@/db/repo';
import { formatDayDate } from '@/domain/dates';
import {
  formatDuration,
  hasTimedWork,
  totalRounds,
  totalSteps,
  trainingHeadline,
} from '@/domain/duration';
import { exerciseTypesOf, type ExerciseTypes } from '@/domain/queue';
import type { Session, Training } from '@/domain/types';
import { formatTrainingWeight } from '@/domain/weight';
import { color, motion, radius, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

/**
 * A training used to declare a kind before you had even typed a name — a
 * `ConfirmDialog` on `+` (`PLAN_ui_fixes.md` A2), and later a `ModeSwitch`
 * inside the builder. Neither exists now: a training is blocks of steps, and
 * what each step is measured in comes from its exercise. `+` opens a plain
 * draft and nothing has to be decided before the name.
 */
const openNewTraining = () =>
  router.push({ pathname: '/training/[id]/builder', params: { id: 'new' } });

/**
 * Begin a training without going through its detail screen first.
 *
 * Always the player. It used to be a branch — a reps training had no queue and
 * `buildQueue` refused one by design — and the branch is gone rather than
 * flipped: the player now runs every exercise type, counting down the timed
 * ones and waiting on a tap for the rest. Pressing ▶ on a card means "run this
 * now", and that has one answer.
 *
 * The logger is the other way in, from the detail screen, for a session you
 * want to record set by set rather than just perform.
 */
const startTraining = (training: Training) =>
  router.push({ pathname: '/player/[trainingId]', params: { trainingId: training.id } });

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [trainings, setTrainings] = useState<Training[] | null>(null);
  const [lastSession, setLastSession] = useState<Session | null>(null);
  /**
   * What each exercise is measured in — which decides whether a card can quote
   * a total at all, whether a weight is still a weight, and how the structure
   * strip divides itself up.
   *
   * `null` until loaded, and NOT an empty Map, because those two are opposite
   * claims and were being made with the same value. An empty map means "no
   * exercise is measured in time", which is a real answer for a library that
   * really is all rep-counted — so a card rendered against a not-yet-loaded map
   * flatly mislabelled every timed circuit as REPS, dropped its weight from the
   * meta line, and drew its strip with the wrong proportions. On the app's home
   * screen, at launch.
   */
  const [types, setTypes] = useState<ExerciseTypes | null>(null);
  // deleteTraining() (db/repo.ts) existed already but was called from
  // nowhere — there was no way to delete a training from the app at all
  // (`PLAN_ui_fixes.md` A4).
  const [trainingToDelete, setTrainingToDelete] = useState<Training | null>(null);
  // The bin used to sit on the face of every card. Six cards meant six live
  // delete targets under a scrolling thumb, so it moved behind `⋯`
  // (`PLAN_hevy_integration.md` §3.1) alongside Edit and Duplicate.
  //
  // Two separate pieces of state, never both set: `ActionSheet` dismisses
  // itself BEFORE running an action, so Delete opens the dialog only once the
  // sheet has gone. Stacking two Modals is unreliable on iOS.
  const [menuFor, setMenuFor] = useState<Training | null>(null);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  /** Every exercise's tags, so a training can be described by what is in it. */
  const [tagsByExercise, setTagsByExercise] = useState<Map<string, string[]>>(new Map());

  /**
   * The trainings and the library land together. Separately, the trainings
   * almost always won — a small table against a full library scan — and the
   * cards rendered for a frame against a library that was not there yet.
   *
   * `lastSession` is deliberately left to race: it is its own row at the
   * bottom of the screen, it says nothing about any card, and holding the list
   * for it would delay the whole screen behind the least important thing on it.
   */
  const reload = useCallback(() => {
    let cancelled = false;
    void (async () => {
      const [list, allTrainings] = await Promise.all([listExercises(), listTrainings()]);
      if (cancelled) return;
      setTypes(exerciseTypesOf(list));
      setTagsByExercise(new Map(list.map((e) => [e.id, e.tags])));
      setTrainings(allTrainings);
    })();
    listSessions(1).then((s) => setLastSession(s[0] ?? null));
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(reload);

  /**
   * A training's tags are the union of its exercises' tags.
   *
   * No new field, no second taxonomy to maintain, and it stays true on its
   * own: a circuit made of Gambe exercises IS a Gambe circuit, and it stops
   * being one the moment you swap them out. A `Training.tags` column would
   * have to be remembered, and would quietly go stale the first time it was
   * not.
   */
  const tagsOf = useCallback(
    (training: Training): string[] => {
      const tags = new Set<string>();
      for (const block of training.blocks) {
        for (const step of block.steps) {
          for (const name of tagsByExercise.get(step.exerciseId) ?? []) tags.add(name);
        }
      }
      return [...tags];
    },
    [tagsByExercise],
  );

  const tags = useMemo(() => {
    const all = new Set<string>();
    for (const training of trainings ?? []) for (const name of tagsOf(training)) all.add(name);
    return [...all].sort();
  }, [trainings, tagsOf]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (trainings ?? []).filter((training) => {
      const matchesQuery = !q || training.name.toLowerCase().includes(q);
      const matchesTag = !tag || tagsOf(training).includes(tag);
      return matchesQuery && matchesTag;
    });
  }, [trainings, query, tag, tagsOf]);

  /** Filters are noise below a handful of trainings. */
  const showFilters = (trainings?.length ?? 0) > 3;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.canvas }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: space.gutter,
        paddingBottom: space.xxl,
      }}
    >
      <View style={styles.header}>
        <View>
          <Text style={[t.screenTitle, { color: color.ink }]}>Trainings</Text>
          <MonoLabel style={{ marginTop: 8 }}>
            {trainings ? `${trainings.length} saved` : '— saved'}
          </MonoLabel>
        </View>
        <AddCircle onPress={openNewTraining} />
      </View>

      {/* trainings starts null and used to render nothing at all while
          loading, so the screen blinked blank on every focus before the
          list (or the empty state) had data to show
          (`PLAN_ui_fixes.md` B7). */}
      {(trainings === null || types === null) && (
        <View style={styles.loading}>
          <ActivityIndicator color={color.inkGhost} />
        </View>
      )}

      {trainings?.length === 0 && <EmptyState onPress={openNewTraining} />}

      {/* Search and pills appear only once there is enough here to lose
          something in. Four cards on a phone are all visible at once, and a
          filter over a list you can already see is a control that costs
          space to save nothing. */}
      {showFilters && (
        <>
          <View style={styles.searchWrap}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search trainings"
              placeholderTextColor={color.inkGhost}
              style={[styles.search, query.length > 0 && { paddingRight: 34 }]}
            />
            {query.length > 0 && (
              <AnimatedPressable
                onPress={() => setQuery('')}
                hitSlop={10}
                haptic="tap"
                accessibilityLabel="Clear search"
                style={styles.searchClear}
              >
                <Text style={styles.searchClearGlyph}>×</Text>
              </AnimatedPressable>
            )}
          </View>

          {tags.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pills}
            >
              <FilterPill
                label="All"
                count={trainings?.length ?? 0}
                active={tag === null}
                onPress={() => setTag(null)}
              />
              {tags.map((name) => (
                <FilterPill
                  key={name}
                  label={name}
                  active={tag === name}
                  onPress={() => setTag(name)}
                />
              ))}
            </ScrollView>
          )}
        </>
      )}

      {trainings != null && trainings.length > 0 && filtered.length === 0 && (
        // Same copy as the library's version of this state — the list has
        // things in it, the filter just matched none of them.
        <Text style={[t.body, { color: color.inkFaint, marginTop: space.xl }]}>
          Nothing matches that.
        </Text>
      )}

      {/* The `types !== null` guard is what makes the card's prop non-null,
          and it is also the honest condition: a card cannot describe itself
          before the library says what its exercises are. The two land in the
          same batch, so this never actually withholds anything the spinner
          above is not already covering. */}
      {types !== null &&
        filtered.map((training, index) => (
          <TrainingCard
            key={training.id}
            training={training}
            exerciseTypes={types}
            index={index}
            onMenu={() => setMenuFor(training)}
          />
        ))}

      {lastSession && <LastSession session={lastSession} />}

      <ActionSheet
        visible={menuFor !== null}
        title={menuFor?.name || 'Untitled training'}
        actions={
          menuFor
            ? [
                {
                  label: 'Start',
                  // A training with no exercises has nothing to run. Not
                  // reachable through the builder, which validates on save —
                  // but the guard costs one expression and the alternative is
                  // a player that finishes instantly and banks an empty
                  // session into History.
                  disabled: totalSteps(menuFor) === 0,
                  hint: totalSteps(menuFor) === 0 ? 'No exercises yet' : undefined,
                  onPress: () => startTraining(menuFor),
                },
                {
                  label: 'Edit',
                  onPress: () =>
                    router.push({
                      pathname: '/training/[id]/builder',
                      params: { id: menuFor.id },
                    }),
                },
                {
                  label: 'Duplicate',
                  onPress: async () => {
                    await duplicateTraining(menuFor.id, `${menuFor.name || 'Untitled'} copy`);
                    reload();
                  },
                },
                {
                  label: 'Delete',
                  destructive: true,
                  onPress: () => setTrainingToDelete(menuFor),
                },
              ]
            : []
        }
        onClose={() => setMenuFor(null)}
      />

      <ConfirmDialog
        visible={trainingToDelete !== null}
        title={`Delete ${trainingToDelete?.name || 'this training'}?`}
        message="Its blocks and exercises go with it. Your library and your history stay."
        actions={[
          {
            label: 'Delete',
            destructive: true,
            onPress: async () => {
              if (!trainingToDelete) return;
              await deleteTraining(trainingToDelete.id);
              setTrainingToDelete(null);
              reload();
            },
          },
        ]}
        onCancel={() => setTrainingToDelete(null)}
      />
    </ScrollView>
  );
}

function TrainingCard({
  training,
  exerciseTypes,
  index,
  onMenu,
}: {
  training: Training;
  exerciseTypes: ExerciseTypes;
  index: number;
  onMenu: () => void;
}) {
  const headline = trainingHeadline(training, exerciseTypes);
  const timed = hasTimedWork(training, exerciseTypes);
  const rounds = totalRounds(training);
  const steps = totalSteps(training);
  const meta = [
    `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`,
    `${steps} ${steps === 1 ? 'exercise' : 'exercises'}`,
    formatTrainingWeight(training, exerciseTypes),
  ].filter(Boolean);

  return (
    <Animated.View
      entering={FadeIn
        .duration(motion.enter.duration)
        .delay(Math.min(index, motion.enterStaggerMax) * motion.enterStagger)
        .reduceMotion(ReduceMotion.System)}
      layout={LinearTransition.duration(motion.layout.duration)
        .reduceMotion(ReduceMotion.System)}
    >
    <Card
      style={styles.card}
      onPress={() => router.push({ pathname: '/training/[id]', params: { id: training.id } })}
    >
      <View style={styles.cardTop}>
        <Text style={[t.cardTitle, { color: color.ink, flex: 1 }]} numberOfLines={2}>
          {training.name}
        </Text>
        {/* Conditional on whether any WORK is prescribed in seconds, not on a
            stored kind and not on the headline total — prepare and every rest
            have durations of their own, so the total is non-zero even for a
            circuit that says nothing about how long its exercises take.

            When nothing is timed, no invented number goes in its place: the
            meta line below already says how many exercises and rounds, a
            duration would be a guess, and a dash would read as broken. */}
        {timed ? (
          <Text style={[t.monoValueLarge, { color: color.ink }]}>
            {/* "+" means the total is a lower bound: some steps wait for a tap. */}
            {formatDuration(headline.seconds)}
            {headline.hasUntimed ? " +" : ""}
          </Text>
        ) : (
          <OutlineChip>REPS</OutlineChip>
        )}
        {/* A hairline, not just spacing, so the menu reads as a separate
            action rather than part of the headline (PLAN_ui_fixes.md A4). */}
        <View style={styles.cardTopDivider} />
        <MoreButton
          accessibilityLabel={`Actions for ${training.name || 'this training'}`}
          onPress={onMenu}
        />
      </View>

      <Text style={[t.bodySmall, { color: color.inkFaint, marginTop: 8 }]}>
        {meta.join(' · ')}
      </Text>

      {/* The strip and Start share a row: the strip already describes the
          shape of the session, and the button is the answer to it. Putting
          Start on its own line would push a third card off the first
          screenful for no information gained. */}
      <View style={styles.cardBottom}>
        <View style={{ flex: 1 }}>
          <StructureStrip training={training} exerciseTypes={exerciseTypes} />
        </View>
        <PlayButton
          accessibilityLabel={`Start ${training.name || 'this training'}`}
          disabled={steps === 0}
          onPress={() => startTraining(training)}
        />
      </View>
    </Card>
    </Animated.View>
  );
}

function LastSession({ session }: { session: Session }) {
  return (
    <Animated.View
      style={{ marginTop: space.xl }}
      entering={FadeIn
        .duration(motion.enter.duration)
        .reduceMotion(ReduceMotion.System)}
    >
      <MonoLabel>Last session</MonoLabel>
      <AnimatedPressable
        style={styles.lastSession}
        haptic="tap"
        onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id } })}
      >
        <View style={{ flex: 1 }}>
          <Text style={[t.exerciseRow, { color: color.ink, fontSize: 14 }]} numberOfLines={1}>
            {session.trainingName}
          </Text>
          <Text style={[t.bodySmall, { color: color.inkFaint, marginTop: 4 }]}>
            {formatDayDate(session.startedAt)} · {session.completed ? 'completed' : 'partial'}
          </Text>
        </View>
        <Text style={[t.monoValueLarge, { color: color.inkMuted }]}>
          {formatDuration(session.elapsedSeconds)}
        </Text>
      </AnimatedPressable>
    </Animated.View>
  );
}

/** Handoff § "Empty states": a single dashed create card, nothing else. */
function EmptyState({ onPress }: { onPress: () => void }) {
  return (
    <AnimatedPressable style={styles.empty} haptic="tap" onPress={onPress}>
      <Text style={[t.exerciseRow, { color: color.inkMuted }]}>Create your first training</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: space.xl,
  },
  loading: { paddingVertical: 34, alignItems: 'center' },
  // Same shapes as the library's search and pills — one idiom for "narrow
  // this list down", not two that drift.
  searchWrap: { justifyContent: 'center', marginBottom: space.sm },
  search: {
    height: 40,
    borderRadius: radius.cardTight,
    backgroundColor: color.sunken,
    paddingHorizontal: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: color.ink,
  },
  searchClear: {
    position: 'absolute',
    right: 0,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearGlyph: { color: color.inkGhost, fontSize: 16 },
  pills: { gap: 8, paddingVertical: space.xs },
  card: { padding: 18, marginBottom: space.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTopDivider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: color.hairlineStrong,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: space.m,
  },
  lastSession: {
    marginTop: 12,
    backgroundColor: color.sunken,
    borderRadius: radius.cardTight,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  empty: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.hairlineStrong,
    paddingVertical: 34,
    alignItems: 'center',
  },
});
