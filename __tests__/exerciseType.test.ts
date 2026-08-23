/**
 * The field matrix, and the two narrowing functions that guard it.
 *
 * `fieldsFor` is asked by the builder row, the edit sheet, the logger's
 * columns, the meta line and the validator. If those five ever disagree about
 * one exercise the app starts contradicting itself on screen, so what is
 * pinned here is the table itself — not any one screen's reading of it.
 */

import {
  asEquipment,
  asExerciseType,
  EQUIPMENT,
  EQUIPMENT_LABELS,
  EXERCISE_TYPES,
  fieldsFor,
  isTimed,
  TYPE_COPY,
  type ExerciseType,
} from '../src/domain/exerciseType';
import { EQUIPMENT_ART } from '../src/domain/equipmentArt';

describe('the field matrix', () => {
  it('gives every type at least one field to fill in', () => {
    // A type that asks for nothing would render a row with a check and no
    // way to say what you did — which is the state this whole model replaced.
    for (const type of EXERCISE_TYPES) {
      const f = fieldsFor(type);
      expect(f.weight || f.reps || f.time || f.distance).toBe(true);
    }
  });

  it('matches each type against what it says it measures', () => {
    const expected: Record<ExerciseType, string[]> = {
      weightReps: ['weight', 'reps'],
      bodyweightReps: ['reps'],
      weightedBodyweight: ['weight', 'reps'],
      assistedBodyweight: ['weight', 'reps'],
      duration: ['time'],
      durationWeight: ['weight', 'time'],
      distanceDuration: ['time', 'distance'],
      weightDistance: ['weight', 'distance'],
    };

    for (const type of EXERCISE_TYPES) {
      const f = fieldsFor(type);
      const actual = (['weight', 'reps', 'time', 'distance'] as const).filter((k) => f[k]);
      expect(actual).toEqual(expected[type]);
    }
  });

  it('signs the two bodyweight loads in opposite directions', () => {
    // +10 kg on a pull-up and −10 kg on a pull-up are opposite facts. A bare
    // "10 kg" on either would invert the meaning of your own history.
    expect(fieldsFor('weightedBodyweight').weightSign).toBe('plus');
    expect(fieldsFor('assistedBodyweight').weightSign).toBe('minus');
    expect(fieldsFor('weightReps').weightSign).toBe('plain');
  });

  it('isTimed is exactly the types with a time field', () => {
    for (const type of EXERCISE_TYPES) {
      expect(isTimed(type)).toBe(fieldsFor(type).time);
    }
    expect(EXERCISE_TYPES.filter(isTimed)).toEqual([
      'duration',
      'durationWeight',
      'distanceDuration',
    ]);
  });

  it('falls back rather than returning undefined for an unknown type', () => {
    // A row read from a database written by something that is not this app.
    // The screen renders weight and reps; it does not crash.
    expect(fieldsFor('nonsense' as ExerciseType)).toEqual(fieldsFor('weightReps'));
  });
});

describe('the copy every picker and badge reads', () => {
  it('describes all eight types with a label, an example and units', () => {
    for (const type of EXERCISE_TYPES) {
      const copy = TYPE_COPY[type];
      expect(copy.label.length).toBeGreaterThan(0);
      expect(copy.example.length).toBeGreaterThan(0);
      expect(copy.chips.length).toBeGreaterThan(0);
    }
  });

  it('lists as many unit chips as the type has fields', () => {
    // The chips ARE the field matrix said out loud. One drifting from the
    // other is a badge promising a column the logger will not draw.
    for (const type of EXERCISE_TYPES) {
      const f = fieldsFor(type);
      const fieldCount = [f.weight, f.reps, f.time, f.distance].filter(Boolean).length;
      expect(TYPE_COPY[type].chips).toHaveLength(fieldCount);
    }
  });
});

describe('equipment', () => {
  it('labels and pictures every value, with nothing left over', () => {
    // The exhaustive Records make a missing entry a type error, but not a
    // missing FILE — this is what catches art that was never added.
    for (const item of EQUIPMENT) {
      expect(EQUIPMENT_LABELS[item]).toBeTruthy();
      expect(EQUIPMENT_ART[item]).toBeDefined();
    }
    expect(Object.keys(EQUIPMENT_LABELS).sort()).toEqual([...EQUIPMENT].sort());
    expect(Object.keys(EQUIPMENT_ART).sort()).toEqual([...EQUIPMENT].sort());
  });
});

describe('narrowing what comes back from a database or a route param', () => {
  it('accepts every real type and falls back on anything else', () => {
    for (const type of EXERCISE_TYPES) {
      expect(asExerciseType(type)).toBe(type);
    }
    expect(asExerciseType('timed')).toBe('weightReps');
    expect(asExerciseType(undefined)).toBe('weightReps');
    expect(asExerciseType(7)).toBe('weightReps');
  });

  it('accepts every real equipment and returns nothing for anything else', () => {
    for (const item of EQUIPMENT) {
      expect(asEquipment(item)).toBe(item);
    }
    // Unstated, NOT rounded to 'other' — "nobody has said" and "it is
    // something else" are different claims, and only one of them is an answer.
    expect(asEquipment('bodyweight')).toBeUndefined();
    expect(asEquipment('')).toBeUndefined();
    expect(asEquipment(undefined)).toBeUndefined();
  });

  it('does not confuse none with unstated', () => {
    // `none` is a push-up. Absent is an exercise nobody has classified.
    expect(asEquipment('none')).toBe('none');
    expect(asEquipment('')).toBeUndefined();
  });
});
