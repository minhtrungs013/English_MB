import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { HomeSearch } from '../../components/home-search';
import { Sheet, SheetItem } from '../../components/sheet';
import { Button, Card, EmptyState, Icon, IconTile, LevelBadge, Screen, T } from '../../components/ui';
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

export default function Home() {
  const { data, actions } = useStore();
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
  const goTo = (path: '/categories' | '/tags' | '/settings') => { setMenu(false); router.push(path); };

  const startReview = () => {
    if (!actions.dueIds().length) { actions.showToast('No words are due right now.'); return; }
    router.push({ pathname: '/review', params: { mode: 'due' } });
  };

  return (
    <Screen
      title={greeting} sub="Keep learning a few words today."
      right={
        <Pressable onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel="Account menu"
          style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#FBD9BC', alignItems: 'center', justifyContent: 'center' }}>
          <T size={16} weight="extrabold" style={{ color: '#7A3A0C' }}>{initial}</T>
        </Pressable>
      }>
      <View style={{ gap: 12 }}>
        <HomeSearch />
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
