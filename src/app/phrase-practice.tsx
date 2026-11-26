import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PatternChips } from '../components/phrases';
import { BackBar, Badge, Button, Card, EmptyState, Icon, IconButton, IconTile, T } from '../components/ui';
import { api, type PhraseDrill, type PhraseOwnResult } from '../lib/api';
import { DRILL_TITLE, TENSE_HINT, firstLetters, gradeDrill, hidesPhrase, type PhraseTense } from '../lib/phrases';
import { recordAnswer } from '../lib/practice';
import { speak } from '../lib/speech';
import { errMsg, useStore, useTheme } from '../state/store';

const SIZE = 10;
type Verdict = 'right' | 'close' | 'wrong';

/**
 * Practice → Phrases: each phrase used with a word — one of mine or a new library word: translate, fill in the phrase,
 * make it a question; conversation phrases by situation, reply and meaning. A wrong one comes back once at the end.
 */
export default function PhrasePractice() {
  const { key } = useLocalSearchParams<{ key?: string }>();
  const { data, actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<PhraseDrill[] | null>(null);
  const [err, setErr] = useState('');
  const [i, setI] = useState(0);
  const [input, setInput] = useState('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [given, setGiven] = useState('');
  /** Hints asked for on this question: 1 = first letters, 2 = the phrase and its pattern. */
  const [hint, setHint] = useState(0);
  /** Set when the answer was right except for its tense. */
  const [badTense, setBadTense] = useState<PhraseTense | null>(null);
  /** "Your own sentence": AI grades it (one of today's Phrase AI uses); 7 or more counts as right. */
  const [own, setOwn] = useState<PhraseOwnResult | null>(null);
  const [ownBusy, setOwnBusy] = useState(false);
  const [ownErr, setOwnErr] = useState('');
  const [done, setDone] = useState<{ d: PhraseDrill; verdict: Verdict }[]>([]);
  const [run, setRun] = useState(0);
  const field = useRef<TextInput>(null);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    let live = true;
    setItems(null); setErr(''); setI(0); setDone([]); setInput(''); setVerdict(null);
    api.phraseSession(SIZE, key ? String(key) : undefined).then((r) => { if (live) setItems(r.items); }).catch((e) => { if (live) setErr(errMsg(e)); });
    return () => { live = false; };
  }, [key, run]);

  const d = items?.[i];
  const check = (answer: string) => {
    if (!d || verdict) return;
    const g = gradeDrill(d, answer);
    const v = g.verdict;
    setBadTense(g.tense ?? null);
    setVerdict(v); setGiven(answer);
    const ok = v !== 'wrong';
    const retry = d.id.endsWith(':again');
    if (!retry) {
      setDone((x) => [...x, { d, verdict: v }]);
      void api.phraseResults([{ key: d.key, ok }]).catch(() => undefined);
      if (d.filler?.mine && (d.type === 'translate' || d.type === 'transform')) recordAnswer(d.filler.wordId, 'trans', ok);
    }
    if (!ok && !retry) setItems((list) => list && [...list, { ...d, id: d.id + ':again' }]);
    if (ok) speak(d.choices.length ? (d.type === 'meaning' ? d.phrase : answer) : d.answers[0]);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
  };
  const next = () => { setI(i + 1); setInput(''); setVerdict(null); setGiven(''); setHint(0); setBadTense(null); setOwn(null); setOwnErr(''); scroll.current?.scrollTo({ y: 0, animated: false }); setTimeout(() => field.current?.focus(), 150); };
  const checkOwn = async () => {
    if (!d || verdict || ownBusy || !input.trim()) return;
    setOwnBusy(true); setOwnErr('');
    try {
      const r = await api.phraseOwn(d.key, input.trim(), d.tense);
      setOwn(r);
      const v: Verdict = r.score >= 9 ? 'right' : r.score >= 7 ? 'close' : 'wrong';
      setVerdict(v); setGiven(input);
      setDone((x) => [...x, { d, verdict: v }]);
      void api.phraseResults([{ key: d.key, ok: v !== 'wrong' }]).catch(() => undefined);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) { setOwnErr(errMsg(e)); } finally { setOwnBusy(false); }
  };
  const saveNew = async (libraryId: string, word: string) => {
    const w = await actions.saveFromLibrary({ id: libraryId, word });
    if (w) setItems((list) => list && list.map((x) => (x.filler && x.filler.word === word ? { ...x, filler: { ...x.filler, mine: true, wordId: w.id } } : x)));
  };

  const shell = (body: React.ReactNode) => (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior="padding">
      <BackBar title={key ? 'Practise a phrase' : 'Practise phrases'} />
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">{body}</ScrollView>
    </KeyboardAvoidingView>
  );
  if (err) return shell(<EmptyState icon="alert" tone="red" title="Can’t start the practice" text={err} />);
  if (!items) return shell(<Card style={{ alignItems: 'center', paddingVertical: 40 }}><T tone="muted">Picking your phrases…</T></Card>);
  if (!items.length) return shell(<EmptyState icon="chat" title="No phrases yet" text="Phrases will appear here once they are added." />);

  if (i >= items.length) {
    const right = done.filter((x) => x.verdict !== 'wrong').length;
    const phrases = [...new Map(done.map((x) => [x.d.key, x.d.phrase])).entries()];
    const newWords = [...new Map(done.filter((x) => x.d.filler && !x.d.filler.mine && x.d.filler.libraryId).map((x) => [x.d.filler!.word, x.d.filler!])).values()]
      .filter((f) => !data.words.some((w) => w.word.toLowerCase() === f.word.toLowerCase()));
    return shell(
      <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
        <IconTile name="check" tone="green" size={52} />
        <T size={22} weight="extrabold">Practice done</T>
        <T tone="muted" center>{right} of {done.length} right the first time.</T>
        <View style={{ alignSelf: 'stretch', gap: 6 }}>
          {phrases.map(([k, p]) => {
            const mine = done.filter((x) => x.d.key === k);
            const ok = mine.filter((x) => x.verdict !== 'wrong').length;
            return (
              <Pressable key={k} onPress={() => router.push({ pathname: '/phrases/[key]', params: { key: k } })} accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: t.border }}>
                <T weight="bold" style={{ flex: 1 }}>{p}</T>
                <Badge label={ok + '/' + mine.length} bg={ok === mine.length ? t.successSoft : t.warningSoft} fg={ok === mine.length ? t.success : t.warning} />
              </Pressable>
            );
          })}
        </View>
        {newWords.length ? (
          <View style={{ alignSelf: 'stretch', gap: 6 }}>
            <T size={13} weight="bold" tone="muted">NEW WORDS YOU USED</T>
            {newWords.map((f) => (
              <View key={f.word} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T weight="bold">{f.word}</T><T size={13} tone="muted" style={{ flex: 1 }}>{f.vi}</T>
                <Button title="Save" icon="plus" size="sm" variant="secondary" onPress={() => void saveNew(f.libraryId, f.word)} />
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
          <Button title="Phrases" variant="secondary" onPress={() => router.back()} />
          <Button title="Practise again" onPress={() => setRun((x) => x + 1)} />
        </View>
      </Card>
    );
  }

  const q = d!;
  const ok = verdict && verdict !== 'wrong';
  const full = q.type === 'fill' ? q.prompt.replace(/(___\s?)+/, q.answers[0] + ' ') : q.answers[0];
  return shell(
    <>
      <T size={13} tone="muted">{i + 1} / {items.length}{q.id.endsWith(':again') ? ' · again' : ''}</T>
      <Card style={{ gap: 10 }}>
        <T size={12.5} weight="extrabold" tone="muted">{DRILL_TITLE[q.type].toUpperCase()}</T>
        {/* Hidden while it would give the answer away; hints show it bit by bit (or the answer, once checked). */}
        {!hidesPhrase(q.type) || hint >= 2 || (verdict && q.type !== 'situation') ? (q.pattern ? <PatternChips pattern={q.pattern} /> : <T weight="extrabold">{q.phrase}</T>) : null}
        {hidesPhrase(q.type) && q.type !== 'situation' && hint === 1 && !verdict ? <T size={16} weight="extrabold" style={{ color: t.primaryInk, letterSpacing: 1 }}>{firstLetters(q.type === 'fill' ? q.answers[0] : q.phrase)}</T> : null}
        {q.filler ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: q.filler.mine ? t.successSoft : t.surface2 }}>
            <Badge label={q.filler.mine ? 'Your word' : 'New word'} bg={t.surface} fg={q.filler.mine ? t.success : t.text} />
            <T weight="bold">{q.filler.en}</T><T size={13} tone="muted">{q.filler.vi}</T>
            {!q.filler.mine && q.filler.libraryId ? <Pressable onPress={() => void saveNew(q.filler!.libraryId, q.filler!.word)} accessibilityRole="button" accessibilityLabel="Save this word" hitSlop={8}><T size={13} weight="bold" style={{ color: t.primaryInk }}>+ Save</T></Pressable> : null}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <T size={20} weight="extrabold" style={{ flex: 1 }}>{q.prompt}</T>
          {q.type === 'reply' || q.type === 'transform' || q.type === 'fill' ? <IconButton name="volume" label="Hear" onPress={() => speak(q.type === 'fill' ? full : q.prompt)} /> : null}
        </View>
        {q.sub ? <T size={14} tone="muted">{q.sub}</T> : null}
        {q.tense ? (
          <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: t.infoSoft }}>
            <Icon name="clock" size={14} color={t.info} />
            <T size={13} style={{ color: t.info }}>Thì: <T size={13} weight="bold" style={{ color: t.info }}>{TENSE_HINT[q.tense].vi}</T> · {TENSE_HINT[q.tense].form}</T>
          </View>
        ) : null}

        {q.choices.length ? (
          <View style={{ gap: 8 }}>
            {q.choices.map((c, k) => {
              const isRight = q.answers.includes(c);
              const bg = !verdict ? t.surface : isRight ? t.successSoft : c === given ? t.dangerSoft : t.surface;
              const bc = !verdict ? t.border : isRight ? t.success : c === given ? t.danger : t.border;
              return (
                <Pressable key={c} onPress={() => check(c)} disabled={!!verdict} accessibilityRole="button" accessibilityLabel={c}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: bc, backgroundColor: bg, opacity: verdict && !isRight && c !== given ? 0.6 : 1 }}>
                  <T weight="bold" tone="muted">{k + 1}</T><T style={{ flex: 1 }}>{c}</T>
                  {verdict && isRight ? <Icon name="check" size={16} color={t.success} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <TextInput ref={field} value={input} onChangeText={setInput} editable={!verdict} multiline autoCapitalize="sentences" autoCorrect={false}
              placeholder={q.type === 'fill' ? 'Type the missing words…' : q.type === 'own' ? 'A sentence about your work or your day…' : 'Type the English sentence…'} maxLength={300} placeholderTextColor={t.faint} accessibilityLabel="Your answer"
              style={{ minHeight: 64, borderWidth: 1.5, borderColor: verdict ? (ok ? t.success : t.danger) : t.border, borderRadius: 12, padding: 12, fontSize: 16, color: t.text, backgroundColor: t.surface, textAlignVertical: 'top' }} />
            {!verdict && q.type === 'own' ? (
              <View style={{ gap: 8 }}>
                {ownErr ? <T size={14} tone="danger">{ownErr}</T> : null}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="Skip" variant="secondary" onPress={next} disabled={ownBusy} />
                  <Button title={ownBusy ? 'Checking…' : 'Check with AI'} icon="sparkle" loading={ownBusy} onPress={() => void checkOwn()} disabled={!input.trim()} style={{ flex: 1 }} />
                </View>
              </View>
            ) : !verdict ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {hidesPhrase(q.type) && hint < 2 ? <Button title={hint ? 'More help' : 'Hint'} icon="sparkle" variant="secondary" onPress={() => setHint(hint + 1)} /> : null}
                <Button title="Answer" variant="secondary" onPress={() => check('')} />
                <Button title="Check" icon="check" onPress={() => check(input)} disabled={!input.trim()} style={{ flex: 1 }} />
              </View>
            ) : null}
          </View>
        )}
      </Card>

      {verdict ? (
        <View accessibilityLiveRegion="polite" style={{ borderRadius: 14, padding: 14, gap: 6, backgroundColor: ok ? t.successSoft : t.dangerSoft }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name={ok ? 'checkc' : 'alert'} size={20} color={ok ? t.success : t.danger} />
            <T size={16} weight="extrabold" style={{ color: ok ? t.success : t.danger, flex: 1 }}>{own ? (own.score >= 9 ? 'Great!' : ok ? 'Good' : 'Try again next time') : verdict === 'right' ? 'Correct!' : verdict === 'close' ? 'Correct — another way to say it:' : given ? 'Not quite. The answer:' : 'The answer:'}</T>
          </View>
          {own ? (
            <View style={{ gap: 6 }}>
              <T size={20} weight="extrabold">{own.score}/10</T>
              {own.feedbackVi ? <T size={14}>{own.feedbackVi}</T> : null}
              {own.mistakes.map((m, k) => <T key={k} size={14}><T size={14} tone="danger" style={{ textDecorationLine: 'line-through' }}>{m.wrong}</T> → <T size={14} weight="bold">{m.fix}</T>{m.explainVi ? ' · ' + m.explainVi : ''}</T>)}
              {own.corrected && own.corrected !== given.trim() ? <T size={14}>Corrected: <T size={14} weight="bold">{own.corrected}</T></T> : null}
              {own.better ? <View style={{ flexDirection: 'row', alignItems: 'center' }}><T size={15} weight="bold" style={{ flex: 1 }}>{own.better}</T><IconButton name="volume" label="Hear" onPress={() => speak(own.better)} /></View> : null}
              {own.betterVi ? <T size={13} tone="muted">{own.betterVi}</T> : null}
              <T size={12} tone="muted">{Math.max(0, own.quota.limit - own.quota.used)} AI checks left today</T>
            </View>
          ) : null}
          {!q.choices.length && !own ? <View style={{ flexDirection: 'row', alignItems: 'center' }}><T size={17} weight="bold" style={{ flex: 1 }}>{full}</T><IconButton name="volume" label="Hear the answer" onPress={() => speak(full)} /></View> : null}
          {badTense ? <T size={14}><T size={14} weight="bold">Sai thì:</T> câu này dùng {TENSE_HINT[badTense].vi} ({TENSE_HINT[badTense].form}).</T> : null}
          {!ok && !badTense && q.explain ? <T size={14}>{q.explain}</T> : null}
          {!ok && !own && !q.id.endsWith(':again') ? <T size={13} tone="muted">You’ll get this one again at the end.</T> : null}
          <Button title="Continue" icon="right" onPress={next} block style={{ marginTop: 6 }} />
        </View>
      ) : null}
    </>
  );
}
