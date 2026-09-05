/**
 * 1b — Training detail (pre-start).
 *
 * Read-only. Note the third exercise row in the mock reads "×10 reps · 45s work"
 * with no rest segment — the last step of a round has no trailing rest, which is
 * the same rule the queue implements and independent confirmation of the 10:55
 * total. That row is generated here, not special-cased.
 */

import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  BinButton,
  Card,
  MonoLabel,
  OutlineChip,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
} from '@/components/ui';
import { deleteTraining, getTraining, listExercises } from '@/db/repo';
import {
  formatDuration,
  formatQueueDuration,
  hasTimedWork,
  stepMetaLine,
  totalRounds,
  trainingHeadline,
} from '@/domain/duration';
import { exerciseTypesOf, type ExerciseTypes } from '@/domain/queue';
import type { Block, Exercise, Training } from '@/domain/types';
import { formatTrainingWeight } from '@/domain/weight';
import { color, motion, radius, size, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

export default function TrainingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [training, setTraining] = useState<Training | null>(null);
  const [exercises, setExercises] = useState<Map<string, Exercise>>(new Map());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const types = useMemo(() => exerciseTypesOf(exercises.values()), [exercises]);

  /**
   * Both reads land together. Separately, the training almost always arrived
   * first — a keyed lookup against a library scan — and this screen would
   * render a full training against an empty type map for a frame: every step
   * untimed, so the chip flashed REPS and the total flashed a lower bound
   * before correcting itself.
   */
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const [loaded, list] = await Promise.all([getTraining(id), listExercises()]);
        if (cancelled) return;
        setExercises(new Map(list.map((e) => [e.id, e])));
        setTraining(loaded);
      })();
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

  if (!training) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={color.inkGhost} />
      </View>
    );
  }

  const rounds = totalRounds(training);
  const weight = formatTrainingWeight(training, types);
  const headline = trainingHeadline(training, types);
  /**
   * Prepare only means something if there is a clock to prepare for. A
   * training of nothing but rep-counted exercises has no first work interval
   * to count into, so the stored value is real but inert and showing it would
   * promise a countdown that never runs.
   *
   * Asked of the WORK cues specifically — see `hasTimedWork`. Testing the
   * headline total instead was the same sentence and a different question,
   * because prepare and every rest have durations of their own.
   */
  const timed = hasTimedWork(training, types);

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: space.gutter,
          // Clear the sticky button.
          paddingBottom: size.primaryButton + insets.bottom + space.xxl * 2,
        }}
      >
        <ScreenHeader
          onBack={() => router.back()}
          action={
            // A training you opened is exactly where you decide to bin it
            // (`PLAN_ui_fixes.md` A4) — Edit stays a text action, the bin
            // sits beside it rather than replacing it.
            <View style={styles.headerActions}>
              <Text
                onPress={() =>
                  router.push({ pathname: '/training/[id]/builder', params: { id: training.id } })
                }
                style={[t.exerciseRow, { color: color.accent, fontSize: 14 }]}
              >
                Edit
              </Text>
              <BinButton
                accessibilityLabel={`Delete ${training.name || 'this training'}`}
                onPress={() => setConfirmingDelete(true)}
              />
            </View>
          }
        />

        <Text style={[t.detailTitle, { color: color.ink, marginTop: space.l }]}>
          {training.name}
        </Text>

        <View style={styles.chips}>
          {/* Conditional on the VALUE. Nothing prescribed in seconds means no
              total to quote, and no invented one goes in its place. */}
          {timed ? (
            <OutlineChip>{formatQueueDuration(headline)} total</OutlineChip>
          ) : (
            <OutlineChip>REPS</OutlineChip>
          )}
          <OutlineChip>
            {rounds} {rounds === 1 ? 'round' : 'rounds'}
          </OutlineChip>
          {weight && <OutlineChip>{weight}</OutlineChip>}
        </View>

        {timed && training.prepareSeconds > 0 && (
          <View style={styles.prepare}>
            <MonoLabel tone={color.inkMuted}>Prepare</MonoLabel>
            <Text style={[t.monoValueLarge, { color: color.ink }]}>
              {formatDuration(training.prepareSeconds)}
            </Text>
          </View>
        )}

        {training.blocks.map((block, index) => (
          <BlockCard
            key={block.id}
            block={block}
            exercises={exercises}
            types={types}
            index={index}
            nextBlockLabel={training.blocks[index + 1]?.label}
          />
        ))}
      </ScrollView>

      {/*
        Two ways in, and the order is the point. The player is primary because
        it is what this app is for: the phone goes on the floor, it counts you
        through the circuit and talks, and you do not touch it. It runs every
        exercise type — timed cues count down, the rest wait for DONE.

        The logger is the same session with a keyboard: it records every set,
        weight and time, and that costs a screen you have to look at between
        exercises. Offered second, and always — wanting to record what you
        lifted is not a property of the training's shape.
      */}
      <View style={[styles.sticky, { paddingBottom: insets.bottom + 12 }]}>
        <PrimaryButton
          label="Start training"
          onPress={() =>
            router.push({ pathname: '/player/[trainingId]', params: { trainingId: training.id } })
          }
        />
        <SecondaryButton
          label="Log sets instead"
          style={{ marginTop: 8 }}
          onPress={() =>
            router.push({ pathname: '/reps/[trainingId]', params: { trainingId: training.id } })
          }
        />
      </View>

      <ConfirmDialog
        visible={confirmingDelete}
        title={`Delete ${training.name || 'this training'}?`}
        message="Its blocks and exercises go with it. Your library and your history stay."
        actions={[
          {
            label: 'Delete',
            destructive: true,
            onPress: async () => {
              await deleteTraining(training.id);
              setConfirmingDelete(false);
              router.back();
            },
          },
        ]}
        onCancel={() => setConfirmingDelete(false)}
      />
    </View>
  );
}

function BlockCard({
  block,
  exercises,
  types,
  index,
  nextBlockLabel,
}: {
  block: Block;
  exercises: Map<string, Exercise>;
  /** Read per step: within one block, each exercise brings its own units. */
  types: ExerciseTypes;
  index: number;
  nextBlockLabel?: string;
}) {
  return (
    <Animated.View
      entering={FadeIn
        .duration(motion.enter.duration)
        .delay(Math.min(index, motion.enterStaggerMax) * motion.enterStagger)
        .reduceMotion(ReduceMotion.System)}
    >
    <Card style={{ marginTop: space.sm, overflow: 'hidden' }}>
      <View style={styles.blockHeader}>
        <MonoLabel tone={color.ink}>{block.label}</MonoLabel>
        <Text style={[t.monoValue, { color: color.inkMuted }]}>
          ×{block.repeat} {block.repeat === 1 ? 'round' : 'rounds'}
        </Text>
      </View>

      {block.steps.map((step, i) => {
        const isLast = i === block.steps.length - 1;
        return (
          <View key={step.id} style={[styles.stepRow, i > 0 && styles.stepDivider]}>
            <Text style={[t.monoValue, styles.stepIndex]}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[t.exerciseRow, { color: color.ink, fontSize: 14 }]}>
                {exercises.get(step.exerciseId)?.name ?? 'Unknown exercise'}
              </Text>
              <Text style={[t.monoValue, { color: color.inkFaint, marginTop: 7 }]}>
                {stepMetaLine(step, types.get(step.exerciseId), { isLast })}
              </Text>
            </View>
          </View>
        );
      })}

      {/* Round rest is a property of the block, not of what its steps are
          measured in: it plays between rounds of a rep block exactly as it
          does between rounds of a circuit. */}
      {block.repeat > 1 && block.restBetweenRoundsSeconds > 0 && (
        <View style={styles.blockFooter}>
          <MonoLabel tone={color.inkMuted}>Rest between rounds</MonoLabel>
          <Text style={[t.monoValueLarge, { color: color.ink }]}>
            {formatDuration(block.restBetweenRoundsSeconds)}
          </Text>
        </View>
      )}

      {nextBlockLabel && (block.restAfterBlockSeconds ?? 0) > 0 && (
        <View style={styles.blockFooter}>
          <MonoLabel tone={color.inkMuted}>Rest before {nextBlockLabel}</MonoLabel>
          <Text style={[t.monoValueLarge, { color: color.ink }]}>
            {formatDuration(block.restAfterBlockSeconds ?? 0)}
          </Text>
        </View>
      )}
    </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: color.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.m },
  prepare: {
    marginTop: space.xl,
    backgroundColor: color.sunken,
    borderRadius: radius.cardTight,
    paddingHorizontal: 16,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 46,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
  },
  stepRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  stepDivider: { borderTopWidth: 1, borderTopColor: color.divider },
  stepIndex: { color: color.inkGhostest, width: 14, marginTop: 2 },
  blockFooter: {
    backgroundColor: color.sunken,
    paddingHorizontal: 16,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.gutter,
    paddingTop: 12,
    backgroundColor: color.canvas,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
});
