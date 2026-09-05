/**
 * 1k — Session summary.
 *
 * This one screen serves two different entries, told apart by the `from`
 * param:
 *
 *  - Straight from the player (`router.replace`, no `from`): the live
 *    "you just finished" summary. The back gesture is disabled for this route
 *    in `app/_layout.tsx` on purpose — leaving mid-flow goes through this
 *    screen, not a stray swipe — so "Save & close" is really just "close":
 *    the row was written before this screen mounted, because a summary that
 *    can be dismissed without persisting is a summary that loses workouts.
 *  - From the History tab (`router.push`, `from: 'history'`): reviewing a
 *    past record. Nothing here is still unsaved, so the footer offers Delete
 *    instead, the top icon reads "history" rather than "done", and — because
 *    the route's gesture is disabled for the *other* entry — a back arrow is
 *    the only way out (`PLAN_ui_fixes.md` UI pass).
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ShareCard } from '@/components/ShareCard';
import { Toast } from '@/components/Toast';
import { AnimatedPressable, DestructiveButton, IconButton, MonoLabel, PrimaryButton, SecondaryButton, StatCard, SunkenRow } from '@/components/ui';
import { deleteSession, getSession, listSetLogs } from '@/db/repo';
import { formatDayDateTime } from '@/domain/dates';
import { formatDuration } from '@/domain/duration';
import { formatLog } from '@/domain/logging';
import type { Session, SetLog } from '@/domain/types';
import { color, motion, radius, size, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

export default function SessionSummaryScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const fromHistory = from === 'history';
  const insets = useSafeAreaInsets();
  const [session, setSession] = useState<Session | null>(null);
  const [logs, setLogs] = useState<SetLog[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareNotice, setShareNotice] = useState<{ title: string; message?: string } | null>(
    null,
  );
  const shareCardRef = useRef<View>(null);

  useEffect(() => {
    getSession(id).then(setSession);
    // Empty for every timed session, and for every reps session logged before
    // the logger existed. The breakdown below simply does not render then —
    // the stat cards remain the whole summary, exactly as they were.
    listSetLogs(id).then(setLogs);
  }, [id]);

  if (!session) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={color.inkGhost} />
      </View>
    );
  }

  const total = Math.max(1, session.workSeconds + session.restSeconds);
  const workPct = Math.round((session.workSeconds / total) * 100);

  const close = () => router.dismissAll();
  const removeSession = async () => {
    await deleteSession(session.id);
    setConfirmingDelete(false);
    router.back();
  };

  // Captures the off-screen `ShareCard` as a PNG and hands it to the system
  // share sheet. This is a still image of the summary you already saved, not
  // a live view — there is nothing here that changes after the fact, so a
  // snapshot is the honest artifact to share. Failures (no share target on
  // this build, a capture error) are quiet by default, matching the rest of
  // the app's non-critical-feature convention, but a tap is a deliberate
  // action, so a failed one still gets a brief Toast rather than nothing.
  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        setShareNotice({ title: 'Sharing unavailable', message: 'This device has no share sheet.' });
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your session' });
    } catch {
      setShareNotice({ title: "Couldn't share", message: 'Give it another try.' });
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + (fromHistory ? 12 : 40),
          paddingHorizontal: space.gutter,
          paddingBottom: space.xxl,
        }}
      >
        {/* This route's gesture is disabled globally (app/_layout.tsx), so a
            history entry — which never had a "Save & close" to lean on —
            needs its own way back. */}
        {fromHistory && (
          <AnimatedPressable onPress={() => router.back()} hitSlop={16} haptic="tap" style={styles.back}>
            <Text style={{ fontSize: 22, lineHeight: 26, color: color.ink }}>←</Text>
          </AnimatedPressable>
        )}

        <View style={styles.headerRow}>
          <View style={styles.checkCircle}>
            {fromHistory ? (
              <View style={styles.historyGlyph}>
                <View style={styles.historyRing} />
                <View style={styles.historyHand} />
              </View>
            ) : (
              <Text style={{ color: color.darkInk, fontSize: 20, lineHeight: 24 }}>✓</Text>
            )}
          </View>
          <IconButton onPress={handleShare} accessibilityLabel="Share this session" disabled={sharing}>
            <Text style={{ color: color.ink, fontSize: 18, lineHeight: 20 }}>↑</Text>
          </IconButton>
        </View>

        <Text style={[t.screenTitle, { color: color.ink, marginTop: space.xl, fontSize: 34 }]}>
          {session.completed ? 'Done.' : 'Stopped.'}
        </Text>
        <Text style={[t.body, { color: color.inkMuted, marginTop: 10, fontSize: 14 }]}>
          {session.trainingName} · {formatDayDateTime(session.startedAt)}
        </Text>

        {/* Elapsed is shown whenever there IS one. A reps session logged
            before 2026-08-18 came from the old reference sheet, which never
            started a clock and stored a zero — for those, a stat card reading
            00:00 would describe a measurement that never happened. The logger
            that replaced it does measure wall time, so its sessions get the
            card like any other.

            The work/rest split below stays timed-only: those two numbers come
            from the runner banking time per cue kind, and nothing in a logged
            session produces them. */}
        <Animated.View
          style={styles.statRow}
          entering={FadeIn
            .duration(motion.enter.duration)
            .reduceMotion(ReduceMotion.System)}
        >
          {session.elapsedSeconds > 0 && (
            <StatCard label="Elapsed" value={formatDuration(session.elapsedSeconds)} />
          )}
          <StatCard
            label="Rounds"
            value={`${session.roundsCompleted} / ${session.roundsPlanned}`}
          />
        </Animated.View>
        {session.workSeconds + session.restSeconds > 0 && (
          <Animated.View
            style={styles.statRow}
            entering={FadeIn
              .duration(motion.enter.duration)
              .delay(1 * motion.enterStagger)
              .reduceMotion(ReduceMotion.System)}
          >
            <StatCard label="Work" value={formatDuration(session.workSeconds)} />
            <StatCard label="Rest" value={formatDuration(session.restSeconds)} />
          </Animated.View>
        )}

        {session.workSeconds + session.restSeconds > 0 && (
        <View style={{ marginTop: space.xxl }}>
          <MonoLabel>Work vs rest</MonoLabel>
          <View style={styles.splitBar}>
            <View style={{ flex: Math.max(session.workSeconds, 1), backgroundColor: color.accent }} />
            <View style={{ flex: Math.max(session.restSeconds, 1), backgroundColor: color.track }} />
          </View>
          <View style={styles.splitLabels}>
            <Text style={[t.monoValue, { color: color.inkFaint }]}>{workPct}% work</Text>
            <Text style={[t.monoValue, { color: color.inkFaint }]}>{100 - workPct}% rest</Text>
          </View>
        </View>
        )}

        {/* What you actually did — the payoff for the set log, and what turns
            this screen from a receipt into a record. Grouped by exercise
            rather than listed set by set: "12, 10, 8" on one line is how the
            work reads back, and twenty rows of one set each is not. */}
        {logs.length > 0 && (
          <View style={{ marginTop: space.xxl }}>
            <MonoLabel>What you did</MonoLabel>
            {groupByExercise(logs).map((group) => (
              <View key={group.exerciseId} style={styles.logRow}>
                <Text
                  style={[t.exerciseRow, { color: color.ink, fontSize: 13.5, flex: 1 }]}
                  numberOfLines={2}
                >
                  {/* The denormalised name, so a deleted exercise still reads
                      back. See SetLog.exerciseName. */}
                  {group.name}
                </Text>
                <Text style={[t.monoValue, { color: color.inkMuted, flex: 1.2 }]}>
                  {group.summary}
                </Text>
              </View>
            ))}
          </View>
        )}

        {session.skippedRests > 0 && (
          <View style={{ marginTop: space.xl }}>
            <MonoLabel>Skipped</MonoLabel>
            <SunkenRow style={{ marginTop: 12 }}>
              <Text style={[t.exerciseRow, { color: color.ink, fontSize: 13.5 }]}>
                {session.skippedRests} {session.skippedRests === 1 ? 'rest' : 'rests'} skipped
              </Text>
            </SunkenRow>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <SecondaryButton
          label="Repeat"
          style={{ flex: 1 }}
          onPress={() =>
            router.replace({
              pathname: '/player/[trainingId]',
              params: { trainingId: session.trainingId },
            })
          }
        />
        {fromHistory ? (
          <DestructiveButton
            label="Delete"
            onPress={() => setConfirmingDelete(true)}
            style={{ flex: 1.4 }}
          />
        ) : (
          <PrimaryButton label="Save & close" style={{ flex: 1.4 }} onPress={close} />
        )}
      </View>

      <ConfirmDialog
        visible={confirmingDelete}
        title={`Delete ${session.trainingName || 'this session'}?`}
        message="This removes it from your history. It doesn't touch the training itself."
        actions={[{ label: 'Delete', destructive: true, onPress: removeSession }]}
        onCancel={() => setConfirmingDelete(false)}
      />

      <Toast
        title={shareNotice?.title ?? null}
        message={shareNotice?.message}
        onDone={() => setShareNotice(null)}
      />

      {/* Rendered off-screen, never visible — `captureRef` needs a mounted,
          laid-out view to snapshot. Positioned rather than unmounted so the
          capture always has real content, and far enough off-canvas that it
          never affects layout or shows through the scroll view above. */}
      <View style={styles.offscreen} pointerEvents="none">
        <ShareCard ref={shareCardRef} session={session} />
      </View>
    </View>
  );
}

/**
 * One line per exercise, in the order it was first performed.
 *
 * Weight is stated once when every set shared it — "3 kg · 12, 10, 8" — and
 * inline when it changed, which is the only way a pyramid reads correctly.
 * Warm-ups are marked rather than hidden: they were part of the session, and
 * a summary that quietly drops sets is a summary you cannot reconcile against
 * what you remember doing.
 */
function groupByExercise(logs: SetLog[]) {
  const order: string[] = [];
  const byExercise = new Map<string, SetLog[]>();

  for (const log of logs) {
    const bucket = byExercise.get(log.exerciseId);
    if (bucket) bucket.push(log);
    else {
      byExercise.set(log.exerciseId, [log]);
      order.push(log.exerciseId);
    }
  }

  return order.map((exerciseId) => {
    const sets = byExercise.get(exerciseId)!;
    const weights = new Set(sets.map((s) => `${s.weightKg ?? ''}x${s.weightCount ?? ''}`));
    const uniform = weights.size === 1 && sets[0]!.weightKg != null;

    const summary = uniform
      ? [
          formatLog({
            weightKg: sets[0]!.weightKg,
            weightCount: sets[0]!.weightCount,
          }),
          sets.map(markSet).join(', '),
        ]
          .filter(Boolean)
          .join(' · ')
      : sets.map((s) => formatLog(s) ?? markSet(s)).join(', ');

    return { exerciseId, name: sets[0]!.exerciseName, summary };
  });
}

/** A rep count, with a letter when the set was not a normal one. */
function markSet(log: SetLog): string {
  const reps = log.reps != null ? String(log.reps) : '—';
  if (log.type === 'warmup') return `${reps}w`;
  if (log.type === 'drop') return `${reps}d`;
  if (log.type === 'failure') return `${reps}f`;
  return reps;
}

const styles = StyleSheet.create({
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: color.divider,
  },
  loading: {
    flex: 1,
    backgroundColor: color.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: { marginBottom: space.l },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  checkCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A simple clock face — ring plus one hand — built from `View`s like the
  // bin/pencil glyphs elsewhere (`components/ui.tsx`): the same "no emoji,
  // geometric shapes" rule applies here.
  historyGlyph: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  historyRing: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.6,
    borderColor: color.darkInk,
  },
  historyHand: {
    position: 'absolute',
    top: 3,
    left: '50%',
    marginLeft: -0.8,
    width: 1.6,
    height: 6,
    borderRadius: 1,
    backgroundColor: color.darkInk,
  },
  statRow: { flexDirection: 'row', gap: 12, marginTop: space.sm },
  splitBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 12,
  },
  splitLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: space.gutter,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: color.divider,
    backgroundColor: color.canvas,
  },
  spacer: { height: radius.card },
  // Same soft-red delete treatment as every other destructive control
  // (`components/ui.tsx` BinButton, `ConfirmDialog`'s destructive action) —
  // sized to match `PrimaryButton` since it fills that slot in the footer.
  deleteButton: {
    height: size.primaryButton,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: color.softRedBorder,
    backgroundColor: color.softRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLabel: { fontFamily: 'Inter_700Bold', fontSize: 14, color: color.softRedIcon },
  // Off-canvas rather than unmounted: `captureRef` needs real, laid-out
  // content to snapshot. `left` keeps it clear of the screen at any width.
  offscreen: { position: 'absolute', top: -9999, left: -9999 },
});
