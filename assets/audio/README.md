# Sound cues

Three sounds, and only three — see `src/runner/cues.ts`.

| File | Fires when | Character |
|---|---|---|
| `work-bell.wav` | a work step begins | bright, high, urgent — "move now" |
| `rest-bell.wav` | a rest begins | lower, rounder, clearly a different object |
| `session-end.wav` | the training finishes | three rising notes, a phrase not a strike |

## ⚠️ These are placeholders

They are synthesised sine partials under an exponential decay, generated to
unblock development. They are *adequate*, not good. Replace them.

Replacements should be:

- **Short.** Under a second for the two bells; the end sound can run to ~1.5s.
- **Distinct in timbre, not just in pitch.** The work and rest bells get told
  apart from across a gym, by someone not looking at the phone, while out of
  breath. Two sine tones a fifth apart will not do that; two physically
  different objects will.
- **Loud in the midrange.** Phone speakers have nothing below ~500 Hz, and a gym
  has plenty of low-frequency noise. A bell whose energy sits at 200 Hz will
  vanish.
- **Peak-normalised, not clipped.** Leave a little headroom.

Keep the filenames, or update `src/runner/soundSources.ts` to match. Any format
Metro bundles as an asset works — `.wav`, `.mp3`, `.m4a`, `.aac`. `.m4a` is the
sensible choice for the real ones; these are `.wav` only because they were
generated without an encoder.

## Regenerating the placeholders

The script that made them is in the build plan's history, not the repo — they
are meant to be deleted, not maintained.
