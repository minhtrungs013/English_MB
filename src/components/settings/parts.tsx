import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Pressable, ScrollView, Switch, View } from 'react-native';
import type { NoteType } from '../../lib/api';
import { pushStatus, type PushStatus } from '../../lib/push';
import { makeTheme, lockMessage, styleLock, STYLES } from '../../lib/theme';
import { BackBar, Icon, T } from '../ui';
import { useStore, useTheme } from '../../state/store';

export const SAMPLE = 'Could you clarify the requirements before the deadline?';

/** Scrollable page shell for a settings sub-screen. */
export function SettingsScreen({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title={title} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    </View>
  );
}

/** Title + description row with a switch on the right. */
export function SwitchRow({ title, sub, value, onChange, label, first }: { title: string; sub?: string; value: boolean; onChange: (v: boolean) => void; label?: string; first?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 44, borderTopWidth: first ? 0 : 1, borderTopColor: t.border }}>
      <View style={{ flex: 1 }}><T weight="bold">{title}</T>{sub ? <T size={13.5} tone="muted">{sub}</T> : null}</View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: t.primary, false: t.surface3 }} thumbColor="#fff" accessibilityLabel={label ?? title} />
    </View>
  );
}

/** Push permission status, re-checked when coming back from the system settings. */
export function usePushStatus() {
  const [push, setPush] = useState<PushStatus | null>(null);
  useEffect(() => {
    const check = () => { void pushStatus().then(setPush); };
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, []);
  return [push, setPush] as const;
}

export const pushLabel = (push: PushStatus | null) => push === null ? 'Checking…' : push === 'on' ? 'On: reminders also pop up on this phone' : push === 'unavailable' ? 'Not available on this device' : push === 'undetermined' ? 'Off: allow them to get reminders on this phone' : 'Off in your phone’s settings';

/** Notification switches, grouped (each one adds or removes its type from the `mute` setting). */
export const NOTE_GROUPS: { title: string; items: [type: NoteType, title: string, sub: string][] }[] = [
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

export function Row({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
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
export function Stepper({ value, onChange, label, suffix = '' }: { value: number; onChange: (v: number) => void; label: string; suffix?: string }) {
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

/** Style cards (bonus ones locked until their streak), two per row, two per row; each draws a tiny mock (header, card, button) with that style's own tokens. */
export function StylePicker() {
  const t = useTheme();
  const { data, actions } = useStore();
  const current = data.settings.style ?? 'classic';
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }} accessibilityRole="radiogroup" accessibilityLabel="App style">
      {STYLES.map(([id, name, desc]) => {
        const on = current === id;
        const s = makeTheme(id, t.dark, data.settings.accent, false);
        const lock = styleLock(id, data.progress);
        const pick = () => (lock.locked ? actions.showToast(lockMessage(lock.need), 'bad') : void actions.setStyle(id));
        return (
          <Pressable key={id} onPress={pick} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: lock.locked }}
            accessibilityLabel={name + ', ' + desc + (lock.locked ? '. Locked: unlocks at a ' + lock.need + '-day streak, ' + lock.have + ' of ' + lock.need + ' days' : '')}
            style={({ pressed }) => ({ flexBasis: '47%', flexGrow: 1, minHeight: 44, borderRadius: t.radius.md, borderWidth: on ? 2 : 1,
              borderColor: on ? t.primary : t.border, padding: on ? 7 : 8, gap: 8, backgroundColor: pressed ? t.surface2 : t.surface })}>
            <View style={{ height: 76, borderRadius: s.radius.sm, backgroundColor: s.bg, overflow: 'hidden', borderWidth: 1, borderColor: s.border }}>
              <View style={{ height: 14, backgroundColor: s.surface, borderBottomWidth: 1, borderBottomColor: s.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.primary }} />
                <View style={{ width: 26, height: 4, borderRadius: 2, backgroundColor: s.text }} />
              </View>
              <View style={{ margin: 6, padding: 6, gap: 4, borderRadius: s.radius.sm, backgroundColor: s.surface, borderWidth: 1, borderColor: s.border }}>
                <View style={{ width: '70%', height: 4, borderRadius: 2, backgroundColor: s.text }} />
                <View style={{ width: '45%', height: 4, borderRadius: 2, backgroundColor: s.muted }} />
                <View style={{ alignSelf: 'flex-start', width: 34, height: 10, borderRadius: Math.min(s.radius.sm, 5), backgroundColor: s.primary }} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T size={13.5} weight="bold" style={{ flex: 1 }} numberOfLines={1}>{name}</T>
              {on ? <Icon name="check" size={16} color={t.primary} /> : null}
              {lock.locked ? <Icon name="lock" size={16} color={t.muted} /> : null}
            </View>
            {lock.locked ? (
              <View style={{ gap: 4 }}>
                <T size={12} weight="bold" tone="primaryInk">Unlocks at a {lock.need}-day streak</T>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surface3, overflow: 'hidden' }}>
                  <View style={{ width: `${Math.round((lock.have / lock.need) * 100)}%` as const, height: '100%', backgroundColor: t.primary }} />
                </View>
                <T size={12} tone="muted">{lock.have} / {lock.need} days</T>
              </View>
            ) : <T size={12} tone="muted" numberOfLines={2}>{desc}</T>}
          </Pressable>
        );
      })}
    </View>
  );
}
