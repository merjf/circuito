/**
 * Settings parsing.
 *
 * These run on the launch path — settings are read before the first screen —
 * so the property that matters most is that nothing here can throw. A bad value
 * must cost that one setting and nothing else. The last thing that threw during
 * start-up left the splash screen up forever.
 */

import {
  DEFAULT_SETTINGS,
  LEAD_SECONDS_LIMITS,
  SETTING_KEYS,
  SOUND_EVENTS,
  settingsFromRows,
  settingsToRows,
  type Settings,
} from '../src/domain/settings';
import { weakestTextContrast } from '../src/theme/playerPalette';

describe('settings — round trip', () => {
  it('survives a round trip through rows', () => {
    expect(settingsFromRows(settingsToRows(DEFAULT_SETTINGS))).toEqual(DEFAULT_SETTINGS);
  });

  it('survives a round trip with every value changed', () => {
    const custom: Settings = {
      sounds: {
        roundStart: 'beep',
        roundEnd: 'restEnd',
        beforeRoundEnd: 'alert',
        beforeRestEnd: 'gong',
        innerRoundAlert: 'none',
        sessionEnd: 'warning',
      },
      leadSeconds: { beforeRoundEnd: 5, beforeRestEnd: 1 },
      colors: { useCustom: true, round: '#0a0a0a', warning: '#ffcc00', rest: '#eeeeee' },
    };
    expect(settingsFromRows(settingsToRows(custom))).toEqual(custom);
  });

  it('returns the defaults for an empty database', () => {
    expect(settingsFromRows({})).toEqual(DEFAULT_SETTINGS);
  });
});

describe('settings — a bad row costs one setting, not the screen', () => {
  it('falls back on an unknown sound but keeps the rest', () => {
    const rows = settingsToRows(DEFAULT_SETTINGS);
    rows[SETTING_KEYS.sound('roundStart')] = 'trombone';
    const result = settingsFromRows(rows);
    expect(result.sounds.roundStart).toBe(DEFAULT_SETTINGS.sounds.roundStart);
    expect(result.colors.rest).toBe(DEFAULT_SETTINGS.colors.rest);
  });

  it('accepts none for every event', () => {
    const rows = settingsToRows(DEFAULT_SETTINGS);
    for (const event of SOUND_EVENTS) rows[SETTING_KEYS.sound(event)] = 'none';
    const result = settingsFromRows(rows);
    for (const event of SOUND_EVENTS) expect(result.sounds[event]).toBe('none');
  });

  it('rejects a colour that is not hex', () => {
    // An unparseable colour reaching the player is a black or blank screen
    // mid-workout — far worse than keeping the previous value.
    for (const bad of ['rebeccapurple', 'rgb(1,2,3)', '#12345', '', '#ggg']) {
      const rows = settingsToRows(DEFAULT_SETTINGS);
      rows[SETTING_KEYS.color('round')] = bad;
      expect(settingsFromRows(rows).colors.round).toBe(DEFAULT_SETTINGS.colors.round);
    }
  });

  it('accepts three-digit hex', () => {
    const rows = settingsToRows(DEFAULT_SETTINGS);
    rows[SETTING_KEYS.color('round')] = '#abc';
    expect(settingsFromRows(rows).colors.round).toBe('#abc');
  });

  it('rejects lead times that are out of range, fractional or not numbers', () => {
    for (const bad of [-1, LEAD_SECONDS_LIMITS.max + 1, 2.5, Number.NaN, '3', null]) {
      const rows = settingsToRows(DEFAULT_SETTINGS);
      rows[SETTING_KEYS.lead('beforeRoundEnd')] = bad;
      expect(settingsFromRows(rows).leadSeconds.beforeRoundEnd).toBe(
        DEFAULT_SETTINGS.leadSeconds.beforeRoundEnd,
      );
    }
  });

  it('accepts zero as a lead time', () => {
    const rows = settingsToRows(DEFAULT_SETTINGS);
    rows[SETTING_KEYS.lead('beforeRoundEnd')] = 0;
    expect(settingsFromRows(rows).leadSeconds.beforeRoundEnd).toBe(0);
  });

  it('ignores a key it has never heard of', () => {
    // A downgrade after a newer build wrote something should be a no-op.
    const rows = settingsToRows(DEFAULT_SETTINGS);
    rows['sound.somethingFromTheFuture'] = 'whatever';
    expect(settingsFromRows(rows)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('settings — the shipped defaults are self-consistent', () => {
  it('names a sound for every event', () => {
    for (const event of SOUND_EVENTS) {
      expect(DEFAULT_SETTINGS.sounds[event]).toBeDefined();
    }
  });

  it('ships a warning colour with real contrast headroom', () => {
    // Measured, not eyeballed. The first candidate (#B8A33C) passed at 3.01:1 —
    // over the line with no margin for the day a token is nudged.
    expect(weakestTextContrast(DEFAULT_SETTINGS.colors.warning)).toBeGreaterThanOrEqual(3.5);
  });

  it('starts with custom colours off', () => {
    // Leaving the switch alone must not shift a pixel of the shipped player.
    expect(DEFAULT_SETTINGS.colors.useCustom).toBe(false);
  });
});
