/**
 * Playback for the sound bank.
 *
 * One player per sound, created once and rewound before each play, rather than
 * loading on demand — a bell that arrives 300ms after the interval changed is
 * worse than no bell, and decode latency on first play is exactly that. Five
 * resident players is the cost of that guarantee, and they are small files.
 *
 * The audio mode is set for playback that continues while the screen is locked.
 * There is no mixing configuration to negotiate: the user does not play music
 * during these sessions (settled 2026-08-15), which is why this file is short.
 */

import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useMemo } from 'react';

import type { SoundId } from '../domain/settings';
import { SOUND_SOURCES } from './soundSources';

export function useCueSounds(): (sound: SoundId) => void {
  // Hooks cannot be called in a loop, so the five are spelled out. Adding a
  // sixth sound means adding a line here as well as to SOUND_SOURCES.
  const gong = useAudioPlayer(SOUND_SOURCES.gong);
  const warning = useAudioPlayer(SOUND_SOURCES.warning);
  const alert = useAudioPlayer(SOUND_SOURCES.alert);
  const restEnd = useAudioPlayer(SOUND_SOURCES.restEnd);
  const beep = useAudioPlayer(SOUND_SOURCES.beep);

  const players = useMemo(
    () => ({ gong, warning, alert, restEnd, beep }),
    [gong, warning, alert, restEnd, beep],
  );

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: false, // respect the hardware silent switch
      shouldPlayInBackground: true, // bells must still fire on a locked phone
      interruptionMode: 'mixWithOthers',
    }).catch(() => {
      // Not fatal: the session runs silently rather than not at all.
    });
  }, []);

  return useCallback(
    (sound: SoundId) => {
      const player = players[sound];
      if (!player) return;
      try {
        // `seekTo` is asynchronous. Calling `play()` straight after it races the
        // rewind, so a bell that fires twice in quick succession can start from
        // wherever the last one stopped — or not audibly restart at all. Chain
        // it, and swallow failures: a missed cue must never interrupt the timer.
        player
          .seekTo(0)
          .then(() => player.play())
          .catch(() => {});
      } catch {
        // Synchronous throw (player disposed mid-session) — same rule.
      }
    },
    [players],
  );
}
