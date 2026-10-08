import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { masteryLabel, MasteryBar } from '../../components/grammar';
import { BackBar, Button, EmptyState, Icon, SectionTitle, T } from '../../components/ui';
import { api, type GrammarTenseSummary } from '../../lib/api';
import { errMsg, useTheme } from '../../state/store';

type Sort = 'lesson' | 'weakest';

/** One tense in the list. The whole card is a single button. */
function TenseCard({ x, n }: { x: GrammarTenseSummary; n: number }) {
  const t = useTheme();
  const tried = x.attempts ? x.attempts + (x.attempts === 1 ? ' answer' : ' answers') : 'Not practised yet';
  return (
    <Pressable onPress={() => router.push({ pathname: '/grammar/[tense]', params: { tense: x.id } })} accessibilityRole="button"
      accessibilityLabel={'Lesson ' + n + ': ' + x.name + ', ' + x.vi + '. ' + masteryLabel(x.mastery) + ', ' + x.mastery + '% mastery. ' + tried}
      style={({ pressed }) => ({ backgroundColor: pressed ? t.surface2 : t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <T size={16} weight="extrabold" tone="primaryInk">{n}</T>
        </View>
        <View style={{ flex: 1 }}>
          <T size={16.5} weight="extrabold" numberOfLines={1}>{x.name}</T>
          <T size={13} tone="muted" numberOfLines={1}>{x.vi}</T>
        </View>
        <Icon name="right" size={16} color={t.faint} />
      </View>
      <MasteryBar mastery={x.mastery} />
      <T size={12.5} tone="muted">{tried}</T>
    </Pressable>
  );
}

function SortChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={'Sort: ' + label} accessibilityState={{ selected: on }}
      style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : t.surface, justifyContent: 'center' }}>
      <T size={13.5} weight="bold" style={{ color: on ? t.primaryInk : t.muted }}>{label}</T>
    </Pressable>
  );
}

export default function GrammarScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [tenses, setTenses] = useState<GrammarTenseSummary[] | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<Sort>('lesson');

  const load = useCallback(async () => {
    try {
      const res = await api.grammar();
      setTenses(res.tenses); setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
  }, []);
  // Reload on focus: mastery changes after a practice.
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const order = new Map((tenses ?? []).map((x, k) => [x.id, k]));
  const shown = (tenses ?? []).slice().sort((a, b) => (sort === 'weakest' ? a.mastery - b.mastery : 0) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title="Grammar" />
      {!tenses && !err ? <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />
        : !tenses ? (
          <EmptyState icon="alert" tone="red" title="Couldn’t load the lessons" text={err}>
            <Button title="Try again" icon="refresh" onPress={() => void load()} />
          </EmptyState>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: insets.bottom + 24 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.primary} colors={[t.primary]} />}>
            <T tone="muted">The 7 most useful English tenses: short lessons with examples, then practice to build your mastery.</T>

            <View style={{ backgroundColor: t.primary, borderRadius: 18, padding: 20, gap: 10 }}>
              <T size={13} weight="bold" style={{ color: 'rgba(255,255,255,0.85)', letterSpacing: 0.8, textTransform: 'uppercase' }}>Mixed practice</T>
              <T size={19} weight="extrabold" tone="white" style={{ letterSpacing: -0.3 }}>10 questions that focus on your weakest tenses.</T>
              <Button title="Mixed practice" variant="white" size="lg" icon="right" block
                accessibilityLabel="Mixed practice — focuses on your weakest tenses"
                onPress={() => router.push({ pathname: '/grammar/practice', params: { mode: 'mix' } })} />
            </View>

            <SectionTitle style={{ marginTop: 4 }}>Lessons</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <SortChip label="Lesson order" on={sort === 'lesson'} onPress={() => setSort('lesson')} />
              <SortChip label="Weakest first" on={sort === 'weakest'} onPress={() => setSort('weakest')} />
            </View>
            {err ? <T size={13} weight="semibold" tone="danger">{err}</T> : null}
            {shown.map((x) => <TenseCard key={x.id} x={x} n={(order.get(x.id) ?? 0) + 1} />)}
          </ScrollView>
        )}
    </View>
  );
}
