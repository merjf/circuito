/**
 * 1f — Exercise detail, and the create/edit surface for a library exercise.
 *
 * An exercise is a movement, not a prescription: **name, description, media**,
 * and tags for the library filter. No work / rest / reps — those belong to a
 * step in a training, because the same movement runs for different durations in
 * different circuits (settled with the user 2026-08-15, replacing the handoff's
 * three stat cards on this screen).
 *
 * `id === 'new'` opens an empty one. The mock is read-only behind an "Edit"
 * action; rather than build a second near-identical screen, the fields here are
 * editable in place and saved on blur.
 *
 * Media capture uses `expo-image-picker`, and the file is copied into the app's
 * document directory rather than referenced where the picker left it: a URI
 * from the photo library is not guaranteed to still resolve next week.
 */

import * as ImagePicker from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  BinButton,
  FilterPill,
  MediaPlaceholder,
  MiniStepper,
  MonoLabel,
  ScreenHeader,
  StatCard,
  SunkenRow,
} from '@/components/ui';
import { EQUIPMENT_ART } from '@/domain/equipmentArt';
import {
  asEquipment,
  asExerciseType,
  EQUIPMENT_LABELS,
  TYPE_COPY,
} from '@/domain/exerciseType';
import { cancelPick, expectPick } from '@/nav/pickerHandoff';
import { formatWeight } from '@/domain/weight';
import {
  deleteExercise,
  getExercise,
  listExercises,
  listTrainings,
  setLogsForExercise,
  upsertExercise,
} from '@/db/repo';
import { formatDayDate } from '@/domain/dates';
import { formatLog } from '@/domain/logging';
import { estimatedOneRepMax, recordsFor, setVolume } from '@/domain/records';
import type { SetLog } from '@/domain/types';
import { joinNames } from '@/domain/format';
import { newExerciseId } from '@/domain/id';
import type { Exercise, Training } from '@/domain/types';

/**
 * Sentence case for the pills. The stored values are lowercase identifiers and
 * stay that way — this is the one place they become words on a screen.
 */
type TabId = 'about' | 'history' | 'records';

/**
 * There used to be two reasons a history could be empty, and one of them was
 * "this exercise only ever appears in timed circuits, which record nothing".
 * That reason is gone: there is one logger now and it records every type. So
 * an empty history means exactly one thing, and says it.
 */
const EMPTY_COPY = 'Nothing logged yet. Start a workout and tick a set.';

const TAB_LABELS: Record<TabId, string> = {
  about: 'About',
  history: 'History',
  records: 'Records',
};

import { color, radius, size, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

/**
 * Keep the weight pair coherent.
 *
 * A count without a weight is meaningless — "2 of nothing" — and a weight with
 * no count reads as a single one. So clearing the kilograms clears both, and
 * naming a weight without a count implies one.
 */
function withWeight(
  exercise: Exercise,
  kg: number | undefined,
  count: number | undefined,
): Exercise {
  if (!kg) return { ...exercise, defaultWeightKg: undefined, defaultWeightCount: undefined };
  return { ...exercise, defaultWeightKg: kg, defaultWeightCount: count && count > 0 ? count : 1 };
}

/** Reads the pair back the way it will appear on a step: "2 × 3 kg". */
function weightHint(exercise: Exercise): string {
  if (!exercise.defaultWeightKg) return "Bodyweight — no weight prefilled";
  return `Prefills ${formatWeight({
    kg: exercise.defaultWeightKg,
    count: exercise.defaultWeightCount ?? 1,
  })} on a new step`;
}

function blank(): Exercise {
  const now = new Date().toISOString();
  return {
    id: newExerciseId(),
    name: '',
    // Weight and reps, because most movements are — and because the type row
    // below shows what it is, so a wrong default is visible and one tap from
    // corrected rather than silently assumed.
    type: 'weightReps',
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [usedIn, setUsedIn] = useState<Training[]>([]);
  const [confirm, setConfirm] = useState<'delete' | 'blocked' | 'removeMedia' | null>(null);
  const [blockingTrainings, setBlockingTrainings] = useState<Training[]>([]);
  const [mediaError, setMediaError] = useState(false);
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  // Every tag already used anywhere in the library, offered as one-tap chips
  // above the free-text field — the field itself sits at the bottom of a
  // long form and the keyboard covering it made it unreadable when focused
  // (`PLAN_ui_fixes.md` UI pass). Loaded once: a tag added to some OTHER
  // exercise mid-session won't show up until the next visit, which is a
  // fair trade against reloading the whole library on every keystroke.
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [tab, setTab] = useState<TabId>('about');
  const [logs, setLogs] = useState<SetLog[]>([]);
  // Told apart from "no logs" so the empty states can differ: a screen still
  // loading and a screen with nothing to show look identical otherwise, and
  // one of them is a lie for the half-second it lasts.
  const [logsLoaded, setLogsLoaded] = useState(false);

  useEffect(() => {
    if (id === 'new') {
      setExercise(blank());
      setLogsLoaded(true);
      return;
    }
    setLogsForExercise(id).then((rows) => {
      setLogs(rows);
      setLogsLoaded(true);
    });
    getExercise(id).then((e) => setExercise(e ?? blank()));
    listTrainings().then(async (all) => {
      setUsedIn(
        all.filter((tr) => tr.blocks.some((b) => b.steps.some((s) => s.exerciseId === id))),
      );
    });
  }, [id]);

  useEffect(() => {
    listExercises().then((all) => {
      const tags = new Set<string>();
      all.forEach((e) => e.tags.forEach((tag) => tags.add(tag)));
      setKnownTags(Array.from(tags).sort((a, b) => a.localeCompare(b)));
    });
  }, []);

  // Every field saves on blur, which is fine for editing but loses a NEW
  // exercise if the system back button is pressed while a field is still
  // focused — the blur that would have persisted it never fires
  // (`PLAN_ui_fixes.md` B4). A ref rather than a dependency-array closure:
  // the cleanup below must see the LATEST draft, not the one from whichever
  // render happened to install it.
  const latestExercise = useRef(exercise);
  useEffect(() => {
    latestExercise.current = exercise;
  }, [exercise]);
  useEffect(() => {
    return () => {
      const e = latestExercise.current;
      if (e && e.name.trim().length > 0) {
        void upsertExercise({ ...e, updatedAt: new Date().toISOString() });
      }
      // A listener this screen registered and never received. Harmless if it
      // survives — the next `expectPick` replaces it — but a closure over an
      // unmounted screen is not something to leave lying around on purpose.
      cancelPick();
    };
  }, []);

  if (!exercise) return <View style={{ flex: 1, backgroundColor: color.canvas }} />;

  const persist = (next: Exercise) => {
    setExercise(next);
    if (next.name.trim().length > 0) {
      void upsertExercise({ ...next, updatedAt: new Date().toISOString() });
    }
  };

  /**
   * Open a picker page and apply whatever comes back.
   *
   * The listener reads `latestExercise.current` rather than closing over
   * `exercise`: this render's value is the one that existed when the push
   * happened, and while it is *very* unlikely anything else changes the draft
   * with a full-screen route on top of it, spreading a stale copy would
   * silently undo whatever did. See `nav/pickerHandoff.ts` for why the value
   * comes back this way at all.
   */
  const openEquipmentPicker = () => {
    expectPick((value) => {
      const draft = latestExercise.current;
      // An empty string is the picker saying "cleared" — `asEquipment` turns
      // it into unstated, which is the same thing said in the type system.
      if (draft) persist({ ...draft, equipment: asEquipment(value) });
    });
    router.push({
      pathname: '/pick/equipment',
      params: { current: exercise.equipment ?? '' },
    });
  };

  const openTypePicker = () => {
    expectPick((value) => {
      const draft = latestExercise.current;
      if (draft) persist({ ...draft, type: asExerciseType(value) });
    });
    router.push({ pathname: '/pick/exercise-type', params: { current: exercise.type } });
  };

  const pickMedia = async () => {
    // Images only, for now (`PLAN_ui_fixes.md` A5): there is no `expo-video`
    // dependency yet, so a newly attached video would be unplayable anywhere
    // in the app — a dead end. Existing video rows keep working (placeholder
    // + badge + caption above). Reverse this one line when `expo-video` lands.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    try {
      // Copy out of the picker's cache so the reference survives.
      // `copy` is asynchronous — awaiting it matters: without it the row is
      // saved with a URI that does not resolve yet, and any failure surfaces as
      // an unhandled rejection instead of the alert below.
      const dir = new Directory(Paths.document, 'exercise-media');
      dir.create({ intermediates: true, idempotent: true });

      const extension = asset.uri.split('.').pop() ?? 'jpg';
      // Cache-bust the filename: overwriting in place leaves <Image> showing
      // the previous picture, because the URI it is keyed on has not changed.
      const destination = new File(dir, `${exercise.id}-${Date.now()}.${extension}`);
      await new File(asset.uri).copy(destination);

      // Drop the file the previous media pointed at, now that the new one is
      // safely written.
      if (exercise.mediaUrl) {
        try {
          const previous = new File(exercise.mediaUrl);
          if (previous.exists) previous.delete();
        } catch {
          // An orphaned file is not worth failing the attach over.
        }
      }

      setHeroImageFailed(false);
      persist({
        ...exercise,
        mediaUrl: destination.uri,
        mediaType: asset.type === 'video' ? 'video' : 'photo',
      });
    } catch {
      setMediaError(true);
    }
  };

  const askDelete = async () => {
    // Re-fetched rather than reused from `usedIn`: that list was loaded when
    // the screen mounted and could be stale by the time delete is pressed.
    const all = await listTrainings();
    const blocking = all.filter((tr) =>
      tr.blocks.some((b) => b.steps.some((s) => s.exerciseId === exercise.id)),
    );
    setBlockingTrainings(blocking);
    // Handoff: deleting a used exercise must warn and either block or detach.
    setConfirm(blocking.length > 0 ? 'blocked' : 'delete');
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.canvas }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: space.gutter,
        paddingBottom: space.xxl,
      }}
      keyboardShouldPersistTaps="handled"
      // The tag input sits at the bottom of a long form; without this the
      // keyboard just covers it on focus with no auto-scroll to compensate
      // — exactly the "I can't see the input box" report
      // (`PLAN_ui_fixes.md` UI pass).
      automaticallyAdjustKeyboardInsets
    >
      <ScreenHeader
        onBack={() => router.back()}
        action={
          <BinButton
            accessibilityLabel={`Delete ${exercise.name || 'this exercise'}`}
            onPress={askDelete}
          />
        }
      />

      {/* Three tabs, not three screens. The form was here first and stays
          exactly as it was under About; History and Records are readings of
          the set log and own no state of their own.

          `FilterPill` rather than a new segmented control: the app already has
          one shape for "pick one of these", and it is the same one the library
          filters use. */}
      <View style={styles.tabs}>
        {(['about', 'history', 'records'] as const).map((id) => (
          <FilterPill
            key={id}
            label={TAB_LABELS[id]}
            active={tab === id}
            onPress={() => setTab(id)}
          />
        ))}
      </View>

      {tab === 'history' && <HistoryTab logs={logs} loaded={logsLoaded} />}
      {tab === 'records' && <RecordsTab logs={logs} loaded={logsLoaded} />}

      {tab === 'about' && (
      <>
      {/* The whole box is now the "pick/replace" control — tapping the image
          (or the placeholder) opens the picker directly, so the separate
          +/↻ circle that used to sit over it is gone. × stays as its own
          button because removing media is a different, destructive action
          that a tap-anywhere box would otherwise trigger by accident
          (`PLAN_ui_fixes.md` UI pass). */}
      <Pressable style={{ marginTop: space.m }} onPress={pickMedia}>
        {/* A video URI piped into <Image> drew an empty box — the mock's
            "media" was never actually type-checked against what was stored
            (`PLAN_ui_fixes.md` A5). Only a photo with a URI that has not
            failed to load gets the real <Image>; everything else, including
            a video, is the placeholder with a caption that says why. */}
        {exercise.mediaUrl && exercise.mediaType !== 'video' && !heroImageFailed ? (
          <Image
            source={{ uri: exercise.mediaUrl }}
            style={styles.media}
            resizeMode="cover"
            onError={() => setHeroImageFailed(true)}
          />
        ) : (
          <MediaPlaceholder
            style={styles.media}
            borderRadius={radius.card}
            caption={
              exercise.mediaUrl && exercise.mediaType === 'video'
                ? 'Video preview coming soon'
                : 'Tap to add a photo'
            }
          />
        )}
        {exercise.mediaUrl && exercise.mediaType === 'video' && (
          <View style={styles.heroVideoBadge}>
            <Text style={styles.heroVideoBadgeGlyph}>▶</Text>
          </View>
        )}
        {exercise.mediaUrl && (
          <View style={styles.mediaActions}>
            {/* A nested Pressable claims its own touch before it can bubble
                to the box behind it — the same pattern the bin buttons
                nested in an onPress`d Card already rely on elsewhere
                (e.g. the training list row). */}
            <Pressable
              style={styles.circleActionRemove}
              hitSlop={10}
              onPress={() => setConfirm('removeMedia')}
            >
              <Text style={styles.circleGlyphRemove}>×</Text>
            </Pressable>
          </View>
        )}
      </Pressable>

      <TextInput
        value={exercise.name}
        onChangeText={(name) => setExercise({ ...exercise, name })}
        onBlur={() => persist(exercise)}
        placeholder="Exercise name"
        placeholderTextColor={color.inkGhost}
        multiline
        style={styles.nameInput}
      />
      {/* persist() no-ops on an empty name, so tags and weights set before
          typing one would otherwise vanish with no feedback at all
          (`PLAN_ui_fixes.md` B4). */}
      {exercise.name.trim().length === 0 && (
        <Text style={styles.nameHint}>Name it to save</Text>
      )}

      <View style={{ marginTop: space.xl }}>
        <MonoLabel>Description</MonoLabel>
        <TextInput
          value={exercise.note ?? ''}
          onChangeText={(note) => setExercise({ ...exercise, note })}
          onBlur={() => persist(exercise)}
          placeholder="Form cues, reminders…"
          placeholderTextColor={color.inkGhost}
          multiline
          style={styles.note}
        />
      </View>

      {/* ── The two rows that decide the shape of everything else ──────────

          Equipment and type were seventeen filter pills between them, wrapped
          over five lines in the middle of the form. Both are now a row that
          states the current answer and opens a page to change it: the answer
          is readable at a glance, and the choosing happens somewhere with room
          to explain itself — pictures for equipment, worked examples for type.

          Type is not a default a step can disagree with. It is what the
          exercise IS: a plank is measured in seconds in every circuit it
          appears in, and every screen downstream reads it. Equipment is the
          same kind of fact. The WEIGHTS below are the defaults. */}
      <View style={{ marginTop: space.xl }}>
        <MonoLabel>Equipment</MonoLabel>
        <SunkenRow style={{ marginTop: 10 }} onPress={openEquipmentPicker}>
          {exercise.equipment != null && (
            <Image
              source={EQUIPMENT_ART[exercise.equipment]}
              style={styles.equipmentArt}
              resizeMode="contain"
            />
          )}
          <Text
            style={[
              t.exerciseRow,
              {
                flex: 1,
                fontSize: 14,
                // Unstated is greyed, because "nobody has said" is not an
                // answer and should not read like one.
                color: exercise.equipment != null ? color.ink : color.inkGhost,
              },
            ]}
          >
            {exercise.equipment != null ? EQUIPMENT_LABELS[exercise.equipment] : 'Not set'}
          </Text>
          <Text style={{ color: color.inkGhost, fontSize: 16 }}>›</Text>
        </SunkenRow>
      </View>

      <View style={{ marginTop: space.xl }}>
        <MonoLabel>Exercise type</MonoLabel>
        <SunkenRow style={{ marginTop: 10 }} onPress={openTypePicker}>
          <View style={{ flex: 1 }}>
            <Text style={[t.exerciseRow, { color: color.ink, fontSize: 14 }]}>
              {TYPE_COPY[exercise.type].label}
            </Text>
            {/* The units, so the row says what will be recorded without
                anyone having to open the page to find out. */}
            <Text style={[t.monoValue, { color: color.inkFaint, marginTop: 5 }]}>
              {TYPE_COPY[exercise.type].chips.join('  ·  ')}
            </Text>
          </View>
          <Text style={{ color: color.inkGhost, fontSize: 16 }}>›</Text>
        </SunkenRow>
      </View>

      <View style={{ marginTop: space.xl }}>
        <MonoLabel>Weights</MonoLabel>
        <View style={styles.weightRow}>
          <MiniStepper
            label="How many"
            value={exercise.defaultWeightCount ?? 0}
            step={1}
            min={0}
            max={10}
            format={(v) => (v === 0 ? "—" : String(v))}
            onChange={(count) =>
              persist(withWeight(exercise, exercise.defaultWeightKg, count))
            }
          />
          <MiniStepper
            label="Each (kg)"
            value={exercise.defaultWeightKg ?? 0}
            step={1}
            min={0}
            max={100}
            format={(v) => (v === 0 ? "—" : String(v))}
            onChange={(kg) => persist(withWeight(exercise, kg, exercise.defaultWeightCount))}
          />
        </View>
        <View style={{ marginTop: 8 }}>
          <MonoLabel tone={color.inkGhost}>{weightHint(exercise)}</MonoLabel>
        </View>
      </View>

      {/* Tags are kept because they drive the library's filter pills (1e) —
          without a way to set them here, those pills could never grow past the
          seeded two. */}
      <View style={{ marginTop: space.xl }}>
        <MonoLabel>Tags</MonoLabel>
        {exercise.tags.length > 0 && (
          <View style={styles.chips}>
            {exercise.tags.map((tag) => (
              <Pressable
                key={tag}
                style={styles.removableTag}
                onPress={() =>
                  persist({ ...exercise, tags: exercise.tags.filter((x) => x !== tag) })
                }
              >
                <MonoLabel tone={color.inkMuted}>{tag}</MonoLabel>
                <Text style={{ color: color.inkGhost, fontSize: 13 }}>×</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Every tag already in the library that isn't on this exercise yet
            — tapping one adds it with no keyboard involved at all, which
            covers the common case (reusing a tag from another exercise)
            without ever hitting the input-behind-the-keyboard problem
            (`PLAN_ui_fixes.md` UI pass). */}
        {(() => {
          const otherTags = knownTags.filter((tag) => !exercise.tags.includes(tag));
          if (otherTags.length === 0) return null;
          return (
            <View style={[styles.chips, { marginTop: exercise.tags.length > 0 ? 8 : 12 }]}>
              {otherTags.map((tag) => (
                <Pressable
                  key={tag}
                  style={styles.suggestedTag}
                  onPress={() => persist({ ...exercise, tags: [...exercise.tags, tag] })}
                >
                  <MonoLabel tone={color.inkGhost}>{tag}</MonoLabel>
                  <Text style={{ color: color.inkGhost, fontSize: 13 }}>+</Text>
                </Pressable>
              ))}
            </View>
          );
        })()}

        <TextInput
          value={tagDraft}
          onChangeText={setTagDraft}
          onSubmitEditing={() => {
            const tag = tagDraft.trim();
            if (tag && !exercise.tags.includes(tag)) {
              persist({ ...exercise, tags: [...exercise.tags, tag] });
            }
            setTagDraft('');
          }}
          returnKeyType="done"
          placeholder="Add a tag, e.g. Gambe"
          placeholderTextColor={color.inkGhost}
          style={styles.tagInput}
        />
      </View>

      {usedIn.length > 0 && (
        <View style={{ marginTop: space.xl }}>
          <MonoLabel>Used in</MonoLabel>
          {usedIn.map((training) => (
            <SunkenRow
              key={training.id}
              style={{ marginTop: 10 }}
              onPress={() =>
                router.push({ pathname: '/training/[id]', params: { id: training.id } })
              }
            >
              <Text style={[t.exerciseRow, { color: color.ink, fontSize: 14 }]}>
                {training.name}
              </Text>
              <Text style={{ color: color.inkGhost, fontSize: 16 }}>›</Text>
            </SunkenRow>
          ))}
        </View>
      )}
      </>
      )}

      <ConfirmDialog
        visible={confirm === 'removeMedia'}
        title="Remove media?"
        message="The photo or video is deleted from the app. The exercise stays."
        actions={[
          {
            label: 'Remove',
            destructive: true,
            onPress: () => {
              persist({ ...exercise, mediaUrl: undefined, mediaType: undefined });
              setConfirm(null);
            },
          },
        ]}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        visible={confirm === 'delete'}
        title="Delete exercise?"
        message={exercise.name || 'This exercise'}
        actions={[
          {
            label: 'Delete',
            destructive: true,
            onPress: () => {
              void deleteExercise(exercise.id);
              setConfirm(null);
              router.back();
            },
          },
        ]}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        visible={confirm === 'blocked'}
        title="Still in use"
        message={`This exercise is used by ${joinNames(blockingTrainings.map((tr) => tr.name || 'Untitled'))}. Remove it from ${
          blockingTrainings.length === 1 ? 'that training' : 'those trainings'
        } first.`}
        actions={[]}
        cancelLabel="OK"
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        visible={mediaError}
        title="Could not attach that file"
        message="Try a different photo or video."
        actions={[]}
        cancelLabel="OK"
        onCancel={() => setMediaError(false)}
      />
    </ScrollView>
  );
}

/** One row per session this exercise appears in, newest first. */
function HistoryTab({ logs, loaded }: { logs: SetLog[]; loaded: boolean }) {
  if (!loaded) return null;
  if (logs.length === 0) return <Text style={styles.emptyTab}>{EMPTY_COPY}</Text>;

  const bySession = new Map<string, SetLog[]>();
  for (const log of logs) {
    const bucket = bySession.get(log.sessionId);
    if (bucket) bucket.push(log);
    else bySession.set(log.sessionId, [log]);
  }

  // Newest first: the last time you did this is the thing you came to check.
  const sessions = [...bySession.values()].sort((a, b) =>
    b[0]!.completedAt.localeCompare(a[0]!.completedAt),
  );

  return (
    <View style={{ marginTop: space.l }}>
      {sessions.map((sets) => (
        <View key={sets[0]!.sessionId} style={styles.historyRow}>
          <Text style={[t.monoValue, { color: color.inkFaint }]}>
            {formatDayDate(sets[0]!.completedAt)}
          </Text>
          <Text style={[t.exerciseRow, { color: color.ink, fontSize: 13.5, marginTop: 6 }]}>
            {sets
              .slice()
              .sort((a, b) => a.roundIndex - b.roundIndex || a.setIndex - b.setIndex)
              .map((s) => formatLog(s) ?? '—')
              .join('   ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Bests, and the max weight lifted at each rep count. */
function RecordsTab({ logs, loaded }: { logs: SetLog[]; loaded: boolean }) {
  if (!loaded) return null;
  if (logs.length === 0) return <Text style={styles.emptyTab}>{EMPTY_COPY}</Text>;

  const records = recordsFor(logs);
  const oneRepMax = records.bestOneRepMax;

  const kg = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} kg`;

  return (
    <View style={{ marginTop: space.l }}>
      <View style={styles.recordRow}>
        {records.heaviest?.weightKg != null ? (
          <StatCard compact label="Heaviest" value={kg(records.heaviest.weightKg)} />
        ) : (
          // An unloaded movement has no heaviest set, so the record that
          // means something for it is the rep count. Substituted rather than
          // shown empty — a blank card is a question, not an answer.
          <StatCard
            compact
            label="Most reps"
            value={records.mostReps?.reps != null ? String(records.mostReps.reps) : '—'}
          />
        )}
        <StatCard
          compact
          label="Best set"
          value={records.bestSet ? kg(setVolume(records.bestSet)) : '—'}
        />
      </View>

      <View style={styles.recordRow}>
        {/* Labelled as an estimate everywhere it appears. It is arithmetic on
            one set, not a weight that was ever lifted — and it is absent
            above 12 reps, where the formula stops being trustworthy. */}
        <StatCard
          compact
          label="Est. 1RM"
          value={oneRepMax ? kg(oneRepMax.value) : '—'}
        />
        <StatCard
          compact
          label="Best session"
          value={records.bestSessionVolume ? kg(records.bestSessionVolume.volume) : '—'}
        />
      </View>

      {records.setRecords.length > 0 && (
        <View style={{ marginTop: space.xl }}>
          <MonoLabel>Set records</MonoLabel>
          {records.setRecords.map(({ reps, log }) => (
            <View key={reps} style={styles.historyRow}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[t.exerciseRow, { color: color.ink, fontSize: 13.5 }]}>
                  {`${reps} ${reps === 1 ? 'rep' : 'reps'}`}
                </Text>
                <Text style={[t.monoValueLarge, { color: color.ink }]}>
                  {log.weightKg != null ? kg(log.weightKg) : '—'}
                </Text>
              </View>
              <Text style={[t.monoValue, { color: color.inkGhost, marginTop: 5 }]}>
                {formatDayDate(log.completedAt)}
                {estimatedOneRepMax(log) != null
                  ? `  ·  est. 1RM ${kg(estimatedOneRepMax(log)!)}`
                  : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={[t.body, { color: color.inkGhostest, fontSize: 11.5, marginTop: space.l }]}>
        {`From ${records.sessionCount} ${
          records.sessionCount === 1 ? 'session' : 'sessions'
        }. Warm-up sets are not counted.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, marginTop: space.l },
  emptyTab: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 13,
    lineHeight: 21,
    color: color.inkFaint,
    marginTop: space.xxl,
  },
  historyRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  recordRow: { flexDirection: 'row', gap: 12, marginTop: space.sm },
  media: { height: size.mediaBlock, borderRadius: radius.card, backgroundColor: color.sunken },
  mediaActions: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    gap: 8,
  },
  // Soft-red, matching every other delete control (`components/ui.tsx`
  // BinButton) — the box tap now handles "add/replace", so this one only
  // ever does the destructive thing.
  circleActionRemove: {
    width: size.circleAction,
    height: size.circleAction,
    borderRadius: size.circleAction / 2,
    borderWidth: 1,
    borderColor: color.softRedBorder,
    backgroundColor: color.softRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleGlyphRemove: { color: color.softRedIcon, fontSize: 13, lineHeight: 16 },
  heroVideoBadge: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(20,20,22,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroVideoBadgeGlyph: { color: color.darkInk, fontSize: 11, marginLeft: 1 },
  nameInput: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 20,
    lineHeight: 26,
    color: color.ink,
    marginTop: space.l,
    padding: 0,
  },
  nameHint: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 11.5,
    color: color.inkGhost,
    marginTop: 6,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  /** Small enough to read as a label's icon, not as the exercise's own media. */
  equipmentArt: { width: 28, height: 28, marginRight: 10 },
  removableTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: color.sunken,
    borderRadius: radius.fieldTight,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  // Outlined rather than filled — the visual opposite of `removableTag` —
  // so "already on this exercise" and "tap to add" never look the same chip.
  suggestedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: color.hairlineStrong,
    borderRadius: radius.fieldTight,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  tagInput: {
    marginTop: 12,
    height: 40,
    borderRadius: radius.cardTight,
    backgroundColor: color.sunken,
    paddingHorizontal: 14,
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    color: color.ink,
  },
  weightRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: 10,
  },
  note: {
    fontFamily: 'Archivo_400Regular',
    fontSize: 14,
    lineHeight: 22,
    color: color.inkMuted,
    marginTop: 10,
    padding: 0,
    minHeight: 44,
  },
});
