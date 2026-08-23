/**
 * Bundled audio assets.
 *
 * Kept apart from `cues.ts` on purpose: `cues.ts` is pure logic and is unit
 * tested, and pulling `require()`d binary assets into that module would drag
 * the asset pipeline into the test run for no benefit. Only the player imports
 * this file.
 *
 * The five files are GENERATED, by `scripts/make-sounds.py` — a committed
 * script rather than five binaries with no provenance, so they can be adjusted
 * or regenerated rather than only replaced. Real recordings can be dropped in
 * over them at any time; nothing here assumes they are synthetic.
 */

import type { SoundId } from '../domain/settings';

export const SOUND_SOURCES: Record<SoundId, number> = {
  gong: require('../../assets/audio/gong.wav'),
  warning: require('../../assets/audio/warning.wav'),
  alert: require('../../assets/audio/alert.wav'),
  restEnd: require('../../assets/audio/restEnd.wav'),
  beep: require('../../assets/audio/beep.wav'),
};
