/**
 * Settings, loaded once and shared.
 *
 * Read on the launch path, so the rule that shapes this file is that nothing
 * here may throw or block. The provider renders its children immediately with
 * `DEFAULT_SETTINGS` and swaps in the stored values when they arrive — a
 * fraction of a second later, and only ever a change from "as shipped" to "as
 * configured". The alternative, gating the first screen on a database read,
 * buys nothing and risks the failure mode that once left the splash screen up
 * forever.
 *
 * Writes are optimistic for the same reason: the UI updates from the reducer
 * and the row is written behind it. A colour swatch that waited on SQLite
 * before repainting would feel broken on a screen made of swatches.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { loadSettings, saveSetting } from '@/db/settingsRepo';
import {
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  type Settings,
  type SoundChoice,
  type SoundEvent,
} from '@/domain/settings';

interface SettingsContextValue {
  settings: Settings;
  /** True until the stored values have been read. Screens rarely need it. */
  loading: boolean;
  setSound: (event: SoundEvent, choice: SoundChoice) => void;
  setLead: (which: 'beforeRoundEnd' | 'beforeRestEnd', seconds: number) => void;
  setUseCustomColors: (on: boolean) => void;
  setColor: (which: 'round' | 'warning' | 'rest', hex: string) => void;
  setBarWeight: (kg: number) => void;
  setAvailablePlates: (kg: number[]) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadSettings()
      .then((stored) => {
        if (alive) setSettings(stored);
      })
      .catch(() => {
        // Deliberately swallowed. `loadSettings` already falls back per leaf,
        // so reaching here means the database itself is unavailable — which
        // `app/_layout.tsx` reports on its own. Failing loudly a second time
        // would replace a usable app with a blank one over sound choices.
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  /** Update in memory, persist behind. See the note at the top of the file. */
  const write = useCallback((next: Settings, key: string, value: unknown) => {
    setSettings(next);
    void saveSetting(key, value);
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      loading,
      setSound: (event, choice) =>
        write(
          { ...settings, sounds: { ...settings.sounds, [event]: choice } },
          SETTING_KEYS.sound(event),
          choice,
        ),
      setLead: (which, seconds) =>
        write(
          { ...settings, leadSeconds: { ...settings.leadSeconds, [which]: seconds } },
          SETTING_KEYS.lead(which),
          seconds,
        ),
      setUseCustomColors: (on) =>
        write(
          { ...settings, colors: { ...settings.colors, useCustom: on } },
          SETTING_KEYS.colorsUseCustom,
          on,
        ),
      setColor: (which, hex) =>
        write(
          { ...settings, colors: { ...settings.colors, [which]: hex } },
          SETTING_KEYS.color(which),
          hex,
        ),
      setBarWeight: (kg) =>
        write(
          { ...settings, plates: { ...settings.plates, barKg: kg } },
          SETTING_KEYS.barWeight,
          kg,
        ),
      setAvailablePlates: (kg) =>
        write(
          { ...settings, plates: { ...settings.plates, availableKg: kg } },
          SETTING_KEYS.availablePlates,
          kg,
        ),
    }),
    [settings, loading, write],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/**
 * Read the settings.
 *
 * Throws outside the provider rather than falling back to the defaults. A
 * silent fallback would look like it worked — the player would simply ignore
 * every choice the user made, with nothing to explain why.
 */
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
