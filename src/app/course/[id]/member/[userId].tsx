import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { courseTodayKey, fmtAgo, fmtDateKey, fmtDuration, penaltyFor, scoreColors } from '../../../../components/course';
import { BackBar, Badge, Button, Card, EmptyState, SectionTitle, T } from '../../../../components/ui';
import { api, type MemberDay, type MemberDetail, type MemberHomework } from '../../../../lib/api';
import { errMsg, useStore, useTheme } from '../../../../state/store';

const isHanded = (h: MemberDay['homework']): h is MemberHomework => !!h && 'score' in h;

/** One learner's day-by-day progress in the owner's course, with "Remove from course". */
export default function MemberScreen() {
  const { id, userId } = useLocalSearchParams<{ id: string; userId: string }>();
  const { data, actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [m, setM] = useState<MemberDetail | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    try { setM(await api.courseMember(id, userId)); setErr(''); } catch (e) { setErr(errMsg(e)); }
  }, [id, userId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (!m) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title="Member" />
        {err ? (
          <EmptyState icon="alert" tone="red" title="Couldn’t load this member" text={err}>
            <Button title="Try again" icon="refresh" onPress={() => { setErr(''); void load(); }} />
          </EmptyState>
        ) : <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  const me = m.userId === data.userId;
  const total = m.days.length;
  const handed = m.days.map((d) => d.homework).filter(isHanded);
  const avg = handed.length ? Math.round(handed.reduce((s, h) => s + h.score, 0) / handed.length) : null;
  const learned = m.days.filter((d) => d.learnedAt).length;
  const listened = m.days.filter((d) => d.listenedAt).length;
  const missing = m.days.filter((d) => d.open && d.words > 0 && !isHanded(d.homework)).length;
  const last = Math.max(0, ...m.days.flatMap((d) => [d.learnedAt ?? 0, d.warmedUpAt ?? 0, d.listenedAt ?? 0, isHanded(d.homework) ? d.homework.submittedAt : 0]));
  const today = courseTodayKey();

  const remove = () => Alert.alert('Remove ' + m.name + '?', m.name + ' will leave the course, and their homework will be deleted. This can’t be undone.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Remove', style: 'destructive', onPress: async () => {
        setRemoving(true);
        const ok = await actions.call(api.removeCourseMember(id, m.userId).then(() => true));
        setRemoving(false);
        if (!ok) return;
        actions.showToast(m.name + ' was removed from the course.');
        // The members list reloads when it comes back into view.
        if (router.canGoBack()) router.back(); else router.replace({ pathname: '/course/[id]/members', params: { id } });
      }
    }
  ]);

  /** A step chip: green with ✓ when done, grey otherwise. */
  const chip = (label: string, done: boolean, extra = '') =>
    <Badge key={label} label={(done ? '✓ ' : '') + label + (extra ? ' ' + extra : '')} bg={done ? t.successSoft : t.surface2} fg={done ? t.success : t.faint} />;

  const dayRow = (d: MemberDay, i: number) => {
    const hw = d.homework;
    const future = !d.open;
    const date = fmtDateKey(d.date) + (d.date === today ? ' · today' : '');
    let hwText = '—';
    let hwA11y = 'homework not started';
    let late = '';
    if (isHanded(hw)) {
      hwText = String(hw.score);
      late = hw.lateDays > 0 ? hw.lateDays + (hw.lateDays === 1 ? ' day' : ' days') + ' late · kept ' + penaltyFor(hw.lateDays) + '%' : '';
      hwA11y = 'homework score ' + hw.score + ', ' + hw.correct + ' of ' + hw.total + ' correct in ' + fmtDuration(hw.durationMs) + (late ? ', ' + late : ', on time');
    } else if (hw) {
      hwA11y = 'homework opened, not handed in';
    }
    const [sBg, sFg] = isHanded(hw) ? scoreColors(hw.score, t) : [t.surface2, t.faint];
    const parts = future ? ['opens ' + date]
      : !d.words ? ['no words']
      : [
        d.warmedUpAt ? 'review done' + (d.warmup ? ' ' + d.warmup.correct + ' of ' + d.warmup.total : '') : '',
        d.learnedAt ? 'learned' : 'not learned',
        d.listenedAt ? 'listening done' + (d.listening ? ' ' + d.listening.correct + ' of ' + d.listening.total : '') : '',
        hwA11y
      ].filter(Boolean);
    return (
      <View key={d.day} accessible accessibilityLabel={'Day ' + d.day + ', ' + date + '. ' + parts.join(', ')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 10,
          borderTopWidth: i ? 1 : 0, borderTopColor: t.border, opacity: future ? 0.5 : 1 }}>
        <View style={{ flex: 1, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <T weight="extrabold" style={future ? { color: t.muted } : undefined}>Day {d.day}</T>
            <T size={12.5} tone="muted">{date}</T>
          </View>
          {future ? null : !d.words ? <T size={12.5} tone="faint">No words this day</T> : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
              {chip('Review', !!d.warmedUpAt, d.warmup ? d.warmup.correct + '/' + d.warmup.total : '')}
              {chip('Learn', !!d.learnedAt)}
              {chip('🎧', !!d.listenedAt, d.listening ? d.listening.correct + '/' + d.listening.total : '')}
              {late ? <Badge label={late} bg={t.warningSoft} fg={t.warning} /> : null}
              {hw && !isHanded(hw) ? <Badge label="opened, not handed in" bg={t.infoSoft} fg={t.info} /> : null}
            </View>
          )}
        </View>
        {future || !d.words ? null : (
          <View style={{ minWidth: 44, height: 40, paddingHorizontal: 6, borderRadius: 11, backgroundColor: sBg, alignItems: 'center', justifyContent: 'center' }}>
            <T size={15} weight="extrabold" style={{ color: sFg }}>{hwText}</T>
          </View>
        )}
      </View>
    );
  };

  const tiles: [string, string][] = [
    [m.currentDay < 1 ? '—' : m.currentDay + '/' + total, 'day'],
    [String(learned), 'learned'],
    [avg !== null ? String(avg) : '—', 'avg score'],
    [String(handed.length), 'homework']
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title="Member" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.primary} colors={[t.primary]} />}>
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <T size={22} weight="extrabold" style={{ letterSpacing: -0.4, flexShrink: 1 }}>{m.name}</T>
            {me ? <Badge label="You" bg={t.primary} fg="#fff" /> : null}
            {m.isOwner ? <Badge label="Owner" bg={t.surface2} fg={t.muted} /> : null}
          </View>
          <T size={13.5} tone="muted">
            {m.joinedAt ? 'Joined ' + fmtDateKey(courseTodayKey(m.joinedAt)) + ' · ' : ''}Day 1 on {fmtDateKey(m.startDay)}{last ? ' · active ' + fmtAgo(last) : ''}
          </T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {tiles.map(([v, l]) => (
              <View key={l} accessible accessibilityLabel={l + ': ' + v} style={{ flex: 1, backgroundColor: t.surface2, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center' }}>
                <T size={18} weight="extrabold">{v}</T>
                <T size={11.5} weight="semibold" tone="muted" center numberOfLines={1}>{l}</T>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Badge label={'🎧 ' + listened + ' listened'} bg={t.infoSoft} fg={t.info} />
            {missing >= 2 ? <Badge label={missing + ' missing'} bg={t.warningSoft} fg={t.warning} />
              : missing === 1 ? <Badge label="1 missing" bg={t.surface2} fg={t.muted} /> : null}
          </View>
        </Card>

        <SectionTitle style={{ marginTop: 4 }}>{total} days</SectionTitle>
        <Card pad={false} style={{ overflow: 'hidden' }}>{m.days.map(dayRow)}</Card>

        {!m.isOwner && !me ? (
          <Button title="Remove from course" icon="trash" variant="dangerSoft" loading={removing} onPress={remove} block style={{ marginTop: 8 }} />
        ) : null}
      </ScrollView>
    </View>
  );
}
