import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Card, Icon, T } from '../../components/ui';
import { Row, SAMPLE, SettingsScreen, Stepper } from '../../components/settings/parts';
import { speak, useEnglishVoices } from '../../lib/speech';
import { useStore, useTheme } from '../../state/store';

export default function VoiceSettings() {
  const { data, actions } = useStore();
  const t = useTheme();
  const st = data.settings;
  const voices = useEnglishVoices();
  const [showVoices, setShowVoices] = useState(false);
  const voiceName = voices.find((v) => v.identifier === st.voice)?.name ?? 'Default English voice';
  return (
    <SettingsScreen title="Pronunciation voice">
      <Card>
        <Row title="Voice" sub={voices.length ? voices.length + ' English voices on this phone' : 'Loading voices…'}>
          <Pressable onPress={() => setShowVoices(!showVoices)} accessibilityRole="button" accessibilityLabel={'Voice: ' + voiceName} accessibilityState={{ expanded: showVoices }}
            style={{ minHeight: 46, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.surface }}>
            <T style={{ flex: 1 }} numberOfLines={1}>{voiceName}</T>
            <Icon name="down" size={16} color={t.muted} />
          </Pressable>
          {showVoices && (
            <View style={{ borderWidth: 1, borderColor: t.border, borderRadius: 12, overflow: 'hidden' }}>
              {[{ identifier: '', name: 'Default English voice', language: '' }, ...voices].map((v) => {
                const on = st.voice === v.identifier;
                return (
                  <Pressable key={v.identifier || 'default'} onPress={() => { actions.setSettings({ voice: v.identifier }); setShowVoices(false); speak('Hello!', 1, { voice: v.identifier }); }}
                    accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={v.name}
                    style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: on ? t.primarySoft : pressed ? t.surface2 : t.surface })}>
                    <T style={{ flex: 1, color: on ? t.primaryInk : t.text }} weight={on ? 'bold' : 'regular'} numberOfLines={1}>{v.name}</T>
                    {v.language ? <T size={12.5} tone="muted">{v.language}</T> : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        </Row>
        <Row title="Speed" sub="How fast words and sentences are read"><Stepper label="speed" suffix="×" value={st.rate} onChange={(v) => actions.setSettings({ rate: v })} /></Row>
        <Row title="Pitch" sub="Lower or higher voice"><Stepper label="pitch" value={st.pitch} onChange={(v) => actions.setSettings({ pitch: v })} /></Row>
        <Row title="Try it" sub={'“' + SAMPLE + '”'}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Play sample" icon="volume" variant="secondary" onPress={() => speak(SAMPLE, 1, { voice: st.voice, rate: st.rate, pitch: st.pitch })} style={{ flex: 1 }} />
            <Button title="Reset" variant="ghost" onPress={() => actions.setSettings({ voice: '', rate: 0.9, pitch: 1 })} />
          </View>
        </Row>
      </Card>
    </SettingsScreen>
  );
}
