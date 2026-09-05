/**
 * Drag-to-reorder for the builder's exercise rows.
 *
 * Rows here have variable height — a two-line Italian exercise name is taller
 * than "Squat saltati" — so this cannot assume a fixed row pitch the way most
 * simple implementations do. Each row reports its height via `onLayout`, the
 * heights go into a shared value, and the drop index is found by walking those
 * cumulative offsets on the UI thread.
 *
 * As of 2026-08-26 (PLAN_ui_polish.md §7) there are TWO ways to start a drag,
 * each on its own independently-scoped `GestureDetector` (handle nested
 * inside row) rather than a `Gesture.Exclusive` composition — see the
 * `grabPan`/`holdPan` definitions below for why that's sufficient:
 *
 * - The drag HANDLE keeps its own immediate `Gesture.Pan()` — no hold delay.
 *   This is the original, always-available way to grab a row.
 * - The WHOLE ROW also accepts a drag, but only after a 350ms hold
 *   (`motion.dragHold`). At 120ms (the value this used to ship at) a hold and
 *   an incidental scroll or tap race too closely to tell apart; at 350ms a
 *   scroll (which moves within ~50-100ms) or a tap (well under 200ms
 *   finger-down-to-up) both resolve and get out of the way before the hold
 *   timer ever fires, so letting the gesture live on the whole row stops
 *   fighting the parent ScrollView or swallowing −/+ taps — the exact
 *   argument that used to keep the gesture handle-only. See §7.1.
 *
 * Both branches share one `begin`/`update`/`finish` worklet path (defined
 * once per `Row`, below) so the two entry points can never drift in feel.
 *
 * Every row also gets a short `LinearTransition` so add/delete/reorder settle
 * instead of jumping — EXCEPT while any row in the list is being
 * dragged, when it is suspended list-wide: otherwise every other row tries
 * to settle to its new position while the dragged row is being translated by
 * the gesture, and the two fight, leaving rows visibly drifted after
 * release (§7.3). `layout` is a React prop and can't be toggled from a
 * worklet, hence the plain `dragging` state in `DraggableList` below.
 *
 * Reordering is a pure index swap handed back through `onReorder`; this
 * component owns no data, only the transform of the row being dragged.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  LinearTransition,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { hapticFromWorklet } from '@/feedback/haptics';
import { color, elevationLevel, elevationOpacity, motion, press } from '@/theme/tokens';

export interface DraggableListProps<T> {
  items: T[];
  keyExtractor: (item: T, index: number) => string;
  onReorder: (from: number, to: number) => void;
  /**
   * `handle` must be attached to whatever the user grabs. Everything else in
   * the row stays independently tappable — grabbing the row itself also
   * works now (see the file doc comment), but the handle stays visible and
   * keeps working exactly as before; nothing is lost for anyone who already
   * knows it's there (§7.6).
   */
  renderItem: (item: T, index: number, handle: React.ReactNode, dragging: boolean) => React.ReactNode;
}

export function DraggableList<T>({
  items,
  keyExtractor,
  onReorder,
  renderItem,
}: DraggableListProps<T>) {
  const heights = useSharedValue<number[]>([]);
  const activeIndex = useSharedValue<number>(-1);
  const translateY = useSharedValue(0);
  const dropTarget = useSharedValue<number>(-1);
  const [draggingIndex, setDraggingIndex] = useState(-1);
  // LIST-level, not per-row: every row's `layout` transition must suspend
  // together while any one row is being dragged (§7.3, see file doc
  // comment). Passed down as `anyDragging` so every `Row` gates its own
  // `LinearTransition` on the SAME flag, rather than only its own.
  const [dragging, setDragging] = useState(false);
  const measured = useRef<number[]>([]);

  const onRowLayout = useCallback(
    (index: number) => (event: LayoutChangeEvent) => {
      measured.current[index] = event.nativeEvent.layout.height;
      heights.value = [...measured.current];
    },
    [heights],
  );

  const commit = useCallback(
    (from: number, to: number) => {
      setDraggingIndex(-1);
      setDragging(false);
      if (from !== to && to >= 0) onReorder(from, to);
    },
    [onReorder],
  );

  const onCancelled = useCallback(() => {
    setDraggingIndex(-1);
    setDragging(false);
  }, []);

  const onDragStart = useCallback((index: number) => {
    setDraggingIndex(index);
    setDragging(true);
  }, []);

  return (
    <View>
      {items.map((item, index) => (
        <Row
          key={keyExtractor(item, index)}
          index={index}
          count={items.length}
          heights={heights}
          activeIndex={activeIndex}
          translateY={translateY}
          dropTarget={dropTarget}
          isDragging={draggingIndex === index}
          anyDragging={dragging}
          onLayout={onRowLayout(index)}
          onStart={() => onDragStart(index)}
          onCommit={commit}
          onCancelled={onCancelled}
        >
          {(handle) => renderItem(item, index, handle, draggingIndex === index)}
        </Row>
      ))}
    </View>
  );
}

/**
 * Walks the measured heights from `index` toward wherever `translateY` has
 * travelled, returning the slot the row would drop into right now. Shared
 * between `onUpdate` (to fire a `select` haptic on every slot crossing, §7.2)
 * and `onEnd` (to commit) — written once so the two can't compute different
 * answers for the same gesture.
 *
 * Marked `'worklet'` so it can run on the UI thread from either callback.
 */
function findDropTarget(
  index: number,
  count: number,
  hs: number[],
  ty: number,
): number {
  'worklet';
  let target = index;
  let travelled = 0;

  if (ty > 0) {
    for (let i = index + 1; i < count; i++) {
      travelled += hs[i] ?? 0;
      if (ty > travelled - (hs[i] ?? 0) / 2) target = i;
      else break;
    }
  } else if (ty < 0) {
    for (let i = index - 1; i >= 0; i--) {
      travelled += hs[i] ?? 0;
      if (-ty > travelled - (hs[i] ?? 0) / 2) target = i;
      else break;
    }
  }

  return target;
}

function Row({
  index,
  count,
  heights,
  activeIndex,
  translateY,
  dropTarget,
  isDragging,
  anyDragging,
  onLayout,
  onStart,
  onCommit,
  onCancelled,
  children,
}: {
  index: number;
  count: number;
  heights: ReturnType<typeof useSharedValue<number[]>>;
  activeIndex: ReturnType<typeof useSharedValue<number>>;
  translateY: ReturnType<typeof useSharedValue<number>>;
  dropTarget: ReturnType<typeof useSharedValue<number>>;
  isDragging: boolean;
  anyDragging: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
  onStart: () => void;
  onCommit: (from: number, to: number) => void;
  onCancelled: () => void;
  children: (handle: React.ReactNode) => React.ReactNode;
}) {
  // Selection progress, 0 = rest, 1 = picked up — drives scale/elevation
  // together the same way `usePressAnimation` in ui.tsx does, so this stays
  // consistent with the rest of the app's depth language (§7.2 table).
  const pickProgress = useSharedValue(0);

  // Shared begin/update/finish so the handle's immediate pan and the row's
  // long-press pan can never drift in feel (§7.1). All three are worklets —
  // called directly from gesture callbacks below, on the UI thread.
  const begin = () => {
    'worklet';
    activeIndex.value = index;
    dropTarget.value = index;
    translateY.value = 0;
    pickProgress.value = withTiming(1, { duration: 120 });
    hapticFromWorklet('pickup');
    runOnJS(onStart)();
  };

  const update = (ty: number) => {
    'worklet';
    translateY.value = ty;
    const hs = heights.value;
    const next = findDropTarget(index, count, hs, ty);
    if (next !== dropTarget.value) {
      dropTarget.value = next;
      hapticFromWorklet('select');
    }
  };

  // Idempotency guard: both `onEnd` (success path) and `onFinalize`
  // (fallback for a gesture that never reaches `onEnd` at all — RNGH fires
  // `onFinalize` after EITHER `onEnd` or a cancellation, but `onEnd` itself
  // already handles the ordinary success/failure split via its own
  // `success` flag) can end up calling `finish`. Gating on `activeIndex.value
  // === index` — which `finish` clears — means a second call after the row
  // is already back at rest is a safe no-op rather than double-firing
  // `onCommit`/`onCancelled` or re-triggering the release transition.
  const finish = (committing: boolean) => {
    'worklet';
    if (activeIndex.value !== index) return;
    const target = committing ? findDropTarget(index, count, heights.value, translateY.value) : index;
    activeIndex.value = -1;
    dropTarget.value = -1;
    translateY.value = withTiming(0, { duration: 120 });
    pickProgress.value = withTiming(0, { duration: 120 });
    if (committing) {
      runOnJS(onCommit)(index, target);
    } else {
      runOnJS(onCancelled)();
    }
  };

  // Two independently-scoped gestures, each on its own `GestureDetector`
  // (handle small, row large) rather than one composed `Gesture.Exclusive` —
  // RNGH resolves two detectors nested in each other's view tree by which
  // one's view the touch actually landed in, and the handle's detector is
  // the inner one. Composing with `Exclusive` isn't needed for "whichever
  // wins, wins outright" here: `grabPan` has no activation delay at all, so
  // a touch starting on the handle is claimed by it well before the row's
  // 350ms hold could ever fire, with no race to arbitrate.
  //
  // Both are memoised on `[index, count]`: this list re-renders on every
  // reorder (row order/props change), and `setDragging(true)` in the parent
  // triggers a re-render mid-gesture. Rebuilding fresh `Gesture` objects on
  // that render would tear down the in-flight gesture — the single most
  // likely way to break this phase (§7.3). `index`/`count` are the only
  // inputs that should ever change what these gestures do; everything else
  // they close over (`heights`, `activeIndex`, etc.) is itself a stable
  // shared value, so it's safe to omit from the deps array.

  // Handle: immediate pan, no hold — the original, always-available grab.
  const grabPan = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => begin())
        .onUpdate((event) => update(event.translationY))
        .onEnd((event, success) => finish(success))
        // RNGH fires `onFinalize`, not `onEnd`, when a gesture is CANCELLED
        // outright (a parent ScrollView steals the responder, the screen
        // navigates away, an incoming call) — before this, `activeIndex`
        // stayed pinned and the row was stuck raised forever on a cancelled
        // drag (PLAN_ui_polish.md finding "F2"). `onFinalize` always runs,
        // after EITHER `onEnd` or a cancellation, so this is the safety net
        // for the case where `onEnd` never ran at all — the guard inside
        // `finish` makes calling it again here harmless when `onEnd`
        // already did the work.
        .onFinalize(() => finish(false)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, count],
  );

  // Whole row: same begin/update/finish, gated by a 350ms hold (§7.1) so an
  // incidental scroll or a tap on a −/+ button inside the row resolves and
  // gets out of the way before this ever activates.
  const holdPan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(motion.dragHold)
        .onStart(() => begin())
        .onUpdate((event) => update(event.translationY))
        .onEnd((event, success) => finish(success))
        .onFinalize(() => finish(false)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, count],
  );

  const style = useAnimatedStyle(() => {
    const active = activeIndex.value === index;
    const p = pickProgress.value;
    return {
      transform: [
        { translateY: active ? translateY.value : 0 },
        { scale: interpolate(p, [0, 1], [1, press.scaleDrag]) },
      ],
      zIndex: active ? 20 : 0,
      // e3 on BOTH platforms while selected — previously Android-only
      // (`elevation: active ? 8 : 0`), so iOS got no lift at all (§7.2).
      shadowColor: '#000',
      shadowOffset: { width: 0, height: interpolate(p, [0, 1], [0, 6]) },
      shadowOpacity: interpolate(p, [0, 1], [0, elevationOpacity.e3]),
      shadowRadius: interpolate(p, [0, 1], [0, 16]),
      elevation: interpolate(p, [0, 1], [0, elevationLevel.e3]),
      // A selected item should be MORE present, not less — previously dipped
      // to 0.96; removed per §7.2.
      opacity: 1,
    };
  });

  const handleLineStyle = useAnimatedStyle(() => ({
    backgroundColor: activeIndex.value === index ? color.accent : color.dragHandle,
  }));

  const accessibilityLabel = isDragging ? 'Reordering' : undefined;

  const handle = (
    <GestureDetector gesture={grabPan}>
      <View style={styles.handleTarget} hitSlop={10}>
        <Animated.View style={[styles.handleLine, handleLineStyle]} />
        <Animated.View style={[styles.handleLine, handleLineStyle]} />
        <Animated.View style={[styles.handleLine, handleLineStyle]} />
      </View>
    </GestureDetector>
  );

  // Two nested Animated.Views, not one (§7.3, point 1): the gesture-driven
  // translateY/scale/shadow live on the INNER node; `layout` goes on the
  // OUTER one. Putting `layout` on the same node a gesture is writing
  // `transform` to is exactly what produces neighbour drift after a drop —
  // Reanimated's automatic layout transition and the gesture's manual
  // per-frame transform would both be trying to own the same node's
  // position at once.
  return (
    <Animated.View
      layout={
        anyDragging
          ? undefined
          : LinearTransition.duration(motion.layout.duration)
              .reduceMotion(ReduceMotion.System)
      }
    >
      <GestureDetector gesture={holdPan}>
        <Animated.View
          onLayout={onLayout}
          style={style}
          // §7.5 — reorder isn't gesture-only. A screen reader user gets the
          // same move without a drag: two explicit actions per row, wired
          // straight to the same `onReorder` a completed drag calls.
          accessibilityActions={[
            { name: 'moveUp', label: 'Move up' },
            { name: 'moveDown', label: 'Move down' },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'moveUp' && index > 0) {
              onCommit(index, index - 1);
            } else if (event.nativeEvent.actionName === 'moveDown' && index < count - 1) {
              onCommit(index, index + 1);
            }
          }}
          accessibilityLabel={accessibilityLabel}
        >
          {children(handle)}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  handleTarget: { width: 14, gap: 3, paddingVertical: 6, justifyContent: 'center' },
  handleLine: { height: 1.5, borderRadius: 1 },
});
