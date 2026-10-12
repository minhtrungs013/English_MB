import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Progress, scoreColors } from '../../components/course';
import { isLesson, masteryColors } from '../../components/grammar';
import { confirmCheck, emptyAnswer, QuizView, ResultCard, toPayload, useLeaveGuard, type QuizAnswer } from '../../components/grammar-quiz';
import { BackBar, Button, Card, EmptyState, SectionTitle, T } from '../../components/ui';
import { api, LESSON_LABEL, type GrammarQuestion, type GrammarResult, type LessonId } from '../../lib/api';
import { errMsg, useStore, useTheme } from '../../state/store';

type Phase = 'loading' | 'error' | 'quiz' | 'sending' | 'result';
const N = 10;
/** Titles of the mixed modes. */
const MIX_TITLE: Record<string, string> = {
  mix: 'Mixed practice', 'mix-tenses': 'Mixed practice · Tenses', 'mix-foundations': 'Mixed practice · Foundations', daily: 'Today’s practice',
  mixed: 'Real-world English'
};

export default function GrammarPracticeScreen() {
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const mode = modeParam || 'mix';
  const { actions } = useStore();
  const t = useTheme();
  const [qs, setQs] = useState<GrammarQuestion[]>([]);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
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
      setQs(p.questions); setAnswers(p.questions.map(emptyAnswer)); setI(0);
      if (p.questions.length) setPhase('quiz');
      else { setErr(mode === 'daily' ? 'There are no questions for today yet.' : 'There are no questions for this lesson yet.'); setPhase('error'); }
    } catch (e) {
      setErr(errMsg(e)); setPhase('error');
    }
  }, [mode]);
  useEffect(() => { void start(); }, [start]);

  const inQuiz = phase === 'quiz' || phase === 'sending';
  const leave = useLeaveGuard(inQuiz);

  const send = async () => {
    setPhase('sending');
    try {
      const res = await api.submitGrammar(qs.map((q, k) => toPayload(q, answers[k])));
      setResult(res); setPhase('result');
    } catch (e) {
      setPhase('quiz');
      actions.showToast(errMsg(e), 'bad');
    }
  };
  const check = () => confirmCheck(qs, answers, () => void send());

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
          {result.results.map((r, k) => <ResultCard key={r.id + k} r={r} k={k} />)}
        </ScrollView>
      </View>
    );
  }

  /* ---------- questions ---------- */
  if (inQuiz && qs.length) {
    return <QuizView title={title} qs={qs} answers={answers} setAnswers={setAnswers} i={i} setI={setI} sending={phase === 'sending'} onCheck={check} onLeave={leave} />;
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
