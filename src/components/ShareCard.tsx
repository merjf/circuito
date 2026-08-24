/**
 * The share card (§3.5 of `PLAN_hevy_integration.md`).
 *
 * A fixed-size, purpose-built view — NOT a screenshot of the summary screen
 * itself. That screen scrolls, carries buttons, and its height depends on
 * how much was logged; none of that belongs in an image someone else will
 * see. This shows the same headline facts the summary leads with, in a
 * layout that never needs to grow: training name, date, elapsed/rounds, and
 * — only when the session actually has one — the work/rest split. Rendered
 * off-screen in `app/session/[id].tsx` and captured to a PNG by
 * `react-native-view-shot`'s `captureRef`.
 *
 * `collapsable={false}` on the root is required on Android — without it the
 * view-flattening optimiser can remove the native view `captureRef` needs a
 * handle to, and the capture silently comes back blank.
 */

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatDayDateTime } from '@/domain/dates';
import { formatDuration } from '@/domain/duration';
import type { Session } from '@/domain/types';
import { color, radius, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

/** Fixed capture width. Tall enough to read on a phone screen once shared,
 *  narrow enough to sit naturally in a chat thread rather than needing a zoom. */
export const SHARE_CARD_WIDTH = 360;

export const ShareCard = forwardRef<View, { session: Session }>(function ShareCard(
  { session },
  ref,
) {
  const timed = session.workSeconds + session.restSeconds > 0;
  const total = Math.max(1, session.workSeconds + session.restSeconds);
  const workPct = Math.round((session.workSeconds / total) * 100);

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <Text style={[t.monoLabel, { color: color.darkMuted }]}>CIRCUITO</Text>
      <Text
        style={[t.screenTitle, { color: color.darkInk, fontSize: 25, marginTop: 16 }]}
        numberOfLines={2}
      >
        {session.trainingName || 'Training'}
      </Text>
      <Text style={[t.body, { color: color.darkMuted, marginTop: 6, fontSize: 13 }]}>
        {formatDayDateTime(session.startedAt)}
      </Text>

      <View style={styles.statRow}>
        {session.elapsedSeconds > 0 && (
          <Stat label="Elapsed" value={formatDuration(session.elapsedSeconds)} />
        )}
        <Stat label="Rounds" value={`${session.roundsCompleted} / ${session.roundsPlanned}`} />
      </View>

      {/* Timed-only, same rule the summary screen itself follows: a reps
          session has no work/rest split to show, and a bar drawn from two
          zeros would read as data rather than as its absence. */}
      {timed && (
        <>
          <View style={styles.splitBar}>
            <View
              style={{ flex: Math.max(session.workSeconds, 1), backgroundColor: color.darkInk }}
            />
            <View
              style={{
                flex: Math.max(session.restSeconds, 1),
                backgroundColor: color.darkFainter,
              }}
            />
          </View>
          <Text style={[t.monoValue, { color: color.darkMuted, marginTop: 8 }]}>
            {workPct}% work · {100 - workPct}% rest
          </Text>
        </>
      )}
    </View>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[t.monoLabelTiny, { color: color.darkMuted }]}>{label}</Text>
      <Text style={[t.statFigure, { color: color.darkInk, marginTop: 4 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    backgroundColor: color.darkBg,
    borderRadius: radius.card,
    padding: space.xl,
  },
  statRow: { flexDirection: 'row', gap: space.l, marginTop: space.xl },
  splitBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: space.xl,
  },
});
