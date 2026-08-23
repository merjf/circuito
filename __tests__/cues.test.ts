/**
 * The sound engine.
 *
 * REPLACES the three-sound transition tests (2026-08-15). Sounds now fire
 * *inside* a cue at offsets, which turns a lookup into a scheduling problem —
 * and scheduling problems fail at their boundaries, so that is what these are.
 *
 * The three events split by *when* rather than by what they sound like: enter,
 * scheduled, exit. Keeping `roundEnd` on exit rather than scheduling it at
 * `seconds` is what lets a tap-gated cue and a skipped cue work with no special
 * case at all — both leave the cue, so both fire it.
 */

import { DEFAULT_SETTINGS, type Settings } from '../src/domain/settings';
import type { Cue } from '../src/domain/queue';
import {
  MIN_GAP_SECONDS,
  scheduledSounds,
  sessionEndSound,
  soundEventsForCue,
  soundOnEnter,
  soundOnExit,
} from '../src/runner/cues';

const cue = (over: Partial<Cue> = {}): Cue => ({
  kind: 'work',
  seconds: 45,
  round: 1,
  roundsInBlock: 3,
  stepIndex: 1,
  stepsInRound: 3,
  ...over,
});

const leads = (round: number, rest: number): Settings => ({
  ...DEFAULT_SETTINGS,
  leadSeconds: { beforeRoundEnd: round, beforeRestEnd: rest },
});

describe('a normal work interval', () => {
  it('is bracketed by start and end, with the warning and halfway inside', () => {
    expect(soundEventsForCue(cue(), DEFAULT_SETTINGS).map((e) => [e.event, e.atSecond])).toEqual([
      ['roundStart', 0],
      ['innerRoundAlert', 22.5],
      ['beforeRoundEnd', 42],
      ['roundEnd', 45],
    ]);
  });
});

describe('rests and prepare', () => {
  it('a rest warns before it ends and nothing else', () => {
    const rest = cue({ kind: 'rest', seconds: 20 });
    expect(scheduledSounds(rest, DEFAULT_SETTINGS).map((e) => e.event)).toEqual(['beforeRestEnd']);
    expect(soundOnEnter(rest, DEFAULT_SETTINGS)).toBeNull();
    expect(soundOnExit(rest, DEFAULT_SETTINGS)).toBeNull();
  });

  it('a round rest behaves as a rest', () => {
    expect(
      scheduledSounds(cue({ kind: 'roundRest', seconds: 60 }), DEFAULT_SETTINGS).map((e) => e.event),
    ).toEqual(['beforeRestEnd']);
  });

  it('prepare is silent, so the start bell always means move now', () => {
    expect(soundEventsForCue(cue({ kind: 'prepare', seconds: 10 }), DEFAULT_SETTINGS)).toEqual([]);
  });
});

describe('the boundaries, which is where scheduling breaks', () => {
  it('drops a warning whose lead is longer than the interval', () => {
    expect(scheduledSounds(cue({ seconds: 4 }), leads(10, 3)).map((e) => e.event)).not.toContain(
      'beforeRoundEnd',
    );
  });

  it('drops a zero lead rather than doubling up on the end', () => {
    expect(scheduledSounds(cue(), leads(0, 0)).map((e) => e.event)).not.toContain('beforeRoundEnd');
  });

  it('keeps the warning over the halfway alert when they collide', () => {
    // A 6s round with a 3s lead puts both at exactly 3.0.
    expect(scheduledSounds(cue({ seconds: 6 }), leads(3, 3)).map((e) => e.event)).toEqual([
      'beforeRoundEnd',
    ]);
  });

  it('resolves a near-collision too, not just an exact one', () => {
    // 6.5s / 3s lead: warning at 3.5, halfway at 3.25 — a quarter second apart.
    expect(scheduledSounds(cue({ seconds: 6.5 }), leads(3, 3)).map((e) => e.event)).toEqual([
      'beforeRoundEnd',
    ]);
  });

  it('schedules nothing at all on a very short cue', () => {
    expect(scheduledSounds(cue({ seconds: 1.5 }), DEFAULT_SETTINGS)).toEqual([]);
  });

  it('never places a sound outside the cue, at any length or lead', () => {
    for (const seconds of [2, 3, 5, 8, 13, 21, 45, 90]) {
      for (const lead of [0, 1, 2, 3, 5, 10]) {
        for (const e of scheduledSounds(cue({ seconds }), leads(lead, lead))) {
          expect(e.atSecond).toBeGreaterThanOrEqual(MIN_GAP_SECONDS);
          expect(seconds - e.atSecond).toBeGreaterThanOrEqual(MIN_GAP_SECONDS);
        }
      }
    }
  });

  it('never places two sounds within MIN_GAP of each other', () => {
    // Two sounds closer than a second read as one muddled noise, and the user
    // cannot act on either.
    for (const seconds of [2, 3, 4, 5, 6, 6.5, 7, 8, 12, 20, 45]) {
      for (const lead of [0, 1, 2, 3, 4, 5, 8]) {
        const events = scheduledSounds(cue({ seconds }), leads(lead, lead));
        for (let i = 1; i < events.length; i++) {
          expect(events[i]!.atSecond - events[i - 1]!.atSecond).toBeGreaterThanOrEqual(
            MIN_GAP_SECONDS,
          );
        }
      }
    }
  });
});

describe('a tap-gated cue', () => {
  const gated = cue({ seconds: null, targetReps: 12 });

  it('schedules nothing, because there is no end to predict', () => {
    expect(scheduledSounds(gated, DEFAULT_SETTINGS)).toEqual([]);
  });

  it('still starts, and still has an end sound waiting for the tap', () => {
    expect(soundEventsForCue(gated, DEFAULT_SETTINGS).map((e) => e.event)).toEqual(['roundStart']);
    expect(soundOnExit(gated, DEFAULT_SETTINGS)).not.toBeNull();
  });
});

describe('none is a real choice, not an absence', () => {
  it('silences one event without touching the others', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      sounds: { ...DEFAULT_SETTINGS.sounds, roundStart: 'none', innerRoundAlert: 'none' },
    };
    expect(soundEventsForCue(cue(), settings).map((e) => e.event)).toEqual([
      'beforeRoundEnd',
      'roundEnd',
    ]);
  });

  it('all-none is a better mute than a global switch would be', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      sounds: {
        roundStart: 'none',
        roundEnd: 'none',
        beforeRoundEnd: 'none',
        beforeRestEnd: 'none',
        innerRoundAlert: 'none',
        sessionEnd: 'none',
      },
    };
    expect(soundEventsForCue(cue(), settings)).toEqual([]);
    expect(sessionEndSound(settings)).toBeNull();
  });
});
