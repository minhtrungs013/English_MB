import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import type { DictationGrade, DictationGroup, DictationQuestion, DictationSetSummary, DictationToken } from '../lib/api';
import { shuffle, type Word } from '../lib/data';
import { useTheme } from '../state/store';
import { masteryLabel, MasteryBar } from './grammar';
import { Icon, T } from './ui';

/** Practice mode for "From my words" (built on the device, graded with POST /dictation/grade). */
export const MINE = 'mine';
/** Most items in one round. */
export const DICTATION_N = 10;
/** The server's limit for one typed answer / one sentence. */
export const MAX_TYPED = 400;

export const GROUP_TITLE: Record<DictationGroup, string> = { basics: 'Basics', sentences: 'Sentences', passages: 'Passages' };
export const GROUPS: DictationGroup[] = ['basics', 'sentences', 'passages'];

/**
 * "From my words": up to 10 items from my saved words — each word's example sentence when it has one;
 * when fewer than 3 words have one, the words themselves fill the round. Empty when I have no words.
 */
export function myWordsItems(words: Word[]): DictationQuestion[] {
  const withEx = words.filter((w) => w.ex.trim() && w.ex.trim().length <= MAX_TYPED);
  const picked = shuffle(withEx).slice(0, DICTATION_N).map((w) => ({ w, text: w.ex.trim() }));
  if (picked.length < 3) {
    const used = new Set(picked.map((p) => p.w.id));
    const rest = shuffle(words.filter((w) => !used.has(w.id) && w.word.trim())).slice(0, DICTATION_N - picked.length);
    picked.push(...rest.map((w) => ({ w, text: w.word.trim() })));
  }
  return picked.map(({ w, text }, k) => ({
    id: MINE + ':' + k + ':' + w.id, kind: 'line', level: 'easy', text,
    // Shown after checking: the word and its meaning (my examples have no translation).
    vi: text === w.word.trim() ? w.vi || w.meaning : w.word + (w.vi || w.meaning ? ' — ' + (w.vi || w.meaning) : '')
  }));
}

/** True when "From my words" can start (I have at least one saved word). */
export const canPractiseMine = (words: Word[]) => words.some((w) => w.word.trim());

/* ---------- hints ---------- */

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);
/** Hint 1: one "_" per word. */
export const hintCount = (text: string) => words(text).map(() => '_').join(' ');
/** Hint 2: first letter of each word, the other letters as "_" (punctuation kept). */
export const hintLetters = (text: string) =>
  words(text).map((w) => {
    let first = true;
    return w.replace(/[A-Za-z0-9À-ɏ]/g, (c) => {
      if (first) { first = false; return c; }
      return '_';
    });
  }).join(' ');
export const HINT_TITLE = ['', 'Number of words', 'First letters', 'Answer shown'];

/** The hint text for a sentence at hint level 1–3. */
export function hintText(text: string, level: number): string {
  if (level >= 3) return text;
  if (level === 2) return hintLetters(text);
  if (level === 1) return hintCount(text);
  return '';
}

/* ---------- feedback ---------- */

/** What a screen reader says for one graded sentence. */
export function gradeLabel(g: DictationGrade): string {
  const parts = g.tokens.flatMap((tk) => {
    switch (tk.status) {
      case 'missing': return ['Missing word: ' + (tk.expected ?? '')];
      case 'extra': return ['Extra word: ' + (tk.typed ?? '')];
      case 'wrong': return ['You typed ‘' + (tk.typed ?? '') + '’, expected ‘' + (tk.expected ?? '') + '’'];
      case 'near': return ['Small typo: you typed ‘' + (tk.typed ?? '') + '’, expected ‘' + (tk.expected ?? '') + '’'];
      default: return [];
    }
  });
  return g.correct + ' of ' + g.total + ' words right, score ' + g.score + '%. ' + (parts.length ? parts.join('. ') + '.' : 'Every word is right.');
}

function Token({ tk }: { tk: DictationToken }) {
  const t = useTheme();
  const box = { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 } as const;
  if (tk.status === 'ok') {
    return <View style={box}><T size={16} weight="semibold" style={{ color: t.success }}>{tk.expected ?? tk.typed}</T></View>;
  }
  if (tk.status === 'near') {
    return (
      <View style={[box, { backgroundColor: t.warningSoft }]}>
        <T size={16} weight="bold" style={{ color: t.warning }}>{tk.expected}</T>
        <T size={11} weight="semibold" style={{ color: t.warning }}>typo: {tk.typed}</T>
      </View>
    );
  }
  if (tk.status === 'wrong') {
    return (
      <View style={[box, { backgroundColor: t.dangerSoft, flexDirection: 'row', gap: 6, alignItems: 'center' }]}>
        <T size={16} weight="semibold" style={{ color: t.danger, textDecorationLine: 'line-through' }}>{tk.typed}</T>
        <T size={16} weight="bold" style={{ color: t.success }}>{tk.expected}</T>
      </View>
    );
  }
  if (tk.status === 'missing') {
    return (
      <View style={[box, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.danger }]}>
        <T size={16} weight="bold" style={{ color: t.danger }}>{tk.expected}</T>
      </View>
    );
  }
  return <View style={box}><T size={16} style={{ color: t.faint, textDecorationLine: 'line-through' }}>{tk.typed}</T></View>;
}

/** The graded words, colored (one accessible element with a spoken summary). */
export function GradeTokens({ g }: { g: DictationGrade }) {
  return (
    <View accessible accessibilityLabel={gradeLabel(g)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'flex-start' }}>
      {g.tokens.map((tk, k) => <Token key={k} tk={tk} />)}
      {!g.tokens.length ? <T tone="muted">—</T> : null}
    </View>
  );
}

/** Legend for the colors (decorative for screen readers: the tokens have their own text). */
export function GradeLegend() {
  const t = useTheme();
  const item = (color: string, label: string, dashed = false) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: dashed ? 'transparent' : color, borderWidth: dashed ? 1.5 : 0, borderStyle: 'dashed', borderColor: color }} />
      <T size={11.5} tone="muted">{label}</T>
    </View>
  );
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {item(t.success, 'right')}{item(t.warning, 'typo')}{item(t.danger, 'wrong')}{item(t.danger, 'missing', true)}{item(t.faint, 'extra')}
    </View>
  );
}

/* ---------- sets ---------- */

/** One set in the list; opens its page. */
export function DictationSetCard({ x }: { x: DictationSetSummary }) {
  const t = useTheme();
  const tried = x.attempts ? x.attempts + (x.attempts === 1 ? ' answer' : ' answers') : 'Not practised yet';
  return (
    <Pressable onPress={() => router.push({ pathname: '/dictation/[set]', params: { set: x.id } })} accessibilityRole="button"
      accessibilityLabel={'Dictation set: ' + x.name + ', ' + x.vi + '. ' + x.items + (x.items === 1 ? ' item. ' : ' items. ') + masteryLabel(x.mastery) + ', ' + x.mastery + '% mastery. ' + tried}
      style={({ pressed }) => ({ backgroundColor: pressed ? t.surface2 : t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10, minHeight: 44 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={x.group === 'passages' ? 'book' : x.group === 'sentences' ? 'chat' : 'type'} size={18} color={t.primaryInk} />
        </View>
        <View style={{ flex: 1 }}>
          <T size={16} weight="extrabold" numberOfLines={2}>{x.name}</T>
          <T size={13} tone="muted" numberOfLines={1}>{x.vi} · {x.items} {x.items === 1 ? 'item' : 'items'}</T>
        </View>
        <Icon name="right" size={16} color={t.faint} />
      </View>
      <MasteryBar mastery={x.mastery} />
    </Pressable>
  );
}
