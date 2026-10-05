import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Progress } from '../../../components/course';
import { BackBar, Badge, Button, Card, EmptyState, Icon, IconButton, SectionTitle, T } from '../../../components/ui';
import { api, type CourseDay, type CourseDetail } from '../../../lib/api';
import { errMsg, useStore, useTheme } from '../../../state/store';

type DayState = 'learned' | 'today' | 'open' | 'locked' | 'empty';

export default function CourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actions } = useStore();
  const t = useTheme();
  const [c, setC] = useState<CourseDetail | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setC(await api.course(id)); setErr(''); } catch (e) { setErr(errMsg(e)); }
  }, [id]);
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
  const join = async () => {
    setBusy(true);
    const res = await actions.call(api.joinCourse(c.id));
    setBusy(false);
    if (res) { setC(res); actions.showToast('Joined “' + res.title + '”. Day 1 is open!'); }
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
  const openDay = (d: CourseDay) => router.push({ pathname: '/course/[id]/day/[day]', params: { id: c.id, day: String(d.day) } });
  const current = e ? c.days.find((d) => d.day === e.currentDay) : undefined;

  const dayRow = (d: CourseDay, i: number) => {
    const s = stateOf(d);
    const tappable = s === 'learned' || s === 'today' || s === 'open';
    const sub = s === 'learned' ? 'Learned · ' + d.count + ' words'
      : s === 'today' ? 'Today · ' + d.count + ' words'
      : s === 'open' ? d.count + ' words'
      : s === 'locked' ? d.count + ' words · opens on day ' + d.day
      : 'Coming soon';
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
        {tappable ? <Icon name="right" size={16} color={t.faint} /> : null}
      </>
    );
    const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 60, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: t.border };
    return tappable ? (
      <Pressable key={d.day} onPress={() => openDay(d)} accessibilityRole="button" accessibilityLabel={'Day ' + d.day + ', ' + sub}
        style={({ pressed }) => [rowStyle, { backgroundColor: pressed ? t.surface2 : s === 'today' ? t.primarySoft : 'transparent' }]}>
        {body}
      </Pressable>
    ) : (
      <View key={d.day} style={rowStyle} accessible accessibilityLabel={'Day ' + d.day + ', ' + sub}>{body}</View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title="Course" right={c.isOwner ? <IconButton name="edit" label="Edit course" color={t.primaryInk} onPress={() => router.push({ pathname: '/course-edit/[id]', params: { id: c.id } })} /> : undefined} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.primary} colors={[t.primary]} />}>
        <Card style={{ gap: 10 }}>
          <T size={24} weight="extrabold" style={{ letterSpacing: -0.4 }}>{c.title}</T>
          <T size={13.5} tone="muted">by {c.isOwner ? 'You' : c.ownerName}</T>
          {c.description ? <T>{c.description}</T> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Badge label={c.readyDays + '/' + c.totalDays + ' days ready'} bg={t.surface2} fg={t.muted} />
            <Badge label={c.wordsPerDay + ' words/day'} bg={t.surface2} fg={t.muted} />
            <Badge label={c.members + (c.members === 1 ? ' member' : ' members')} bg={t.surface2} fg={t.muted} />
            <Badge label={c.visibility === 'public' ? 'Public' : 'Private'} bg={c.visibility === 'public' ? t.successSoft : t.warningSoft} fg={c.visibility === 'public' ? t.success : t.warning} />
          </View>
          {e ? (
            <View style={{ gap: 6, marginTop: 4 }}>
              <Progress pct={(e.learned.length / c.totalDays) * 100} />
              <T size={13.5} weight="semibold" tone="muted">Day {e.currentDay} of {c.totalDays} · {e.learned.length} learned</T>
            </View>
          ) : null}
          {e && current && current.count > 0 && !e.learned.includes(current.day) ? (
            <Button title={'Learn day ' + current.day} icon="right" onPress={() => openDay(current)} block />
          ) : null}
          {!e ? (
            <Button title={c.isOwner ? 'Take this course yourself' : 'Join course'} icon="plus" loading={busy} onPress={join} variant={c.isOwner ? 'secondary' : 'primary'} block />
          ) : null}
        </Card>

        {c.isOwner && c.joinCode ? (
          <Card style={{ gap: 6 }}>
            <SectionTitle>Join code</SectionTitle>
            <View accessible accessibilityLabel={'Join code ' + c.joinCode.split('').join(' ')}><T size={28} weight="extrabold" style={{ letterSpacing: 4 }}>{c.joinCode}</T></View>
            <T size={13} tone="muted">Share this code so others can join{c.visibility === 'private' ? ' this private course' : ''}.</T>
          </Card>
        ) : null}

        <SectionTitle style={{ marginTop: 4 }}>30 days</SectionTitle>
        <Card pad={false} style={{ overflow: 'hidden' }}>{c.days.map(dayRow)}</Card>

        {e ? <Button title="Leave course" icon="logout" variant="dangerSoft" onPress={leave} /> : null}
      </ScrollView>
    </View>
  );
}
