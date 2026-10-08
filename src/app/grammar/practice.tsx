import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ASK, Progress, scoreColors, TenseNote } from '../../components/course';
import { isLesson, LessonLink, masteryColors } from '../../components/grammar';
import { BackBar, Button, Card, EmptyState, Icon, IconButton, Input, SectionTitle, T } from '../../components/ui';
import { api, LESSON_LABEL, type GrammarQuestion, type GrammarResult, type LessonId } from '../../lib/api';
import { errMsg, useStore, useTheme } from '../../state/store';

type Phase = 'loading' | 'error' | 'quiz' | 'sending' | 'result';
const N = 10;
/** Titles of the mixed modes. */
const MIX_TITLE: Record<string, string> = { mix: 'Mixed practice', 'mix-tenses': 'Mixed practice · Tenses', 'mix-foundations': 'Mixed practice · Foundations' };

export default function GrammarPracticeScreen() {
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const mode = modeParam || 'mix';
  const { actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [qs, setQs] = useState<GrammarQuestion[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [err, setErr] = useState('');
  const [result, setResult] = useState<GrammarResult | null>(null);
  /** Mastery and names before this set (for "40% → 55%"). */
  const [before, setBefore] = useState<Partial<Record<LessonId, { name: string; mastery: number }>>>({});

  const start = useCallback(async () => {
    setPhase('loading'); setErr(''); setResult(null);
    try {
      const [p, list] = await Promise.all([api.grammarPractice(mode, N), api.grammar().catch(() => null)]);
      const b: Partial<Record<LessonId, { name: string; mastery: number }>> = {};
      for (const x of list?.tenses ?? []) b[x.id] = { name: x.name, mastery: x.mastery };
      setBefore(b);
      setQs(p.questions); setAnswers(p.questions.map(() => '')); setI(0);
      if (p.questions.length) setPhase('quiz');
      else { setErr('There are no questions for this lesson yet.'); setPhase('error'); }
    } catch (e) {
      setErr(errMsg(e)); setPhase('error');
    }
  }, [mode]);
  useEffect(() => { void start(); }, [start]);

  const inQuiz = phase === 'quiz' || phase === 'sending';
  const leave = useCallback(() => {
    if (!inQuiz) { router.back(); return; }
    Alert.alert('Leave the practice?', 'Your answers so far will be lost.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => router.back() }
    ]);
  }, [inQuiz]);
  // Android back button: confirm before dropping the answers.
  useEffect(() => {
    if (!inQuiz) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { leave(); return true; });
    return () => sub.remove();
  }, [inQuiz, leave]);

  const send = async () => {
    setPhase('sending');
    try {
      const res = await api.submitGrammar(qs.map((q, k) => ({ id: q.id, answer: (answers[k] ?? '').trim() })));
      setResult(res); setPhase('result');
    } catch (e) {
      setPhase('quiz');
      actions.showToast(errMsg(e), 'bad');
    }
  };
  const check = () => {
    const empty = answers.filter((a) => !a.trim()).length;
    if (!empty) { void send(); return; }
    Alert.alert('Check now?', empty + (empty === 1 ? ' question is' : ' questions are') + ' still empty and will count as wrong.', [
      { text: 'Keep answering', style: 'cancel' },
      { text: 'Check answers', onPress: () => void send() }
    ]);
  };

  const title = MIX_TITLE[mode] ?? (isLesson(mode) ? LESSON_LABEL[mode] : 'Grammar') + ' practice';

  /* ---------- result ---------- */
  if (phase === 'result' && result) {
    const pct = result.total ? Math.round((result.correct / result.total) * 100) : 0;
    const [sBg, sFg] = scoreColors(pct, t);
    const changes = (Object.entries(result.mastery) as [LessonId, number][]).map(([id, now]) => ({
      id, now, was: before[id]?.mastery, name: before[id]?.name ?? LESSON_LABEL[id] ?? id
    }));
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title={title} />
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: 24 }}>
          <Card style={{ alignItems: 'center', gap: 8, padding: 24 }}>
            <SectionTitle>Your score</SectionTitle>
            <View accessible accessibilityLabel={result.correct + ' of ' + result.total + ' correct'}
              style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: sBg, alignItems: 'center', justifyContent: 'center' }}>
              <T size={34} weight="extrabold" style={{ color: sFg, lineHeight: 42 }}>{result.correct}/{result.total}</T>
            </View>
            <T size={20} weight="extrabold" center>{pct >= 80 ? 'Great job!' : pct >= 50 ? 'Nice work!' : 'Keep practising!'}</T>
            <T tone="muted" center>{pct}% correct</T>
          </Card>

          {changes.length ? (
            <Card style={{ gap: 10 }}>
              <SectionTitle>Mastery</SectionTitle>
              {changes.map((c) => {
                const [, fg] = masteryColors(c.now, t);
                const diff = c.was == null ? 0 : c.now - c.was;
                const text = c.was == null ? c.now + '%' : c.was + '% → ' + c.now + '%';
                return (
                  <View key={c.id} accessible accessibilityLabel={c.name + ' mastery ' + (c.was == null ? '' : 'from ' + c.was + '% ') + 'to ' + c.now + '%'} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <T weight="bold" style={{ flex: 1 }} numberOfLines={1}>{c.name}</T>
                      <T size={14} weight="extrabold" style={{ color: fg }}>{text}</T>
                      {diff ? <T size={12.5} weight="bold" style={{ color: diff > 0 ? t.success : t.danger }}>({diff > 0 ? '+' : ''}{diff})</T> : null}
                    </View>
                    <Progress pct={c.now} color={fg} />
                  </View>
                );
              })}
            </Card>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Practise again" icon="refresh" variant="secondary" onPress={() => void start()} style={{ flex: 1 }} />
            <Button title="Done" icon="check" onPress={() => router.back()} style={{ flex: 1 }} />
          </View>

          <SectionTitle style={{ marginTop: 4 }}>Answers</SectionTitle>
          {result.results.map((r, k) => {
            const fg = r.correct ? t.success : t.danger;
            return (
              <View key={r.id + k} style={{ backgroundColor: t.surface, borderColor: r.correct ? t.border : t.danger, borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 }}>
                <View accessible style={{ gap: 6 }}
                  accessibilityLabel={'Question ' + (k + 1) + ', ' + (r.correct ? 'correct' : 'wrong') + '. ' + r.prompt + '. Your answer: ' + (r.yourAnswer || 'empty') + (r.correct ? '' : '. Correct answer: ' + r.answer) + (r.tenseLabel ? '. ' + r.tenseLabel : '') + (r.explain ? '. ' + r.explain : '')}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name={r.correct ? 'checkc' : 'alert'} size={18} color={fg} />
                    <T size={13} weight="extrabold" tone="muted">Question {k + 1}</T>
                  </View>
                  <T weight="bold">{r.prompt}</T>
                  <View style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: r.correct ? t.successSoft : t.dangerSoft }}>
                    <T size={13.5} weight="semibold" style={{ color: fg }}>Your answer: {r.yourAnswer || '— (empty)'}</T>
                  </View>
                  {!r.correct ? (
                    <View style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: t.successSoft }}>
                      <T size={13.5} weight="semibold" style={{ color: t.success }}>Correct: {r.answer}</T>
                    </View>
                  ) : null}
                  <TenseNote label={r.tenseLabel} explain={r.explain} />
                </View>
                {!r.correct ? <LessonLink lesson={r.tense || r.lesson} title="Review the lesson" /> : null}
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  /* ---------- questions ---------- */
  if (inQuiz && qs.length) {
    const n = qs.length;
    const q = qs[i];
    const a = answers[i] ?? '';
    const last = i === n - 1;
    const sending = phase === 'sending';
    const typed = q.kind === 'tense' || !q.choices.length;
    const setA = (v: string) => setAnswers((prev) => prev.map((x, k) => (k === i ? v : x)));
    const next = () => { if (!last) setI(i + 1); };
    const done = answers.filter((x) => x.trim()).length;
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 + insets.top }}>
          <IconButton name="x" label="Leave practice" onPress={leave} />
          <View style={{ flex: 1 }}><Progress pct={((i + 1) / n) * 100} height={8} /></View>
          <T size={14} weight="bold" tone="muted" style={{ paddingHorizontal: 8 }}>{i + 1} / {n}</T>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: 14, padding: 20, borderRadius: 22 }}>
            <T size={13} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>{title} · question {i + 1} of {n}</T>
            <T size={14} weight="bold" tone="muted">{ASK[typed ? 'tense' : 'tenseChoice']}</T>
            <T size={19} weight="extrabold">{q.prompt}</T>
            {typed ? (
              <Input key={i} value={a} onChangeText={setA} placeholder="Type the verb form…" autoFocus autoCapitalize="none" autoCorrect={false}
                spellCheck={false} returnKeyType={last ? 'done' : 'next'} submitBehavior={last ? 'blurAndSubmit' : 'submit'}
                onSubmitEditing={() => (last ? check() : next())} editable={!sending} accessibilityLabel={'Answer to question ' + (i + 1)} />
            ) : null}
            {typed ? (
              <T size={12.5} tone="muted">Type only the missing words — e.g. “has finished”, not “She has finished”.</T>
            ) : (
              <View style={{ gap: 10 }} accessibilityRole="radiogroup">
                {q.choices.map((o, k) => {
                  const on = a === o;
                  return (
                    <Pressable key={k} onPress={() => setA(on ? '' : o)} disabled={sending} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: sending }}
                      accessibilityLabel={'Choice ' + 'ABCD'.charAt(k) + ': ' + o}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, padding: 12, borderRadius: 12, borderWidth: 1.5,
                        borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : pressed ? t.surface2 : t.surface })}>
                      <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.primary : t.surface2 }}>
                        <T size={13} weight="extrabold" style={{ color: on ? '#fff' : t.muted }}>{'ABCD'.charAt(k) || String(k + 1)}</T>
                      </View>
                      <T weight="semibold" style={{ flex: 1, color: on ? t.primaryInk : t.text }}>{o}</T>
                      {on ? <Icon name="check" size={18} color={t.primaryInk} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Card>
          <T size={13} tone="muted" center>{done} of {n} answered</T>
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10, padding: 12, paddingBottom: insets.bottom + 12, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }}>
          <Button title="Back" icon="left" variant="secondary" size="lg" onPress={() => setI(i - 1)} disabled={i === 0 || sending} style={{ flex: 1 }} />
          {last
            ? <Button title="Check answers" icon="check" size="lg" onPress={check} loading={sending} style={{ flex: 1.4 }} />
            : <Button title="Next" icon="right" size="lg" onPress={next} disabled={sending} style={{ flex: 1.4 }} />}
        </View>
      </KeyboardAvoidingView>
    );
  }

  /* ---------- loading / error ---------- */
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title={title} />
      {phase === 'error' ? (
        <EmptyState icon="alert" tone="red" title="Couldn’t start the practice" text={err}>
          <View style={{ gap: 10, alignSelf: 'stretch' }}>
            <Button title="Try again" icon="refresh" onPress={() => void start()} block />
            <Button title="Back" variant="ghost" onPress={() => router.back()} block />
          </View>
        </EmptyState>
      ) : <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />}
    </View>
  );
}
