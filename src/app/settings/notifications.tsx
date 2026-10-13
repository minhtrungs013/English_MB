import { useState } from 'react';
import { View } from 'react-native';
import { api } from '../../lib/api';
import { Button, Card, SectionTitle, T } from '../../components/ui';
import { NOTE_GROUPS, pushLabel, SettingsScreen, SwitchRow, usePushStatus } from '../../components/settings/parts';
import { openPushSettings, registerForPush } from '../../lib/push';
import { useStore } from '../../state/store';

export default function NotificationSettings() {
  const { data, actions } = useStore();
  const mute = data.settings.mute ?? [];
  const [push, setPush] = usePushStatus();
  const turnOnPush = async () => setPush(await registerForPush(true));
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  // Re-registers this phone first (so a missing token is fixed), then asks the server to push to it now.
  const sendTest = async () => {
    setTesting(true); setTestMsg('');
    try {
      await registerForPush(true);
      const r = await api.pushTest();
      const bad = r.results.filter((x) => x.status !== 'ok');
      setTestMsg(!r.devices ? 'This phone isn’t registered for push yet. Allow notifications, then try again.'
        : bad.length ? 'The push service refused it: ' + (bad[0].error ?? 'unknown error') + '.'
        : 'Sent — it should arrive in a few seconds.');
    } catch (e) {
      setTestMsg('Couldn’t send a test: ' + (e as Error).message);
    } finally {
      setTesting(false);
    }
  };
  return (
    <SettingsScreen title="Notifications">
      <Card>
        <SectionTitle>Push notifications</SectionTitle>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 44 }}>
          <T size={13.5} tone="muted" style={{ flex: 1 }}>{pushLabel(push)}</T>
          {push === 'undetermined' ? <Button title="Turn on" size="sm" onPress={turnOnPush} accessibilityLabel="Turn on push notifications" /> : null}
          {push === 'off' ? <Button title="Open settings" size="sm" variant="secondary" onPress={openPushSettings} accessibilityLabel="Open phone settings to allow push notifications" /> : null}
        </View>
        {push === 'on' ? (
          <View style={{ gap: 8, paddingBottom: 8 }}>
            <Button title={testing ? 'Sending…' : 'Send test notification'} size="sm" variant="secondary" onPress={sendTest} disabled={testing}
              accessibilityLabel="Send a test push notification to this phone" />
            {testMsg ? <View accessibilityLiveRegion="polite"><T size={13} tone="muted">{testMsg}</T></View> : null}
          </View>
        ) : null}
      </Card>
      <T size={13.5} tone="muted">Choose what shows up under the bell on Home. These switches apply to both the bell and push notifications.</T>
      {NOTE_GROUPS.map((g) => (
        <Card key={g.title}>
          <T size={13.5} weight="extrabold" tone="primaryInk" style={{ marginBottom: 2 }}>{g.title}</T>
          {g.items.map(([type, title, sub], i) => (
            <SwitchRow key={type} first={i === 0} title={title} sub={sub} label={title + ' notifications'} value={!mute.includes(type)}
              onChange={(v) => actions.setSettings({ mute: v ? mute.filter((x) => x !== type) : [...mute, type] })} />
          ))}
        </Card>
      ))}
    </SettingsScreen>
  );
}
