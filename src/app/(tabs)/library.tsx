import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SaveFromLibrary } from '../../components/library';
import { Chip, ChipRow, EmptyState, Input, LevelBadge, T, TOPIC_LABEL, TopicBadge } from '../../components/ui';
import { api, type LibraryPage, type Topic } from '../../lib/api';
import { LEVELS } from '../../lib/data';
import { errMsg, useStore, useTheme } from '../../state/store';

const PAGE = 30;
const TOPICS: Topic[] = ['it', 'interview', 'customer', 'leader', 'other'];

export default function Library() {
  const { data, actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<Topic | ''>('');
  const [level, setLevel] = useState('');
  const [page, setPage] = useState<LibraryPage | null>(null);
  // The filters the current results were loaded for; while they differ from the filters on screen, show a spinner.
  const key = query + '|' + topic + '|' + level;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== key;
  const [more, setMore] = useState(false);
  const reqId = useRef(0);

  useEffect(() => { const id = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(id); }, [q]);

  const fetchPage = async (n: number, k: string) => {
    const id = ++reqId.current;
    try {
      const res = await api.library({ q: query || undefined, topic: topic || undefined, level: level || undefined, page: n, limit: PAGE });
      if (id !== reqId.current) return;
      setPage((prev) => (n > 1 && prev ? { ...res, items: [...prev.items, ...res.items] } : res));
    } catch (e) {
      if (id === reqId.current) actions.showToast(errMsg(e), 'bad');
    } finally {
      if (id === reqId.current) { setLoadedKey(k); setMore(false); }
    }
  };
  // Reload the first page whenever the search or filters change.
  useEffect(() => {
    const id = ++reqId.current;
    api.library({ q: query || undefined, topic: topic || undefined, level: level || undefined, page: 1, limit: PAGE })
      .then((res) => { if (id === reqId.current) setPage(res); })
      .catch((e) => { if (id === reqId.current) actions.showToast(errMsg(e), 'bad'); })
      .finally(() => { if (id === reqId.current) setLoadedKey(key); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const items = page?.items ?? [];
  const loadMore = () => { if (page && !more && items.length < page.total) { setMore(true); void fetchPage(page.page + 1, key); } };

  const header = (
    <View style={{ gap: 12, marginBottom: 12 }}>
      <View>
        <T size={26} weight="extrabold" style={{ letterSpacing: -0.5 }}>Vocabulary Library</T>
        <T tone="muted" style={{ marginTop: 4 }}>Words for IT work, interviews and meetings — shared by everyone.</T>
      </View>
      <Input value={q} onChangeText={setQ} placeholder="Search word, meaning or Vietnamese…" leftIcon="search" autoCapitalize="none" returnKeyType="search" accessibilityLabel="Search the library" />
      <ChipRow>
        <Chip label={'All' + (page ? ' · ' + page.all : '')} on={topic === ''} onPress={() => setTopic('')} />
        {TOPICS.filter((x) => x !== 'other' || (page?.topics.other ?? 0) > 0).map((x) => (
          <Chip key={x} label={TOPIC_LABEL[x] + (page ? ' · ' + page.topics[x] : '')} on={topic === x} onPress={() => setTopic(x)} />
        ))}
      </ChipRow>
      <ChipRow>
        {['', ...LEVELS].map((l) => <Chip key={l || 'all'} soft label={l || 'All levels'} on={level === l} onPress={() => setLevel(l)} />)}
      </ChipRow>
      {!loading && page ? <T size={13.5} weight="semibold" tone="muted">Showing {items.length} of {page.total} words</T> : null}
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 24 }}
      data={loading ? [] : items}
      keyExtractor={(w) => w.id}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListEmptyComponent={loading
        ? <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />
        : <EmptyState icon="search" tone="blue" title="No words found" text="Try a different keyword or topic." />}
      ListFooterComponent={more ? <ActivityIndicator color={t.primary} style={{ marginVertical: 16 }} /> : null}
      renderItem={({ item: w }) => (
        // The card content opens the word; the Save button sits beside it (not nested inside another button).
        <View style={{ backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }}>
          <Pressable onPress={() => router.push({ pathname: '/library-word/[id]', params: { id: w.id } })} accessibilityRole="button" accessibilityLabel={w.word + ', ' + w.vi}
            style={({ pressed }) => ({ padding: 16, paddingRight: 112, gap: 8, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
            <View>
              <T size={18} weight="extrabold">{w.word}</T>
              <T size={12.5} tone="muted">{w.ipa}</T>
            </View>
            <View>
              <T weight="semibold">{w.vi}</T>
              <T size={13.5} tone="muted" numberOfLines={2}>{w.meaning}</T>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <TopicBadge topic={w.topic} />
              <LevelBadge level={w.level} />
            </View>
            <T size={12.5} tone="muted">by {w.authorId ? (w.authorId === data.userId ? 'You' : w.authorName) : 'Wordbook'}</T>
          </Pressable>
          <View style={{ position: 'absolute', top: 12, right: 12 }}><SaveFromLibrary w={w} /></View>
        </View>
      )}
    />
  );
}
