/**
 * The player palette under user-chosen colours.
 *
 * The shipped palettes are correct by construction — someone picked the ink to
 * go with the background. An arbitrary colour has no such guarantee, and this
 * is a screen read at arm's length by someone out of breath, so the derivation
 * has to hold up on colours nobody vetted.
 */

import { DEFAULT_SETTINGS, type Settings } from '../src/domain/settings';
import {
  contrastRatio,
  inkSetFor,
  isLowContrast,
  playerPalette,
  playerStateFor,
  relativeLuminance,
  weakestTextContrast,
} from '../src/theme/playerPalette';
import { playerTheme } from '../src/theme/tokens';

const custom = (over: Partial<Settings['colors']>): Settings => ({
  ...DEFAULT_SETTINGS,
  colors: { ...DEFAULT_SETTINGS.colors, useCustom: true, ...over },
});

describe('contrast maths', () => {
  it('matches the WCAG extremes', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 9);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 9);
  });

  it('does the gamma expansion, so green reads lighter than blue', () => {
    // A naive channel average gets this backwards — and green is exactly where
    // a "round colour" lands, since the app the user screenshotted defaults to it.
    expect(relativeLuminance('#00ff00')).toBeGreaterThan(relativeLuminance('#0000ff'));
  });

  it('treats short hex as long', () => {
    expect(inkSetFor('#fff')).toBe(inkSetFor('#ffffff'));
    expect(inkSetFor('#000')).toBe(inkSetFor('#000000'));
  });
});

describe('ink is chosen by contrast, not by hue', () => {
  it('picks light ink on dark backgrounds and dark on light', () => {
    expect(inkSetFor('#141416')).toBe('light');
    expect(inkSetFor('#F2F1EE')).toBe('dark');
    expect(inkSetFor('#2E7D32')).toBe('light');
    expect(inkSetFor(DEFAULT_SETTINGS.colors.warning)).toBe('dark');
  });

  it('keeps primary text readable across the colour wheel', () => {
    for (const bg of ['#8B2E2E', '#2E8B57', '#2E4A8B', '#8B7A2E', '#6B2E8B', '#2E8B8B']) {
      const p = playerPalette('work', custom({ round: bg }));
      expect(contrastRatio(p.bg, p.ink)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('secondary text is derived, not a fixed grey', () => {
  it('does not reuse the shipped muted tokens on a custom background', () => {
    // The bug this guards: darkMuted (#8E8E8A) on the amber warning colour
    // measures 1.38:1 — present in the DOM, invisible in the gym.
    const p = playerPalette('warning', custom({}));
    expect(p.muted).not.toBe('#8E8E8A');
    expect(p.muted).not.toBe('#6E6E6B');
    expect(contrastRatio(p.bg, p.muted)).toBeGreaterThanOrEqual(3);
  });
});

describe('the low-contrast warning is calibrated, not decorative', () => {
  it('never fires on anything that ships', () => {
    expect(isLowContrast('#141416')).toBe(false);
    expect(isLowContrast('#F2F1EE')).toBe(false);
    expect(isLowContrast(DEFAULT_SETTINGS.colors.warning)).toBe(false);
  });

  it('does fire on saturated mid-tones', () => {
    expect(isLowContrast('#2E7D32')).toBe(true);
    expect(isLowContrast('#797979')).toBe(true);
    expect(isLowContrast('#4A6FA5')).toBe(true);
  });

  it('leaves the default warning colour real headroom', () => {
    // Measured rather than eyeballed: the first candidate passed at 3.01:1,
    // which is over the line with no margin for a nudged token.
    expect(weakestTextContrast(DEFAULT_SETTINGS.colors.warning)).toBeGreaterThanOrEqual(3.5);
  });
});

describe('the switch off must not shift a pixel', () => {
  it('returns the shipped palettes by identity, not by reconstruction', () => {
    expect(playerPalette('work', DEFAULT_SETTINGS)).toBe(playerTheme.work);
    expect(playerPalette('rest', DEFAULT_SETTINGS)).toBe(playerTheme.rest);
  });

  it('uses the chosen backgrounds when the switch is on', () => {
    const s = custom({ round: '#2E7D32', warning: '#C9C032', rest: '#B03030' });
    expect(playerPalette('work', s).bg).toBe('#2E7D32');
    expect(playerPalette('warning', s).bg).toBe('#C9C032');
    expect(playerPalette('rest', s).bg).toBe('#B03030');
  });
});

describe('which face the player shows', () => {
  it('warns only inside the lead-in', () => {
    expect(playerStateFor({ isRest: false, secondsRemaining: 10, leadSeconds: 3 })).toBe('work');
    expect(playerStateFor({ isRest: false, secondsRemaining: 3, leadSeconds: 3 })).toBe('warning');
    expect(playerStateFor({ isRest: false, secondsRemaining: 1, leadSeconds: 3 })).toBe('warning');
  });

  it('never warns during a rest', () => {
    expect(playerStateFor({ isRest: true, secondsRemaining: 1, leadSeconds: 3 })).toBe('rest');
  });

  it('never warns on a gated cue, which has no end to count down to', () => {
    expect(playerStateFor({ isRest: false, secondsRemaining: null, leadSeconds: 3 })).toBe('work');
  });

  it('never warns when the lead is switched off', () => {
    expect(playerStateFor({ isRest: false, secondsRemaining: 0, leadSeconds: 0 })).toBe('work');
  });
});
