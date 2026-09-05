/**
 * Fonts are imported from their per-weight subpaths, NOT from the package root.
 *
 * `@expo-google-fonts/archivo` re-exports all 18 variants from its index, and
 * `@expo-google-fonts/ibm-plex-mono` all 14 — importing from the root pulls
 * every one of them into the bundle. That was 32 .ttf files, roughly 4.5MB, for
 * the 6 weights this app actually uses. The subpath imports below bundle only
 * those 6. If you add a weight, add its subpath here and to `theme/type.ts`.
 */
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeOut, ReduceMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SettingsProvider } from '@/hooks/useSettings';

import SplashScreen from '@/components/SplashScreen';
import { openDatabase } from '@/db/repo';
import { color } from '@/theme/tokens';

/**
 * Once fonts and the database are ready, keep the animated splash on screen
 * for a short beat. This timer deliberately starts *after* initialization:
 * starting it alongside loading makes a slower cold start jump straight from
 * the logo to Home at the very moment the app becomes ready.
 */
const SPLASH_AFTER_READY_MS = 1000;
/** Cross-fade from the splash to the app underneath it. */
const SPLASH_FADE_MS = 320;

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [startupTimedOut, setStartupTimedOut] = useState(false);
  const [postReadySplashElapsed, setPostReadySplashElapsed] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);

  useEffect(() => {
    let active = true;
    openDatabase().then(
      () => {
        if (active) setDbReady(true);
      },
      (error: unknown) => {
        if (active) setDbError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const startupReady = fontsLoaded && dbReady;

  // Removing the overlay from a tree that stays mounted is what lets its
  // `exiting` animation play at all — the same rule the sheets and dialogs in
  // `components/` follow. So the splash is dismissed by flipping this flag,
  // never by swapping which subtree renders.
  useEffect(() => {
    if (!startupReady) return;
    const timer = setTimeout(() => setPostReadySplashElapsed(true), SPLASH_AFTER_READY_MS);
    return () => clearTimeout(timer);
  }, [startupReady]);

  useEffect(() => {
    if (startupReady && postReadySplashElapsed) setSplashVisible(false);
  }, [postReadySplashElapsed, startupReady]);

  // Neither Expo Font nor SQLite guarantees a rejection when its native
  // operation stalls. Do not turn that into an indistinguishable black screen:
  // leave the app alive, but tell us exactly which startup dependency is stuck.
  useEffect(() => {
    if (fontsLoaded && dbReady) return;
    const timeout = setTimeout(() => setStartupTimedOut(true), 12_000);
    return () => clearTimeout(timeout);
  }, [fontsLoaded, dbReady]);

  /**
   * A failed migration used to leave the app on a blank dark screen forever,
   * because `dbReady` simply never flipped — the actual SQLite error only
   * appeared in the console. Anything that stops the database opening is fatal
   * and unrecoverable from inside the app, so say so on screen.
   */
  const startupError = dbError ?? (fontsError ? fontsError.message : null);
  if (startupError || startupTimedOut) {
    const detail = startupError ?? [
      fontsLoaded ? null : 'Fonts are still loading.',
      dbReady ? null : 'The local database is still opening.',
    ].filter(Boolean).join(' ');
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: color.darkBg }}
        contentContainerStyle={{ padding: 28, paddingTop: 96 }}
      >
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: color.darkInk }}>
          The app could not finish starting.
        </Text>
        <Text
          style={{
            fontFamily: 'Inter_400Regular',
            fontSize: 12,
            lineHeight: 19,
            color: color.darkInk2,
            marginTop: 18,
          }}
          selectable
        >
          {detail}
        </Text>
        <Text
          style={{
            fontFamily: 'Inter_400Regular',
            fontSize: 13,
            lineHeight: 21,
            color: color.darkMuted,
            marginTop: 22,
          }}
        >
          If the database is the problem, reinstalling the app clears the local
          data and starts fresh. Your trainings are stored only on this device, so
          they are lost with it.
        </Text>
      </ScrollView>
    );
  }

  // The old startup surface (a spinner plus "Loading app fonts…") is now the
  // animated splash below. It is rendered as an OVERLAY inside the same tree as
  // the app rather than as an early `return`, so the mark mounts once and keeps
  // pulsing across the moment startup finishes — an early return would remount
  // it there and restart its entrance mid-fade. The hang case is still covered:
  // the 12s timeout above replaces the whole screen with the error text.

  // GestureHandlerRootView must wrap everything for the builder's drag-to-
  // reorder to receive touches at all.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={splashVisible ? 'light' : 'dark'} />
        {startupReady ? (
        <SettingsProvider>
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="training/[id]/index" />
          {/* The builder is a modal over the detail. */}
          <Stack.Screen name="training/[id]/builder" options={{ presentation: 'modal' }} />
          <Stack.Screen name="exercise/[id]" />
          {/* The two pickers the exercise form opens. Plain pushes, not modals:
              they answer a field on the form below them, and the back arrow
              that returns to it should be the same one every other screen has.
              See `nav/pickerHandoff.ts` for how the choice comes back. */}
          <Stack.Screen name="pick/equipment" />
          <Stack.Screen name="pick/exercise-type" />
          {/* Both ways of running a workout refuse a stray swipe out: leaving
              mid-session goes through the discard/save prompt or not at all.
              The player is additionally full-screen, because it is meant to be
              read from across a room. */}
          <Stack.Screen
            name="player/[trainingId]"
            options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }}
          />
          <Stack.Screen name="reps/[trainingId]" options={{ gestureEnabled: false }} />
          <Stack.Screen name="session/[id]" options={{ gestureEnabled: false }} />
        </Stack>
        </SettingsProvider>
        ) : null}
        {splashVisible ? (
          <Animated.View
            style={StyleSheet.absoluteFill}
            exiting={FadeOut.duration(SPLASH_FADE_MS).reduceMotion(ReduceMotion.System)}
          >
            <SplashScreen />
          </Animated.View>
        ) : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
