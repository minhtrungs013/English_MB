import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackBar, Button, Card, EmptyState, Icon, IconButton, IconTile, PosBadge, T } from '../components/ui';
import { api, type SentenceResult } from '../lib/api';
import type { Word } from '../lib/data';
import { speak } from '../lib/speech';
import { errMsg, useStore, useTheme } from '../state/store';

/** Words per round: due words first, then the newest. */
const ROUND = 10;

const MISTAKE_LABEL: Record<string, string> = {
  tense: 'Tense', agreement: 'Subject–verb', article: 'Article', preposition: 'Preposition', 'word-form': 'Word form',
  'word-meaning': 'Meaning', collocation: 'Collocation', 'word-order': 'Word order', spelling: 'Spelling', punctuation: 'Punctuation', other: 'Other'
};

function pickRound(words: Word[]): Word[] {
  const now = Date.now();
  const due = words.filter((w) => w.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
  const rest = words.filter((w) => w.dueAt > now).sort((a, b) => b.addedAt - a.addedAt);
  return [...due, ...rest].slice(0, ROUND);
}

/** Practice → Write a sentence: write a sentence with each word; AI grades it. */
export default function WriteSentence() {
  const { data, actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [round, setRound] = useState<Word[]>(() => pickRound(data.words));
  const [i, setI] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<SentenceResult | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [saved, setSaved] = useState(false);
  const input = useRef<TextInput>(null);
  const scroll = useRef<ScrollView>(null);
  const w = round[i];
  const done = i >= round.length;

  useEffect(() => { api.sentenceQuota().then(setQuota).catch(() => setQuota(null)); }, []);
  const left = quota ? Math.max(0, quota.limit - quota.used) : null;
  const avg = useMemo(() => (scores.length ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10 : 0), [scores]);

  const check = async () => {
    if (!w || busy) return;
    const s = text.trim();
    if (s.split(/\s+/).length < 3) { setErr('Please write a full sentence (at least 3 words).'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api.checkSentence(w.id, s);
      setRes(r); setQuota(r.quota); setSaved(false);
      setScores((x) => [...x, r.score]);
      scroll.current?.scrollTo({ y: 0, animated: true });
    } catch (e) {
      setErr(errMsg(e));
    } finally { setBusy(false); }
  };
  const next = () => { setI(i + 1); setText(''); setRes(null); setErr(''); };
  const retry = () => { setRes(null); setErr(''); setTimeout(() => input.current?.focus(), 50); };
  const saveExample = async (sentence: string) => {
    try { await actions.setWordExample(w.id, sentence); setSaved(true); } catch (e) { actions.showToast(errMsg(e), 'bad'); }
  };

  const tone = (score: number) => (score >= 9 ? { bg: t.successSoft, fg: t.success } : score >= 6 ? { bg: t.warningSoft, fg: t.warning } : { bg: t.dangerSoft, fg: t.danger });

  if (!data.words.length) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title="Write a sentence" />
        <View style={{ padding: 16 }}><EmptyState icon="book" title="No words yet" text="Save some words first, then come back to write sentences with them." /></View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackBar title="Write a sentence" right={left !== null ? <T size={13} tone={left === 0 ? 'danger' : 'muted'} style={{ paddingRight: 12 }}>{left} left today</T> : undefined} />
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        {done ? (
          <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
            <IconTile name="check" tone="green" size={52} />
            <T size={22} weight="extrabold">Round finished</T>
            <T tone="muted" center>{scores.length ? 'You checked ' + scores.length + ' sentence' + (scores.length === 1 ? '' : 's') + ' · average ' + avg + '/10' : 'You skipped every word this time.'}</T>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <Button title="Practice" variant="secondary" onPress={() => router.back()} />
              <Button title="New round" onPress={() => { setRound(pickRound(data.words)); setI(0); setScores([]); }} />
            </View>
          </Card>
        ) : (
          <>
            <T size={13} tone="muted">Word {i + 1} of {round.length}</T>
            <Card style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <T size={28} weight="extrabold" style={{ letterSpacing: -0.5 }}>{w.word}</T>
                <IconButton name="volume" label={'Hear ' + w.word} onPress={() => speak(w.word)} />
                <PosBadge pos={w.pos} />
              </View>
              {w.vi ? <T tone="muted">{w.vi}</T> : null}
            </Card>

            {!res ? (
              <Card style={{ gap: 10 }}>
                <T size={14} weight="bold">Your sentence with “{w.word}”</T>
                <TextInput ref={input} value={text} onChangeText={setText} editable={!busy} multiline maxLength={200} autoCapitalize="sentences"
                  placeholder={'A sentence about your work with “' + w.word + '”'} placeholderTextColor={t.faint}
                  accessibilityLabel={'Your sentence with ' + w.word}
                  style={{ minHeight: 100, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 12, fontSize: 16, color: t.text, backgroundColor: t.surface, textAlignVertical: 'top' }} />
                <T size={12} tone="muted" style={{ alignSelf: 'flex-end' }}>{text.length}/200</T>
                {err ? (
                  <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 8, padding: 12, borderRadius: 10, backgroundColor: t.dangerSoft }}>
                    <Icon name="alert" size={16} color={t.danger} />
                    <T size={14} weight="semibold" tone="danger" style={{ flex: 1 }}>{err}</T>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="Skip" variant="secondary" onPress={next} disabled={busy} />
                  <Button title={busy ? 'Checking…' : 'Check my sentence'} icon="sparkle" loading={busy} onPress={check} disabled={!text.trim() || left === 0} style={{ flex: 1 }} />
                </View>
              </Card>
            ) : (
              <Card style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: tone(res.score).bg }}
                  accessibilityLabel={'Score ' + res.score + ' out of 10'}>
                  <T size={34} weight="extrabold" style={{ color: tone(res.score).fg }}>{res.score}</T>
                  <T size={15} weight="bold" style={{ color: tone(res.score).fg }}>/10</T>
                </View>
                <T size={16} style={{ fontStyle: 'italic' }}>“{text.trim()}”</T>
                {res.feedbackVi ? <View style={{ padding: 12, borderRadius: 12, backgroundColor: t.surface2 }}><T>{res.feedbackVi}</T></View> : null}
                {res.mistakes.map((m, k) => (
                  <View key={k} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7, backgroundColor: t.dangerSoft }}>
                      <T size={12} weight="bold" tone="danger">{MISTAKE_LABEL[m.type] ?? m.type}</T>
                    </View>
                    <T size={14} style={{ flex: 1 }}>
                      <T size={14} tone="danger" style={{ textDecorationLine: 'line-through' }}>{m.wrong}</T> → <T size={14} weight="bold">{m.fix}</T>
                      {m.explainVi ? <T size={14} tone="muted">{' · ' + m.explainVi}</T> : null}
                    </T>
                  </View>
                ))}
                {res.corrected && res.corrected !== text.trim() ? (
                  <Line label="Corrected" text={res.corrected} />
                ) : null}
                {res.better ? <Line label="A natural example" text={res.better} sub={res.betterVi} /> : null}
                {res.score >= 8 && !saved ? (
                  <Button title={'Use as my example for “' + w.word + '”'} icon="plus" variant="ghost" size="md" onPress={() => saveExample(res.corrected || text.trim())} />
                ) : null}
                {saved ? <T size={14} weight="bold" style={{ color: t.success }}>✓ Saved as the example</T> : null}
                {res.lesson ? (
                  <Button title={'Review: ' + res.lesson.name} icon="book" variant="ghost" size="md"
                    onPress={() => router.push({ pathname: '/grammar/[tense]', params: { tense: res.lesson!.id } })} />
                ) : null}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="Write again" icon="refresh" variant="secondary" onPress={retry} disabled={left === 0} />
                  <Button title={i + 1 < round.length ? 'Next word' : 'Finish'} icon="right" onPress={next} style={{ flex: 1 }} />
                </View>
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Line({ label, text, sub }: { label: string; text: string; sub?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderWidth: 1, borderColor: t.border, borderRadius: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T size={12} weight="bold" tone="muted">{label}</T>
        <T size={15.5}>{text}</T>
        {sub ? <T size={13} tone="muted">{sub}</T> : null}
      </View>
      <IconButton name="volume" label={'Hear: ' + label} onPress={() => speak(text)} />
    </View>
  );
}
