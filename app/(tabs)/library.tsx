/**
 * 1e — Exercise library.
 *
 * Filter pills are derived from the tags actually in use rather than a fixed
 * list, so the mock's "GAMBE / BRACCIA" appear because those are the seeded
 * tags — add a "Core" exercise and a Core pill appears.
 */

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AddCircle, FilterPill, MonoLabel, MoreButton, Thumbnail, TypeTag } from '@/components/ui';
import { TYPE_COPY } from '@/domain/exerciseType';
import { deleteExercise, listExercises, listTrainings, usageCounts } from '@/db/repo';
import { joinNames } from '@/domain/format';
import type { Exercise, Training } from '@/domain/types';
import { color, radius, size, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

/**
 * Sort orders offered above the list.
 *
 * `name` is first and is the default because it is what the SQL already
 * returns (`ORDER BY name COLLATE NOCASE`) — the screen should not appear to
 * re-order itself on first paint. `used` is only sortable at all because the
 * counts now arrive in ONE query (`usageCounts`); when they trickled in one
 * `SELECT` per row, sorting by them re-ordered the list under the user's
 * thumb.
 */
const SORTS = [
  { id: 'name', label: 'A–Z' },
  { id: 'recent', label: 'Recent' },
  { id: 'used', label: 'Most used' },
] as const;

type SortId = (typeof SORTS)[number]['id'];

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [usage, setUsage] = useState<Map<string, number>>(new Map());
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Exercise | null>(null);
  // Named, not just counted, in the "Still in use" dialog
  // (`PLAN_ui_fixes.md` B8) — fetched fresh when the bin is pressed rather
  // than reused from `usage`, which only holds a count.
  const [blockingTrainings, setBlockingTrainings] = useState<Training[]>([]);
  const [confirm, setConfirm] = useState<'blocked' | 'delete' | null>(null);
  const [sort, setSort] = useState<SortId>('name');
  const [sorting, setSorting] = useState(false);
  // Never set at the same time as `confirm`: the sheet dismisses before its
  // action runs, so the delete dialog opens onto a screen with no sheet on it.
  const [menuFor, setMenuFor] = useState<Exercise | null>(null);

  const reload = useCallback(() => {
    // Both in flight together, and both applied in the same commit. The old
    // version fetched the list, then fired one COUNT query per exercise — 41
    // round trips for a 40-exercise library, on every focus of the tab.
    Promise.all([listExercises(), usageCounts()]).then(([list, counts]) => {
      setExercises(list);
      setUsage(counts);
    });
  }, []);

  useFocusEffect(reload);

  const askDelete = async (exercise: Exercise) => {
    const all = await listTrainings();
    const blocking = all.filter((tr) =>
      tr.blocks.some((b) => b.steps.some((s) => s.exerciseId === exercise.id)),
    );
    setToDelete(exercise);
    setBlockingTrainings(blocking);
    // Handoff: deleting a used exercise must warn and either block or detach.
    setConfirm(blocking.length > 0 ? 'blocked' : 'delete');
  };

  const tags = useMemo(
    () => [...new Set(exercises.flatMap((e) => e.tags))].sort(),
    [exercises],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = exercises.filter((e) => {
      const matchesTag = !tag || e.tags.includes(tag);
      const matchesQuery = !q || e.name.toLowerCase().includes(q);
      return matchesTag && matchesQuery;
    });

    if (sort === 'name') return matched;
    // `slice()` first: `sort` mutates, and `matched` is derived from
    // `exercises` by `filter` — which returns a fresh array, but only until
    // some future edit here drops the filter for the empty-query case.
    if (sort === 'recent') {
      return matched.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    // Ties fall back to name, so equal-usage rows keep a stable, meaningful
    // order rather than whatever the sort happens to leave behind.
    return matched
      .slice()
      .sort(
        (a, b) =>
          (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) ||
          a.name.localeCompare(b.name),
      );
  }, [exercises, query, tag, sort, usage]);

  const sortLabel = SORTS.find((s) => s.id === sort)?.label ?? '';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.canvas }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: space.xxl,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={[t.screenTitle, { color: color.ink }]}>Library</Text>
        <AddCircle onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: 'new' } })} />
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises"
          placeholderTextColor={color.inkGhost}
          style={[styles.search, query.length > 0 && { paddingRight: 34 }]}
        />
        {query.length > 0 && (
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={10}
            accessibilityLabel="Clear search"
            style={styles.searchClear}
          >
            <Text style={styles.searchClearGlyph}>×</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pills}
      >
        <FilterPill
          label="All"
          count={exercises.length}
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

      {/* Count on the left, sort on the right. The count is what makes the
          filter legible ("3 of 40"), and the sort needed a home that was not
          the header — which already carries the title and the + . */}
      {exercises.length > 0 && (
        <View style={styles.listHeader}>
          <MonoLabel>
            {filtered.length === exercises.length
              ? `${exercises.length} ${exercises.length === 1 ? 'exercise' : 'exercises'}`
              : `${filtered.length} of ${exercises.length}`}
          </MonoLabel>
          <Pressable
            onPress={() => setSorting(true)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Sort order: ${sortLabel}. Change`}
          >
            <MonoLabel tone={color.inkMuted}>{`Sort · ${sortLabel}`}</MonoLabel>
          </Pressable>
        </View>
      )}

      <View style={{ paddingHorizontal: space.gutter }}>
        {exercises.length === 0 ? (
          <Pressable
            style={styles.empty}
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: 'new' } })}
          >
            <Text style={[t.exerciseRow, { color: color.inkMuted }]}>
              Add your first exercise
            </Text>
          </Pressable>
        ) : filtered.length === 0 ? (
          // The library has exercises, the search/filter just matched none —
          // was previously indistinguishable from a blank screen
          // (`PLAN_ui_fixes.md` B3). Same copy as ExercisePicker's version of
          // this same state.
          <Text style={[t.body, { color: color.inkFaint, marginTop: space.xl }]}>
            Nothing matches that.
          </Text>
        ) : (
          filtered.map((exercise) => (
            <ExerciseRow
              key={exercise.id}
              exercise={exercise}
              usedIn={usage.get(exercise.id) ?? 0}
              onMenu={() => setMenuFor(exercise)}
            />
          ))
        )}
      </View>

      <ActionSheet
        visible={sorting}
        title="Sort by"
        actions={SORTS.map((s) => ({
          label: s.id === sort ? `${s.label}  ✓` : s.label,
          onPress: () => setSort(s.id),
        }))}
        onClose={() => setSorting(false)}
      />

      <ActionSheet
        visible={menuFor !== null}
        title={menuFor?.name || 'Untitled exercise'}
        actions={
          menuFor
            ? [
                {
                  label: 'Edit',
                  onPress: () =>
                    router.push({ pathname: '/exercise/[id]', params: { id: menuFor.id } }),
                },
                {
                  label: 'Delete',
                  destructive: true,
                  // Still routed through `askDelete`, which decides between
                  // the "Still in use" refusal and the delete confirmation.
                  onPress: () => void askDelete(menuFor),
                },
              ]
            : []
        }
        onClose={() => setMenuFor(null)}
      />

      <ConfirmDialog
        visible={confirm === 'blocked'}
        title="Still in use"
        message={`This exercise is used by ${joinNames(blockingTrainings.map((tr) => tr.name || 'Untitled'))}. Remove it from ${
          blockingTrainings.length === 1 ? 'that training' : 'those trainings'
        } first.`}
        actions={[]}
        cancelLabel="OK"
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        visible={confirm === 'delete'}
        title="Delete exercise?"
        message={toDelete?.name || 'This exercise'}
        actions={[
          {
            label: 'Delete',
            destructive: true,
            onPress: async () => {
              if (!toDelete) return;
              await deleteExercise(toDelete.id);
              setConfirm(null);
              setToDelete(null);
              reload();
            },
          },
        ]}
        onCancel={() => setConfirm(null)}
      />
    </ScrollView>
  );
}

function ExerciseRow({
  exercise,
  usedIn,
  onMenu,
}: {
  exercise: Exercise;
  usedIn: number;
  onMenu: () => void;
}) {
  // Timing lives on steps, not on the exercise, so the meta line describes the
  // movement and where it is used — not a duration that would be a fiction.
  const meta = [
    ...exercise.tags,
    `${usedIn} ${usedIn === 1 ? 'training' : 'trainings'}`,
  ].filter(Boolean);

  return (
    <Pressable
      style={styles.row}
      onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } })}
    >
      <Thumbnail uri={exercise.mediaUrl} type={exercise.mediaType} size={size.thumbnail} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text
            style={[t.exerciseRow, { color: color.ink, fontSize: 14, flexShrink: 1 }]}
            numberOfLines={2}
          >
            {exercise.name}
          </Text>
          {/* What the exercise is measured in. Dropping one into a circuit
              decides which inputs its step shows, so the row has to say. */}
          <TypeTag label={TYPE_COPY[exercise.type].chips.join(' · ')} />
        </View>
        <Text style={[t.monoValue, { color: color.inkFaint, marginTop: 7 }]}>
          {meta.join('  ·  ')}
        </Text>
      </View>
      <MoreButton
        accessibilityLabel={`Actions for ${exercise.name || 'this exercise'}`}
        onPress={onMenu}
      />
    </Pressable>
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
  searchWrap: { marginHorizontal: space.gutter, justifyContent: 'center' },
  search: {
    height: 40,
    borderRadius: radius.cardTight,
    backgroundColor: color.sunken,
    paddingHorizontal: 14,
    fontFamily: 'Archivo_400Regular',
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
  pills: { gap: 8, paddingHorizontal: space.gutter, paddingVertical: space.m },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.gutter,
    paddingBottom: space.sm,
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
  empty: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.hairlineStrong,
    paddingVertical: 34,
    alignItems: 'center',
  },
});
