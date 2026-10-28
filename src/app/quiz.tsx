import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SentenceGrammar } from '../components/sentence-grammar';
import { Badge, Button, Card, EmptyState, Icon, IconButton, Input, T } from '../components/ui';
import { api, type GrammarView, type PracticeSentence, type PracticeWordMode } from '../lib/api';
import { cap1, low1, shuffle, type Word } from '../lib/data';
import { normWord, oneOff, orderWords, recordAnswer, recordsFor, sameMeaning } from '../lib/practice';
import { speak, stopSpeaking } from '../lib/speech';
import { isWordformCorrect, pickWordform, type WordformQuestion } from '../lib/wordform';
import { useStore, useTheme } from '../state/store';

type Mode = 'mc' | 'fill' | 'trans' | 'listen' | 'wordform' | 'tense';
interface Q {
  id: string; opts?: string[]; ans?: number; before?: string; after?: string; answer: string; wf?: WordformQuestion;
  /** Sentence practice (fill / tense): the sentence's key (marked practised) and its grammar. */
  key?: string; grammar?: GrammarView | null;
  /** tense: the sentence with "___ (base)" and other accepted answers. */
  prompt?: string; accept?: string[];
  /** Weak-words sessions: the mode this question is asked in, and the one its answer counts for (dictation → asked by listening). */
  mode?: Mode; rec?: PracticeWordMode;
  /** retry: asked again at the end because I got it wrong · shown: the word was shown to me (right meaning, other word). */
  retry?: boolean; shown?: boolean;
}
const TITLES: Record<Mode | 'weak', string> = { mc: 'Multiple Choice', fill: 'Fill in the Blank', trans: 'Translation', listen: 'Listening', wordform: 'Word forms', tense: 'Verb tenses', weak: 'Words to fix' };
const MODES: (Mode | 'weak')[] = ['mc', 'fill', 'trans', 'listen', 'wordform', 'tense', 'weak'];
const norm = (x: string) => x.toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ').trim();

/** Bank sentences (fill / tense) as questions. */
function sentenceQuestions(mode: 'fill' | 'tense', items: PracticeSentence[]): Q[] {
  if (mode === 'fill') {
    return items.flatMap((x): Q[] => {
      const k = x.form ? x.sentence.toLowerCase().indexOf(x.form.toLowerCase()) : -1;
      return k < 0 ? [] : [{ id: x.wordId, before: x.sentence.slice(0, k), after: x.sentence.slice(k + x.form!.length), answer: x.sentence.slice(k, k + x.form!.length), key: x.key, grammar: x.grammar }];
    });
  }
  return items.flatMap((x, i): Q[] => {
    const q = x.question;
    if (!q) return [];
    // About half multiple choice (where the verb has choices), the rest typed.
    const choice = q.choices.length === 4 && i % 2 === 1;
    return [{ id: x.wordId, prompt: choice ? q.prompt.replace(/\s*\([^)]*\)/, '') : q.prompt, answer: q.answer, accept: q.accept, key: x.key, grammar: x.grammar,
      ...(choice ? { opts: q.choices, ans: q.choices.indexOf(q.answer) } : {}) }];
  });
}

/** A question about word w in a mode built here (not from the server), or null when w can't be asked that way. */
function localQuestion(mode: Mode, w: Word, ws: Word[]): Q | null {
  if (mode === 'mc') {
    const others = shuffle(ws.filter((o) => o.id !== w.id && o.meaning && o.meaning !== w.meaning)).slice(0, 3).map((o) => o.meaning);
    if (!w.meaning || others.length < 3) return null;
    const opts = shuffle([w.meaning, ...others]);
    return { id: w.id, opts, ans: opts.indexOf(w.meaning), answer: w.word };
  }
  if (mode === 'fill') {
    const k = w.ex ? w.ex.toLowerCase().indexOf(w.word.toLowerCase()) : -1;
    return k < 0 ? null : { id: w.id, before: w.ex.slice(0, k), after: w.ex.slice(k + w.word.length), answer: w.word };
  }
  if (mode === 'wordform') {
    // A random usable member of its family.
    const wf = pickWordform(w.family);
    return wf ? { id: w.id, answer: wf.answer, wf } : null;
  }
  if (mode === 'trans') return w.vi ? { id: w.id, answer: w.word } : null;
  if (mode === 'listen') return { id: w.id, answer: w.word };
  return null;
}

/**
 * A session's questions. Fill and tenses: sentences from the server (my weak words first, then the ones practised longest
 * ago; fill falls back to my own examples). The others: my weak words in this mode first (up to 40%), then the words I
 * haven't practised for the longest time. weak: the words I keep getting wrong, each asked the way I got it wrong.
 */
async function loadQuestions(mode: Mode | 'weak', ws: Word[], n: number): Promise<Q[]> {
  if (mode === 'weak') {
    const st = await api.practiceStats().catch(() => null);
    if (!st) return [];
    const plan = st.weak.slice(0, n).map((x) => ({ w: ws.find((y) => y.id === x.wordId), mode: x.modes[0].mode })).filter((x): x is { w: Word; mode: PracticeWordMode } => !!x.w);
    const out: Q[] = [];
    for (const m of ['fill', 'tense'] as const) {
      const ids = plan.filter((x) => x.mode === m).map((x) => x.w.id);
      if (!ids.length) continue;
      const r = await api.practiceSentences(m, ids.length, ids).catch(() => null);
      const got = sentenceQuestions(m, r?.items ?? []).map((q) => ({ ...q, mode: m }));
      out.push(...got);
      // No sentence for some of them: ask by listening instead (still counted for the mode they're weak in).
      for (const id of ids.filter((x) => !got.some((q) => q.id === x))) out.push({ id, answer: ws.find((y) => y.id === id)!.word, mode: 'listen', rec: m });
    }
    for (const { w, mode: m } of plan) {
      if (m === 'fill' || m === 'tense') continue;
      const asked: Mode = m === 'dictation' ? 'listen' : m;
      const q = localQuestion(asked, w, ws);
      out.push(q ? { ...q, mode: asked, rec: m } : { id: w.id, answer: w.word, mode: 'listen', rec: m });
    }
    return shuffle(out);
  }
  if (mode === 'fill' || mode === 'tense') {
    const r = await api.practiceSentences(mode, n).catch(() => null);
    const qs = r ? sentenceQuestions(mode, r.items) : [];
    if (qs.length || mode === 'tense') return qs;
  }
  const recs = recordsFor(await api.practiceStats().catch(() => null), mode);
  return orderWords(ws, (w) => w.id, recs, n).flatMap((w) => { const q = localQuestion(mode, w, ws); return q ? [q] : []; }).slice(0, n);
}

/** "We ___ (fix) it" with the gap shown as a line, or filled after checking. */
function Blanked({ prompt, fill }: { prompt: string; fill: string }) {
  const m = /_{3,}/.exec(prompt);
  if (!m) return <T size={21} weight="extrabold">{prompt}</T>;
  return (
    <T size={21} weight="extrabold" style={{ lineHeight: 32 }}>
      {prompt.slice(0, m.index)}<T size={21} weight="extrabold" tone="primaryInk" style={{ textDecorationLine: 'underline' }}>{fill || ' ______ '}</T>{prompt.slice(m.index + m[0].length)}
    </T>
  );
}

export default function Quiz() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = (MODES.includes(params.mode as Mode) ? params.mode : 'mc') as Mode | 'weak';
  const { data } = useStore();
  const perSession = Number(data.settings.goal) || 20;
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [qs, setQs] = useState<Q[] | null>(null);
  const load = () => { setQs(null); void loadQuestions(mode, data.words, perSession).then(setQs); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [score, setScore] = useState(0);
  /** Retries answered right. */
  const [fixed, setFixed] = useState(0);
  const [done, setDone] = useState(false);
  /** A message about the last answer: almost right (spelling), or right meaning but another word. */
  const [note, setNote] = useState('');

  const n = qs?.length ?? 0;
  const q = qs?.[Math.min(i, Math.max(0, n - 1))];
  const w = q ? data.words.find((x) => x.id === q.id) : undefined;
  /** The mode this question is asked in (a weak-words session mixes them) and the one its answer counts for. */
  const qm: Mode = q?.mode ?? (mode === 'weak' ? 'listen' : mode);
  const rec: PracticeWordMode = q?.rec ?? qm;
  /** Questions in the session before the retries were added (the score counts these). */
  const first = (qs ?? []).filter((x) => !x.retry).length;
  const retries = (qs ?? []).filter((x) => x.retry).length;

  useEffect(() => {
    if (qm !== 'listen' || done || !q) return;
    const id = setTimeout(() => speak(q.answer), 300);
    return () => clearTimeout(id);
  }, [qm, i, done, q]);
  useEffect(() => () => stopSpeaking(), []);

  const close = () => { stopSpeaking(); router.back(); };
  /** Counts an answer: score on the first try only (a retry or a revealed word doesn't add to it); stats every time. */
  const answered = (cur: Q, ok: boolean, spelling = false) => {
    if (!cur.shown) recordAnswer(cur.id, rec, ok, spelling);
    if (cur.key) void api.practiceSeen([{ key: cur.key, ok }]).catch(() => undefined);
    if (ok && !cur.retry && !cur.shown) setScore((x) => x + 1);
    if (ok && cur.retry) setFixed((x) => x + 1);
  };
  const pick = (idx: number) => {
    if (checked || !q) return;
    const ok = idx === q.ans;
    setPicked(idx); setChecked(true); setCorrect(ok);
    answered(q, ok);
  };
  const check = (skip: boolean) => {
    if (checked || !q || (!skip && !input.trim())) return;
    const ok = !skip && (q.wf ? isWordformCorrect(input, q.wf)
      : qm === 'tense' ? [q.answer, ...(q.accept ?? [])].some((x) => norm(x) === norm(input))
      : normWord(input) === normWord(q.answer));
    // Translation: another of my words with the same meaning isn't wrong — show the one we want and let me type it.
    if (!ok && !skip && qm === 'trans' && !q.shown && w) {
      const other = data.words.find((x) => x.id !== q.id && normWord(x.word) === normWord(input));
      if (other && sameMeaning(other.vi, w.vi)) {
        setQs((prev) => prev && prev.map((x, k) => (k === i ? { ...x, shown: true } : x)));
        setInput('');
        setNote('Right meaning — “' + other.word + '” means “' + other.vi + '” too. The word we want here is “' + w.word + '”: type it to go on.');
        return;
      }
    }
    const spelling = !ok && !skip && (qm === 'trans' || qm === 'listen' || qm === 'fill') && oneOff(input, q.answer);
    setChecked(true); setCorrect(ok); setNote(spelling ? 'Almost — check the spelling.' : '');
    answered(q, ok, spelling);
  };
  const next = () => {
    if (!q || !qs) return;
    // A question I got wrong comes back once at the end of the session (choices in a new order).
    let list = qs;
    if (!correct && !q.retry) {
      const opts = q.opts ? shuffle(q.opts) : undefined;
      list = [...qs, { ...q, retry: true, shown: false, ...(opts ? { opts, ans: opts.indexOf(q.opts![q.ans!]) } : {}) }];
      setQs(list);
    }
    setNote('');
    if (i + 1 >= list.length) { setDone(true); return; }
    setI(i + 1); setPicked(null); setInput(''); setChecked(false); setCorrect(false);
  };
  const again = () => { load(); setI(0); setPicked(null); setInput(''); setChecked(false); setCorrect(false); setScore(0); setFixed(0); setNote(''); setDone(false); };

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

  if (!qs) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {bar}
        <ActivityIndicator color={t.primary} style={{ marginTop: 60 }} />
      </View>
    );
  }

  if (!n || !q) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {bar}
        <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
          <Card>
            <EmptyState icon={mode === 'weak' ? 'checkc' : 'alert'} title={mode === 'weak' ? 'No words to fix' : 'Not enough words yet'} text={mode === 'weak' ? 'No weak words right now — nice work! Words you get wrong in practice come back here.' : mode === 'mc' ? 'Multiple choice needs at least 4 words with meanings.' : mode === 'tense' ? 'Save some words from the library first: their sentences make the tense questions.' : mode === 'wordform' ? 'Save words that have a word family first (look for “+N forms”).' : 'Save a few more words with examples and translations first.'}>
              <Button title="Browse the Library" icon="globe" onPress={() => router.replace('/library')} />
            </EmptyState>
          </Card>
        </View>
      </View>
    );
  }

  if (done) {
    const acc = Math.round((score / Math.max(1, first)) * 100);
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {bar}
        <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
          <Card style={{ alignItems: 'center', gap: 10, padding: 24 }}>
            <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="trophy" size={32} color={t.primaryInk} /></View>
            <T size={26} weight="extrabold" center>{acc >= 80 ? 'Great job!' : acc >= 50 ? 'Nice work!' : 'Keep practicing!'}</T>
            <T tone="muted" center>You answered {score} of {first} correctly.{retries ? ' Fixed on the retry: ' + fixed + ' of ' + retries + '.' : ''}</T>
            <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginVertical: 8 }}>
              {[[first, 'questions', t.text], [score, 'correct', t.success], [acc + '%', 'accuracy', t.text], ...(retries ? [[fixed + '/' + retries, 'retry', t.primary]] : [])].map(([v, l, c]) => (
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

  const explain = qm !== 'wordform' && qm !== 'tense' && w?.meaning ? '“' + cap1(q.answer) + '” means ' + low1(w.meaning.replace(/\.$/, '')) + '.' : '';
  const feedback = checked ? (
    <View style={{ borderRadius: 14, padding: 16, gap: 6, backgroundColor: correct ? t.successSoft : t.dangerSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={correct ? 'checkc' : 'alert'} size={20} color={correct ? t.success : t.danger} />
        <T size={16} weight="extrabold" style={{ color: correct ? t.success : t.danger }}>{correct ? 'Correct!' : qm === 'mc' ? 'Not quite' : 'Not quite — the answer is'}</T>
      </View>
      {note ? <T size={14} weight="semibold">✎ {note}</T> : null}
      {q.wf ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}>
            <T size={20} weight="extrabold">{q.answer}</T>
            <T tone="muted">({q.wf.pos}){q.wf.vi ? ' · ' + q.wf.vi : ''}</T>
          </View>
          <T size={14} weight="semibold">{q.wf.familyLine}</T>
        </View>
      ) : qm === 'tense' ? (
        !correct ? <T size={20} weight="extrabold">{q.answer}</T> : null
      ) : qm !== 'mc' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}>
          <T size={20} weight="extrabold">{q.answer}</T>
          <T ipa tone="muted">{w?.ipa}</T>
          <T tone="muted">· {w?.vi}</T>
        </View>
      ) : null}
      {explain ? <T>{explain}</T> : null}
      {qm === 'mc' && w?.ex ? <T size={13.5} tone="muted">Example: “{w.ex}”</T> : null}
      {qm === 'fill' || qm === 'tense' ? <SentenceGrammar g={q.grammar} practice={false} /> : null}
    </View>
  ) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior="padding">
      {bar}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 16, padding: 20, borderRadius: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <T size={13} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>Question {i + 1} / {n}{mode === 'weak' ? ' · ' + TITLES[qm] : ''}</T>
            {q.retry ? <Badge label="Retry" bg={t.warningSoft} fg={t.warning} /> : null}
          </View>

          {qm === 'tense' && (
            <>
              <T size={13.5} weight="bold" tone="muted">{q.opts ? 'Choose the right verb form' : 'Put the verb in the right tense'}</T>
              <Blanked prompt={q.prompt ?? ''} fill={checked ? q.answer : ''} />
              {!q.opts ? <T size={13.5} tone="muted">Word: {w?.word}{w?.vi ? ' · ' + w.vi : ''}</T> : null}
            </>
          )}
          {q.opts && (
            <>
              {qm === 'mc' ? <T size={22} weight="extrabold" style={{ letterSpacing: -0.4 }}>What does “{q.answer}” mean?</T> : null}
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

          {qm === 'fill' && (
            <>
              <T size={21} weight="extrabold" style={{ lineHeight: 32 }}>
                {q.before}<T size={21} weight="extrabold" tone="primaryInk" style={{ textDecorationLine: 'underline' }}>{checked ? q.answer : ' ______ '}</T>{q.after}
              </T>
              <T size={13.5} tone="muted">Hint: {w?.pos} · {w?.vi}{w && q.answer.toLowerCase() !== w.word.toLowerCase() ? ' · a form of “' + w.word + '”' : ''}</T>
            </>
          )}
          {q.wf && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <T size={13.5} weight="bold" tone="muted">Use the right form of the word</T>
                <Badge label={q.wf.pos} bg={t.primarySoft} fg={t.primaryInk} />
              </View>
              <View accessible accessibilityLabel={(checked ? q.wf.prompt.replace('___', q.answer) : q.wf.prompt.replace('___', 'blank')) + ', ' + q.wf.pos}>
                <T size={21} weight="extrabold" style={{ lineHeight: 32 }}>{checked ? q.wf.prompt.replace('___', q.answer) : q.wf.prompt}</T>
              </View>
            </>
          )}
          {qm === 'trans' && (
            <>
              <T size={13.5} weight="bold" tone="muted">Translate into English</T>
              <T size={24} weight="extrabold">{w?.vi}</T>
              <T size={13.5} tone="muted">Hint: {w?.pos} · starts with “{q.answer.charAt(0).toUpperCase()}”</T>
            </>
          )}
          {qm === 'listen' && (
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

          {!q.opts && (
            <Input value={input} onChangeText={setInput} placeholder="Type your answer…" editable={!checked} autoCapitalize="none" autoCorrect={false}
              invalid={checked && !correct} returnKeyType="done" onSubmitEditing={() => (checked ? next() : check(false))} accessibilityLabel="Your answer" />
          )}

          {!checked && note ? (
            <View style={{ borderRadius: 12, padding: 12, backgroundColor: t.surface2 }} accessibilityLiveRegion="polite"><T size={14} weight="semibold">{note}</T></View>
          ) : null}
          {feedback}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <T size={13.5} tone="muted">Score: {score} / {first}</T>
            {checked ? <Button title="Continue" icon="right" onPress={next} />
              : !q.opts ? (
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
