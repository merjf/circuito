#!/usr/bin/env python3
"""
Generate the bundled sound bank into assets/audio/.

Kept as a script rather than as five committed binaries with no provenance: when
the user replaces these with real recordings, whoever comes next should be able
to see exactly what the placeholders were and regenerate or tweak them. Run:

    python3 scripts/make-sounds.py

Pure stdlib — `wave` and `math`, no numpy — so it runs anywhere without a
virtualenv.

Design notes, since "make a beep" has more traps than it looks:

* **Every sound is enveloped.** A tone that starts or stops at a non-zero sample
  produces a click, which on a phone speaker at gym volume is the most
  noticeable part of the sound. Attack and release ramps remove it.
* **Peak amplitude is well under full scale.** These play through
  `expo-audio` alongside the OS volume; leaving headroom means no clipping when
  the user has the phone loud, which is exactly when they need to hear it.
* **The six events map onto five sounds, and that is deliberate** — round start
  and round end are both `gong` by default. They are distinguished by context
  (one follows a rest, the other precedes it), not by timbre.
* **Pitch carries meaning.** Warnings rise, ends fall, alerts sit in the middle.
  Someone mid-set is not looking at the screen, so the shape of the sound has to
  say which one it was.
"""

import math
import os
import struct
import wave

SAMPLE_RATE = 44100
PEAK = 0.62  # headroom below full scale


def envelope(i: int, n: int, attack: float = 0.005, release: float = 0.35) -> float:
    """Attack/release ramp in seconds, as a multiplier for sample `i` of `n`."""
    t = i / SAMPLE_RATE
    total = n / SAMPLE_RATE
    a = min(1.0, t / attack) if attack > 0 else 1.0
    remaining = total - t
    r = min(1.0, remaining / release) if release > 0 else 1.0
    return max(0.0, a * r)


def tone(freq: float, seconds: float, partials=((1.0, 1.0),), attack=0.005,
         release=0.08, decay=0.0):
    """
    Additive tone.

    `partials` is a list of (frequency multiple, amplitude). `decay` is an
    exponential decay constant applied on top of the envelope — that is what
    makes a gong sound struck rather than switched on.
    """
    n = int(SAMPLE_RATE * seconds)
    out = []
    norm = sum(a for _, a in partials) or 1.0
    for i in range(n):
        t = i / SAMPLE_RATE
        v = sum(a * math.sin(2 * math.pi * freq * m * t) for m, a in partials) / norm
        if decay:
            v *= math.exp(-decay * t)
        out.append(v * envelope(i, n, attack, release))
    return out


def silence(seconds: float):
    return [0.0] * int(SAMPLE_RATE * seconds)


def write_wav(path: str, samples) -> None:
    peak = max((abs(s) for s in samples), default=0.0) or 1.0
    scale = PEAK / peak
    frames = b"".join(
        struct.pack("<h", int(max(-1.0, min(1.0, s * scale)) * 32767)) for s in samples
    )
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(frames)


def build():
    sounds = {}

    # gong — struck, inharmonic, long tail. Round start and round end.
    # The partials are deliberately NOT integer multiples: a harmonic stack
    # sounds like an organ, and it is the inharmonic ones that read as metal.
    sounds["gong"] = tone(
        196.0,
        1.9,
        partials=((1.0, 1.0), (2.41, 0.5), (3.83, 0.28), (5.19, 0.16), (7.03, 0.08)),
        attack=0.002,
        release=1.1,
        decay=1.5,
    )

    # warning — two rising blips. Fires N seconds before a round ends, so it has
    # to be unmistakably "something is about to happen" rather than "done".
    sounds["warning"] = (
        tone(660.0, 0.11, attack=0.004, release=0.05, decay=3.0)
        + silence(0.07)
        + tone(880.0, 0.13, attack=0.004, release=0.06, decay=3.0)
    )

    # alert — one mid blip, halfway through the round. Quietest and shortest of
    # the set: it fires most often, and an alert you resent would get switched
    # off within a week.
    sounds["alert"] = [s * 0.55 for s in tone(
        740.0, 0.09, attack=0.004, release=0.04, decay=4.0
    )]

    # restEnd — falling pair, the mirror of `warning`. Rest is ending, work is
    # coming: down in pitch so it never gets confused with the warning.
    sounds["restEnd"] = (
        tone(587.33, 0.12, attack=0.004, release=0.05, decay=3.0)
        + silence(0.06)
        + tone(440.0, 0.16, attack=0.004, release=0.08, decay=2.4)
    )

    # beep — plain, neutral, for anyone who wants something unobtrusive on any
    # of the six slots.
    sounds["beep"] = tone(880.0, 0.10, attack=0.004, release=0.05, decay=3.5)

    return sounds


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(os.path.dirname(here), "assets", "audio")
    os.makedirs(out_dir, exist_ok=True)

    for name, samples in build().items():
        path = os.path.join(out_dir, f"{name}.wav")
        write_wav(path, samples)
        print(f"  {name + '.wav':16} {len(samples) / SAMPLE_RATE:.2f}s")

    print(f"\nWrote {len(build())} files to {out_dir}")


if __name__ == "__main__":
    main()
