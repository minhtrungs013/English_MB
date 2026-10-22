import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackBar, Button, Card, Chip, ChipRow, EmptyState, Icon, IconButton, IconTile, T } from '../components/ui';
import { api, type MistakeDrill, type MistakeNotebook } from '../lib/api';
import { speak } from '../lib/speech';
import { errMsg, useTheme } from '../state/store';

const LABEL: Record<string, string> = {
  tense: 'Tense', agreement: 'Subject–verb', article: 'Article', preposition: 'Preposition', 'word-form': 'Word form',
  'word-meaning': 'Meaning', collocation: 'Collocation', 'word-order': 'Word order', spelling: 'Spelling', punctuation: 'Punctuation', other: 'Other'
};
const fmtDay = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Average score per week (0–10): one bar per week; the label under each bar is the week's start. */
function WeekChart({ weeks }: { weeks: MistakeNotebook['weeks'] }) {
  const t = useTheme();
  const summary = weeks.filter((w) => w.avg !== null).map((w) => fmtDay(w.week) + ' ' + w.avg).join(', ');
  return (
    <View accessible accessibilityLabel={'Average score by week: ' + (summary || 'no sentences yet')} style={{ gap: 6 }}>
      <T size={13} weight="bold" tone="muted">Average score by week</T>
      <View style={{ height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 4, borderBottomWidth: 1, borderColor: t.border }}>
        {weeks.map((w) => (
          <View key={w.week} style={{ flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
            {w.avg !== null ? <T size={10.5} tone="muted">{w.avg}</T> : null}
            {w.avg !== null ? <View style={{ width: '70%', height: `${Math.max(2, w.avg * 10)}%`, backgroundColor: t.primary, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} /> : null}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {weeks.map((w) => <T key={w.week} size={10} tone="muted" center style={{ flex: 1 }}>{fmtDay(w.week).split(' ')[0]}</T>)}
      </View>
    </View>
  );
}

function Drill({ type, onDone }: { type: string; onDone: () => void }) {
  const t = useTheme();
  const [items, setItems] = useState<MistakeDrill[] | null>(null);
  const [err, setErr] = useState('');
  const [i, setI] = useState(0);
  const [pick, setPick] = useState<string | null>(null);
  const [right, setRight] = useState(0);
  useEffect(() => { api.mistakeDrill(type).then((r) => setItems(r.items)).catch((e) => setErr(errMsg(e))); }, [type]);
  if (err) return <EmptyState icon="alert" tone="red" title="Can’t load the questions" text={err} />;
  if (!items) return <T tone="muted">Loading…</T>;
  if (!items.length) return <EmptyState icon="check" tone="green" title="Nothing to practise" text="No mistakes of this kind can be turned into questions yet." />;
  if (i >= items.length) {
    return (
      <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
        <IconTile name="check" tone="green" size={52} />
        <T size={22} weight="extrabold">{right} of {items.length} right</T>
        <T tone="muted" center>These questions came from sentences you wrote.</T>
        <Button title="Back to my mistakes" onPress={onDone} />
      </Card>
    );
  }
  const q = items[i];
  const [before, ...after] = q.prompt.split('___');
  const answered = pick !== null;
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T size={13} tone="muted">Question {i + 1} of {items.length}</T>
        <T size={13} weight="bold" tone="primaryInk">{LABEL[q.type] ?? q.type}</T>
      </View>
      <T size={18}>{before}<T size={18} weight="extrabold" style={{ color: answered ? (pick === q.answer ? t.success : t.danger) : t.primaryInk }}>{answered ? q.answer : ' ____ '}</T>{after.join('___')}</T>
      <View style={{ gap: 10 }} accessibilityRole="radiogroup">
        {q.choices.map((c) => {
          const ok = answered && c === q.answer, bad = answered && c === pick && c !== q.answer;
          return (
            <Pressable key={c} disabled={answered} onPress={() => { setPick(c); if (c === q.answer) setRight(right + 1); }} accessibilityRole="radio" accessibilityState={{ checked: pick === c }}
              style={({ pressed }) => ({ minHeight: 52, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5,
                borderColor: ok ? t.success : bad ? t.danger : t.border, backgroundColor: ok ? t.successSoft : bad ? t.dangerSoft : pressed ? t.surface2 : t.surface })}>
              <T weight="bold" style={{ color: ok ? t.success : bad ? t.danger : t.text }}>{c}</T>
            </Pressable>
          );
        })}
      </View>
      {answered ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: t.surface2 }} accessibilityLiveRegion="polite">
          <T size={14} style={{ flex: 1 }}><T size={14} weight="bold">{pick === q.answer ? 'Right! ' : 'Not quite. '}</T>You once wrote “{q.wrong}”.{q.explainVi ? ' ' + q.explainVi : ''}</T>
          <IconButton name="volume" label="Hear the sentence" onPress={() => speak(q.sentence)} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Stop" variant="secondary" onPress={onDone} />
        <Button title={i + 1 < items.length ? 'Next' : 'Finish'} icon="right" disabled={!answered} onPress={() => { setI(i + 1); setPick(null); }} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

/** Practice → My mistakes. */
export default function Mistakes() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState('');
  const [data, setData] = useState<MistakeNotebook | null>(null);
  const [err, setErr] = useState('');
  const [drill, setDrill] = useState(false);
  useEffect(() => { setData(null); setErr(''); api.mistakes(type).then(setData).catch((e) => setErr(errMsg(e))); }, [type, drill]);

  const trend = (x: { last7: number; prev7: number }) => (x.last7 < x.prev7 ? ' ↓' : x.last7 > x.prev7 ? ' ↑' : '');
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title="My mistakes" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 14 }}>
        {drill ? <Drill type={type} onDone={() => setDrill(false)} /> : err ? (
          <EmptyState icon="alert" tone="red" title="Can’t load your mistakes" text={err} />
        ) : !data ? <T tone="muted">Loading…</T> : !data.attempts ? (
          <EmptyState icon="sparkle" title="No sentences yet" text="Write sentences with your words first; AI checks them and your mistakes show up here.">
            <Button title="Write a sentence" onPress={() => router.replace('/write-sentence')} />
          </EmptyState>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[[String(data.attempts), 'Sentences'], [(data.avg ?? '—') + '/10', 'Average'], [String(data.attempts - data.withMistakes), 'No mistakes']].map(([v, l]) => (
                <Card key={l} style={{ flex: 1, padding: 12, gap: 2 }}>
                  <T size={20} weight="extrabold">{v}</T>
                  <T size={12} tone="muted">{l}</T>
                </Card>
              ))}
            </View>
            <Card><WeekChart weeks={data.weeks} /></Card>
            {data.byType.length ? (
              <Card style={{ gap: 10 }}>
                <T size={16} weight="extrabold">Mistakes by kind</T>
                <ChipRow>
                  <Chip label="All" on={!type} onPress={() => setType('')} />
                  {data.byType.map((x) => <Chip key={x.type} label={(LABEL[x.type] ?? x.type) + ' ' + x.count + trend(x)} on={type === x.type} onPress={() => setType(type === x.type ? '' : x.type)} />)}
                </ChipRow>
                <Button title={'Practise ' + (type ? (LABEL[type] ?? type).toLowerCase() : 'these') + (data.drillable ? ' (' + Math.min(10, data.drillable) + ')' : '')} icon="sparkle"
                  disabled={!data.drillable} onPress={() => setDrill(true)} block />
              </Card>
            ) : null}
            {data.recent.map((r) => (
              <Card key={r.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <T weight="extrabold">{r.word}</T>
                  <T size={12} tone="muted" style={{ flex: 1 }}>{fmtDay(r.at)}{r.source === 'homework' ? ' · homework' : ''}</T>
                  <T size={13} weight="extrabold" style={{ color: r.score >= 9 ? t.success : r.score >= 6 ? t.warning : t.danger }}>{r.score}/10</T>
                </View>
                <T size={14} tone="muted" style={{ textDecorationLine: 'line-through' }}>{r.sentence}</T>
                {r.corrected && r.corrected !== r.sentence ? (
                  <View style={{ flexDirection: 'row', gap: 6 }}><Icon name="check" size={16} color={t.success} /><T size={14} weight="semibold" style={{ flex: 1, color: t.success }}>{r.corrected}</T></View>
                ) : null}
                {r.mistakes.map((m, k) => (
                  <T key={k} size={13.5}><T size={13} weight="bold" tone="danger">{LABEL[m.type] ?? m.type}: </T>{m.wrong} → <T size={13.5} weight="bold">{m.fix}</T>{m.explainVi ? <T size={13.5} tone="muted">{' · ' + m.explainVi}</T> : null}</T>
                ))}
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
