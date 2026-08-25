/**
 * Data access. All SQL lives here; screens only ever see domain objects.
 *
 * Reads assemble the nested Training → Block → Step shape the domain layer
 * expects. Writes are wrapped in transactions so a half-saved training can
 * never exist.
 */

import { Directory, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import { newBlockId, newStepId, newTrainingId } from '../domain/id';
import { asEquipment, asExerciseType } from '../domain/exerciseType';
import type {
  Block,
  Exercise,
  Session,
  SetLog,
  SetTarget,
  SetType,
  Step,
  Training,
} from '../domain/types';
import { DATABASE_NAME, MIGRATIONS } from './schema';

let db: SQLite.SQLiteDatabase | null = null;

export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await migrate(db);
  await cleanupOrphanedMedia(db);
  return db;
}

/**
 * Run pending migrations and record how far we got.
 *
 * `user_version` is bumped after EACH migration rather than once at the end, so
 * a failure halfway through a multi-step upgrade does not re-run the steps that
 * already succeeded on the next launch.
 */
async function migrate(conn: SQLite.SQLiteDatabase): Promise<void> {
  const row = await conn.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (let v = current; v < MIGRATIONS.length; v++) {
    await MIGRATIONS[v]!(conn);
    await conn.execAsync(`PRAGMA user_version = ${v + 1}`);
  }
}

/**
 * One-shot cleanup for the media migration v4 leaves behind.
 *
 * Deleting `exercises` rows (`PLAN_ui_fixes.md` A1) does not touch the photos
 * those rows pointed at — they live in the app's document directory, not the
 * database. Without this, every photo ever attached leaks silently on the
 * device that ran the v4 migration. Runs on every launch, but only ever does
 * work once: after the first run either the directory is gone or the table is
 * no longer empty (a user who deletes the wipe's aftermath and adds exercises
 * again should keep their new photos).
 */
async function cleanupOrphanedMedia(conn: SQLite.SQLiteDatabase): Promise<void> {
  const dir = new Directory(Paths.document, 'exercise-media');
  if (!dir.exists) return;
  const row = await conn.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM exercises');
  if ((row?.n ?? 0) > 0) return;
  try {
    dir.delete();
  } catch {
    // Best-effort: a locked or already-partial directory is not worth
    // failing app startup over.
  }
}

const json = (v: unknown) => JSON.stringify(v);
const parseTags = (v: string | null): string[] => {
  try {
    return v ? (JSON.parse(v) as string[]) : [];
  } catch {
    return [];
  }
};

/**
 * Read a `setTargets` column back into the domain shape.
 *
 * Defensive well past what the CHECK constraints require, for the same reason
 * `asExerciseType` is: this column is JSON, so nothing in SQLite can reject a
 * malformed value, and a row is only as trustworthy as every writer that has
 * ever touched it. An unreadable prescription becomes `undefined` — a step
 * with no target — rather than crashing the screen that renders it.
 */
const parseSetTargets = (v: string | null): SetTarget[] | undefined => {
  if (!v) return undefined;
  try {
    const parsed = JSON.parse(v) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const targets = parsed
      .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
      .map((t) => ({
        reps: typeof t.reps === 'number' ? t.reps : undefined,
        weightKg: typeof t.weightKg === 'number' ? t.weightKg : undefined,
        weightCount: typeof t.weightCount === 'number' ? t.weightCount : undefined,
        seconds: typeof t.seconds === 'number' ? t.seconds : undefined,
        distanceKm: typeof t.distanceKm === 'number' ? t.distanceKm : undefined,
      }));
    return targets.length > 0 ? targets : undefined;
  } catch {
    return undefined;
  }
};

// ── Exercises ──────────────────────────────────────────────────────────────

export async function listExercises(conn?: SQLite.SQLiteDatabase): Promise<Exercise[]> {
  const c = conn ?? (await openDatabase());
  const rows = await c.getAllAsync<Record<string, never>>(
    'SELECT * FROM exercises WHERE deletedAt IS NULL ORDER BY name COLLATE NOCASE',
  );
  return rows.map(rowToExercise);
}

export async function getExercise(
  id: string,
  conn?: SQLite.SQLiteDatabase,
): Promise<Exercise | null> {
  const c = conn ?? (await openDatabase());
  const row = await c.getFirstAsync<Record<string, never>>(
    'SELECT * FROM exercises WHERE id = ? AND deletedAt IS NULL',
    id,
  );
  return row ? rowToExercise(row) : null;
}

export async function upsertExercise(
  e: Exercise,
  conn?: SQLite.SQLiteDatabase,
): Promise<void> {
  const c = conn ?? (await openDatabase());
  await c.runAsync(
    `INSERT INTO exercises (id,name,type,equipment,tags,mediaUrl,mediaType,note,
                            defaultWeightKg,defaultWeightCount,createdAt,updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, type=excluded.type, equipment=excluded.equipment,
       tags=excluded.tags,
       mediaUrl=excluded.mediaUrl, mediaType=excluded.mediaType,
       note=excluded.note, defaultWeightKg=excluded.defaultWeightKg,
       defaultWeightCount=excluded.defaultWeightCount,
       updatedAt=excluded.updatedAt`,
    e.id,
    e.name,
    e.type,
    e.equipment ?? null,
    json(e.tags),
    e.mediaUrl ?? null,
    e.mediaType ?? null,
    e.note ?? null,
    e.defaultWeightKg ?? null,
    e.defaultWeightCount ?? null,
    e.createdAt,
    e.updatedAt,
  );
}

/** How many trainings reference this exercise — the library meta line, and the
 *  warning shown before deleting (handoff: "must warn and either block or detach"). */
export async function countTrainingsUsing(
  exerciseId: string,
  conn?: SQLite.SQLiteDatabase,
): Promise<number> {
  const c = conn ?? (await openDatabase());
  const row = await c.getFirstAsync<{ n: number }>(
    `SELECT COUNT(DISTINCT b.trainingId) AS n
       FROM steps s JOIN blocks b ON b.id = s.blockId
      WHERE s.exerciseId = ?`,
    exerciseId,
  );
  return row?.n ?? 0;
}

/**
 * The same count as `countTrainingsUsing`, for every exercise at once.
 *
 * The library screen used to call `countTrainingsUsing` inside a `map`, which
 * is one `SELECT` per exercise on every focus of the tab — 41 queries for a
 * 40-exercise library. It also made "sort by most used" impossible without the
 * list re-ordering under the user's thumb as the counts trickled in. One
 * `GROUP BY` returns the lot.
 *
 * Exercises used by no training are absent from the map rather than present
 * with a zero; callers read through `?? 0`.
 */
export async function usageCounts(
  conn?: SQLite.SQLiteDatabase,
): Promise<Map<string, number>> {
  const c = conn ?? (await openDatabase());
  const rows = await c.getAllAsync<{ exerciseId: string; n: number }>(
    `SELECT s.exerciseId AS exerciseId, COUNT(DISTINCT b.trainingId) AS n
       FROM steps s JOIN blocks b ON b.id = s.blockId
      GROUP BY s.exerciseId`,
  );
  return new Map(rows.map((r) => [r.exerciseId, r.n]));
}

export async function deleteExercise(id: string, conn?: SQLite.SQLiteDatabase): Promise<void> {
  const c = conn ?? (await openDatabase());
  const now = new Date().toISOString();
  await c.runAsync(
    'UPDATE exercises SET deletedAt = ?, updatedAt = ? WHERE id = ?',
    now,
    now,
    id,
  );
}

// ── Trainings ──────────────────────────────────────────────────────────────

export async function listTrainings(conn?: SQLite.SQLiteDatabase): Promise<Training[]> {
  const c = conn ?? (await openDatabase());
  const trainings = await c.getAllAsync<Record<string, never>>(
    'SELECT * FROM trainings WHERE deletedAt IS NULL ORDER BY updatedAt DESC',
  );
  return Promise.all(trainings.map((t) => hydrate(t, c)));
}

export async function getTraining(
  id: string,
  conn?: SQLite.SQLiteDatabase,
): Promise<Training | null> {
  const c = conn ?? (await openDatabase());
  const row = await c.getFirstAsync<Record<string, never>>(
    'SELECT * FROM trainings WHERE id = ? AND deletedAt IS NULL',
    id,
  );
  return row ? hydrate(row, c) : null;
}

export async function saveTraining(t: Training, conn?: SQLite.SQLiteDatabase): Promise<void> {
  const c = conn ?? (await openDatabase());
  await c.withTransactionAsync(async () => {
    await c.runAsync(
      `INSERT INTO trainings (id,name,prepareSeconds,createdAt,updatedAt)
       VALUES (?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name,
         prepareSeconds=excluded.prepareSeconds,
         updatedAt=excluded.updatedAt`,
      t.id,
      t.name,
      t.prepareSeconds,
      t.createdAt,
      t.updatedAt,
    );

    // Blocks and steps are rewritten wholesale: the builder edits a whole
    // training at a time, and CASCADE keeps orphans impossible.
    await c.runAsync('DELETE FROM blocks WHERE trainingId = ?', t.id);

    for (const [bi, b] of t.blocks.entries()) {
      await c.runAsync(
        `INSERT INTO blocks (id,trainingId,label,repeat,restBetweenRoundsSeconds,restAfterBlockSeconds,position,updatedAt)
         VALUES (?,?,?,?,?,?,?,?)`,
        b.id,
        t.id,
        b.label,
        b.repeat,
        b.restBetweenRoundsSeconds,
        b.restAfterBlockSeconds ?? 0,
        bi,
        t.updatedAt,
      );
      for (const [si, s] of b.steps.entries()) {
        await c.runAsync(
          `INSERT INTO steps (id,blockId,exerciseId,workSeconds,restAfterSeconds,setTargets,weightKg,weightCount,position,updatedAt)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          s.id,
          b.id,
          s.exerciseId,
          s.workSeconds,
          s.restAfterSeconds,
          // Likewise NULL rather than '[]': no prescription and an empty
          // prescription would otherwise be indistinguishable on read.
          s.setTargets && s.setTargets.length > 0 ? json(s.setTargets) : null,
          s.weightKg ?? null,
          s.weightCount ?? null,
          si,
          t.updatedAt,
        );
      }
    }
  });
}

/**
 * Copy a training, blocks and steps included.
 *
 * Every block and step id is regenerated. That is not tidiness — they are
 * primary keys, so reusing the source's would make the INSERT fail outright.
 * `exerciseId` is deliberately NOT regenerated: a copy points at the same
 * library entities, which is the whole point of having a library.
 *
 * `createdAt` is now. The copy is a new thing, not a restored old one.
 */
export async function duplicateTraining(
  id: string,
  name: string,
  conn?: SQLite.SQLiteDatabase,
): Promise<Training | null> {
  const c = conn ?? (await openDatabase());
  const source = await getTraining(id, c);
  if (!source) return null;

  const now = new Date().toISOString();
  const copy: Training = {
    ...source,
    id: newTrainingId(),
    name,
    createdAt: now,
    updatedAt: now,
    blocks: source.blocks.map((b) => ({
      ...b,
      id: newBlockId(),
      steps: b.steps.map((s) => ({ ...s, id: newStepId() })),
    })),
  };
  await saveTraining(copy, c);
  return copy;
}

export async function deleteTraining(id: string, conn?: SQLite.SQLiteDatabase): Promise<void> {
  const c = conn ?? (await openDatabase());
  await c.runAsync(
    'UPDATE trainings SET deletedAt = ?, updatedAt = ? WHERE id = ?',
    new Date().toISOString(),
    new Date().toISOString(),
    id,
  );
}

// ── Sessions ───────────────────────────────────────────────────────────────

export async function insertSession(s: Session, conn?: SQLite.SQLiteDatabase): Promise<void> {
  const c = conn ?? (await openDatabase());
  await c.runAsync(
    `INSERT INTO sessions
       (id,trainingId,trainingName,startedAt,endedAt,elapsedSeconds,workSeconds,restSeconds,
        roundsCompleted,roundsPlanned,skippedRests,completed,updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    s.id,
    s.trainingId,
    s.trainingName,
    s.startedAt,
    s.endedAt,
    s.elapsedSeconds,
    s.workSeconds,
    s.restSeconds,
    s.roundsCompleted,
    s.roundsPlanned,
    s.skippedRests,
    s.completed ? 1 : 0,
    new Date().toISOString(),
  );
}

/**
 * Update a session row in place.
 *
 * Exists because the logger writes its session at the START of the workout,
 * not at the end: `set_logs.sessionId` points at `sessions.id`, so the parent
 * row has to be there before the first set can be recorded. That ordering also
 * buys crash safety — an hour of logged sets survives the app being killed,
 * which a screen that only persists on Finish cannot promise.
 *
 * `trainingId` and `startedAt` are not updatable: they are what the
 * row IS, and a session that changes its own identity halfway through is a bug
 * with no legitimate caller.
 */
export async function updateSession(s: Session, conn?: SQLite.SQLiteDatabase): Promise<void> {
  const c = conn ?? (await openDatabase());
  await c.runAsync(
    `UPDATE sessions
        SET trainingName = ?, endedAt = ?, elapsedSeconds = ?, workSeconds = ?,
            restSeconds = ?, roundsCompleted = ?, roundsPlanned = ?,
            skippedRests = ?, completed = ?, updatedAt = ?
      WHERE id = ?`,
    s.trainingName,
    s.endedAt,
    s.elapsedSeconds,
    s.workSeconds,
    s.restSeconds,
    s.roundsCompleted,
    s.roundsPlanned,
    s.skippedRests,
    s.completed ? 1 : 0,
    new Date().toISOString(),
    s.id,
  );
}

export async function listSessions(
  limit = 50,
  conn?: SQLite.SQLiteDatabase,
): Promise<Session[]> {
  const c = conn ?? (await openDatabase());
  const rows = await c.getAllAsync<Record<string, never>>(
    'SELECT * FROM sessions ORDER BY startedAt DESC LIMIT ?',
    limit,
  );
  return rows.map(rowToSession);
}

export async function getSession(
  id: string,
  conn?: SQLite.SQLiteDatabase,
): Promise<Session | null> {
  const c = conn ?? (await openDatabase());
  const row = await c.getFirstAsync<Record<string, never>>(
    'SELECT * FROM sessions WHERE id = ?',
    id,
  );
  return row ? rowToSession(row) : null;
}

/**
 * Hard delete — unlike `deleteTraining`, `sessions` has no `deletedAt` column
 * to soft-delete into (schema.ts). History rows have nothing else pointing at
 * them (no foreign keys reference a session), so a real DELETE is safe.
 */
export async function deleteSession(id: string, conn?: SQLite.SQLiteDatabase): Promise<void> {
  const c = conn ?? (await openDatabase());
  await c.withTransactionAsync(async () => {
    // Explicit, even though `set_logs.sessionId` declares ON DELETE CASCADE.
    // `PRAGMA foreign_keys` is a PER-CONNECTION setting (see migration v4's
    // note, which learned this the same way), so the cascade cannot be relied
    // on to fire here. Orphaned logs would be invisible — no screen lists them
    // — and would skew every record and chart derived from them, permanently.
    await c.runAsync('DELETE FROM set_logs WHERE sessionId = ?', id);
    await c.runAsync('DELETE FROM sessions WHERE id = ?', id);
  });
}

// ── Set logs ───────────────────────────────────────────────────────────────

/**
 * Record one performed set.
 *
 * Upsert rather than insert, keyed on the unique index over
 * `(sessionId, stepId, roundIndex, setIndex)`: a fast double-tap on the check
 * is one set, not two, and a constraint catches that in code paths nobody
 * thought to guard.
 */
export async function upsertSetLog(log: SetLog, conn?: SQLite.SQLiteDatabase): Promise<void> {
  const c = conn ?? (await openDatabase());
  const now = new Date().toISOString();
  await c.runAsync(
    `INSERT INTO set_logs
       (id,sessionId,exerciseId,exerciseName,blockId,stepId,roundIndex,setIndex,
        reps,weightKg,weightCount,seconds,distanceKm,type,rpe,completedAt,updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(sessionId,stepId,roundIndex,setIndex) DO UPDATE SET
       reps=excluded.reps, weightKg=excluded.weightKg,
       weightCount=excluded.weightCount, seconds=excluded.seconds,
       distanceKm=excluded.distanceKm,
       type=excluded.type, rpe=excluded.rpe,
       completedAt=excluded.completedAt, updatedAt=excluded.updatedAt,
       deletedAt=NULL`,
    log.id,
    log.sessionId,
    log.exerciseId,
    log.exerciseName,
    log.blockId ?? null,
    log.stepId ?? null,
    log.roundIndex,
    log.setIndex,
    log.reps ?? null,
    log.weightKg ?? null,
    log.weightCount ?? null,
    log.seconds ?? null,
    log.distanceKm ?? null,
    log.type,
    log.rpe ?? null,
    log.completedAt,
    now,
  );
}

/** Un-tick a set. Soft, so a mis-tap is recoverable and sync stays coherent. */
export async function deleteSetLog(id: string, conn?: SQLite.SQLiteDatabase): Promise<void> {
  const c = conn ?? (await openDatabase());
  const now = new Date().toISOString();
  await c.runAsync(
    'UPDATE set_logs SET deletedAt = ?, updatedAt = ? WHERE id = ?',
    now,
    now,
    id,
  );
}

/** Everything logged in one session, in performed order. */
export async function listSetLogs(
  sessionId: string,
  conn?: SQLite.SQLiteDatabase,
): Promise<SetLog[]> {
  const c = conn ?? (await openDatabase());
  const rows = await c.getAllAsync<Record<string, never>>(
    `SELECT * FROM set_logs
      WHERE sessionId = ? AND deletedAt IS NULL
      ORDER BY roundIndex, setIndex, completedAt`,
    sessionId,
  );
  return rows.map(rowToSetLog);
}

/**
 * Every set logged since `since` (an ISO timestamp), across all exercises.
 *
 * Feeds the History tab's sets-per-tag bars, which look at a rolling window
 * rather than all time — "what have I trained lately" is the question, and an
 * all-time total answers a different one that stops changing after a year.
 */
export async function setLogsSince(
  since: string,
  conn?: SQLite.SQLiteDatabase,
): Promise<SetLog[]> {
  const c = conn ?? (await openDatabase());
  const rows = await c.getAllAsync<Record<string, never>>(
    `SELECT * FROM set_logs
      WHERE deletedAt IS NULL AND completedAt >= ?
      ORDER BY completedAt`,
    since,
  );
  return rows.map(rowToSetLog);
}

/**
 * Every set ever logged for one exercise, oldest first.
 *
 * Feeds the exercise detail screen's History and Records tabs. Unbounded on
 * purpose: records are computed on read (`domain/records.ts`), and at this
 * scale — a few thousand sets over years — the whole list is cheap to sweep,
 * exactly as `stats.ts` already sweeps every session for the streak.
 *
 * `excludeSessionId` exists for the live logger, which needs to know what the
 * records were BEFORE today in order to say a set just broke one.
 */
export async function setLogsForExercise(
  exerciseId: string,
  excludeSessionId?: string,
  conn?: SQLite.SQLiteDatabase,
): Promise<SetLog[]> {
  const c = conn ?? (await openDatabase());
  const rows = await c.getAllAsync<Record<string, never>>(
    `SELECT * FROM set_logs
      WHERE exerciseId = ? AND deletedAt IS NULL
        AND (? IS NULL OR sessionId != ?)
      ORDER BY completedAt`,
    exerciseId,
    excludeSessionId ?? null,
    excludeSessionId ?? null,
  );
  return rows.map(rowToSetLog);
}

/** The same, for several exercises at once — one query for a whole screen. */
export async function setLogsForExercises(
  exerciseIds: string[],
  excludeSessionId?: string,
  conn?: SQLite.SQLiteDatabase,
): Promise<Map<string, SetLog[]>> {
  const out = new Map<string, SetLog[]>();
  if (exerciseIds.length === 0) return out;

  const c = conn ?? (await openDatabase());
  const placeholders = exerciseIds.map(() => '?').join(',');
  const rows = await c.getAllAsync<Record<string, never>>(
    `SELECT * FROM set_logs
      WHERE deletedAt IS NULL
        AND exerciseId IN (${placeholders})
        AND (? IS NULL OR sessionId != ?)
      ORDER BY completedAt`,
    ...exerciseIds,
    excludeSessionId ?? null,
    excludeSessionId ?? null,
  );

  for (const row of rows) {
    const log = rowToSetLog(row);
    const bucket = out.get(log.exerciseId);
    if (bucket) bucket.push(log);
    else out.set(log.exerciseId, [log]);
  }
  return out;
}

/**
 * The "previous" column: the most recent logged sets for each of the given
 * exercises, from ANY training (decision D7).
 *
 * One query for the whole screen rather than one per row. A logger showing
 * five exercises over three rounds is fifteen rows, and fifteen round trips to
 * populate a column of grey hint text is not a trade worth making.
 *
 * Returns every log belonging to each exercise's most recent session, so the
 * caller can match on `roundIndex` and fall back to the last row — which is
 * the rule when the two trainings do not have the same number of rounds.
 */
export async function previousSetLogs(
  exerciseIds: string[],
  conn?: SQLite.SQLiteDatabase,
): Promise<Map<string, SetLog[]>> {
  const out = new Map<string, SetLog[]>();
  if (exerciseIds.length === 0) return out;

  const c = conn ?? (await openDatabase());
  const placeholders = exerciseIds.map(() => '?').join(',');
  const rows = await c.getAllAsync<Record<string, never>>(
    `SELECT * FROM set_logs
      WHERE deletedAt IS NULL
        AND exerciseId IN (${placeholders})
        AND sessionId = (
          SELECT sessionId FROM set_logs AS latest
           WHERE latest.exerciseId = set_logs.exerciseId
             AND latest.deletedAt IS NULL
           ORDER BY latest.completedAt DESC
           LIMIT 1
        )
      ORDER BY roundIndex, setIndex`,
    ...exerciseIds,
  );

  for (const row of rows) {
    const log = rowToSetLog(row);
    const bucket = out.get(log.exerciseId);
    if (bucket) bucket.push(log);
    else out.set(log.exerciseId, [log]);
  }
  return out;
}

export async function lastSessionFor(
  trainingId: string,
  conn?: SQLite.SQLiteDatabase,
): Promise<Session | null> {
  const c = conn ?? (await openDatabase());
  const row = await c.getFirstAsync<Record<string, never>>(
    'SELECT * FROM sessions WHERE trainingId = ? ORDER BY startedAt DESC LIMIT 1',
    trainingId,
  );
  return row ? rowToSession(row) : null;
}

// ── Row mapping ────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Narrow a stored string to `SetType`, falling back to `'normal'`.
 *
 * The CHECK constraints make an invalid value unreachable through this repo,
 * but a row is only as trustworthy as every writer that ever touched it — a
 * half-applied migration, a future sync, a hand-edited database during
 * debugging. `asExerciseType` and `asEquipment` do the same job for their
 * columns and live in `domain/exerciseType.ts`, next to the lists they check
 * against.
 */
function asSetType(v: unknown): SetType {
  return v === 'warmup' || v === 'drop' || v === 'failure' ? v : 'normal';
}

function rowToExercise(r: any): Exercise {
  return {
    id: r.id,
    name: r.name,
    type: asExerciseType(r.type),
    equipment: asEquipment(r.equipment),
    tags: parseTags(r.tags),
    mediaUrl: r.mediaUrl ?? undefined,
    mediaType: r.mediaType ?? undefined,
    note: r.note ?? undefined,
    defaultWeightKg: r.defaultWeightKg ?? undefined,
    defaultWeightCount: r.defaultWeightCount ?? undefined,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function rowToSession(r: any): Session {
  return {
    id: r.id,
    trainingId: r.trainingId,
    trainingName: r.trainingName,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    elapsedSeconds: r.elapsedSeconds,
    workSeconds: r.workSeconds,
    restSeconds: r.restSeconds,
    roundsCompleted: r.roundsCompleted,
    roundsPlanned: r.roundsPlanned,
    skippedRests: r.skippedRests,
    completed: r.completed === 1,
  };
}

function rowToSetLog(r: any): SetLog {
  return {
    id: r.id,
    sessionId: r.sessionId,
    exerciseId: r.exerciseId,
    exerciseName: r.exerciseName,
    blockId: r.blockId ?? undefined,
    stepId: r.stepId ?? undefined,
    roundIndex: r.roundIndex,
    setIndex: r.setIndex,
    reps: r.reps ?? undefined,
    weightKg: r.weightKg ?? undefined,
    weightCount: r.weightCount ?? undefined,
    seconds: r.seconds ?? undefined,
    distanceKm: r.distanceKm ?? undefined,
    type: asSetType(r.type),
    rpe: r.rpe ?? undefined,
    completedAt: r.completedAt,
  };
}

async function hydrate(r: any, c: SQLite.SQLiteDatabase): Promise<Training> {
  const blockRows = await c.getAllAsync<any>(
    'SELECT * FROM blocks WHERE trainingId = ? ORDER BY position',
    r.id,
  );
  const blocks: Block[] = [];
  for (const b of blockRows) {
    const stepRows = await c.getAllAsync<any>(
      'SELECT * FROM steps WHERE blockId = ? ORDER BY position',
      b.id,
    );
    const steps: Step[] = stepRows.map((s) => ({
      id: s.id,
      exerciseId: s.exerciseId,
      workSeconds: s.workSeconds,
      restAfterSeconds: s.restAfterSeconds,
      setTargets: parseSetTargets(s.setTargets ?? null),
      weightKg: s.weightKg ?? undefined,
      weightCount: s.weightCount ?? undefined,
    }));
    blocks.push({
      id: b.id,
      label: b.label,
      repeat: b.repeat,
      restBetweenRoundsSeconds: b.restBetweenRoundsSeconds,
      restAfterBlockSeconds: b.restAfterBlockSeconds ?? 0,
      steps,
    });
  }
  return {
    id: r.id,
    name: r.name,
    prepareSeconds: r.prepareSeconds,
    blocks,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
