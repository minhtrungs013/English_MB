import { useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import { BackBar, Button, Card, Chip, Field, Icon, Input, SectionTitle, T } from '../components/ui';
import { api, API_URL, type NoteType } from '../lib/api';
import type { Theme } from '../lib/data';
import { speak, useEnglishVoices } from '../lib/speech';
import { ACCENT_SWATCH } from '../lib/theme';
import { errMsg, useStore, useTheme } from '../state/store';

const SAMPLE = 'Could you clarify the requirements before the deadline?';

/** Notification switches, grouped (each one adds or removes its type from the `mute` setting). */
const NOTE_GROUPS: { title: string; items: [type: NoteType, title: string, sub: string][] }[] = [
  {
    title: 'Courses — learner',
    items: [
      ['course_start', 'Course starting', 'The day before a course you joined starts'],
      ['day_open', 'New course day', 'When today’s words are open'],
      ['homework_due', 'Homework due', 'When today’s homework isn’t handed in yet'],
      ['streak_risk', 'Streak at risk', 'When your course streak ends tonight'],
      ['homework_late', 'Late homework', 'When a day’s homework is overdue'],
      ['member_removed', 'Removed from a course', 'When a course owner removes you']
    ]
  },
  {
    title: 'Courses — owner',
    items: [
      ['member_joined', 'New members', 'When someone joins your course'],
      ['owner_pending', 'Waiting for approval', 'Questions or dialogues to review'],
      ['owner_empty_day', 'Days without words', 'When a learner is about to reach an empty day']
    ]
  },
  {
    title: 'Vocabulary & library',
    items: [
      ['words_due', 'Words due for review', 'Once a day, when words are waiting'],
      ['library_saved', 'Your shared words', 'When someone saves a word you shared']
    ]
  }
];

function Row({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: 14, borderTopWidth: 1, borderTopColor: t.border, gap: 10 }}>
      <View>
        <T weight="bold">{title}</T>
        {sub ? <T size={13.5} tone="muted">{sub}</T> : null}
      </View>
      {children}
    </View>
  );
}

/** − value + control (sliders aren't part of React Native core). */
function Stepper({ value, onChange, label, suffix = '' }: { value: number; onChange: (v: number) => void; label: string; suffix?: string }) {
  const t = useTheme();
  const set = (v: number) => onChange(Math.round(Math.min(1.5, Math.max(0.5, v)) * 100) / 100);
  const btn = (name: 'plus' | 'x', d: number, a11y: string) => (
    <Pressable onPress={() => set(value + d)} accessibilityRole="button" accessibilityLabel={a11y}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: t.border, backgroundColor: pressed ? t.surface2 : t.surface, alignItems: 'center', justifyContent: 'center' })}>
      {name === 'plus' ? <Icon name="plus" size={18} color={t.text} /> : <T size={22} weight="bold">−</T>}
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityLabel={label + ' ' + value.toFixed(2)}>
      {btn('x', -0.1, 'Decrease ' + label)}
      <View style={{ flex: 1, height: 8, borderRadius: 99, backgroundColor: t.surface3, overflow: 'hidden' }}>
        <View style={{ width: `${(value - 0.5) * 100}%` as const, height: '100%', backgroundColor: t.primary }} />
      </View>
      <T weight="bold" style={{ minWidth: 48, textAlign: 'right' }}>{value.toFixed(2)}{suffix}</T>
      {btn('plus', 0.1, 'Increase ' + label)}
    </View>
  );
}

export default function Settings() {
  const { data, actions } = useStore();
  const t = useTheme();
  const st = data.settings;
  const mute = st.mute ?? [];
  const voices = useEnglishVoices();
  const [showVoices, setShowVoices] = useState(false);
  const voiceName = voices.find((v) => v.identifier === st.voice)?.name ?? 'Default English voice';

  const deleteAccount = () => Alert.alert('Delete your account?', 'This permanently deletes your account and all of your vocabulary. This action cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete account', style: 'destructive', onPress: async () => {
      try { await api.deleteAccount(); await actions.logout(); actions.showToast('Your account has been deleted.'); }
      catch (e) { actions.showToast(errMsg(e), 'bad'); }
    } }
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title="Settings" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 14 }}>
          <SectionTitle>Profile</SectionTitle>
          <Field label="Name"><Input value={st.name} onChangeText={(v) => actions.setSettings({ name: v })} /></Field>
          <Field label="Email" hint="Used to log in; can’t be changed."><Input value={st.email} editable={false} style={{ color: t.muted }} /></Field>
        </Card>

        <Card>
          <SectionTitle style={{ marginBottom: 6 }}>Learning preferences</SectionTitle>
          <Row title="Daily review goal" sub="The most words one review session will show">
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{['10', '20', '30', '50'].map((g) => <Chip key={g} label={g + ' words'} on={st.goal === g} onPress={() => actions.setSettings({ goal: g })} />)}</View>
          </Row>
          <Row title="Review direction" sub="What appears on the front of a flashcard">
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Chip label="English → Vietnamese" on={st.dir === 'en-vi'} onPress={() => actions.setSettings({ dir: 'en-vi' })} />
              <Chip label="Vietnamese → English" on={st.dir === 'vi-en'} onPress={() => actions.setSettings({ dir: 'vi-en' })} />
            </View>
          </Row>
          {[['Auto-play pronunciation', 'Speak each word when a flashcard appears', 'autoplay'], ['Show example sentence', 'Include the example on the back of each card', 'showEx']].map(([title, sub, key]) => (
            <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: t.border }}>
              <View style={{ flex: 1 }}><T weight="bold">{title}</T><T size={13.5} tone="muted">{sub}</T></View>
              <Switch value={st[key as 'autoplay' | 'showEx']} onValueChange={(v) => actions.setSettings({ [key]: v })} trackColor={{ true: t.primary, false: t.surface3 }} thumbColor="#fff" accessibilityLabel={title} />
            </View>
          ))}
        </Card>

        <Card>
          <SectionTitle>Notifications</SectionTitle>
          <T size={13.5} tone="muted" style={{ marginTop: 4 }}>Choose what shows up under the bell on Home.</T>
          {NOTE_GROUPS.map((g) => (
            <View key={g.title} style={{ marginTop: 14 }}>
              <T size={13.5} weight="extrabold" tone="primaryInk" style={{ marginBottom: 2 }}>{g.title}</T>
              {g.items.map(([type, title, sub]) => {
                const on = !mute.includes(type);
                return (
                  <View key={type} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: t.border }}>
                    <View style={{ flex: 1 }}><T weight="bold">{title}</T><T size={13.5} tone="muted">{sub}</T></View>
                    <Switch value={on} onValueChange={(v) => actions.setSettings({ mute: v ? mute.filter((x) => x !== type) : [...mute, type] })}
                      trackColor={{ true: t.primary, false: t.surface3 }} thumbColor="#fff" accessibilityLabel={title + ' notifications'} />
                  </View>
                );
              })}
            </View>
          ))}
        </Card>

        <Card style={{ gap: 12 }}>
          <SectionTitle>Appearance</SectionTitle>
          <T size={13.5} weight="bold">Theme</T>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {([['light', 'Light'], ['dark', 'Dark'], ['system', 'System']] as [Theme, string][]).map(([v, l]) => <Chip key={v} label={l} on={st.theme === v} onPress={() => actions.setSettings({ theme: v })} />)}
          </View>
          <T size={13.5} weight="bold" style={{ marginTop: 6 }}>Accent color</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }} accessibilityRole="radiogroup">
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
          <SectionTitle style={{ marginBottom: 6 }}>Pronunciation voice</SectionTitle>
          <Row title="Voice" sub={voices.length ? voices.length + ' English voices on this phone' : 'Loading voices…'}>
            <Pressable onPress={() => setShowVoices(!showVoices)} accessibilityRole="button" accessibilityState={{ expanded: showVoices }}
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
                      style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: on ? t.primarySoft : pressed ? t.surface2 : t.surface })}>
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

        <Card style={{ gap: 10 }}>
          <SectionTitle>Account</SectionTitle>
          <T size={13.5} tone="muted">Signed in as {st.email}. Change your password on the web app.</T>
          <Button title="Log out" icon="logout" variant="secondary" onPress={() => actions.logout()} />
          <Button title="Delete account" icon="trash" variant="dangerSoft" onPress={deleteAccount} />
        </Card>
        <T size={12} tone="faint" center>Server: {API_URL}</T>
      </ScrollView>
    </View>
  );
}
