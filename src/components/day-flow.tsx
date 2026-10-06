import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type CourseDetail } from '../lib/api';
import { useTheme } from '../state/store';
import { daySteps, scoreColors, STEP_LABEL, type PlanStepId } from './course';
import { BackBar, Button, Card, Icon, T } from './ui';

/*
 * The guided day flow: review → learn → listening → homework, one screen after the other.
 * A step screen opened with `flow=1` shows the stepper, and when the step is finished it offers "Continue",
 * which replaces it with the next unfinished step (so Back always returns to the course page).
 */

const STEP_PATH = {
  review: '/course/[id]/warmup/[day]',
  learn: '/course/[id]/learn/[day]',
  listening: '/course/[id]/listening/[day]',
  homework: '/course/[id]/homework/[day]'
} as const;

export interface DayFlow {
  course: CourseDetail; day: number;
  /** The day's steps in order, with whether each one was done when the screen opened. */
  steps: { id: PlanStepId; done: boolean }[];
}

/** True when the day has a listening dialogue (false when it can't be checked). */
function hasListening(c: CourseDetail, day: number): Promise<boolean> {
  const e = c.enrollment;
  const d = c.days.find((x) => x.day === day);
  if (!e || day < 1 || day > e.currentDay || !d?.count || !d.words) return Promise.resolve(false);
  return api.getListening(c.id, day).then((r) => !!r.dialogue).catch(() => false);
}

/** The day flow: null while loading (or when `on` is false), 'failed' when it couldn't be loaded. */
export type DayFlowState = DayFlow | 'failed' | null;

/** The day's steps for the stepper and "next". */
export function useDayFlow(id: string, day: number, on: boolean): DayFlowState {
  const [flow, setFlow] = useState<DayFlowState>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    (async () => {
      try {
        const course = await api.course(id);
        const listening = await hasListening(course, day);
        if (live) setFlow({ course, day, steps: daySteps(course, day, listening) });
      } catch { if (live) setFlow('failed'); }
    })();
    return () => { live = false; };
  }, [id, day, on]);
  return flow;
}

/** Opens a step of a day in the guided flow. `replace` swaps the current step screen for it. */
export function openStep(courseId: string, day: number, step: PlanStepId, replace = false): void {
  const to = { pathname: STEP_PATH[step], params: { id: courseId, day: String(day), flow: '1' } };
  if (replace) router.replace(to); else router.push(to);
}

/**
 * The first unfinished step of a day, or null when every step is done.
 * `listening`: whether the day has a dialogue, when already known (otherwise it's checked when it matters).
 */
export async function firstOpenStep(c: CourseDetail, day: number, listening?: boolean): Promise<PlanStepId | null> {
  const first = daySteps(c, day, listening ?? false).find((s) => !s.done)?.id ?? null;
  // Listening only comes between learning and homework, so it only matters once those are reached.
  if (listening !== undefined || (first !== 'homework' && first !== null)) return first;
  const withListening = daySteps(c, day, await hasListening(c, day));
  return withListening.find((s) => !s.done)?.id ?? null;
}

/** The step after `current` that's still to do (steps before it are done). */
function nextStep(flow: DayFlow, current: PlanStepId): PlanStepId | null {
  return flow.steps.find((s) => s.id !== current && !s.done)?.id ?? null;
}

/** Compact stepper for the top of a step screen: ✓ done / current / 🔒 locked, plus "Day N / 30". */
export function DayStepper({ flow, current, currentDone }: { flow: DayFlowState; current: PlanStepId; currentDone?: boolean }) {
  const t = useTheme();
  // The stepper is optional: the step itself still works without it.
  if (!flow || flow === 'failed') return null;
  const { steps, day, course } = flow;
  const at = steps.findIndex((s) => s.id === current);
  const stateOf = (s: { id: PlanStepId; done: boolean }) => (s.done || (s.id === current && currentDone) ? 'done' : s.id === current ? 'current' : 'locked');
  const a11y = 'Day ' + day + ' of ' + course.totalDays + '. Step ' + (at + 1) + ' of ' + steps.length + ': ' + STEP_LABEL[current] + '. '
    + steps.map((s) => STEP_LABEL[s.id] + ' ' + ({ done: 'done', current: currentDone ? 'done' : 'now', locked: 'locked' }[stateOf(s)])).join(', ');
  return (
    <View accessible accessibilityLabel={a11y} style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 6 }}>
      <T size={11.5} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
        Day {day} / {course.totalDays} · Step {at + 1} of {steps.length}
      </T>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {steps.map((s) => {
          const st = stateOf(s);
          const color = st === 'done' ? t.success : st === 'current' ? t.primaryInk : t.faint;
          return (
            <View key={s.id} style={{ flex: 1, gap: 5 }}>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: st === 'done' ? t.success : st === 'current' ? t.primary : t.surface3 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                {st === 'done' ? <Icon name="check" size={12} color={color} strokeWidth={2.6} /> : st === 'locked' ? <Icon name="lock" size={11} color={color} /> : null}
                <T size={11.5} weight={st === 'current' ? 'extrabold' : 'semibold'} numberOfLines={1} style={{ color, flexShrink: 1 }}>{STEP_LABEL[s.id]}</T>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Back to the course page (the step screens replace each other, so it's usually right behind). */
function backToCourse(courseId: string) {
  if (router.canGoBack()) router.back();
  else router.replace({ pathname: '/course/[id]', params: { id: courseId } });
}

/**
 * Shown when a step is finished: "✓ Done — next: Listening" with Continue (opens the next step in place of this one),
 * or the "Day N complete" card after the last step. `score`: today's homework score, when just handed in.
 */
export function FlowNext({ flow, current, score }: { flow: DayFlowState; current: PlanStepId; score?: number | null }) {
  const t = useTheme();
  if (!flow) return <ActivityIndicator color={t.primary} style={{ marginVertical: 16 }} />;
  if (flow === 'failed') return <Button title="Back to course" icon="left" size="lg" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} block />;
  const next = nextStep(flow, current);
  if (!next) return <DayComplete flow={flow} score={score} />;
  return (
    <Card style={{ gap: 12, padding: 16, borderColor: t.success }}>
      <View accessible accessibilityLabel={STEP_LABEL[current] + ' done. Next: ' + STEP_LABEL[next]} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.successSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={20} color={t.success} strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1 }}>
          <T size={16.5} weight="extrabold">Done — next: {STEP_LABEL[next]}</T>
          <T size={13.5} tone="muted">Step {flow.steps.findIndex((s) => s.id === next) + 1} of {flow.steps.length} · day {flow.day}</T>
        </View>
      </View>
      <Button title="Continue" icon="right" size="lg" onPress={() => openStep(flow.course.id, flow.day, next, true)} block
        accessibilityLabel={'Continue to ' + STEP_LABEL[next]} />
    </Card>
  );
}

/** "Day N complete 🎉" with the homework score, the learner's streak and the way out. */
export function DayComplete({ flow, score }: { flow: DayFlow; score?: number | null }) {
  const t = useTheme();
  const [streak, setStreak] = useState<number | null>(null);
  const { course, day } = flow;
  useEffect(() => {
    let live = true;
    api.getLeaderboard(course.id, day).then((lb) => { if (live) setStreak(lb.streak.me?.streak ?? 0); }).catch(() => { /* streak is optional */ });
    return () => { live = false; };
  }, [course.id, day]);
  const s = score ?? course.days.find((d) => d.day === day)?.myScore ?? null;
  const [sBg, sFg] = s !== null ? scoreColors(s, t) : [t.successSoft, t.success];
  const last = day >= course.totalDays;
  return (
    <Card style={{ gap: 12, alignItems: 'center', padding: 22, backgroundColor: t.successSoft, borderColor: t.success }}>
      <View accessible accessibilityLabel={'Day ' + day + ' complete.' + (s !== null ? ' Homework score ' + s + '.' : '') + (streak ? ' ' + streak + '-day streak.' : '')}
        style={{ alignItems: 'center', gap: 8 }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: s !== null ? sBg : t.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: sFg }}>
          {s !== null ? <T size={28} weight="extrabold" style={{ color: sFg, lineHeight: 34 }}>{s}</T> : <Icon name="check" size={34} color={sFg} />}
        </View>
        <T size={20} weight="extrabold" center>Day {day} complete 🎉</T>
        {streak ? <T weight="bold" center style={{ color: t.orange }}>🔥 {streak}-day streak</T> : null}
        <T tone="muted" center>{last ? 'That was the last day. Great work!' : 'Come back tomorrow for day ' + (day + 1) + '.'}</T>
      </View>
      <View style={{ alignSelf: 'stretch', gap: 8 }}>
        <Button title="Back to course" icon="left" onPress={() => backToCourse(course.id)} block />
        <Button title="Leaderboard" icon="trophy" variant="secondary" block
          onPress={() => router.replace({ pathname: '/course/[id]/leaderboard', params: { id: course.id, day: String(day) } })} />
      </View>
    </Card>
  );
}

/** A whole screen for a step that ended without its own summary (e.g. skipped): stepper and "next". */
export function FlowDoneScreen({ title, flow, current, children }: { title: string; flow: DayFlowState; current: PlanStepId; children?: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title={title} />
      <DayStepper flow={flow} current={current} currentDone />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, paddingBottom: insets.bottom + 24 }}>
        <FlowNext flow={flow} current={current} />
        {children}
      </ScrollView>
    </View>
  );
}
