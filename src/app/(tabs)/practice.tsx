import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, Card, IconTile, Screen, T } from '../../components/ui';
import type { IconName } from '../../lib/icons';
import { useStore } from '../../state/store';

const MODES: [string, string, string, IconName, 'indigo' | 'green' | 'orange' | 'blue' | 'red'][] = [
  ['flash', 'Flashcards', 'Review your words with flip cards.', 'cards', 'indigo'],
  ['mc', 'Multiple Choice', 'Choose the right meaning for each word.', 'listcheck', 'green'],
  ['fill', 'Fill in the Blank', 'Complete sentences with the missing word.', 'type', 'orange'],
  ['trans', 'Translation', 'Translate Vietnamese into English.', 'globe', 'blue'],
  ['listen', 'Listening', 'Hear a word and type what you hear.', 'volume', 'red']
];

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
    </Screen>
  );
}
