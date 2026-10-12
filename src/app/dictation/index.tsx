import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canPractiseMine, DictationSetCard, GROUP_TITLE, GROUPS, MINE } from '../../components/dictation';
import { BackBar, Button, Card, EmptyState, Icon, IconTile, T } from '../../components/ui';
import { api, type DictationGroup, type DictationList, type DictationSetSummary } from '../../lib/api';
import type { IconName } from '../../lib/icons';
import { errMsg, useStore, useTheme } from '../../state/store';

type Filter = 'all' | DictationGroup;
const FILTERS: Filter[] = ['all', ...GROUPS];
const filterTitle = (f: Filter) => (f === 'all' ? 'All' : GROUP_TITLE[f]);

/** Filter chip (≥44pt, selected state). */
function FilterChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={'Show ' + label + ' sets'} accessibilityState={{ selected: on }}
      style={({ pressed }) => ({
        minHeight: 44, paddingHorizontal: 16, borderRadius: 99, borderWidth: 1, justifyContent: 'center',
        borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primary : pressed ? t.surface2 : t.surface
      })}>
      <T size={14} weight="bold" style={{ color: on ? '#fff' : t.muted }}>{label}</T>
    </Pressable>
  );
}

/** One of the two compact cards at the top (icon, title, one line, button). */
function TopCard({ icon, tone, title, line, button, label, onPress, disabled, highlight }: {
  icon: IconName; tone: 'indigo' | 'green' | 'amber'; title: string; line: string; button: string; label: string;
  onPress: () => void; disabled?: boolean; highlight?: boolean;
}) {
  const t = useTheme();
  return (
    <Card style={[{ flex: 1, padding: 14, gap: 8 }, highlight && { backgroundColor: t.primarySoft, borderColor: t.primary, borderWidth: 1.5 }]}>
      <IconTile name={icon} tone={tone} size={36} />
      <T size={15} weight="extrabold" numberOfLines={1}>{title}</T>
      <T size={12.5} tone="muted" numberOfLines={2} style={{ flex: 1 }}>{line}</T>
      <Button title={button} size="md" variant={highlight ? 'primary' : 'secondary'} onPress={onPress} disabled={disabled} accessibilityLabel={label} block />
    </Card>
  );
}

/** Dictation hub: today's dictation, from my words, and the sets (filtered by group). */
export default function DictationHub() {
  const { data } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<DictationList | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    try { setList(await api.dictation()); setErr(''); } catch (e) { setErr(errMsg(e)); }
  }, []);
  // Reload on focus: mastery and "done today" change after a practice.
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const mineOk = canPractiseMine(data.words);
  const go = (mode: string) => router.push({ pathname: '/dictation/practice', params: { mode } });
  const done = !!list?.practisedToday;
  const sets: DictationSetSummary[] = list ? list.sets.filter((s) => filter === 'all' || s.group === filter) : [];

  const header = (
    <View style={{ gap: 14, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
        <TopCard icon="volume" tone="indigo" highlight={!done} title="Today’s dictation"
          line={done ? 'Done today ✓' : '10 sentences: recent mistakes first.'}
          button={done ? 'Practise again' : 'Start'}
          label={done ? 'Today’s dictation is done. Practise again' : 'Start today’s dictation'}
          onPress={() => go('daily')} disabled={!list} />
        <TopCard icon="pen" tone="green" title="From my words"
          line={mineOk ? 'Sentences from your word list.' : 'Add words with example sentences first.'}
          button="Start"
          label={mineOk ? 'Start dictation from my words' : 'Dictation from my words: add words with example sentences first'}
          onPress={() => go(MINE)} disabled={!mineOk} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {FILTERS.map((f) => <FilterChip key={f} label={filterTitle(f)} on={filter === f} onPress={() => setFilter(f)} />)}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title="Dictation" />
      <FlatList
        data={sets}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => <DictationSetCard x={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          !list ? (
            err ? (
              <EmptyState icon="alert" tone="red" title="Couldn’t load the dictation sets" text={err}>
                <Button title="Try again" icon="refresh" onPress={() => void load()} accessibilityLabel="Try loading the dictation sets again" />
              </EmptyState>
            ) : <ActivityIndicator color={t.primary} style={{ marginTop: 24 }} />
          ) : (
            <View style={{ alignItems: 'center', gap: 6, paddingVertical: 24 }}>
              <Icon name="headphones" size={22} color={t.faint} />
              <T tone="muted">No sets in this group yet.</T>
            </View>
          )
        }
        contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.primary} colors={[t.primary]} />}
      />
    </View>
  );
}
