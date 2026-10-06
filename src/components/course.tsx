import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import type { CourseDay, CourseDetail, CourseSummary, CourseWord, HomeworkType } from '../lib/api';
import { speak } from '../lib/speech';
import { useStore, useTheme } from '../state/store';
import { Badge, Button, Icon, IconButton, LevelBadge, T } from './ui';

export const WORDS_PER_DAY = [3, 4, 5, 6, 7, 8, 9, 10];

/** "45s", "3m 05s", "1h 02m" from milliseconds. */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + String(s % 60).padStart(2, '0') + 's';
  return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
}

/** Badge colors for a homework score (0–100). */
export function scoreColors(score: number, t: { successSoft: string; success: string; warningSoft: string; warning: string; dangerSoft: string; danger: string }): [string, string] {
  return score >= 80 ? [t.successSoft, t.success] : score >= 50 ? [t.warningSoft, t.warning] : [t.dangerSoft, t.danger];
}

/** Thin progress bar (0–100). */
export function Progress({ pct, color, height = 6 }: { pct: number; color?: string; height?: number }) {
  const t = useTheme();
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <View style={{ height, borderRadius: 99, backgroundColor: t.surface3, overflow: 'hidden' }}>
      <View style={{ width: `${p}%` as const, height: '100%', backgroundColor: color ?? t.primary, borderRadius: 99 }} />
    </View>
  );
}

/* ---------- course dates ('YYYY-MM-DD', Vietnam time like the server) ---------- */

const DAY_MS = 86400000;
/** Course days follow Vietnam time (UTC+7 all year, no daylight saving), like the server. */
const VN_OFFSET_MS = 7 * 3600000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Whole days since 1970-01-01 for today in Vietnam. */
function vnToday(now: number): number { return Math.floor((now + VN_OFFSET_MS) / DAY_MS); }
/** Whole days since 1970-01-01 for a 'YYYY-MM-DD' key. */
function keyDays(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / DAY_MS);
}
/** 'YYYY-MM-DD' for whole days since 1970-01-01. */
function daysKey(days: number): string { return new Date(days * DAY_MS).toISOString().slice(0, 10); }
/** Today's course date key in Vietnam. */
export function courseTodayKey(now = Date.now()): string { return daysKey(vnToday(now)); }
/** The key `n` days after `key` (negative = before). */
export function addDaysKey(key: string, n: number): string { return daysKey(keyDays(key) + n); }
/** Days from `a` to `b` (positive when `b` is later). */
export function daysBetweenKeys(a: string, b: string): number { return keyDays(b) - keyDays(a); }
/** True for a real calendar date written as 'YYYY-MM-DD'. */
export function isDateKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && daysKey(keyDays(key)) === key;
}
/** Days in a month (`m` is 1–12). */
export function daysInMonth(y: number, m: number): number { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
/** "10 Oct" (with the year when it isn't this year), or "Fri, 10 Oct 2026" with `long`. */
export function fmtDateKey(key: string, long = false, now = Date.now()): string {
  const [y, m, d] = key.split('-').map(Number);
  const base = d + ' ' + MONTHS[(m || 1) - 1];
  if (long) return WEEKDAYS[new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay()] + ', ' + base + ' ' + y;
  return y === Number(courseTodayKey(now).slice(0, 4)) ? base : base + ' ' + y;
}
/** "Starts 10 Oct" / "Starts today" / "Started 3 Oct" for a course with a start date, else ''. */
export function courseStartLabel(c: Pick<CourseSummary, 'startDate'>, now = Date.now()): string {
  if (!c.startDate) return '';
  const diff = daysBetweenKeys(courseTodayKey(now), c.startDate);
  const when = fmtDateKey(c.startDate, false, now);
  return diff > 0 ? 'Starts ' + when : diff === 0 ? 'Starts today' : 'Started ' + when;
}
/** The date a learner's course day opens (day 1 = their start day). */
export function dayOpensOn(startDay: string, day: number): string { return addDaysKey(startDay, day - 1); }

/** "Day 4 of 30 · 3 learned" for a learner ("Starts 10 Oct" before the course starts), or '' when not joined. */
export function courseProgressLabel(c: CourseSummary): string {
  const e = c.enrollment;
  if (!e) return '';
  if (e.currentDay < 1) return 'Starts ' + fmtDateKey(e.startDay);
  return 'Day ' + e.currentDay + ' of ' + c.totalDays + ' · ' + e.learned.length + ' learned';
}

/** What a learner sees after joining: "Day 1 is open!", "Day 6 is open!" or "The course starts on Fri, 10 Oct 2026." */
export function joinedMessage(c: CourseSummary): string {
  const e = c.enrollment;
  if (!e) return '';
  return e.currentDay < 1 ? 'The course starts on ' + fmtDateKey(e.startDay, true) + '.' : 'Day ' + e.currentDay + ' is open!';
}

/* ---------- today's plan (learner) ---------- */
/** Days since `day` opened for this learner (0 = it opened today). */
export function lateDaysFor(startDay: string, day: number, now = Date.now()): number {
  return Math.max(0, vnToday(now) - (keyDays(startDay) + day - 1));
}
/** % of the homework score kept when handed in this many days late (same as the server). */
export function penaltyFor(lateDays: number): number {
  return lateDays <= 0 ? 100 : lateDays === 1 ? 80 : lateDays === 2 ? 60 : 50;
}

export type PlanStepId = 'review' | 'learn' | 'listening' | 'homework';
export type PlanStepState = 'done' | 'active' | 'locked';
export interface CoursePlan {
  day: number; totalDays: number;
  /** Today's course day (always open for a learner). */
  today: CourseDay | undefined;
  /** Today has no words yet: there's nothing to do but catch up. */
  empty: boolean;
  /** Earlier open days whose homework isn't handed in, oldest first, with the penalty it gets now. */
  catchUp: { day: number; lateDays: number; penalty: number }[];
  /** False on day 1, or when no earlier day has words (then there's nothing to review). */
  hasReview: boolean;
  /** Today has a listening dialogue (a step between learning and the homework). */
  hasListening: boolean;
  steps: { id: PlanStepId; state: PlanStepState }[];
  /** Today's homework score, once handed in. */
  score: number | null;
  /** The step to do now, or 'done' when today's steps are all finished (or 'empty'; 'upcoming' before the course starts). */
  next: PlanStepId | 'done' | 'empty' | 'upcoming';
  /** Before the course starts (day 0): the 'YYYY-MM-DD' day 1 opens. Otherwise ''. */
  startsOn: string;
}

/**
 * The learner's guided plan for today, or null when not taking the course.
 * `hasListening`: today has a listening dialogue (fetched separately), which adds a step before the homework.
 */
export function coursePlan(c: CourseDetail, now = Date.now(), hasListening = false): CoursePlan | null {
  const e = c.enrollment;
  if (!e) return null;
  const day = e.currentDay;
  // Day 0: the course has a start date that hasn't come yet, so nothing is open.
  if (day < 1) {
    return { day: 0, totalDays: c.totalDays, today: undefined, empty: true, catchUp: [], hasReview: false, hasListening: false, steps: [], score: null, next: 'upcoming', startsOn: e.startDay };
  }
  const today = c.days.find((d) => d.day === day);
  const empty = !today || !today.count || !today.words?.length;
  const catchUp = c.days
    .filter((d) => d.day < day && d.count > 0 && d.words !== null && (d.myScore ?? null) === null)
    .sort((a, b) => a.day - b.day)
    .map((d) => { const late = lateDaysFor(e.startDay, d.day, now); return { day: d.day, lateDays: late, penalty: penaltyFor(late) }; });
  const hasReview = day >= 2 && c.days.some((d) => d.day < day && d.count > 0);
  const score = today?.myScore ?? null;
  const done: Record<PlanStepId, boolean> = {
    review: (e.warmedUp ?? []).includes(day),
    learn: e.learned.includes(day),
    listening: (e.listened ?? []).includes(day),
    homework: score !== null
  };
  const order: PlanStepId[] = [
    ...(hasReview ? ['review' as const] : []), 'learn', ...(hasListening ? ['listening' as const] : []), 'homework'
  ];
  // Strictly in order: the first unfinished step is the one to do; later ones wait for it.
  const firstOpen = order.find((s) => !done[s]);
  const steps = order.map((id) => ({ id, state: (done[id] ? 'done' : id === firstOpen ? 'active' : 'locked') as PlanStepState }));
  return { day, totalDays: c.totalDays, today, empty, catchUp, hasReview, hasListening, steps, score, next: empty ? 'empty' : firstOpen ?? 'done', startsOn: '' };
}

/** Short "what to do next" for the Home card. */
export function planNextLabel(p: CoursePlan): string {
  if (p.next === 'upcoming') return 'Starts ' + fmtDateKey(p.startsOn);
  if (p.next === 'review') return 'Next: review old lessons';
  if (p.next === 'learn') return 'Next: learn today’s words';
  if (p.next === 'listening') return 'Next: today’s listening';
  if (p.next === 'homework') return 'Next: today’s homework';
  if (p.catchUp.length) return 'Next: finish day ' + p.catchUp[0].day + ' homework';
  if (p.next === 'empty') return 'No new words yet today';
  return p.day >= p.totalDays ? 'Course complete' : 'Done for today';
}

/** One course in a list. The whole card is a single button (nothing tappable inside it). */
export function CourseCard({ c }: { c: CourseSummary }) {
  const t = useTheme();
  const e = c.enrollment;
  const owner = c.isOwner ? 'You' : c.ownerName;
  const label = courseProgressLabel(c);
  const start = courseStartLabel(c);
  const upcoming = !!c.startDate && start.startsWith('Starts');
  return (
    <Pressable onPress={() => router.push({ pathname: '/course/[id]', params: { id: c.id } })} accessibilityRole="button"
      accessibilityLabel={c.title + ', by ' + owner + ', ' + c.readyDays + ' of ' + c.totalDays + ' days ready' + (start ? ', ' + start : '') + (label && label !== start ? ', ' + label : '')}
      style={({ pressed }) => ({ backgroundColor: pressed ? t.surface2 : t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="cap" size={22} color={t.primaryInk} />
        </View>
        <View style={{ flex: 1 }}>
          <T size={16.5} weight="extrabold" numberOfLines={2}>{c.title}</T>
          <T size={13} tone="muted" numberOfLines={1}>by {owner}</T>
        </View>
        <Icon name="right" size={16} color={t.faint} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <Badge label={c.readyDays + '/' + c.totalDays + ' days ready'} bg={t.surface2} fg={t.muted} />
        <Badge label={c.members + (c.members === 1 ? ' member' : ' members')} bg={t.surface2} fg={t.muted} />
        <Badge label={c.wordsPerDay + ' words/day'} bg={t.surface2} fg={t.muted} />
        {start ? <Badge label={start} bg={upcoming ? t.infoSoft : t.surface2} fg={upcoming ? t.info : t.muted} /> : null}
        {c.visibility === 'private' ? <Badge label="Private" bg={t.warningSoft} fg={t.warning} /> : null}
      </View>
      {e ? (
        <View style={{ gap: 6 }}>
          <Progress pct={(e.learned.length / c.totalDays) * 100} />
          <T size={13} weight="semibold" tone="muted">{label}</T>
        </View>
      ) : null}
    </Pressable>
  );
}

/** A course word's details, with a speak button and optional actions on the right. */
export function CourseWordCard({ w, right, children }: { w: CourseWord; right?: ReactNode; children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <T size={18} weight="extrabold">{w.word}</T>
            <LevelBadge level={w.level} />
          </View>
          {w.ipa ? <T ipa size={13} tone="muted">{w.ipa}</T> : null}
        </View>
        <IconButton name="volume" label={'Play ' + w.word} color={t.primaryInk} onPress={() => speak(w.word)} />
        {right}
      </View>
      {w.vi ? <T weight="semibold">{w.vi}</T> : null}
      {w.meaning ? <T size={13.5} tone="muted">{w.meaning}</T> : null}
      {w.ex ? <T size={13.5} style={{ fontStyle: 'italic' }}>“{w.ex}”</T> : null}
      {children}
    </View>
  );
}

/** True when this word (any case) is already in my words. */
export function useInMyWords(): (word: string) => boolean {
  const { data } = useStore();
  const mine = new Set(data.words.map((w) => w.word.toLowerCase()));
  return (word: string) => mine.has(word.toLowerCase());
}

/**
 * "Save to My Vocabulary" for one course word, or "Saved ✓" once it's in my words.
 * `canSave` false (not joined, or the day isn't open) shows only the saved state.
 */
export function SaveCourseWord({ courseId, day, word, canSave = true, style }: {
  courseId: string; day: number; word: string; canSave?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const { actions } = useStore();
  const inMine = useInMyWords();
  const [busy, setBusy] = useState(false);
  if (inMine(word)) {
    return (
      <View accessible accessibilityLabel={word + ' is saved in My Vocabulary'}
        style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 10, backgroundColor: t.successSoft, alignSelf: 'flex-start' }, style]}>
        <T size={13.5} weight="bold" style={{ color: t.success }}>Saved ✓</T>
      </View>
    );
  }
  if (!canSave) return null;
  return (
    <Button title="Save to My Vocabulary" icon="plus" variant="secondary" size="sm" loading={busy}
      accessibilityLabel={'Save ' + word + ' to My Vocabulary'}
      style={[{ minHeight: 44, alignSelf: 'flex-start' }, style]}
      onPress={async () => { setBusy(true); await actions.saveCourseWords(courseId, day, [word]); setBusy(false); }} />
  );
}

/** How the server compares typed answers: lowercase, straight quotes, single spaces, no punctuation at the ends. */
export function normAnswer(s: string): string {
  return s.toLowerCase().replace(/[‘’‛′]/g, "'").replace(/[“”‟″]/g, '"')
    .replace(/\s+/g, ' ').trim().replace(/^[\s.,!?;:'"()[\]{}…-]+|[\s.,!?;:'"()[\]{}…-]+$/g, '');
}
/** True when `input` matches the answer or one of the accepted alternatives. */
export function isCorrect(input: string, answer: string, accept: string[] = []): boolean {
  const a = normAnswer(input);
  return !!a && [answer, ...accept].some((x) => normAnswer(x) === a);
}

/* ---------- listening dialogues ---------- */
/** A piece of a dialogue line: plain text, or a blank with what's said (`said`, the correct fill) and the word-bank word (`base`). */
export type LinePart = { text: string } | { said: string; base: string };
const BLANK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
/** Splits a line written with [[word]] / [[said form|word]] blanks (same pattern as the server). */
export function lineParts(text: string): LinePart[] {
  const out: LinePart[] = [];
  let at = 0;
  for (const m of text.matchAll(BLANK_RE)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ text: text.slice(at, i) });
    out.push({ said: m[1].trim(), base: (m[2] ?? m[1]).trim() });
    at = i + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
/** The line as it's spoken (blanks replaced by their said form). */
export function spokenLine(text: string): string {
  return lineParts(text).map((p) => ('text' in p ? p.text : p.said)).join('');
}
/** Number of blanks in a dialogue. */
export function dialogueBlankCount(lines: { text: string }[]): number {
  return lines.reduce((n, l) => n + lineParts(l.text).filter((p) => 'said' in p).length, 0);
}

/** Tense name and the (Vietnamese) explanation of a tense question. Renders nothing for other questions. */
export function TenseNote({ label, explain }: { label?: string; explain?: string }) {
  const t = useTheme();
  if (!label && !explain) return null;
  return (
    <View style={{ gap: 6, borderRadius: 10, padding: 10, backgroundColor: t.infoSoft }}>
      {label ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="clock" size={14} color={t.info} />
          <T size={13} weight="extrabold" tone="info">{label}</T>
        </View>
      ) : null}
      {explain ? <T size={13.5}>{explain}</T> : null}
    </View>
  );
}

/** The instruction shown above a homework / warm-up question. */
export const ASK: Record<HomeworkType, string> = {
  meaning: 'What does this word mean?',
  word: 'Which word has this meaning?',
  type: 'Type the word that means',
  blank: 'Fill in the missing word',
  tense: 'Put the verb in brackets in the right tense',
  tenseChoice: 'Choose the right verb form'
};
/** Answered by typing (the others have choices). */
export const isTyped = (q: { type: HomeworkType; choices: string[] }) => q.type === 'type' || q.type === 'blank' || q.type === 'tense' || !q.choices.length;
/** The prompt is a whole sentence (shown smaller than a single word). */
export const isSentence = (q: { type: HomeworkType }) => q.type === 'blank' || q.type === 'tense' || q.type === 'tenseChoice';
