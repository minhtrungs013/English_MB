import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Badge, Button, Card, Icon, IconTile, Screen, SectionTitle, T } from '../../components/ui';
import { api, type PracticeStats, type PracticeWordMode } from '../../lib/api';
import type { IconName } from '../../lib/icons';
import { WEAK_MODE_LABEL } from '../../lib/practice';
import { hasWordform } from '../../lib/wordform';
import { useStore, useTheme } from '../../state/store';

type Tone = 'indigo' | 'green' | 'orange' | 'blue' | 'red' | 'amber';
/** The practice rows in two groups: a practice mode, or a screen of its own (dictation, write, mistakes). */
const GROUPS: { title: string; rows: [string, string, string, IconName, Tone][] }[] = [
  {
    title: 'Words',
    rows: [
      ['flash', 'Flashcards', 'Flip cards to review your words.', 'cards', 'indigo'],
      ['mc', 'Multiple choice', 'Pick the right meaning.', 'listcheck', 'green'],
      ['trans', 'Translation', 'Vietnamese → type the English word.', 'globe', 'blue'],
      ['listen', 'Listening', 'Hear a word, type it.', 'volume', 'red'],
      ['wordform', 'Word forms', 'decide → decision, decisive.', 'layers', 'indigo']
    ]
  },
  {
    title: 'Sentences',
    rows: [
      ['fill', 'Fill in the blank', 'Complete sentences with your words.', 'type', 'orange'],
      ['tense', 'Verb tenses', 'Put the verb in the right tense.', 'clock', 'amber'],
      ['dictation', 'Dictation', 'Listen and type — nghe – chép.', 'headphones', 'amber'],
      ['write', 'Write a sentence', 'Your own sentence, scored by AI.', 'sparkle', 'green'],
      ['mistakes', 'My mistakes', 'What you get wrong in your sentences.', 'alert', 'red']
    ]
  }
];

/** Word forms needs at least this many saved words with a usable family. */
const WORDFORM_MIN = 3;
/** Weak words shown before "Show all". */
const WEAK_SHOWN = 5;

const ago = (t: number) => {
  if (!t) return '';
  const d = Math.floor((Date.now() - t) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago';
};

/** The words I keep getting wrong in practice, the modes I get them wrong in, and this week's progress. */
function WeakWords({ st }: { st: PracticeStats }) {
  const t = useTheme();
  const [all, setAll] = useState(false);
  const fixed = st.week.fixed;
  if (!st.weak.length) {
    return (
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="checkc" size={20} color={t.success} />
          <T size={17} weight="extrabold" style={{ flex: 1 }}>Words to fix</T>
        </View>
        <T size={14} tone="muted">
          {st.records.length ? 'No weak words right now 🎉 Words you get wrong in practice show up here until you get them right twice in a row.'
            : 'Words you get wrong in practice show up here, so you can practise them again until you get them right twice in a row.'}
        </T>
        {fixed > 0 ? <T size={13} tone="muted">This week: {fixed} {fixed === 1 ? 'word' : 'words'} fixed</T> : null}
      </Card>
    );
  }
  const list = all ? st.weak : st.weak.slice(0, WEAK_SHOWN);
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="alert" size={20} color={t.danger} />
        <T size={17} weight="extrabold" style={{ flex: 1 }}>Words to fix</T>
        <Badge label={String(st.weak.length)} bg={t.dangerSoft} fg={t.danger} />
      </View>
      <T size={13} tone="muted">This week: {fixed} {fixed === 1 ? 'word' : 'words'} fixed · {st.week.wrong} wrong {st.week.wrong === 1 ? 'answer' : 'answers'}</T>
      {list.map((x) => (
        <Pressable key={x.wordId} onPress={() => router.push({ pathname: '/word/[id]', params: { id: x.wordId } })} accessibilityRole="button"
          accessibilityLabel={x.word + ', ' + x.modes.map((m) => WEAK_MODE_LABEL[m.mode] + ' ' + m.errors).join(', ')}
          style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <T size={16} weight="extrabold">{x.word}</T>
            {x.vi ? <T size={13.5} tone="muted">{x.vi}</T> : null}
            {x.lastWrongAt ? <T size={12} tone="muted" style={{ marginLeft: 'auto' }}>wrong {ago(x.lastWrongAt)}</T> : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {x.modes.map((m) => <Badge key={m.mode} label={WEAK_MODE_LABEL[m.mode] + ' ×' + m.errors + (m.spelling ? ' · spelling' : '')} bg={t.warningSoft} fg={t.warning} />)}
          </View>
        </Pressable>
      ))}
      {st.weak.length > WEAK_SHOWN ? <Button title={all ? 'Show fewer' : 'Show all ' + st.weak.length} variant="ghost" size="sm" onPress={() => setAll(!all)} /> : null}
      <Button title={st.weak.length === 1 ? 'Practise it now' : 'Practise these now'} icon="refresh" onPress={() => router.push({ pathname: '/quiz', params: { mode: 'weak' } })} block />
    </Card>
  );
}

export default function Practice() {
  const { data, actions } = useStore();
  const t = useTheme();
  const familyWords = useMemo(() => data.words.filter((w) => hasWordform(w.family)).length, [data.words]);
  const [st, setSt] = useState<PracticeStats | null>(null);
  // Fresh numbers each time the tab shows (practice sessions change them).
  useFocusEffect(useCallback(() => { api.practiceStats().then(setSt).catch(() => setSt(null)); }, []));
  const start = (mode: string) => {
    // Dictation has its own hub (sets, today's dictation, from my words) and works without saved words.
    if (mode === 'dictation') { router.push('/dictation'); return; }
    if (mode === 'mistakes') { router.push('/mistakes'); return; }
    if (!data.words.length) { actions.showToast('Save some words first to practice.', 'bad'); return; }
    if (mode === 'write') router.push('/write-sentence');
    else if (mode === 'flash') router.push({ pathname: '/review', params: { mode: 'flash' } });
    else router.push({ pathname: '/quiz', params: { mode } });
  };
  return (
    <Screen title="Practice" sub="Choose how you want to practice.">
      <View style={{ gap: 12 }}>
        {st ? <WeakWords st={st} /> : null}
        {GROUPS.map((g) => (
          <View key={g.title} style={{ gap: 8 }}>
            <SectionTitle style={{ marginTop: 4 }}>{g.title}</SectionTitle>
            <Card pad={false}>
              {g.rows.map(([mode, title, desc, icon, tone], k) => {
                const locked = mode === 'wordform' && familyWords < WORDFORM_MIN;
                const weak = st?.byMode[mode as PracticeWordMode] ?? 0;
                return (
                  <Pressable key={mode} onPress={() => start(mode)} disabled={locked} accessibilityRole="button"
                    accessibilityLabel={title + (weak ? ', ' + weak + ' to fix' : '') + (locked ? ', locked' : '')} accessibilityState={{ disabled: locked }}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10,
                      borderTopWidth: k ? 1 : 0, borderTopColor: t.border, opacity: locked ? 0.6 : 1, backgroundColor: pressed ? t.surface2 : 'transparent'
                    })}>
                    <IconTile name={locked ? 'lock' : icon} tone={tone} size={40} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <T size={15.5} weight="extrabold">{title}</T>
                        {weak > 0 ? <Badge label={weak + ' to fix'} bg={t.warningSoft} fg={t.warning} /> : null}
                      </View>
                      <T size={13} tone="muted" numberOfLines={2}>{locked ? 'Save at least ' + WORDFORM_MIN + ' words with a word family (“+N forms”) first.' : desc}</T>
                    </View>
                    {locked ? null : <Icon name="right" size={18} color={t.faint} />}
                  </Pressable>
                );
              })}
            </Card>
          </View>
        ))}
      </View>
    </Screen>
  );
}
