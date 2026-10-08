import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isTense, masteryLabel, MasteryBar } from '../../components/grammar';
import { BackBar, Badge, Button, EmptyState, Icon, SectionTitle, T } from '../../components/ui';
import { api, type GrammarGroup, type GrammarTenseSummary } from '../../lib/api';
import { errMsg, useTheme } from '../../state/store';

type Sort = 'lesson' | 'weakest';
type Mix = 'mix' | 'mix-tenses' | 'mix-foundations';

const SECTIONS: [GrammarGroup, string][] = [['foundations', 'Foundations: Helping verbs'], ['tenses', 'Tenses']];
/** Mixed practice modes: [mode, choice label, what it does]. */
const MIXES: [Mix, string, string][] = [
  ['mix', 'All', '10 questions that focus on your weakest lessons.'],
  ['mix-tenses', 'Tenses', '10 questions that focus on your weakest tenses.'],
  ['mix-foundations', 'Foundations', '10 questions on be, do, have and agreement, weakest first.']
];

/** The lesson's group (if the server didn't send one: everything but the 7 tenses is a Foundations lesson). */
const groupOf = (x: GrammarTenseSummary): GrammarGroup => x.group ?? (isTense(x.id) ? 'tenses' : 'foundations');

/** One lesson in the list. The whole card is a single button. Reference lessons (no drills) show "Reference" instead of mastery. */
function TenseCard({ x, n }: { x: GrammarTenseSummary; n: number }) {
  const t = useTheme();
  const reference = !x.drills;
  const tried = x.attempts ? x.attempts + (x.attempts === 1 ? ' answer' : ' answers') : 'Not practised yet';
  const state = reference ? 'Reference, no practice' : masteryLabel(x.mastery) + ', ' + x.mastery + '% mastery. ' + tried;
  return (
    <Pressable onPress={() => router.push({ pathname: '/grammar/[tense]', params: { tense: x.id } })} accessibilityRole="button"
      accessibilityLabel={'Lesson ' + n + ': ' + x.name + ', ' + x.vi + '. ' + state}
      style={({ pressed }) => ({ backgroundColor: pressed ? t.surface2 : t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: reference ? t.surface2 : t.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          {reference ? <Icon name="book" size={18} color={t.muted} /> : <T size={16} weight="extrabold" tone="primaryInk">{n}</T>}
        </View>
        <View style={{ flex: 1 }}>
          <T size={16.5} weight="extrabold" numberOfLines={2}>{x.name}</T>
          <T size={13} tone="muted" numberOfLines={1}>{x.vi}</T>
        </View>
        <Icon name="right" size={16} color={t.faint} />
      </View>
      {reference ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Badge label="Reference" bg={t.infoSoft} fg={t.info} />
          <T size={12.5} tone="muted" style={{ flex: 1 }}>Tables to look things up. No practice.</T>
        </View>
      ) : (
        <>
          <MasteryBar mastery={x.mastery} />
          <T size={12.5} tone="muted">{tried}</T>
        </>
      )}
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

/** Segmented All / Tenses / Foundations choice on the primary-colored practice card. */
function MixChoice({ value, onChange }: { value: Mix; onChange: (m: Mix) => void }) {
  const t = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Practise from" style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.18)' }}>
      {MIXES.map(([m, label]) => {
        const on = m === value;
        return (
          <Pressable key={m} onPress={() => onChange(m)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={'Practise from: ' + label}
            style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
              backgroundColor: on ? '#fff' : pressed ? 'rgba(255,255,255,0.14)' : 'transparent' })}>
            <T size={13.5} weight="bold" numberOfLines={1} style={{ color: on ? (t.dark ? t.primary : t.primaryInk) : 'rgba(255,255,255,0.92)' }}>{label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function GrammarScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [tenses, setTenses] = useState<GrammarTenseSummary[] | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<Sort>('lesson');
  const [mix, setMix] = useState<Mix>('mix');

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
  // Weakest first: lowest mastery first, reference lessons (nothing to practise) last; ties keep lesson order.
  const weak = (x: GrammarTenseSummary) => (x.drills ? x.mastery : 1000);
  const sorted = (tenses ?? []).slice().sort((a, b) => (sort === 'weakest' ? weak(a) - weak(b) : 0) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  // The sort applies within each section; lessons are numbered within their section.
  const sections = SECTIONS.map(([g, title]) => {
    const num = new Map((tenses ?? []).filter((x) => groupOf(x) === g).map((x, k) => [x.id, k + 1]));
    return { g, title, num, items: sorted.filter((x) => groupOf(x) === g) };
  }).filter((s) => s.items.length);
  const [, mixLabel, mixText] = MIXES.find(([m]) => m === mix) ?? MIXES[0];

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
            <T tone="muted">Start with the helping verbs (be, do, have), then the 7 most useful English tenses: short lessons with examples, then practice to build your mastery.</T>

            <View style={{ backgroundColor: t.primary, borderRadius: 18, padding: 20, gap: 12 }}>
              <T size={13} weight="bold" style={{ color: 'rgba(255,255,255,0.85)', letterSpacing: 0.8, textTransform: 'uppercase' }}>Mixed practice</T>
              <MixChoice value={mix} onChange={setMix} />
              <T size={18} weight="extrabold" tone="white" style={{ letterSpacing: -0.3 }}>{mixText}</T>
              <Button title="Start" variant="white" size="lg" icon="right" block
                accessibilityLabel={'Start mixed practice: ' + mixLabel}
                onPress={() => router.push({ pathname: '/grammar/practice', params: { mode: mix } })} />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              <SortChip label="Lesson order" on={sort === 'lesson'} onPress={() => setSort('lesson')} />
              <SortChip label="Weakest first" on={sort === 'weakest'} onPress={() => setSort('weakest')} />
            </View>
            {err ? <T size={13} weight="semibold" tone="danger">{err}</T> : null}
            {sections.map((s) => (
              <View key={s.g} style={{ gap: 12 }}>
                <SectionTitle style={{ marginTop: 6 }}>{s.title}</SectionTitle>
                {s.items.map((x) => <TenseCard key={x.id} x={x} n={s.num.get(x.id) ?? 0} />)}
              </View>
            ))}
          </ScrollView>
        )}
    </View>
  );
}
