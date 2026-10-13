import { View } from 'react-native';
import { Button, Card, SectionTitle, T } from '../../components/ui';
import { NOTE_GROUPS, pushLabel, SettingsScreen, SwitchRow, usePushStatus } from '../../components/settings/parts';
import { openPushSettings, registerForPush } from '../../lib/push';
import { useStore } from '../../state/store';

export default function NotificationSettings() {
  const { data, actions } = useStore();
  const mute = data.settings.mute ?? [];
  const [push, setPush] = usePushStatus();
  const turnOnPush = async () => setPush(await registerForPush(true));
  return (
    <SettingsScreen title="Notifications">
      <Card>
        <SectionTitle>Push notifications</SectionTitle>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 44 }}>
          <T size={13.5} tone="muted" style={{ flex: 1 }}>{pushLabel(push)}</T>
          {push === 'undetermined' ? <Button title="Turn on" size="sm" onPress={turnOnPush} accessibilityLabel="Turn on push notifications" /> : null}
          {push === 'off' ? <Button title="Open settings" size="sm" variant="secondary" onPress={openPushSettings} accessibilityLabel="Open phone settings to allow push notifications" /> : null}
        </View>
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
