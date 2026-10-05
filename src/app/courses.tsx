import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { CourseCard, joinedMessage, WORDS_PER_DAY } from '../components/course';
import { Sheet } from '../components/sheet';
import { StartDateField, startDateError } from '../components/start-date';
import { BackBar, Button, Card, Chip, EmptyState, Field, IconButton, Input, SectionTitle, T } from '../components/ui';
import { api, type CourseSummary, type CourseVisibility } from '../lib/api';
import { errMsg, useStore, useTheme } from '../state/store';

interface Lists { joined: CourseSummary[]; mine: CourseSummary[]; pub: CourseSummary[] }

/** Create-course form in a bottom sheet; opens the editor after creating. */
function CreateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { actions } = useStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [wordsPerDay, setWordsPerDay] = useState(5);
  const [visibility, setVisibility] = useState<CourseVisibility>('private');
  const [startDate, setStartDate] = useState('');
  const [err, setErr] = useState('');
  const [startErr, setStartErr] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!title.trim()) { setErr('Please enter a course title.'); return; }
    const se = startDateError(startDate);
    if (se) { setStartErr(se); return; }
    setBusy(true);
    try {
      const c = await api.createCourse({ title: title.trim(), description: description.trim(), wordsPerDay, visibility, startDate });
      actions.showToast('Course “' + c.title + '” created. Add words to its days.');
      setTitle(''); setDescription(''); setWordsPerDay(5); setVisibility('private'); setStartDate('');
      onClose();
      router.push({ pathname: '/course-edit/[id]', params: { id: c.id } });
    } catch (e) {
      // Date problems (400 "Start date …") belong under the Start setting; the rest under the title.
      const m = errMsg(e);
      if (/start date/i.test(m)) setStartErr(m); else setErr(m);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Create Course" scroll>
      <Field label="Title" error={err}>
        <Input value={title} onChangeText={(v) => { setTitle(v); setErr(''); }} placeholder="30 days of IT English" autoFocus invalid={!!err} maxLength={80} />
      </Field>
      <Field label="Description">
        <Input value={description} onChangeText={setDescription} placeholder="What will learners get from this course?" multiline maxLength={500} />
      </Field>
      <Field label="Words per day">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {WORDS_PER_DAY.map((n) => <Chip key={n} label={String(n)} on={wordsPerDay === n} onPress={() => setWordsPerDay(n)} />)}
        </View>
      </Field>
      <Field label="Who can join" hint={visibility === 'private' ? 'Only people with the join code.' : 'Anyone can find it in Explore.'}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Chip soft label="Private" on={visibility === 'private'} onPress={() => setVisibility('private')} />
          <Chip soft label="Public" on={visibility === 'public'} onPress={() => setVisibility('public')} />
        </View>
      </Field>
      <StartDateField value={startDate} onChange={(v) => { setStartDate(v); setStartErr(''); }} error={startErr} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Create" loading={busy} onPress={create} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

export default function Courses() {
  const { actions } = useStore();
  const t = useTheme();
  const [lists, setLists] = useState<Lists | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    try {
      const [joined, mine, pub] = await Promise.all([api.courses('joined'), api.courses('mine'), api.courses('public')]);
      setLists({ joined, mine, pub });
      setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const cleanCode = code.trim().toUpperCase();
  const join = async () => {
    if (!/^[A-Z0-9]{6}$/.test(cleanCode)) { actions.showToast('Join codes are 6 letters and numbers.', 'bad'); return; }
    setJoining(true);
    const c = await actions.call(api.joinCourseByCode(cleanCode));
    setJoining(false);
    if (c) {
      setCode('');
      actions.showToast('Joined “' + c.title + '”. ' + joinedMessage(c));
      router.push({ pathname: '/course/[id]', params: { id: c.id } });
    }
  };

  const taken = new Set([...(lists?.joined ?? []), ...(lists?.mine ?? [])].map((c) => c.id));
  const explore = (lists?.pub ?? []).filter((c) => !taken.has(c.id));
  // Courses I own and also take show under "Learning" only.
  const joinedIds = new Set((lists?.joined ?? []).map((c) => c.id));
  const mine = (lists?.mine ?? []).filter((c) => !joinedIds.has(c.id));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title="Courses" right={<IconButton name="plus" label="Create course" color={t.primaryInk} onPress={() => setCreating(true)} />} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.primary} colors={[t.primary]} />}>
        <T tone="muted">Learn a few new words every day for 30 days.</T>

        <Card style={{ gap: 10 }}>
          <T weight="extrabold">Join with code</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input value={code} onChangeText={(v) => setCode(v.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6))} placeholder="ABC123" autoCapitalize="characters" autoCorrect={false}
                accessibilityLabel="Join code" returnKeyType="go" onSubmitEditing={join} />
            </View>
            <Button title="Join" loading={joining} disabled={cleanCode.length !== 6} onPress={join} />
          </View>
        </Card>

        {!lists ? (
          err ? (
            <EmptyState icon="alert" tone="red" title="Can’t load courses" text={err}>
              <Button title="Try again" icon="refresh" onPress={() => { setErr(''); void load(); }} />
            </EmptyState>
          ) : <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <SectionTitle style={{ marginTop: 8 }}>Learning</SectionTitle>
            {lists.joined.length ? lists.joined.map((c) => <CourseCard key={c.id} c={c} />) : (
              <Card><T tone="muted">You haven’t joined a course yet. Pick one from Explore, or ask a friend for their join code.</T></Card>
            )}

            <SectionTitle style={{ marginTop: 8 }}>My courses</SectionTitle>
            {mine.length ? mine.map((c) => <CourseCard key={c.id} c={c} />) : lists.mine.length ? (
              <Card><T tone="muted">Your courses are listed under Learning.</T></Card>
            ) : (
              <EmptyState icon="cap" title="Make your own course" text="Pick a few words for each of 30 days, then share the join code with friends or your team.">
                <Button title="Create Course" icon="plus" onPress={() => setCreating(true)} />
              </EmptyState>
            )}

            <SectionTitle style={{ marginTop: 8 }}>Explore</SectionTitle>
            {explore.length ? explore.map((c) => <CourseCard key={c.id} c={c} />) : (
              <Card><T tone="muted">No other public courses right now. Check back later.</T></Card>
            )}
          </>
        )}
      </ScrollView>
      <CreateSheet visible={creating} onClose={() => setCreating(false)} />
    </View>
  );
}
