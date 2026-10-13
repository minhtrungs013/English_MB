import { Pressable, View } from 'react-native';
import { Card, Chip, Icon, SectionTitle, T } from '../../components/ui';
import { SettingsScreen, StylePicker, SwitchRow } from '../../components/settings/parts';
import type { Theme } from '../../lib/data';
import { ACCENT_SWATCH } from '../../lib/theme';
import { useStore, useTheme } from '../../state/store';

export default function AppearanceSettings() {
  const { data, actions, seasonal } = useStore();
  const t = useTheme();
  const st = data.settings;
  const notClassic = (st.style ?? 'classic') !== 'classic';
  return (
    <SettingsScreen title="Appearance">
      <Card style={{ gap: 12 }}>
        <SectionTitle>Style</SectionTitle>
        <StylePicker />
      </Card>
      <Card style={{ gap: 12 }}>
        <SectionTitle>Theme</SectionTitle>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {([['light', 'Light'], ['dark', 'Dark'], ['system', 'System']] as [Theme, string][]).map(([v, l]) => <Chip key={v} label={l} on={st.theme === v} onPress={() => actions.setSettings({ theme: v })} />)}
        </View>
      </Card>
      <Card style={{ gap: 12 }}>
        <SectionTitle>Accent color</SectionTitle>
        {notClassic ? <T size={13} tone="muted">The accent color applies to the Classic style; other styles bring their own colors.</T> : null}
        <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, notClassic && { opacity: 0.4 }]} accessibilityRole="radiogroup"
          pointerEvents={notClassic ? 'none' : 'auto'} accessibilityElementsHidden={notClassic}>
          {ACCENT_SWATCH.map(([v, label, hex]) => {
            const on = st.accent === v;
            return (
              <Pressable key={v} onPress={() => actions.setSettings({ accent: v })} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label}
                style={{ alignItems: 'center', gap: 6, width: 64 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: hex, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 3 : 0, borderColor: t.text }}>
                  {on ? <Icon name="check" size={18} color="#fff" /> : null}
                </View>
                <T size={12.5} weight="bold" tone={on ? 'text' : 'muted'}>{label}</T>
              </Pressable>
            );
          })}
        </View>
      </Card>
      <Card>
        <SwitchRow first title="Seasonal decorations" sub="Lanterns for Tết and Mid-Autumn, snow at Christmas, confetti at New Year (Home only, on this phone)" value={seasonal} onChange={actions.setSeasonal} />
      </Card>
    </SettingsScreen>
  );
}
