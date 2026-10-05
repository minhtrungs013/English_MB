import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, useWindowDimensions, View,
  type NativeScrollEvent, type NativeSyntheticEvent
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isCorrect, normAnswer, Progress, scoreColors } from '../../../../components/course';
import { BackBar, Badge, Button, Card, EmptyState, Icon, IconButton, Input, LevelBadge, PosBadge, SectionTitle, T } from '../../../../components/ui';
import { api, type CourseDetail, type CourseWord } from '../../../../lib/api';
import { shuffle } from '../../../../lib/data';
import { speak, stopSpeaking } from '../../../../lib/speech';
import { errMsg, useStore, useTheme } from '../../../../state/store';

type Phase = 'meet' | 'practice' | 'summary';
type Kind = 'listen' | 'dictation' | 'meaning' | 'blank' | 'recall' | 'match';
/** Exercise types a single word can be asked in (match pairs is a round over several words). */
type WordKind = Exclude<Kind, 'match'>;

/** One practice item. `w` indexes the day's words; a match round lists its words in `ws` and the meaning column order in `order`. */
interface Item { key: number; kind: Kind; w: number; opts: string[]; ws: number[]; order: number[] }
interface Run {
  queue: Item[]; pos: number;
  /** Per word: the exercise types answered correctly so far. */
  got: Kind[][];
  /** Per word: wrong answers. */
  misses: number[];
  answered: number; right: number; streak: number;
}
interface Blank { before: string; after: string; form: string }
interface LearnWord extends CourseWord { blank: Blank | null }

/** Each word must be answered correctly in this many different exercise types. */
const MASTERY = 2;
/** A wrong answer comes back this many items later. */
const REQUEUE_GAP = 3;
const MATCH_MAX = 5;

const KIND_LABEL: Record<Kind, string> = {
  listen: 'Listen & choose', dictation: 'Dictation', meaning: 'Meaning', blank: 'Fill the blank', recall: 'Recall', match: 'Match pairs'
};
const ASK_KIND: Record<Kind, string> = {
  listen: 'Listen and choose the word you hear',
  dictation: 'Listen and type the word',
  meaning: 'What does this word mean?',
  blank: 'Type the missing word',
  recall: 'Type the English word for',
  match: 'Tap a word, then its meaning'
};

/* ---------- helpers ---------- */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The word and its simple inflections (-s/-es, -ed/-d, -ing, y→ies/ied, dropped e, doubled final consonant), longest first. */
function inflections(word: string): string[] {
  const b = word.toLowerCase();
  const f = new Set([b, b + 's', b + 'es', b + 'ed', b + 'd', b + 'ing']);
  if (b.endsWith('e')) f.add(b.slice(0, -1) + 'ing');
  if (/[^aeiou]y$/.test(b)) { f.add(b.slice(0, -1) + 'ies'); f.add(b.slice(0, -1) + 'ied'); }
  if (/[^aeiou][aeiou][bdgklmnprt]$/.test(b)) { const c = b.slice(-1); f.add(b + c + 'ed'); f.add(b + c + 'ing'); }
  return [...f].sort((x, y) => y.length - x.length);
}

/** Finds the word (or a simple inflection of it; for a phrase, of its first word) in the example sentence. */
function findBlank(word: string, ex: string): Blank | null {
  const w = word.trim();
  if (!w || !ex) return null;
  const [first, ...rest] = w.split(/\s+/);
  const tail = rest.length ? ' ' + rest.join(' ') : '';
  const forms = inflections(first).map((f) => escapeRe(f) + escapeRe(tail).replace(/ /g, '\\s+'));
  const m = new RegExp('(^|[^A-Za-z])(' + forms.join('|') + ')(?![A-Za-z])', 'i').exec(ex);
  if (!m) return null;
  const start = m.index + m[1].length;
  const form = m[2];
  // Nothing left to read around the blank: not a usable example.
  if (!ex.slice(0, start).trim() && !ex.slice(start + form.length).replace(/[.!?…\s]/g, '')) return null;
  return { before: ex.slice(0, start), after: ex.slice(start + form.length), form };
}

/** Up to `n` distinct values from the pools (in order), skipping the answer itself. */
function pickDistractors(answer: string, pools: string[][], n: number): string[] {
  const seen = new Set([normAnswer(answer)]);
  const out: string[] = [];
  for (const pool of pools) {
    for (const v of shuffle(pool)) {
      const k = normAnswer(v);
      if (!k || seen.has(k)) continue;
      seen.add(k); out.push(v);
      if (out.length >= n) return out;
    }
  }
  return out;
}

const letters = (s: string) => s.replace(/[\s'-]/g, '').length;

/* ---------- screen ---------- */

export default function LearnDayScreen() {
  const { id, day: dayParam } = useLocalSearchParams<{ id: string; day: string }>();
  const day = Number(dayParam);
  const { data, actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [c, setC] = useState<CourseDetail | null>(null);
  const [err, setErr] = useState('');
  const [phase, setPhase] = useState<Phase>('meet');
  const [card, setCard] = useState(0);
  const [run, setRun] = useState<Run | null>(null);
  const [input, setInput] = useState('');
  const [res, setRes] = useState<{ answer: string; correct: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // Match round
  const [sel, setSel] = useState<number | null>(null);
  const [paired, setPaired] = useState<number[]>([]);
  const [slips, setSlips] = useState<number[]>([]);
  const [flash, setFlash] = useState<{ w: number; m: number } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pager = useRef<ScrollView>(null);
  const seq = useRef(0);

  useEffect(() => {
    let live = true;
    api.course(id).then((r) => { if (live) setC(r); }).catch((e) => { if (live) setErr(errMsg(e)); });
    return () => { live = false; };
  }, [id]);
  useEffect(() => () => { stopSpeaking(); clearTimeout(flashTimer.current); }, []);

  const d = c?.days.find((x) => x.day === day);
  const words: LearnWord[] = useMemo(() => (d?.words ?? []).map((w) => ({ ...w, blank: findBlank(w.word, w.ex) })), [d]);

  // Distractor pools: today's words first, then other open days of the course, then the learner's own words.
  const pools = useMemo(() => {
    const others = (c?.days ?? []).filter((x) => x.day !== day && x.words).flatMap((x) => x.words ?? []);
    return {
      word: (w: number) => [words.filter((_, k) => k !== w).map((x) => x.word), others.map((x) => x.word), data.words.map((x) => x.word)],
      vi: (w: number) => [words.filter((_, k) => k !== w).map((x) => x.vi), others.map((x) => x.vi), data.words.map((x) => x.vi)]
    };
  }, [c, day, words, data.words]);

  /** Exercise types this word can be asked in. */
  const kindsFor = useCallback((w: number): WordKind[] => {
    const x = words[w];
    const ks: WordKind[] = ['dictation'];
    if (pickDistractors(x.word, pools.word(w), 1).length) ks.push('listen');
    if (x.vi) ks.push('recall');
    if (x.vi && pickDistractors(x.vi, pools.vi(w), 1).length) ks.push('meaning');
    if (x.blank) ks.push('blank');
    return ks;
  }, [words, pools]);

  const makeItem = useCallback((kind: WordKind, w: number): Item => {
    const x = words[w];
    let opts: string[] = [];
    if (kind === 'listen') opts = shuffle([x.word, ...pickDistractors(x.word, pools.word(w), 3)]);
    if (kind === 'meaning') opts = shuffle([x.vi, ...pickDistractors(x.vi, pools.vi(w), 3)]);
    return { key: seq.current++, kind, w, opts, ws: [], order: [] };
  }, [words, pools]);

  const newRun = useCallback((): Run => {
    const items: Item[] = [];
    words.forEach((_, w) => { for (const k of shuffle(kindsFor(w)).slice(0, MASTERY)) items.push(makeItem(k, w)); });
    let q = shuffle(items);
    // Avoid the same word twice in a row where possible.
    for (let i = 1; i < q.length; i++) {
      if (q[i].w !== q[i - 1].w) continue;
      const j = q.findIndex((x, k) => k > i && x.w !== q[i - 1].w && (k + 1 >= q.length || q[k + 1].w !== q[i].w));
      if (j > 0) { const tmp = q[i]; q[i] = q[j]; q[j] = tmp; }
    }
    const matchable = words.map((x, k) => (x.vi || x.meaning ? k : -1)).filter((k) => k >= 0);
    if (matchable.length >= 2) {
      const ws = shuffle(matchable).slice(0, MATCH_MAX);
      const match: Item = { key: seq.current++, kind: 'match', w: ws[0], opts: [], ws, order: shuffle(ws.map((_, k) => k)) };
      const at = Math.ceil(q.length / 2);
      q = [...q.slice(0, at), match, ...q.slice(at)];
    }
    return { queue: q, pos: 0, got: words.map(() => []), misses: words.map(() => 0), answered: 0, right: 0, streak: 0 };
  }, [words, kindsFor, makeItem]);

  const item = run && phase === 'practice' ? run.queue[run.pos] : undefined;
  const cur = item ? words[item.w] : undefined;

  // Play the word when a listening item appears.
  useEffect(() => {
    if (!item || (item.kind !== 'listen' && item.kind !== 'dictation')) return;
    const word = words[item.w].word;
    const tm = setTimeout(() => speak(word), 300);
    return () => clearTimeout(tm);
  }, [item, words]);

  // Meet the words: auto-play each card's word if the learner's setting is on.
  const autoplay = data.settings.autoplay;
  useEffect(() => {
    if (phase !== 'meet' || !autoplay || !words[card]) return;
    const word = words[card].word;
    const tm = setTimeout(() => speak(word), 250);
    return () => clearTimeout(tm);
  }, [phase, card, autoplay, words]);

  const midway = phase === 'practice' || (phase === 'meet' && card > 0);
  const close = useCallback(() => {
    if (!midway) { stopSpeaking(); router.back(); return; }
    Alert.alert('Stop learning?', 'Your practice so far won’t be kept. You can start again from the course page.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => { stopSpeaking(); router.back(); } }
    ]);
  }, [midway]);

  // Android back button: confirm before dropping the practice.
  useEffect(() => {
    if (!midway) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
  }, [midway, close]);

  const title = 'Day ' + (dayParam ?? '');
  if (!c || !d || !words.length) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title={title} />
        {err || (c && (!d || !words.length)) ? (
          <EmptyState icon="alert" tone="red" title="Couldn’t open this day" text={err || (!d ? 'This day doesn’t exist.' : 'There are no words to learn on this day.')}>
            <Button title="Back" variant="secondary" onPress={() => router.back()} />
          </EmptyState>
        ) : <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  const n = words.length;
  const e = c.enrollment;
  const learned = !!e?.learned.includes(day);
  const canSave = !!e && day <= e.currentDay && !learned;
  const mine = new Set(data.words.map((w) => w.word.toLowerCase()));
  const newCount = words.filter((w) => !mine.has(w.word.toLowerCase())).length;
  const saveTitle = newCount > 0 ? 'Save ' + newCount + (newCount === 1 ? ' word' : ' words') + ' to My Vocabulary' : 'Mark day as learned';

  const save = async () => {
    setBusy(true);
    const r = await actions.learnCourseDay(c.id, day);
    setBusy(false);
    if (r) { setC(r); stopSpeaking(); router.back(); }
  };

  const resetItem = () => {
    setInput(''); setRes(null); setSel(null); setPaired([]); setSlips([]); setFlash(null); clearTimeout(flashTimer.current);
  };
  const startPractice = () => { stopSpeaking(); resetItem(); setRun(newRun()); setPhase('practice'); };

  /* ---------- meet the words ---------- */
  if (phase === 'meet') {
    const last = card === n - 1;
    const goTo = (k: number) => {
      const to = Math.max(0, Math.min(n - 1, k));
      setCard(to);
      pager.current?.scrollTo({ x: to * width, animated: true });
    };
    const onSwipe = (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
      const k = Math.round(ev.nativeEvent.contentOffset.x / width);
      if (k !== card && k >= 0 && k < n) setCard(k);
    };
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 + insets.top }}>
          <IconButton name="x" label="Close" onPress={close} />
          <T size={16} weight="extrabold" numberOfLines={1} style={{ flex: 1 }}>{title} · Meet the words</T>
          <T size={14} weight="bold" tone="muted" style={{ paddingHorizontal: 8 }}>{card + 1} / {n}</T>
        </View>
        <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onSwipe} style={{ flex: 1 }}>
          {words.map((w, k) => (
            <ScrollView key={w.word + k} style={{ width }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 16, paddingTop: 4 }}>
              <Card style={{ alignItems: 'center', gap: 12, padding: 24, borderRadius: 22, minHeight: 380, justifyContent: 'center' }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {w.pos ? <PosBadge pos={w.pos} /> : null}
                  <LevelBadge level={w.level} />
                </View>
                <T size={36} weight="extrabold" center style={{ letterSpacing: -1, lineHeight: 42 }}>{w.word}</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {w.ipa ? <T ipa size={18} tone="muted">{w.ipa}</T> : null}
                  <IconButton name="volume" label={'Play ' + w.word} color={t.primaryInk} onPress={() => speak(w.word)} />
                </View>
                <View style={{ width: 56, height: 3, borderRadius: 3, backgroundColor: t.surface3, marginVertical: 4 }} />
                {w.vi ? <T size={21} weight="extrabold" center>{w.vi}</T> : null}
                {w.meaning ? <T size={15} tone="muted" center>{w.meaning}</T> : null}
                {w.ex ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.surface2, borderRadius: 12, paddingLeft: 14, paddingRight: 4, paddingVertical: 8, alignSelf: 'stretch' }}>
                    <T size={15} style={{ fontStyle: 'italic', flex: 1 }}>“{w.ex}”</T>
                    <IconButton name="volume" label="Play the example" color={t.primaryInk} onPress={() => speak(w.ex, 0.95)} />
                  </View>
                ) : null}
              </Card>
            </ScrollView>
          ))}
        </ScrollView>
        <View accessible accessibilityLabel={'Word ' + (card + 1) + ' of ' + n} style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 10 }}>
          {words.map((w, k) => (
            <View key={w.word + k} style={{ width: k === card ? 20 : 8, height: 8, borderRadius: 4, backgroundColor: k === card ? t.primary : t.surface3 }} />
          ))}
        </View>
        <View style={{ padding: 12, paddingBottom: insets.bottom + 12, gap: 6, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Back" icon="left" variant="secondary" size="lg" disabled={card === 0} onPress={() => goTo(card - 1)} accessibilityLabel="Previous word" />
            {last
              ? <Button title="Start practice" icon="right" size="lg" onPress={startPractice} style={{ flex: 1 }} />
              : <Button title="Next" icon="right" size="lg" onPress={() => goTo(card + 1)} style={{ flex: 1 }} accessibilityLabel="Next word" />}
          </View>
          {canSave
            ? <Button title="Skip practice — save words" variant="ghost" loading={busy} onPress={() => void save()} block />
            : !last ? <Button title="Skip to practice" variant="ghost" onPress={startPractice} block /> : null}
        </View>
      </View>
    );
  }

  /* ---------- summary ---------- */
  if (phase === 'summary' || !run || !item || !cur) {
    const answered = run?.answered ?? 0;
    const pct = answered ? Math.round(((run?.right ?? 0) / answered) * 100) : 0;
    const [sBg, sFg] = scoreColors(pct, t);
    const retried = words.map((w, k) => ({ w, misses: run?.misses[k] ?? 0 })).filter((x) => x.misses > 0);
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title={title} />
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: insets.bottom + 24 }}>
          <Card style={{ alignItems: 'center', gap: 8, padding: 24 }}>
            <SectionTitle>Practice done</SectionTitle>
            <View accessible accessibilityLabel={'Accuracy ' + pct + ' percent'}
              style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: sBg, alignItems: 'center', justifyContent: 'center' }}>
              <T size={34} weight="extrabold" style={{ color: sFg, lineHeight: 42 }}>{pct}%</T>
            </View>
            <T size={20} weight="extrabold" center>{pct >= 80 ? 'Great job!' : pct >= 50 ? 'Nice work!' : 'Keep practicing!'}</T>
            <T tone="muted" center>
              You practiced {n} {n === 1 ? 'word' : 'words'} · {run?.right ?? 0} of {answered} answers correct.
            </T>
          </Card>
          {canSave ? (
            <Button title={saveTitle} icon="plus" size="lg" loading={busy} onPress={() => void save()} block />
          ) : (
            <Button title="Done" icon="check" size="lg" onPress={() => { stopSpeaking(); router.back(); }} block />
          )}
          <Button title="Practice again" icon="refresh" variant="secondary" onPress={startPractice} block />
          {retried.length ? <SectionTitle style={{ marginTop: 4 }}>Needed another try</SectionTitle> : null}
          {retried.map(({ w, misses }) => (
            <View key={w.word} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 14, paddingLeft: 14, paddingRight: 4, paddingVertical: 10 }}>
              <View accessible accessibilityLabel={w.word + ', ' + (w.vi || w.meaning) + ', missed ' + misses + (misses === 1 ? ' time' : ' times')} style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <T size={16} weight="extrabold">{w.word}</T>
                  {w.ipa ? <T ipa size={13} tone="muted">{w.ipa}</T> : null}
                  <Badge label={'missed ' + misses + '×'} bg={t.warningSoft} fg={t.warning} />
                </View>
                {w.vi ? <T size={14} weight="semibold">{w.vi}</T> : null}
              </View>
              <IconButton name="volume" label={'Play ' + w.word} color={t.primaryInk} onPress={() => speak(w.word)} />
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  /* ---------- practice ---------- */
  const mastered = run.got.reduce((s, g) => s + Math.min(MASTERY, g.length), 0);
  const pct = (mastered / (n * MASTERY)) * 100;
  const isMatch = item.kind === 'match';
  const typed = item.kind === 'dictation' || item.kind === 'blank' || item.kind === 'recall';
  const answerText = item.kind === 'meaning' ? cur.vi : cur.word;
  const matchDone = isMatch && paired.length === item.ws.length;
  const revealed = isMatch ? matchDone : !!res;

  /** Records the answers to the current item; wrong ones come back a few items later. */
  const record = (results: { w: number; correct: boolean }[]) => {
    const got = run.got.map((g) => [...g]);
    const misses = [...run.misses];
    const queue = [...run.queue];
    let { answered, right, streak } = run;
    for (const x of results) {
      answered++;
      if (x.correct) {
        right++; streak++;
        if (!got[x.w].includes(item.kind)) got[x.w].push(item.kind);
      } else {
        streak = 0; misses[x.w]++;
        if (item.kind !== 'match') queue.splice(Math.min(queue.length, run.pos + REQUEUE_GAP), 0, makeItem(item.kind, x.w));
      }
    }
    setRun({ ...run, got, misses, queue, answered, right, streak });
  };

  const check = (a: string) => {
    if (res || !a.trim()) return;
    const ok = item.kind === 'meaning' ? normAnswer(a) === normAnswer(cur.vi)
      : isCorrect(a, cur.word, item.kind === 'blank' && cur.blank ? [cur.blank.form] : []);
    setRes({ answer: a, correct: ok });
    record([{ w: item.w, correct: ok }]);
    speak(cur.word);
  };
  const giveUp = () => {
    if (res) return;
    setRes({ answer: '', correct: false });
    record([{ w: item.w, correct: false }]);
    speak(cur.word);
  };

  const tapMeaning = (m: number) => {
    if (sel === null || paired.includes(item.ws[m])) return;
    const target = words[sel];
    const meant = words[item.ws[m]];
    const ok = sel === item.ws[m] || (target.vi || target.meaning) === (meant.vi || meant.meaning);
    if (ok) {
      const nextPaired = [...paired, sel];
      setPaired(nextPaired); setSel(null);
      speak(target.word);
      if (nextPaired.length === item.ws.length) record(item.ws.map((w) => ({ w, correct: !slips.includes(w) })));
    } else {
      if (!slips.includes(sel)) setSlips([...slips, sel]);
      clearTimeout(flashTimer.current);
      setFlash({ w: sel, m });
      flashTimer.current = setTimeout(() => setFlash(null), 700);
      setSel(null);
    }
  };

  const next = () => {
    resetItem();
    let pos = run.pos + 1;
    let queue = run.queue;
    // A retry is pointless once that word was answered right in that exercise type.
    const skip = (x: Item) => x.kind !== 'match' && run.got[x.w].includes(x.kind);
    while (pos < queue.length && skip(queue[pos])) pos++;
    if (pos >= queue.length) {
      // Top up: every word needs MASTERY different exercise types answered correctly.
      const extra: Item[] = [];
      run.got.forEach((g, w) => {
        if (g.length >= MASTERY) return;
        const left = shuffle(kindsFor(w).filter((k) => !g.includes(k)));
        for (const k of left.slice(0, MASTERY - g.length)) extra.push(makeItem(k, w));
      });
      if (!extra.length) { stopSpeaking(); setPhase('summary'); return; }
      queue = [...queue, ...shuffle(extra)];
    }
    setRun({ ...run, queue, pos });
  };

  const choiceRow = (o: string, k: number) => {
    const picked = res?.answer === o;
    const right = !!res && normAnswer(o) === normAnswer(answerText);
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
  };

  const listenPanel = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 16, backgroundColor: t.surface2 }}>
      <Pressable onPress={() => speak(cur.word)} accessibilityRole="button" accessibilityLabel="Play the word again"
        style={({ pressed }) => ({ width: 76, height: 76, borderRadius: 38, backgroundColor: pressed ? t.primaryHover : t.primary, alignItems: 'center', justifyContent: 'center' })}>
        <Icon name="volume" size={32} color="#fff" />
      </Pressable>
      <View style={{ flex: 1, gap: 8 }}>
        <Button title="Play slowly" icon="clock" variant="secondary" size="sm" style={{ minHeight: 44 }} onPress={() => speak(cur.word, 0.6)} />
      </View>
    </View>
  );

  let prompt = null;
  if (item.kind === 'listen') prompt = listenPanel;
  if (item.kind === 'dictation') {
    prompt = (
      <>
        {listenPanel}
        <T size={13.5} tone="muted">Hint: {cur.pos ? cur.pos + ' · ' : ''}{letters(cur.word)} letters</T>
      </>
    );
  }
  if (item.kind === 'meaning') {
    prompt = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ flex: 1 }}>
          <T size={26} weight="extrabold" style={{ letterSpacing: -0.4 }}>{cur.word}</T>
          {cur.ipa ? <T ipa size={15} tone="muted">{cur.ipa}</T> : null}
        </View>
        <IconButton name="volume" label={'Play ' + cur.word} color={t.primaryInk} onPress={() => speak(cur.word)} />
      </View>
    );
  }
  if (item.kind === 'blank' && cur.blank) {
    const b = cur.blank;
    prompt = (
      <>
        <T size={20} weight="extrabold" style={{ lineHeight: 30 }}>
          {b.before}<T size={20} weight="extrabold" tone="primaryInk" style={{ textDecorationLine: 'underline' }}>{res ? b.form : ' ______ '}</T>{b.after}
        </T>
        <T size={13.5} tone="muted">Hint: {[cur.pos, cur.vi].filter(Boolean).join(' · ')}</T>
      </>
    );
  }
  if (item.kind === 'recall') {
    prompt = (
      <>
        <T size={24} weight="extrabold">{cur.vi}</T>
        <T size={13.5} tone="muted">Hint: starts with “{cur.word.charAt(0).toUpperCase()}” · {letters(cur.word)} letters</T>
      </>
    );
  }

  let matchBoard = null;
  if (isMatch) {
    const cellStyle = (state: 'idle' | 'sel' | 'done' | 'bad', pressed: boolean) => ({
      minHeight: 52, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, justifyContent: 'center' as const,
      borderColor: state === 'sel' ? t.primary : state === 'done' ? t.success : state === 'bad' ? t.danger : t.border,
      backgroundColor: state === 'sel' ? t.primarySoft : state === 'done' ? t.successSoft : state === 'bad' ? t.dangerSoft : pressed ? t.surface2 : t.surface,
      opacity: state === 'done' ? 0.7 : 1
    });
    matchBoard = (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, gap: 8 }}>
          {item.ws.map((w) => {
            const done = paired.includes(w);
            const state = done ? 'done' : flash?.w === w ? 'bad' : sel === w ? 'sel' : 'idle';
            return (
              <Pressable key={'w' + w} disabled={done} onPress={() => { setSel(sel === w ? null : w); speak(words[w].word); }}
                accessibilityRole="button" accessibilityLabel={words[w].word + (done ? ', matched' : '')} accessibilityState={{ selected: sel === w, disabled: done }}
                style={({ pressed }) => cellStyle(state, pressed)}>
                <T weight="extrabold" style={{ color: state === 'done' ? t.success : state === 'bad' ? t.danger : t.text }}>{words[w].word}</T>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          {item.order.map((m) => {
            const w = item.ws[m];
            const done = paired.includes(w);
            const state = done ? 'done' : flash?.m === m ? 'bad' : 'idle';
            const text = words[w].vi || words[w].meaning;
            return (
              <Pressable key={'m' + m} disabled={done || sel === null} onPress={() => tapMeaning(m)}
                accessibilityRole="button" accessibilityLabel={text + (done ? ', matched' : '')} accessibilityHint={sel === null && !done ? 'Choose a word first' : undefined}
                accessibilityState={{ disabled: done || sel === null }}
                style={({ pressed }) => cellStyle(state, pressed)}>
                <T size={14} weight="semibold" style={{ color: state === 'done' ? t.success : state === 'bad' ? t.danger : t.text }}>{text}</T>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  let feedback = null;
  if (isMatch && matchDone) {
    const clean = item.ws.length - slips.length;
    feedback = (
      <View accessible accessibilityLiveRegion="polite" accessibilityLabel={'All pairs matched. ' + clean + ' of ' + item.ws.length + ' on the first try'}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: slips.length ? t.warningSoft : t.successSoft }}>
        <Icon name="checkc" size={20} color={slips.length ? t.warning : t.success} />
        <T weight="extrabold" style={{ flex: 1, color: slips.length ? t.warning : t.success }}>
          All matched · {clean} of {item.ws.length} on the first try
        </T>
      </View>
    );
  } else if (res) {
    feedback = (
      <View accessible accessibilityLiveRegion="polite" accessibilityLabel={(res.correct ? 'Correct. ' : 'Not quite. The answer is ') + cur.word + (cur.vi ? ', ' + cur.vi : '')}
        style={{ borderRadius: 12, padding: 12, gap: 6, backgroundColor: res.correct ? t.successSoft : t.dangerSoft }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name={res.correct ? 'checkc' : 'alert'} size={20} color={res.correct ? t.success : t.danger} />
          <T weight="extrabold" style={{ color: res.correct ? t.success : t.danger }}>{res.correct ? 'Correct!' : 'Not quite — the answer is'}</T>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 }}>
          <T size={20} weight="extrabold">{cur.word}</T>
          {cur.ipa ? <T ipa tone="muted">{cur.ipa}</T> : null}
          {cur.vi ? <T tone="muted">· {cur.vi}</T> : null}
        </View>
        {!res.correct ? <T size={13.5} tone="muted">You’ll see this word again in a moment.</T> : null}
      </View>
    );
  }

  const streak = run.streak;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 + insets.top }}>
        <IconButton name="x" label="Stop practice" onPress={close} />
        <View style={{ flex: 1 }} accessible accessibilityLabel={'Progress ' + Math.round(pct) + ' percent'}><Progress pct={pct} height={8} /></View>
        <View accessible accessibilityLabel={streak + ' correct in a row'}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 10, marginHorizontal: 4, borderRadius: 99, backgroundColor: streak ? t.orangeSoft : t.surface2 }}>
          <Icon name="flame" size={16} color={streak ? t.orange : t.faint} />
          <T size={14} weight="extrabold" style={{ color: streak ? t.orange : t.faint }}>{streak}</T>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 14, padding: 20, borderRadius: 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T size={13} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8, flex: 1 }}>{KIND_LABEL[item.kind]}</T>
            <Badge label={Math.floor(mastered / MASTERY) + ' / ' + n + ' learned'} bg={t.surface2} fg={t.muted} />
          </View>
          <T size={14} weight="bold" tone="muted">{ASK_KIND[item.kind]}</T>
          {prompt}
          {matchBoard}
          {item.kind === 'listen' || item.kind === 'meaning' ? (
            <View style={{ gap: 10 }} accessibilityRole="radiogroup">{item.opts.map(choiceRow)}</View>
          ) : null}
          {typed ? (
            <Input key={item.key} value={res ? res.answer : input} onChangeText={setInput} placeholder="Type the word…" autoFocus autoCapitalize="none" autoCorrect={false}
              spellCheck={false} returnKeyType="done" submitBehavior="blurAndSubmit" editable={!res} invalid={!!res && !res.correct}
              onSubmitEditing={() => check(input)} accessibilityLabel="Your answer" />
          ) : null}
          {feedback}
        </Card>
      </ScrollView>
      <View style={{ padding: 12, paddingBottom: insets.bottom + 12, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }}>
        {revealed
          ? <Button title="Next" icon="right" size="lg" onPress={next} block />
          : typed
            ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="I don’t know" variant="secondary" size="lg" onPress={giveUp} />
                <Button title="Check" icon="check" size="lg" onPress={() => check(input)} disabled={!input.trim()} style={{ flex: 1 }} />
              </View>
            )
            : isMatch
              ? <T size={13.5} tone="muted" center style={{ paddingVertical: 14 }}>{paired.length} of {item.ws.length} pairs matched</T>
              : <Button title="I don’t know" variant="secondary" size="lg" onPress={giveUp} block />}
      </View>
    </KeyboardAvoidingView>
  );
}
