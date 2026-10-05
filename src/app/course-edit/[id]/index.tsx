import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { CourseWordCard, WORDS_PER_DAY } from '../../../components/course';
import { Sheet } from '../../../components/sheet';
import { StartDateField, startDateError } from '../../../components/start-date';
import { BackBar, Badge, Button, Card, Chip, ChipRow, EmptyState, Field, Icon, IconButton, IconTile, Input, LevelBadge, SectionTitle, T, TOPIC_LABEL } from '../../../components/ui';
import { api, ApiError, type AiWordResult, type CourseDetail, type CourseVisibility, type CourseWord, type LibraryWord, type Quota, type Topic } from '../../../lib/api';
import { errMsg, useStore, useTheme } from '../../../state/store';

const TOPICS: Topic[] = ['it', 'interview', 'customer', 'leader', 'toeic', 'other'];

const fromLibrary = (w: LibraryWord): CourseWord => ({
  word: w.word, ipa: w.ipa, pos: w.pos, meaning: w.meaning, vi: w.vi, ex: w.ex, syn: w.syn, ant: w.ant, level: w.level, libraryId: w.id, source: 'library'
});

/** Library words matching what the owner types (debounced). */
function useLibrarySearch(q: string): { term: string; items: LibraryWord[] } | null {
  const [res, setRes] = useState<{ term: string; items: LibraryWord[] } | null>(null);
  const term = q.trim().toLowerCase();
  useEffect(() => {
    if (!term) return;
    let alive = true;
    const id = setTimeout(() => {
      api.library({ q: term, limit: 6 })
        .then((r) => { if (alive) setRes({ term, items: r.items }); })
        .catch(() => { if (alive) setRes({ term, items: [] }); });
    }, 300);
    return () => { alive = false; clearTimeout(id); };
  }, [term]);
  return term && res?.term === term ? res : null;
}

/** Title, description, words per day, visibility and start date (saved with PATCH). */
function SettingsCard({ c, onSaved }: { c: CourseDetail; onSaved: (c: CourseDetail) => void }) {
  const { actions } = useStore();
  const [title, setTitle] = useState(c.title);
  const [description, setDescription] = useState(c.description);
  const [wordsPerDay, setWordsPerDay] = useState(c.wordsPerDay);
  const [visibility, setVisibility] = useState<CourseVisibility>(c.visibility);
  const [startDate, setStartDate] = useState(c.startDate ?? '');
  const [err, setErr] = useState('');
  const [startErr, setStartErr] = useState('');
  const [busy, setBusy] = useState(false);
  const startChanged = startDate !== (c.startDate ?? '');
  const dirty = title.trim() !== c.title || description.trim() !== c.description || wordsPerDay !== c.wordsPerDay || visibility !== c.visibility || startChanged;
  const most = Math.max(0, ...c.days.map((d) => d.count));
  const save = async () => {
    if (!title.trim()) { setErr('Please enter a course title.'); return; }
    const se = startDateError(startDate);
    if (se) { setStartErr(se); return; }
    setBusy(true);
    try {
      // Only send the start date when it changed: changing it moves every learner's days.
      const res = await api.updateCourse(c.id, { title: title.trim(), description: description.trim(), wordsPerDay, visibility, ...(startChanged ? { startDate } : {}) });
      onSaved(res);
      setStartDate(res.startDate ?? '');
      actions.showToast('Course details saved.');
    } catch (e) {
      const m = errMsg(e);
      if (/start date/i.test(m)) setStartErr(m);
      actions.showToast(m, 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 14 }}>
      <Field label="Title" error={err}>
        <Input value={title} onChangeText={(v) => { setTitle(v); setErr(''); }} placeholder="30 days of IT English" invalid={!!err} maxLength={80} />
      </Field>
      <Field label="Description">
        <Input value={description} onChangeText={setDescription} placeholder="What will learners get from this course?" multiline maxLength={500} />
      </Field>
      <Field label="Words per day" hint={most > 3 ? 'Some days already have ' + most + ' words, so you can’t choose fewer.' : undefined}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {WORDS_PER_DAY.map((n) => <Chip key={n} label={String(n)} on={wordsPerDay === n} onPress={() => { if (n >= most) setWordsPerDay(n); else actions.showToast('Some days already have ' + most + ' words. Remove words first.', 'bad'); }} />)}
        </View>
      </Field>
      <Field label="Who can join" hint={visibility === 'private' ? 'Only people with the join code.' : 'Anyone can find it in Explore.'}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Chip soft label="Private" on={visibility === 'private'} onPress={() => setVisibility('private')} />
          <Chip soft label="Public" on={visibility === 'public'} onPress={() => setVisibility('public')} />
        </View>
      </Field>
      <StartDateField value={startDate} onChange={(v) => { setStartDate(v); setStartErr(''); }} totalDays={c.totalDays} error={startErr}
        note={startChanged && c.members > 0 ? 'This changes the days of all ' + c.members + (c.members === 1 ? ' learner' : ' learners') + ' when you save.' : undefined} />
      <Button title={dirty ? 'Save details' : 'Saved'} icon="check" loading={busy} disabled={!dirty} onPress={save} />
    </Card>
  );
}

export default function CourseEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { actions } = useStore();
  const t = useTheme();
  const [c, setC] = useState<CourseDetail | null>(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState(1);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [ai, setAi] = useState<AiWordResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [sharing, setSharing] = useState<number | null>(null);
  const [topic, setTopic] = useState<Topic>('other');
  const [sharingBusy, setSharingBusy] = useState(false);
  const lib = useLibrarySearch(q);

  const first = useRef(true);
  // Reload on focus so the question counts update when coming back from a day's questions.
  useFocusEffect(useCallback(() => {
    let live = true;
    api.course(id).then((res) => {
      if (!live) return;
      setC(res);
      if (!first.current) return;
      first.current = false;
      // Start on the first day that still has room.
      const open = res.days.find((d) => d.count < res.wordsPerDay);
      if (open) setSel(open.day);
    }).catch((e) => { if (live) setErr(errMsg(e)); });
    return () => { live = false; };
  }, [id]));

  if (!c) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title="Edit course" />
        {err ? <EmptyState icon="alert" tone="red" title="Couldn’t open this course" text={err} /> : <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />}
      </View>
    );
  }
  if (!c.isOwner) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title="Edit course" />
        <EmptyState icon="lock" tone="red" title="Only the owner can edit" text="This course belongs to someone else." />
      </View>
    );
  }

  const day = c.days.find((d) => d.day === sel) ?? c.days[0];
  const words = day.words ?? [];
  const full = words.length >= c.wordsPerDay;
  const inDay = new Set(words.map((w) => w.word.toLowerCase()));
  const term = q.trim().toLowerCase();
  const matches = (lib?.items ?? []).filter((w) => !inDay.has(w.word.toLowerCase()));
  const exact = (lib?.items ?? []).some((w) => w.word.toLowerCase() === term);
  const bank = day.bank ?? { pending: 0, approved: 0 };
  const openQuestions = () => router.push({ pathname: '/course-edit/[id]/questions/[day]', params: { id: c.id, day: String(day.day) } });
  const aiLeft = quota ? Math.max(0, quota.limit - quota.used) : null;

  /** Saves the selected day's words; returns true when the server accepted them. */
  const saveDay = async (next: CourseWord[], msg: string): Promise<boolean> => {
    setSaving(true);
    const res = await actions.call(api.setCourseDay(c.id, day.day, next));
    setSaving(false);
    if (!res) return false;
    setC(res);
    actions.showToast(msg);
    return true;
  };
  const add = async (w: CourseWord) => {
    if (full) { actions.showToast('Day ' + day.day + ' already has ' + c.wordsPerDay + ' words.', 'bad'); return; }
    if (inDay.has(w.word.toLowerCase())) { actions.showToast('“' + w.word + '” is already in day ' + day.day + '.', 'bad'); return; }
    if (await saveDay([...words, w], 'Added “' + w.word + '” to day ' + day.day + ' · saved.')) { setQ(''); setAi(null); }
  };
  const remove = (i: number) => {
    const w = words[i];
    void saveDay(words.filter((_, k) => k !== i), 'Removed “' + w.word + '” from day ' + day.day + ' · saved.');
  };
  const generate = async () => {
    const w = q.trim();
    if (!w) return;
    setGenerating(true);
    setAi(null);
    try {
      const res = await api.courseAiWord(w);
      setQuota(res.quota);
      setAi(res);
    } catch (e) {
      const qb = e instanceof ApiError ? (e.body?.quota as Quota | undefined) : undefined;
      if (qb) setQuota(qb);
      if (e instanceof ApiError && e.status === 429 && quota) setQuota({ ...quota, used: quota.limit });
      actions.showToast(errMsg(e), 'bad');
    } finally {
      setGenerating(false);
    }
  };
  const share = async () => {
    if (sharing === null) return;
    setSharingBusy(true);
    const res = await actions.call(api.shareCourseWord(c.id, day.day, sharing, topic));
    setSharingBusy(false);
    if (res) {
      const w = words[sharing];
      setC(res);
      setSharing(null);
      actions.showToast('Added “' + (w?.word ?? '') + '” to the library.');
    }
  };
  const removeCourse = () => Alert.alert('Delete “' + c.title + '”?', 'The course and everyone’s progress in it will be deleted. Words learners already saved stay in their vocabulary.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete', style: 'destructive', onPress: async () => {
        const ok = await actions.call(api.deleteCourse(c.id).then(() => true));
        if (!ok) return;
        actions.showToast('Course deleted.');
        router.dismissTo('/courses');
      }
    }
  ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackBar title="Edit course" right={saving ? <ActivityIndicator color={t.primary} style={{ marginRight: 12 }} accessibilityLabel="Saving" /> : undefined} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <SettingsCard key={c.id} c={c} onSaved={setC} />

        {c.joinCode ? (
          <Card style={{ gap: 6 }}>
            <SectionTitle>Join code</SectionTitle>
            <View accessible accessibilityLabel={'Join code ' + c.joinCode.split('').join(' ')}><T size={28} weight="extrabold" style={{ letterSpacing: 4 }}>{c.joinCode}</T></View>
            <T size={13} tone="muted">Share it so others can join. {c.readyDays} of {c.totalDays} days have words.</T>
          </Card>
        ) : null}

        <SectionTitle style={{ marginTop: 4 }}>Days</SectionTitle>
        <ChipRow>
          {c.days.map((d) => (
            <Chip key={d.day} label={d.day + ' · ' + d.count + '/' + c.wordsPerDay + (d.bank?.pending ? ' · ' + d.bank.pending + ' to review' : '')} on={d.day === sel} soft={d.count >= c.wordsPerDay}
              onPress={() => { setSel(d.day); setAi(null); }} />
          ))}
        </ChipRow>

        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <T size={18} weight="extrabold" style={{ flex: 1 }}>Day {day.day}</T>
            <T size={13.5} weight="bold" tone={full ? 'success' : 'muted'}>{words.length}/{c.wordsPerDay} words</T>
          </View>
          {words.length === 0 ? <T tone="muted">No words yet. Add some below.</T> : null}
          <Pressable onPress={openQuestions} accessibilityRole="button"
            accessibilityLabel={'Tense questions and recap for day ' + day.day + ', ' + bank.approved + ' approved, ' + bank.pending + ' waiting for review'}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: pressed ? t.surface2 : t.surface })}>
            <IconTile name="listcheck" tone="indigo" />
            <View style={{ flex: 1, gap: 2 }}>
              <T weight="extrabold">Tense questions & recap</T>
              <T size={13} tone="muted">{bank.approved} approved{bank.pending ? ' · ' + bank.pending + ' to review' : ''}</T>
            </View>
            {bank.pending ? <Badge label={String(bank.pending)} bg={t.warningSoft} fg={t.warning} /> : null}
            <Icon name="right" size={16} color={t.faint} />
          </Pressable>
        </Card>

        {words.map((w, i) => (
          <CourseWordCard key={w.word} w={w} right={<IconButton name="trash" label={'Remove ' + w.word} tone="danger" onPress={() => remove(i)} />}>
            {w.libraryId ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Icon name="globe" size={14} color={t.success} />
                <T size={12.5} weight="semibold" tone="success">In the library</T>
              </View>
            ) : (
              <Button title="Add to library" icon="globe" variant="secondary" size="sm" style={{ alignSelf: 'flex-start', marginTop: 4, minHeight: 44 }}
                accessibilityLabel={'Add ' + w.word + ' to the shared library'} onPress={() => { setTopic('other'); setSharing(i); }} />
            )}
          </CourseWordCard>
        ))}

        <Card style={{ gap: 10 }}>
          <T weight="extrabold">Add word</T>
          {full ? <T tone="muted">Day {day.day} is full ({c.wordsPerDay} words). Remove a word, or pick another day.</T> : (
            <>
              <Input value={q} onChangeText={(v) => { setQ(v); setAi(null); }} placeholder="Type a word, e.g. deploy" leftIcon="search" autoCapitalize="none" autoCorrect={false}
                accessibilityLabel="Add word" returnKeyType="search" onSubmitEditing={() => { if (term && !exact && lib) void generate(); }} />
              {term ? (
                <View style={{ gap: 2 }}>
                  {!lib ? <ActivityIndicator color={t.primary} style={{ marginVertical: 8 }} /> : null}
                  {lib && matches.length ? <SectionTitle style={{ marginTop: 4 }}>From the library</SectionTitle> : null}
                  {matches.map((w) => (
                    <Pressable key={w.id} onPress={() => add(fromLibrary(w))} disabled={saving} accessibilityRole="button" accessibilityLabel={'Add ' + w.word + ', ' + w.vi + ', to day ' + day.day}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 10, borderRadius: 10, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
                      <View style={{ flex: 1 }}>
                        <T weight="extrabold">{w.word}</T>
                        <T size={13} tone="muted" numberOfLines={1}>{w.vi || w.meaning}</T>
                      </View>
                      <LevelBadge level={w.level} />
                      <Icon name="plus" size={18} color={t.primaryInk} />
                    </Pressable>
                  ))}
                  {lib && !matches.length && (lib.items.length > 0) ? <T size={13.5} tone="muted">Those library matches are already in this day.</T> : null}
                  {lib && !exact ? (
                    <View style={{ gap: 8, marginTop: 6 }}>
                      <T size={13.5} tone="muted">“{q.trim()}” isn’t in the library yet.</T>
                      <Button title={generating ? 'Generating…' : 'Generate with AI'} icon="sparkle" loading={generating} disabled={aiLeft === 0} onPress={generate} />
                    </View>
                  ) : null}
                </View>
              ) : null}
              {aiLeft !== null ? (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Icon name="sparkle" size={14} color={t.primary} />
                  <T size={12.5} tone="muted" style={{ flex: 1 }}>{aiLeft > 0 ? aiLeft + ' AI ' + (aiLeft === 1 ? 'word' : 'words') + ' left today.' : 'No AI words left today — try again tomorrow.'}</T>
                </View>
              ) : null}
            </>
          )}
        </Card>

        {ai && !full ? (
          <View style={{ gap: 10 }} accessibilityLiveRegion="polite">
            <SectionTitle>{ai.source === 'library' ? 'Found in the library' : 'Review before adding'}</SectionTitle>
            <CourseWordCard w={ai.word} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Discard" variant="secondary" onPress={() => setAi(null)} style={{ flex: 1 }} />
              <Button title={'Add to day ' + day.day} icon="plus" loading={saving} onPress={() => add(ai.word)} style={{ flex: 2 }} />
            </View>
          </View>
        ) : null}

        <Button title="Delete course" icon="trash" variant="dangerSoft" onPress={removeCourse} style={{ marginTop: 12 }} />
      </ScrollView>

      <Sheet visible={sharing !== null} onClose={() => setSharing(null)} title="Add to library">
        <T tone="muted">Share “{sharing !== null ? words[sharing]?.word : ''}” so everyone can find it in the library. Pick a topic (optional).</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {TOPICS.map((x) => <Chip key={x} soft label={TOPIC_LABEL[x]} on={topic === x} onPress={() => setTopic(x)} />)}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Cancel" variant="secondary" onPress={() => setSharing(null)} style={{ flex: 1 }} />
          <Button title="Add to library" loading={sharingBusy} onPress={share} style={{ flex: 1 }} />
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}
