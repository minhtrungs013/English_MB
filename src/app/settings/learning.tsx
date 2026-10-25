import { View } from 'react-native';
import { Card, Chip } from '../../components/ui';
import { Row, SettingsScreen, SwitchRow } from '../../components/settings/parts';
import { useStore } from '../../state/store';

export default function LearningSettings() {
  const { data, actions } = useStore();
  const st = data.settings;
  return (
    <SettingsScreen title="Learning">
      <Card>
        <Row title="Words per session" sub="The most words one review, flashcard or practice session will show">
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{['10', '20', '30', '50'].map((g) => <Chip key={g} label={g + ' words'} on={st.goal === g} onPress={() => actions.setSettings({ goal: g })} />)}</View>
        </Row>
        <Row title="Review direction" sub="What appears on the front of a flashcard">
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            <Chip label="English → Vietnamese" on={st.dir === 'en-vi'} onPress={() => actions.setSettings({ dir: 'en-vi' })} />
            <Chip label="Vietnamese → English" on={st.dir === 'vi-en'} onPress={() => actions.setSettings({ dir: 'vi-en' })} />
          </View>
        </Row>
        <SwitchRow title="Auto-play pronunciation" sub="Speak each word when a flashcard appears" value={st.autoplay} onChange={(v) => actions.setSettings({ autoplay: v })} />
        <SwitchRow title="Show example sentence" sub="Include the example on the back of each card" value={st.showEx} onChange={(v) => actions.setSettings({ showEx: v })} />
      </Card>
    </SettingsScreen>
  );
}
