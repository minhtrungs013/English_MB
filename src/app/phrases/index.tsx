import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PatternChips } from '../../components/phrases';
import { BackBar, Badge, Button, Chip, ChipRow, EmptyState, Icon, Input, LevelBadge, T } from '../../components/ui';
import { api, type PhraseBrief, type PhraseKind } from '../../lib/api';
import { FUNCTION_LABEL, REGISTER_LABEL } from '../../lib/phrases';
import { errMsg, useTheme } from '../../state/store';

const KINDS: { id: PhraseKind | ''; label: string }[] = [{ id: '', label: 'All' }, { id: 'slot', label: 'With a slot' }, { id: 'fixed', label: 'Conversation' }];

/** Phrases: browse phrases ("run out of …", "How's it going?"), open one, practise them with my words. */
export default function Phrases() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<PhraseKind | ''>('');
  const [items, setItems] = useState<PhraseBrief[] | null>(null);
  const [err, setErr] = useState('');
  // Fresh each time the screen shows (saving or practising changes the marks).
  useFocusEffect(useCallback(() => {
    let live = true;
    const timer = setTimeout(() => {
      api.phrases({ q: q.trim() || undefined, kind: kind || undefined })
        .then((r) => { if (live) { setItems(r.items); setErr(''); } })
        .catch((e) => { if (live) setErr(errMsg(e)); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [q, kind]));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title="Phrases" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <T tone="muted">Learn phrases like “run out of …” and “How’s it going?”, then use them with your own words.</T>
        <Button title="Practise phrases" icon="zap" onPress={() => router.push('/phrase-practice')} block />
        <Input value={q} onChangeText={setQ} placeholder="Search a phrase or a Vietnamese meaning" leftIcon="search" clearable accessibilityLabel="Search phrases" />
        <ChipRow>{KINDS.map((k) => <Chip key={k.id} label={k.label} on={kind === k.id} onPress={() => setKind(k.id)} />)}</ChipRow>
        {err ? <EmptyState icon="alert" tone="red" title="Can’t load the phrases" text={err} /> : !items ? <T tone="muted">Loading…</T> : !items.length ? (
          <EmptyState icon="search" title="No phrases found" text="Try another search." />
        ) : items.map((p) => (
          <Pressable key={p.key} onPress={() => router.push({ pathname: '/phrases/[key]', params: { key: p.key } })} accessibilityRole="button" accessibilityLabel={p.phrase + ', ' + p.vi}
            style={({ pressed }) => ({ padding: 14, borderRadius: 14, borderWidth: 1, borderColor: t.border, backgroundColor: pressed ? t.surface2 : t.surface, gap: 6 })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T size={17} weight="extrabold" style={{ flex: 1 }}>{p.phrase}</T>
              {p.saved ? <Icon name="checkc" size={18} color={t.success} /> : null}
              {(p.errors ?? 0) > 0 ? <Badge label={p.errors + ' to fix'} bg={t.warningSoft} fg={t.warning} /> : null}
              <LevelBadge level={p.level} />
            </View>
            {p.kind === 'slot' && p.pattern ? <PatternChips pattern={p.pattern} /> : <T size={13} tone="muted">{(FUNCTION_LABEL[p.function] ?? 'Conversation') + ' · ' + (REGISTER_LABEL[p.register] ?? p.register)}</T>}
            <T size={14}>{p.vi}</T>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
