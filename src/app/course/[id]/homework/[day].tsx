import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ASK, fmtDuration, isSentence, isTyped, Progress, scoreColors, TenseNote } from '../../../../components/course';
import { BackBar, Badge, Button, Card, EmptyState, Icon, IconButton, IconTile, Input, SectionTitle, T } from '../../../../components/ui';
import { api, ApiError, type CourseDetail, type Homework, type HomeworkQuestion, type HomeworkResult } from '../../../../lib/api';
import { speak } from '../../../../lib/speech';
import { errMsg, useStore, useTheme } from '../../../../state/store';

type Phase = 'intro' | 'loading' | 'quiz' | 'sending' | 'result';

const TYPE_LABEL: Record<HomeworkQuestion['type'], string> = { meaning: 'Meaning', word: 'Word', type: 'Spelling', blank: 'Sentence', tense: 'Tense', tenseChoice: 'Tense' };

export default function HomeworkScreen() {
  const { id, day: dayParam } = useLocalSearchParams<{ id: string; day: string }>();
  const day = Number(dayParam);
  const { actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [c, setC] = useState<CourseDetail | null>(null);
  const [hw, setHw] = useState<Homework | null>(null);
  const [result, setResult] = useState<HomeworkResult | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>('intro');
  const [err, setErr] = useState('');

  /** Opens the homework (this starts the timer on the server, unless it was already handed in). */
  const start = useCallback(async () => {
    setPhase('loading'); setErr('');
    try {
      const h = await api.getHomework(id, day);
      setHw(h);
      if (h.submission) { setResult(h.submission); setPhase('result'); return; }
      setAnswers(h.questions.map(() => '')); setI(0); setPhase(h.questions.length ? 'quiz' : 'intro');
    } catch (e) {
      setErr(errMsg(e)); setPhase('intro');
    }
  }, [id, day]);

  useEffect(() => {
    let live = true;
    api.course(id).then((res) => {
      if (!live) return;
      setC(res);
      // Already handed in: nothing to time, so go straight to the result.
      if (res.days.find((d) => d.day === day)?.myScore != null) void start();
    }).catch((e) => { if (live) setErr(errMsg(e)); });
    return () => { live = false; };
  }, [id, day, start]);

  const inQuiz = phase === 'quiz' || phase === 'sending';
  const leave = useCallback(() => {
    if (!inQuiz) { router.back(); return; }
    Alert.alert('Leave the homework?', 'Your answers so far will be lost, and the timer keeps running. You can start again from the day page.', [
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
    if (!hw) return;
    setPhase('sending');
    try {
      const res = await api.submitHomework(id, day, answers.map((a) => a.trim()));
      setResult(res); setPhase('result');
      actions.showToast('Homework handed in · score ' + res.score);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setPhase('quiz');
        Alert.alert('Homework changed', 'This homework was already handed in, or its words changed. It will reload now.', [{ text: 'Reload', onPress: () => void start() }]);
        return;
      }
      setPhase('quiz');
      actions.showToast(errMsg(e), 'bad');
    }
  };
  const handIn = () => {
    const empty = answers.filter((a) => !a.trim()).length;
    if (!empty) { void send(); return; }
    Alert.alert('Hand in now?', empty + (empty === 1 ? ' question is' : ' questions are') + ' still empty and will count as wrong. You can only hand in once.', [
      { text: 'Keep answering', style: 'cancel' },
      { text: 'Hand in', onPress: () => void send() }
    ]);
  };

  const title = 'Day ' + (dayParam ?? '') + ' homework';

  /* ---------- result ---------- */
  if (phase === 'result' && result) {
    const [sBg, sFg] = scoreColors(result.score, t);
    const late = result.lateDays > 0;
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title={title} />
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: insets.bottom + 24 }}>
          <Card style={{ alignItems: 'center', gap: 8, padding: 24 }}>
            <SectionTitle>Your score</SectionTitle>
            <View accessible accessibilityLabel={'Score ' + result.score + ' out of 100'}
              style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: sBg, alignItems: 'center', justifyContent: 'center' }}>
              <T size={44} weight="extrabold" style={{ color: sFg, lineHeight: 52 }}>{result.score}</T>
            </View>
            <T size={20} weight="extrabold" center>{result.score >= 80 ? 'Great job!' : result.score >= 50 ? 'Nice work!' : 'Keep practicing!'}</T>
            <T tone="muted" center>{result.correct} of {result.total} correct · {result.raw}% before penalty</T>
            <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 8 }}>
              {([
                [result.correct + '/' + result.total, 'correct'],
                [result.raw + '%', 'raw score'],
                [fmtDuration(result.durationMs), 'time']
              ] as const).map(([v, l]) => (
                <View key={l} accessible accessibilityLabel={l + ' ' + v} style={{ flex: 1, backgroundColor: t.surface2, borderRadius: 12, padding: 12, alignItems: 'center' }}>
                  <T size={19} weight="extrabold">{v}</T>
                  <T size={12} weight="semibold" tone="muted">{l}</T>
                </View>
              ))}
            </View>
            <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: late ? t.warningSoft : t.successSoft }}>
              <Icon name={late ? 'clock' : 'checkc'} size={18} color={late ? t.warning : t.success} />
              <T size={13.5} weight="semibold" style={{ flex: 1, color: late ? t.warning : t.success }}>
                {late ? result.lateDays + (result.lateDays === 1 ? ' day' : ' days') + ' late · you kept ' + result.penalty + '% of your score' : 'Handed in on time · full score'}
              </T>
            </View>
          </Card>

          <Button title="Leaderboard" icon="trophy" variant="secondary" onPress={() => router.push({ pathname: '/course/[id]/leaderboard', params: { id, day: String(day) } })} block />

          <SectionTitle style={{ marginTop: 4 }}>Answers</SectionTitle>
          {result.review.map((r, k) => {
            const fg = r.correct ? t.success : t.danger;
            return (
              <View key={k} accessible
                accessibilityLabel={'Question ' + (k + 1) + ', ' + (r.correct ? 'correct' : 'wrong') + '. ' + r.prompt + '. Your answer: ' + (r.yourAnswer || 'empty') + (r.correct ? '' : '. Correct answer: ' + r.answer) + (r.tenseLabel ? '. ' + r.tenseLabel : '') + (r.explain ? '. ' + r.explain : '')}
                style={{ backgroundColor: t.surface, borderColor: r.correct ? t.border : t.danger, borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Icon name={r.correct ? 'checkc' : 'alert'} size={18} color={fg} />
                  <T size={13} weight="extrabold" tone="muted">{k + 1}. {TYPE_LABEL[r.type] ?? r.type}</T>
                  {r.review ? <Badge label="Review" bg={t.infoSoft} fg={t.info} /> : null}
                </View>
                <T weight="bold">{r.prompt}</T>
                {r.hint ? <T size={13} tone="muted">{r.hint}</T> : null}
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
            );
          })}
        </ScrollView>
      </View>
    );
  }

  /* ---------- questions ---------- */
  if (inQuiz && hw && hw.questions.length) {
    const n = hw.questions.length;
    const q = hw.questions[i];
    const a = answers[i] ?? '';
    const last = i === n - 1;
    const sending = phase === 'sending';
    const setA = (v: string) => setAnswers((prev) => prev.map((x, k) => (k === i ? v : x)));
    const next = () => { if (!last) setI(i + 1); };
    const done = answers.filter((x) => x.trim()).length;
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 + insets.top }}>
          <IconButton name="x" label="Leave homework" onPress={leave} />
          <View style={{ flex: 1 }}><Progress pct={((i + 1) / n) * 100} height={8} /></View>
          <T size={14} weight="bold" tone="muted" style={{ paddingHorizontal: 8 }}>{i + 1} / {n}</T>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 14 }} keyboardShouldPersistTaps="handled">
          {hw.lateDays > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: t.warningSoft }}>
              <Icon name="clock" size={16} color={t.warning} />
              <T size={13} weight="semibold" style={{ flex: 1, color: t.warning }}>{hw.lateDays + (hw.lateDays === 1 ? ' day' : ' days')} late · you’ll keep {hw.penalty}% of your score</T>
            </View>
          ) : null}
          <Card style={{ gap: 14, padding: 20, borderRadius: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T size={13} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8, flex: 1 }}>Question {i + 1} of {n}</T>
              {q.review ? <Badge label="Review" bg={t.infoSoft} fg={t.info} /> : null}
            </View>
            <T size={14} weight="bold" tone="muted">{ASK[q.type] ?? ''}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T size={isSentence(q) ? 19 : 24} weight="extrabold" style={{ flex: 1, letterSpacing: isSentence(q) ? 0 : -0.4 }}>{q.prompt}</T>
              {q.type === 'meaning' ? <IconButton name="volume" label={'Play ' + q.prompt} color={t.primaryInk} onPress={() => speak(q.prompt)} /> : null}
            </View>
            {q.hint ? <T size={13.5} tone="muted">{q.type === 'meaning' ? q.hint : 'Hint: ' + q.hint}</T> : null}

            {isTyped(q) ? (
              <Input key={i} value={a} onChangeText={setA} placeholder="Type your answer…" autoFocus autoCapitalize="none" autoCorrect={false}
                spellCheck={false} returnKeyType={last ? 'done' : 'next'} submitBehavior={last ? 'blurAndSubmit' : 'submit'}
                onSubmitEditing={() => (last ? handIn() : next())} editable={!sending} accessibilityLabel={'Answer to question ' + (i + 1)} />
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
            ? <Button title="Hand in" icon="check" size="lg" onPress={handIn} loading={sending} style={{ flex: 1.4 }} />
            : <Button title="Next" icon="right" size="lg" onPress={next} disabled={sending} style={{ flex: 1.4 }} />}
        </View>
      </KeyboardAvoidingView>
    );
  }

  /* ---------- intro ---------- */
  const d = c?.days.find((x) => x.day === day);
  const e = c?.enrollment;
  const lateDays = e ? Math.max(0, e.currentDay - day) : 0;
  const empty = hw && !hw.questions.length;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title={c?.title ?? title} />
      {(!c && !err) || (phase === 'loading' && d?.myScore != null) ? <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />
        : !c ? (
          <EmptyState icon="alert" tone="red" title="Couldn’t open this homework" text={err}>
            <Button title="Back" variant="secondary" onPress={() => router.back()} />
          </EmptyState>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: insets.bottom + 24 }}>
            <Card style={{ gap: 12, alignItems: 'center', padding: 24 }}>
              <IconTile name="listcheck" tone="indigo" size={56} />
              <T size={24} weight="extrabold" center style={{ letterSpacing: -0.4 }}>{title}</T>
              <T tone="muted" center>
                Answer questions about {d?.count ? 'the ' + d.count + ' words of this day' : 'this day’s words'}, plus a few review words from earlier days. Go back and forth freely, then hand in once.
              </T>
              <View style={{ alignSelf: 'stretch', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="clock" size={18} color={t.muted} />
                  <T size={13.5} tone="muted" style={{ flex: 1 }}>The timer starts when you tap Start. Faster time breaks ties on the leaderboard.</T>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="award" size={18} color={t.muted} />
                  <T size={13.5} tone="muted" style={{ flex: 1 }}>You can hand in only once.</T>
                </View>
              </View>
              {lateDays > 0 ? (
                <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: t.warningSoft }}>
                  <Icon name="alert" size={18} color={t.warning} />
                  <T size={13.5} weight="semibold" style={{ flex: 1, color: t.warning }}>
                    This homework is {lateDays + (lateDays === 1 ? ' day' : ' days')} late, so your score will be reduced. Hand it in on its own day for full marks.
                  </T>
                </View>
              ) : null}
              {err || empty ? (
                <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: t.dangerSoft }}>
                  <Icon name="alert" size={18} color={t.danger} />
                  <T size={13.5} weight="semibold" style={{ flex: 1, color: t.danger }}>{err || 'This day has no questions yet.'}</T>
                </View>
              ) : null}
              <Button title={err ? 'Try again' : 'Start homework'} icon={err ? 'refresh' : 'right'} size="lg" loading={phase === 'loading'} onPress={() => void start()} block />
            </Card>
          </ScrollView>
        )}
    </View>
  );
}
