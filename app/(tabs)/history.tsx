/**
 * 1l — History & stats.
 *
 * All three figures are aggregated from the session rows on read (see
 * `domain/stats.ts`) rather than maintained as counters, because a stale streak
 * is worse than a recomputed one and the table is small enough to sweep.
 *
 * Handoff § "Empty states": with no history, hide the stats and show one line.
 */

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { BinButton, Card, MonoLabel } from '@/components/ui';
import { deleteSession, listExercises, listSessions, setLogsSince } from '@/db/repo';
import { formatDayDate, formatMonth, formatShortDate, startOfMonth } from '@/domain/dates';
import { formatDuration } from '@/domain/duration';
import {
  minutesPerWeek,
  monthGrid,
  monthSummary,
  peakMinutes,
  sessionsThisMonth,
  setsByTag,
  weekStreak,
  type CalendarCell,
  type MonthSummary,
  type TagVolume,
} from '@/domain/stats';
import type { Exercise, Session, SetLog } from '@/domain/types';
import { color, radius, space } from '@/theme/tokens';
import { type as t } from '@/theme/type';

const CHART_HEIGHT = 92;

/**
 * How far back the sets-per-tag bars look.
 *
 * A rolling week rather than all time: the question is "what have I trained
 * lately", and an all-time total stops moving after a few months — at which
 * point the chart is decoration.
 */
const TAG_WINDOW_DAYS = 7;

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<Session | null>(null);
  const [tagVolume, setTagVolume] = useState<TagVolume[]>([]);
  const [monthTopTag, setMonthTopTag] = useState<TagVolume | null>(null);
  const [monthOpen, setMonthOpen] = useState(false);
  /** `null` = every training. Filters the list, not the stats above it. */
  const [filterTrainingId, setFilterTrainingId] = useState<string | null>(null);
  const [filtering, setFiltering] = useState(false);

  const reload = useCallback(() => {
    listSessions(200).then(setSessions);

    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - TAG_WINDOW_DAYS);
    const monthStart = startOfMonth(now);
    // One query covering BOTH windows, then sliced in memory. Early in a month
    // the rolling week reaches back past the 1st, so neither window contains
    // the other — fetching from whichever starts earlier is the only way to
    // get both from one read.
    const since = weekAgo < monthStart ? weekAgo : monthStart;

    // Tags live on the exercise, the sets live in the log, and neither table
    // knows about the other — so the join happens here rather than in SQL,
    // where a JSON `tags` column would have to be unpacked row by row.
    Promise.all([setLogsSince(since.toISOString()), listExercises()]).then(
      ([logs, exercises]: [SetLog[], Exercise[]]) => {
        setTagVolume(setsByTag(logs.filter((l) => new Date(l.completedAt) >= weekAgo), exercises));
        const monthly = setsByTag(
          logs.filter((l) => new Date(l.completedAt) >= monthStart),
          exercises,
        );
        setMonthTopTag(monthly[0] ?? null);
      },
    );
  }, []);

  useFocusEffect(reload);

  const stats = useMemo(() => {
    if (!sessions) return null;
    const bars = minutesPerWeek(sessions);
    return {
      streak: weekStreak(sessions),
      month: sessionsThisMonth(sessions),
      bars,
      peak: peakMinutes(bars),
      grid: monthGrid(sessions),
      summary: monthSummary(sessions),
    };
  }, [sessions]);

  /** Distinct trainings in the history, for the filter menu. */
  const trainings = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of sessions ?? []) {
      if (!seen.has(s.trainingId)) seen.set(s.trainingId, s.trainingName);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [sessions]);

  const visible = useMemo(
    () =>
      filterTrainingId == null
        ? (sessions ?? [])
        : (sessions ?? []).filter((s) => s.trainingId === filterTrainingId),
    [sessions, filterTrainingId],
  );

  const filterName = trainings.find((t) => t.id === filterTrainingId)?.name;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.canvas }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: space.gutter,
        paddingBottom: space.xxl,
      }}
    >
      <Text style={[t.screenTitle, { color: color.ink }]}>History</Text>

      {sessions?.length === 0 && (
        <Text style={[t.body, { color: color.inkFaint, marginTop: space.xl }]}>
          Your finished sessions will collect here.
        </Text>
      )}

      {stats && sessions && sessions.length > 0 && (
        <>
          <View style={styles.topCards}>
            <View style={[styles.topCard, { backgroundColor: color.inkStrong }]}>
              <MonoLabel tone={color.darkMuted}>Streak</MonoLabel>
              <View style={styles.figureRow}>
                <Text style={[t.statFigure, { color: color.darkInk, fontSize: 30 }]}>
                  {stats.streak}
                </Text>
                <Text style={[t.body, { color: color.darkInk2, fontSize: 14 }]}>
                  {stats.streak === 1 ? 'week' : 'weeks'}
                </Text>
              </View>
            </View>

            {/* Tappable: the month's detail expands below rather than living
                on its own screen. A monthly review is something you glance at
                while already looking at History, and a destination you have to
                remember to visit is a destination you forget. */}
            <Card
              style={[styles.topCard, { backgroundColor: color.surface }]}
              onPress={() => {
                LayoutAnimation.easeInEaseOut();
                setMonthOpen((open) => !open);
              }}
            >
              <View style={styles.monthHeader}>
                <MonoLabel tone={color.inkFaint}>This month</MonoLabel>
                <Text style={{ color: color.inkGhost, fontSize: 12 }}>
                  {monthOpen ? '⌄' : '›'}
                </Text>
              </View>
              <View style={styles.figureRow}>
                <Text style={[t.statFigure, { color: color.ink, fontSize: 30 }]}>
                  {stats.month}
                </Text>
                <Text style={[t.body, { color: color.inkMuted, fontSize: 14 }]}>
                  {stats.month === 1 ? 'session' : 'sessions'}
                </Text>
              </View>
            </Card>
          </View>

          {monthOpen && <MonthDetail summary={stats.summary} topTag={monthTopTag} />}

          {/* "Did I show up" — the question the minutes chart cannot answer,
              since a fortnight of long sessions and a fortnight of nothing
              draws the same total as four steady weeks. */}
          <View style={styles.chartHeader}>
            <MonoLabel>{formatMonth(new Date())}</MonoLabel>
            <Text style={[t.monoValue, { color: color.inkGhost }]}>
              {`${stats.month} ${stats.month === 1 ? 'day' : 'days'}`}
            </Text>
          </View>
          <CalendarGrid cells={stats.grid} />

          {tagVolume.length > 0 && (
            <>
              <View style={styles.chartHeader}>
                <MonoLabel>Sets per tag</MonoLabel>
                <Text style={[t.monoValue, { color: color.inkGhost }]}>
                  {`last ${TAG_WINDOW_DAYS} days`}
                </Text>
              </View>
              <TagBars data={tagVolume} />
            </>
          )}

          <View style={styles.chartHeader}>
            <MonoLabel>Minutes per week</MonoLabel>
            <Text style={[t.monoValue, { color: color.inkGhost }]}>last {stats.bars.length}</Text>
          </View>

          <View style={styles.chart}>
            {stats.bars.map((bar) => (
              <View key={bar.weekStart.getTime()} style={styles.barSlot}>
                <View
                  style={{
                    width: '100%',
                    // Floor at 4px so an empty week is still a visible tick.
                    height: Math.max(4, (bar.minutes / stats.peak) * CHART_HEIGHT),
                    borderRadius: radius.fieldTight,
                    backgroundColor: bar.isCurrent ? color.inkStrong : color.track,
                  }}
                />
              </View>
            ))}
          </View>
          <View style={styles.chartCaptions}>
            <Text style={[t.monoValue, { color: color.inkGhost }]}>
              {formatShortDate(stats.bars[0]!.weekStart)}
            </Text>
            <Text style={[t.monoValue, { color: color.inkGhost }]}>
              {formatShortDate(stats.bars[stats.bars.length - 1]!.weekStart)}
            </Text>
          </View>

          <View style={{ marginTop: space.xl }}>
            <View style={styles.listHeader}>
              <MonoLabel>Sessions</MonoLabel>
              {/* Filters the LIST only, never the stats above it. A streak
                  that changed when you filtered by training would be a
                  different statistic wearing the same label. */}
              <Pressable
                onPress={() => setFiltering(true)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`Filter: ${filterName ?? 'all trainings'}. Change`}
              >
                <MonoLabel tone={color.inkMuted}>
                  {filterName ? `Filter · ${filterName}` : 'Filter · All'}
                </MonoLabel>
              </Pressable>
            </View>

            {visible.length === 0 ? (
              <Text style={[t.body, { color: color.inkFaint, marginTop: space.m }]}>
                Nothing for that training yet.
              </Text>
            ) : (
              visible.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  onDelete={() => setSessionToDelete(session)}
                />
              ))
            )}
          </View>
        </>
      )}

      <ActionSheet
        visible={filtering}
        title="Show sessions from"
        actions={[
          {
            label: filterTrainingId == null ? 'All trainings  ✓' : 'All trainings',
            onPress: () => setFilterTrainingId(null),
          },
          ...trainings.map((training) => ({
            label:
              filterTrainingId === training.id
                ? `${training.name || 'Untitled'}  ✓`
                : training.name || 'Untitled',
            onPress: () => setFilterTrainingId(training.id),
          })),
        ]}
        onClose={() => setFiltering(false)}
      />

      <ConfirmDialog
        visible={sessionToDelete !== null}
        title={`Delete ${sessionToDelete?.trainingName || 'this session'}?`}
        message="This removes it from your history. It doesn't touch the training itself."
        actions={[
          {
            label: 'Delete',
            destructive: true,
            onPress: async () => {
              if (!sessionToDelete) return;
              await deleteSession(sessionToDelete.id);
              setSessionToDelete(null);
              reload();
            },
          },
        ]}
        onCancel={() => setSessionToDelete(null)}
      />
    </ScrollView>
  );
}

/**
 * The month, expanded.
 *
 * Four facts and one comparison. The comparison is against the WHOLE of last
 * month, which is unfair on the 3rd — so it says "so far" rather than
 * implying a like-for-like. A pace-adjusted figure would be a projection, and
 * projections are exactly the invented numbers this app refuses to print.
 */
function MonthDetail({
  summary,
  topTag,
}: {
  summary: MonthSummary;
  topTag: TagVolume | null;
}) {
  const diff = summary.sessions - summary.sessionsLastMonth;
  const rows: { label: string; value: string }[] = [
    { label: 'Time', value: `${summary.minutes} min` },
    {
      label: 'Days trained',
      value: `${summary.daysTrained} of ${summary.daysElapsed}`,
    },
    ...(topTag ? [{ label: 'Most trained', value: `${topTag.tag} · ${topTag.sets} sets` }] : []),
    {
      label: 'vs last month',
      value:
        summary.sessionsLastMonth === 0
          ? 'no sessions then'
          : `${diff >= 0 ? '+' : ''}${diff} so far`,
    },
  ];

  return (
    <View style={styles.monthDetail}>
      {rows.map((row) => (
        <View key={row.label} style={styles.monthRow}>
          <Text style={[t.body, { color: color.inkMuted, fontSize: 13 }]}>{row.label}</Text>
          <Text style={[t.monoValueLarge, { color: color.ink }]}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

/** Weekday initials, Monday first — matching `startOfWeek` and the streak. */
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * The consistency grid.
 *
 * Rendered even when the month is empty, unlike the stats block around it: an
 * empty grid teaches the model — this is a thing that fills in when you train
 * — where a missing one teaches nothing and reads as a screen still loading.
 *
 * A trained day is a filled square rather than a number in a circle: the shape
 * is what you scan for, and the date is only interesting once you have found
 * one. Days that have not happened yet are drawn fainter than empty past days,
 * because an empty Tuesday in the future is not a Tuesday you missed.
 */
function CalendarGrid({ cells }: { cells: CalendarCell[] }) {
  return (
    <View style={{ marginTop: space.m }}>
      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((day, i) => (
          <Text key={`${day}${i}`} style={[t.monoLabelTiny, styles.weekday]}>
            {day}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, i) => (
          <View key={i} style={styles.cellSlot}>
            {cell.day != null && (
              <View
                style={[
                  styles.cell,
                  cell.sessions > 0 && styles.cellFilled,
                  cell.isToday && styles.cellToday,
                ]}
              >
                <Text
                  style={[
                    t.monoValue,
                    styles.cellLabel,
                    cell.sessions > 0 && { color: color.darkInk },
                    cell.isFuture && { color: color.inkGhostest },
                  ]}
                >
                  {cell.day}
                </Text>
              </View>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Sets per tag, as independent horizontal bars.
 *
 * Bars rather than a pie, and that is a correctness decision rather than a
 * stylistic one: an exercise tagged both "Gambe" and "Core" counts toward
 * each, so the parts do not sum to the work done and any proportional chart
 * would be claiming something false. Each bar is scaled against the largest,
 * which makes it a comparison between tags — the only reading that holds.
 */
function TagBars({ data }: { data: TagVolume[] }) {
  const peak = Math.max(1, ...data.map((d) => d.sets));
  return (
    <View style={{ marginTop: space.m }}>
      {data.map((entry) => (
        <View key={entry.tag} style={styles.tagRow}>
          <Text style={[t.exerciseRow, styles.tagName]} numberOfLines={1}>
            {entry.tag}
          </Text>
          <View style={styles.tagTrack}>
            <View style={[styles.tagFill, { width: `${(entry.sets / peak) * 100}%` }]} />
          </View>
          <Text style={[t.monoValue, styles.tagCount]}>{entry.sets}</Text>
        </View>
      ))}
    </View>
  );
}

function SessionRow({ session, onDelete }: { session: Session; onDelete: () => void }) {
  const rounds = `${session.roundsCompleted}/${session.roundsPlanned} ${
    session.roundsPlanned === 1 ? 'round' : 'rounds'
  }`;

  return (
    <Card
      style={styles.sessionRow}
      onPress={() =>
        router.push({ pathname: '/session/[id]', params: { id: session.id, from: 'history' } })
      }
    >
      <View style={{ flex: 1 }}>
        <Text style={[t.exerciseRow, { color: color.ink, fontSize: 14.5 }]} numberOfLines={1}>
          {session.trainingName}
        </Text>
        <Text style={[t.monoValue, { color: color.inkFaint, marginTop: 7 }]}>
          {formatDayDate(session.startedAt)}  ·  {rounds}
        </Text>
      </View>
      {/* Incomplete sessions show their duration in ink-ghost. */}
      <Text
        style={[
          t.monoValueLarge,
          { color: session.completed ? color.ink : color.inkGhost, fontSize: 14 },
        ]}
      >
        {/* Conditional on the VALUE, not on the kind. Reps sessions used to be
            untimed by construction — the old reference sheet never started a
            clock, so `elapsedSeconds` was 0, and "00:00" would have read as a
            session that went wrong rather than one that was never on a clock.
            The logger measures its wall time, so rows written from 2026-08-18
            carry a real duration. Branching on `kind` alone would make every
            row written BEFORE that date suddenly render 00:00. */}
        {session.elapsedSeconds === 0 ? 'REPS' : formatDuration(session.elapsedSeconds)}
      </Text>
      {/* Same hairline-then-bin pattern as the training list (index.tsx) —
          the bin reads as a separate action, not part of the row's own tap
          target (`PLAN_ui_fixes.md` UI pass). */}
      <View style={styles.sessionRowDivider} />
      <BinButton
        accessibilityLabel={`Delete ${session.trainingName || 'this session'}`}
        onPress={onDelete}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  topCards: { flexDirection: 'row', gap: 12, marginTop: space.xl },
  topCard: { flex: 1, borderRadius: radius.card, padding: 16, minHeight: 96 },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 12 },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xxl,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    height: CHART_HEIGHT,
    marginTop: space.m,
  },
  barSlot: { flex: 1, justifyContent: 'flex-end' },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthDetail: {
    marginTop: space.sm,
    backgroundColor: color.sunken,
    borderRadius: radius.cardTight,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  weekdayRow: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    textAlign: 'center',
    color: color.inkGhostest,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  // Seven per row, sized by percentage so the grid fits any phone width
  // without measuring — an aspectRatio keeps the cells square.
  cellSlot: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 2.5,
  },
  cell: {
    flex: 1,
    borderRadius: radius.fieldTight,
    backgroundColor: color.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFilled: { backgroundColor: color.inkStrong },
  cellToday: { borderWidth: 1.5, borderColor: color.inkMuted },
  cellLabel: { color: color.inkFaint, fontSize: 11 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  tagName: { color: color.ink, fontSize: 12.5, width: 78 },
  tagTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.track,
    overflow: 'hidden',
  },
  tagFill: { height: 10, borderRadius: 5, backgroundColor: color.inkStrong },
  tagCount: { color: color.inkMuted, width: 24, textAlign: 'right' },
  chartCaptions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginTop: 10,
  },
  sessionRowDivider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: color.hairlineStrong,
  },
});
