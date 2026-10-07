import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { openStep } from '../components/day-flow';
import { BackBar, Button, Chip, EmptyState, IconButton, IconTile, T } from '../components/ui';
import { api, type Note, type NoteLink } from '../lib/api';
import { fmtAgo } from '../lib/data';
import type { IconName } from '../lib/icons';
import { useNow } from '../hooks/use-now';
import { errMsg, useStore, useTheme } from '../state/store';

type Tone = Parameters<typeof IconTile>[0]['tone'];
/** Icon and color for each kind of notification (unknown kinds get a plain bell). */
const NOTE_ICON: Record<string, [IconName, Tone]> = {
  day_open: ['book', 'indigo'],
  homework_due: ['clock', 'amber'],
  homework_late: ['alert', 'red'],
  streak_risk: ['flame', 'orange'],
  course_start: ['cap', 'blue'],
  words_due: ['cards', 'indigo'],
  member_joined: ['users', 'green'],
  member_removed: ['logout', 'red'],
  owner_pending: ['listcheck', 'amber'],
  owner_empty_day: ['edit', 'orange'],
  library_saved: ['heart', 'green']
};
/** The link's step names → the day flow's step screens. */
const STEP = { review: 'review', learn: 'learn', listen: 'listening', homework: 'homework' } as const;

type Filter = 'all' | 'unread';

function NoteRow({ note, onOpen, onDelete }: { note: Note; onOpen: () => void; onDelete: () => void }) {
  const t = useTheme();
  const [icon, tone] = NOTE_ICON[note.type] ?? ['bell', 'blue'];
  const ago = fmtAgo(note.at);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: t.border, backgroundColor: note.read ? 'transparent' : t.primarySoft }}>
      <Pressable onPress={onOpen} accessibilityRole="button"
        accessibilityLabel={(note.read ? '' : 'Unread. ') + note.title + (note.body ? '. ' + note.body : '') + '. ' + ago}
        accessibilityHint={note.link ? 'Opens it' : note.read ? undefined : 'Marks it as read'}
        style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingLeft: 16, paddingRight: 4, paddingVertical: 14, minHeight: 64, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
        <IconTile name={icon} tone={tone} />
        <View style={{ flex: 1, gap: 2 }}>
          <T weight={note.read ? 'semibold' : 'extrabold'}>{note.title}</T>
          {note.body ? <T size={13.5} tone="muted">{note.body}</T> : null}
          <T size={12.5} tone="faint">{ago}</T>
        </View>
        {/* Unread dot (the row's label already says "Unread"). */}
        <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: note.read ? 'transparent' : t.primary }} />
      </Pressable>
      <View style={{ paddingRight: 6 }}>
        <IconButton name="trash" label={'Delete notification: ' + note.title} tone="danger" color={t.faint} onPress={onDelete} />
      </View>
    </View>
  );
}

export default function NotificationsScreen() {
  const { actions, unread } = useStore();
  const t = useTheme();
  useNow(); // re-render now and then so "5 min ago" stays current
  const [items, setItems] = useState<Note[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const { setUnread } = actions;

  /** Loads the newest page (replacing the list). */
  const load = useCallback(async () => {
    try {
      const page = await api.notifications();
      setItems(page.items); setHasMore(page.hasMore); setUnread(page.unread); setErr('');
    } catch (e) { setErr(errMsg(e)); }
  }, [setUnread]);
  useEffect(() => { void load(); }, [load]);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const loadOlder = async () => {
    const last = items?.[items.length - 1];
    if (!last || loadingMore) return;
    setLoadingMore(true);
    const page = await actions.call(api.notifications(last.at));
    setLoadingMore(false);
    if (!page) return;
    setItems((l) => {
      const seen = new Set((l ?? []).map((n) => n.id));
      return [...(l ?? []), ...page.items.filter((n) => !seen.has(n.id))];
    });
    setHasMore(page.hasMore); setUnread(page.unread);
  };

  const markAll = async () => {
    setMarkingAll(true);
    const ok = await actions.markAllNotesRead();
    setMarkingAll(false);
    if (ok) setItems((l) => l?.map((n) => ({ ...n, read: true })) ?? l);
  };

  const remove = async (n: Note) => {
    if (await actions.deleteNote(n.id, !n.read)) setItems((l) => l?.filter((x) => x.id !== n.id) ?? l);
  };

  const go = (link: NoteLink) => {
    if (link.to === 'review') {
      if (!actions.dueIds().length) { actions.showToast('No words are due right now.'); return; }
      router.push({ pathname: '/review', params: { mode: 'due' } });
    } else if (link.to === 'library') {
      router.push('/library');
    } else if (link.to === 'course' && link.courseId) {
      if (link.day && link.step && STEP[link.step]) openStep(link.courseId, link.day, STEP[link.step]);
      else router.push({ pathname: '/course/[id]', params: { id: link.courseId, ...(link.tab ? { tab: link.tab } : {}) } });
    }
  };
  const open = (n: Note) => {
    if (!n.read) {
      setItems((l) => l?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? l);
      void actions.markNotesRead([n.id]);
    }
    if (n.link) go(n.link);
  };

  const shown = items ? (filter === 'unread' ? items.filter((n) => !n.read) : items) : [];
  const anyUnread = unread > 0 || !!items?.some((n) => !n.read);

  if (!items) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title="Notifications" />
        {err ? (
          <EmptyState icon="alert" tone="red" title="Couldn’t load notifications" text={err}>
            <Button title="Try again" icon="refresh" onPress={() => { setErr(''); void load(); }} />
          </EmptyState>
        ) : <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title="Notifications" />
      <FlatList
        data={shown}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[t.primary]} tintColor={t.primary} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 12 }}>
            <Chip label="All" on={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip label={unread ? 'Unread (' + unread + ')' : 'Unread'} on={filter === 'unread'} onPress={() => setFilter('unread')} />
            <View style={{ flex: 1 }} />
            <Button title="Mark all as read" icon="check" variant="ghost" size="sm" onPress={markAll} loading={markingAll} disabled={!anyUnread}
              style={{ minHeight: 44 }} />
          </View>
        }
        renderItem={({ item }) => <NoteRow note={item} onOpen={() => open(item)} onDelete={() => void remove(item)} />}
        ListEmptyComponent={
          filter === 'unread' && items.length
            ? <EmptyState icon="checkc" tone="green" title="You’re all caught up" text="No unread notifications." />
            : <EmptyState icon="bell" title="No notifications yet" text="Course days, homework reminders and words due for review will show up here." />
        }
        ListFooterComponent={hasMore ? (
          <View style={{ padding: 16, borderTopWidth: shown.length ? 1 : 0, borderTopColor: t.border }}>
            <Button title="Load older" variant="secondary" onPress={loadOlder} loading={loadingMore} block />
          </View>
        ) : shown.length ? <View style={{ borderTopWidth: 1, borderTopColor: t.border }} /> : null}
      />
    </View>
  );
}
