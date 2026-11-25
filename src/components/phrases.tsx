import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { api, type PhraseBrief } from '../lib/api';
import { patternParts } from '../lib/phrases';
import { useTheme } from '../state/store';
import { Card, SectionTitle, T } from './ui';

/** "S + run out of + X" as chips, the open places marked. */
export function PatternChips({ pattern }: { pattern: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }} accessibilityLabel={'Pattern: ' + pattern}>
      {patternParts(pattern).map((p, i) => (
        <View key={i} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: p.slot ? t.primarySoft : t.surface2 }}>
          <T size={12.5} weight="bold" style={{ color: p.slot ? t.primaryInk : t.text }}>{p.text === 'X' ? '…' : p.text}</T>
        </View>
      ))}
    </View>
  );
}

/** Word details: the phrases this word goes into ("toothpaste" → run out of toothpaste). Nothing when there are none. */
export function PhrasesWithWord({ word }: { word: string }) {
  const t = useTheme();
  const [items, setItems] = useState<PhraseBrief[]>([]);
  useEffect(() => {
    let live = true;
    api.phrasesForWord(word).then((r) => { if (live) setItems(r.items); }).catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [word]);
  if (!items.length) return null;
  return (
    <Card style={{ gap: 8 }}>
      <SectionTitle>Phrases with this word</SectionTitle>
      {items.map((p) => (
        <Pressable key={p.key} onPress={() => router.push({ pathname: '/phrases/[key]', params: { key: p.key } })} accessibilityRole="button"
          style={({ pressed }) => ({ padding: 10, borderRadius: 10, borderWidth: 1, borderColor: t.border, backgroundColor: pressed ? t.surface2 : t.surface, gap: 2 })}>
          <T weight="extrabold">{p.phrase}</T>
          <T size={13} tone="muted">{p.example || p.vi}</T>
        </Pressable>
      ))}
    </Card>
  );
}
