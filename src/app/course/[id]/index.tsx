import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import {
  courseStartLabel, coursePlan, dayOpensOn, fmtDateKey, joinedMessage, Progress, scoreColors, type CoursePlan, type PlanStepId, type PlanStepState
} from '../../../components/course';
import { BackBar, Badge, Button, Card, EmptyState, Icon, IconButton, IconTile, SectionTitle, T } from '../../../components/ui';
import { api, type CourseDay, type CourseDetail } from '../../../lib/api';
import type { IconName } from '../../../lib/icons';
import { errMsg, useStore, useTheme } from '../../../state/store';

type DayState = 'learned' | 'today' | 'open' | 'locked' | 'empty';

/** One step of today's plan. The header is read as one item; the action (if any) is a separate button below it. */
function StepCard({ n, total, icon, title, sub, state, lockedText, children }: {
  n: number; total: number; icon: IconName; title: string; sub: string; state: PlanStepState; lockedText: string; children?: ReactNode;
}) {
  const t = useTheme();
  const active = state === 'active';
  const done = state === 'done';
  const [mBg, mFg] = done ? [t.successSoft, t.success] : active ? [t.primary, '#fff'] : [t.surface2, t.faint];
  const text = state === 'locked' ? lockedText : sub;
  return (
    <Card style={[{ gap: 12, padding: 16 }, active && { borderColor: t.primary, borderWidth: 1.5 }]}>
      <View accessible accessibilityLabel={'Step ' + n + ' of ' + total + ': ' + title + ', ' + (done ? 'done' : active ? 'to do now' : 'locked') + '. ' + text}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: mBg, alignItems: 'center', justifyContent: 'center' }}>
          {done ? <Icon name="check" size={20} color={mFg} strokeWidth={2.4} />
            : state === 'locked' ? <Icon name="lock" size={17} color={mFg} />
            : <Icon name={icon} size={19} color={mFg} />}
        </View>
        <View style={{ flex: 1 }}>
          <T size={12} weight="extrabold" tone={active ? 'primaryInk' : 'muted'} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>Step {n}</T>
          <T size={16.5} weight="extrabold" style={state === 'locked' ? { color: t.muted } : undefined}>{title}</T>
          <T size={13} tone="muted">{text}</T>
        </View>
      </View>
      {active ? children : null}
    </Card>
  );
}

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actions } = useStore();
  const t = useTheme();
  const [c, setC] = useState<CourseDetail | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [allDays, setAllDays] = useState(false);
  /** The course day whose listening dialogue exists (null = none, or not checked yet). */
  const [listeningDay, setListeningDay] = useState<number | null>(null);
  const [skippingListening, setSkippingListening] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.course(id);
      // Today's listening dialogue is an extra plan step when the owner added one (checked before showing the plan, so it doesn't jump).
      const cur = res.enrollment?.currentDay ?? 0;
      const today = res.days.find((d) => d.day === cur);
      const l = cur >= 1 && today?.count && today.words ? await api.getListening(id, cur).catch(() => null) : null;
      setListeningDay(l?.dialogue ? cur : null);
      setC(res); setErr('');
    } catch (e) { setErr(errMsg(e)); }
  }, [id]);
  // Reload on focus so the plan moves on when coming back from a step.
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (!c) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title="Course" />
        {err ? (
          <EmptyState icon="alert" tone="red" title="Couldn’t open this course" text={err}>
            <Button title="Try again" icon="refresh" onPress={() => { setErr(''); void load(); }} />
          </EmptyState>
        ) : <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  const e = c.enrollment;
  const plan = coursePlan(c, Date.now(), !!e && listeningDay === e.currentDay);
  const join = async () => {
    setBusy(true);
    const res = await actions.call(api.joinCourse(c.id));
    setBusy(false);
    if (res) { setC(res); actions.showToast('Joined “' + res.title + '”. ' + joinedMessage(res)); }
  };
  const leave = () => Alert.alert('Leave “' + c.title + '”?', 'Your progress in this course will be lost. Words you already saved stay in My Vocabulary.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Leave', style: 'destructive', onPress: async () => {
        const ok = await actions.call(api.leaveCourse(c.id).then(() => true));
        if (!ok) return;
        actions.showToast('You left “' + c.title + '”.');
        if (c.isOwner || c.visibility === 'public') void load();
        else router.back();
      }
    }
  ]);

  const params = (day: number) => ({ id: c.id, day: String(day) });
  const openDay = (day: number) => router.push({ pathname: '/course/[id]/day/[day]', params: params(day) });
  const openLearn = (day: number) => router.push({ pathname: '/course/[id]/learn/[day]', params: params(day) });
  const openWarmup = (day: number) => router.push({ pathname: '/course/[id]/warmup/[day]', params: params(day) });
  const openListening = (day: number) => router.push({ pathname: '/course/[id]/listening/[day]', params: params(day) });
  const openHomework = (day: number) => router.push({ pathname: '/course/[id]/homework/[day]', params: params(day) });
  const openBoard = () => router.push({ pathname: '/course/[id]/leaderboard', params: { id: c.id } });
  const skipReview = async (day: number) => {
    setSkipping(true);
    const res = await actions.call(api.warmupDone(c.id, day));
    setSkipping(false);
    if (res && c.enrollment) setC({ ...c, enrollment: { ...c.enrollment, warmedUp: res.warmedUp } });
  };
  const skipListening = async (day: number) => {
    setSkippingListening(true);
    const res = await actions.call(api.listeningDone(c.id, day));
    setSkippingListening(false);
    if (res && c.enrollment) setC({ ...c, enrollment: { ...c.enrollment, listened: res.listened } });
  };

  const stateOf = (d: CourseDay): DayState => {
    if (e) {
      if (e.learned.includes(d.day)) return 'learned';
      if (d.day > e.currentDay || d.words === null) return d.count ? 'locked' : 'empty';
      if (!d.count) return 'empty';
      return d.day === e.currentDay ? 'today' : 'open';
    }
    // Not taking the course: the owner can preview every day; others see it once they join.
    if (!d.count) return 'empty';
    return d.words ? 'open' : 'locked';
  };

  const dayRow = (d: CourseDay, i: number) => {
    const s = stateOf(d);
    const tappable = s === 'learned' || s === 'today' || s === 'open';
    const sub = s === 'learned' ? 'Learned · ' + d.count + ' words'
      : s === 'today' ? 'Today · ' + d.count + ' words'
      : s === 'open' ? d.count + ' words'
      : s === 'locked' ? d.count + ' words · opens ' + (e ? 'on ' + fmtDateKey(dayOpensOn(e.startDay, d.day)) : 'on day ' + d.day)
      : 'Coming soon';
    const score = d.myScore ?? null;
    const [sBg, sFg] = score !== null ? scoreColors(score, t) : ['', ''];
    const icon = s === 'learned' ? 'check' : s === 'locked' ? 'lock' : s === 'empty' ? 'clock' : 'book';
    const tint = s === 'learned' ? [t.successSoft, t.success] : s === 'today' ? [t.primary, '#fff'] : s === 'open' ? [t.primarySoft, t.primaryInk] : [t.surface2, t.faint];
    const body = (
      <>
        <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: tint[0], alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={18} color={tint[1]} />
        </View>
        <View style={{ flex: 1 }}>
          <T weight="extrabold" style={s === 'locked' || s === 'empty' ? { color: t.muted } : undefined}>Day {d.day}</T>
          <T size={13} tone={s === 'today' ? 'primaryInk' : 'muted'} weight={s === 'today' ? 'bold' : 'regular'}>{sub}</T>
        </View>
        {score !== null ? <Badge label={String(score)} bg={sBg} fg={sFg} /> : null}
        {tappable ? <Icon name="right" size={16} color={t.faint} /> : null}
      </>
    );
    const a11y = 'Day ' + d.day + ', ' + sub + (score !== null ? ', homework score ' + score : '');
    const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 60, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: t.border };
    return tappable ? (
      <Pressable key={d.day} onPress={() => openDay(d.day)} accessibilityRole="button" accessibilityLabel={a11y}
        style={({ pressed }) => [rowStyle, { backgroundColor: pressed ? t.surface2 : s === 'today' ? t.primarySoft : 'transparent' }]}>
        {body}
      </Pressable>
    ) : (
      <View key={d.day} style={rowStyle} accessible accessibilityLabel={a11y}>{body}</View>
    );
  };
  const dayList = <Card pad={false} style={{ overflow: 'hidden' }}>{c.days.map(dayRow)}</Card>;

  /* ---------- today's plan (learners) ---------- */
  const catchUpNotice = (p: CoursePlan) => {
    const first = p.catchUp[0];
    if (!first) return null;
    const more = p.catchUp.length - 1;
    const lateText = first.lateDays + (first.lateDays === 1 ? ' day' : ' days') + ' late · hand it in now to keep ' + first.penalty + '% of the score';
    return (
      <Card style={{ gap: 12, padding: 16, backgroundColor: t.warningSoft, borderColor: t.warning }}>
        <View accessible accessibilityLabel={'Unfinished homework from day ' + first.day + '. ' + lateText + (more > 0 ? '. Plus ' + more + ' more' : '')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="alert" size={22} color={t.warning} />
          <View style={{ flex: 1 }}>
            <T size={15.5} weight="extrabold">Unfinished homework from day {first.day}</T>
            <T size={13} weight="semibold" tone="muted">{lateText}</T>
            {more > 0 ? <T size={13} weight="bold" tone="warning">+{more} more</T> : null}
          </View>
        </View>
        <Button title={'Do day ' + first.day + ' homework'} icon="right" variant="secondary" onPress={() => openHomework(first.day)} block />
      </Card>
    );
  };

  const todayPlan = (p: CoursePlan) => {
    const words = p.today?.count ?? 0;
    if (p.next === 'upcoming') {
      const when = fmtDateKey(p.startsOn, true);
      return (
        <Card style={{ gap: 10, alignItems: 'center', padding: 22 }}>
          <View accessible accessibilityLabel={'This course starts on ' + when + '. Come back then.'} style={{ alignItems: 'center', gap: 10 }}>
            <IconTile name="clock" tone="blue" size={52} />
            <T size={16.5} weight="extrabold" center>This course starts on {when}</T>
            <T tone="muted" center>Come back then. After that, a new day opens every day.</T>
          </View>
        </Card>
      );
    }
    if (p.empty) {
      return (
        <Card style={{ gap: 10, alignItems: 'center', padding: 22 }}>
          <IconTile name="clock" tone="blue" size={52} />
          <T size={16.5} weight="extrabold" center>No words for day {p.day} yet</T>
          <T tone="muted" center>The course owner hasn’t added words for day {p.day} yet.</T>
        </Card>
      );
    }
    const total = p.steps.length;
    const stateOfStep = (s: PlanStepId) => p.steps.find((x) => x.id === s)?.state ?? 'locked';
    const cards = p.steps.map((s, k) => {
      const n = k + 1;
      if (s.id === 'review') {
        return (
          <StepCard key="review" n={n} total={total} icon="zap" title="Review old lessons" state={s.state}
            sub={s.state === 'done' ? 'Done' : 'Review before today’s new words'} lockedText="">
            <View style={{ gap: 6 }}>
              <Button title="Start review" icon="right" onPress={() => openWarmup(p.day)} block />
              <Button title="Skip review" variant="ghost" loading={skipping} onPress={() => void skipReview(p.day)} block />
            </View>
          </StepCard>
        );
      }
      if (s.id === 'learn') {
        return (
          <StepCard key="learn" n={n} total={total} icon="book" title="Learn today’s words" state={s.state}
            sub={s.state === 'done' ? 'Done · ' + words + (words === 1 ? ' word' : ' words') + ' learned' : words + ' new ' + (words === 1 ? 'word' : 'words') + ' today'}
            lockedText="Unlocks after you review old lessons">
            <Button title="Start learning" icon="right" onPress={() => openLearn(p.day)} block />
          </StepCard>
        );
      }
      if (s.id === 'listening') {
        return (
          <StepCard key="listening" n={n} total={total} icon="volume" title="🎧 Listening" state={s.state}
            sub={s.state === 'done' ? 'Done' : 'Listen to a short dialogue, fill the gaps and answer a few questions'}
            lockedText="Unlocks after you learn today’s words">
            <View style={{ gap: 6 }}>
              <Button title="Start listening" icon="right" onPress={() => openListening(p.day)} block />
              <Button title="Skip listening" variant="ghost" loading={skippingListening} onPress={() => void skipListening(p.day)} block />
            </View>
          </StepCard>
        );
      }
      const before = [
        p.hasReview && stateOfStep('review') !== 'done' ? 'review' : '',
        stateOfStep('learn') !== 'done' ? 'learning today’s words' : '',
        p.hasListening && stateOfStep('listening') !== 'done' ? 'listening' : ''
      ].filter(Boolean);
      const homeworkLocked = 'Unlocks after ' + (before.length
        ? before.slice(0, -1).join(', ') + (before.length > 1 ? ' and ' : '') + before[before.length - 1]
        : 'the steps above');
      return (
        <StepCard key="homework" n={n} total={total} icon="listcheck" title="Homework" state={s.state}
          sub={p.score !== null ? 'Handed in · score ' + p.score + ' / 100' : 'Test yourself on today’s words. Hand in today for full marks.'}
          lockedText={homeworkLocked}>
          <Button title="Start homework" icon="right" onPress={() => openHomework(p.day)} block />
        </StepCard>
      );
    });
    let doneCard = null;
    if (p.next === 'done') {
      const last = p.day >= p.totalDays;
      const [sBg, sFg] = p.score !== null ? scoreColors(p.score, t) : [t.successSoft, t.success];
      doneCard = (
        <Card style={{ gap: 12, alignItems: 'center', padding: 22, backgroundColor: t.successSoft, borderColor: t.success }}>
          <View accessible accessibilityLabel={(last ? 'Course complete' : 'Day ' + p.day + ' complete. Come back tomorrow for day ' + (p.day + 1)) + (p.score !== null ? '. Homework score ' + p.score : '')}
            style={{ alignItems: 'center', gap: 8 }}>
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: p.score !== null ? sBg : t.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: sFg }}>
              {p.score !== null ? <T size={28} weight="extrabold" style={{ color: sFg, lineHeight: 34 }}>{p.score}</T> : <Icon name="check" size={34} color={sFg} />}
            </View>
            <T size={19} weight="extrabold" center>{last ? 'Course complete' : 'Day ' + p.day + ' complete'}</T>
            <T tone="muted" center>{last ? 'You finished all ' + p.totalDays + ' days. Great work!' : 'Come back tomorrow for day ' + (p.day + 1) + '.'}</T>
          </View>
          <Button title="Leaderboard" icon="trophy" onPress={openBoard} block />
        </Card>
      );
    }
    return <>{cards}{doneCard}</>;
  };

  const startLabel = courseStartLabel(c);
  const upcoming = startLabel.startsWith('Starts');
  const header = (
    <Card style={{ gap: 10 }}>
      <T size={24} weight="extrabold" style={{ letterSpacing: -0.4 }}>{c.title}</T>
      <T size={13.5} tone="muted">by {c.isOwner ? 'You' : c.ownerName}</T>
      {c.description ? <T>{c.description}</T> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Badge label={c.readyDays + '/' + c.totalDays + ' days ready'} bg={t.surface2} fg={t.muted} />
        <Badge label={c.wordsPerDay + ' words/day'} bg={t.surface2} fg={t.muted} />
        <Badge label={c.members + (c.members === 1 ? ' member' : ' members')} bg={t.surface2} fg={t.muted} />
        <Badge label={c.visibility === 'public' ? 'Public' : 'Private'} bg={c.visibility === 'public' ? t.successSoft : t.warningSoft} fg={c.visibility === 'public' ? t.success : t.warning} />
        {startLabel ? <Badge label={startLabel} bg={upcoming ? t.infoSoft : t.surface2} fg={upcoming ? t.info : t.muted} /> : null}
      </View>
      {e ? (
        <View style={{ gap: 6, marginTop: 4 }}>
          <Progress pct={c.totalDays ? (e.learned.length / c.totalDays) * 100 : 0} />
          <T size={13.5} weight="semibold" tone="muted">
            {e.currentDay < 1 ? 'Starts ' + fmtDateKey(e.startDay) + ' · day 1 of ' + c.totalDays : 'Day ' + e.currentDay + ' of ' + c.totalDays + ' · ' + e.learned.length + ' learned'}
          </T>
        </View>
      ) : null}
      {!e ? (
        <Button title={c.isOwner ? 'Take this course yourself' : 'Join course'} icon="plus" loading={busy} onPress={join} variant={c.isOwner ? 'secondary' : 'primary'} block />
      ) : null}
    </Card>
  );

  const joinCode = c.isOwner && c.joinCode ? (
    <Card style={{ gap: 6 }}>
      <SectionTitle>Join code</SectionTitle>
      <View accessible accessibilityLabel={'Join code ' + c.joinCode.split('').join(' ')}><T size={28} weight="extrabold" style={{ letterSpacing: 4 }}>{c.joinCode}</T></View>
      <T size={13} tone="muted">Share this code so others can join{c.visibility === 'private' ? ' this private course' : ''}.</T>
    </Card>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title="Course" right={c.isOwner ? <IconButton name="edit" label="Edit course" color={t.primaryInk} onPress={() => router.push({ pathname: '/course-edit/[id]', params: { id: c.id } })} /> : undefined} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.primary} colors={[t.primary]} />}>
        {header}

        {plan ? (
          <>
            <SectionTitle style={{ marginTop: 4 }}>{plan.next === 'upcoming' ? 'Not started yet' : 'Today · day ' + plan.day}</SectionTitle>
            {catchUpNotice(plan)}
            {todayPlan(plan)}
            {plan.next !== 'done' && plan.next !== 'upcoming' ? <Button title="Leaderboard" icon="trophy" variant="secondary" onPress={openBoard} block /> : null}
            {joinCode}
            {plan.next === 'upcoming' ? (
              // Before the start every day is locked; show them so learners can see what's coming.
              <>
                <SectionTitle style={{ marginTop: 4 }}>{c.totalDays} days</SectionTitle>
                {dayList}
              </>
            ) : (
              <>
                <Pressable onPress={() => setAllDays(!allDays)} accessibilityRole="button" accessibilityLabel={'All days, ' + c.totalDays + ' days'}
                  accessibilityState={{ expanded: allDays }}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, marginTop: 4, paddingHorizontal: 4, borderRadius: 10, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
                  <SectionTitle style={{ flex: 1 }}>All days</SectionTitle>
                  <View style={{ transform: [{ rotate: allDays ? '180deg' : '0deg' }] }}><Icon name="down" size={18} color={t.muted} /></View>
                </Pressable>
                {allDays ? dayList : null}
              </>
            )}
          </>
        ) : (
          <>
            {c.isOwner ? <Button title="Leaderboard" icon="trophy" variant="secondary" onPress={openBoard} block /> : null}
            {joinCode}
            <SectionTitle style={{ marginTop: 4 }}>30 days</SectionTitle>
            {dayList}
          </>
        )}

        {e ? <Button title="Leave course" icon="logout" variant="dangerSoft" onPress={leave} /> : null}
      </ScrollView>
    </View>
  );
}
