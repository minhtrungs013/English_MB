import {
  PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, useFonts
} from '@expo-google-fonts/plus-jakarta-sans';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Button, EmptyState, ToastHost } from '../components/ui';
import { openNoteLink } from '../components/note-link';
import type { NoteLink } from '../lib/api';
import { StoreProvider, useStore, useTheme } from '../state/store';

SplashScreen.preventAutoHideAsync();

/** Taps on push notifications (also the one that cold-started the app): open its link like the in-app list does. */
function usePushTaps(ready: boolean) {
  const { actions } = useStore();
  const actionsRef = useRef(actions);
  useEffect(() => { actionsRef.current = actions; });
  const handled = useRef(new Set<string>());
  useEffect(() => {
    if (!ready) return;
    const handle = (res: Notifications.NotificationResponse | null) => {
      if (!res) return;
      const key = res.notification.request.identifier;
      if (handled.current.has(key)) return;
      handled.current.add(key);
      const data = (res.notification.request.content.data ?? {}) as { id?: unknown; link?: unknown };
      const a = actionsRef.current;
      if (typeof data.id === 'string') void a.markNotesRead([data.id]);
      else void a.refreshUnread();
      const link = data.link as NoteLink | null | undefined;
      if (link && typeof link === 'object' && typeof link.to === 'string') {
        // Let the signed-in stack mount first (cold start).
        setTimeout(() => { try { openNoteLink(link, actionsRef.current); } catch (e) { console.warn('Push link failed:', e); } }, 300);
      }
    };
    let alive = true;
    Notifications.getLastNotificationResponseAsync().then((r) => { if (alive) handle(r); }).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    // A push arriving while the app is open: bump the bell's count.
    const recv = Notifications.addNotificationReceivedListener(() => { void actionsRef.current.refreshUnread(); });
    return () => { alive = false; sub.remove(); recv.remove(); };
  }, [ready]);
}

function Root({ fontsReady }: { fontsReady: boolean }) {
  const { status, loadError, actions } = useStore();
  const t = useTheme();
  const ready = fontsReady && status !== 'booting';
  usePushTaps(ready && status === 'ready');

  useEffect(() => { if (ready) void SplashScreen.hideAsync(); }, [ready]);
  if (!ready) return null;

  const nav = { ...(t.dark ? DarkTheme : DefaultTheme) };
  nav.colors = { ...nav.colors, background: t.bg, card: t.surface, text: t.text, border: t.border, primary: t.primary };

  let body;
  if (status === 'loading') {
    body = <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}><ActivityIndicator size="large" color={t.primary} /></View>;
  } else if (status === 'error') {
    body = (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: t.bg, padding: 16 }}>
        <EmptyState icon="alert" tone="red" title="Can’t load your vocabulary" text={loadError}>
          <View style={{ gap: 10, alignSelf: 'stretch' }}>
            <Button title="Try again" icon="refresh" onPress={actions.reload} block />
            <Button title="Log out" variant="ghost" onPress={() => actions.logout()} block />
          </View>
        </EmptyState>
      </View>
    );
  } else {
    const authed = status === 'ready';
    body = (
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Protected guard={!authed}>
          <Stack.Screen name="login" />
        </Stack.Protected>
        <Stack.Protected guard={authed}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="word/[id]" />
          <Stack.Screen name="word-form" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="library-word/[id]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="review" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="quiz" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="settings/index" />
          <Stack.Screen name="settings/account" />
          <Stack.Screen name="settings/appearance" />
          <Stack.Screen name="settings/learning" />
          <Stack.Screen name="settings/notifications" />
          <Stack.Screen name="settings/voice" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="categories" />
          <Stack.Screen name="tags" />
          <Stack.Screen name="courses" />
          <Stack.Screen name="course/[id]/index" />
          <Stack.Screen name="course/[id]/day/[day]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="course/[id]/homework/[day]" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="course/[id]/warmup/[day]" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="course/[id]/learn/[day]" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="course/[id]/listening/[day]" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="course/[id]/leaderboard" />
          <Stack.Screen name="course/[id]/members" />
          <Stack.Screen name="course/[id]/member/[userId]" />
          <Stack.Screen name="course-edit/[id]/index" />
          <Stack.Screen name="course-edit/[id]/questions/[day]" />
          <Stack.Screen name="grammar/index" />
          <Stack.Screen name="grammar/[tense]" />
          <Stack.Screen name="grammar/practice" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="grammar/placement" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="dictation/index" />
          <Stack.Screen name="dictation/[set]" />
          <Stack.Screen name="dictation/practice" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
        </Stack.Protected>
      </Stack>
    );
  }

  return (
    <ThemeProvider value={nav}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      {body}
      <ToastHost />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsReady] = useFonts({
    PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold
  });
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Root fontsReady={fontsReady} />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
