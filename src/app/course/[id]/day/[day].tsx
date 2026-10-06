import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CourseWordCard, dayOpensOn, fmtDateKey, SaveCourseWord, scoreColors } from '../../../../components/course';
import { BackBar, Badge, Button, Card, EmptyState, IconTile, T } from '../../../../components/ui';
import { api, type CourseDetail } from '../../../../lib/api';
import { errMsg, useStore, useTheme } from '../../../../state/store';

export default function CourseDayScreen() {
  const { id, day: dayParam } = useLocalSearchParams<{ id: string; day: string }>();
  const day = Number(dayParam);
  const { data, actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [c, setC] = useState<CourseDetail | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  /** This day has a listening dialogue (checked once the day is open for the learner). */
  const [hasListening, setHasListening] = useState(false);

  // Reload on focus so a homework score shows up when coming back from the homework screen.
  useFocusEffect(useCallback(() => {
    let live = true;
    api.course(id).then((res) => {
      if (!live) return;
      setC(res); setErr('');
      const en = res.enrollment;
      if (en && day >= 1 && day <= en.currentDay && res.days.find((x) => x.day === day)?.words) {
        api.getListening(id, day).then((l) => { if (live) setHasListening(!!l.dialogue); }).catch(() => { if (live) setHasListening(false); });
      }
    }).catch((e) => { if (live) setErr(errMsg(e)); });
    return () => { live = false; };
  }, [id, day]));

  const d = c?.days.find((x) => x.day === day);
  if (!c || !d) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title={'Day ' + (dayParam ?? '')} />
        {err || (c && !d)
          ? <EmptyState icon="alert" tone="red" title="Couldn’t open this day" text={err || 'This day doesn’t exist.'} />
          : <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  const e = c.enrollment;
  const words = d.words ?? [];
  const mine = new Set(data.words.map((w) => w.word.toLowerCase()));
  const newCount = words.filter((w) => !mine.has(w.word.toLowerCase())).length;
  const learned = !!e?.learned.includes(day);
  const canLearn = !!e && day <= e.currentDay && words.length > 0;
  const listened = !!e?.listened?.includes(day);

  // Marks the day as learned without saving anything: words are saved one by one with their own buttons.
  const learn = async () => {
    setBusy(true);
    const res = await actions.learnCourseDay(c.id, day, []);
    setBusy(false);
    if (res) setC(res);
  };

  // Learning happens on the learn screen (meet the words, then practice); marking the day as learned straight away stays available.
  const openLearn = () => router.push({ pathname: '/course/[id]/learn/[day]', params: { id: c.id, day: String(day) } });
  let footer = null;
  if (canLearn && !learned) {
    footer = (
      <View style={{ gap: 6 }}>
        <Button title="Start learning" icon="right" size="lg" onPress={openLearn} block />
        <Button title="Mark day as learned" variant="ghost" loading={busy} onPress={learn} block />
      </View>
    );
  } else if (words.length && d.words !== null) {
    footer = <Button title="Practice these words" icon="right" variant={learned ? 'secondary' : 'primary'} size="lg" onPress={openLearn} block />;
  }

  // Homework: for learners, once the day is open and has words.
  const openHomework = () => router.push({ pathname: '/course/[id]/homework/[day]', params: { id: c.id, day: String(day) } });
  const score = d.myScore ?? null;
  const late = e ? e.currentDay - day : 0;
  let homework = null;
  if (canLearn) {
    const [sBg, sFg] = score !== null ? scoreColors(score, t) : [t.primarySoft, t.primaryInk];
    homework = (
      <Card style={{ gap: 12, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {score !== null ? (
            <View accessible accessibilityLabel={'Homework score ' + score} style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: sBg, alignItems: 'center', justifyContent: 'center' }}>
              <T size={20} weight="extrabold" style={{ color: sFg }}>{score}</T>
            </View>
          ) : <IconTile name="listcheck" tone="indigo" size={52} />}
          <View style={{ flex: 1 }}>
            <T size={16.5} weight="extrabold">Homework</T>
            <T size={13} tone="muted">
              {score !== null ? 'Handed in · score ' + score + ' / 100'
                : late > 0 ? late + (late === 1 ? ' day' : ' days') + ' late · score will be reduced'
                : 'Test yourself on these words. Hand in today for full marks.'}
            </T>
          </View>
        </View>
        {score !== null
          ? <Button title="See answers" icon="right" variant="secondary" onPress={openHomework} block />
          : <Button title="Start homework" icon="right" onPress={openHomework} block />}
      </Card>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title={c.title} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <T size={26} weight="extrabold" style={{ letterSpacing: -0.5, flex: 1 }}>Day {day}</T>
          {learned ? <Badge label="Learned" bg={t.successSoft} fg={t.success} /> : e && day === e.currentDay ? <Badge label="Today" bg={t.primarySoft} fg={t.primaryInk} /> : null}
        </View>
        <T tone="muted">
          {d.words === null ? (e ? 'This day opens on ' + fmtDateKey(dayOpensOn(e.startDay, day), true) + '. Come back then.' : 'This day opens later. Come back on day ' + day + '.')
            : !words.length ? 'No words yet — coming soon.'
            : words.length + (words.length === 1 ? ' word' : ' words') + (newCount < words.length ? ' · ' + (words.length - newCount) + ' in My Vocabulary' : '') + '. Tap the speaker to hear each one' + (canLearn ? ', and save the ones you want to keep.' : '.')}
        </T>
        {!e && words.length ? <T size={13.5} tone="muted">Preview — join the course to save these words.</T> : null}
        {canLearn && day >= 2 ? (
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconTile name="zap" tone="amber" size={52} />
              <View style={{ flex: 1 }}>
                <T size={16.5} weight="extrabold">Review old lessons</T>
                <T size={13} tone="muted">A short recap of earlier days and a few practice questions. Not graded.</T>
              </View>
            </View>
            <Button title="Start review" icon="right" variant="secondary" block
              onPress={() => router.push({ pathname: '/course/[id]/warmup/[day]', params: { id: c.id, day: String(day) } })} />
          </Card>
        ) : null}
        {words.map((w) => (
          <CourseWordCard key={w.word} w={w}>
            <SaveCourseWord courseId={c.id} day={day} word={w.word} canSave={canLearn} style={{ marginTop: 4 }} />
          </CourseWordCard>
        ))}
        {canLearn && hasListening ? (
          <Card style={{ gap: 12 }}>
            <View accessible accessibilityLabel={'Listening' + (listened ? ', done' : '') + '. A short dialogue with gaps to fill and a few questions. Not graded.'}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconTile name="volume" tone="blue" size={52} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <T size={16.5} weight="extrabold">🎧 Listening</T>
                  {listened ? <Badge label="Done" bg={t.successSoft} fg={t.success} /> : null}
                </View>
                <T size={13} tone="muted">A short dialogue: fill the gaps, then answer a few questions. Not graded.</T>
              </View>
            </View>
            <Button title={listened ? 'Listen again' : 'Start listening'} icon="right" variant="secondary" block
              onPress={() => router.push({ pathname: '/course/[id]/listening/[day]', params: { id: c.id, day: String(day) } })} />
          </Card>
        ) : null}
        {homework}
      </ScrollView>
      {footer ? (
        <View style={{ padding: 12, paddingBottom: insets.bottom + 12, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }}>{footer}</View>
      ) : null}
    </View>
  );
}
