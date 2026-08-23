/**
 * 1d — the single-exercise edit sheet, kept from the rejected builder option.
 *
 * A bottom sheet over the builder: exercise name, its position in the block,
 * then one stepper row per editable value, and Remove / Done.
 *
 * DEVIATION FROM THE MOCK, deliberate: the mock shows three rows (Work, Rest
 * after, Target reps) because weight was not in the data model when it was
 * drawn. Weight is now per step with a count (§ 1.2 of the build plan), and the
 * sheet is the only surface that can edit it — the inline mini-fields in 1c stay
 * Work/Rest/Reps as designed. So there are five rows here, in the same visual
 * language as the three.
 */

import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  distanceAt,
  LIMITS,
  repsAt,
  targetsVary,
  withRepsAt,
  withUniformDistance,
  withUniformReps,
  type Step,
} from '@/domain/types';
import { fieldsFor, TYPE_COPY, type ExerciseType } from '@/domain/exerciseType';
import { color, radius, shadow, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';
import { MonoLabel, PrimaryButton, SecondaryButton, Stepper, TypeTag } from './ui';

export interface StepEditContext {
  step: Step;
  exerciseName: string;
  blockLabel: string;
  position: number;
  total: number;
  /** The last step of a round never plays its rest, so the row is disabled. */
  restIsDead: boolean;
  /**
   * The owning block's round count. Per-round rep targets are only offered
   * above 1 — "vary by round" across a single round is not a choice, it is
   * the same number with extra steps.
   */
  rounds: number;
  /**
   * What the owning exercise is measured in. Decides which rows this sheet
   * shows, read from the same `fieldsFor` table the builder row uses so the
   * two cannot disagree about one step.
   */
  type: ExerciseType;
}

export function StepEditSheet({
  context,
  onChange,
  onRemove,
  onClose,
}: {
  context: StepEditContext | null;
  onChange: (next: Step) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!context) return null;

  const { step } = context;
  const set = (patch: Partial<Step>) => onChange({ ...step, ...patch });
  // Same table `builder.tsx`'s StepRow reads.
  const fields = fieldsFor(context.type);
  const varies = targetsVary(step);
  const rounds = Array.from({ length: Math.max(1, context.rounds) }, (_, i) => i + 1);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.l }]}>
        <View style={styles.grabber} />

        <ScrollView bounces={false}>
          <Text style={[t.cardTitle, { color: color.ink, fontSize: 15 }]}>
            {context.exerciseName}
          </Text>
          <Text style={[t.body, { color: color.inkFaint, fontSize: 11.5, marginTop: 4 }]}>
            {context.blockLabel} · exercise {context.position} of {context.total}
          </Text>

          {/* What this exercise is measured in. Read-only here: it belongs to
              the library entity, and changing it from inside one training
              would silently reshape every other training using it. */}
          <View style={styles.row}>
            <MonoLabel tone={color.inkMuted} style={{ flex: 1 }}>
              Measured in
            </MonoLabel>
            <TypeTag label={TYPE_COPY[context.type].chips.join(' · ')} />
          </View>

          {/* Reads `step.workSeconds`, not `secondsAt(step, 1)`. The two differ
              on a step carrying a round-1 override, and reading the resolved
              value while writing the base made the stepper look frozen: every
              tap moved a number the display was not showing. The Weight row
              below has always read the base for the same reason. */}
          {fields.time && (
          <Row label="Time">
            <Stepper
              large
              value={step.workSeconds}
              step={LIMITS.secondsIncrement}
              min={LIMITS.minWorkSeconds}
              onChange={(v) => set({ workSeconds: v })}
              format={(v) => `${v}s`}
            />
          </Row>
          )}

          {/* Distance is the one field nothing in the app can measure — there
              is no GPS here and there is not going to be. It is a target you
              set and a number you type into the logger afterwards, which is
              why it lives on the prescription rather than being derived. */}
          {fields.distance && (
            <Row label="Distance" hint="you enter what you actually covered when you log it">
              <Stepper
                large
                value={distanceAt(step, 1) ?? 0}
                step={0.05}
                min={0}
                max={100}
                onChange={(v) => onChange(withUniformDistance(step, v === 0 ? undefined : v))}
                format={(v) => (v === 0 ? '—' : `${Number(v.toFixed(2))} km`)}
              />
            </Row>
          )}

          <Row
            label="Rest after"
            hint={context.restIsDead ? 'not played — runs into the round rest' : undefined}
          >
            <Stepper
              large
              value={step.restAfterSeconds}
              step={LIMITS.secondsIncrement}
              min={LIMITS.minRestSeconds}
              onChange={(v) => set({ restAfterSeconds: v })}
              format={(v) => `${v}s`}
            />
          </Row>

          {/* Target reps — one number, or one per round.
              This sheet is where a per-round prescription is authored,
              because the builder row has three mini-steppers across a phone
              width and no room for a fourth, let alone n of them. */}
          {fields.reps && !varies && (
            <Row
              label="Target reps"
              hint={
                context.rounds > 1 ? 'the same in every round' : undefined
              }
            >
              <Stepper
                large
                value={repsAt(step, 1) ?? 0}
                step={LIMITS.repsIncrement}
                min={0}
                onChange={(v) => onChange(withUniformReps(step, v === 0 ? undefined : v))}
                format={(v) => (v === 0 ? '—' : String(v))}
              />
            </Row>
          )}

          {fields.reps &&
            varies &&
            rounds.map((round) => (
              <Row key={round} label={`Round ${round}`}>
                <Stepper
                  large
                  value={repsAt(step, round) ?? 0}
                  step={LIMITS.repsIncrement}
                  min={0}
                  onChange={(v) => onChange(withRepsAt(step, round, v, context.rounds))}
                  format={(v) => (v === 0 ? '—' : String(v))}
                />
              </Row>
            ))}

          {/* The toggle between the two. Collapsing keeps ROUND ONE's value
              rather than asking which to keep — it is the number the user
              started from, and the one the summary line led with. */}
          {fields.reps && context.rounds > 1 && (
            <Pressable
              onPress={() =>
                onChange(
                  varies
                    ? withUniformReps(step, repsAt(step, 1))
                    : withRepsAt(step, 1, repsAt(step, 1) ?? 0, context.rounds),
                )
              }
              hitSlop={8}
              style={styles.varyRow}
            >
              <Text style={styles.resetLink}>
                {varies ? 'Same in every round' : 'Vary by round'}
              </Text>
            </Pressable>
          )}

          {fields.weight && (
          <Row label={context.type === 'assistedBodyweight' ? 'Assistance' : 'Weight'}>
            <Stepper
              large
              value={step.weightKg ?? 0}
              step={0.5}
              min={0}
              max={200}
              onChange={(v) =>
                set({ weightKg: v === 0 ? undefined : v, weightCount: v === 0 ? undefined : (step.weightCount ?? 1) })
              }
              format={(v) => (v === 0 ? '—' : `${Number.isInteger(v) ? v : v.toFixed(1)}kg`)}
            />
          </Row>
          )}

          {fields.weight && step.weightKg != null && (
            <Row label="No. of weights">
              <Stepper
                large
                value={step.weightCount ?? 1}
                step={1}
                min={1}
                max={4}
                onChange={(v) => set({ weightCount: v })}
                format={(v) => `×${v}`}
              />
            </Row>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <SecondaryButton label="Remove" style={styles.footerButton} onPress={onRemove} />
          <PrimaryButton
            label="Done"
            style={[styles.footerButton, { flex: 2 }]}
            onPress={onClose}
          />
        </View>
      </View>
    </Modal>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <MonoLabel tone={color.inkMuted}>{label}</MonoLabel>
        {hint && (
          <Text style={[t.body, { color: color.inkGhostest, fontSize: 10.5, marginTop: 5 }]}>
            {hint}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(20,20,22,0.28)' },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.gutter,
    paddingTop: 10,
    maxHeight: '78%',
    ...shadow.sheet,
  },
  grabber: {
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.track,
    alignSelf: 'center',
    marginBottom: space.l,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: color.divider,
    marginTop: 8,
  },
  resetLink: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 10.5,
    color: color.inkGhost,
    marginTop: 5,
    textDecorationLine: 'underline',
  },
  varyRow: { paddingTop: 12, alignItems: 'flex-end' },
  footer: { flexDirection: 'row', gap: 12, marginTop: space.l },
  footerButton: { flex: 1, height: 46 },
});
