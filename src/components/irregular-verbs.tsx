import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { FlatList, Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import type { GrammarTable } from '../lib/api';
import { speak } from '../lib/speech';
import { useTheme } from '../state/store';
import { Button, Icon, IconButton, Input, T } from './ui';

type Row = GrammarTable['rows'][number];
/** One verb card, or a table's heading (title + memory tip) above its verbs. */
type Item =
  | { type: 'search' }
  | { type: 'head'; key: string; table: GrammarTable }
  | { type: 'row'; key: string; row: Row };

/** Lowercase without Vietnamese accents, so "viet" finds "viết". */
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim();

/** "A–B–B" from "V2 = V3 (A–B–B)"; the title when it has no bracket part. */
export function patternLabel(title: string): string {
  return /\(([^()]+)\)\s*$/.exec(title)?.[1]?.trim() || title;
}

/** V1, V2, V3 of a row ("learnt / learned" kept as written). */
const forms = (r: Row) => [r.cells[0] ?? r.label, r.cells[1] ?? '', r.cells[2] ?? ''];
/** What the speaker reads: "write, wrote, written" ("learnt or learned" for variants). */
const spoken = (r: Row) => forms(r).filter(Boolean).map((f) => f.replace(/\s*\/\s*/g, ' or ')).join(', ');
/** True when one of V1 / V2 / V3 (or one of its variants) is exactly the folded query. */
const exact = (r: Row, q: string) => forms(r).some((f) => f.split('/').some((v) => fold(v) === q));

/** A pattern filter chip (≥ 44pt tall). */
function PatternChip({ label, sub, on, onPress }: { label: string; sub: string; on: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={sub ? 'Show ' + label + ' verbs: ' + sub : 'Show all patterns'}
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, justifyContent: 'center',
        borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primary : pressed ? t.surface2 : t.surface })}>
      <T size={13.5} weight="bold" style={{ color: on ? '#fff' : t.muted }}>{label}</T>
    </Pressable>
  );
}

/** One verb: V1 · V2 · V3, the meaning, the example and a speaker button. */
const VerbCard = memo(function VerbCard({ row }: { row: Row }) {
  const t = useTheme();
  const [v1, v2, v3] = forms(row);
  const meaning = row.cells[3] ?? '';
  const example = row.cells[4] ?? '';
  const say = spoken(row);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, padding: 12, paddingRight: 4, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface }}>
      <View accessible accessibilityLabel={'V1 ' + v1 + ', V2 ' + v2 + ', V3 ' + v3 + (meaning ? '. Meaning: ' + meaning : '') + (example ? '. Example: ' + example : '')} style={{ flex: 1, gap: 3 }}>
        <T size={17} weight="extrabold">
          {v1}<T size={17} weight="extrabold" tone="faint"> · </T>{v2}<T size={17} weight="extrabold" tone="faint"> · </T>{v3}
        </T>
        {meaning ? <T size={14} tone="muted">{meaning}</T> : null}
        {example ? <T size={13} style={{ marginTop: 2 }}>{example}</T> : null}
      </View>
      <IconButton name="volume" label={'Play ' + say} color={t.primaryInk} onPress={() => speak(say)} />
    </View>
  );
});

/**
 * The irregular verbs lesson's tables as one list: a sticky search box with pattern chips, then each pattern's
 * heading (title and memory tip) and its verb cards. `header` / `footer` are the rest of the lesson.
 * `initialVerb` prefills the search (from a result's "See V1 – V2 – V3" link) and scrolls to the verbs.
 */
export function IrregularVerbsList({ tables, header, footer, initialVerb, contentContainerStyle }: {
  tables: GrammarTable[]; header: ReactElement; footer: ReactElement; initialVerb?: string; contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const [q, setQ] = useState(initialVerb ?? '');
  const [pattern, setPattern] = useState(-1);
  const listRef = useRef<FlatList<Item>>(null);
  const live = useMemo(() => tables.filter((tb) => tb.rows?.length), [tables]);

  // A new link to this screen (another verb): search for it and show the verbs.
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!initialVerb || scrolledFor.current === initialVerb) return;
    scrolledFor.current = initialVerb;
    setQ(initialVerb); setPattern(-1);
    const id = setTimeout(() => listRef.current?.scrollToIndex({ index: 0, animated: true }), 250);
    return () => clearTimeout(id);
  }, [initialVerb]);

  const needle = fold(q);
  const { items, count } = useMemo(() => {
    const out: Item[] = [{ type: 'search' }];
    let n = 0;
    live.forEach((tb, i) => {
      if (pattern >= 0 && pattern !== i) return;
      // Keyed by the row's place in its table, so a card keeps its key while the search changes.
      let rows = tb.rows.map((r, k) => ({ r, k }));
      if (needle) rows = rows.filter(({ r }) => r.cells.slice(0, 4).concat(r.label).some((c) => fold(c ?? '').includes(needle)));
      if (!rows.length) return;
      // Exact matches first ("write" before "rewrite").
      if (needle) rows = [...rows.filter(({ r }) => exact(r, needle)), ...rows.filter(({ r }) => !exact(r, needle))];
      n += rows.length;
      out.push({ type: 'head', key: 'h' + i, table: tb });
      rows.forEach(({ r, k }) => out.push({ type: 'row', key: i + '-' + k, row: r }));
    });
    return { items: out, count: n };
  }, [live, pattern, needle]);

  const clear = useCallback(() => setQ(''), []);

  const search = (
    <View style={{ gap: 8, paddingVertical: 8, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={{ flex: 1 }}>
          <Input value={q} onChangeText={setQ} placeholder="Search V1, V2, V3 or meaning…" leftIcon="search" autoCapitalize="none" autoCorrect={false}
            spellCheck={false} returnKeyType="search" maxLength={60} accessibilityLabel="Search irregular verbs" />
        </View>
        {q ? <IconButton name="x" label="Clear the search" onPress={clear} /> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
        <PatternChip label="All" sub="" on={pattern < 0} onPress={() => setPattern(-1)} />
        {live.map((tb, i) => (
          <PatternChip key={i} label={patternLabel(tb.title)} sub={tb.title} on={pattern === i} onPress={() => setPattern(pattern === i ? -1 : i)} />
        ))}
      </ScrollView>
      <View accessibilityLiveRegion="polite"><T size={13} weight="semibold" tone="muted">{count} {count === 1 ? 'verb' : 'verbs'}</T></View>
    </View>
  );

  const renderItem = ({ item }: { item: Item }) => {
    if (item.type === 'search') return search;
    if (item.type === 'head') {
      return (
        <View style={{ gap: 4, paddingTop: 10, paddingBottom: 8 }}>
          <View accessibilityRole="header"><T size={16} weight="extrabold">{item.table.title}</T></View>
          {item.table.note ? (
            <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderRadius: 12, backgroundColor: t.infoSoft }}>
              <Icon name="zap" size={16} color={t.info} />
              <T size={13.5} style={{ flex: 1 }}>{item.table.note}</T>
            </View>
          ) : null}
        </View>
      );
    }
    return <VerbCard row={item.row} />;
  };

  return (
    <FlatList
      ref={listRef}
      data={items}
      keyExtractor={(it) => (it.type === 'search' ? 'search' : it.key)}
      renderItem={renderItem}
      stickyHeaderIndices={[1]}
      ListHeaderComponent={header}
      ListFooterComponent={
        <View style={{ gap: 12 }}>
          {count === 0 ? (
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
              <T weight="bold" center>No verb matches “{q.trim()}”</T>
              {q ? <Button title="Clear the search" variant="secondary" onPress={clear} /> : null}
            </View>
          ) : null}
          {footer}
        </View>
      }
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      initialNumToRender={14}
      windowSize={9}
      onScrollToIndexFailed={() => listRef.current?.scrollToOffset({ offset: 0 })}
    />
  );
}
