import type { ReactElement } from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { color, elevation, size } from '@/theme/tokens';
import { type as t } from '@/theme/type';

/**
 * Tab bar per the handoff: 4 columns, mono uppercase labels.
 *
 * The handoff's mock had no icons and marked the active tab with a 5px dot
 * above the label. That shipped, and the dot survived — but a text-only bar is
 * hard to hit at a glance, and stacking an icon ON TOP of the dot would put
 * three elements in a 64px column that also has to absorb the home-indicator
 * inset.
 *
 * So the icon REPLACES the dot rather than joining it: same two-element
 * column, same height, and the active state is carried by the icon going solid
 * ink while the inactive ones sit in `inkGhostest`. Nothing is lost — the dot
 * only ever said "this one", which is what the filled icon now says, more
 * legibly and in less vertical space.
 *
 * Drawn from plain `View`s, not an icon font: same rule as the bin, the pencil
 * and the overflow dots in `components/ui.tsx`. Pulling in a whole icon set
 * for four marks would be a heavier dependency than the design asks for.
 */

interface IconProps {
  tone: string;
  focused: boolean;
}

/** Train — a timer ring, the same mark the session summary uses for a clock. */
function TrainIcon({ tone, focused }: IconProps) {
  return (
    <View style={styles.icon}>
      <View style={[styles.ring, { borderColor: tone }, focused && { borderWidth: 2.4 }]} />
      <View style={[styles.ringHand, { backgroundColor: tone }]} />
    </View>
  );
}

/** Library — a list of rows. */
function LibraryIcon({ tone, focused }: IconProps) {
  const h = focused ? 2.4 : 1.8;
  return (
    <View style={[styles.icon, styles.stack]}>
      <View style={{ width: 16, height: h, borderRadius: 1, backgroundColor: tone }} />
      <View style={{ width: 16, height: h, borderRadius: 1, backgroundColor: tone }} />
      <View style={{ width: 11, height: h, borderRadius: 1, backgroundColor: tone }} />
    </View>
  );
}

/** History — the minutes-per-week chart, in miniature. */
function HistoryIcon({ tone, focused }: IconProps) {
  const w = focused ? 4 : 3;
  return (
    <View style={[styles.icon, styles.bars]}>
      <View style={{ width: w, height: 7, borderRadius: 1, backgroundColor: tone }} />
      <View style={{ width: w, height: 14, borderRadius: 1, backgroundColor: tone }} />
      <View style={{ width: w, height: 10, borderRadius: 1, backgroundColor: tone }} />
    </View>
  );
}

/** Settings — sliders, since a gear is not a shape a few `View`s can make. */
function SettingsIcon({ tone, focused }: IconProps) {
  const h = focused ? 2.4 : 1.8;
  const knob = focused ? 6 : 5;
  return (
    <View style={[styles.icon, styles.stack]}>
      <View style={styles.sliderRow}>
        <View style={{ flex: 1, height: h, borderRadius: 1, backgroundColor: tone }} />
        <View
          style={[styles.knob, { left: 3, width: knob, height: knob, borderRadius: knob / 2, backgroundColor: tone }]}
        />
      </View>
      <View style={styles.sliderRow}>
        <View style={{ flex: 1, height: h, borderRadius: 1, backgroundColor: tone }} />
        <View
          style={[styles.knob, { right: 3, width: knob, height: knob, borderRadius: knob / 2, backgroundColor: tone }]}
        />
      </View>
    </View>
  );
}

function TabItem({
  label,
  focused,
  Icon,
}: {
  label: string;
  focused: boolean;
  Icon: (props: IconProps) => ReactElement;
}) {
  // Split tone (PLAN_ui_polish.md §2b, decided rev 3): the icon is a
  // non-text mark needing 3:1 contrast, the 11px label is text needing AA's
  // 4.5:1 — one shared `inkGhostest` (1.54:1) satisfied neither. `inkDisabled`
  // (3.18:1) keeps the icon visibly lighter than the active `accent` so the
  // tonal active/inactive read survives; `inkMuted` (4.90:1) clears AA for
  // the label. If inactive labels ever start reading as active on device,
  // the documented fallback is `inkDisabled` for both.
  const iconTone = focused ? color.accent : color.inkDisabled;
  const labelTone = focused ? color.accent : color.inkMuted;
  return (
    <View style={styles.item}>
      <Icon tone={iconTone} focused={focused} />
      <Text style={[t.monoLabelTiny, styles.label, { color: labelTone }]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.bar,
        sceneStyle: { backgroundColor: color.canvas },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabItem label="Train" focused={focused} Icon={TrainIcon} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabItem label="Library" focused={focused} Icon={LibraryIcon} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabItem label="History" focused={focused} Icon={HistoryIcon} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabItem label="Settings" focused={focused} Icon={SettingsIcon} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: size.tabBar,
    backgroundColor: color.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.divider,
    // e3, offset upward: the bar floats over scrolling content beneath it
    // (PLAN_ui_polish.md §3.6). Static only — the tab bar has no press state
    // of its own to animate.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -elevation.e3.shadowOffset.height },
    shadowOpacity: elevation.e3.shadowOpacity,
    shadowRadius: elevation.e3.shadowRadius,
    elevation: elevation.e3.elevation,
  },
  // paddingTop 6 -> 14: with only 6px the icon crowded the bar's top hairline,
  // which made the whole column read as sitting too high in the bar. The extra
  // 8px is paid for by `size.tabBar` going 64 -> 72, so the label keeps the
  // same distance from the home-indicator inset below it.
  item: { alignItems: 'center', gap: 5, width: 80, paddingTop: 14, paddingBottom: 8 },
  icon: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  stack: { justifyContent: 'space-between', paddingVertical: 3 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2.5 },
  ring: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.6,
  },
  ringHand: {
    position: 'absolute',
    top: 4,
    width: 1.6,
    height: 5,
    borderRadius: 1,
  },
  sliderRow: {
    width: 16,
    height: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  knob: { position: 'absolute' },
  // Overrides monoLabelTiny's 9.5px — too small to read comfortably in the
  // bar itself, even though that size is right for the same style used
  // inline elsewhere (`PLAN_ui_fixes.md` UI pass).
  label: { fontSize: 11, lineHeight: 13, letterSpacing: 1.1 },
});
