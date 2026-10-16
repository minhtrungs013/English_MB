import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackBar, Badge, Button, Chip, EmptyState, Icon, T } from '../../../../components/ui';
import { api, TENSE_LABEL, TENSES, type BankSentence, type BankWord, type Tense } from '../../../../lib/api';
import { errMsg, useStore, useTheme } from '../../../../state/store';

type Kind = 'tense' | 'tenseChoice';
type Mode = 'mix' | Kind;
const CONTEXT_LABEL: Record<string, string> = {
  meeting: 'Meeting', email: 'Email', interview: 'Interview', chat: 'Chat', phone: 'Phone', report: 'Report', presentation: 'Presentation', customer: 'Customer', other: 'Other'
};

/** Picks `per` sentences per word: tenses the word doesn't have yet first, all different, never used ones. */
function autoPick(words: BankWord[], per: number, tenses: Tense[]): Set<string> {
  const out = new Set<string>();
  for (const w of words) {
    const free = w.sentences.filter((s) => s.canAsk && !s.used && tenses.includes(s.tense as Tense));
    const order = [...free].sort((a, b) => Number(w.has.includes(a.tense as Tense)) - Number(w.has.includes(b.tense as Tense)) || Math.random() - 0.5);
    const seen = new Set<string>();
    for (const s of order) {
      if (out.size >= 60 || seen.size >= per) break;
      if (seen.has(s.tense)) continue;
      seen.add(s.tense);
      out.add(s.id);
    }
  }
  return out;
}

/** The sentence with its verb phrase highlighted (that's what the learner will fill in). */
function Marked({ s }: { s: BankSentence }) {
  const t = useTheme();
  const at = s.verb ? s.sentence.indexOf(s.verb) : -1;
  if (at < 0) return <T size={14.5}>{s.sentence}</T>;
  return (
    <T size={14.5}>
      {s.sentence.slice(0, at)}
      <T size={14.5} weight="extrabold" style={{ color: t.success, backgroundColor: t.successSoft }}>{s.verb}</T>
      {s.sentence.slice(at + s.verb.length)}
    </T>
  );
}

/**
 * Pick a day's questions from the word sentence bank: each of the day's words with its checked example sentences.
 * Picked sentences become tense questions (the verb phrase is the blank), approved straight away.
 */
export default function SentenceBankPicker() {
  const { id, day: dayParam } = useLocalSearchParams<{ id: string; day: string }>();
  const day = Number(dayParam);
  const { actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [words, setWords] = useState<BankWord[] | null>(null);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [tenses, setTenses] = useState<Tense[]>([...TENSES]);
  const [mode, setMode] = useState<Mode>('mix');
  const [per, setPer] = useState(2);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.bankSentences(id, day).then((r) => { if (alive) setWords(r.words); }).catch((e) => { if (alive) setErr(errMsg(e)); });
    return () => { alive = false; };
  }, [id, day]);

  const byId = useMemo(() => new Map((words ?? []).flatMap((w) => w.sentences.map((s) => [s.id, s] as const))), [words]);
  const toggle = (sid: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(sid)) n.delete(sid); else n.add(sid); return n; });
  const toggleTense = (x: Tense) => setTenses((prev) => (prev.includes(x) ? prev.filter((y) => y !== x) : TENSES.filter((y) => y === x || prev.includes(y))));

  const add = async () => {
    if (!picked.size) return;
    setBusy(true);
    try {
      // Mix: alternate typed and multiple choice (multiple choice only where the verb has choices).
      let n = 0;
      const items = [...picked].map((sid) => {
        const s = byId.get(sid);
        const choice = !!s?.canChoose && (mode === 'tenseChoice' || (mode === 'mix' && n++ % 2 === 1));
        return { id: sid, kind: (choice ? 'tenseChoice' : 'tense') as Kind };
      });
      const r = await api.addFromBank(id, day, items);
      actions.showToast('Added ' + r.added + (r.added === 1 ? ' question' : ' questions') + (r.skipped ? ' · ' + r.skipped + ' skipped' : ''));
      router.back();
    } catch (e) {
      actions.showToast(errMsg(e), 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title={'Sentence bank · day ' + day} />
      {err ? <EmptyState icon="alert" tone="red" title="Couldn’t load the sentence bank" text={err} /> : !words ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={t.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 14, paddingBottom: 120 }}>
          <T size={13.5} tone="muted">
            Checked example sentences for this day’s words. Each one you pick becomes a tense question (the green verb is the blank) and is approved straight away.
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {TENSES.map((x) => <Chip key={x} soft label={TENSE_LABEL[x]} on={tenses.includes(x)} onPress={() => toggleTense(x)} />)}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {(['mix', 'tense', 'tenseChoice'] as Mode[]).map((m) => <Chip key={m} label={m === 'mix' ? 'Mix' : m === 'tense' ? 'Typed' : 'Multiple choice'} on={mode === m} onPress={() => setMode(m)} />)}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {[1, 2, 3].map((k) => <Chip key={k} label={k + ' / word'} on={per === k} onPress={() => setPer(k)} />)}
            <Button title="Auto-pick" icon="sparkle" variant="secondary" size="sm" onPress={() => setPicked(autoPick(words, per, tenses))} />
            {picked.size ? <Button title="Clear" variant="ghost" size="sm" onPress={() => setPicked(new Set())} /> : null}
          </View>

          {words.map((w) => {
            const shown = w.sentences.filter((s) => !s.tense || tenses.includes(s.tense as Tense));
            return (
              <View key={w.word} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 }}>
                  <T size={16.5} weight="extrabold">{w.word}</T>
                  <T size={12.5} tone="muted">{w.has.length ? 'In this course: ' + w.has.map((x) => TENSE_LABEL[x] ?? x).join(', ') : 'No tense questions yet'}</T>
                </View>
                {!shown.length ? <T size={13} tone="muted">No sentences in the chosen tenses.</T> : shown.map((s) => {
                  const off = s.used || !s.canAsk;
                  const on = picked.has(s.id);
                  return (
                    <Pressable key={s.id} onPress={() => toggle(s.id)} disabled={off} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: off }}
                      style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : t.surface, opacity: off ? 0.55 : 1 }}>
                      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primary : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                        {on ? <Icon name="check" size={14} color="#fff" /> : null}
                      </View>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Marked s={s} />
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          {s.tenseLabel ? <Badge label={s.tenseLabel} bg={t.infoSoft} fg={t.info} /> : <Badge label="No tense lesson" bg={t.surface2} fg={t.muted} />}
                          <Badge label={CONTEXT_LABEL[s.context] ?? s.context} bg={t.surface2} fg={t.muted} />
                          {s.used ? <Badge label="✓ Added" bg={t.successSoft} fg={t.success} /> : null}
                          {!s.used && !s.canAsk && s.tense ? <T size={12} tone="muted">Verb phrase can’t be a blank</T> : null}
                          {!s.used && s.canAsk && !s.canChoose ? <T size={12} tone="muted">Typed only</T> : null}
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}
      {words ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 16 + insets.bottom, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }}>
          <Button title={busy ? 'Adding…' : 'Add ' + (picked.size || '') + (picked.size === 1 ? ' question' : ' questions')} icon="plus" size="lg" block loading={busy} disabled={!picked.size} onPress={add} />
        </View>
      ) : null}
    </View>
  );
}
