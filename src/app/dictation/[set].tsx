import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GROUP_TITLE } from '../../components/dictation';
import { masteryLabel, MasteryBar } from '../../components/grammar';
import { BackBar, Badge, Button, Card, EmptyState, Icon, SectionTitle, T } from '../../components/ui';
import { api, type DictationSetDetail } from '../../lib/api';
import { errMsg, useTheme } from '../../state/store';

/** A dictation set: summary, listening tips, my mastery and a Practise button. */
export default function DictationSetScreen() {
  const { set } = useLocalSearchParams<{ set: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [d, setD] = useState<DictationSetDetail | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { setD(await api.dictationSet(set)); setErr(''); } catch (e) { setErr(errMsg(e)); }
  }, [set]);
  // Reload on focus: mastery changes after a practice.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const practise = () => router.push({ pathname: '/dictation/practice', params: { mode: set } });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title={d?.name ?? 'Dictation'} />
      {!d && !err ? <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />
        : !d ? (
          <EmptyState icon="alert" tone="red" title="Couldn’t load this set" text={err}>
            <Button title="Try again" icon="refresh" onPress={() => void load()} />
          </EmptyState>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: insets.bottom + 24 }}>
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Badge label={GROUP_TITLE[d.group] ?? d.group} bg={t.primarySoft} fg={t.primaryInk} />
                <Badge label={d.itemCount + (d.itemCount === 1 ? ' item' : ' items')} bg={t.surface2} fg={t.muted} />
              </View>
              <T size={22} weight="extrabold" style={{ letterSpacing: -0.3, marginTop: 6 }}>{d.name}</T>
              <T tone="muted">{d.vi}</T>
            </View>

            {d.summary ? <Card><T>{d.summary}</T></Card> : null}

            <Card style={{ gap: 8 }}>
              <View accessible accessibilityLabel={'Mastery: ' + masteryLabel(d.mastery) + ', ' + d.mastery + '%. ' + (d.attempts ? d.attempts + ' answers' : 'Not practised yet')} style={{ gap: 8 }}>
                <SectionTitle>Your mastery</SectionTitle>
                <MasteryBar mastery={d.mastery} />
                <T size={12.5} tone="muted">{d.attempts ? d.attempts + (d.attempts === 1 ? ' answer' : ' answers') : 'Not practised yet'}</T>
              </View>
            </Card>

            {d.tips.length ? (
              <Card style={{ gap: 10 }}>
                <SectionTitle>Listening tips · Mẹo nghe</SectionTitle>
                {d.tips.map((tip, k) => (
                  <View key={k} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                    <View style={{ paddingTop: 2 }}><Icon name="sparkle" size={16} color={t.primaryInk} /></View>
                    <T size={14} style={{ flex: 1 }}>{tip}</T>
                  </View>
                ))}
              </Card>
            ) : null}

            <Button title="Practise" icon="right" size="lg" block onPress={practise} disabled={!d.itemCount}
              accessibilityLabel={'Practise dictation: ' + d.name} />
          </ScrollView>
        )}
    </View>
  );
}
