import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { canPractiseMine, DictationSetCard, GROUP_TITLE, GROUPS, MINE } from '../../components/dictation';
import { Button, Card, Icon, IconTile, Screen, SectionTitle, T } from '../../components/ui';
import { api, type DictationList } from '../../lib/api';
import type { IconName } from '../../lib/icons';
import { errMsg, useStore, useTheme } from '../../state/store';

const MODES: [string, string, string, IconName, 'indigo' | 'green' | 'orange' | 'blue' | 'red'][] = [
  ['flash', 'Flashcards', 'Review your words with flip cards.', 'cards', 'indigo'],
  ['mc', 'Multiple Choice', 'Choose the right meaning for each word.', 'listcheck', 'green'],
  ['fill', 'Fill in the Blank', 'Complete sentences with the missing word.', 'type', 'orange'],
  ['trans', 'Translation', 'Translate Vietnamese into English.', 'globe', 'blue'],
  ['listen', 'Listening', 'Hear a word and type what you hear.', 'volume', 'red']
];

/** "Dictation · Nghe – chép": from my words, today's dictation and the sets. */
function DictationSection() {
  const { data } = useStore();
  const t = useTheme();
  const [list, setList] = useState<DictationList | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setList(await api.dictation()); setErr(''); } catch (e) { setErr(errMsg(e)); } finally { setLoading(false); }
  }, []);
  // Reload on focus: mastery and "done today" change after a practice.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const mineOk = canPractiseMine(data.words);
  const go = (mode: string) => router.push({ pathname: '/dictation/practice', params: { mode } });
  const done = !!list?.practisedToday;

  return (
    <View style={{ gap: 12, marginTop: 28 }}>
      <View style={{ gap: 2 }}>
        <T size={20} weight="extrabold" style={{ letterSpacing: -0.3 }}>Dictation · Nghe – chép</T>
        <T size={14} tone="muted">Listen to English and type exactly what you hear.</T>
      </View>

      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <IconTile name="pen" tone="indigo" size={48} />
          <View style={{ flex: 1 }}>
            <T size={17} weight="extrabold">From my words</T>
            <T size={14} tone="muted">{mineOk ? 'Hear a sentence from your word list and type it.' : 'Add words with example sentences first.'}</T>
          </View>
        </View>
        <Button title="Start" icon="right" variant="secondary" onPress={() => go(MINE)} disabled={!mineOk}
          accessibilityLabel={mineOk ? 'Start dictation from my words' : 'Dictation from my words: add words with example sentences first'} style={{ marginTop: 8 }} block />
      </Card>

      <View style={{ backgroundColor: t.primarySoft, borderColor: t.primary, borderWidth: 1.5, borderRadius: 18, padding: 20, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="volume" size={18} color={t.primaryInk} />
          <T size={13} weight="bold" tone="primaryInk" style={{ flex: 1, letterSpacing: 0.8, textTransform: 'uppercase' }}>Today’s dictation</T>
        </View>
        <T size={17} weight="extrabold" style={{ letterSpacing: -0.3 }}>{done ? 'Done today ✓ — practise again' : '10 sentences picked for you'}</T>
        <T size={13.5} tone="muted">Your recent mistakes first, then your weaker sets.</T>
        <Button title={done ? 'Practise again' : 'Start today’s dictation'} icon="right" size="lg" block variant={done ? 'secondary' : 'primary'}
          accessibilityLabel={done ? 'Today’s dictation is done. Practise again' : 'Start today’s dictation'}
          onPress={() => go('daily')} disabled={!list} />
      </View>

      {!list ? (
        loading || !err ? <ActivityIndicator color={t.primary} style={{ marginTop: 12 }} /> : (
          <Card style={{ gap: 10 }}>
            <T size={14} tone="danger" weight="semibold">Couldn’t load the dictation sets. {err}</T>
            <Button title="Try again" icon="refresh" variant="secondary" onPress={() => void load()} accessibilityLabel="Try loading the dictation sets again" />
          </Card>
        )
      ) : GROUPS.map((g) => {
        const sets = list.sets.filter((s) => s.group === g);
        if (!sets.length) return null;
        return (
          <View key={g} style={{ gap: 12 }}>
            <SectionTitle style={{ marginTop: 6 }}>{GROUP_TITLE[g]}</SectionTitle>
            {sets.map((s) => <DictationSetCard key={s.id} x={s} />)}
          </View>
        );
      })}
    </View>
  );
}

export default function Practice() {
  const { data, actions } = useStore();
  const start = (mode: string) => {
    if (!data.words.length) { actions.showToast('Save some words first to practice.', 'bad'); return; }
    if (mode === 'flash') router.push({ pathname: '/review', params: { mode: 'flash' } });
    else router.push({ pathname: '/quiz', params: { mode } });
  };
  return (
    <Screen title="Practice" sub="Choose how you want to practice.">
      <View style={{ gap: 12 }}>
        {MODES.map(([mode, title, desc, icon, tone]) => (
          <Card key={mode} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <IconTile name={icon} tone={tone} size={48} />
              <View style={{ flex: 1 }}>
                <T size={17} weight="extrabold">{title}</T>
                <T size={14} tone="muted">{desc}</T>
              </View>
            </View>
            <Button title="Start" icon="right" variant="secondary" onPress={() => start(mode)} style={{ marginTop: 8 }} block />
          </Card>
        ))}
      </View>
      <DictationSection />
    </Screen>
  );
}
