import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { Button, Card, IconTile, Screen, T } from '../../components/ui';
import type { IconName } from '../../lib/icons';
import { hasWordform } from '../../lib/wordform';
import { useStore } from '../../state/store';

const MODES: [string, string, string, IconName, 'indigo' | 'green' | 'orange' | 'blue' | 'red' | 'amber'][] = [
  ['flash', 'Flashcards', 'Review your words with flip cards.', 'cards', 'indigo'],
  ['mc', 'Multiple Choice', 'Choose the right meaning for each word.', 'listcheck', 'green'],
  ['fill', 'Fill in the Blank', 'Complete sentences with the missing word.', 'type', 'orange'],
  ['wordform', 'Word forms', 'Use the right form: decide → decision, decisive.', 'layers', 'indigo'],
  ['trans', 'Translation', 'Translate Vietnamese into English.', 'globe', 'blue'],
  ['listen', 'Listening', 'Hear a word and type what you hear.', 'volume', 'red'],
  ['dictation', 'Dictation', 'Listen to sentences and type them — Nghe – chép.', 'headphones', 'amber']
];

/** Word forms needs at least this many saved words with a usable family. */
const WORDFORM_MIN = 3;

export default function Practice() {
  const { data, actions } = useStore();
  const familyWords = useMemo(() => data.words.filter((w) => hasWordform(w.family)).length, [data.words]);
  const start = (mode: string) => {
    // Dictation has its own hub (sets, today's dictation, from my words) and works without saved words.
    if (mode === 'dictation') { router.push('/dictation'); return; }
    if (!data.words.length) { actions.showToast('Save some words first to practice.', 'bad'); return; }
    if (mode === 'flash') router.push({ pathname: '/review', params: { mode: 'flash' } });
    else router.push({ pathname: '/quiz', params: { mode } });
  };
  return (
    <Screen title="Practice" sub="Choose how you want to practice.">
      <View style={{ gap: 12 }}>
        {MODES.map(([mode, title, desc, icon, tone]) => {
          const locked = mode === 'wordform' && familyWords < WORDFORM_MIN;
          return (
            <Card key={mode} style={{ gap: 6, opacity: locked ? 0.75 : 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <IconTile name={icon} tone={tone} size={48} />
                <View style={{ flex: 1 }}>
                  <T size={17} weight="extrabold">{title}</T>
                  <T size={14} tone="muted">{desc}</T>
                </View>
              </View>
              {locked ? <T size={13} tone="muted">Save words that have a word family first (look for “+N forms”).</T> : null}
              <Button title={mode === 'dictation' ? 'Open' : 'Start'} icon="right" variant="secondary" onPress={() => start(mode)} disabled={locked}
                accessibilityLabel={(mode === 'dictation' ? 'Open ' : 'Start ') + title} style={{ marginTop: 8 }} block />
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
