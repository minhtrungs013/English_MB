import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isCorrect, lineParts, normAnswer, scoreColors, spokenLine } from '../../../../components/course';
import { BackBar, Badge, Button, Card, EmptyState, Icon, IconButton, Input, SectionTitle, T } from '../../../../components/ui';
import { api, type Dialogue, type ListeningDialogue } from '../../../../lib/api';
import { shuffle } from '../../../../lib/data';
import { pickDialogueVoices, speakThen, stopSpeaking, useEnglishVoices, type SpeakerVoice } from '../../../../lib/speech';
import { DayStepper, FlowDoneScreen, FlowNext, useDayFlow } from '../../../../components/day-flow';
import { errMsg, useStore, useTheme } from '../../../../state/store';

type Step = 'listen' | 'fill' | 'questions' | 'summary';
const STEP_LABEL: Record<Step, string> = { listen: 'Listen', fill: 'Fill the blanks', questions: 'Questions', summary: 'Summary' };
const SPEEDS = [0.75, 1] as const;

/** One blank, numbered across the whole dialogue: what's said (the correct fill) and the word-bank word. */
interface Blank { n: number; line: number; said: string; base: string }
/** A piece of a line for the fill step: one word of text (with its trailing space) or a blank by number. */
type Piece = { text: string } | { blank: number };

/** Splits the dialogue's lines into pieces and numbers the blanks. */
function parseDialogue(d: Dialogue): { blanks: Blank[]; lines: Piece[][] } {
  const blanks: Blank[] = [];
  const lines = d.lines.map((l, i) => {
    const pieces: Piece[] = [];
    for (const p of lineParts(l.text)) {
      if ('said' in p) {
        pieces.push({ blank: blanks.length });
        blanks.push({ n: blanks.length, line: i, said: p.said, base: p.base });
      } else {
        // Words keep their trailing space so the row wraps like a sentence.
        for (const w of p.text.match(/\S+\s*|\s+/g) ?? []) pieces.push({ text: w });
      }
    }
    return pieces;
  });
  return { blanks, lines };
}

/** The line with its blanks shown as gaps (or filled in with what's said, once revealed). */
function lineText(text: string, reveal: boolean): string {
  return lineParts(text).map((p) => ('text' in p ? p.text : reveal ? p.said : '_____')).join('');
}

/**
 * Listening practice for a course day: hear a two-person dialogue, fill its blanks from a word bank (or by typing),
 * then answer a few multiple-choice questions. Not graded; finishing (or skipping on the course page) marks it done.
 * `preview` (a bank item id) lets the course owner try a dialogue from the question bank; nothing is saved then.
 */
export default function ListeningScreen() {
  const { id, day: dayParam, preview, flow } = useLocalSearchParams<{ id: string; day: string; preview?: string; flow?: string }>();
  const day = Number(dayParam);
  const { actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [dlg, setDlg] = useState<ListeningDialogue | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');
  const [step, setStep] = useState<Step>('listen');
  const [showText, setShowText] = useState(false);
  const [showVi, setShowVi] = useState(false);
  // Fill the blanks
  const [fills, setFills] = useState<string[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [typing, setTyping] = useState(false);
  const [checked, setChecked] = useState(false);
  // Questions: the chosen choice per question
  const [picks, setPicks] = useState<(number | null)[]>([]);
  const [finishing, setFinishing] = useState(false);
  /** Opened from the Today plan: part of the guided day flow (never for an owner's preview). */
  const inFlow = flow === '1' && !preview;
  const dayFlow = useDayFlow(id, day, inFlow);
  /** In the flow: finished (the summary then offers what's next) or skipped. */
  const [flowDone, setFlowDone] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [skipping, setSkipping] = useState(false);
  // Player
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number>(1);
  const token = useRef(0);
  const speedRef = useRef(1);
  const voicesRef = useRef<SpeakerVoice[]>([]);

  useEffect(() => {
    let live = true;
    const load: Promise<ListeningDialogue | null> = preview
      ? api.courseQuestions(id, day).then((items) => {
        const q = items.find((x) => x.id === preview && x.kind === 'dialogue' && x.data);
        if (!q?.data) throw new Error('This dialogue no longer exists.');
        const bank = shuffle([...new Set(parseDialogue(q.data).blanks.map((b) => b.base))]);
        return { ...q.data, id: q.id, wordBank: bank };
      })
      : api.getListening(id, day).then((r) => r.dialogue);
    load.then((d) => { if (live) { setDlg(d); setLoaded(true); } }).catch((e) => { if (live) setErr(errMsg(e)); });
    return () => { live = false; };
  }, [id, day, preview]);

  const parsed = useMemo(() => (dlg ? parseDialogue(dlg) : null), [dlg]);
  useEffect(() => {
    if (!parsed || !dlg) return;
    setFills(parsed.blanks.map(() => ''));
    setPicks(dlg.questions.map(() => null));
  }, [parsed, dlg]);

  const englishVoices = useEnglishVoices();
  const voices = useMemo(() => (dlg ? pickDialogueVoices(englishVoices, dlg.speakers.map((s) => s.gender)) : []), [englishVoices, dlg]);
  useEffect(() => { voicesRef.current = voices; }, [voices]);
  useEffect(() => { speedRef.current = speed; }, [speed]);

  /* ---------- player ---------- */
  const stop = useCallback(() => {
    token.current++;
    stopSpeaking();
    setPlaying(false);
    setCurrent(null);
  }, []);
  /** Plays line `from` (and the ones after it with `all`). Each line has its own token, so a stop or a new play ends the chain. */
  const play = useCallback((from: number, all: boolean) => {
    if (!dlg) return;
    const go = (i: number) => {
      const mine = ++token.current;
      setCurrent(i);
      setPlaying(true);
      const line = dlg.lines[i];
      speakThen(spokenLine(line.text), (finished) => {
        if (token.current !== mine) return;
        if (finished && all && i + 1 < dlg.lines.length) go(i + 1);
        else { setPlaying(false); setCurrent(null); }
      }, speedRef.current, voicesRef.current[line.s]);
    };
    go(from);
  }, [dlg]);
  // Stop when leaving the screen (blur or unmount).
  useFocusEffect(useCallback(() => () => stop(), [stop]));

  const title = preview ? 'Preview · day ' + (dayParam ?? '') : 'Day ' + (dayParam ?? '') + ' listening';
  const back = () => { stop(); if (router.canGoBack()) router.back(); else router.replace('/'); };

  if (!dlg || !parsed) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title={title} onBack={back} />
        {err ? (
          <EmptyState icon="alert" tone="red" title="Couldn’t open the listening" text={err}>
            <Button title="Back" variant="secondary" onPress={back} />
          </EmptyState>
        ) : loaded ? (
          <EmptyState icon="volume" title="No listening for this day" text="The course owner hasn’t added a dialogue for this day.">
            <Button title="Back" variant="secondary" onPress={back} />
          </EmptyState>
        ) : <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  if (skipped) return <FlowDoneScreen title={title} flow={dayFlow} current="listening" />;

  const { blanks } = parsed;
  const qs = dlg.questions;
  const results = blanks.map((b) => isCorrect(fills[b.n] ?? '', b.said, [b.base]));
  const blanksRight = results.filter(Boolean).length;
  const questionsRight = qs.filter((q, k) => picks[k] !== null && q.choices[picks[k] ?? -1] === q.answer).length;
  const steps: Step[] = qs.length ? ['listen', 'fill', 'questions', 'summary'] : ['listen', 'fill', 'summary'];
  const stepNo = steps.indexOf(step) + 1;
  const speakerOf = (s: number) => dlg.speakers[s] ?? { name: s ? 'B' : 'A', gender: 'female' as const };
  const goStep = (s: Step) => { stop(); setStep(s); };

  /* ---------- actions ---------- */
  const firstEmpty = (after: number, list: string[]) => {
    for (let k = 1; k <= list.length; k++) {
      const j = (after + k) % list.length;
      if (!list[j]?.trim()) return j;
    }
    return null;
  };
  const tapSlot = (n: number) => {
    if (checked) return;
    // A second tap on a selected, filled blank clears it.
    if (sel === n && fills[n]) { setFills(fills.map((x, k) => (k === n ? '' : x))); return; }
    setSel(n);
  };
  const tapWord = (w: string) => {
    if (checked) return;
    const target = sel ?? firstEmpty(-1, fills);
    if (target === null) { actions.showToast('All blanks are filled. Tap one to change it.', 'bad'); return; }
    const next = fills.map((x, k) => (k === target ? w : x));
    setFills(next);
    setSel(firstEmpty(target, next));
  };
  const toggleTyping = () => {
    if (!typing && sel === null) setSel(firstEmpty(-1, fills) ?? 0);
    setTyping(!typing);
  };
  const check = () => { stop(); setChecked(true); setSel(null); setTyping(false); };
  const again = () => {
    stop();
    setFills(blanks.map(() => '')); setPicks(qs.map(() => null));
    setSel(null); setTyping(false); setChecked(false); setShowText(false); setShowVi(false); setStep('listen');
  };
  const finish = async () => {
    stop();
    if (preview) { back(); return; }
    setFinishing(true);
    const res = await actions.call(api.listeningDone(id, day, { correct: blanksRight + questionsRight, total: blanks.length + qs.length }));
    setFinishing(false);
    if (!res) return;
    actions.showToast('Listening done.');
    if (inFlow) setFlowDone(true); else back();
  };
  /** Skipping also counts as done, so the day moves on. */
  const skip = async () => {
    stop();
    setSkipping(true);
    const res = await actions.call(api.listeningDone(id, day));
    setSkipping(false);
    if (res) setSkipped(true);
  };

  /* ---------- pieces ---------- */
  const stepBar = (
    <View accessible accessibilityLabel={'Step ' + stepNo + ' of ' + steps.length + ': ' + STEP_LABEL[step]}
      style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 10 }}>
      {steps.map((s, k) => {
        const on = s === step;
        const done = k < stepNo - 1;
        return (
          <View key={s} style={{ flex: 1, gap: 5 }}>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: on ? t.primary : done ? t.success : t.surface3 }} />
            <T size={11.5} weight={on ? 'extrabold' : 'semibold'} tone={on ? 'primaryInk' : 'muted'} numberOfLines={1}>{STEP_LABEL[s]}</T>
          </View>
        );
      })}
    </View>
  );

  const speakerBadge = (s: number, size = 30) => {
    const sp = speakerOf(s);
    const female = sp.gender === 'female';
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: female ? t.dangerSoft : t.infoSoft }}>
        <T size={size > 30 ? 17 : 14} weight="extrabold" style={{ color: female ? t.danger : t.info, lineHeight: size > 30 ? 22 : 18 }}>{female ? '♀' : '♂'}</T>
      </View>
    );
  };

  const header = (
    <Card style={{ gap: 10 }}>
      <T size={20} weight="extrabold" style={{ letterSpacing: -0.3 }}>{dlg.title}</T>
      {dlg.scenario ? <T tone="muted">{dlg.scenario}</T> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {dlg.speakers.map((sp, k) => (
          <View key={k} accessible accessibilityLabel={'Speaker ' + (k + 1) + ': ' + sp.name + ', ' + (sp.gender === 'female' ? 'woman' : 'man')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4, paddingRight: 12, minHeight: 40, borderRadius: 99, backgroundColor: t.surface2 }}>
            {speakerBadge(k)}
            <T weight="bold">{sp.name}</T>
          </View>
        ))}
      </View>
    </Card>
  );

  const toggle = (label: string, on: boolean, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on }}
      style={({ pressed }) => ({ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
        borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : pressed ? t.surface2 : t.surface })}>
      <Icon name={on ? 'eye' : 'eyeOff'} size={16} color={on ? t.primaryInk : t.muted} />
      <T size={13.5} weight="bold" style={{ color: on ? t.primaryInk : t.muted }}>{label}</T>
    </Pressable>
  );

  const player = (
    <Card style={{ gap: 10, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Button title={playing ? 'Stop' : 'Play all'} icon={playing ? 'x' : 'volume'} variant={playing ? 'secondary' : 'primary'} style={{ flex: 1 }}
          accessibilityLabel={playing ? 'Stop playing' : 'Play the whole dialogue'} onPress={() => (playing ? stop() : play(0, true))} />
        <View accessibilityRole="radiogroup" accessibilityLabel="Speed" style={{ flexDirection: 'row', gap: 4, padding: 3, borderRadius: 12, backgroundColor: t.surface2 }}>
          {SPEEDS.map((s) => {
            const on = speed === s;
            return (
              <Pressable key={s} onPress={() => setSpeed(s)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={'Speed ' + s + ' times'}
                style={{ minWidth: 56, minHeight: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, backgroundColor: on ? t.surface : 'transparent', borderWidth: on ? 1 : 0, borderColor: t.border }}>
                <T size={13.5} weight="extrabold" style={{ color: on ? t.primaryInk : t.muted }}>{s}×</T>
              </Pressable>
            );
          })}
        </View>
      </View>
      <T size={12.5} tone="muted">{current !== null ? 'Playing line ' + (current + 1) + ' of ' + dlg.lines.length : 'Tap a line to hear it again.'}</T>
    </Card>
  );

  /* ---------- listen ---------- */
  const listenLines = (
    <View style={{ gap: 8 }}>
      {dlg.lines.map((l, i) => {
        const sp = speakerOf(l.s);
        const on = current === i;
        const text = lineText(l.text, checked);
        return (
          <Pressable key={i} onPress={() => play(i, false)} accessibilityRole="button"
            accessibilityLabel={'Line ' + (i + 1) + ', ' + sp.name + (showText ? ': ' + text.replace(/_____/g, 'blank') : '') + (showVi && l.vi ? '. ' + l.vi : '') + (on ? '. Playing' : '')}
            accessibilityHint="Plays this line"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 52, padding: 12, borderRadius: 14, borderWidth: on ? 1.5 : 1,
              borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : pressed ? t.surface2 : t.surface })}>
            {speakerBadge(l.s)}
            <View style={{ flex: 1, gap: 3 }}>
              <T size={12.5} weight="extrabold" tone={on ? 'primaryInk' : 'muted'}>{sp.name}{showText ? '' : ' · line ' + (i + 1)}</T>
              {showText ? <T size={15.5}>{text}</T> : null}
              {showVi && l.vi ? <T size={13.5} tone="muted" style={{ fontStyle: 'italic' }}>{l.vi}</T> : null}
            </View>
            <View style={{ paddingTop: 4 }}><Icon name="volume" size={18} color={on ? t.primaryInk : t.faint} /></View>
          </Pressable>
        );
      })}
    </View>
  );

  /* ---------- fill ---------- */
  const slot = (n: number) => {
    const b = blanks[n];
    const v = fills[n] ?? '';
    const on = sel === n && !checked;
    const ok = results[n];
    const border = checked ? (ok ? t.success : t.danger) : on ? t.primary : v ? t.border : t.faint;
    const bg = checked ? (ok ? t.successSoft : t.dangerSoft) : on ? t.primarySoft : v ? t.surface2 : t.surface;
    const label = 'Blank ' + (n + 1) + ', ' + (v ? v : 'empty')
      + (checked ? (ok ? ', correct' : ', wrong, the answer is ' + b.said) : on ? ', selected' : '');
    return (
      <Pressable key={'b' + n} onPress={() => tapSlot(n)} disabled={checked} accessibilityRole="button" accessibilityLabel={label}
        accessibilityState={{ selected: on, disabled: checked }}
        accessibilityHint={checked ? undefined : on && v ? 'Tap again to clear it' : 'Selects this blank. Then choose a word.'}
        style={({ pressed }) => ({ minHeight: 44, minWidth: 64, marginHorizontal: 2, marginVertical: 2, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1.5,
          borderStyle: !checked && !v && !on ? 'dashed' : 'solid', borderColor: border, backgroundColor: !checked && pressed ? t.surface3 : bg,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 })}>
        {checked && !ok ? (
          <>
            {v ? <T size={15} weight="semibold" style={{ color: t.danger, textDecorationLine: 'line-through' }}>{v}</T> : null}
            <T size={15} weight="extrabold" tone="success">{b.said}</T>
          </>
        ) : v ? (
          <T size={15} weight="extrabold" style={{ color: checked ? t.success : on ? t.primaryInk : t.text }}>{v}</T>
        ) : (
          <T size={13} weight="bold" style={{ color: on ? t.primaryInk : t.faint }}>{n + 1}</T>
        )}
        {checked ? <Icon name={ok ? 'check' : 'x'} size={15} color={ok ? t.success : t.danger} strokeWidth={2.4} /> : null}
      </Pressable>
    );
  };

  const fillLines = (
    <View style={{ gap: 8 }}>
      {dlg.lines.map((l, i) => {
        const sp = speakerOf(l.s);
        const on = current === i;
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingLeft: 12, paddingRight: 4, paddingVertical: 8, borderRadius: 14, borderWidth: on ? 1.5 : 1,
            borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : t.surface }}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {speakerBadge(l.s, 24)}
                <T size={12.5} weight="extrabold" tone={on ? 'primaryInk' : 'muted'}>{sp.name}</T>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                {parsed.lines[i].map((p, k) => ('blank' in p ? slot(p.blank) : <T key={k} size={15.5} style={{ lineHeight: 26 }}>{p.text}</T>))}
              </View>
              {checked && showVi && l.vi ? <T size={13.5} tone="muted" style={{ fontStyle: 'italic' }}>{l.vi}</T> : null}
            </View>
            <IconButton name="volume" label={'Play line ' + (i + 1) + ', ' + sp.name} color={on ? t.primaryInk : t.muted} onPress={() => play(i, false)} />
          </View>
        );
      })}
    </View>
  );

  const used = (w: string) => fills.filter((x) => normAnswer(x) === normAnswer(w)).length;
  const needed = (w: string) => blanks.filter((b) => normAnswer(b.base) === normAnswer(w)).length || 1;
  const bank = dlg.wordBank.length ? dlg.wordBank : [...new Set(blanks.map((b) => b.base))];
  const filledCount = fills.filter((x) => x.trim()).length;

  const wordBank = (
    <Card style={{ gap: 10, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <SectionTitle style={{ flex: 1 }}>{typing ? 'Type the missing word' : 'Word bank'}</SectionTitle>
        <Button title={typing ? 'Use the word bank' : 'Type instead'} icon={typing ? 'grid' : 'type'} variant="ghost" size="sm" style={{ minHeight: 44 }} onPress={toggleTyping} />
      </View>
      {typing ? (
        sel !== null ? (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <IconButton name="left" label="Previous blank" onPress={() => setSel((sel - 1 + blanks.length) % blanks.length)} />
              <T weight="bold" center style={{ flex: 1 }}>Blank {sel + 1} of {blanks.length}</T>
              <IconButton name="right" label="Next blank" onPress={() => setSel((sel + 1) % blanks.length)} />
            </View>
            <Input key={sel} value={fills[sel] ?? ''} onChangeText={(v) => setFills(fills.map((x, k) => (k === sel ? v : x)))} placeholder="Type the word you hear…"
              autoFocus autoCapitalize="none" autoCorrect={false} spellCheck={false} returnKeyType="next" submitBehavior="submit"
              onSubmitEditing={() => setSel(firstEmpty(sel, fills) ?? sel)} accessibilityLabel={'Answer for blank ' + (sel + 1)} />
          </View>
        ) : <T size={13.5} tone="muted">Tap a blank to type in it.</T>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {bank.map((w) => {
              const dim = used(w) >= needed(w);
              return (
                <Pressable key={w} onPress={() => tapWord(w)} accessibilityRole="button" accessibilityLabel={w + (dim ? ', used' : '')}
                  accessibilityHint={sel !== null ? 'Puts this word in blank ' + (sel + 1) : 'Puts this word in the next empty blank'}
                  style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, justifyContent: 'center',
                    borderColor: dim ? t.border : t.primary, backgroundColor: pressed ? t.primarySoft : dim ? t.surface2 : t.surface, opacity: dim ? 0.5 : 1 })}>
                  <T size={14.5} weight="bold" style={{ color: dim ? t.muted : t.primaryInk }}>{w}</T>
                </Pressable>
              );
            })}
          </View>
          <T size={12.5} tone="muted">Tap a blank, then a word. Tap a filled blank twice to clear it.</T>
        </>
      )}
    </Card>
  );

  const fillResult = checked ? (
    <View accessible accessibilityLiveRegion="polite" accessibilityLabel={blanksRight + ' of ' + blanks.length + ' blanks correct'}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: blanksRight === blanks.length ? t.successSoft : t.warningSoft }}>
      <Icon name={blanksRight === blanks.length ? 'checkc' : 'alert'} size={20} color={blanksRight === blanks.length ? t.success : t.warning} />
      <T weight="extrabold" style={{ flex: 1, color: blanksRight === blanks.length ? t.success : t.warning }}>
        {blanksRight} of {blanks.length} blanks correct
      </T>
    </View>
  ) : null;

  /* ---------- questions ---------- */
  const choose = (qi: number, k: number) => {
    if (picks[qi] !== null && picks[qi] !== undefined) return;
    setPicks(picks.map((x, j) => (j === qi ? k : x)));
  };
  const questionCards = qs.map((q, qi) => {
    const pick = picks[qi] ?? null;
    const answered = pick !== null;
    const right = answered && q.choices[pick] === q.answer;
    return (
      <Card key={qi} style={{ gap: 12, padding: 16 }}>
        <SectionTitle>Question {qi + 1} of {qs.length}</SectionTitle>
        <T size={16} weight="bold">{q.question}</T>
        <View style={{ gap: 8 }} accessibilityRole="radiogroup">
          {q.choices.map((o, k) => {
            const picked = pick === k;
            const isAnswer = answered && o === q.answer;
            const border = isAnswer ? t.success : picked ? t.danger : t.border;
            const bg = isAnswer ? t.successSoft : picked ? t.dangerSoft : t.surface;
            return (
              <Pressable key={k} onPress={() => choose(qi, k)} disabled={answered} accessibilityRole="radio" accessibilityState={{ checked: picked, disabled: answered }}
                accessibilityLabel={'Choice ' + 'ABCD'.charAt(k) + ': ' + o + (isAnswer ? ', correct answer' : picked ? ', your answer, wrong' : '')}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, padding: 10, borderRadius: 12, borderWidth: 1.5,
                  borderColor: border, backgroundColor: !answered && pressed ? t.surface2 : bg })}>
                <View style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: isAnswer ? t.success : picked ? t.danger : t.surface2 }}>
                  <T size={13} weight="extrabold" style={{ color: isAnswer || picked ? '#fff' : t.muted }}>{'ABCD'.charAt(k) || String(k + 1)}</T>
                </View>
                <T weight="semibold" style={{ flex: 1, color: isAnswer ? t.success : picked ? t.danger : t.text }}>{o}</T>
                {isAnswer ? <Icon name="checkc" size={18} color={t.success} /> : picked ? <Icon name="x" size={18} color={t.danger} /> : null}
              </Pressable>
            );
          })}
        </View>
        {answered ? (
          <View accessible accessibilityLiveRegion="polite" accessibilityLabel={(right ? 'Correct. ' : 'Not quite. The answer is ' + q.answer + '. ') + q.explain}
            style={{ borderRadius: 12, padding: 12, gap: 6, backgroundColor: right ? t.successSoft : t.dangerSoft }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name={right ? 'checkc' : 'alert'} size={18} color={right ? t.success : t.danger} />
              <T weight="extrabold" style={{ flex: 1, color: right ? t.success : t.danger }}>{right ? 'Correct!' : 'Not quite — the answer is “' + q.answer + '”'}</T>
            </View>
            {q.explain ? <T size={13.5}>{q.explain}</T> : null}
          </View>
        ) : null}
      </Card>
    );
  });
  const allAnswered = picks.every((x) => x !== null);

  /* ---------- layout ---------- */
  let body = null;
  let footer = null;
  if (step === 'listen') {
    body = (
      <>
        {header}
        {player}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {toggle('Transcript', showText, () => setShowText(!showText))}
          {toggle('Translation', showVi, () => setShowVi(!showVi))}
        </View>
        {listenLines}
      </>
    );
    footer = inFlow ? (
      <View style={{ gap: 6 }}>
        <Button title="Next: fill the blanks" icon="right" size="lg" onPress={() => goStep('fill')} block />
        <Button title="Skip listening" variant="ghost" loading={skipping} onPress={() => void skip()} block />
      </View>
    ) : <Button title="Next: fill the blanks" icon="right" size="lg" onPress={() => goStep('fill')} block />;
  } else if (step === 'fill') {
    body = (
      <>
        <T size={14} weight="bold" tone="muted">Listen again and fill each blank with the word you hear.</T>
        {player}
        {fillLines}
        {checked ? (
          <>
            {fillResult}
            {toggle('Translation', showVi, () => setShowVi(!showVi))}
          </>
        ) : wordBank}
      </>
    );
    footer = checked
      ? <Button title={qs.length ? 'Next: questions' : 'See results'} icon="right" size="lg" onPress={() => goStep(qs.length ? 'questions' : 'summary')} block />
      : (
        <View style={{ gap: 4 }}>
          <Button title="Check" icon="check" size="lg" disabled={!filledCount} onPress={check} block
            accessibilityLabel={'Check, ' + filledCount + ' of ' + blanks.length + ' blanks filled'} />
          <T size={12.5} tone="muted" center>{filledCount} of {blanks.length} filled</T>
        </View>
      );
  } else if (step === 'questions') {
    body = (
      <>
        <T size={14} weight="bold" tone="muted">Answer the questions about the dialogue. You can play it again.</T>
        {player}
        {questionCards}
      </>
    );
    footer = <Button title="See results" icon="right" size="lg" disabled={!allAnswered} onPress={() => goStep('summary')} block />;
  } else {
    const total = blanks.length + qs.length;
    const pct = total ? Math.round(((blanksRight + questionsRight) / total) * 100) : 0;
    const [sBg, sFg] = scoreColors(pct, t);
    body = (
      <>
        <Card style={{ alignItems: 'center', gap: 8, padding: 24 }}>
          <SectionTitle>Listening done</SectionTitle>
          <View accessible accessibilityLabel={pct + ' percent correct'}
            style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: sBg, alignItems: 'center', justifyContent: 'center' }}>
            <T size={34} weight="extrabold" style={{ color: sFg, lineHeight: 42 }}>{pct}%</T>
          </View>
          <T size={20} weight="extrabold" center>{pct >= 80 ? 'Great listening!' : pct >= 50 ? 'Nice work!' : 'Keep practising!'}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            <View accessible accessibilityLabel={'Blanks: ' + blanksRight + ' of ' + blanks.length + ' correct'}>
              <Badge label={'Blanks ' + blanksRight + '/' + blanks.length} bg={t.surface2} fg={t.text} />
            </View>
            {qs.length ? (
              <View accessible accessibilityLabel={'Questions: ' + questionsRight + ' of ' + qs.length + ' correct'}>
                <Badge label={'Questions ' + questionsRight + '/' + qs.length} bg={t.surface2} fg={t.text} />
              </View>
            ) : null}
          </View>
          {preview ? <T size={13} tone="muted" center>Preview — nothing is saved.</T> : null}
        </Card>
        {flowDone ? <FlowNext flow={dayFlow} current="listening" /> : (
          <Button title={preview ? 'Close preview' : 'Finish'} icon="check" size="lg" loading={finishing} onPress={() => void finish()} block
            accessibilityLabel={preview ? 'Close preview' : 'Finish and mark today’s listening as done'} />
        )}
        <Button title="Practise again" icon="refresh" variant="secondary" onPress={again} block />
        <SectionTitle style={{ marginTop: 4 }}>Transcript</SectionTitle>
        {dlg.lines.map((l, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingLeft: 12, paddingRight: 4, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: current === i ? t.primary : t.border, backgroundColor: current === i ? t.primarySoft : t.surface }}>
            <View style={{ flex: 1, gap: 3 }}>
              <T size={12.5} weight="extrabold" tone="muted">{speakerOf(l.s).name}</T>
              <T size={15}>{spokenLine(l.text)}</T>
              {l.vi ? <T size={13.5} tone="muted" style={{ fontStyle: 'italic' }}>{l.vi}</T> : null}
            </View>
            <IconButton name="volume" label={'Play line ' + (i + 1)} color={t.primaryInk} onPress={() => play(i, false)} />
          </View>
        ))}
      </>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackBar title={title} onBack={back} />
      {inFlow ? <DayStepper flow={dayFlow} current="listening" currentDone={flowDone} /> : null}
      {stepBar}
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {preview && step === 'listen' ? (
          <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: t.infoSoft }}>
            <Icon name="eye" size={18} color={t.info} />
            <T size={13.5} style={{ flex: 1, color: t.info }}>Preview of how learners see this dialogue. Nothing is saved.</T>
          </View>
        ) : null}
        {body}
      </ScrollView>
      {footer ? (
        <View style={{ padding: 12, paddingBottom: insets.bottom + 12, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }}>{footer}</View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
