/**
 * What the player says about a cue it cannot time.
 *
 * The regression at the bottom of this file is the reason the module exists:
 * the up-next line interpolated `cue.seconds` into a template, and a gated cue
 * carries `null` there, so the first mixed circuit ever built would have
 * rendered "nulls work" on screen.
 */

import { gatedReadout, NOTHING, trimNumber, upNextMeta } from '../src/runner/cueText';
import type { Cue } from '../src/domain/queue';

const cue = (over: Partial<Cue> = {}): Cue => ({
  kind: 'work',
  seconds: null,
  round: 1,
  roundsInBlock: 3,
  stepIndex: 1,
  stepsInRound: 3,
  ...over,
});

describe('gatedReadout', () => {
  it('shows reps, named, for a rep-counted exercise', () => {
    expect(gatedReadout(cue({ targetReps: 12 }), 'weightReps')).toEqual({
      value: '12',
      unit: 'reps',
    });
    expect(gatedReadout(cue({ targetReps: 8 }), 'bodyweightReps')).toEqual({
      value: '8',
      unit: 'reps',
    });
  });

  it('shows distance, named, for a loaded carry', () => {
    expect(gatedReadout(cue({ targetDistanceKm: 0.04 }), 'weightDistance')).toEqual({
      value: '0.04',
      unit: 'km',
    });
  });

  it('reads the TYPE before the value, so a stale target is not shown', () => {
    // A step keeps its setTargets when its exercise is reclassified — steps are
    // not rewritten underneath the user. A rep target left on a carry is a
    // number nobody prescribed for it, and "×12" on a movement measured in
    // kilometres is worse than showing nothing.
    const stale = cue({ targetReps: 12 });
    expect(gatedReadout(stale, 'weightDistance')).toEqual({ value: NOTHING, unit: null });
    expect(gatedReadout(stale, 'duration')).toEqual({ value: NOTHING, unit: null });
  });

  it('prefers reps over distance when a type uses both fields', () => {
    // No such type exists today, but the order is the type's field order and
    // should not become accidental if one is added.
    const both = cue({ targetReps: 10, targetDistanceKm: 1 });
    expect(gatedReadout(both, 'weightReps').unit).toBe('reps');
  });

  it('shows a dash rather than a zero when nothing is prescribed', () => {
    // The honest rendering of "do this, then press DONE". A 0 would read as a
    // prescription of none.
    expect(gatedReadout(cue(), 'weightReps')).toEqual({ value: NOTHING, unit: null });
    expect(gatedReadout(cue(), undefined)).toEqual({ value: NOTHING, unit: null });
  });
});

describe('upNextMeta', () => {
  it('gives a timed cue its length', () => {
    expect(upNextMeta(cue({ seconds: 45 }), 'duration')).toBe('45s work');
  });

  it('gives a gated cue what it asks for instead of its length', () => {
    // THE REGRESSION. Before this module the template read
    // `${next.seconds}s work`, and `next.seconds` is null on every gated cue —
    // so the up-next line said "nulls work".
    const line = upNextMeta(cue({ targetReps: 12 }), 'weightReps');
    expect(line).toBe('12 reps');
    expect(line).not.toContain('null');
  });

  it('never says null for any type, prescribed or not', () => {
    const types = ['weightReps', 'bodyweightReps', 'duration', 'weightDistance'] as const;
    for (const type of types) {
      expect(upNextMeta(cue(), type)).not.toContain('null');
      expect(upNextMeta(cue({ targetReps: 10, targetDistanceKm: 2 }), type)).not.toContain('null');
    }
  });

  it('falls back to prose, not a dash, for an open-ended set', () => {
    // The up-next line is a sentence. A lone em-dash there reads as missing
    // data rather than as "as many as you like".
    expect(upNextMeta(cue(), 'bodyweightReps')).toBe('on your call');
  });

  it('describes a rest by when it ends', () => {
    expect(upNextMeta(cue({ kind: 'rest', seconds: 20 }), undefined)).toBe('after 20s rest');
    expect(upNextMeta(cue({ kind: 'roundRest', seconds: 60 }), undefined)).toBe('after 60s rest');
    expect(upNextMeta(cue({ kind: 'blockRest', seconds: 75 }), undefined)).toBe('after 75s rest');
  });

  it('says nothing much at the end of the session', () => {
    expect(upNextMeta(null, undefined)).toBe(NOTHING);
    expect(upNextMeta(undefined, undefined)).toBe(NOTHING);
  });
});

describe('trimNumber', () => {
  it('drops trailing zeros and caps at two decimals', () => {
    expect(trimNumber(5)).toBe('5');
    expect(trimNumber(2.5)).toBe('2.5');
    expect(trimNumber(0.04)).toBe('0.04');
    expect(trimNumber(1.239)).toBe('1.24');
    // NOT 1.005 — that is stored as 1.00499999…, so `toFixed(2)` gives "1.00"
    // and this would be a test of IEEE 754 rather than of the function. A
    // distance is typed by hand in kilometres; the third decimal is a metre.
  });
});
