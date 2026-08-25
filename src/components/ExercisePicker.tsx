/**
 * Picking exercises from the library, for "+ Add exercise from library" in the
 * builder.
 *
 * A modal rather than a route into the library tab: the builder is itself a
 * modal over the detail screen, and pushing a third navigation layer to choose
 * one row — then unwinding it — loses the builder's unsaved state on any
 * mis-swipe. Same list rows as 1e so it reads as the library, not a new screen.
 *
 * MULTI-SELECT since 2026-08-17. Building an eight-exercise block previously
 * cost eight open-pick-close cycles, each one re-fetching the library and
 * re-typing the search. Rows now toggle and `onPick` fires ONCE with everything
 * chosen — which is also the only safe shape: the builder's `addExercise` reads
 * a closed-over draft, so calling it in a loop would apply every patch to the
 * same stale value and land only the last pick.
 *
 * Selection is ordered by tap, not by list position, and that is deliberate:
 * the steps arrive in the block in the order you chose them, which is usually
 * the order you intend to perform them in.
 */

import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { listExercises } from '@/db/repo';
import type { Exercise } from '@/domain/types';
import { color, radius, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';
import { TYPE_COPY } from '@/domain/exerciseType';
import { AnimatedPressable, MonoLabel, PrimaryButton, Thumbnail, TypeTag } from './ui';

export function ExercisePicker({
  visible,
  onPick,
  onClose,
}: {
  visible: boolean;
  onPick: (exercises: Exercise[]) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [query, setQuery] = useState('');
  /** Ids in tap order. An array rather than a Set so the order survives. */
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    listExercises().then(setExercises);
    // Reopening starts clean. Carrying a previous selection over would mean a
    // second block silently inheriting the first block's picks.
    setPicked([]);
    setQuery('');
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return exercises;
    return exercises.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [exercises, query]);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const confirm = () => {
    const byId = new Map(exercises.map((e) => [e.id, e]));
    const chosen = picked
      .map((id) => byId.get(id))
      .filter((e): e is Exercise => e != null);
    if (chosen.length > 0) onPick(chosen);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: color.canvas, paddingTop: insets.top + 12 }}>
        <View style={styles.header}>
          <Text style={[t.detailTitle, { color: color.ink }]}>Add exercises</Text>
          <AnimatedPressable onPress={onClose} hitSlop={12} haptic={false} toOpacity={0.5}>
            <MonoLabel tone={color.inkMuted}>Cancel</MonoLabel>
          </AnimatedPressable>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises"
          placeholderTextColor={color.inkGhost}
          style={styles.search}
        />

        <ScrollView
          contentContainerStyle={{ padding: space.gutter, paddingTop: 0, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          {filtered.length === 0 && (
            <Text style={[t.body, { color: color.inkFaint, marginTop: space.xl }]}>
              {exercises.length === 0
                ? 'Your library is empty. Add an exercise there first.'
                : 'Nothing matches that.'}
            </Text>
          )}

          {filtered.map((exercise) => {
            const order = picked.indexOf(exercise.id);
            const selected = order >= 0;
            return (
              <AnimatedPressable
                key={exercise.id}
                style={[styles.row, selected && styles.rowSelected]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={exercise.name}
                haptic={false}
                toScale={0.98}
                toOpacity={0.85}
                onPress={() => toggle(exercise.id)}
              >
                <Thumbnail uri={exercise.mediaUrl} type={exercise.mediaType} size={52} />
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text
                      style={[t.exerciseRow, { color: color.ink, fontSize: 14, flexShrink: 1 }]}
                      numberOfLines={2}
                    >
                      {exercise.name}
                    </Text>
                    {/* The picker never said an exercise was rep-counted, so
                        dropping one into a timed training silently produced a
                        tap-gated step (`PLAN_ui_fixes.md` B5). */}
                    {/* What this exercise is measured in. The picker never
                        said, so dropping a duration exercise into a circuit
                        used to silently produce a tap-gated step with no
                        explanation. */}
                    <TypeTag label={TYPE_COPY[exercise.type].chips.join(' · ')} />
                  </View>
                  {exercise.tags.length > 0 && (
                    <Text style={[t.monoValue, { color: color.inkFaint, marginTop: 6 }]}>
                      {exercise.tags.join('  ·  ')}
                    </Text>
                  )}
                </View>

                {/* The badge carries the tap ORDER, not just a tick: with
                    multi-select the order is what decides the order of the
                    steps, so it has to be visible while choosing. */}
                <View style={[styles.check, selected && styles.checkOn]}>
                  {selected && <Text style={styles.checkLabel}>{order + 1}</Text>}
                </View>
              </AnimatedPressable>
            );
          })}
        </ScrollView>

        {/* Always present, disabled at zero — a footer that appears on the
            first tap would shift the list under the finger that made it. */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <PrimaryButton
            label={picked.length === 0 ? 'Add' : `Add ${picked.length}`}
            disabled={picked.length === 0}
            onPress={confirm}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.gutter,
    marginBottom: space.l,
  },
  search: {
    height: 40,
    marginHorizontal: space.gutter,
    marginBottom: space.m,
    borderRadius: radius.cardTight,
    backgroundColor: color.sunken,
    paddingHorizontal: 14,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: color.ink,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: color.surface,
    borderRadius: radius.cardTight,
    borderWidth: 1,
    borderColor: color.hairline,
    padding: 12,
    marginBottom: 10,
  },
  rowSelected: { borderColor: color.inkStrong, backgroundColor: color.blockHeader },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: color.inkStrong, borderColor: color.inkStrong },
  checkLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: color.darkInk,
  },
  footer: {
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
