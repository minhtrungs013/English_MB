import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fmtAgo, membersSummary, scoreColors } from '../../../components/course';
import { BackBar, Badge, Button, Card, ChipRow, EmptyState, Icon, Input, SectionTitle, T } from '../../../components/ui';
import { api, ApiError, type CourseDetail, type CourseMember, type CourseMembers } from '../../../lib/api';
import { errMsg, useStore, useTheme } from '../../../state/store';

type Sort = 'active' | 'progress' | 'score' | 'name';
const SORTS: [Sort, string][] = [['active', 'Last active'], ['progress', 'Progress'], ['score', 'Score'], ['name', 'Name']];

const sorters: Record<Sort, (a: CourseMember, b: CourseMember) => number> = {
  active: (a, b) => (b.lastActive ?? 0) - (a.lastActive ?? 0),
  progress: (a, b) => b.learned - a.learned || b.homework - a.homework || b.currentDay - a.currentDay,
  // Learners without a score go last.
  score: (a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1) || b.totalScore - a.totalScore,
  name: (a, b) => a.name.localeCompare(b.name)
};

/** Course members with their progress (owner only). */
export default function MembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [res, setRes] = useState<CourseMembers | null>(null);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [err, setErr] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('active');

  const load = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([api.courseMembers(id), api.course(id)]);
      setRes(m); setCourse(c); setErr('');
    } catch (e) {
      setForbidden(e instanceof ApiError && e.status === 403);
      setErr(errMsg(e));
    }
  }, [id]);
  // Reload on focus so someone removed on the detail screen disappears from the list.
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (!res) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title="Members" />
        {err ? (
          <EmptyState icon={forbidden ? 'lock' : 'alert'} tone="red" title={forbidden ? 'Only the owner can see members' : 'Couldn’t load the members'} text={err}>
            {forbidden ? null : <Button title="Try again" icon="refresh" onPress={() => { setErr(''); void load(); }} />}
          </EmptyState>
        ) : <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  const all = res.members;
  const sum = membersSummary(all);
  const term = q.trim().toLowerCase();
  const list = all.filter((m) => !term || m.name.toLowerCase().includes(term)).sort(sorters[sort]);
  const code = course?.joinCode ?? '';

  const row = (m: CourseMember, i: number) => {
    const me = m.userId === data.userId;
    const ago = fmtAgo(m.lastActive);
    const [sBg, sFg] = m.avgScore !== null ? scoreColors(m.avgScore, t) : [t.surface2, t.faint];
    const day = m.currentDay < 1 ? 'Not started' : 'Day ' + m.currentDay + '/' + res.totalDays;
    const a11y = m.name + (me ? ' (you)' : '') + '. ' + day + '. ' + m.learned + ' learned, ' + m.listened + ' listening, ' + m.homework + ' homework handed in'
      + (m.missing >= 2 ? ', ' + m.missing + ' missing' : '') + '. ' + (m.avgScore !== null ? 'Average score ' + m.avgScore : 'No score yet')
      + (m.streak ? ', ' + m.streak + '-day streak' : '') + (ago ? ', active ' + ago : '');
    return (
      <Pressable key={m.userId} accessibilityRole="button" accessibilityLabel={a11y} accessibilityHint="Opens this learner’s progress"
        onPress={() => router.push({ pathname: '/course/[id]/member/[userId]', params: { id, userId: m.userId } })}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 14, paddingVertical: 10,
          borderTopWidth: i ? 1 : 0, borderTopColor: t.border, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T weight="extrabold" numberOfLines={1} style={{ flexShrink: 1 }}>{m.name}</T>
            {me ? <Badge label="You" bg={t.primary} fg="#fff" /> : null}
          </View>
          <T size={13} tone="muted" numberOfLines={1}>{day} · {m.learned} learned · 🎧 {m.listened} · {m.homework} homework</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            {m.missing >= 2 ? <Badge label={m.missing + ' missing'} bg={t.warningSoft} fg={t.warning} /> : null}
            {m.streak ? <Badge label={'🔥 ' + m.streak} bg={t.orangeSoft} fg={t.orange} /> : null}
            {ago ? <T size={12.5} tone="faint">active {ago}</T> : <T size={12.5} tone="faint">no activity yet</T>}
          </View>
        </View>
        <View style={{ minWidth: 44, height: 44, paddingHorizontal: 6, borderRadius: 12, backgroundColor: sBg, alignItems: 'center', justifyContent: 'center' }}>
          <T size={16} weight="extrabold" style={{ color: sFg }}>{m.avgScore !== null ? m.avgScore : '—'}</T>
        </View>
        <Icon name="right" size={16} color={t.faint} />
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title={course ? 'Members · ' + course.title : 'Members'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.primary} colors={[t.primary]} />}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {([
            [String(sum.count), sum.count === 1 ? 'learner' : 'learners'],
            [sum.avg !== null ? String(sum.avg) : '—', 'avg score'],
            [String(sum.active), 'active · 2 days']
          ] as const).map(([v, l]) => (
            <View key={l} accessible accessibilityLabel={l + ': ' + v} style={{ flex: 1, backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 14, padding: 12, alignItems: 'center' }}>
              <T size={20} weight="extrabold">{v}</T>
              <T size={12} weight="semibold" tone="muted" center>{l}</T>
            </View>
          ))}
        </View>

        {!all.length ? (
          <Card>
            <EmptyState icon="users" title="No learners yet" text={code ? 'Share the join code so people can join this course.' : 'People who join this course show up here.'}>
              {code ? (
                <View accessible accessibilityLabel={'Join code ' + code.split('').join(' ')} style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: t.surface2 }}>
                  <T size={28} weight="extrabold" style={{ letterSpacing: 4 }}>{code}</T>
                </View>
              ) : null}
            </EmptyState>
          </Card>
        ) : (
          <>
            <Input value={q} onChangeText={setQ} placeholder="Search by name" leftIcon="search" autoCorrect={false} returnKeyType="search" accessibilityLabel="Search members by name" />
            <View style={{ gap: 6 }}>
              <SectionTitle>Sort by</SectionTitle>
              <ChipRow>
                {SORTS.map(([k, label]) => {
                  const on = sort === k;
                  return (
                    <Pressable key={k} onPress={() => setSort(k)} accessibilityRole="button" accessibilityLabel={'Sort by ' + label} accessibilityState={{ selected: on }}
                      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1, justifyContent: 'center',
                        borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : pressed ? t.surface2 : t.surface })}>
                      <T size={13.5} weight="bold" style={{ color: on ? t.primaryInk : t.muted }}>{label}</T>
                    </Pressable>
                  );
                })}
              </ChipRow>
            </View>
            {list.length ? (
              <Card pad={false} style={{ overflow: 'hidden' }}>{list.map(row)}</Card>
            ) : (
              <Card><T tone="muted" center>No one matches “{q.trim()}”.</T></Card>
            )}
            <T size={12.5} tone="muted" center>{res.daysWithWords} of {res.totalDays} days have words so far.</T>
          </>
        )}
      </ScrollView>
    </View>
  );
}
