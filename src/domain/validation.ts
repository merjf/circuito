/**
 * Builder validation — handoff § "Interactions & behaviour".
 *
 * Returns every problem rather than the first, so the builder can refuse to
 * save and say why in one go instead of making the user discover the rules one
 * failed tap at a time.
 */

import { fieldsFor, type ExerciseType } from './exerciseType';
import { LIMITS, repsAt, secondsAt, type Step, type Training } from './types';

/** The exercise types a training's steps resolve to, by exercise id. */
export type ExerciseTypeLookup = ReadonlyMap<string, ExerciseType>;

/**
 * The `setTargets` length rule: 1 (applies to every round), or exactly
 * `repeat` (entry i is round i).
 *
 * A backstop, not the user-facing mechanism. The builder calls
 * `reconcileTargets` whenever `repeat` changes, so a draft should never arrive
 * here in this state — but if one does, it was written by something that is
 * not the builder, and refusing the save is the right answer.
 */
function targetsLengthProblem(step: Step, repeat: number): string | null {
  const length = step.setTargets?.length ?? 0;
  if (length <= 1) return null;
  const rounds = Math.max(1, repeat);
  if (length === rounds) return null;
  return `has ${length} rep targets but the block runs ${rounds} ${
    rounds === 1 ? 'round' : 'rounds'
  }`;
}

/** Every round the step will actually be performed for. */
function everyRound(repeat: number): number[] {
  return Array.from({ length: Math.max(1, repeat) }, (_, i) => i + 1);
}

export function validateTraining(
  training: Training,
  /**
   * Which type each exercise is. Optional so callers that only want the
   * structural rules — a name, a block, some steps — need not load the
   * library; when it is absent the per-type field rules are skipped rather
   * than guessed at.
   */
  types?: ExerciseTypeLookup,
): string[] {
  const problems: string[] = [];

  if (training.name.trim().length === 0) {
    problems.push('Give the training a name.');
  }

  if (training.blocks.length < LIMITS.minBlocksPerTraining) {
    problems.push('Add at least one block.');
    return problems;
  }

  training.blocks.forEach((block) => {
    if (block.steps.length < LIMITS.minStepsPerBlock) {
      problems.push(`${block.label} has no exercises.`);
    }
    if (block.repeat < LIMITS.minRepeat) {
      problems.push(`${block.label} needs at least one round.`);
    }
    block.steps.forEach((step, i) => {
      // Applies to both kinds: a prescription that disagrees with the round
      // count is unreadable whether or not there is a clock involved.
      const lengthProblem = targetsLengthProblem(step, block.repeat);
      if (lengthProblem) {
        problems.push(`${block.label}, exercise ${i + 1}: ${lengthProblem}.`);
      }

      if (step.restAfterSeconds < LIMITS.minRestSeconds) {
        problems.push(`${block.label}, exercise ${i + 1}: rest cannot be negative.`);
      }

      // Which fields must be filled in is now the exercise's business, not the
      // training's. Only the fields the type actually uses are checked — a
      // plank is never asked for a rep count, and a curl is never asked how
      // many seconds it lasts.
      const type = types?.get(step.exerciseId);
      if (type == null) return;
      const fields = fieldsFor(type);

      if (fields.reps) {
        // EVERY round needs a count, not just the first. A 12/10/— step is
        // a step whose third round nobody has decided yet.
        const missing = everyRound(block.repeat).some(
          (round) => (repsAt(step, round) ?? 0) < LIMITS.minReps,
        );
        if (missing) {
          problems.push(`${block.label}, exercise ${i + 1}: set a rep count.`);
        }
      }

      if (fields.time) {
        const short = everyRound(block.repeat).some(
          (round) => secondsAt(step, round) < LIMITS.minWorkSeconds,
        );
        if (short) {
          problems.push(
            `${block.label}, exercise ${i + 1}: time must be at least ${LIMITS.minWorkSeconds}s.`,
          );
        }
      }
    });
  });

  return problems;
}

export function isValid(training: Training): boolean {
  return validateTraining(training).length === 0;
}
