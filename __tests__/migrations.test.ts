/**
 * Runs the real migrations against a real SQLite engine.
 *
 * Written after `ALTER TABLE ... DROP COLUMN IF EXISTS` shipped and blew up on
 * device with `near "EXISTS": syntax error`. SQLite has no such syntax, and
 * nothing in a typecheck or a screen test could have caught it — only executing
 * the SQL could.
 *
 * Node's built-in `node:sqlite` is the same engine expo-sqlite embeds, so it can
 * stand in for the device here. The adapter below is the whole of what
 * `MigrationDb` asks for.
 */

import { DatabaseSync } from 'node:sqlite';

import { MIGRATIONS, SCHEMA_VERSION, type MigrationDb } from '../src/db/schema';

function open(): { db: DatabaseSync; adapter: MigrationDb } {
  const db = new DatabaseSync(':memory:');
  const adapter: MigrationDb = {
    execAsync: async (sql: string) => {
      db.exec(sql);
    },
    getAllAsync: async <T,>(sql: string, ...params: unknown[]) =>
      db.prepare(sql).all(...(params as never[])) as T[],
  };
  return { db, adapter };
}

async function runAll(adapter: MigrationDb, from = 0, to = MIGRATIONS.length) {
  for (let v = from; v < to; v++) await MIGRATIONS[v]!(adapter);
}

const columnsOf = (db: DatabaseSync, table: string) =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

describe('migrations — fresh install', () => {
  it('runs every migration in order without throwing', async () => {
    const { adapter } = open();
    await expect(runAll(adapter)).resolves.not.toThrow();
  });

  it('has one migration per schema version', () => {
    // The two drift apart silently otherwise: a migration appended without
    // bumping the constant never runs on an upgrading device, because
    // `user_version` already equals MIGRATIONS.length.
    expect(MIGRATIONS).toHaveLength(SCHEMA_VERSION);
  });

  it('creates every table the app reads', async () => {
    const { db, adapter } = open();
    await runAll(adapter);
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    ).map((t) => t.name);
    for (const table of ['exercises', 'trainings', 'blocks', 'steps', 'sessions', 'settings']) {
      expect(tables).toContain(table);
    }
  });

  it('leaves exercises with no timing columns', async () => {
    const { db, adapter } = open();
    await runAll(adapter);
    const columns = columnsOf(db, 'exercises');
    expect(columns).toEqual(
      expect.arrayContaining(['id', 'name', 'tags', 'note', 'mediaUrl', 'mediaType']),
    );
    // Durations stay off the library entity: the same movement runs 45s in one
    // circuit and 60s in another, so a default here could only go stale.
    for (const gone of ['defaultWorkSeconds', 'defaultRestSeconds', 'defaultReps']) {
      expect(columns).not.toContain(gone);
    }
  });

  it('gives exercises back their weight defaults', async () => {
    // Deliberately the same column names v2 dropped. Weight is a property of
    // the movement — your 3 kg dumbbells are your 3 kg dumbbells — where a
    // duration is a property of the circuit. See domain/types.ts.
    const { db, adapter } = open();
    await runAll(adapter);
    expect(columnsOf(db, 'exercises')).toEqual(
      expect.arrayContaining(['type', 'defaultWeightKg', 'defaultWeightCount']),
    );
  });

  it('keeps weight on steps, where it belongs', async () => {
    const { db, adapter } = open();
    await runAll(adapter);
    expect(columnsOf(db, 'steps')).toEqual(
      expect.arrayContaining([
        'workSeconds',
        'restAfterSeconds',
        'setTargets',
        'weightKg',
        'weightCount',
      ]),
    );
    // v6 took `mode` away: a step no longer overrides how its exercise is
    // measured, because there is nothing left to override.
    expect(columnsOf(db, 'steps')).not.toContain('mode');
  });

  it('replaces the scalar targetReps with a per-round prescription', async () => {
    // v5. One number could not say "12 / 10 / 8", so it became a JSON array
    // indexed by round. The old column goes, or two readers of the same
    // prescription would be able to disagree about which one is current.
    const { db, adapter } = open();
    await runAll(adapter);
    expect(columnsOf(db, 'steps')).not.toContain('targetReps');
  });

  it('gives exercises an equipment column with no default', async () => {
    // Absent means UNSTATED, not bodyweight — defaulting every existing row
    // would put a guess in it. See domain/types.ts.
    const { db, adapter } = open();
    await runAll(adapter);
    expect(columnsOf(db, 'exercises')).toContain('equipment');
  });

  it('creates set_logs with a slot uniqueness constraint', async () => {
    // The double-tick guard: a fast double-tap on the check is one set, not
    // two, and a constraint survives a code path nobody thought to guard.
    const { db, adapter } = open();
    await runAll(adapter);
    expect(columnsOf(db, 'set_logs')).toEqual(
      expect.arrayContaining([
        'sessionId',
        'exerciseId',
        'exerciseName',
        'roundIndex',
        'setIndex',
        'reps',
        'type',
        'rpe',
      ]),
    );

    db.exec(
      `INSERT INTO sessions (id,trainingId,trainingName,startedAt,endedAt,
         elapsedSeconds,workSeconds,restSeconds,roundsCompleted,roundsPlanned,
         skippedRests,completed,updatedAt)
       VALUES ('se_1','tr_1','T','2026-01-01','2026-01-01',0,0,0,1,1,0,1,'2026-01-01')`,
    );
    const insert = (id: string) =>
      db.exec(
        `INSERT INTO set_logs (id,sessionId,exerciseId,exerciseName,stepId,
           roundIndex,setIndex,type,completedAt,updatedAt)
         VALUES ('${id}','se_1','ex_1','Curl','st_1',1,1,'normal','2026-01-01','2026-01-01')`,
      );
    insert('sl_1');
    expect(() => insert('sl_2')).toThrow();
  });

  it('is idempotent — a second full run changes nothing and does not throw', async () => {
    const { db, adapter } = open();
    await runAll(adapter);
    const before = columnsOf(db, 'exercises');
    await expect(runAll(adapter)).resolves.not.toThrow();

    // Compared as a SET, not a list. Column ORDER is not part of the schema
    // contract — every statement in `db/repo.ts` names its columns, and rows
    // are mapped by name — and a full re-run legitimately permutes it: v2
    // drops `defaultWeightKg`/`defaultWeightCount`, which v3 then re-adds at
    // the END of the table, now behind v5's `equipment`. On a real device
    // `user_version` means the second run never happens at all; this test
    // exercises a path the app does not take, so it should assert what the
    // app actually relies on.
    expect(columnsOf(db, 'exercises').sort()).toEqual([...before].sort());
  });

  it('is idempotent for the v3 additions specifically', async () => {
    // This is the case a naive `ALTER TABLE ... ADD COLUMN` fails, with
    // `duplicate column name: kind`. SQLite has no ADD COLUMN IF NOT EXISTS,
    // which is why `addColumns` reads PRAGMA table_info first.
    const { db, adapter } = open();
    await runAll(adapter);
    await expect(MIGRATIONS[2]!(adapter)).resolves.not.toThrow();
    expect(columnsOf(db, 'trainings').filter((c) => c === 'kind')).toHaveLength(1);
  });
});

describe('migrations — upgrading a v1 database', () => {
  /**
   * A database as v1 actually shipped it: every table, plus the five timing and
   * weight columns on `exercises` that v2 later removed.
   *
   * Built by running the real v1 migration and then adding the legacy columns
   * back, rather than by hand-writing one table. v3 touches `trainings`,
   * `steps` and `sessions` as well, so a fixture with only `exercises` in it
   * fails with `no such table` — and would have done so on a real device.
   */
  async function legacyV1() {
    const { db, adapter } = open();
    await MIGRATIONS[0]!(adapter);
    db.exec(`
      ALTER TABLE exercises ADD COLUMN defaultWorkSeconds INTEGER NOT NULL DEFAULT 45;
      ALTER TABLE exercises ADD COLUMN defaultRestSeconds INTEGER NOT NULL DEFAULT 20;
      ALTER TABLE exercises ADD COLUMN defaultReps        INTEGER;
      ALTER TABLE exercises ADD COLUMN defaultWeightKg    REAL;
      ALTER TABLE exercises ADD COLUMN defaultWeightCount INTEGER;
    `);
    return { db, adapter };
  }

  it('drops the timing columns from an existing database', async () => {
    const { db, adapter } = await legacyV1();
    expect(columnsOf(db, 'exercises')).toContain('defaultWorkSeconds');

    // Only v2 onwards run: user_version was already 1.
    await runAll(adapter, 1);

    expect(columnsOf(db, 'exercises')).not.toContain('defaultWorkSeconds');
    expect(columnsOf(db, 'exercises')).not.toContain('defaultRestSeconds');
    expect(columnsOf(db, 'exercises')).not.toContain('defaultReps');
  });

  it('preserves the rows already in the table', async () => {
    const { db, adapter } = await legacyV1();
    db.exec(`
      INSERT INTO exercises (id,name,tags,note,createdAt,updatedAt)
      VALUES ('ex-1','Squat saltati','["Gambe"]','Ginocchia dietro le punte','t0','t0');
    `);

    // Capped at v3: this checks that v2/v3 preserve row data through a column
    // change, a different concern from v4's deliberate wipe (see the "v4 ships
    // empty" suite below).
    await runAll(adapter, 1, 3);

    const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get('ex-1') as {
      name: string;
      note: string;
      tags: string;
    };
    expect(row.name).toBe('Squat saltati');
    expect(row.note).toBe('Ginocchia dietro le punte');
    expect(row.tags).toBe('["Gambe"]');
  });

  it('survives a half-migrated database, where some columns are already gone', async () => {
    const { db, adapter } = await legacyV1();
    db.exec('ALTER TABLE exercises DROP COLUMN defaultReps;');
    await expect(runAll(adapter, 1)).resolves.not.toThrow();
    expect(columnsOf(db, 'exercises')).not.toContain('defaultWorkSeconds');
  });

  it('survives a half-applied v3, where one column already landed', async () => {
    const { db, adapter } = await legacyV1();
    await MIGRATIONS[1]!(adapter);
    // A crash between two ALTERs leaves exactly this shape, and user_version
    // still says 2, so v3 runs again over it.
    db.exec(`ALTER TABLE trainings ADD COLUMN kind TEXT NOT NULL DEFAULT 'timed';`);
    await expect(runAll(adapter, 2)).resolves.not.toThrow();
    // v3 adds `kind` and `mode`; v6 takes all three away again and gives
    // exercises a `type` instead. Running the whole tail over a half-applied
    // v3 has to land on that end state, not throw halfway through it.
    expect(columnsOf(db, 'steps')).not.toContain('mode');
    expect(columnsOf(db, 'sessions')).not.toContain('kind');
    expect(columnsOf(db, 'trainings')).not.toContain('kind');
    expect(columnsOf(db, 'exercises')).toContain('type');
  });
});

describe('migrations — v3 defaults every existing row to timed', () => {
  it('marks pre-existing trainings, exercises and sessions as timed', async () => {
    const { db, adapter } = open();
    await MIGRATIONS[0]!(adapter);
    await MIGRATIONS[1]!(adapter);
    db.exec(`
      INSERT INTO exercises (id,name,tags,createdAt,updatedAt)
      VALUES ('ex-1','Affondi','["Gambe"]','t0','t0');
      INSERT INTO trainings (id,name,prepareSeconds,createdAt,updatedAt)
      VALUES ('tr-1','Circuito solo gambe',10,'t0','t0');
      INSERT INTO blocks (id,trainingId,label,repeat,restBetweenRoundsSeconds,position,updatedAt)
      VALUES ('bl-1','tr-1','Block A',3,60,0,'t0');
      INSERT INTO steps (id,blockId,exerciseId,workSeconds,restAfterSeconds,position,updatedAt)
      VALUES ('st-1','bl-1','ex-1',45,20,0,'t0');
      INSERT INTO sessions (id,trainingId,trainingName,startedAt,endedAt,elapsedSeconds,
                            workSeconds,restSeconds,roundsCompleted,roundsPlanned,updatedAt)
      VALUES ('ss-1','tr-1','Circuito solo gambe','t0','t0',655,405,250,3,3,'t0');
    `);

    // Capped at v3: this is about v3's defaulting behaviour, not v4's wipe.
    await runAll(adapter, 2, 3);

    const kindOf = (table: string, id: string) =>
      (db.prepare(`SELECT kind FROM ${table} WHERE id = ?`).get(id) as { kind: string }).kind;

    expect(kindOf('trainings', 'tr-1')).toBe('timed');
    expect(kindOf('exercises', 'ex-1')).toBe('timed');
    expect(kindOf('sessions', 'ss-1')).toBe('timed');
  });

  it('leaves step.mode NULL, which means "inherit from the exercise"', async () => {
    // NULL is the meaning, not a missing value: an exercise reclassified later
    // should update the steps that never disagreed with it.
    const { db, adapter } = open();
    await MIGRATIONS[0]!(adapter);
    await MIGRATIONS[1]!(adapter);
    db.exec(`
      INSERT INTO exercises (id,name,tags,createdAt,updatedAt) VALUES ('ex-1','x','[]','t0','t0');
      INSERT INTO trainings (id,name,prepareSeconds,createdAt,updatedAt) VALUES ('tr-1','x',10,'t0','t0');
      INSERT INTO blocks (id,trainingId,label,repeat,restBetweenRoundsSeconds,position,updatedAt)
      VALUES ('bl-1','tr-1','A',1,60,0,'t0');
      INSERT INTO steps (id,blockId,exerciseId,workSeconds,restAfterSeconds,position,updatedAt)
      VALUES ('st-1','bl-1','ex-1',45,20,0,'t0');
    `);

    // Capped at v3: this is about v3's defaulting behaviour, not v4's wipe.
    await runAll(adapter, 2, 3);

    const row = db.prepare('SELECT mode FROM steps WHERE id = ?').get('st-1') as {
      mode: string | null;
    };
    expect(row.mode).toBeNull();
  });

  it('refuses a kind that is neither timed nor reps', async () => {
    const { db, adapter } = open();
    await runAll(adapter);
    expect(() =>
      db.exec(`INSERT INTO trainings (id,name,kind,prepareSeconds,createdAt,updatedAt)
               VALUES ('bad','x','sideways',10,'t0','t0')`),
    ).toThrow();
  });
});

describe('migrations — v4 ships empty', () => {
  /** A v3 database holding one exercise, one training (with a block and a
   *  step) and one session — everything v4 is supposed to clear. */
  async function v3WithRows() {
    const { db, adapter } = open();
    await runAll(adapter, 0, 3);
    db.exec(`
      INSERT INTO exercises (id,name,kind,tags,createdAt,updatedAt)
      VALUES ('ex-1','Affondi','timed','["Gambe"]','t0','t0');
      INSERT INTO trainings (id,name,kind,prepareSeconds,createdAt,updatedAt)
      VALUES ('tr-1','Circuito solo gambe','timed',10,'t0','t0');
      INSERT INTO blocks (id,trainingId,label,repeat,restBetweenRoundsSeconds,position,updatedAt)
      VALUES ('bl-1','tr-1','Block A',3,60,0,'t0');
      INSERT INTO steps (id,blockId,exerciseId,workSeconds,restAfterSeconds,position,updatedAt)
      VALUES ('st-1','bl-1','ex-1',45,20,0,'t0');
      INSERT INTO sessions (id,trainingId,trainingName,kind,startedAt,endedAt,elapsedSeconds,
                            workSeconds,restSeconds,roundsCompleted,roundsPlanned,updatedAt)
      VALUES ('ss-1','tr-1','Circuito solo gambe','timed','t0','t0',655,405,250,3,3,'t0');
      INSERT INTO settings (key,value,updatedAt) VALUES ('sound.roundStart','"bell"','t0');
    `);
    return { db, adapter };
  }

  const countOf = (db: DatabaseSync, table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

  it('empties every workout table, leaving settings untouched', async () => {
    const { db, adapter } = await v3WithRows();
    await runAll(adapter, 3);

    for (const table of ['steps', 'blocks', 'trainings', 'sessions', 'exercises']) {
      expect(countOf(db, table)).toBe(0);
    }
    expect(countOf(db, 'settings')).toBe(1);
  });

  it('is idempotent — re-running v4 on an already-empty database is a no-op', async () => {
    const { db, adapter } = await v3WithRows();
    await runAll(adapter, 3);
    await expect(runAll(adapter, 3)).resolves.not.toThrow();
    for (const table of ['steps', 'blocks', 'trainings', 'sessions', 'exercises']) {
      expect(countOf(db, table)).toBe(0);
    }
  });
});

describe('migrations — v5 backfills the per-round prescription', () => {
  /**
   * The one migration in the set that MOVES data rather than only reshaping
   * the table. A step that said "10 reps" has to still say it afterwards, or
   * the upgrade silently empties every rep target the user ever entered.
   */
  async function v4WithAStep() {
    const { db, adapter } = open();
    await runAll(adapter, 0, 4);
    db.exec(
      `INSERT INTO trainings (id,name,prepareSeconds,createdAt,updatedAt)
       VALUES ('tr_1','Braccia',10,'2026-01-01','2026-01-01')`,
    );
    db.exec(
      `INSERT INTO blocks (id,trainingId,label,repeat,restBetweenRoundsSeconds,position,updatedAt)
       VALUES ('bl_1','tr_1','Block A',3,60,0,'2026-01-01')`,
    );
    db.exec(
      `INSERT INTO exercises (id,name,createdAt,updatedAt)
       VALUES ('ex_1','Curl bicipiti','2026-01-01','2026-01-01')`,
    );
    db.exec(
      `INSERT INTO steps (id,blockId,exerciseId,workSeconds,restAfterSeconds,targetReps,position,updatedAt)
       VALUES ('st_1','bl_1','ex_1',45,20,10,0,'2026-01-01')`,
    );
    db.exec(
      `INSERT INTO steps (id,blockId,exerciseId,workSeconds,restAfterSeconds,targetReps,position,updatedAt)
       VALUES ('st_2','bl_1','ex_1',45,20,NULL,1,'2026-01-01')`,
    );
    return { db, adapter };
  }

  const targetsOf = (db: DatabaseSync, id: string) =>
    (db.prepare('SELECT setTargets FROM steps WHERE id = ?').get(id) as {
      setTargets: string | null;
    }).setTargets;

  it('turns a scalar rep target into a one-entry prescription', async () => {
    const { db, adapter } = await v4WithAStep();
    await runAll(adapter, 4);
    // One target means "every round" — which is exactly what the old scalar
    // meant, so the upgrade changes the representation and not the workout.
    expect(JSON.parse(targetsOf(db, 'st_1')!)).toEqual([{ reps: 10 }]);
  });

  it('leaves a step that never had a target with none', async () => {
    const { db, adapter } = await v4WithAStep();
    await runAll(adapter, 4);
    expect(targetsOf(db, 'st_2')).toBeNull();
  });

  it('survives being run twice, even though it drops the column it reads', async () => {
    // The failure this guards against is not hypothetical: the first version
    // of v5 backfilled with a plain `sql()` step and died on the second pass
    // with `no such column: targetReps` — taking the whole launch with it.
    const { db, adapter } = await v4WithAStep();
    await runAll(adapter, 4);
    await expect(runAll(adapter, 4)).resolves.not.toThrow();
    expect(JSON.parse(targetsOf(db, 'st_1')!)).toEqual([{ reps: 10 }]);
  });

  it('never overwrites a prescription the user has since authored', async () => {
    const { db, adapter } = await v4WithAStep();
    await runAll(adapter, 4);
    db.exec(
      `UPDATE steps SET setTargets = '[{"reps":12},{"reps":10},{"reps":8}]' WHERE id = 'st_1'`,
    );
    await runAll(adapter, 4);
    expect(JSON.parse(targetsOf(db, 'st_1')!)).toHaveLength(3);
  });
});
