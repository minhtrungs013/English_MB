import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fmtDuration } from '../../../components/course';
import { BackBar, Badge, Button, Card, EmptyState, Icon, SectionTitle, T } from '../../../components/ui';
import { api, type BoardRow, type DayBoardRow, type Leaderboard, type OverallBoardRow, type StreakBoardRow } from '../../../lib/api';
import { errMsg, useTheme } from '../../../state/store';

type Tab = 'day' | 'overall' | 'streak';
const TABS: [Tab, string][] = [['day', 'Day'], ['overall', 'Overall'], ['streak', 'Streak']];
type AnyRow = BoardRow<Partial<DayBoardRow & OverallBoardRow & StreakBoardRow>>;

export default function LeaderboardScreen() {
  const { id, day: dayParam } = useLocalSearchParams<{ id: string; day?: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [lb, setLb] = useState<Leaderboard | null>(null);
  const [tab, setTab] = useState<Tab>('day');
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [switching, setSwitching] = useState(false);
  /** The day being shown on the Day tab (undefined = let the server pick today's). */
  const day = useRef<number | undefined>(dayParam ? Number(dayParam) || undefined : undefined);

  const load = useCallback(async () => {
    try { const res = await api.getLeaderboard(id, day.current); setLb(res); day.current = res.day || undefined; setErr(''); } catch (e) { setErr(errMsg(e)); }
  }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const pickDay = async (n: number) => {
    if (n === lb?.day) return;
    day.current = n; setSwitching(true); await load(); setSwitching(false);
  };

  if (!lb) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title="Leaderboard" />
        {err ? (
          <EmptyState icon="alert" tone="red" title="Couldn’t load the leaderboard" text={err}>
            <Button title="Try again" icon="refresh" onPress={() => { setErr(''); void load(); }} />
          </EmptyState>
        ) : <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  const board = (tab === 'day' ? lb.dayBoard : tab === 'overall' ? lb.overall : lb.streak) as { rows: AnyRow[]; me: AnyRow | null; count: number };
  const pinned = board.me && !board.rows.some((r) => r.me) ? board.me : null;

  const value = (r: AnyRow): [string, string] => {
    if (tab === 'day') {
      const parts = [(r.correct ?? 0) + '/' + (r.total ?? 0) + ' correct', fmtDuration(r.durationMs ?? 0)];
      if (r.lateDays) parts.push(r.lateDays + (r.lateDays === 1 ? ' day late' : ' days late'));
      return [String(r.score ?? 0), parts.join(' · ')];
    }
    if (tab === 'overall') return [String(r.score ?? 0), (r.days ?? 0) + ((r.days ?? 0) === 1 ? ' day' : ' days')];
    return [(r.streak ?? 0) + (r.streak === 1 ? ' day' : ' days'), (r.score ?? 0) + ' points'];
  };
  const medal = (rank: number): [string, string] | null =>
    rank === 1 ? [t.warningSoft, t.warning] : rank === 2 ? [t.surface3, t.text] : rank === 3 ? [t.orangeSoft, t.orange] : null;

  const row = (r: AnyRow, i: number, sep = true) => {
    const [main, sub] = value(r);
    const m = medal(r.rank);
    return (
      <View key={r.rank + ':' + r.name + ':' + i} accessible
        accessibilityLabel={'Rank ' + r.rank + ', ' + r.name + (r.me ? ' (you)' : '') + ', ' + main + (tab === 'streak' ? ' streak' : ' points') + ', ' + sub}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 8,
          borderTopWidth: sep && i ? 1 : 0, borderTopColor: t.border, backgroundColor: r.me ? t.primarySoft : 'transparent' }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: m ? m[0] : t.surface2 }}>
          {m && r.rank === 1 ? <Icon name="trophy" size={18} color={m[1]} /> : <T size={14} weight="extrabold" style={{ color: m ? m[1] : t.muted }}>{r.rank}</T>}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T weight={r.me ? 'extrabold' : 'bold'} numberOfLines={1} style={{ flexShrink: 1, color: r.me ? t.primaryInk : t.text }}>{r.name}</T>
            {r.me ? <Badge label="You" bg={t.primary} fg="#fff" /> : null}
          </View>
          <T size={12.5} tone="muted" numberOfLines={1}>{sub}</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {tab === 'streak' ? <Icon name="flame" size={16} color={t.orange} /> : null}
          <T size={17} weight="extrabold" style={{ color: r.me ? t.primaryInk : t.text }}>{main}</T>
        </View>
      </View>
    );
  };

  const empty = tab === 'day'
    ? { title: lb.maxDay ? 'No scores for day ' + lb.day + ' yet' : 'No homework yet', text: lb.maxDay ? 'Scores show up here once learners hand in this day’s homework.' : 'The leaderboard fills up once day 1 is open and learners hand in their homework.' }
    : tab === 'overall'
      ? { title: 'No scores yet', text: 'Hand in homework to earn points. Every day’s score adds up here.' }
      : { title: 'No streaks yet', text: 'Hand in homework on consecutive days to build a streak.' };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title="Leaderboard" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.primary} colors={[t.primary]} />}>
        <T size={13.5} tone="muted">{lb.members + (lb.members === 1 ? ' member' : ' members')} · {board.count} ranked</T>

        <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, gap: 4, borderRadius: 12, backgroundColor: t.surface2 }}>
          {TABS.map(([k, label]) => {
            const on = tab === k;
            return (
              <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}
                style={{ flex: 1, minHeight: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.surface : 'transparent',
                  borderWidth: on ? 1 : 0, borderColor: t.border }}>
                <T size={14} weight="bold" style={{ color: on ? t.text : t.muted }}>{label}</T>
              </Pressable>
            );
          })}
        </View>

        {tab === 'day' && lb.maxDay > 0 ? (
          <View style={{ gap: 8 }}>
            <SectionTitle>Day</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 16 }}>
              {Array.from({ length: lb.maxDay }, (_, k) => k + 1).map((n) => {
                const on = n === lb.day;
                return (
                  <Pressable key={n} onPress={() => void pickDay(n)} disabled={switching} accessibilityRole="button" accessibilityState={{ selected: on, disabled: switching }} accessibilityLabel={'Day ' + n}
                    style={{ minWidth: 44, minHeight: 44, paddingHorizontal: 10, borderRadius: 99, borderWidth: 1, borderColor: on ? t.primary : t.border,
                      backgroundColor: on ? t.primary : t.surface, alignItems: 'center', justifyContent: 'center' }}>
                    <T size={14} weight="bold" style={{ color: on ? '#fff' : t.muted }}>{n}</T>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {err ? <T size={13} weight="semibold" tone="danger">{err}</T> : null}
        {switching ? <ActivityIndicator color={t.primary} style={{ marginTop: 24 }} />
          : !board.rows.length ? (
            <Card><EmptyState icon={tab === 'streak' ? 'flame' : 'trophy'} title={empty.title} text={empty.text} /></Card>
          ) : (
            <>
              <Card pad={false} style={{ overflow: 'hidden' }}>{board.rows.map((r, i) => row(r, i))}</Card>
              {board.count > board.rows.length ? <T size={12.5} tone="muted" center>Showing the top {board.rows.length} of {board.count}</T> : null}
            </>
          )}

      </ScrollView>
      {/* My row stays pinned at the bottom when I'm outside the rows shown. */}
      {!switching && pinned ? (
        <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: insets.bottom + 12, gap: 6, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }}>
          <SectionTitle style={{ paddingHorizontal: 4 }}>Your place</SectionTitle>
          <View style={{ borderRadius: 12, overflow: 'hidden' }}>{row(pinned, 0, false)}</View>
        </View>
      ) : null}
    </View>
  );
}
