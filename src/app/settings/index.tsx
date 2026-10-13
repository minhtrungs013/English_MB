import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Card, Icon, IconTile, T } from '../../components/ui';
import { SettingsScreen, usePushStatus } from '../../components/settings/parts';
import { API_URL } from '../../lib/api';
import type { IconName } from '../../lib/icons';
import { useEnglishVoices } from '../../lib/speech';
import { STYLES } from '../../lib/theme';
import { useStore, useTheme } from '../../state/store';

type Href = '/settings/account' | '/settings/appearance' | '/settings/learning' | '/settings/voice' | '/settings/notifications';
type Item = { href: Href; icon: IconName; tone: 'indigo' | 'amber' | 'green' | 'orange' | 'blue' | 'red'; title: string; sub: string };

function SectionRow({ item, first }: { item: Item; first: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => router.push(item.href)} accessibilityRole="button" accessibilityLabel={item.title + ', ' + item.sub}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, paddingHorizontal: 4,
        borderTopWidth: first ? 0 : 1, borderTopColor: t.border, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
      <IconTile name={item.icon} tone={item.tone} />
      <View style={{ flex: 1 }}>
        <T weight="bold">{item.title}</T>
        <T size={13.5} tone="muted" numberOfLines={1}>{item.sub}</T>
      </View>
      <Icon name="right" size={18} color={t.muted} />
    </Pressable>
  );
}

/** Settings index: one row per section with a summary of its current values. */
export default function Settings() {
  const { data, seasonal } = useStore();
  const st = data.settings;
  const [push] = usePushStatus();
  const voices = useEnglishVoices();
  const voiceName = voices.find((v) => v.identifier === st.voice)?.name ?? 'Default voice';
  const styleName = STYLES.find(([id]) => id === (st.style ?? 'classic'))?.[1] ?? 'Classic';
  const themeName = st.theme === 'light' ? 'Light' : st.theme === 'dark' ? 'Dark' : 'System';
  const muted = (st.mute ?? []).length;
  const groups: { title: string; items: Item[] }[] = [
    { title: 'You', items: [
      { href: '/settings/account', icon: 'users', tone: 'indigo', title: 'Account', sub: (st.name ? st.name + ' · ' : '') + st.email }
    ] },
    { title: 'Preferences', items: [
      { href: '/settings/appearance', icon: 'sparkle', tone: 'orange', title: 'Appearance', sub: styleName + ' · ' + themeName + (seasonal ? ' · Seasonal' : '') },
      { href: '/settings/learning', icon: 'cap', tone: 'green', title: 'Learning', sub: st.goal + ' words · ' + (st.dir === 'en-vi' ? 'EN → VI' : 'VI → EN') + (st.autoplay ? ' · Auto-play' : '') },
      { href: '/settings/voice', icon: 'volume', tone: 'blue', title: 'Pronunciation voice', sub: voiceName + ' · ' + st.rate.toFixed(2) + '×' },
      { href: '/settings/notifications', icon: 'bell', tone: 'amber', title: 'Notifications', sub: 'Push ' + (push === null ? '…' : push === 'on' ? 'on' : 'off') + ' · ' + (muted ? muted + ' muted' : 'All types on') }
    ] }
  ];
  return (
    <SettingsScreen title="Settings">
      {groups.map((g) => (
        <View key={g.title} style={{ gap: 6 }}>
          <T size={13} weight="extrabold" tone="muted" style={{ marginLeft: 4, textTransform: 'uppercase' }}>{g.title}</T>
          <Card style={{ paddingVertical: 4 }}>{g.items.map((it, i) => <SectionRow key={it.href} item={it} first={i === 0} />)}</Card>
        </View>
      ))}
      <T size={12} tone="faint" center>Server: {API_URL}</T>
    </SettingsScreen>
  );
}
