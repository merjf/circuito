/**
 * Drag-to-reorder for the builder's exercise rows.
 *
 * Rows here have variable height — a two-line Italian exercise name is taller
 * than "Squat saltati" — so this cannot assume a fixed row pitch the way most
 * simple implementations do. Each row reports its height via `onLayout`, the
 * heights go into a shared value, and the drop index is found by walking those
 * cumulative offsets on the UI thread.
 *
 * The gesture lives on the drag handle only, not the whole row. Dragging from
 * anywhere would fight the parent ScrollView and make it impossible to scroll a
 * long block, and it would also swallow taps meant for the −/+ buttons.
 *
 * Reordering is a pure index swap handed back through `onReorder`; this
 * component owns no data, only the transform of the row being dragged.
 */

import { useCallback, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export interface DraggableListProps<T> {
  items: T[];
  keyExtractor: (item: T, index: number) => string;
  onReorder: (from: number, to: number) => void;
  /**
   * `handle` must be attached to whatever the user grabs. Everything else in
   * the row stays independently tappable.
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
  const [draggingIndex, setDraggingIndex] = useState(-1);
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
      if (from !== to && to >= 0) onReorder(from, to);
    },
    [onReorder],
  );

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
          isDragging={draggingIndex === index}
          onLayout={onRowLayout(index)}
          onStart={() => setDraggingIndex(index)}
          onCommit={commit}
        >
          {(handle) => renderItem(item, index, handle, draggingIndex === index)}
        </Row>
      ))}
    </View>
  );
}

function Row({
  index,
  count,
  heights,
  activeIndex,
  translateY,
  isDragging,
  onLayout,
  onStart,
  onCommit,
  children,
}: {
  index: number;
  count: number;
  heights: ReturnType<typeof useSharedValue<number[]>>;
  activeIndex: ReturnType<typeof useSharedValue<number>>;
  translateY: ReturnType<typeof useSharedValue<number>>;
  isDragging: boolean;
  onLayout: (e: LayoutChangeEvent) => void;
  onStart: () => void;
  onCommit: (from: number, to: number) => void;
  children: (handle: React.ReactNode) => React.ReactNode;
}) {
  const pan = Gesture.Pan()
    .activateAfterLongPress(120)
    .onStart(() => {
      activeIndex.value = index;
      translateY.value = 0;
      runOnJS(onStart)();
    })
    .onUpdate((event) => {
      translateY.value = event.translationY;
    })
    .onEnd(() => {
      // Walk the measured heights to find which slot the row was let go over.
      const hs = heights.value;
      let target = index;
      let travelled = 0;

      if (translateY.value > 0) {
        for (let i = index + 1; i < count; i++) {
          travelled += hs[i] ?? 0;
          if (translateY.value > travelled - (hs[i] ?? 0) / 2) target = i;
          else break;
        }
      } else if (translateY.value < 0) {
        for (let i = index - 1; i >= 0; i--) {
          travelled += hs[i] ?? 0;
          if (-translateY.value > travelled - (hs[i] ?? 0) / 2) target = i;
          else break;
        }
      }

      activeIndex.value = -1;
      translateY.value = withTiming(0, { duration: 120 });
      runOnJS(onCommit)(index, target);
    });

  const style = useAnimatedStyle(() => {
    const active = activeIndex.value === index;
    return {
      transform: [{ translateY: active ? translateY.value : 0 }],
      zIndex: active ? 20 : 0,
      elevation: active ? 8 : 0,
      opacity: active ? 0.96 : 1,
    };
  });

  const handle = (
    <GestureDetector gesture={pan}>
      <View style={styles.handleTarget} hitSlop={10}>
        <View style={[styles.handleLine, isDragging && styles.handleLineActive]} />
        <View style={[styles.handleLine, isDragging && styles.handleLineActive]} />
        <View style={[styles.handleLine, isDragging && styles.handleLineActive]} />
      </View>
    </GestureDetector>
  );

  return (
    <Animated.View onLayout={onLayout} style={style}>
      {children(handle)}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  handleTarget: { width: 14, gap: 3, paddingVertical: 6, justifyContent: 'center' },
  handleLine: { height: 1.5, backgroundColor: '#C9C7C2', borderRadius: 1 },
  handleLineActive: { backgroundColor: '#1B1B1D' },
});
