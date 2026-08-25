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
import { ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SettingsProvider } from '@/hooks/useSettings';

import { openDatabase } from '@/db/repo';
import { color } from '@/theme/tokens';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    openDatabase().then(
      () => setDbReady(true),
      (error: unknown) => setDbError(error instanceof Error ? error.message : String(error)),
    );
  }, []);

  /**
   * A failed migration used to leave the app on a blank dark screen forever,
   * because `dbReady` simply never flipped — the actual SQLite error only
   * appeared in the console. Anything that stops the database opening is fatal
   * and unrecoverable from inside the app, so say so on screen.
   */
  if (dbError) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: color.darkBg }}
        contentContainerStyle={{ padding: 28, paddingTop: 96 }}
      >
        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 22, color: color.darkInk }}>
          The database could not be opened.
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
          {dbError}
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
          This is usually a failed migration. Reinstalling the app clears the local
          database and starts fresh — your trainings are stored only on this device,
          so they are lost with it.
        </Text>
      </ScrollView>
    );
  }

  // Splash background is the player dark, so the first paint never flashes white.
  if (!fontsLoaded || !dbReady) {
    return <View style={{ flex: 1, backgroundColor: color.darkBg }} />;
  }

  // GestureHandlerRootView must wrap everything for the builder's drag-to-
  // reorder to receive touches at all.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
        <StatusBar style="dark" />
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
