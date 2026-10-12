import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Progress, scoreColors } from '../../components/course';
import { isLesson, RecommendedLessons } from '../../components/grammar';
import { confirmCheck, emptyAnswer, QuizView, ResultCard, toPayload, useLeaveGuard, type QuizAnswer } from '../../components/grammar-quiz';
import { BackBar, Button, Card, EmptyState, SectionTitle, T } from '../../components/ui';
import { api, getUserFlag, LESSON_LABEL, PLACEMENT_SKIPPED, setUserFlag, type GrammarPlacementResult, type GrammarQuestion, type GrammarTenseSummary } from '../../lib/api';
import { errMsg, useStore, useTheme } from '../../state/store';

type Phase = 'loading' | 'error' | 'quiz' | 'sending' | 'result';
const TITLE = 'Placement test';

export default function GrammarPlacementScreen() {
  const { data, actions } = useStore();
  const t = useTheme();
  const [qs, setQs] = useState<GrammarQuestion[]>([]);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [err, setErr] = useState('');
  const [result, setResult] = useState<GrammarPlacementResult | null>(null);
  /** Lesson names, mastery and order (for the per-lesson bars and the recommended lessons). */
  const [lessons, setLessons] = useState<GrammarTenseSummary[] | null>(null);

  const start = useCallback(async () => {
    setPhase('loading'); setErr(''); setResult(null);
    try {
      const [p, list] = await Promise.all([api.grammarPlacement(), api.grammar().catch(() => null)]);
      setLessons(list?.tenses ?? null);
      setQs(p.questions); setAnswers(p.questions.map(emptyAnswer)); setI(0);
      if (p.questions.length) setPhase('quiz');
      else { setErr('The placement test isn’t available right now.'); setPhase('error'); }
    } catch (e) {
      setErr(errMsg(e)); setPhase('error');
    }
  }, []);
  useEffect(() => { void start(); }, [start]);

  const inQuiz = phase === 'quiz' || phase === 'sending';
  const leave = useLeaveGuard(inQuiz, 'placement test');

  const send = async () => {
    setPhase('sending');
    try {
      const res = await api.submitPlacement(qs.map((q, k) => toPayload(q, answers[k])));
      setResult(res); setPhase('result');
      // Taking the test counts as an answer to "Not sure where to start?": clear an earlier Skip.
      if (await getUserFlag(PLACEMENT_SKIPPED, data.userId)) void setUserFlag(PLACEMENT_SKIPPED, data.userId, false);
      // Mastery changed: refresh names/mastery for the recommended lessons (keep the old list on failure).
      api.grammar().then((l) => setLessons(l.tenses)).catch(() => { /* keep */ });
    } catch (e) {
      setPhase('quiz');
      actions.showToast(errMsg(e), 'bad');
    }
  };
  const check = () => confirmCheck(qs, answers, () => void send());

  /* ---------- result ---------- */
  if (phase === 'result' && result) {
    const pct = result.total ? Math.round((result.correct / result.total) * 100) : 0;
    const [sBg, sFg] = scoreColors(pct, t);
    const order = new Map((lessons ?? []).map((x, k) => [x.id as string, k]));
    const names = new Map((lessons ?? []).map((x) => [x.id as string, x.name]));
    const rows = Object.entries(result.scores)
      .filter((e): e is [string, { correct: number; total: number }] => !!e[1] && e[1].total > 0)
      .sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99));
    const first = result.recommended.find(isLesson);
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title={TITLE} />
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: 24 }}>
          <Card style={{ alignItems: 'center', gap: 8, padding: 24 }}>
            <SectionTitle>Your score</SectionTitle>
            <View accessible accessibilityLabel={result.correct + ' of ' + result.total + ' correct'}
              style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: sBg, alignItems: 'center', justifyContent: 'center' }}>
              <T size={34} weight="extrabold" style={{ color: sFg, lineHeight: 42 }}>{result.correct}/{result.total}</T>
            </View>
            <T size={20} weight="extrabold" center>{pct >= 80 ? 'Great level!' : pct >= 50 ? 'Good start!' : 'Let’s build it up!'}</T>
            <T tone="muted" center>{pct}% correct · your starting mastery is set from this test.</T>
          </Card>

          {result.recommended.length ? (
            <View style={{ gap: 8 }}>
              <SectionTitle style={{ marginTop: 4 }}>Recommended for you</SectionTitle>
              <RecommendedLessons ids={result.recommended} lessons={lessons} />
            </View>
          ) : null}

          <Button title="Start practising" icon="right" size="lg" block
            accessibilityLabel={first ? 'Start practising: ' + (names.get(first) ?? LESSON_LABEL[first]) : 'Start today’s practice'}
            onPress={() => router.replace({ pathname: '/grammar/practice', params: { mode: first ?? 'daily' } })} />

          {rows.length ? (
            <Card style={{ gap: 10 }}>
              <SectionTitle>By lesson</SectionTitle>
              {rows.map(([id, sc]) => {
                const p = Math.round((sc.correct / sc.total) * 100);
                const [, fg] = scoreColors(p, t);
                const name = names.get(id) ?? (isLesson(id) ? LESSON_LABEL[id] : id);
                return (
                  <View key={id} accessible accessibilityLabel={name + ': ' + sc.correct + ' of ' + sc.total + ' correct'} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <T weight="bold" style={{ flex: 1 }} numberOfLines={1}>{name}</T>
                      <T size={14} weight="extrabold" style={{ color: fg }}>{sc.correct}/{sc.total}</T>
                    </View>
                    <Progress pct={p} color={fg} />
                  </View>
                );
              })}
            </Card>
          ) : null}

          <Button title="Back to grammar" variant="secondary" onPress={() => router.back()} block />

          <SectionTitle style={{ marginTop: 4 }}>Answers</SectionTitle>
          {result.results.map((r, k) => <ResultCard key={r.id + k} r={r} k={k} />)}
        </ScrollView>
      </View>
    );
  }

  /* ---------- questions ---------- */
  if (inQuiz && qs.length) {
    return <QuizView title={TITLE} qs={qs} answers={answers} setAnswers={setAnswers} i={i} setI={setI} sending={phase === 'sending'}
      onCheck={check} onLeave={leave} leaveLabel="Leave the placement test" />;
  }

  /* ---------- loading / error ---------- */
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title={TITLE} />
      {phase === 'error' ? (
        <EmptyState icon="alert" tone="red" title="Couldn’t start the test" text={err}>
          <View style={{ gap: 10, alignSelf: 'stretch' }}>
            <Button title="Try again" icon="refresh" onPress={() => void start()} block />
            <Button title="Back" variant="ghost" onPress={() => router.back()} block />
          </View>
        </EmptyState>
      ) : <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />}
    </View>
  );
}
