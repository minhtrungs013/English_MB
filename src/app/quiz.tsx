import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, EmptyState, Icon, IconButton, Input, T } from '../components/ui';
import { cap1, low1, shuffle, type Word } from '../lib/data';
import { speak, stopSpeaking } from '../lib/speech';
import { useStore, useTheme } from '../state/store';

type Mode = 'mc' | 'fill' | 'trans' | 'listen';
interface Q { id: string; opts?: string[]; ans?: number; before?: string; after?: string; answer: string }
const TITLES: Record<Mode, string> = { mc: 'Multiple Choice', fill: 'Fill in the Blank', trans: 'Translation', listen: 'Listening' };

function makeQuestions(mode: Mode, ws: Word[]): Q[] {
  if (mode === 'mc') {
    const pool = ws.filter((w) => w.meaning);
    if (pool.length < 4) return [];
    return shuffle(pool).slice(0, 10).map((w) => {
      const opts = shuffle([w.meaning, ...shuffle(pool.filter((o) => o.id !== w.id && o.meaning !== w.meaning)).slice(0, 3).map((o) => o.meaning)]);
      return { id: w.id, opts, ans: opts.indexOf(w.meaning), answer: w.word };
    });
  }
  if (mode === 'fill') {
    return shuffle(ws.filter((w) => w.ex && w.ex.toLowerCase().includes(w.word.toLowerCase()))).slice(0, 10).map((w) => {
      const k = w.ex.toLowerCase().indexOf(w.word.toLowerCase());
      return { id: w.id, before: w.ex.slice(0, k), after: w.ex.slice(k + w.word.length), answer: w.word };
    });
  }
  if (mode === 'trans') return shuffle(ws.filter((w) => w.vi)).slice(0, 10).map((w) => ({ id: w.id, answer: w.word }));
  return shuffle(ws).slice(0, 10).map((w) => ({ id: w.id, answer: w.word }));
}

export default function Quiz() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = (['mc', 'fill', 'trans', 'listen'].includes(params.mode ?? '') ? params.mode : 'mc') as Mode;
  const { data } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [qs, setQs] = useState<Q[]>(() => makeQuestions(mode, data.words));
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const n = qs.length;
  const q = qs[Math.min(i, Math.max(0, n - 1))];
  const w = q ? data.words.find((x) => x.id === q.id) : undefined;

  useEffect(() => {
    if (mode !== 'listen' || done || !q) return;
    const id = setTimeout(() => speak(q.answer), 300);
    return () => clearTimeout(id);
  }, [mode, i, done, q]);
  useEffect(() => () => stopSpeaking(), []);

  const close = () => { stopSpeaking(); router.back(); };
  const pick = (idx: number) => {
    if (checked || !q) return;
    const ok = idx === q.ans;
    setPicked(idx); setChecked(true); setCorrect(ok); if (ok) setScore((s) => s + 1);
  };
  const check = (skip: boolean) => {
    if (checked || !q || (!skip && !input.trim())) return;
    const ok = !skip && input.trim().toLowerCase() === q.answer.toLowerCase();
    setChecked(true); setCorrect(ok); if (ok) setScore((s) => s + 1);
  };
  const next = () => {
    if (i + 1 >= n) { setDone(true); return; }
    setI(i + 1); setPicked(null); setInput(''); setChecked(false); setCorrect(false);
  };
  const again = () => { setQs(makeQuestions(mode, data.words)); setI(0); setPicked(null); setInput(''); setChecked(false); setCorrect(false); setScore(0); setDone(false); };

  const pct = done ? 100 : n ? Math.round(((i + (checked ? 1 : 0)) / n) * 100) : 0;
  const bar = (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <T weight="extrabold" numberOfLines={1} style={{ maxWidth: 140 }}>{TITLES[mode]}</T>
      <View style={{ flex: 1, height: 8, borderRadius: 99, backgroundColor: t.surface3, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%` as const, height: '100%', backgroundColor: t.primary, borderRadius: 99 }} />
      </View>
      <T size={14} weight="bold" tone="muted">{n ? (done ? n : i + 1) + ' / ' + n : '0 / 0'}</T>
      <IconButton name="x" label="Exit" onPress={close} />
    </View>
  );

  if (!n) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {bar}
        <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
          <Card>
            <EmptyState icon="alert" title="Not enough words yet" text={mode === 'mc' ? 'Multiple choice needs at least 4 words with meanings.' : 'Save a few more words with examples and translations first.'}>
              <Button title="Browse the Library" icon="globe" onPress={() => router.replace('/library')} />
            </EmptyState>
          </Card>
        </View>
      </View>
    );
  }

  if (done) {
    const acc = Math.round((score / n) * 100);
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {bar}
        <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
          <Card style={{ alignItems: 'center', gap: 10, padding: 24 }}>
            <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="trophy" size={32} color={t.primaryInk} /></View>
            <T size={26} weight="extrabold" center>{acc >= 80 ? 'Great job!' : acc >= 50 ? 'Nice work!' : 'Keep practicing!'}</T>
            <T tone="muted" center>You answered {score} of {n} correctly.</T>
            <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginVertical: 8 }}>
              {[[n, 'questions', t.text], [score, 'correct', t.success], [acc + '%', 'accuracy', t.text]].map(([v, l, c]) => (
                <View key={l as string} style={{ flex: 1, backgroundColor: t.surface2, borderRadius: 12, padding: 12, alignItems: 'center' }}>
                  <T size={24} weight="extrabold" style={{ color: c as string }}>{v}</T>
                  <T size={12} weight="semibold" tone="muted">{l as string}</T>
                </View>
              ))}
            </View>
            <Button title="Practice again" size="lg" onPress={again} block />
            <Button title="Back to Practice" variant="secondary" onPress={close} block />
          </Card>
        </View>
      </View>
    );
  }

  const explain = w?.meaning ? '“' + cap1(q.answer) + '” means ' + low1(w.meaning.replace(/\.$/, '')) + '.' : '';
  const feedback = checked ? (
    <View style={{ borderRadius: 14, padding: 16, gap: 6, backgroundColor: correct ? t.successSoft : t.dangerSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={correct ? 'checkc' : 'alert'} size={20} color={correct ? t.success : t.danger} />
        <T size={16} weight="extrabold" style={{ color: correct ? t.success : t.danger }}>{correct ? 'Correct!' : mode === 'mc' ? 'Not quite' : 'Not quite — the answer is'}</T>
      </View>
      {mode !== 'mc' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}>
          <T size={20} weight="extrabold">{q.answer}</T>
          <T ipa tone="muted">{w?.ipa}</T>
          <T tone="muted">· {w?.vi}</T>
        </View>
      ) : null}
      {explain ? <T>{explain}</T> : null}
      {mode === 'mc' && w?.ex ? <T size={13.5} tone="muted">Example: “{w.ex}”</T> : null}
    </View>
  ) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {bar}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 16, padding: 20, borderRadius: 22 }}>
          <T size={13} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>Question {i + 1} / {n}</T>

          {mode === 'mc' && (
            <>
              <T size={22} weight="extrabold" style={{ letterSpacing: -0.4 }}>What does “{q.answer}” mean?</T>
              <View style={{ gap: 10 }}>
                {(q.opts ?? []).map((o, k) => {
                  const isAns = k === q.ans, isPicked = k === picked;
                  const border = checked ? (isAns ? t.success : isPicked ? t.danger : t.border) : t.border;
                  const bg = checked ? (isAns ? t.successSoft : isPicked ? t.dangerSoft : t.surface) : t.surface;
                  return (
                    <Pressable key={k} onPress={() => pick(k)} disabled={checked} accessibilityRole="button"
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: border, backgroundColor: bg, opacity: checked && !isAns && !isPicked ? 0.6 : 1 }}>
                      <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: checked && isAns ? t.success : checked && isPicked ? t.danger : t.surface2 }}>
                        <T size={13} weight="extrabold" style={{ color: checked && (isAns || isPicked) ? '#fff' : t.muted }}>{'ABCD'.charAt(k)}</T>
                      </View>
                      <T weight="semibold" style={{ flex: 1 }}>{o}</T>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {mode === 'fill' && (
            <>
              <T size={21} weight="extrabold" style={{ lineHeight: 32 }}>
                {q.before}<T size={21} weight="extrabold" tone="primaryInk" style={{ textDecorationLine: 'underline' }}>{checked ? q.answer : ' ______ '}</T>{q.after}
              </T>
              <T size={13.5} tone="muted">Hint: {w?.pos} · {w?.vi}</T>
            </>
          )}
          {mode === 'trans' && (
            <>
              <T size={13.5} weight="bold" tone="muted">Translate into English</T>
              <T size={24} weight="extrabold">{w?.vi}</T>
              <T size={13.5} tone="muted">Hint: {w?.pos} · starts with “{q.answer.charAt(0).toUpperCase()}”</T>
            </>
          )}
          {mode === 'listen' && (
            <>
              <T size={21} weight="extrabold">Listen and type the word you hear</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 16, backgroundColor: t.surface2 }}>
                <Pressable onPress={() => speak(q.answer)} accessibilityRole="button" accessibilityLabel="Play the word"
                  style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="volume" size={32} color="#fff" />
                </Pressable>
                <View style={{ flex: 1, gap: 8 }}>
                  <Button title="Play slowly" icon="clock" variant="secondary" size="sm" onPress={() => speak(q.answer, 0.6)} />
                  {w?.ex ? <Button title="In a sentence" icon="chat" variant="secondary" size="sm" onPress={() => speak(w.ex, 0.95)} /> : null}
                </View>
              </View>
              <T size={13.5} tone="muted">Hint: {w?.pos} · {q.answer.replace(/\s/g, '').length} letters</T>
            </>
          )}

          {mode !== 'mc' && (
            <Input value={input} onChangeText={setInput} placeholder="Type your answer…" editable={!checked} autoCapitalize="none" autoCorrect={false}
              invalid={checked && !correct} returnKeyType="done" onSubmitEditing={() => (checked ? next() : check(false))} accessibilityLabel="Your answer" />
          )}

          {feedback}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <T size={13.5} tone="muted">Score: {score} / {n}</T>
            {checked ? <Button title="Continue" icon="right" onPress={next} />
              : mode !== 'mc' ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Skip" variant="ghost" onPress={() => check(true)} />
                  <Button title="Check" onPress={() => check(false)} disabled={!input.trim()} />
                </View>
              ) : null}
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
