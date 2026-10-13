import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Linking, Platform } from 'react-native';
import { api } from './api';

/** Last token sent to the server: { token, at } (so we don't resend on every launch). */
const SENT_KEY = 'wordbook_push_sent';
const DAY = 24 * 60 * 60 * 1000;

// Show banners (with sound) while the app is open, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false
  })
});

async function readSent(): Promise<{ token: string; at: number } | null> {
  try {
    const raw = await SecureStore.getItemAsync(SENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
async function writeSent(v: { token: string; at: number } | null): Promise<void> {
  try {
    if (v) await SecureStore.setItemAsync(SENT_KEY, JSON.stringify(v));
    else await SecureStore.deleteItemAsync(SENT_KEY);
  } catch { /* storage unavailable */ }
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#5847D6'
  });
}

export type PushStatus = 'on' | 'off' | 'undetermined' | 'unavailable';

/** Whether pushes can reach this phone (system permission). */
export async function pushStatus(): Promise<PushStatus> {
  if (!Device.isDevice || Platform.OS === 'web') return 'unavailable';
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.granted ? 'on' : p.canAskAgain && p.status === 'undetermined' ? 'undetermined' : 'off';
  } catch { return 'unavailable'; }
}

export function openPushSettings(): void { void Linking.openSettings(); }

/**
 * Asks for permission (once signed in) and sends this phone's Expo push token to the server.
 * Resends only when the token changed or once a day. Never throws. `force` skips the cache.
 */
export async function registerForPush(force = false): Promise<PushStatus> {
  try {
    if (!Device.isDevice || Platform.OS === 'web') return 'unavailable';
    await ensureChannel();
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return 'off';
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const sent = await readSent();
    if (force || !sent || sent.token !== token || Date.now() - sent.at > DAY) {
      await api.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
      await writeSent({ token, at: Date.now() });
    }
    return 'on';
  } catch (e) {
    // e.g. FCM not configured in this build, no network: just log.
    console.warn('Push registration failed:', e instanceof Error ? e.message : e);
    return 'off';
  }
}

/** On logout: tells the server to stop pushing to this phone. Call while the session token is still set. Never throws. */
export async function unregisterPush(): Promise<void> {
  const sent = await readSent();
  await writeSent(null);
  if (!sent) return;
  try { await api.unregisterPushToken(sent.token); }
  catch (e) { console.warn('Push unregister failed:', e instanceof Error ? e.message : e); }
}
