import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import {
  courseStartLabel, coursePlan, dayOpensOn, fmtDateKey, joinedMessage, membersSummary, Progress, scoreColors, STEP_LABEL, type CoursePlan
} from '../../../components/course';
import { firstOpenStep, openStep } from '../../../components/day-flow';
import { BackBar, Badge, Button, Card, EmptyState, Icon, IconButton, IconTile, SectionTitle, T } from '../../../components/ui';
import { api, type CourseDay, type CourseDetail, type CourseMembers, type Leaderboard } from '../../../lib/api';
import { errMsg, useStore, useTheme } from '../../../state/store';

type DayState = 'learned' | 'today' | 'open' | 'locked' | 'empty';
type Tab = 'today' | 'map' | 'board' | 'members';

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actions } = useStore();
  const t = useTheme();
  const [c, setC] = useState<CourseDetail | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The course day whose listening dialogue exists (null = none, or not checked yet). */
  const [listeningDay, setListeningDay] = useState<number | null>(null);
  /** null = the first tab that applies (Today for learners). */
  const [tab, setTab] = useState<Tab | null>(null);
  /** A course map day being opened (checking which step comes next). */
  const [opening, setOpening] = useState<number | null>(null);
  const [lb, setLb] = useState<Leaderboard | null>(null);
  const [lbErr, setLbErr] = useState('');
  const [members, setMembers] = useState<CourseMembers | null>(null);
  const [membersErr, setMembersErr] = useState('');

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
  /** The leaderboard / members tabs were opened, so they're kept up to date. */
  const wanted = useRef({ board: false, members: false });
  const loadBoard = useCallback(async () => {
    wanted.current.board = true;
    try { setLb(await api.getLeaderboard(id)); setLbErr(''); } catch (e) { setLbErr(errMsg(e)); }
  }, [id]);
  const loadMembers = useCallback(async () => {
    wanted.current.members = true;
    try { setMembers(await api.courseMembers(id)); setMembersErr(''); } catch (e) { setMembersErr(errMsg(e)); }
  }, [id]);
  // Reload on focus so the plan moves on when coming back from a step (and scores / members are fresh).
  useFocusEffect(useCallback(() => {
    void load();
    if (wanted.current.board) void loadBoard();
    if (wanted.current.members) void loadMembers();
  }, [load, loadBoard, loadMembers]));

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

  /* ---------- tabs ---------- */
  const tabs: [Tab, string][] = [
    ...(e ? [['today', 'Today'] as [Tab, string]] : []),
    ['map', 'Course map'],
    ...(e || c.isOwner ? [['board', 'Leaderboard'] as [Tab, string]] : []),
    ...(c.isOwner ? [['members', 'Members'] as [Tab, string]] : [])
  ];
  const active: Tab = tab && tabs.some(([k]) => k === tab) ? tab : tabs[0][0];
  const pickTab = (k: Tab) => {
    setTab(k);
    if (k === 'board' && !lb) void loadBoard();
    if (k === 'members' && !members) void loadMembers();
  };
  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), active === 'board' ? loadBoard() : null, active === 'members' ? loadMembers() : null]);
    setRefreshing(false);
  };

  const join = async () => {
    setBusy(true);
    const res = await actions.call(api.joinCourse(c.id));
    setBusy(false);
    if (res) { setC(res); setTab('today'); actions.showToast('Joined “' + res.title + '”. ' + joinedMessage(res)); }
  };
  const leave = () => Alert.alert('Leave “' + c.title + '”?', 'Your progress in this course will be lost. Words you already saved stay in My Vocabulary.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Leave', style: 'destructive', onPress: async () => {
        const ok = await actions.call(api.leaveCourse(c.id).then(() => true));
        if (!ok) return;
        actions.showToast('You left “' + c.title + '”.');
        if (c.isOwner || c.visibility === 'public') { setTab(null); void load(); }
        else router.back();
      }
    }
  ]);

  const params = (day: number) => ({ id: c.id, day: String(day) });
  const openDay = (day: number) => router.push({ pathname: '/course/[id]/day/[day]', params: params(day) });
  const openHomework = (day: number) => router.push({ pathname: '/course/[id]/homework/[day]', params: params(day) });
  const openBoard = () => router.push({ pathname: '/course/[id]/leaderboard', params: { id: c.id } });
  const openMembers = () => router.push({ pathname: '/course/[id]/members', params: { id: c.id } });

  /** A course map day: its next unfinished step in the day flow, or the day page once its homework is handed in. */
  const openMapDay = async (d: CourseDay) => {
    if (!e || d.day > e.currentDay || d.myScore != null) { openDay(d.day); return; }
    setOpening(d.day);
    // Today's listening was already checked; other days are checked when it matters.
    const step = await firstOpenStep(c, d.day, d.day === e.currentDay ? listeningDay === d.day : undefined);
    setOpening(null);
    if (step) openStep(c.id, d.day, step); else openDay(d.day);
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

  /* ---------- course map ---------- */
  const dayRow = (d: CourseDay, i: number) => {
    const s = stateOf(d);
    const tappable = s === 'learned' || s === 'today' || s === 'open';
    const isToday = !!e && d.day === e.currentDay;
    const sub = s === 'learned' ? (isToday ? 'Today · ' : '') + 'Learned · ' + d.count + ' words'
      : s === 'today' ? 'Today · ' + d.count + ' words'
      : s === 'open' ? d.count + ' words'
      : s === 'locked' ? d.count + ' words · opens ' + (e ? 'on ' + fmtDateKey(dayOpensOn(e.startDay, d.day)) : 'on day ' + d.day)
      : 'Coming soon';
    const score = d.myScore ?? null;
    const listened = !!e?.listened?.includes(d.day);
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
          <T size={13} tone={isToday ? 'primaryInk' : 'muted'} weight={isToday ? 'bold' : 'regular'}>{sub}</T>
        </View>
        {listened ? <Badge label="🎧" bg={t.infoSoft} fg={t.info} /> : null}
        {score !== null ? <Badge label={String(score)} bg={sBg} fg={sFg} /> : null}
        {opening === d.day ? <ActivityIndicator size="small" color={t.primary} /> : tappable ? <Icon name="right" size={16} color={t.faint} /> : null}
      </>
    );
    const a11y = 'Day ' + d.day + ', ' + sub + (listened ? ', listening done' : '') + (score !== null ? ', homework score ' + score : '');
    const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: 60, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: t.border };
    return tappable ? (
      <Pressable key={d.day} onPress={() => void openMapDay(d)} disabled={opening !== null} accessibilityRole="button" accessibilityLabel={a11y}
        accessibilityState={{ busy: opening === d.day }}
        style={({ pressed }) => [rowStyle, { backgroundColor: pressed ? t.surface2 : isToday ? t.primarySoft : 'transparent' }]}>
        {body}
      </Pressable>
    ) : (
      <View key={d.day} style={rowStyle} accessible accessibilityLabel={a11y}>{body}</View>
    );
  };

  /* ---------- today ---------- */
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

  const todayCard = (p: CoursePlan) => {
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
    const words = p.today?.count ?? 0;
    const total = p.steps.length;
    const doneCount = p.steps.filter((s) => s.state === 'done').length;
    const complete = p.next === 'done';
    const last = p.day >= p.totalDays;
    const [sBg, sFg] = p.score !== null ? scoreColors(p.score, t) : [t.successSoft, t.success];
    const headline = complete ? 'Day ' + p.day + ' complete' : words + ' new ' + (words === 1 ? 'word' : 'words') + ' today';
    const sub = complete
      ? (last ? 'You finished all ' + p.totalDays + ' days. Great work!' : 'Come back tomorrow for day ' + (p.day + 1) + '.')
      : doneCount ? doneCount + ' of ' + total + ' steps done' : total + ' short steps, one after the other';

    let action = null;
    if (complete) {
      action = <Button title={'Day ' + p.day + ' complete ✓'} variant="secondary" size="lg" onPress={() => openDay(p.day)} block
        accessibilityLabel={'Day ' + p.day + ' complete. Open day ' + p.day + ' to see its words'} />;
    } else if (p.next !== 'empty' && p.next !== 'done') {
      const step = p.next;
      const k = p.steps.findIndex((s) => s.id === step) + 1;
      const title = doneCount ? 'Continue: ' + STEP_LABEL[step] + ' · step ' + k + ' of ' + total : 'Start day ' + p.day;
      action = <Button title={title} icon="right" size="lg" onPress={() => openStep(c.id, p.day, step)} block />;
    }

    return (
      <Card style={[{ gap: 14, padding: 18 }, complete ? { backgroundColor: t.successSoft, borderColor: t.success } : { borderColor: t.primary, borderWidth: 1.5 }]}>
        <View accessible accessibilityLabel={'Today, day ' + p.day + ' of ' + p.totalDays + '. ' + headline + '. ' + sub + (p.score !== null ? '. Homework score ' + p.score : '')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {complete ? (
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: p.score !== null ? sBg : t.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: sFg }}>
              {p.score !== null ? <T size={20} weight="extrabold" style={{ color: sFg, lineHeight: 26 }}>{p.score}</T> : <Icon name="check" size={26} color={sFg} />}
            </View>
          ) : <IconTile name="book" tone="indigo" size={52} />}
          <View style={{ flex: 1 }}>
            <SectionTitle>Today · day {p.day} / {p.totalDays}</SectionTitle>
            <T size={19} weight="extrabold">{headline}</T>
            <T size={13} tone="muted">{sub}</T>
          </View>
        </View>
        {/* Compact step statuses: ✓ done, the step to do now, 🔒 the ones after it. */}
        <View accessible accessibilityLabel={'Steps: ' + p.steps.map((s) => STEP_LABEL[s.id] + ' ' + (s.state === 'done' ? 'done' : s.state === 'active' ? 'to do now' : 'locked')).join(', ')}
          style={{ flexDirection: 'row', gap: 6 }}>
          {p.steps.map((s, k) => {
            const done = s.state === 'done';
            const now = s.state === 'active';
            const color = done ? t.success : now ? t.primaryInk : t.faint;
            return (
              <View key={s.id} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: done ? (complete ? t.surface : t.successSoft) : now ? t.primary : t.surface2 }}>
                  {done ? <Icon name="check" size={15} color={t.success} strokeWidth={2.6} />
                    : now ? <T size={13} weight="extrabold" style={{ color: '#fff', lineHeight: 17 }}>{k + 1}</T>
                    : <Icon name="lock" size={13} color={t.faint} />}
                </View>
                <T size={11.5} weight={now ? 'extrabold' : 'semibold'} numberOfLines={1} style={{ color }}>{STEP_LABEL[s.id]}</T>
              </View>
            );
          })}
        </View>
        {action}
        {!complete ? <Button title={'See day ' + p.day + ' words'} variant="ghost" size="sm" onPress={() => openDay(p.day)} block style={{ minHeight: 44 }} /> : null}
      </Card>
    );
  };

  /* ---------- leaderboard (compact) ---------- */
  const statTiles = (tiles: [string, string][]) => (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {tiles.map(([v, l]) => (
        <View key={l} accessible accessibilityLabel={l + ': ' + v} style={{ flex: 1, backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 14, padding: 12, alignItems: 'center' }}>
          <T size={19} weight="extrabold">{v}</T>
          <T size={12} weight="semibold" tone="muted" center>{l}</T>
        </View>
      ))}
    </View>
  );
  const boardTab = () => {
    if (!lb) {
      return lbErr ? (
        <Card><EmptyState icon="alert" tone="red" title="Couldn’t load the leaderboard" text={lbErr}>
          <Button title="Try again" icon="refresh" onPress={() => { setLbErr(''); void loadBoard(); }} />
        </EmptyState></Card>
      ) : <ActivityIndicator color={t.primary} style={{ marginTop: 24 }} />;
    }
    const me = lb.overall.me;
    const rows = lb.dayBoard.rows.slice(0, 5);
    return (
      <>
        {e ? statTiles([
          [me ? '#' + me.rank : '—', 'your rank'],
          [me ? String(me.score) : '—', 'total score'],
          [lb.streak.me ? '🔥 ' + lb.streak.me.streak : '—', 'day streak']
        ]) : null}
        <SectionTitle style={{ marginTop: 4 }}>{lb.maxDay ? 'Day ' + lb.day + ' · top scores' : 'Day scores'}</SectionTitle>
        {rows.length ? (
          <Card pad={false} style={{ overflow: 'hidden' }}>
            {rows.map((r, i) => (
              <View key={r.rank + ':' + r.name + ':' + i} accessible accessibilityLabel={'Rank ' + r.rank + ', ' + r.name + (r.me ? ' (you)' : '') + ', ' + r.score + ' points'}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: t.border, backgroundColor: r.me ? t.primarySoft : 'transparent' }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: r.rank === 1 ? t.warningSoft : t.surface2 }}>
                  {r.rank === 1 ? <Icon name="trophy" size={16} color={t.warning} /> : <T size={13} weight="extrabold" tone="muted">{r.rank}</T>}
                </View>
                <T weight={r.me ? 'extrabold' : 'bold'} numberOfLines={1} style={{ flex: 1, color: r.me ? t.primaryInk : t.text }}>{r.name}{r.me ? ' (you)' : ''}</T>
                <T size={16} weight="extrabold" style={{ color: r.me ? t.primaryInk : t.text }}>{r.score}</T>
              </View>
            ))}
          </Card>
        ) : (
          <Card><T tone="muted" center>No scores for this day yet. They show up once homework is handed in.</T></Card>
        )}
        <Button title="Full leaderboard" icon="trophy" variant="secondary" onPress={openBoard} block />
      </>
    );
  };

  /* ---------- members (owner) ---------- */
  const joinCode = c.isOwner && c.joinCode ? (
    <Card style={{ gap: 6 }}>
      <SectionTitle>Join code</SectionTitle>
      <View accessible accessibilityLabel={'Join code ' + c.joinCode.split('').join(' ')}><T size={28} weight="extrabold" style={{ letterSpacing: 4 }}>{c.joinCode}</T></View>
      <T size={13} tone="muted">Share this code so others can join{c.visibility === 'private' ? ' this private course' : ''}.</T>
    </Card>
  ) : null;
  const membersTab = () => {
    if (!members) {
      return membersErr ? (
        <Card><EmptyState icon="alert" tone="red" title="Couldn’t load the members" text={membersErr}>
          <Button title="Try again" icon="refresh" onPress={() => { setMembersErr(''); void loadMembers(); }} />
        </EmptyState></Card>
      ) : <ActivityIndicator color={t.primary} style={{ marginTop: 24 }} />;
    }
    const sum = membersSummary(members.members);
    const behind = members.members.filter((m) => m.missing >= 2).length;
    return (
      <>
        {statTiles([
          [String(sum.count), sum.count === 1 ? 'learner' : 'learners'],
          [sum.avg !== null ? String(sum.avg) : '—', 'avg score'],
          [String(sum.active), 'active · 2 days']
        ])}
        {behind ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: t.warningSoft }}>
            <Icon name="alert" size={18} color={t.warning} />
            <T size={13.5} weight="semibold" style={{ flex: 1, color: t.warning }}>
              {behind} {behind === 1 ? 'learner is' : 'learners are'} missing 2 or more homeworks.
            </T>
          </View>
        ) : null}
        <Button title="See all members" icon="right" onPress={openMembers} block />
        {joinCode}
      </>
    );
  };

  /* ---------- header ---------- */
  const startLabel = courseStartLabel(c);
  const upcoming = startLabel.startsWith('Starts');
  const header = (
    <Card style={{ gap: 10 }}>
      <T size={22} weight="extrabold" style={{ letterSpacing: -0.4 }}>{c.title}</T>
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

  // Segmented tabs; they scroll sideways when four don't fit on a narrow phone.
  const tabBar = tabs.length > 1 ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, borderRadius: 12, backgroundColor: t.surface2 }}
      contentContainerStyle={{ flexGrow: 1, padding: 4 }}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexGrow: 1, gap: 4 }}>
        {tabs.map(([k, label]) => {
          const on = active === k;
          return (
            <Pressable key={k} onPress={() => pickTab(k)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}
              style={{ flexGrow: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                backgroundColor: on ? t.surface : 'transparent', borderWidth: on ? 1 : 0, borderColor: t.border }}>
              <T size={13.5} weight="bold" numberOfLines={1} style={{ color: on ? t.text : t.muted }}>{label}</T>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  ) : null;

  let body = null;
  if (active === 'today' && plan) {
    body = <>{catchUpNotice(plan)}{todayCard(plan)}</>;
  } else if (active === 'map') {
    body = (
      <>
        <SectionTitle style={{ marginTop: 4 }}>{c.totalDays} days</SectionTitle>
        {!e && c.isOwner ? <T size={13} tone="muted">Preview — tap a day to see its words.</T> : null}
        <Card pad={false} style={{ overflow: 'hidden' }}>{c.days.map(dayRow)}</Card>
      </>
    );
  } else if (active === 'board') {
    body = boardTab();
  } else if (active === 'members') {
    body = membersTab();
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title="Course" right={c.isOwner ? <IconButton name="edit" label="Edit course" color={t.primaryInk} onPress={() => router.push({ pathname: '/course-edit/[id]', params: { id: c.id } })} /> : undefined} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.primary} colors={[t.primary]} />}>
        {header}
        {tabBar}
        {body}
        {e && (active === 'today' || active === 'map') ? <Button title="Leave course" icon="logout" variant="dangerSoft" onPress={leave} /> : null}
      </ScrollView>
    </View>
  );
}
