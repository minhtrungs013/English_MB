import { router } from 'expo-router';
import { useCallback, useEffect, type ReactNode } from 'react';
import { Alert, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GrammarAnswer, GrammarQuestion, GrammarResultItem } from '../lib/api';
import { useTheme } from '../state/store';
import { ASK, isCorrect, Progress, TenseNote } from './course';
import { LessonLink, VerbFormsLink } from './grammar';
import { Button, Card, Icon, IconButton, Input, T } from './ui';

/* ---------- answers ---------- */

/** What the learner has entered for one question: `answer` (typed / chosen / the correction), `pick` (fixError), `answers` (cloze). */
export interface QuizAnswer { answer: string; pick: number | null; answers: string[] }

export const emptyAnswer = (q: GrammarQuestion): QuizAnswer => ({ answer: '', pick: null, answers: q.kind === 'cloze' ? Array.from({ length: q.blanks }, () => '') : [] });

/** True once the question is fully answered (fixError: a word picked and a correction typed; cloze: every blank filled). */
export function isAnswered(q: GrammarQuestion, a: QuizAnswer | undefined): boolean {
  if (!a) return false;
  if (q.kind === 'fixError') return a.pick != null && !!a.answer.trim();
  if (q.kind === 'cloze') return a.answers.length > 0 && a.answers.every((x) => x.trim());
  return !!a.answer.trim();
}

/** The answer as the server expects it. */
export function toPayload(q: GrammarQuestion, a: QuizAnswer | undefined): GrammarAnswer {
  const x = a ?? emptyAnswer(q);
  if (q.kind === 'cloze') return { id: q.id, answers: x.answers.map((s) => s.trim()) };
  if (q.kind === 'fixError') return x.pick != null ? { id: q.id, pick: x.pick, answer: x.answer.trim() } : { id: q.id, answer: x.answer.trim() };
  return { id: q.id, answer: x.answer.trim() };
}

/** "Check now?" when some questions aren't fully answered, then `send`. */
export function confirmCheck(qs: GrammarQuestion[], answers: QuizAnswer[], send: () => void) {
  const empty = qs.filter((q, k) => !isAnswered(q, answers[k])).length;
  if (!empty) { send(); return; }
  Alert.alert('Check now?', empty + (empty === 1 ? ' question isn’t' : ' questions aren’t') + ' fully answered and will count as wrong.', [
    { text: 'Keep answering', style: 'cancel' },
    { text: 'Check answers', onPress: send }
  ]);
}

/** Confirms before leaving a quiz with answers (close button and the Android back button). */
export function useLeaveGuard(inQuiz: boolean, what = 'practice'): () => void {
  const leave = useCallback(() => {
    if (!inQuiz) { router.back(); return; }
    Alert.alert('Leave the ' + what + '?', 'Your answers so far will be lost.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => router.back() }
    ]);
  }, [inQuiz, what]);
  useEffect(() => {
    if (!inQuiz) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { leave(); return true; });
    return () => sub.remove();
  }, [inQuiz, leave]);
  return leave;
}

/* ---------- prompt helpers ---------- */

/** Circled number for cloze blank k (0-based): ① ② ③ … (plain "(13)" beyond 20). */
export const blankMark = (k: number) => (k < 20 ? String.fromCharCode(0x2460 + k) : '(' + (k + 1) + ')');

/** A cloze paragraph split at its "___" blanks: text parts (one more than the blanks) and each blank's "(verb)" hint. */
export function clozeParts(prompt: string): { texts: string[]; hints: string[] } {
  const texts = prompt.split('___');
  const hints = texts.slice(1).map((s) => /^\s*\(([^)]*)\)/.exec(s)?.[1] ?? '');
  return { texts, hints };
}

/** The cloze paragraph with ① ② ③ in place of the blanks. */
function ClozeText({ prompt, size = 16, marks }: { prompt: string; size?: number; marks?: (k: number) => ReactNode }) {
  const t = useTheme();
  const { texts } = clozeParts(prompt);
  return (
    <T size={size} style={{ lineHeight: Math.round(size * 1.7) }}>
      {texts.map((s, k) => (
        <T key={k} size={size}>
          {s}
          {k < texts.length - 1 ? (marks ? marks(k) : <T size={size} weight="extrabold" style={{ color: t.primaryInk }}> {blankMark(k)} </T>) : null}
        </T>
      ))}
    </T>
  );
}

/** "She [[has worked]] here": the bracketed part highlighted. */
export function Highlighted({ text, size = 19, weight = 'extrabold' }: { text: string; size?: number; weight?: 'bold' | 'extrabold' }) {
  const t = useTheme();
  const parts = text.split(/\[\[(.+?)\]\]/);
  return (
    <T size={size} weight={weight}>
      {parts.map((p, k) => (k % 2
        ? <T key={k} size={size} weight="extrabold" style={{ color: t.primaryInk, backgroundColor: t.primarySoft, textDecorationLine: 'underline' }}>{p}</T>
        : p))}
    </T>
  );
}
const plain = (s: string) => s.replace(/\[\[(.+?)\]\]/g, '$1');

/* ---------- question ---------- */

const INSTRUCTION: Record<GrammarQuestion['kind'], string> = {
  tense: ASK.tense,
  tenseChoice: ASK.tenseChoice,
  identify: 'Which tense is the highlighted part?',
  fixError: 'Tap the wrong word, then type the correction.',
  cloze: 'Fill in each blank: put the verb in brackets in the right tense.'
};
/** Typed tense question (kind 'tense', or an old multiple-choice one without choices). */
const isTypedTense = (q: GrammarQuestion) => q.kind === 'tense' || (q.kind === 'tenseChoice' && !q.choices.length);

/** Lettered choices (A–D), one can be picked; tapping the picked one again clears it. */
function Choices({ options, value, onChange, disabled }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; disabled: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }} accessibilityRole="radiogroup">
      {options.map((o, k) => {
        const on = value === o.value;
        const letter = 'ABCDEFGH'.charAt(k) || String(k + 1);
        return (
          <Pressable key={k} onPress={() => onChange(on ? '' : o.value)} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: on, disabled }}
            accessibilityLabel={'Choice ' + letter + ': ' + o.label}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, padding: 12, borderRadius: 12, borderWidth: 1.5,
              borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : pressed ? t.surface2 : t.surface })}>
            <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.primary : t.surface2 }}>
              <T size={13} weight="extrabold" style={{ color: on ? '#fff' : t.muted }}>{letter}</T>
            </View>
            <T weight="semibold" style={{ flex: 1, color: on ? t.primaryInk : t.text }}>{o.label}</T>
            {on ? <Icon name="check" size={18} color={t.primaryInk} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** One question: the instruction, the prompt and the way to answer it. */
function QuestionBody({ q, a, setA, n, last, sending, onSubmit }: {
  q: GrammarQuestion; a: QuizAnswer; setA: (p: Partial<QuizAnswer>) => void; n: number; last: boolean; sending: boolean; onSubmit: () => void;
}) {
  const t = useTheme();
  const instruction = <T size={14} weight="bold" tone="muted">{INSTRUCTION[isTypedTense(q) ? 'tense' : q.kind]}</T>;

  if (q.kind === 'identify') {
    return (
      <>
        {instruction}
        <Highlighted text={q.prompt} />
        <Choices options={q.choices.map((c, k) => ({ value: c, label: q.labels[k] ?? c }))} value={a.answer} onChange={(v) => setA({ answer: v })} disabled={sending} />
      </>
    );
  }

  if (q.kind === 'fixError') {
    return (
      <>
        {instruction}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Words of the sentence">
          {q.tokens.map((tok, k) => {
            const on = a.pick === k;
            return (
              <Pressable key={k} onPress={() => setA({ pick: on ? null : k })} disabled={sending} accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled: sending }} accessibilityLabel={'Word ' + (k + 1) + ': ' + tok}
                style={({ pressed }) => ({ minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
                  borderColor: on ? t.danger : t.border, backgroundColor: on ? t.dangerSoft : pressed ? t.surface2 : t.surface })}>
                <T size={17} weight="bold" style={{ color: on ? t.danger : t.text, textDecorationLine: on ? 'line-through' : 'none' }}>{tok}</T>
              </Pressable>
            );
          })}
        </View>
        {a.pick != null ? (
          <View style={{ gap: 6 }}>
            <T size={13.5} weight="bold">Correction for “{q.tokens[a.pick]}”</T>
            <Input key={'fix' + n} value={a.answer} onChangeText={(v) => setA({ answer: v })} placeholder="Type the correct word(s)…" autoFocus autoCapitalize="none"
              autoCorrect={false} spellCheck={false} maxLength={200} returnKeyType={last ? 'done' : 'next'} submitBehavior={last ? 'blurAndSubmit' : 'submit'}
              onSubmitEditing={onSubmit} editable={!sending} accessibilityLabel={'Correction for ' + q.tokens[a.pick]} />
            <T size={12.5} tone="muted">Type only the replacement words — e.g. “doesn’t”.</T>
          </View>
        ) : <T size={12.5} tone="muted">Tap a word to pick it; tap it again to unpick it.</T>}
      </>
    );
  }

  if (q.kind === 'cloze') {
    const { hints } = clozeParts(q.prompt);
    const setBlank = (k: number, v: string) => setA({ answers: Array.from({ length: q.blanks }, (_, j) => (j === k ? v : a.answers[j] ?? '')) });
    return (
      <>
        {instruction}
        {q.title ? <T size={18} weight="extrabold">{q.title}</T> : null}
        <View style={{ padding: 12, borderRadius: 12, backgroundColor: t.surface2 }}>
          <ClozeText prompt={q.prompt} />
        </View>
        <View style={{ gap: 10 }}>
          {Array.from({ length: q.blanks }, (_, k) => {
            const label = 'Blank ' + (k + 1) + (hints[k] ? ' (' + hints[k] + ')' : '');
            return (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ minWidth: 64, maxWidth: 120 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <T size={15} weight="extrabold" tone="primaryInk">{blankMark(k)} <T size={13} weight="semibold" tone="muted">{hints[k] ? '(' + hints[k] + ')' : ''}</T></T>
                </View>
                <View style={{ flex: 1 }}>
                  <Input key={n + '-' + k} value={a.answers[k] ?? ''} onChangeText={(v) => setBlank(k, v)} placeholder="Verb form…" autoCapitalize="none" autoCorrect={false}
                    spellCheck={false} maxLength={200} autoFocus={k === 0} returnKeyType="done" submitBehavior="blurAndSubmit" editable={!sending} accessibilityLabel={label} />
                </View>
              </View>
            );
          })}
        </View>
        <T size={12.5} tone="muted">Type only the missing words for each blank — e.g. “has finished”.</T>
      </>
    );
  }

  if (isTypedTense(q)) {
    return (
      <>
        {instruction}
        <T size={19} weight="extrabold">{q.prompt}</T>
        <Input key={'t' + n} value={a.answer} onChangeText={(v) => setA({ answer: v })} placeholder="Type the verb form…" autoFocus autoCapitalize="none" autoCorrect={false}
          spellCheck={false} maxLength={200} returnKeyType={last ? 'done' : 'next'} submitBehavior={last ? 'blurAndSubmit' : 'submit'}
          onSubmitEditing={onSubmit} editable={!sending} accessibilityLabel={'Answer to question ' + n} />
        <T size={12.5} tone="muted">Type only the missing words — e.g. “has finished”, not “She has finished”.</T>
      </>
    );
  }

  return (
    <>
      {instruction}
      <T size={19} weight="extrabold">{q.prompt}</T>
      <Choices options={q.choices.map((c) => ({ value: c, label: c }))} value={a.answer} onChange={(v) => setA({ answer: v })} disabled={sending} />
    </>
  );
}

/** The quiz screen: progress, one question at a time, Back / Next / Check answers. */
export function QuizView({ title, qs, answers, setAnswers, i, setI, sending, onCheck, onLeave, leaveLabel = 'Leave practice' }: {
  title: string; qs: GrammarQuestion[]; answers: QuizAnswer[]; setAnswers: (f: (prev: QuizAnswer[]) => QuizAnswer[]) => void;
  i: number; setI: (i: number) => void; sending: boolean; onCheck: () => void; onLeave: () => void; leaveLabel?: string;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const n = qs.length;
  const q = qs[i];
  const a = answers[i] ?? emptyAnswer(q);
  const last = i === n - 1;
  const setA = (p: Partial<QuizAnswer>) => setAnswers((prev) => prev.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const next = () => { if (!last) setI(i + 1); };
  const done = qs.filter((x, k) => isAnswered(x, answers[k])).length;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56 + insets.top }}>
        <IconButton name="x" label={leaveLabel} onPress={onLeave} />
        <View style={{ flex: 1 }}><Progress pct={((i + 1) / n) * 100} height={8} /></View>
        <T size={14} weight="bold" tone="muted" style={{ paddingHorizontal: 8 }}>{i + 1} / {n}</T>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 14, padding: 20, borderRadius: 22 }}>
          <T size={13} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>{title} · question {i + 1} of {n}</T>
          <QuestionBody key={i} q={q} a={a} setA={setA} n={i + 1} last={last} sending={sending} onSubmit={() => (last ? onCheck() : next())} />
        </Card>
        <T size={13} tone="muted" center>{done} of {n} answered</T>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10, padding: 12, paddingBottom: insets.bottom + 12, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }}>
        <Button title="Back" icon="left" variant="secondary" size="lg" onPress={() => setI(i - 1)} disabled={i === 0 || sending} style={{ flex: 1 }} />
        {last
          ? <Button title="Check answers" icon="check" size="lg" onPress={onCheck} loading={sending} style={{ flex: 1.4 }} />
          : <Button title="Next" icon="right" size="lg" onPress={next} disabled={sending} style={{ flex: 1.4 }} />}
      </View>
    </KeyboardAvoidingView>
  );
}

/* ---------- results ---------- */

/** A colored "Your answer" / "Correct" line. */
function AnswerLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: ok ? t.successSoft : t.dangerSoft }}>
      <T size={13.5} weight="semibold" style={{ color: ok ? t.success : t.danger }}>{children}</T>
    </View>
  );
}

/** What a screen reader says for a result. */
function resultLabel(r: GrammarResultItem, k: number): string {
  const head = 'Question ' + (k + 1) + ', ' + (r.correct ? 'correct' : 'wrong') + '. ';
  const note = (r.tenseLabel ? '. ' + r.tenseLabel : '') + (r.explain ? '. ' + r.explain : '');
  if (r.kind === 'identify') {
    return head + r.prompt + '. Highlighted: ' + (/\[\[(.+?)\]\]/.exec(r.highlight)?.[1] ?? '') + '. Your answer: ' + (r.yourLabel || 'empty')
      + (r.correct ? '' : '. Correct answer: ' + r.answerLabel) + note;
  }
  if (r.kind === 'fixError') {
    const picked = r.pick != null ? r.tokens[r.pick] ?? '' : '';
    return head + r.prompt + '. ' + (picked ? 'You picked ' + picked + ', ' + (r.pickRight ? 'right' : 'wrong') : 'You didn’t pick a word')
      + '. Wrong word: ' + r.wrongTokens.map((x) => r.tokens[x]).join(' ') + '. Correction: ' + r.answer + ', you wrote ' + (r.yourAnswer || 'nothing') + note;
  }
  if (r.kind === 'cloze') {
    return head + (r.title ? r.title + '. ' : '') + r.score.correct + ' of ' + r.score.total + ' blanks right. '
      + r.blanks.map((b, j) => 'Blank ' + (j + 1) + ': ' + (b.correct ? 'right' : 'wrong') + ', you wrote ' + (b.yourAnswer || 'nothing') + (b.correct ? '' : ', correct: ' + b.answer)
        + (b.tenseLabel ? ', ' + b.tenseLabel : '') + (b.explain ? ', ' + b.explain : '')).join('. ');
  }
  return head + r.prompt + '. Your answer: ' + (r.yourAnswer || 'empty') + (r.correct ? '' : '. Correct answer: ' + r.answer) + note;
}

function ResultBody({ r }: { r: GrammarResultItem }) {
  const t = useTheme();
  if (r.kind === 'identify') {
    return (
      <>
        <Highlighted text={r.highlight || r.prompt} size={15} weight="bold" />
        <AnswerLine ok={r.correct}>Your answer: {r.yourLabel || '— (empty)'}</AnswerLine>
        {!r.correct ? <AnswerLine ok>Correct: {r.answerLabel}</AnswerLine> : null}
        <TenseNote label={r.tenseLabel} explain={r.explain} />
      </>
    );
  }
  if (r.kind === 'fixError') {
    const picked = r.pick != null ? r.tokens[r.pick] : undefined;
    // The server only says whether both parts are right; the correction alone is checked here (without the accepted variants).
    const fixOk = r.fixRight ?? (r.correct || isCorrect(r.yourAnswer, r.answer));
    return (
      <>
        <T weight="bold">
          {r.tokens.map((tok, j) => {
            const wrong = r.wrongTokens.includes(j);
            const mine = r.pick === j && !wrong;
            return (
              <T key={j} weight="bold" style={wrong ? { color: t.danger, backgroundColor: t.dangerSoft, textDecorationLine: 'line-through' } : mine ? { textDecorationLine: 'underline', color: t.warning } : undefined}>
                {tok}{j < r.tokens.length - 1 ? ' ' : ''}
              </T>
            );
          })}
        </T>
        <AnswerLine ok={r.pickRight}>
          {picked != null ? 'You picked “' + picked + '” ' + (r.pickRight ? '✓' : '✗') : 'You didn’t pick a word ✗'}
        </AnswerLine>
        <AnswerLine ok={fixOk}>
          Correction: {r.answer} {fixOk ? '✓' : '(you wrote ' + (r.yourAnswer ? '“' + r.yourAnswer + '”' : 'nothing') + ')'}
        </AnswerLine>
        <TenseNote label={r.tenseLabel} explain={r.explain} />
      </>
    );
  }
  if (r.kind === 'cloze') {
    const fg = r.score.correct === r.score.total ? t.success : r.score.correct ? t.warning : t.danger;
    return (
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {r.title ? <T weight="extrabold" style={{ flex: 1 }}>{r.title}</T> : <View style={{ flex: 1 }} />}
          <T size={13.5} weight="extrabold" style={{ color: fg }}>{r.score.correct}/{r.score.total} blanks</T>
        </View>
        <ClozeText prompt={r.prompt} size={14.5} marks={(j) => {
          const b = r.blanks[j];
          return <T size={14.5} weight="extrabold" style={{ color: b?.correct ? t.success : t.danger }}> {blankMark(j)} {b?.answer ?? ''} </T>;
        }} />
        {r.blanks.map((b, j) => (
          <View key={j} style={{ gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T size={15} weight="extrabold" tone="primaryInk">{blankMark(j)}</T>
              <View style={{ flex: 1 }}><AnswerLine ok={b.correct}>{b.yourAnswer || '— (empty)'} {b.correct ? '✓' : '✗'}</AnswerLine></View>
            </View>
            {!b.correct ? <AnswerLine ok>Correct: {b.answer}</AnswerLine> : null}
            <TenseNote label={b.tenseLabel} explain={b.explain} />
          </View>
        ))}
        {r.explain ? <TenseNote explain={r.explain} /> : null}
      </>
    );
  }
  return (
    <>
      <T weight="bold">{plain(r.prompt)}</T>
      <AnswerLine ok={r.correct}>Your answer: {r.yourAnswer || '— (empty)'}</AnswerLine>
      {!r.correct ? <AnswerLine ok>Correct: {r.answer}</AnswerLine> : null}
      <TenseNote label={r.tenseLabel} explain={r.explain} />
    </>
  );
}

/** Wrong cloze blanks with an irregular verb: one link per verb (the first blank that uses it). */
function clozeVerbs(r: GrammarResultItem): { verb: string; k: number }[] {
  if (r.kind !== 'cloze') return [];
  const seen = new Set<string>();
  return r.blanks.flatMap((b, k) => {
    const v = b.verb?.trim();
    if (b.correct || !v || seen.has(v.toLowerCase())) return [];
    seen.add(v.toLowerCase());
    return [{ verb: v, k }];
  });
}

/** One graded answer; when it's wrong, links to the lesson and to the V1 – V2 – V3 of its irregular verb(s). */
export function ResultCard({ r, k }: { r: GrammarResultItem; k: number }) {
  const t = useTheme();
  const fg = r.correct ? t.success : t.danger;
  return (
    <View style={{ backgroundColor: t.surface, borderColor: r.correct ? t.border : t.danger, borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 }}>
      <View accessible style={{ gap: 6 }} accessibilityLabel={resultLabel(r, k)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={r.correct ? 'checkc' : 'alert'} size={18} color={fg} />
          <T size={13} weight="extrabold" tone="muted">Question {k + 1}</T>
        </View>
        <ResultBody r={r} />
      </View>
      {!r.correct ? <LessonLink lesson={r.tense || r.lesson} title="Review the lesson" /> : null}
      {!r.correct && r.kind !== 'cloze' ? <VerbFormsLink verb={r.verb} /> : null}
      {clozeVerbs(r).map(({ verb, k: j }) => <VerbFormsLink key={verb} verb={verb} prefix={blankMark(j)} prefixLabel={'Blank ' + (j + 1)} />)}
    </View>
  );
}
