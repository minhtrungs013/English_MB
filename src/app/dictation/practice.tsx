import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Progress, scoreColors } from '../../components/course';
import {
  DICTATION_N, GradeLegend, GradeTokens, HINT_TITLE, hintText, MAX_TYPED, MINE, myWordsItems, PlayButtons
} from '../../components/dictation';
import { masteryColors } from '../../components/grammar';
import { BackBar, Badge, Button, Card, EmptyState, Icon, IconButton, Input, SectionTitle, T } from '../../components/ui';
import { api, type DictationGrade, type DictationQuestion, type DictationSentence } from '../../lib/api';
import { speak, speakThen, stopSpeaking } from '../../lib/speech';
import { errMsg, useStore, useTheme } from '../../state/store';

type Phase = 'loading' | 'error' | 'quiz' | 'summary';
const MODE_TITLE: Record<string, string> = { [MINE]: 'From my words', daily: 'Today’s dictation', mix: 'Mixed dictation' };

/** One checked item, as shown in the feedback and the summary. */
interface Checked { passed: boolean; score: number; sentences: DictationSentence[]; grades: DictationGrade[]; title?: string }
/** What the learner did on one item: typed text (one per sentence), plays, hints and the last check. */
interface Entry { typed: string[]; plays: number; hints: number; result: Checked | null }

const sentencesOf = (q: DictationQuestion): DictationSentence[] => (q.kind === 'passage' ? q.sentences : [{ text: q.text, vi: q.vi }]);
const emptyEntry = (q: DictationQuestion): Entry => ({ typed: sentencesOf(q).map(() => ''), plays: 0, hints: 0, result: null });
const spokenText = (q: DictationQuestion) => sentencesOf(q).map((s) => s.text).join(' ');

/** Confirms before leaving midway (close button and the Android back button). */
function useLeave(active: boolean, mine: boolean): () => void {
  const leave = useCallback(() => {
    if (!active) { stopSpeaking(); router.back(); return; }
    Alert.alert('Leave the dictation?', mine ? 'Your progress in this round will be lost.' : 'Items you’ve checked are saved; the rest of this round isn’t.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => { stopSpeaking(); router.back(); } }
    ]);
  }, [active, mine]);
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { leave(); return true; });
    return () => sub.remove();
  }, [active, leave]);
  return leave;
}

/** Feedback after Check: the colored words, the full sentence + Vietnamese, the score. */
function Feedback({ r }: { r: Checked }) {
  const t = useTheme();
  const [bg, fg] = scoreColors(r.score, t);
  return (
    <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={r.passed ? 'checkc' : 'alert'} size={20} color={r.passed ? t.success : t.danger} />
        <T size={16} weight="extrabold" style={{ flex: 1, color: r.passed ? t.success : t.danger }}>{r.passed ? 'Passed!' : 'Not quite'}</T>
        <Badge label={'Score ' + r.score + '%'} bg={bg} fg={fg} />
      </View>
      {r.sentences.map((s, k) => (
        <View key={k} style={{ gap: 6, paddingTop: k ? 10 : 0, borderTopWidth: k ? 1 : 0, borderTopColor: t.border }}>
          {r.sentences.length > 1 ? <T size={12.5} weight="extrabold" tone="muted">Sentence {k + 1}</T> : null}
          {r.grades[k] ? <GradeTokens g={r.grades[k]} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, padding: 10, borderRadius: 10, backgroundColor: t.surface2 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T weight="bold">{s.text}</T>
              {s.vi ? <T size={13.5} tone="muted">{s.vi}</T> : null}
            </View>
            <IconButton name="volume" label={'Play again: ' + s.text} color={t.primaryInk} onPress={() => speak(s.text)} />
          </View>
        </View>
      ))}
      <GradeLegend />
    </View>
  );
}

export default function DictationPracticeScreen() {
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const mode = modeParam || 'daily';
  const mine = mode === MINE;
  const { data, actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<DictationQuestion[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [err, setErr] = useState('');
  const [checking, setChecking] = useState(false);
  const [playingAll, setPlayingAll] = useState(false);
  /** Set names and mastery before this round, and the newest mastery from the server. */
  const [before, setBefore] = useState<Record<string, { name: string; mastery: number }>>({});
  const [mastery, setMastery] = useState<Record<string, number>>({});
  const [title, setTitle] = useState(MODE_TITLE[mode] ?? 'Dictation');
  const inputs = useRef<(TextInput | null)[]>([]);
  /** Bumped to cancel a "Play all" in progress. */
  const playRun = useRef(0);
  /** My words, read when a round starts (editing a word doesn't restart the round). */
  const wordsRef = useRef(data.words);
  /** From my words: question id → its bank sentence key, marked practised after checking. */
  const keys = useRef(new Map<string, string>());
  useEffect(() => { wordsRef.current = data.words; }, [data.words]);

  const start = useCallback(async () => {
    setPhase('loading'); setErr(''); setMastery({}); setI(0);
    try {
      let qs: DictationQuestion[];
      if (mine) {
        const r = await api.practiceSentences('dictation', DICTATION_N).catch(() => null);
        keys.current = new Map();
        const fromBank: DictationQuestion[] = (r?.items ?? []).map((x, k) => {
          const id = MINE + ':' + k + ':' + x.wordId;
          keys.current.set(id, x.key);
          return { id, kind: 'line', level: 'easy', text: x.sentence, vi: x.word + (x.vi ? ' — ' + x.vi : '') };
        });
        qs = fromBank.length >= 3 ? fromBank : myWordsItems(wordsRef.current);
        if (!qs.length) throw new Error('Add words with example sentences first.');
      } else {
        const [p, list] = await Promise.all([api.dictationPractice(mode, mode === 'passages' ? 3 : DICTATION_N), api.dictation().catch(() => null)]);
        const b: Record<string, { name: string; mastery: number }> = {};
        for (const s of list?.sets ?? []) b[s.id] = { name: s.name, mastery: s.mastery };
        setBefore(b);
        if (b[mode]) setTitle(b[mode].name);
        qs = p.items;
        if (!qs.length) throw new Error(mode === 'daily' ? 'There’s nothing to practise today yet.' : 'This set has no items yet.');
      }
      setItems(qs); setEntries(qs.map(emptyEntry)); setPhase('quiz');
    } catch (e) {
      setErr(errMsg(e)); setPhase('error');
    }
  }, [mine, mode]);
  useEffect(() => { void start(); }, [start]);
  useEffect(() => () => { playRun.current++; stopSpeaking(); }, []);

  const active = phase === 'quiz' && entries.some((e) => e.result || e.typed.some((x) => x.trim()));
  const leave = useLeave(active, mine);

  const q = items[i];
  const e = entries[i];
  const setE = (p: Partial<Entry>) => setEntries((prev) => prev.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const addPlay = () => setEntries((prev) => prev.map((x, k) => (k === i ? { ...x, plays: x.plays + 1 } : x)));

  const stopAll = () => { playRun.current++; setPlayingAll(false); };
  const play = (text: string, factor: number) => { stopAll(); addPlay(); speak(text, factor); };
  const playAll = () => {
    if (!q || q.kind !== 'passage') return;
    if (playingAll) { stopAll(); stopSpeaking(); return; }
    const run = ++playRun.current;
    addPlay(); setPlayingAll(true);
    const next = (k: number) => {
      if (run !== playRun.current) return;
      if (k >= q.sentences.length) { setPlayingAll(false); return; }
      speakThen(q.sentences[k].text, (finished) => {
        if (run !== playRun.current) return;
        if (finished) next(k + 1); else setPlayingAll(false);
      });
    };
    next(0);
  };

  const addHint = () => {
    if (!e || e.hints >= 3) return;
    if (e.hints === 2) {
      Alert.alert('Show the answer?', 'This item will count as not passed.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Show answer', onPress: () => setE({ hints: 3 }) }
      ]);
      return;
    }
    setE({ hints: e.hints + 1 });
  };

  const send = async () => {
    if (!q || !e) return;
    setChecking(true);
    try {
      let r: Checked;
      const typed = e.typed.map((x) => x.trim().slice(0, MAX_TYPED));
      if (mine && q.kind === 'line') {
        const res = await api.gradeDictation([{ text: q.text, typed: typed[0] ?? '' }]);
        const g = res.results[0];
        r = { passed: !!g?.passed && e.hints < 3, score: g?.score ?? 0, sentences: sentencesOf(q), grades: g ? [g] : [] };
        const key = keys.current.get(q.id);
        if (key) void api.practiceSeen([{ key, ok: r.passed }]).catch(() => undefined);
      } else {
        const res = await api.submitDictation([{
          id: q.id, ...(q.kind === 'passage' ? { typedSentences: typed } : { typed: typed[0] ?? '' }), plays: Math.min(50, e.plays), hints: e.hints
        }]);
        const x = res.results[0];
        if (!x) throw new Error('The server didn’t grade this item. Try again.');
        const sentences = x.sentences?.map((s) => ({ text: s.text, vi: s.vi })) ?? (x.text != null ? [{ text: x.text, vi: x.vi ?? '' }] : sentencesOf(q));
        r = { passed: x.passed, score: x.score, sentences, grades: x.grade ? [x.grade] : (x.sentences ?? []).map((s) => s.grade), title: x.title };
        setMastery((m) => ({ ...m, ...res.mastery }));
      }
      stopAll();
      setE({ result: r });
    } catch (ex) {
      actions.showToast(errMsg(ex), 'bad');
    } finally {
      setChecking(false);
    }
  };
  const check = () => {
    if (!e || checking || e.result) return;
    if (e.typed.every((x) => !x.trim())) {
      Alert.alert('Check without typing?', 'An empty answer counts as not passed.', [
        { text: 'Keep typing', style: 'cancel' },
        { text: 'Check', onPress: () => void send() }
      ]);
      return;
    }
    void send();
  };
  const tryAgain = () => { setE({ typed: e ? e.typed.map(() => '') : [''], result: null }); setTimeout(() => inputs.current[0]?.focus(), 50); };
  const next = () => {
    stopAll(); stopSpeaking();
    if (i < items.length - 1) setI(i + 1);
    else setPhase('summary');
  };

  /* ---------- summary ---------- */
  if (phase === 'summary') {
    const done = entries.map((x, k) => ({ x, q: items[k] })).filter((r) => r.x.result);
    const passed = done.filter((r) => r.x.result?.passed).length;
    const avg = done.length ? Math.round(done.reduce((s, r) => s + (r.x.result?.score ?? 0), 0) / done.length) : 0;
    const [sBg, sFg] = scoreColors(avg, t);
    const changes = Object.entries(mastery).map(([id, now]) => ({ id, now, was: before[id]?.mastery, name: before[id]?.name ?? id }));
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title={title} />
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: insets.bottom + 24 }}>
          <Card style={{ alignItems: 'center', gap: 8, padding: 24 }}>
            <SectionTitle>Passed</SectionTitle>
            <View accessible accessibilityLabel={'Passed ' + passed + ' of ' + items.length + '. Average score ' + avg + '%'}
              style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: sBg, alignItems: 'center', justifyContent: 'center' }}>
              <T size={34} weight="extrabold" style={{ color: sFg, lineHeight: 42 }}>{passed}/{items.length}</T>
            </View>
            <T size={20} weight="extrabold" center>{avg >= 80 ? 'Great listening!' : avg >= 50 ? 'Nice work!' : 'Keep practising!'}</T>
            <T tone="muted" center>Average score {avg}%</T>
          </Card>

          {changes.length ? (
            <Card style={{ gap: 10 }}>
              <SectionTitle>Mastery</SectionTitle>
              {changes.map((c) => {
                const [, fg] = masteryColors(c.now, t);
                const diff = c.was == null ? 0 : c.now - c.was;
                return (
                  <View key={c.id} accessible accessibilityLabel={c.name + ' mastery ' + (c.was == null ? '' : 'from ' + c.was + '% ') + 'to ' + c.now + '%'} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <T weight="bold" style={{ flex: 1 }} numberOfLines={1}>{c.name}</T>
                      <T size={14} weight="extrabold" style={{ color: fg }}>{c.was == null ? c.now + '%' : c.was + '% → ' + c.now + '%'}</T>
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

          <SectionTitle style={{ marginTop: 4 }}>Items</SectionTitle>
          {items.map((it, k) => {
            const r = entries[k]?.result;
            const label = it.kind === 'passage' ? it.title : it.text;
            return (
              <View key={it.id + k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.surface, borderColor: r?.passed ? t.border : t.danger, borderWidth: 1, borderRadius: 14, padding: 12 }}>
                <View accessible accessibilityLabel={'Item ' + (k + 1) + ', ' + (r ? (r.passed ? 'passed' : 'not passed') + ', score ' + r.score + '%' : 'not checked') + '. ' + label} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <T size={18} weight="extrabold" style={{ color: r?.passed ? t.success : t.danger }}>{r?.passed ? '✓' : '✗'}</T>
                  <View style={{ flex: 1 }}>
                    <T weight="semibold" numberOfLines={2}>{label}</T>
                    <T size={12.5} tone="muted">{r ? 'Score ' + r.score + '%' : 'Not checked'}</T>
                  </View>
                </View>
                <IconButton name="volume" label={'Play item ' + (k + 1) + ' again'} color={t.primaryInk} onPress={() => speak(spokenText(it))} />
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  /* ---------- one item ---------- */
  if (phase === 'quiz' && q && e) {
    const n = items.length;
    const sentences = sentencesOf(q);
    const r = e.result;
    const last = i === n - 1;
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 + insets.top }}>
          <IconButton name="x" label="Leave dictation" onPress={leave} />
          <View style={{ flex: 1 }}><Progress pct={((i + 1) / n) * 100} height={8} /></View>
          <T size={14} weight="bold" tone="muted" style={{ paddingHorizontal: 8 }} >{i + 1} / {n}</T>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 14 }} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: 14, padding: 20, borderRadius: 22 }}>
            <T size={13} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>{title} · item {i + 1} of {n}</T>
            {q.kind === 'passage' ? <T size={18} weight="extrabold">{q.title}</T> : null}
            <T size={14} weight="bold" tone="muted">
              {q.kind === 'passage' ? 'Listen to each sentence and type what you hear.' : 'Listen and type what you hear.'}
            </T>
            {q.kind === 'line' && q.focus ? <T size={13} tone="primaryInk" weight="semibold">Listen for: {q.focus}</T> : null}

            {q.kind === 'line' ? (
              <PlayButtons big what="the sentence" onPlay={(f) => play(q.text, f)} />
            ) : (
              <Button title={playingAll ? 'Stop' : 'Play all'} icon={playingAll ? 'x' : 'volume'} size="lg" block
                accessibilityLabel={playingAll ? 'Stop playing' : 'Play all sentences in order'} onPress={playAll} />
            )}
            <View accessibilityLiveRegion="polite"><T size={12.5} tone="muted" center>{e.plays ? 'Played ' + e.plays + '×' : 'Tap play to listen'}</T></View>

            {sentences.map((s, k) => (
              <View key={i + '-' + k} style={{ gap: 6 }}>
                {q.kind === 'passage' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <T size={13.5} weight="extrabold" style={{ flex: 1 }}>Sentence {k + 1}</T>
                    <PlayButtons what={'sentence ' + (k + 1)} onPlay={(f) => play(s.text, f)} />
                  </View>
                ) : null}
                {e.hints && !r ? (
                  <View accessible accessibilityLabel={'Hint: ' + HINT_TITLE[e.hints] + '. ' + (e.hints === 1 ? s.text.trim().split(/\s+/).length + ' words' : hintText(s.text, e.hints))}
                    style={{ padding: 10, borderRadius: 10, backgroundColor: t.warningSoft }}>
                    <T size={15} weight="bold" style={{ color: t.warning, letterSpacing: e.hints < 3 ? 1 : 0 }}>{hintText(s.text, e.hints)}</T>
                  </View>
                ) : null}
                <Input ref={(el) => { inputs.current[k] = el; }} value={e.typed[k] ?? ''} multiline maxLength={MAX_TYPED}
                  onChangeText={(v) => setE({ typed: e.typed.map((x, j) => (j === k ? v : x)) })}
                  placeholder={q.kind === 'passage' ? 'Type sentence ' + (k + 1) + '…' : 'Type what you hear…'}
                  autoCorrect={false} autoCapitalize="none" spellCheck={false} autoComplete="off"
                  returnKeyType={k < sentences.length - 1 ? 'next' : 'done'} submitBehavior={k < sentences.length - 1 ? 'submit' : 'blurAndSubmit'}
                  onSubmitEditing={() => (k < sentences.length - 1 ? inputs.current[k + 1]?.focus() : check())}
                  editable={!r && !checking} accessibilityLabel={q.kind === 'passage' ? 'Your answer for sentence ' + (k + 1) : 'Your answer'} />
              </View>
            ))}

            {!r ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Button title={e.hints >= 3 ? 'Answer shown' : 'Hint ' + (e.hints + 1) + '/3'} icon="sparkle" variant="secondary" size="sm"
                  accessibilityLabel={e.hints >= 3 ? 'Answer shown' : 'Hint ' + (e.hints + 1) + ' of 3: ' + HINT_TITLE[e.hints + 1]}
                  onPress={addHint} disabled={e.hints >= 3 || checking} style={{ minHeight: 44 }} />
                <T size={12} tone="muted" style={{ flex: 1 }}>{e.hints < 3 ? 'Next: ' + HINT_TITLE[e.hints + 1].toLowerCase() : 'This item counts as not passed.'}</T>
              </View>
            ) : null}
          </Card>

          {r ? <Card style={{ padding: 18 }}><Feedback r={r} /></Card> : null}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10, padding: 12, paddingBottom: insets.bottom + 12, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }}>
          {r ? (
            <>
              <Button title="Try again" icon="refresh" variant="secondary" size="lg" onPress={tryAgain} style={{ flex: 1 }} />
              <Button title={last ? 'See results' : 'Next'} icon="right" size="lg" onPress={next} style={{ flex: 1.4 }} />
            </>
          ) : <Button title="Check" icon="check" size="lg" onPress={check} loading={checking} style={{ flex: 1 }} />}
        </View>
      </KeyboardAvoidingView>
    );
  }

  /* ---------- loading / error ---------- */
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title={title} />
      {phase === 'error' ? (
        <EmptyState icon="alert" tone="red" title="Couldn’t start the dictation" text={err}>
          <View style={{ gap: 10, alignSelf: 'stretch' }}>
            {!mine ? <Button title="Try again" icon="refresh" onPress={() => void start()} block /> : null}
            <Button title="Back" variant="ghost" onPress={() => router.back()} block />
          </View>
        </EmptyState>
      ) : <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />}
    </View>
  );
}
