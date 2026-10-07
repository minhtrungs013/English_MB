import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { coursePlan, fmtDateKey, planNextLabel, type CoursePlan } from '../../components/course';
import { HomeSearch } from '../../components/home-search';
import { Sheet, SheetItem } from '../../components/sheet';
import { Button, Card, EmptyState, Icon, IconTile, LevelBadge, Screen, T } from '../../components/ui';
import { api, type CourseSummary } from '../../lib/api';
import { DAY, dayKey, fmtAgo, isDue } from '../../lib/data';
import { useNow } from '../../hooks/use-now';
import { useStore, useTheme } from '../../state/store';

function Stat({ icon, tone, value, label, foot }: { icon: Parameters<typeof IconTile>[0]['name']; tone: Parameters<typeof IconTile>[0]['tone']; value: number; label: string; foot?: string }) {
  return (
    <Card style={{ flex: 1, gap: 2, padding: 16, minHeight: 132 }}>
      <View style={{ marginBottom: 10 }}><IconTile name={icon} tone={tone} /></View>
      <T size={28} weight="extrabold" style={{ letterSpacing: -0.8, lineHeight: 32 }}>{value}</T>
      <T size={14} weight="semibold" tone="muted">{label}</T>
      {foot ? <T size={12.5} weight="semibold" tone="muted" style={{ marginTop: 4 }}>{foot}</T> : null}
    </Card>
  );
}

/** Bell with the unread count; opens the notifications screen. */
function NotificationBell({ unread }: { unread: number }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => router.push('/notifications')} accessibilityRole="button" hitSlop={2}
      accessibilityLabel={unread ? 'Notifications, ' + unread + ' unread' : 'Notifications'}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.surface2 : 'transparent' })}>
      <Icon name="bell" size={22} color={t.muted} />
      {unread ? (
        <View style={{ position: 'absolute', top: 4, right: 2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: t.danger, borderWidth: 2, borderColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
          <T size={10} weight="extrabold" tone="white" style={{ lineHeight: 12 }}>{unread > 9 ? '9+' : unread}</T>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Compact link to my first joined course (or to all courses). */
function CoursesCard() {
  const t = useTheme();
  const [course, setCourse] = useState<CourseSummary | null | undefined>(undefined);
  const [plan, setPlan] = useState<{ id: string; p: CoursePlan } | null>(null);
  useFocusEffect(useCallback(() => {
    let alive = true;
    api.courses('joined')
      .then(async (l) => {
        if (!alive) return;
        // Prefer a course that has started over one still waiting for its start date.
        const first = l.find((x) => (x.enrollment?.currentDay ?? 0) >= 1) ?? l[0];
        setCourse(first ?? null);
        // The list has no per-day data; the course itself says what today's next step is.
        const d = first ? await api.course(first.id) : null;
        const p = d ? coursePlan(d) : null;
        if (alive) setPlan(d && p ? { id: d.id, p } : null);
      })
      .catch(() => { if (alive) setCourse((c) => c ?? null); });
    return () => { alive = false; };
  }, []));
  const e = course?.enrollment;
  // Day 0: joined, but the course's start date hasn't come yet.
  const upcoming = !!e && e.currentDay < 1;
  const title = course && e ? (upcoming ? 'Coming up: ' : 'Continue: ') + course.title : 'Explore courses';
  const sub = course && e
    ? upcoming
      ? 'Starts ' + fmtDateKey(e.startDay)
      : 'Day ' + e.currentDay + ' of ' + course.totalDays + (plan && plan.id === course.id ? ' · ' + planNextLabel(plan.p) : '')
    : 'Learn a few words every day for 30 days.';
  return (
    <Pressable onPress={() => (course ? router.push({ pathname: '/course/[id]', params: { id: course.id } }) : router.push('/courses'))}
      accessibilityRole="button" accessibilityLabel={title + '. ' + sub}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 64, borderRadius: 16, borderWidth: 1, borderColor: t.border, backgroundColor: pressed ? t.surface2 : t.surface })}>
      <IconTile name="cap" tone="indigo" />
      <View style={{ flex: 1 }}>
        <T weight="extrabold" numberOfLines={1}>{title}</T>
        <T size={13} tone="muted" numberOfLines={1}>{sub}</T>
      </View>
      <Icon name="right" size={16} color={t.faint} />
    </Pressable>
  );
}

export default function Home() {
  const { data, actions, unread } = useStore();
  const t = useTheme();
  const { words, progress, settings } = data;
  const now = useNow();
  const due = words.filter((w) => isDue(w, now)).length;
  const mastered = words.filter((w) => w.status === 'mastered').length;
  const week = words.filter((w) => w.addedAt > now - 7 * DAY).length;
  const today = dayKey(now);
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const streak = progress.lastStreakDay === today || progress.lastStreakDay === dayKey(y) ? progress.streak : 0;
  const done = progress.reviewedDay === today ? progress.reviewedToday : 0;
  const total = done + due;
  const pct = total ? Math.round((done / total) * 100) : 100;
  const hour = new Date(now).getHours();
  const greeting = (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + ', ' + (settings.name || 'there');
  const recent = words.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, 5);
  const initial = (settings.name || '?').trim().charAt(0).toUpperCase();
  const [menu, setMenu] = useState(false);
  /** Close the account menu, then go (so the sheet doesn't stay open behind the next screen). */
  const goTo = (path: '/courses' | '/notifications' | '/categories' | '/tags' | '/settings') => { setMenu(false); router.push(path); };
  // Coming back to Home is a good moment to check for new notifications.
  // (Only on focus: `actions` is a new object every render, and refreshUnread only uses stable state setters and refs.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { void actions.refreshUnread(); }, []));

  const startReview = () => {
    if (!actions.dueIds().length) { actions.showToast('No words are due right now.'); return; }
    router.push({ pathname: '/review', params: { mode: 'due' } });
  };

  return (
    <Screen
      title={greeting} sub="Keep learning a few words today."
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <NotificationBell unread={unread} />
          <Pressable onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel="Account menu" hitSlop={2}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#FBD9BC', alignItems: 'center', justifyContent: 'center' }}>
            <T size={16} weight="extrabold" style={{ color: '#7A3A0C' }}>{initial}</T>
          </Pressable>
        </View>
      }>
      <View style={{ gap: 12 }}>
        <HomeSearch />
        <CoursesCard />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Stat icon="layers" tone="indigo" value={words.length} label="Total words" foot={'+' + week + ' this week'} />
          <Stat icon="clock" tone="amber" value={due} label="To review" />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Stat icon="award" tone="green" value={mastered} label="Mastered" foot={(words.length ? Math.round((mastered / words.length) * 100) : 0) + '% of all'} />
          <Stat icon="flame" tone="orange" value={streak} label="Day streak" foot={streak ? 'Keep it going!' : 'Review to start one'} />
        </View>

        <View style={{ backgroundColor: t.primary, borderRadius: 18, padding: 22, gap: 12 }}>
          <T size={13} weight="bold" style={{ color: 'rgba(255,255,255,0.85)', letterSpacing: 0.8, textTransform: 'uppercase' }}>{"Today's Review"}</T>
          <T size={22} weight="extrabold" tone="white" style={{ letterSpacing: -0.4 }}>
            {due ? 'You have ' + due + (due === 1 ? ' word' : ' words') + ' waiting for review.' : 'You’re all caught up for today.'}
          </T>
          <View style={{ height: 10, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden', marginTop: 4 }}>
            <View style={{ height: '100%', width: `${pct}%` as const, backgroundColor: '#fff', borderRadius: 99 }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T size={14} weight="semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>{done} / {total} completed</T>
            <T size={14} weight="semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>{pct}%</T>
          </View>
          {due > 0
            ? <Button title="Start Review" variant="white" size="lg" icon="right" onPress={startReview} block />
            : <Button title="Practice More" variant="white" size="lg" onPress={() => router.push('/practice')} block />}
        </View>

        <Card pad={false}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 }}>
            <T size={17} weight="extrabold">Recent vocabulary</T>
            <Pressable onPress={() => router.push('/words')} hitSlop={8} accessibilityRole="button"><T size={13.5} weight="bold" tone="primaryInk">View all</T></Pressable>
          </View>
          {recent.length ? recent.map((w) => (
            <Pressable key={w.id} onPress={() => router.push({ pathname: '/word/[id]', params: { id: w.id } })} accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 58, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
              <View style={{ flex: 1 }}>
                <T size={15.5} weight="extrabold">{w.word}</T>
                <T size={13} tone="muted" numberOfLines={1}>{w.vi}</T>
              </View>
              <LevelBadge level={w.level} />
              <T size={12.5} tone="muted">{fmtAgo(w.addedAt)}</T>
              <Icon name="right" size={16} color={t.faint} />
            </Pressable>
          )) : (
            <EmptyState icon="book" title="No vocabulary yet." text="Pick words to learn from the shared library — 500 words for IT work, interviews and meetings.">
              <Button title="Browse the Library" icon="globe" onPress={() => router.push('/library')} />
            </EmptyState>
          )}
        </Card>
      </View>

      {/* Account menu (like the avatar menu on the web app). */}
      <Sheet visible={menu} onClose={() => setMenu(false)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4, paddingBottom: 4 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FBD9BC', alignItems: 'center', justifyContent: 'center' }}>
            <T size={18} weight="extrabold" style={{ color: '#7A3A0C' }}>{initial}</T>
          </View>
          <View style={{ flex: 1 }}>
            <T weight="extrabold">{settings.name}</T>
            <T size={13} tone="muted" numberOfLines={1}>{settings.email}</T>
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: t.border }} />
        <View>
          <SheetItem icon="cap" label="Courses" onPress={() => goTo('/courses')} />
          <SheetItem icon="bell" label={unread ? 'Notifications (' + unread + ' unread)' : 'Notifications'} onPress={() => goTo('/notifications')} />
          <SheetItem icon="folder" label="Categories" onPress={() => goTo('/categories')} />
          <SheetItem icon="tag" label="Tags" onPress={() => goTo('/tags')} />
          <SheetItem icon="sliders" label="Settings" onPress={() => goTo('/settings')} />
        </View>
        <View style={{ height: 1, backgroundColor: t.border }} />
        <SheetItem icon="logout" label="Log out" danger onPress={() => { setMenu(false); void actions.logout(); }} />
      </Sheet>
    </Screen>
  );
}
