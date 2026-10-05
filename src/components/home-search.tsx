import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { api, type LibraryWord } from '../lib/api';
import { useStore, useTheme } from '../state/store';
import { SaveFromLibrary } from './library';
import { Card, Input, LevelBadge, T, TopicBadge } from './ui';

/**
 * Home search: my matching words first, then library words I don't have yet (with Save),
 * so a word can be found even before it's in my collection. Same idea as the web header search.
 */
export function HomeSearch() {
  const { data } = useStore();
  const t = useTheme();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ term: string; items: LibraryWord[]; total: number } | null>(null);
  const term = q.trim().toLowerCase();

  useEffect(() => {
    if (!term) return;
    let alive = true;
    const id = setTimeout(() => {
      api.library({ q: term, limit: 12 })
        .then((r) => { if (alive) setRes({ term, items: r.items, total: r.total }); })
        .catch(() => { if (alive) setRes({ term, items: [], total: 0 }); });
    }, 300);
    return () => { alive = false; clearTimeout(id); };
  }, [term]);

  const matches = term
    ? data.words.filter((w) => [w.word, w.meaning, w.vi, w.tags.join(' ')].join(' ').toLowerCase().includes(term))
      .sort((a, b) => Number(!a.word.toLowerCase().startsWith(term)) - Number(!b.word.toLowerCase().startsWith(term)) || a.word.localeCompare(b.word))
    : [];
  const lib = res && res.term === term ? res : null;
  const mine = new Set(data.words.map((w) => w.word.toLowerCase()));
  const fromLib = (lib?.items ?? []).filter((w) => !mine.has(w.word.toLowerCase())).slice(0, 5);

  const heading = (label: string, right?: React.ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
      <T size={12} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</T>
      {right}
    </View>
  );
  const more = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ paddingHorizontal: 16, minHeight: 44, justifyContent: 'center', backgroundColor: pressed ? t.primarySoft : 'transparent' })}>
      <T size={13.5} weight="bold" tone="primaryInk">{label} ›</T>
    </Pressable>
  );

  return (
    <View style={{ gap: 10 }}>
      <Input value={q} onChangeText={setQ} placeholder="Search my words and the library…" leftIcon="search" autoCapitalize="none" autoCorrect={false}
        returnKeyType="search" accessibilityLabel="Search my words and the library"
        onSubmitEditing={() => { if (term) router.push(matches.length ? { pathname: '/words', params: { q: q.trim() } } : { pathname: '/library', params: { q: q.trim() } }); }} />
      {term ? (
        <Card pad={false} style={{ paddingBottom: 6 }}>
          {heading('My words', matches.length ? <T size={12.5} weight="bold" tone="muted">{matches.length}</T> : undefined)}
          {matches.length ? matches.slice(0, 5).map((w) => (
            <Pressable key={w.id} onPress={() => router.push({ pathname: '/word/[id]', params: { id: w.id } })} accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 52, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
              <View style={{ flex: 1 }}>
                <T weight="extrabold">{w.word}</T>
                <T size={13} tone="muted" numberOfLines={1}>{w.vi || w.meaning}</T>
              </View>
              <LevelBadge level={w.level} />
            </Pressable>
          )) : <T size={13.5} tone="muted" style={{ paddingHorizontal: 16, paddingVertical: 6 }}>None of your words match “{q.trim()}”.</T>}
          {matches.length > 5 ? more('See all ' + matches.length + ' in My Vocabulary', () => router.push({ pathname: '/words', params: { q: q.trim() } })) : null}

          {heading('From the library', !lib ? <ActivityIndicator size="small" color={t.primary} /> : undefined)}
          {fromLib.map((w) => (
            <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12 }}>
              <Pressable onPress={() => router.push({ pathname: '/library-word/[id]', params: { id: w.id } })} accessibilityRole="button" accessibilityLabel={w.word + ', ' + w.vi}
                style={({ pressed }) => ({ flex: 1, paddingLeft: 16, minHeight: 52, justifyContent: 'center', backgroundColor: pressed ? t.surface2 : 'transparent' })}>
                <T weight="extrabold">{w.word}</T>
                <T size={13} tone="muted" numberOfLines={1}>{w.vi || w.meaning}</T>
              </Pressable>
              <TopicBadge topic={w.topic} />
              <SaveFromLibrary w={w} />
            </View>
          ))}
          {lib && !fromLib.length ? <T size={13.5} tone="muted" style={{ paddingHorizontal: 16, paddingVertical: 6 }}>{lib.total ? 'You already have every library match.' : 'No library words match.'}</T> : null}
          {lib && lib.total > 0 ? more('Search the library for “' + q.trim() + '” (' + lib.total + ')', () => router.push({ pathname: '/library', params: { q: q.trim() } })) : null}
        </Card>
      ) : null}
    </View>
  );
}
