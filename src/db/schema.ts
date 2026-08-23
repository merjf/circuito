/**
 * SQLite schema and migrations.
 *
 * Local-first: this database is the source of truth and the app is fully usable
 * signed out. Every table carries `updatedAt` and rows are soft-deleted via
 * `deletedAt`, so the phase-8 sync layer can do a last-write-wins reconcile
 * without any schema change. Ids are client-generated UUIDs for the same reason
 * — two devices must never collide.
 *
 * Blocks and steps are stored as ordinary rows with an explicit `position`
 * rather than as a JSON blob, so that drag-reordering is one UPDATE and a
 * future sync can merge at row granularity.
 *
 * A migration is a FUNCTION, not a SQL string. It has to be: SQLite has no
 * `DROP COLUMN IF EXISTS`, so a migration that removes a column can only be
 * written safely by inspecting `PRAGMA table_info` first and dropping what is
 * actually there. Plain SQL steps use the `sql()` helper.
 */

export const DATABASE_NAME = 'interval-trainer.db';

/**
 * The minimum a migration needs from a database handle. Kept structural rather
 * than importing SQLiteDatabase so these can be exercised against any SQLite
 * binding — which is how `__tests__/migrations.test.ts` runs them for real.
 */
export interface MigrationDb {
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
}

export type Migration = (db: MigrationDb) => Promise<void>;

/** Wraps a plain SQL step as a migration. */
const sql =
  (statements: string): Migration =>
  async (db) => {
    await db.execAsync(statements);
  };

/**
 * Drop columns that exist, skip those that do not.
 *
 * SQLite rejects `DROP COLUMN IF EXISTS` outright — `near "EXISTS": syntax
 * error` — and plain `DROP COLUMN` throws `no such column` if it has already
 * gone. Neither is safe to run blind against a database whose history we do not
 * know, so the columns present are read first.
 */
const dropColumns =
  (table: string, columns: string[]): Migration =>
  async (db) => {
    const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    const present = new Set(info.map((c) => c.name));
    for (const column of columns) {
      if (present.has(column)) {
        await db.execAsync(`ALTER TABLE ${table} DROP COLUMN ${column};`);
      }
    }
  };

/**
 * Add columns that are missing, skip those already there.
 *
 * The mirror image of `dropColumns`, and needed for the same reason: SQLite has
 * no `ADD COLUMN IF NOT EXISTS`, and a plain `ADD COLUMN` throws `duplicate
 * column name` on second sight. `user_version` normally makes a re-run
 * impossible, but the v2 experience was that "normally" is doing a lot of work
 * in that sentence — a migration that half-applied leaves a database no version
 * number describes. Idempotent steps cost one PRAGMA and remove the failure
 * mode entirely.
 *
 * NOTE the deliberate asymmetry with `sql()`: `CREATE TABLE IF NOT EXISTS` is
 * real SQLite syntax, so table creation needs no helper. Only columns do.
 */
const addColumns =
  (table: string, columns: Record<string, string>): Migration =>
  async (db) => {
    const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    const present = new Set(info.map((c) => c.name));
    for (const [name, definition] of Object.entries(columns)) {
      if (!present.has(name)) {
        await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition};`);
      }
    }
  };

/**
 * Copy the old scalar `targetReps` into the new `setTargets` JSON array.
 *
 * A function rather than a `sql()` step, and for the same reason `dropColumns`
 * is one: it has to survive being run twice. `user_version` normally makes
 * that impossible, but v2's experience was that "normally" is doing a lot of
 * work in that sentence — and this one is worse than most, because the very
 * next step in v5 DROPS the column this statement reads. A re-run therefore
 * fails with `no such column: targetReps` and takes the whole launch with it.
 *
 * `setTargets IS NULL` is a second guard with a different job: it makes sure a
 * backfill can never overwrite a prescription the user has since authored.
 */
const backfillSetTargets: Migration = async (db) => {
  const info = await db.getAllAsync<{ name: string }>('PRAGMA table_info(steps)');
  const present = new Set(info.map((c) => c.name));
  if (!present.has('targetReps') || !present.has('setTargets')) return;

  await db.execAsync(`
    UPDATE steps
       SET setTargets = '[{"reps":' || CAST(targetReps AS INTEGER) || '}]'
     WHERE targetReps IS NOT NULL AND targetReps > 0 AND setTargets IS NULL;
  `);
};

/**
 * Run a statement only when every column it names still exists.
 *
 * The v5 lesson, generalised. A `sql()` step that reads a column another step
 * in the same migration drops will run once and then fail forever — and
 * because `user_version` is bumped per migration, "forever" means every launch
 * after a half-applied upgrade. Guarding on `PRAGMA table_info` costs one read
 * and removes the failure mode.
 */
const whenColumns =
  (table: string, required: string[], statements: string): Migration =>
  async (db) => {
    const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    const present = new Set(info.map((c) => c.name));
    if (!required.every((column) => present.has(column))) return;
    await db.execAsync(statements);
  };

/** Run several migrations as one version step. */
const steps =
  (...migrations: Migration[]): Migration =>
  async (db) => {
    for (const m of migrations) await m(db);
  };

/** Bump for every migration and append to MIGRATIONS below. */
export const SCHEMA_VERSION = 6;

export const MIGRATIONS: Migration[] = [
  // v1 — initial schema
  sql(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS exercises (
    id                  TEXT PRIMARY KEY NOT NULL,
    name                TEXT NOT NULL,
    tags                TEXT NOT NULL DEFAULT '[]',   -- JSON array
    mediaUrl            TEXT,
    mediaType           TEXT CHECK (mediaType IN ('photo','video')),
    note                TEXT,
    createdAt           TEXT NOT NULL,
    updatedAt           TEXT NOT NULL,
    deletedAt           TEXT
  );

  CREATE TABLE IF NOT EXISTS trainings (
    id              TEXT PRIMARY KEY NOT NULL,
    name            TEXT NOT NULL,
    prepareSeconds  INTEGER NOT NULL DEFAULT 10,
    createdAt       TEXT NOT NULL,
    updatedAt       TEXT NOT NULL,
    deletedAt       TEXT
  );

  CREATE TABLE IF NOT EXISTS blocks (
    id                        TEXT PRIMARY KEY NOT NULL,
    trainingId                TEXT NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
    label                     TEXT NOT NULL,
    repeat                    INTEGER NOT NULL DEFAULT 1,
    restBetweenRoundsSeconds  INTEGER NOT NULL DEFAULT 60,
    position                  INTEGER NOT NULL,
    updatedAt                 TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS steps (
    id                TEXT PRIMARY KEY NOT NULL,
    blockId           TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    exerciseId        TEXT NOT NULL REFERENCES exercises(id),
    workSeconds       INTEGER NOT NULL,
    restAfterSeconds  INTEGER NOT NULL DEFAULT 0,
    targetReps        INTEGER,
    weightKg          REAL,               -- kg; NULL = bodyweight
    weightCount       INTEGER,            -- how many weights of weightKg; NULL = 1
    position          INTEGER NOT NULL,
    updatedAt         TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id               TEXT PRIMARY KEY NOT NULL,
    trainingId       TEXT NOT NULL,
    trainingName     TEXT NOT NULL,   -- denormalised: history outlives renames
    startedAt        TEXT NOT NULL,
    endedAt          TEXT NOT NULL,
    elapsedSeconds   INTEGER NOT NULL,
    workSeconds      INTEGER NOT NULL,
    restSeconds      INTEGER NOT NULL,
    roundsCompleted  INTEGER NOT NULL,
    roundsPlanned    INTEGER NOT NULL,
    skippedRests     INTEGER NOT NULL DEFAULT 0,
    completed        INTEGER NOT NULL DEFAULT 0,
    updatedAt        TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_blocks_training ON blocks(trainingId, position);
  CREATE INDEX IF NOT EXISTS idx_steps_block     ON steps(blockId, position);
  CREATE INDEX IF NOT EXISTS idx_steps_exercise  ON steps(exerciseId);
  CREATE INDEX IF NOT EXISTS idx_sessions_start  ON sessions(startedAt DESC);
  `),

  // v2 — an exercise is a movement, not a prescription.
  //
  // Timing left the library entity (see `domain/types.ts`): work, rest, reps and
  // weight belong to the step, because the same movement runs for different
  // durations in different circuits. Written as a migration rather than an edit
  // to v1 so a database created before this change is repaired in place instead
  // of needing the app reinstalled — and as a conditional drop, because on a
  // fresh install v1 never created these columns at all.
  dropColumns('exercises', [
    'defaultWorkSeconds',
    'defaultRestSeconds',
    'defaultReps',
    'defaultWeightKg',
    'defaultWeightCount',
  ]),

  // v3 — two kinds of training, two kinds of exercise, and a settings store.
  //
  // Entirely additive, which is what makes it safe: every existing row keeps
  // working because `kind` defaults to 'timed', which is the only kind that
  // existed before. Nothing is dropped and nothing is rewritten.
  //
  // `defaultWeightKg` / `defaultWeightCount` are the same column names v2 just
  // dropped. That is not an accident and not a mistake: weight defaults are
  // coming back deliberately (2026-08-16 — an exercise carries defaults, a step
  // carries the truth), and re-using the obvious name beats inventing a synonym
  // to dodge the history. Order is what makes it safe — v2 runs before v3 on an
  // upgrading database, and no-ops on a fresh one where v1 never made them.
  steps(
    addColumns('trainings', {
      // The DEFAULT is doing the entire upgrade for existing rows.
      kind: `TEXT NOT NULL DEFAULT 'timed' CHECK (kind IN ('timed','reps'))`,
    }),
    addColumns('exercises', {
      kind: `TEXT NOT NULL DEFAULT 'timed' CHECK (kind IN ('timed','reps'))`,
      defaultWeightKg: 'REAL',
      defaultWeightCount: 'INTEGER',
    }),
    addColumns('steps', {
      // NULL = inherit from the exercise. No default, and no NOT NULL: the
      // absence is the meaning. See `stepMode()`.
      mode: `TEXT CHECK (mode IN ('timed','reps'))`,
    }),
    addColumns('sessions', {
      kind: `TEXT NOT NULL DEFAULT 'timed' CHECK (kind IN ('timed','reps'))`,
    }),
    // Key/value rather than a wide row so that adding a setting is never a
    // migration. Values are JSON so a setting can grow from a string to an
    // object without touching the schema either.
    sql(`
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY NOT NULL,
      value      TEXT NOT NULL,          -- JSON-encoded
      updatedAt  TEXT NOT NULL
    );
    `),
  ),

  // v4 — ship empty. Wipes every workout row so the app stops launching with
  // the two seeded Italian circuits (`PLAN_ui_fixes.md` A1).
  //
  // Explicit DELETEs in dependency order, rather than relying on
  // `ON DELETE CASCADE`: `PRAGMA foreign_keys` is a per-connection setting, so
  // a migration cannot assume the connection it happens to run on has it
  // turned on. `settings` is deliberately untouched — sounds and colours are
  // preferences, not workout data, and the user should not have to redo them.
  // Runs exactly once per database: `user_version` is bumped after this
  // migration like every other, so it never re-deletes on a later launch.
  sql(`
  DELETE FROM steps;
  DELETE FROM blocks;
  DELETE FROM trainings;
  DELETE FROM sessions;
  DELETE FROM exercises;
  `),

  // v5 — the plan gets per-round targets, the library gets equipment, and the
  // app gets somewhere to record what actually happened.
  //
  // Three changes that ship together because they are one feature: reps
  // trainings become loggable (`PLAN_hevy_integration.md` §1). The screen that
  // uses `set_logs` deliberately lands in a LATER build — a migration is worth
  // shipping on its own, so that if it goes wrong it is not tangled up with a
  // new screen.
  steps(
    // ── setTargets ────────────────────────────────────────────────────────
    // `targetReps` was one number, which cannot say "12 / 10 / 8". The
    // replacement is a JSON array indexed by round; see `Step.setTargets`.
    //
    // Backfilled before the old column goes, so no prescription is lost: a
    // step that said 12 now says [{"reps":12}], which means the same thing —
    // one target, every round.
    addColumns('steps', { setTargets: 'TEXT' }),
    backfillSetTargets,
    dropColumns('steps', ['targetReps']),

    // ── equipment ─────────────────────────────────────────────────────────
    // No DEFAULT on purpose. Existing rows become NULL, which reads as
    // "unstated" — the honest answer for an exercise nobody has classified.
    // Defaulting them to 'bodyweight' would put a guess in every row.
    addColumns('exercises', {
      equipment: `TEXT CHECK (equipment IN ('bodyweight','dumbbell','barbell','kettlebell','machine','band','other'))`,
    }),

    // ── set_logs ──────────────────────────────────────────────────────────
    // What was actually done, as opposed to what was planned. The plan lives
    // on `steps`; nothing here ever writes back to it.
    //
    // `exerciseId` is deliberately NOT a foreign key, and `exerciseName` is
    // denormalised beside it — the same reasoning that already put
    // `trainingName` on `sessions`. An exercise can be deleted once no
    // training uses it, and history that loses its labels is history nobody
    // can read.
    //
    // The unique index is the double-tick guard: a fast double-tap on the
    // check would otherwise write the same set twice, and a constraint
    // survives a code path nobody thought of.
    sql(`
    CREATE TABLE IF NOT EXISTS set_logs (
      id            TEXT PRIMARY KEY NOT NULL,
      sessionId     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      exerciseId    TEXT NOT NULL,
      exerciseName  TEXT NOT NULL,   -- denormalised: history outlives deletes
      blockId       TEXT,
      stepId        TEXT,
      roundIndex    INTEGER NOT NULL,
      setIndex      INTEGER NOT NULL,
      reps          INTEGER,
      weightKg      REAL,
      weightCount   INTEGER,
      type          TEXT NOT NULL DEFAULT 'normal'
                    CHECK (type IN ('normal','warmup','drop','failure')),
      rpe           REAL,
      completedAt   TEXT NOT NULL,
      updatedAt     TEXT NOT NULL,
      deletedAt     TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_set_logs_slot
      ON set_logs(sessionId, stepId, roundIndex, setIndex);
    CREATE INDEX IF NOT EXISTS idx_set_logs_session
      ON set_logs(sessionId);
    CREATE INDEX IF NOT EXISTS idx_set_logs_exercise
      ON set_logs(exerciseId, completedAt DESC);
    `),
  ),

  // v6 — the timed/reps split is deleted, and measurement moves to the
  // exercise.
  //
  // `Training.kind`, `Step.mode` and `Session.kind` all encoded one idea: is
  // this whole thing on a clock. That made a bench press and a 50-second
  // battle-rope set unable to share a circuit, which is the ordinary shape of
  // a real workout. `Exercise.type` replaces them — see
  // `domain/exerciseType.ts`.
  //
  // This is the destructive one. Three columns go, and the mapping into
  // `type` is a judgement rather than a copy, so the backfill is spelled out
  // rather than being a CASE nobody can read six months from now.
  steps(
    addColumns('exercises', { type: 'TEXT' }),

    // 'timed' meant "runs on a clock" — that is exactly `duration`.
    // 'reps' meant "counted", which splits on whether the exercise carries a
    // weight: a curl with 3 kg defaults is Weight & Reps, a sit-up is
    // Bodyweight Reps. Guessing wrong here is cheap to correct in the form and
    // much better than dumping everything into one type.
    whenColumns(
      'exercises',
      ['kind', 'type', 'defaultWeightKg'],
      `
      UPDATE exercises
         SET type = CASE
           WHEN kind = 'timed' THEN 'duration'
           WHEN defaultWeightKg IS NOT NULL AND defaultWeightKg > 0 THEN 'weightReps'
           ELSE 'bodyweightReps'
         END
       WHERE type IS NULL;
      `,
    ),
    // Anything that somehow reached here without a kind still needs an answer.
    whenColumns(
      'exercises',
      ['type'],
      `UPDATE exercises SET type = 'weightReps' WHERE type IS NULL;`,
    ),
    dropColumns('exercises', ['kind']),

    // ── equipment: widen the vocabulary ───────────────────────────────────
    // v5 shipped `equipment` with a CHECK constraint listing seven values.
    // SQLite cannot alter a CHECK without rebuilding the table, and the list
    // has grown (plate, suspension band, cord) — so the column is rebuilt
    // through a temporary one, and comes back WITHOUT a CHECK.
    //
    // Dropping the constraint is deliberate. `asEquipment` in `db/repo.ts`
    // already narrows the value on read and falls back to undefined, so the
    // CHECK was buying a guarantee the repo provides anyway — at the price of
    // a table rebuild every time the list grows.
    addColumns('exercises', { equipmentNext: 'TEXT' }),
    whenColumns(
      'exercises',
      ['equipment', 'equipmentNext'],
      `
      UPDATE exercises
         SET equipmentNext = CASE equipment
           WHEN 'bodyweight' THEN 'none'
           WHEN 'band' THEN 'resistanceBand'
           ELSE equipment
         END
       WHERE equipment IS NOT NULL AND equipmentNext IS NULL;
      `,
    ),
    dropColumns('exercises', ['equipment']),
    addColumns('exercises', { equipment: 'TEXT' }),
    whenColumns(
      'exercises',
      ['equipment', 'equipmentNext'],
      `
      UPDATE exercises
         SET equipment = equipmentNext
       WHERE equipmentNext IS NOT NULL AND equipment IS NULL;
      `,
    ),
    dropColumns('exercises', ['equipmentNext']),

    // A step no longer overrides how it is measured — the exercise decides,
    // everywhere, always.
    dropColumns('steps', ['mode']),
    dropColumns('trainings', ['kind']),
    // History does not need it either: every reader already branches on
    // `elapsedSeconds` rather than on a stored kind (see the R5 note).
    dropColumns('sessions', ['kind']),

    // What a timed or distance set actually recorded.
    addColumns('set_logs', { seconds: 'REAL', distanceKm: 'REAL' }),
  ),
];
