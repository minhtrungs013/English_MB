import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ASK, isCorrect, isSentence, isTyped, Progress, scoreColors, TenseNote } from '../../../../components/course';
import { LearnTenseLink } from '../../../../components/grammar';
import { BackBar, Badge, Button, Card, EmptyState, Icon, IconButton, IconTile, Input, SectionTitle, T } from '../../../../components/ui';
import { api, type Warmup } from '../../../../lib/api';
import { speak } from '../../../../lib/speech';
import { DayStepper, FlowDoneScreen, FlowNext, useDayFlow } from '../../../../components/day-flow';
import { errMsg, useStore, useTheme } from '../../../../state/store';

type Phase = 'overview' | 'practice' | 'summary';
/** The learner's answer to one question, once checked. */
type Checked = { answer: string; correct: boolean };

export default function WarmupScreen() {
  const { id, day: dayParam, flow } = useLocalSearchParams<{ id: string; day: string; flow?: string }>();
  const day = Number(dayParam);
  const { actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [w, setW] = useState<Warmup | null>(null);
  const [err, setErr] = useState('');
  const [showVi, setShowVi] = useState(false);
  const [phase, setPhase] = useState<Phase>('overview');
  const [i, setI] = useState(0);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState<(Checked | null)[]>([]);
  const [skipping, setSkipping] = useState(false);
  /** Opened from the Today plan: part of the guided day flow. */
  const inFlow = flow === '1';
  const dayFlow = useDayFlow(id, day, inFlow);
  /** Skipped (or done without questions) in the flow: show what's next. */
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    let live = true;
    api.getWarmup(id, day).then((res) => { if (live) setW(res); }).catch((e) => { if (live) setErr(errMsg(e)); });
    return () => { live = false; };
  }, [id, day]);

  const title = 'Day ' + (dayParam ?? '') + ' review';
  if (!w) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title={title} />
        {err ? (
          <EmptyState icon="alert" tone="red" title="Couldn’t open the review" text={err}>
            <Button title="Back" variant="secondary" onPress={() => router.back()} />
          </EmptyState>
        ) : <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  const qs = w.questions;
  const n = qs.length;
  const startPractice = () => { setChecked(qs.map(() => null)); setI(0); setInput(''); setPhase('practice'); };
  /** Skipping (or finishing a review with no questions) also counts as done, so the course plan moves on. */
  const skip = async () => {
    setSkipping(true);
    const res = await actions.call(api.warmupDone(id, day));
    setSkipping(false);
    if (!res) return;
    if (inFlow) setSkipped(true); else router.back();
  };

  if (skipped) return <FlowDoneScreen title={title} flow={dayFlow} current="review" />;

  /* ---------- practice ---------- */
  if (phase === 'practice' && n) {
    const q = qs[i];
    const res = checked[i];
    const last = i === n - 1;
    const check = (a: string) => {
      if (res || !a.trim()) return;
      const r = { answer: a, correct: isCorrect(a, q.answer, q.accept) };
      setChecked((prev) => prev.map((x, k) => (k === i ? r : x)));
    };
    const next = () => {
      if (!last) { setI(i + 1); setInput(''); return; }
      setPhase('summary');
      // Not graded: the result only marks today's review as done. A failure just shows a toast.
      void actions.call(api.warmupDone(id, day, { correct: checked.filter((x) => x?.correct).length, total: n }));
    };
    const typed = isTyped(q);
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 + insets.top }}>
          <IconButton name="x" label="Stop practice" onPress={() => setPhase('overview')} />
          <View style={{ flex: 1 }}><Progress pct={((i + (res ? 1 : 0)) / n) * 100} height={8} /></View>
          <T size={14} weight="bold" tone="muted" style={{ paddingHorizontal: 8 }}>{i + 1} / {n}</T>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: 14, padding: 20, borderRadius: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T size={13} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8, flex: 1 }}>Question {i + 1} of {n}</T>
              <Badge label="Not graded" bg={t.surface2} fg={t.muted} />
            </View>
            <T size={14} weight="bold" tone="muted">{ASK[q.type] ?? ''}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T size={isSentence(q) ? 19 : 24} weight="extrabold" style={{ flex: 1, letterSpacing: isSentence(q) ? 0 : -0.4 }}>{q.prompt}</T>
              {q.type === 'meaning' ? <IconButton name="volume" label={'Play ' + q.prompt} color={t.primaryInk} onPress={() => speak(q.prompt)} /> : null}
            </View>
            {q.hint ? <T size={13.5} tone="muted">{q.type === 'meaning' ? q.hint : 'Hint: ' + q.hint}</T> : null}

            {typed ? (
              <Input key={i} value={res ? res.answer : input} onChangeText={setInput} placeholder="Type your answer…" autoFocus autoCapitalize="none" autoCorrect={false}
                spellCheck={false} returnKeyType="done" submitBehavior="blurAndSubmit" editable={!res} invalid={!!res && !res.correct}
                onSubmitEditing={() => check(input)} accessibilityLabel={'Answer to question ' + (i + 1)} />
            ) : (
              <View style={{ gap: 10 }} accessibilityRole="radiogroup">
                {q.choices.map((o, k) => {
                  const picked = res?.answer === o;
                  const right = !!res && isCorrect(o, q.answer, q.accept);
                  const border = right ? t.success : picked ? t.danger : t.border;
                  const bg = right ? t.successSoft : picked ? t.dangerSoft : t.surface;
                  return (
                    <Pressable key={k} onPress={() => check(o)} disabled={!!res} accessibilityRole="radio" accessibilityState={{ checked: picked, disabled: !!res }}
                      accessibilityLabel={'Choice ' + 'ABCD'.charAt(k) + ': ' + o + (right ? ', correct answer' : picked ? ', your answer, wrong' : '')}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, padding: 12, borderRadius: 12, borderWidth: 1.5,
                        borderColor: border, backgroundColor: !res && pressed ? t.surface2 : bg })}>
                      <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: right ? t.success : picked ? t.danger : t.surface2 }}>
                        <T size={13} weight="extrabold" style={{ color: right || picked ? '#fff' : t.muted }}>{'ABCD'.charAt(k) || String(k + 1)}</T>
                      </View>
                      <T weight="semibold" style={{ flex: 1, color: right ? t.success : picked ? t.danger : t.text }}>{o}</T>
                      {right ? <Icon name="checkc" size={18} color={t.success} /> : picked ? <Icon name="x" size={18} color={t.danger} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {res ? (
              <View style={{ gap: 8 }} accessibilityLiveRegion="polite">
                <View accessible accessibilityLabel={res.correct ? 'Correct' : 'Not quite. Correct answer: ' + q.answer}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: res.correct ? t.successSoft : t.dangerSoft }}>
                  <Icon name={res.correct ? 'checkc' : 'alert'} size={20} color={res.correct ? t.success : t.danger} />
                  <View style={{ flex: 1 }}>
                    <T weight="extrabold" style={{ color: res.correct ? t.success : t.danger }}>{res.correct ? 'Correct!' : 'Not quite'}</T>
                    {!res.correct ? <T size={13.5} weight="semibold" style={{ color: t.text }}>Correct answer: {q.answer}</T> : null}
                  </View>
                </View>
                <TenseNote label={q.tenseLabel} explain={q.explain} />
                <LearnTenseLink tense={q.tense} />
              </View>
            ) : null}
          </Card>
        </ScrollView>
        <View style={{ padding: 12, paddingBottom: insets.bottom + 12, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }}>
          {res
            ? <Button title={last ? 'See summary' : 'Next'} icon="right" size="lg" onPress={next} block />
            : typed
              ? <Button title="Check" icon="check" size="lg" onPress={() => check(input)} disabled={!input.trim()} block />
              : <Button title="Skip" variant="secondary" size="lg" onPress={() => { setChecked((prev) => prev.map((x, k) => (k === i ? { answer: '', correct: false } : x))); }} block />}
        </View>
      </KeyboardAvoidingView>
    );
  }

  /* ---------- summary ---------- */
  if (phase === 'summary' && n) {
    const right = checked.filter((x) => x?.correct).length;
    const pct = Math.round((right / n) * 100);
    const [sBg, sFg] = scoreColors(pct, t);
    const missed = qs.map((q, k) => ({ q, r: checked[k] })).filter((x) => !x.r?.correct);
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title={title} />
        {inFlow ? <DayStepper flow={dayFlow} current="review" currentDone /> : null}
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: insets.bottom + 24 }}>
          <Card style={{ alignItems: 'center', gap: 8, padding: 24 }}>
            <SectionTitle>Review done</SectionTitle>
            <View accessible accessibilityLabel={right + ' of ' + n + ' correct'}
              style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: sBg, alignItems: 'center', justifyContent: 'center' }}>
              <T size={34} weight="extrabold" style={{ color: sFg, lineHeight: 42 }}>{right}/{n}</T>
            </View>
            <T size={20} weight="extrabold" center>{pct >= 80 ? 'You’re ready!' : pct >= 50 ? 'Good review!' : 'Worth another look'}</T>
            <T tone="muted" center>This practice isn’t graded. Next, learn today’s words.</T>
          </Card>
          {inFlow ? <FlowNext flow={dayFlow} current="review" /> : <Button title="Continue" icon="right" size="lg" onPress={() => router.back()} block />}
          <Button title="Practice again" icon="refresh" variant="secondary" onPress={startPractice} block />
          {missed.length ? <SectionTitle style={{ marginTop: 4 }}>To review</SectionTitle> : null}
          {missed.map(({ q, r }, k) => (
            <View key={k} style={{ backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 }}>
              <View accessible style={{ gap: 6 }}
                accessibilityLabel={q.prompt + '. Correct answer: ' + q.answer + (r?.answer ? '. Your answer: ' + r.answer : '') + (q.tenseLabel ? '. ' + q.tenseLabel : '')}>
                <T weight="bold">{q.prompt}</T>
                {r?.answer ? <T size={13.5} weight="semibold" tone="danger">Your answer: {r.answer}</T> : null}
                <T size={13.5} weight="semibold" tone="success">Correct: {q.answer}</T>
                <TenseNote label={q.tenseLabel} explain={q.explain} />
              </View>
              {/* Outside the summary above, so screen readers can reach it. */}
              <LearnTenseLink tense={q.tense} />
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  /* ---------- overview ---------- */
  const empty = !w.recap && !w.words.length && !n;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title={title} />
      {inFlow ? <DayStepper flow={dayFlow} current="review" /> : null}
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: insets.bottom + 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconTile name="zap" tone="amber" size={52} />
          <View style={{ flex: 1 }}>
            <T size={22} weight="extrabold" style={{ letterSpacing: -0.4 }}>Review old lessons</T>
            <T size={13} tone="muted">Refresh earlier words before today’s new words. Not graded.</T>
          </View>
        </View>

        {empty ? <EmptyState icon="zap" title="Nothing to review yet" text="There are no earlier words to review for this day." /> : null}

        {w.recap ? (
          <Card style={{ gap: 10 }}>
            <SectionTitle>Recap story</SectionTitle>
            <T size={15.5} style={{ lineHeight: 24 }}>{w.recap.text}</T>
            {showVi && w.recap.vi ? (
              <View style={{ borderRadius: 10, padding: 12, backgroundColor: t.surface2 }}>
                <T size={14} tone="muted" style={{ lineHeight: 22 }}>{w.recap.vi}</T>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Listen" icon="volume" variant="secondary" size="sm" style={{ minHeight: 44 }} accessibilityLabel="Listen to the story" onPress={() => speak(w.recap?.text ?? '')} />
              {w.recap.vi
                ? <Button title={showVi ? 'Hide translation' : 'Show translation'} icon="globe" variant="secondary" size="sm" style={{ minHeight: 44 }} onPress={() => setShowVi(!showVi)} />
                : null}
            </View>
          </Card>
        ) : null}

        {w.words.length ? <SectionTitle style={{ marginTop: 4 }}>Words to remember · {w.words.length}</SectionTitle> : null}
        {w.words.map((x) => (
          <View key={x.word} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: x.missed ? t.warningSoft : t.surface, borderColor: x.missed ? t.warning : t.border, borderWidth: 1, borderRadius: 14, paddingLeft: 14, paddingRight: 4, paddingVertical: 10 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <T size={16} weight="extrabold">{x.word}</T>
                {x.ipa ? <T ipa size={13} tone="muted">{x.ipa}</T> : null}
                {x.missed ? <Badge label={'missed ' + x.missed + '×'} bg={t.warning} fg={t.dark ? '#1C1F2A' : '#fff'} /> : null}
              </View>
              {x.vi ? <T size={14} weight="semibold">{x.vi}</T> : null}
              {x.meaning ? <T size={13} tone="muted">{x.meaning}</T> : null}
            </View>
            <IconButton name="volume" label={'Play ' + x.word} color={t.primaryInk} onPress={() => speak(x.word)} />
          </View>
        ))}

        {n ? (
          <Button title={'Practice ' + n + (n === 1 ? ' question' : ' questions')} icon="right" size="lg" onPress={startPractice} block style={{ marginTop: 4 }} />
        ) : null}
        {n
          ? <Button title="Skip review" variant="ghost" loading={skipping} onPress={() => void skip()} block />
          : <Button title="Done reviewing" icon="check" size="lg" loading={skipping} onPress={() => void skip()} block style={{ marginTop: 4 }} />}
      </ScrollView>
    </View>
  );
}
