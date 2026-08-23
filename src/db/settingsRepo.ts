/**
 * Settings IO.
 *
 * Kept out of `repo.ts` because settings are a different animal: a handful of
 * scalar rows read once at launch and written one at a time, with no ordering,
 * no cascade and no transaction story. Mixing them into the training queries
 * would earn nothing but a longer file.
 *
 * The shape, the defaults and the validation live in `domain/settings.ts`. This
 * module only moves values in and out, and its one real job is to never let a
 * bad row become an exception during app start.
 */

import * as SQLite from 'expo-sqlite';

import {
  DEFAULT_SETTINGS,
  settingsFromRows,
  settingsToRows,
  type Settings,
} from '../domain/settings';
import { openDatabase } from './repo';

/**
 * Read every setting, falling back per leaf.
 *
 * A row whose JSON does not parse is skipped rather than thrown on, which lets
 * `settingsFromRows` supply that one default and keeps the other five working.
 * Losing the whole settings screen because one value got mangled would be a bad
 * trade, and this runs on the launch path.
 */
export async function loadSettings(conn?: SQLite.SQLiteDatabase): Promise<Settings> {
  const c = conn ?? (await openDatabase());
  const rows = await c.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings',
  );

  const parsed: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      parsed[row.key] = JSON.parse(row.value);
    } catch {
      // Leave it absent; the default applies.
    }
  }

  return settingsFromRows(parsed);
}

/**
 * Write one setting.
 *
 * One row at a time is the whole point of the key/value shape: changing a sound
 * must not rewrite the colours, so that two screens editing different settings
 * can never clobber each other.
 */
export async function saveSetting(
  key: string,
  value: unknown,
  conn?: SQLite.SQLiteDatabase,
): Promise<void> {
  const c = conn ?? (await openDatabase());
  await c.runAsync(
    `INSERT INTO settings (key,value,updatedAt) VALUES (?,?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedAt=excluded.updatedAt`,
    key,
    JSON.stringify(value),
    new Date().toISOString(),
  );
}

/** Write a whole Settings object. Used by "reset to defaults". */
export async function saveAllSettings(
  settings: Settings,
  conn?: SQLite.SQLiteDatabase,
): Promise<void> {
  const c = conn ?? (await openDatabase());
  const rows = Object.entries(settingsToRows(settings));
  const now = new Date().toISOString();
  await c.withTransactionAsync(async () => {
    for (const [key, value] of rows) {
      await c.runAsync(
        `INSERT INTO settings (key,value,updatedAt) VALUES (?,?,?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedAt=excluded.updatedAt`,
        key,
        JSON.stringify(value),
        now,
      );
    }
  });
}

export async function resetSettings(conn?: SQLite.SQLiteDatabase): Promise<void> {
  await saveAllSettings(DEFAULT_SETTINGS, conn);
}
