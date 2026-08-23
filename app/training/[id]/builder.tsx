/**
 * 1c — the builder. A modal over the training detail.
 *
 * Editing happens on a single in-memory `Training` draft and is written in one
 * transaction on Save; Cancel throws the draft away. That is why the footer
 * total is free — it is `trainingSeconds(draft)`, recomputed on every render,
 * with no separate running tally to keep in step.
 *
 * `id === 'new'` starts an empty draft rather than loading one.
 *
 * REORDERING is a real long-press drag on the row handle — see
 * `components/DraggableList.tsx` for why variable row heights make that more
 * than a fixed-pitch calculation. Dragging *between* blocks is still a
 * follow-up; the model already allows it, since steps are rows with an explicit
 * `position` rather than a JSON blob.
 *
 * Every prompt on this screen is `ConfirmDialog`, not `Alert` — the OS dialog
 * looked like it came from a different application than the screen behind it.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DraggableList } from '@/components/DraggableList';
import { ExercisePicker } from '@/components/ExercisePicker';
import { StepEditSheet, type StepEditContext } from '@/components/StepEditSheet';
import { Card, MiniStepper, MonoLabel, SaveButton, Stepper, TypeTag } from '@/components/ui';
import { getTraining, listExercises, saveTraining } from '@/db/repo';
import {
  blockSeconds,
  formatDuration,
  formatQueueDuration,
  formatTargetReps,
  trainingSeconds,
} from '@/domain/duration';
import { fieldsFor, TYPE_COPY, type ExerciseType } from '@/domain/exerciseType';
import { exerciseTypesOf, type ExerciseTypes } from '@/domain/queue';
import { newBlockId, newStepId, newTrainingId } from '@/domain/id';
import { moveItem } from '@/domain/reorder';
import {
  DEFAULT_PREPARE_SECONDS,
  distanceAt,
  LIMITS,
  NEW_STEP_DEFAULTS,
  reconcileTargets,
  repsAt,
  targetsVary,
  withUniformDistance,
  withUniformReps,
} from '@/domain/types';
import type { Block, Exercise, Step, Training } from '@/domain/types';
import { validateTraining } from '@/domain/validation';
import { color, radius, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

const BLOCK_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function emptyTraining(): Training {
  const now = new Date().toISOString();
  return {
    id: newTrainingId(),
    name: '',
    prepareSeconds: DEFAULT_PREPARE_SECONDS,
    blocks: [
      {
        id: newBlockId(),
        label: 'Block A',
        repeat: 1,
        restBetweenRoundsSeconds: 60,
        steps: [],
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export default function BuilderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const [draft, setDraft] = useState<Training | null>(null);
  const [exercises, setExercises] = useState<Map<string, Exercise>>(new Map());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ blockId: string; stepId: string } | null>(null);
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [blockToDelete, setBlockToDelete] = useState<Block | null>(null);
  const [problemsShown, setProblemsShown] = useState(false);
  // Derived rather than stored: the builder already holds the exercises, and a
  // second copy would be one more thing to keep in step.
  const types = useMemo(() => exerciseTypesOf(exercises.values()), [exercises]);

  useEffect(() => {
    // No kind to choose any more: a training is blocks of steps, and each
    // step's shape comes from its exercise.
    if (id === 'new') setDraft(emptyTraining());
    else getTraining(id).then((t) => setDraft(t ?? emptyTraining()));
    listExercises().then((list) => setExercises(new Map(list.map((e) => [e.id, e]))));
  }, [id]);

  const problems = useMemo(
    () => (draft ? validateTraining(draft, types) : []),
    [draft, types],
  );

  if (!draft) return <View style={{ flex: 1, backgroundColor: color.canvas }} />;

  const patch = (next: Partial<Training>) =>
    setDraft({ ...draft, ...next, updatedAt: new Date().toISOString() });

  const patchBlock = (blockId: string, next: Partial<Block>) =>
    patch({ blocks: draft.blocks.map((b) => (b.id === blockId ? { ...b, ...next } : b)) });

  const patchStep = (blockId: string, stepId: string, next: Step) =>
    patchBlock(blockId, {
      steps: draft.blocks
        .find((b) => b.id === blockId)!
        .steps.map((s) => (s.id === stepId ? next : s)),
    });

  const removeStep = (blockId: string, stepId: string) =>
    patchBlock(blockId, {
      steps: draft.blocks.find((b) => b.id === blockId)!.steps.filter((s) => s.id !== stepId),
    });

  /** Drag-and-drop reorder. A move, not a swap — see `domain/reorder.ts`. */
  const reorderStep = (blockId: string, from: number, to: number) => {
    const block = draft.blocks.find((b) => b.id === blockId)!;
    patchBlock(blockId, { steps: moveItem(block.steps, from, to) });
  };

  const addBlock = () =>
    patch({
      blocks: [
        ...draft.blocks,
        {
          id: newBlockId(),
          label: `Block ${BLOCK_LABELS[draft.blocks.length] ?? draft.blocks.length + 1}`,
          repeat: 1,
          restBetweenRoundsSeconds: 60,
          steps: [],
        },
      ],
    });

  /** A new step for `exercise`, at the shared defaults. */
  const newStepFor = (exercise: Exercise): Step => ({
    id: newStepId(),
    exerciseId: exercise.id,
    // Weight is prefilled from the library entity, then owned by the row. How
    // the step is MEASURED is deliberately not copied: it is read live from
    // the exercise, so reclassifying a movement updates every step that uses
    // it rather than freezing today's answer into each one.
    //
    // An exercise carries no timing, so the durations come from the shared
    // defaults and are tuned in place with the row's −/+ fields.
    workSeconds: NEW_STEP_DEFAULTS.workSeconds,
    restAfterSeconds: NEW_STEP_DEFAULTS.restAfterSeconds,
    weightKg: exercise.defaultWeightKg,
    weightCount: exercise.defaultWeightKg ? (exercise.defaultWeightCount ?? 1) : undefined,
  });

  /**
   * Append several exercises to a block in one patch.
   *
   * Takes a LIST rather than being called once per exercise, and that is a
   * correctness requirement rather than a convenience: `patchBlock` rebuilds
   * from the `draft` closed over by this render, so a loop of single-exercise
   * calls would apply every patch to the same stale draft and only the last
   * would survive. One call, one patch, one new draft.
   */
  const addExercises = (blockId: string, chosen: Exercise[]) => {
    const block = draft.blocks.find((b) => b.id === blockId)!;
    patchBlock(blockId, { steps: [...block.steps, ...chosen.map(newStepFor)] });
  };

  const save = async () => {
    if (problems.length > 0) {
      setProblemsShown(true);
      return;
    }
    await saveTraining({ ...draft, updatedAt: new Date().toISOString() });
    router.back();
  };

  const editContext: StepEditContext | null = (() => {
    if (!editing) return null;
    const block = draft.blocks.find((b) => b.id === editing.blockId);
    const index = block?.steps.findIndex((s) => s.id === editing.stepId) ?? -1;
    if (!block || index < 0) return null;
    const step = block.steps[index]!;
    const exercise = exercises.get(step.exerciseId);
    return {
      step,
      exerciseName: exercise?.name ?? 'Exercise',
      type: exercise?.type ?? 'weightReps',
      equipment: exercise?.equipment,
      blockLabel: block.label,
      position: index + 1,
      total: block.steps.length,
      // The sheet needs the round count to offer a per-round prescription at
      // all — and to know how many rows to draw when it does.
      rounds: Math.max(1, block.repeat),
      restIsDead: index === block.steps.length - 1,
    };
  })();

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <MonoLabel tone={color.inkMuted}>Cancel</MonoLabel>
        </Pressable>
        <Text style={[t.exerciseRow, { color: color.ink, fontSize: 14 }]}>
          {id === 'new' ? 'New training' : 'Edit training'}
        </Text>
        {/* Stays tappable even when `problems` is non-empty — pressing it is
            what surfaces the "Not ready to save" dialog below. `dim` (not
            `disabled`) matches the old greyed-out label without blocking
            that tap. */}
        <SaveButton onPress={save} accessibilityLabel="Save training" dim={problems.length > 0} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: space.gutter,
          paddingTop: space.l,
          paddingBottom: 120,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Name + prepare */}
        <Card style={{ padding: 16 }}>
          <TextInput
            value={draft.name}
            onChangeText={(name) => patch({ name })}
            placeholder="Training name"
            placeholderTextColor={color.inkGhost}
            style={styles.nameInput}
          />
          {/* Prepare is always offered: any training can be run hands-free,
              and the countdown before the first step is the one number that
              belongs to the training rather than to any exercise in it. */}
          <View style={styles.prepareRow}>
            <MonoLabel tone={color.inkMuted}>Prepare</MonoLabel>
            <Stepper
              value={draft.prepareSeconds}
              step={LIMITS.secondsIncrement}
              min={0}
              onChange={(prepareSeconds) => patch({ prepareSeconds })}
              format={(v) => `${v}s`}
            />
          </View>
        </Card>

        {draft.blocks.map((block) => (
          <BlockCard
            key={block.id}
            block={block}
            exerciseTypes={types}
            exercises={exercises}
            collapsed={collapsed.has(block.id)}
            canRemove={draft.blocks.length > 1}
            onToggle={() =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(block.id)) next.delete(block.id);
                else next.add(block.id);
                return next;
              })
            }
            // Changing the round count reconciles every per-round
            // prescription in the block on the spot. Leaving them to fail
            // validation instead would surface the error on Save, far from
            // the stepper that caused it (`PLAN_hevy_integration.md` R7).
            onRepeat={(repeat) =>
              patchBlock(block.id, {
                repeat,
                steps: block.steps.map((s) => reconcileTargets(s, repeat)),
              })
            }
            onRoundRest={(restBetweenRoundsSeconds) =>
              patchBlock(block.id, { restBetweenRoundsSeconds })
            }
            onRemoveBlock={() => setBlockToDelete(block)}
            onEditStep={(stepId) => setEditing({ blockId: block.id, stepId })}
            onReorderStep={(from, to) => reorderStep(block.id, from, to)}
            onPatchStep={(step) => patchStep(block.id, step.id, step)}
            onAdd={() => setPickingFor(block.id)}
          />
        ))}

        <Pressable style={styles.addBlock} onPress={addBlock}>
          <Text style={[t.exerciseRow, { color: color.inkMuted }]}>+ Add block</Text>
        </Pressable>
      </ScrollView>

      {/* Live total — both halves sit together on the right, so the eye lands
          on one object rather than tracking across an empty bar. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        {/* One total, always — and `formatQueueDuration` appends the "+" when
            any step is tap-gated, which is most of them in a strength
            circuit. A number the app cannot promise is never printed bare. */}
        <MonoLabel tone={color.inkMuted}>Total workout</MonoLabel>
        <Text style={[t.monoValueLarge, { color: color.ink, fontSize: 15 }]}>
          {formatQueueDuration(trainingSeconds(draft, types))}
        </Text>
      </View>

      <StepEditSheet
        context={editContext}
        onChange={(step) => editing && patchStep(editing.blockId, editing.stepId, step)}
        onRemove={() => {
          if (editing) removeStep(editing.blockId, editing.stepId);
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />

      <ExercisePicker
        visible={pickingFor !== null}
        onPick={(chosen) => pickingFor && addExercises(pickingFor, chosen)}
        onClose={() => setPickingFor(null)}
      />

      <ConfirmDialog
        visible={blockToDelete !== null}
        title={`Delete ${blockToDelete?.label ?? 'block'}?`}
        message={
          blockToDelete && blockToDelete.steps.length > 0
            ? `Its ${blockToDelete.steps.length} ${
                blockToDelete.steps.length === 1 ? 'exercise' : 'exercises'
              } will be removed from this training. They stay in your library.`
            : 'This block is empty.'
        }
        actions={[
          {
            label: 'Delete',
            destructive: true,
            onPress: () => {
              patch({ blocks: draft.blocks.filter((b) => b.id !== blockToDelete!.id) });
              setBlockToDelete(null);
            },
          },
        ]}
        onCancel={() => setBlockToDelete(null)}
      />

      <ConfirmDialog
        visible={problemsShown}
        title="Not ready to save"
        message={problems.join('\n')}
        actions={[]}
        cancelLabel="OK"
        onCancel={() => setProblemsShown(false)}
      />
    </View>
  );
}

function BlockCard({
  block,
  exerciseTypes,
  exercises,
  collapsed,
  canRemove,
  onToggle,
  onRepeat,
  onRoundRest,
  onRemoveBlock,
  onEditStep,
  onReorderStep,
  onPatchStep,
  onAdd,
}: {
  block: Block;
  exerciseTypes: ExerciseTypes;
  exercises: Map<string, Exercise>;
  collapsed: boolean;
  canRemove: boolean;
  onToggle: () => void;
  onRepeat: (v: number) => void;
  onRoundRest: (v: number) => void;
  onRemoveBlock: () => void;
  onEditStep: (stepId: string) => void;
  onReorderStep: (from: number, to: number) => void;
  onPatchStep: (step: Step) => void;
  onAdd: () => void;
}) {
  return (
    <View style={styles.blockCard}>
      <View style={styles.blockHeader}>
        {/* 16px box, hitSlop raised so the effective target clears 44px
            (`PLAN_ui_fixes.md` B6) — sizes stay as drawn, only the tappable
            area around them grows. */}
        <Pressable onPress={onToggle} hitSlop={16} style={styles.caret}>
          <Text style={{ color: color.inkMuted, fontSize: 12 }}>{collapsed ? '\u203A' : '\u2304'}</Text>
        </Pressable>
        <MonoLabel tone={color.ink} style={{ flex: 1 }}>
          {block.label}
        </MonoLabel>
        <Stepper
          value={block.repeat}
          step={LIMITS.repeatIncrement}
          min={LIMITS.minRepeat}
          max={20}
          onChange={onRepeat}
          format={(v) => `\u00D7${v}`}
        />
        {/* Delete is a single \u00D7 rather than an overflow menu: with one item
            behind it, the menu was a tap that only ever led to one place. */}
        {canRemove && (
          <Pressable onPress={onRemoveBlock} hitSlop={12} style={styles.blockClose}>
            <Text style={styles.blockCloseGlyph}>×</Text>
          </Pressable>
        )}
      </View>

      {collapsed ? (
        <Pressable style={styles.collapsedRow} onPress={onToggle}>
          <Text style={[t.monoValue, { color: color.inkFaint }]}>
            {block.steps.length} {block.steps.length === 1 ? 'exercise' : 'exercises'} · ×
            {block.repeat} · {formatQueueDuration(blockSeconds(block, exerciseTypes))}
          </Text>
        </Pressable>
      ) : (
        <>
          <DraggableList
            items={block.steps}
            keyExtractor={(step) => step.id}
            onReorder={onReorderStep}
            renderItem={(step, i, handle, dragging) => (
              <StepRow
                step={step}
                type={exerciseTypes.get(step.exerciseId)}
                isLast={i === block.steps.length - 1}
                name={exercises.get(step.exerciseId)?.name ?? 'Exercise'}
                handle={handle}
                dragging={dragging}
                onEdit={() => onEditStep(step.id)}
                onPatch={onPatchStep}
              />
            )}
          />

          {block.steps.length === 0 && (
            <Text style={[t.body, styles.emptyBlock]}>No exercises in this block yet.</Text>
          )}

          <Pressable style={styles.addExercise} onPress={onAdd}>
            <Text style={[t.exerciseRow, { color: color.inkMuted }]}>
              + Add exercise from library
            </Text>
          </Pressable>

          {block.repeat > 1 && (
            <View style={styles.roundRest}>
              <MonoLabel tone={color.inkMuted}>Rest between rounds</MonoLabel>
              <Stepper
                value={block.restBetweenRoundsSeconds}
                step={LIMITS.secondsIncrement}
                min={0}
                onChange={onRoundRest}
                format={(v) => `${v}s`}
              />
            </View>
          )}
        </>
      )}
    </View>
  );
}

function StepRow({
  step,
  type,
  isLast,
  name,
  handle,
  dragging,
  onEdit,
  onPatch,
}: {
  step: Step;
  type: ExerciseType | undefined;
  isLast: boolean;
  name: string;
  handle: React.ReactNode;
  dragging: boolean;
  onEdit: () => void;
  onPatch: (step: Step) => void;
}) {
  // Which fields this row shows is the EXERCISE's business now. One table,
  // read here and in the edit sheet, so a plank is never asked for reps and a
  // curl is never asked how long it lasted.
  const resolved = type ?? 'weightReps';
  const fields = fieldsFor(resolved);

  return (
    <View style={[styles.stepRow, dragging && styles.stepRowDragging]}>
      <View style={styles.stepTop}>
        {handle}
        <Pressable style={styles.stepNameRow} onPress={onEdit}>
          <Text style={[t.exerciseRow, { color: color.ink, flexShrink: 1 }]} numberOfLines={2}>
            {name}
          </Text>
          <TypeTag label={TYPE_COPY[resolved].chips.join(' · ')} />
        </Pressable>
      </View>

      <View style={styles.miniFields}>
        {/* Only the fields this exercise actually uses. Stored values for the
            others stay untouched underneath, which is what makes changing an
            exercise's type back and forth lossless. Rest is always shown: it
            belongs to the step, not to how the step is measured. */}
        {/* The base, not `secondsAt(step, 1)` — reading the resolved value
            while writing the base makes the stepper look frozen on a step with
            a round-1 override. Same convention as the sheet. */}
        {fields.time && (
        <MiniStepper
          label="Time"
          value={step.workSeconds}
          step={LIMITS.secondsIncrement}
          min={LIMITS.minWorkSeconds}
          onChange={(workSeconds) => onPatch({ ...step, workSeconds })}
          format={(v) => `${v}s`}
        />
        )}
        {/* The last step of a round runs straight into the round rest, so its
            rest never plays. Shown as — rather than an editable zero. */}
        <MiniStepper
          label="Rest"
          value={step.restAfterSeconds}
          step={LIMITS.secondsIncrement}
          min={LIMITS.minRestSeconds}
          disabled={isLast}
          onChange={(restAfterSeconds) => onPatch({ ...step, restAfterSeconds })}
          format={(v) => `${v}s`}
        />
        {fields.reps && (
        <MiniStepper
          label="Reps"
          // A per-round prescription cannot be edited by one stepper, so the
          // row shows it and sends you to the sheet. `disabled` here means
          // "not editable HERE", which is exactly what the dash-style
          // read-only rendering already communicates for a dead rest.
          disabled={targetsVary(step)}
          disabledValue={formatTargetReps(step) ?? '—'}
          value={repsAt(step, 1) ?? 0}
          step={LIMITS.repsIncrement}
          min={0}
          max={99}
          onChange={(v) => onPatch(withUniformReps(step, v === 0 ? undefined : v))}
          format={(v) => (v === 0 ? '—' : String(v))}
        />
        )}
        {fields.distance && (
        <MiniStepper
          label="Km"
          value={distanceAt(step, 1) ?? 0}
          step={0.05}
          min={0}
          max={100}
          onChange={(v) => onPatch(withUniformDistance(step, v === 0 ? undefined : v))}
          format={(v) => (v === 0 ? '—' : String(Number(v.toFixed(2))))}
        />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.gutter,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.divider,
  },
  nameInput: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 17,
    color: color.ink,
    padding: 0,
  },
  typeRow: {
    marginTop: space.l,
    paddingTop: space.m,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  prepareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.l,
    paddingTop: space.m,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  blockCard: {
    marginTop: space.sm,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    borderRadius: radius.card,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: color.blockHeader,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  caret: { width: 16 },
  // Soft-red, rounded and bordered like every other delete control
  // (`PLAN_ui_fixes.md` UI pass) — this used to be a bare 24px glyph with no
  // visible shape at all.
  blockClose: {
    width: 28,
    height: 28,
    borderRadius: radius.fieldTight,
    borderWidth: 1,
    borderColor: color.softRedBorder,
    backgroundColor: color.softRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockCloseGlyph: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 16,
    lineHeight: 19,
    color: color.softRedIcon,
  },
  collapsedRow: { paddingHorizontal: 14, paddingVertical: 16 },
  stepRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: color.divider,
    backgroundColor: color.surface,
  },
  stepRowDragging: {
    backgroundColor: color.blockHeader,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
  },
  stepTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNameRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  miniFields: { flexDirection: 'row', gap: 8, marginTop: 12, marginLeft: 26 },
  emptyBlock: {
    color: color.inkGhost,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  addExercise: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  roundRest: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: color.blockHeader,
  },
  addBlock: {
    marginTop: space.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.hairlineStrong,
    borderRadius: radius.card,
    paddingVertical: 22,
    alignItems: 'center',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: space.gutter,
    paddingTop: 14,
    backgroundColor: color.canvas,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
});
