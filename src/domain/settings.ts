/**
 * User settings — the fourth tab.
 *
 * Stored one row per leaf setting in the `settings` table, keyed by the dotted
 * names below. One row per setting rather than one blob so that a value this
 * version does not understand — written by a newer build, or corrupted — costs
 * exactly that setting and not the whole screen. Every read goes through a
 * parser that falls back to the default, so a bad row degrades to "as shipped"
 * instead of throwing on launch. That matters more than it sounds: settings are
 * read during app start, and the last thing that crashed there left the splash
 * screen up forever.
 *
 * Nothing here touches the database. `db/settingsRepo.ts` does the IO; this
 * module owns the shape, the defaults and the validation, so it stays pure and
 * testable.
 */

/** Bundled sounds. `'none'` is a real choice, not an absence. */
export const SOUND_IDS = ['gong', 'warning', 'alert', 'restEnd', 'beep'] as const;
export type SoundId = (typeof SOUND_IDS)[number];
export type SoundChoice = SoundId | 'none';

/**
 * The six events that can make a noise.
 *
 * The screenshot the user supplied has five; `sessionEnd` is the sixth, added
 * so that every sound the app makes has a row rather than one being fixed and
 * invisible.
 *
 * `beforeRoundEnd` and `innerRoundAlert` are predictions about when an interval
 * ends. They cannot fire on a tap-gated step, which has no known end — see
 * `runner/cues.ts`.
 */
export const SOUND_EVENTS = [
  'roundStart',
  'roundEnd',
  'beforeRoundEnd',
  'beforeRestEnd',
  'innerRoundAlert',
  'sessionEnd',
] as const;
export type SoundEvent = (typeof SOUND_EVENTS)[number];

export interface Settings {
  sounds: Record<SoundEvent, SoundChoice>;
  /** How many seconds early the two warnings fire. Separate, by request. */
  leadSeconds: {
    beforeRoundEnd: number;
    beforeRestEnd: number;
  };
  colors: {
    /** When false, the player uses the shipped palette and the rest is ignored. */
    useCustom: boolean;
    /** Work background. */
    round: string;
    /** Work background during the final `leadSeconds.beforeRoundEnd`. */
    warning: string;
    /** Rest background. */
    rest: string;
  };
  /** Feeds the plate calculator (B9) — `domain/plateCalc.ts`. */
  plates: {
    /** What the bar itself weighs, before any plate goes on. */
    barKg: number;
    /** Plate weights the user owns, one entry per size (quantity is assumed unlimited). */
    availableKg: number[];
  };
}

/**
 * Shipped defaults.
 *
 * The colours mirror the current fixed palette closely enough that switching
 * `useCustom` on and changing nothing looks like nothing happened — the switch
 * should feel like it unlocks the swatches, not like it repaints the app. The
 * warning colour is the exception: there is no existing end-of-round colour to
 * mirror, so it is a muted amber picked to sit between the two.
 */
export const DEFAULT_SETTINGS: Settings = {
  sounds: {
    roundStart: 'gong',
    roundEnd: 'gong',
    beforeRoundEnd: 'warning',
    beforeRestEnd: 'restEnd',
    innerRoundAlert: 'alert',
    sessionEnd: 'gong',
  },
  leadSeconds: {
    beforeRoundEnd: 3,
    beforeRestEnd: 3,
  },
  colors: {
    useCustom: false,
    round: '#141416',
    // A stop of the `warningOrange` / `restYellow` swatch ramps
    // (`theme/tokens.ts`) — 6 shades of #ffd600 and #88cdc7 respectively —
    // so the out-of-the-box color matches the swatch family a user sees in
    // Settings rather than an unrelated hex. Both clear the 3:1 floor with
    // margin: warning (ramp stop 5 of 6) lands at 3.55:1 against the light
    // player ink, rest at 14.4:1 against the dark player ink. Not the ramp's
    // first/darkest stop — at that darkness #ffd600's hue reads closer to
    // near-black than to yellow, so the default sits further along the ramp,
    // where the color is still recognizably yellow. See `theme/playerPalette.ts`.
    warning: '#423800',
    rest: '#CDEAE7',
  },
  // A standard Olympic bar and a common fractional set. Not a guess at what
  // any particular user owns — just a starting point that is one tap away
  // from being edited, the same role every other default here plays.
  plates: {
    barKg: 20,
    availableKg: [20, 15, 10, 5, 2.5, 1.25],
  },
};

/** Lead times outside this range are rejected back to the default. */
export const LEAD_SECONDS_LIMITS = { min: 0, max: 30 } as const;

/** A bar heavier than this is not a bar; a bar lighter than this is not real. */
export const BAR_WEIGHT_LIMITS = { min: 1, max: 50 } as const;

/** Nothing anyone racks a barbell with weighs more than this. */
export const PLATE_WEIGHT_LIMITS = { min: 0.25, max: 50 } as const;

// ── Keys ───────────────────────────────────────────────────────────────────

export const SETTING_KEYS = {
  sound: (event: SoundEvent) => `sound.${event}` as const,
  lead: (which: 'beforeRoundEnd' | 'beforeRestEnd') => `lead.${which}` as const,
  colorsUseCustom: 'colors.useCustom',
  color: (which: 'round' | 'warning' | 'rest') => `colors.${which}` as const,
  barWeight: 'plates.barKg',
  availablePlates: 'plates.availableKg',
} as const;

// ── Parsing ────────────────────────────────────────────────────────────────

const isSoundChoice = (v: unknown): v is SoundChoice =>
  v === 'none' || (typeof v === 'string' && (SOUND_IDS as readonly string[]).includes(v));

/**
 * `#rgb` or `#rrggbb`. Deliberately strict: an unparseable colour reaching the
 * player is a blank or black screen mid-workout, which is far worse than
 * silently keeping the previous value.
 */
const isHexColor = (v: unknown): v is string =>
  typeof v === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);

const isLead = (v: unknown): v is number =>
  typeof v === 'number' &&
  Number.isFinite(v) &&
  Number.isInteger(v) &&
  v >= LEAD_SECONDS_LIMITS.min &&
  v <= LEAD_SECONDS_LIMITS.max;

const isBarWeight = (v: unknown): v is number =>
  typeof v === 'number' &&
  Number.isFinite(v) &&
  v >= BAR_WEIGHT_LIMITS.min &&
  v <= BAR_WEIGHT_LIMITS.max;

/**
 * Every entry must be a real plate size; one bad entry invalidates the whole
 * list back to the default rather than silently dropping just that entry — a
 * hand-edited or downgraded row is not something to guess at piecemeal.
 *
 * Empty is valid and is NOT the same as "unset": "I deselected every plate" is
 * a real answer (someone who owns only the bar), and the calculator already
 * says so honestly (`platesFor` returns `perSide: []`, `exact` only when the
 * target is exactly the bar). Falling back to the default set here would
 * silently reintroduce plates the user just said they do not have.
 */
const isPlateList = (v: unknown): v is number[] =>
  Array.isArray(v) &&
  v.every(
    (n) =>
      typeof n === 'number' &&
      Number.isFinite(n) &&
      n >= PLATE_WEIGHT_LIMITS.min &&
      n <= PLATE_WEIGHT_LIMITS.max,
  );

/**
 * Build a `Settings` from whatever the database held, falling back per leaf.
 *
 * `rows` maps key → already-JSON-parsed value. Unknown keys are ignored rather
 * than erroring: a downgrade after a newer build wrote a setting this version
 * has never heard of should be a no-op, not a crash.
 */
export function settingsFromRows(rows: Record<string, unknown>): Settings {
  const sounds = {} as Record<SoundEvent, SoundChoice>;
  for (const event of SOUND_EVENTS) {
    const raw = rows[SETTING_KEYS.sound(event)];
    sounds[event] = isSoundChoice(raw) ? raw : DEFAULT_SETTINGS.sounds[event];
  }

  const lead = (which: 'beforeRoundEnd' | 'beforeRestEnd') => {
    const raw = rows[SETTING_KEYS.lead(which)];
    return isLead(raw) ? raw : DEFAULT_SETTINGS.leadSeconds[which];
  };

  const color = (which: 'round' | 'warning' | 'rest') => {
    const raw = rows[SETTING_KEYS.color(which)];
    return isHexColor(raw) ? raw : DEFAULT_SETTINGS.colors[which];
  };

  const useCustomRaw = rows[SETTING_KEYS.colorsUseCustom];
  const barKgRaw = rows[SETTING_KEYS.barWeight];
  const availableKgRaw = rows[SETTING_KEYS.availablePlates];

  return {
    sounds,
    leadSeconds: {
      beforeRoundEnd: lead('beforeRoundEnd'),
      beforeRestEnd: lead('beforeRestEnd'),
    },
    colors: {
      useCustom:
        typeof useCustomRaw === 'boolean' ? useCustomRaw : DEFAULT_SETTINGS.colors.useCustom,
      round: color('round'),
      warning: color('warning'),
      rest: color('rest'),
    },
    plates: {
      barKg: isBarWeight(barKgRaw) ? barKgRaw : DEFAULT_SETTINGS.plates.barKg,
      availableKg: isPlateList(availableKgRaw) ? availableKgRaw : DEFAULT_SETTINGS.plates.availableKg,
    },
  };
}

/** Flatten to the rows the table stores. The inverse of `settingsFromRows`. */
export function settingsToRows(settings: Settings): Record<string, unknown> {
  const rows: Record<string, unknown> = {
    [SETTING_KEYS.colorsUseCustom]: settings.colors.useCustom,
    [SETTING_KEYS.color('round')]: settings.colors.round,
    [SETTING_KEYS.color('warning')]: settings.colors.warning,
    [SETTING_KEYS.color('rest')]: settings.colors.rest,
    [SETTING_KEYS.lead('beforeRoundEnd')]: settings.leadSeconds.beforeRoundEnd,
    [SETTING_KEYS.lead('beforeRestEnd')]: settings.leadSeconds.beforeRestEnd,
    [SETTING_KEYS.barWeight]: settings.plates.barKg,
    [SETTING_KEYS.availablePlates]: settings.plates.availableKg,
  };
  for (const event of SOUND_EVENTS) {
    rows[SETTING_KEYS.sound(event)] = settings.sounds[event];
  }
  return rows;
}
