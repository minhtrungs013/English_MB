import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CourseWordCard } from '../../../../components/course';
import { BackBar, Badge, Button, EmptyState, T } from '../../../../components/ui';
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

  useEffect(() => {
    api.course(id).then(setC).catch((e) => setErr(errMsg(e)));
  }, [id]);

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

  const learn = async () => {
    setBusy(true);
    const res = await actions.learnCourseDay(c.id, day);
    setBusy(false);
    if (res) setC(res);
  };

  let footer = null;
  if (canLearn) {
    footer = newCount > 0
      ? <Button title={'Save ' + newCount + (newCount === 1 ? ' word' : ' words') + ' to My Vocabulary'} icon="plus" size="lg" loading={busy} onPress={learn} block />
      : learned
        ? <Button title="All saved · Back to course" icon="check" variant="secondary" size="lg" onPress={() => router.back()} block />
        : <Button title="Mark day as learned" icon="check" size="lg" loading={busy} onPress={learn} block />;
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
          {d.words === null ? 'This day opens later. Come back on day ' + day + '.'
            : !words.length ? 'No words yet — coming soon.'
            : words.length + (words.length === 1 ? ' word' : ' words') + (newCount < words.length ? ' · ' + (words.length - newCount) + ' already in your words' : '') + '. Tap the speaker to hear each one.'}
        </T>
        {!e && words.length ? <T size={13.5} tone="muted">Preview — join the course to save these words.</T> : null}
        {words.map((w) => (
          <CourseWordCard key={w.word} w={w}>
            {mine.has(w.word.toLowerCase()) ? <View style={{ flexDirection: 'row', marginTop: 4 }}><Badge label="✓ In my words" bg={t.successSoft} fg={t.success} /></View> : null}
          </CourseWordCard>
        ))}
      </ScrollView>
      {footer ? (
        <View style={{ padding: 12, paddingBottom: insets.bottom + 12, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }}>{footer}</View>
      ) : null}
    </View>
  );
}
