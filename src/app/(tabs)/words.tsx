import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, ChipRow, EmptyState, IconButton, Input, LevelBadge, StatusBadge, T } from '../../components/ui';
import { LEVELS, fmtNext, isDue } from '../../lib/data';
import { useStore, useTheme } from '../../state/store';

const STATUS: [string, string][] = [['all', 'All'], ['new', 'New'], ['learning', 'Learning'], ['mastered', 'Mastered']];

export default function Words() {
  const { data } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [level, setLevel] = useState('all');
  const [status, setStatus] = useState('all');
  const [tag, setTag] = useState('all');
  const [cat, setCat] = useState('all');

  // Opened from Home search, Categories or Tags: start with that filter.
  const params = useLocalSearchParams<{ q?: string; cat?: string; tag?: string }>();
  useEffect(() => {
    if (params.q === undefined && params.cat === undefined && params.tag === undefined) return;
    setQ(params.q ?? ''); setCat(params.cat ?? 'all'); setTag(params.tag ?? 'all'); setLevel('all'); setStatus('all');
  }, [params.q, params.cat, params.tag]);

  const qq = q.trim().toLowerCase();
  const rows = data.words.filter((w) => {
    if (level !== 'all' && w.level !== level) return false;
    if (status !== 'all' && w.status !== status) return false;
    if (tag !== 'all' && !w.tags.includes(tag)) return false;
    if (cat !== 'all' && w.cat !== cat) return false;
    if (qq && ![w.word, w.meaning, w.vi, w.ex, w.tags.join(' ')].join(' ').toLowerCase().includes(qq)) return false;
    return true;
  }).sort((a, b) => b.addedAt - a.addedAt);
  const filtered = !!qq || level !== 'all' || status !== 'all' || tag !== 'all' || cat !== 'all';

  const header = (
    <View style={{ gap: 12, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <T size={26} weight="extrabold" style={{ letterSpacing: -0.5 }}>My Vocabulary</T>
          <T tone="muted" style={{ marginTop: 4 }}>{data.words.length} words you are learning</T>
        </View>
        <IconButton name="plus" label="Add vocabulary" color={t.primaryInk} onPress={() => router.push('/word-form')} />
      </View>
      {data.words.length > 0 && (
        <>
          <Input value={q} onChangeText={setQ} placeholder="Search my words…" leftIcon="search" autoCapitalize="none" accessibilityLabel="Search my words" />
          <ChipRow>{STATUS.map(([v, l]) => <Chip key={v} label={l} on={status === v} onPress={() => setStatus(v)} />)}</ChipRow>
          <ChipRow>{['all', ...LEVELS].map((l) => <Chip key={l} soft label={l === 'all' ? 'All levels' : l} on={level === l} onPress={() => setLevel(l)} />)}</ChipRow>
          {data.cats.length > 0 && (
            <ChipRow>{[{ id: 'all', name: 'All categories' }, ...data.cats].map((c) => <Chip key={c.id} soft label={c.name} on={cat === c.id} onPress={() => setCat(c.id)} />)}</ChipRow>
          )}
          {data.tags.length > 0 && (
            <ChipRow>{['all', ...data.tags].map((g) => <Chip key={g} soft label={g === 'all' ? 'All tags' : '#' + g} on={tag === g} onPress={() => setTag(g)} />)}</ChipRow>
          )}
          <T size={13.5} weight="semibold" tone="muted">Showing {rows.length} of {data.words.length} words</T>
        </>
      )}
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 24 }}
      data={rows}
      keyExtractor={(w) => w.id}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListEmptyComponent={data.words.length === 0 ? (
        <EmptyState icon="book" title="No vocabulary yet." text="Save words from the shared library, or add your own.">
          <View style={{ gap: 10, alignSelf: 'stretch' }}>
            <Button title="Browse the Library" icon="globe" onPress={() => router.push('/library')} block />
            <Button title="Add Your Own Word" icon="plus" variant="secondary" onPress={() => router.push('/word-form')} block />
          </View>
        </EmptyState>
      ) : (
        <EmptyState icon="search" tone="blue" title="No words match" text="Try a different keyword or clear the filters.">
          {filtered ? <Button title="Clear filters" variant="secondary" onPress={() => { setQ(''); setLevel('all'); setStatus('all'); setTag('all'); setCat('all'); }} /> : null}
        </EmptyState>
      )}
      renderItem={({ item: w }) => (
        <Pressable onPress={() => router.push({ pathname: '/word/[id]', params: { id: w.id } })} accessibilityRole="button"
          style={({ pressed }) => ({ backgroundColor: pressed ? t.surface2 : t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 })}>
          <View>
            <T size={18} weight="extrabold">{w.word}</T>
            <T ipa size={12.5} tone="muted">{w.ipa}</T>
          </View>
          <View>
            <T weight="semibold">{w.vi}</T>
            <T size={13.5} tone="muted" numberOfLines={2}>{w.meaning}</T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <LevelBadge level={w.level} />
            <StatusBadge status={w.status} />
            <T size={13} weight="semibold" style={{ marginLeft: 'auto', color: isDue(w) ? t.primaryInk : t.muted }}>{fmtNext(w.dueAt)}</T>
          </View>
        </Pressable>
      )}
    />
  );
}
