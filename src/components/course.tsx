import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { CourseDay, CourseDetail, CourseSummary, CourseWord, HomeworkType } from '../lib/api';
import { speak } from '../lib/speech';
import { useTheme } from '../state/store';
import { Badge, Icon, IconButton, LevelBadge, T } from './ui';

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

/** "Day 4 of 30 · 3 learned" for a learner, or '' when not joined. */
export function courseProgressLabel(c: CourseSummary): string {
  const e = c.enrollment;
  return e ? 'Day ' + e.currentDay + ' of ' + c.totalDays + ' · ' + e.learned.length + ' learned' : '';
}

/* ---------- today's plan (learner) ---------- */

const DAY_MS = 86400000;
/** Course days follow Vietnam time (UTC+7 all year, no daylight saving), like the server. */
const VN_OFFSET_MS = 7 * 3600000;
/** Whole days since 1970-01-01 for today in Vietnam. */
function vnToday(now: number): number { return Math.floor((now + VN_OFFSET_MS) / DAY_MS); }
/** Whole days since 1970-01-01 for a 'YYYY-MM-DD' key. */
function keyDays(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / DAY_MS);
}
/** Days since `day` opened for this learner (0 = it opened today). */
export function lateDaysFor(startDay: string, day: number, now = Date.now()): number {
  return Math.max(0, vnToday(now) - (keyDays(startDay) + day - 1));
}
/** % of the homework score kept when handed in this many days late (same as the server). */
export function penaltyFor(lateDays: number): number {
  return lateDays <= 0 ? 100 : lateDays === 1 ? 80 : lateDays === 2 ? 60 : 50;
}

export type PlanStepId = 'review' | 'learn' | 'homework';
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
  steps: { id: PlanStepId; state: PlanStepState }[];
  /** Today's homework score, once handed in. */
  score: number | null;
  /** The step to do now, or 'done' when today's steps are all finished (or 'empty'). */
  next: PlanStepId | 'done' | 'empty';
}

/** The learner's guided plan for today, or null when not taking the course. */
export function coursePlan(c: CourseDetail, now = Date.now()): CoursePlan | null {
  const e = c.enrollment;
  if (!e) return null;
  const day = e.currentDay;
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
    homework: score !== null
  };
  const order: PlanStepId[] = hasReview ? ['review', 'learn', 'homework'] : ['learn', 'homework'];
  // Strictly in order: the first unfinished step is the one to do; later ones wait for it.
  const firstOpen = order.find((s) => !done[s]);
  const steps = order.map((id) => ({ id, state: (done[id] ? 'done' : id === firstOpen ? 'active' : 'locked') as PlanStepState }));
  return { day, totalDays: c.totalDays, today, empty, catchUp, hasReview, steps, score, next: empty ? 'empty' : firstOpen ?? 'done' };
}

/** Short "what to do next" for the Home card. */
export function planNextLabel(p: CoursePlan): string {
  if (p.next === 'review') return 'Next: review old lessons';
  if (p.next === 'learn') return 'Next: learn today’s words';
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
  return (
    <Pressable onPress={() => router.push({ pathname: '/course/[id]', params: { id: c.id } })} accessibilityRole="button"
      accessibilityLabel={c.title + ', by ' + owner + ', ' + c.readyDays + ' of ' + c.totalDays + ' days ready' + (label ? ', ' + label : '')}
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
