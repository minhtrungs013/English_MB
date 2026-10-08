import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GrammarTableView, MasteryBadge } from '../../components/grammar';
import { BackBar, Badge, Button, Card, EmptyState, Icon, IconButton, SectionTitle, T } from '../../components/ui';
import { api, LESSON_IDS, LESSON_LABEL, TENSE_LABEL, type GrammarForm, type GrammarLesson, type GrammarTable } from '../../lib/api';
import { speak } from '../../lib/speech';
import { errMsg, useTheme } from '../../state/store';

const FORMS: [GrammarForm, string][] = [['affirmative', 'Affirmative (+)'], ['negative', 'Negative (−)'], ['question', 'Question (?)']];
/** What a tense's helping-verb hint asks about, by Foundations lesson. */
const FOUNDATION_HINT: Record<'be' | 'do' | 'have', string> = { be: 'am / is / are', do: 'do / does / did', have: 'have / has' };

/** An English example with a play button and its Vietnamese translation. */
function Example({ en, vi, tag }: { en: string; vi?: string; tag?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, padding: 10, paddingRight: 2, borderRadius: 12, backgroundColor: t.surface2 }}>
      <View style={{ flex: 1, gap: 2 }}>
        {tag}
        <T weight="semibold">{en}</T>
        {vi ? <T size={13.5} tone="muted">{vi}</T> : null}
      </View>
      <IconButton name="volume" label={'Play: ' + en} color={t.primaryInk} onPress={() => speak(en)} />
    </View>
  );
}

/** "Not sure about am / is / are? → Be": opens the Foundations lesson about a tense's helping verb. */
function FoundationHint({ to }: { to: 'be' | 'do' | 'have' }) {
  const t = useTheme();
  const q = 'Not sure about ' + FOUNDATION_HINT[to] + '?';
  return (
    <Pressable onPress={() => router.push({ pathname: '/grammar/[tense]', params: { tense: to } })} accessibilityRole="link"
      accessibilityLabel={q + ' Open the lesson ' + LESSON_LABEL[to]}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: pressed ? t.surface3 : t.infoSoft })}>
      <Icon name="book" size={18} color={t.info} />
      <T size={14} weight="semibold" style={{ flex: 1 }}>{q} <T size={14} weight="extrabold" tone="info">→ {LESSON_LABEL[to]}</T></T>
      <Icon name="right" size={16} color={t.info} />
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <SectionTitle style={{ marginTop: 6 }}>{title}</SectionTitle>
      {children}
    </View>
  );
}

export default function GrammarLessonScreen() {
  const { tense } = useLocalSearchParams<{ tense: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [l, setL] = useState<GrammarLesson | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api.grammarLesson(tense);
      setL(res); setErr('');
    } catch (e) {
      setErr(errMsg(e));
    }
  }, [tense]);
  // Reload on focus: mastery changes after practising.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Previous / next in teaching order: Foundations, then the tenses.
  const at = LESSON_IDS.findIndex((x) => x === tense);
  const prev = at > 0 ? LESSON_IDS[at - 1] : null;
  const next = at >= 0 && at < LESSON_IDS.length - 1 ? LESSON_IDS[at + 1] : null;
  const go = (to: string) => router.replace({ pathname: '/grammar/[tense]', params: { tense: to } });
  const lesson = l && l.id === tense ? l : null;
  const formula = lesson?.formula;
  const persons: GrammarTable | null = formula?.persons?.length ? {
    title: 'By subject', columns: ['Subject', ...FORMS.map(([, label]) => label)],
    rows: formula.persons.map((x) => ({ label: x.subject, cells: [x.subject, x.affirmative, x.negative, x.question] }))
  } : null;
  const foundation = formula?.foundation && formula.foundation in FOUNDATION_HINT ? formula.foundation : null;
  const practisable = !!lesson?.drillCount;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title={lesson?.name ?? 'Grammar'} />
      {!lesson && !err ? <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />
        : !lesson ? (
          <EmptyState icon="alert" tone="red" title="Couldn’t open this lesson" text={err}>
            <View style={{ gap: 10, alignSelf: 'stretch' }}>
              <Button title="Try again" icon="refresh" onPress={() => void load()} block />
              <Button title="All lessons" variant="ghost" onPress={() => router.replace('/grammar')} block />
            </View>
          </EmptyState>
        ) : (
          <>
            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: practisable ? 24 : insets.bottom + 24 }}>
              <View style={{ gap: 4 }}>
                <T size={26} weight="extrabold" style={{ letterSpacing: -0.5 }}>{lesson.name}</T>
                <T weight="semibold" tone="muted">{lesson.vi}</T>
              </View>
              <Card style={{ gap: 6 }}><T>{lesson.summary}</T></Card>

              {lesson.tables?.map((tb, i) => (
                <Section key={'t' + i} title={tb.title}>
                  <GrammarTableView table={tb} />
                </Section>
              ))}

              {formula ? (
                <Section title="Formula">
                  <Card pad={false}>
                    {FORMS.map(([k, label], i) => {
                      const f = formula[k];
                      if (!f) return null;
                      return (
                        <View key={k} style={{ padding: 14, gap: 8, borderTopWidth: i ? 1 : 0, borderTopColor: t.border }}>
                          <T size={12.5} weight="extrabold" tone="muted">{label}</T>
                          <T weight="extrabold" tone="primaryInk">{f.pattern}</T>
                          <Example en={f.example} vi={f.vi} />
                        </View>
                      );
                    })}
                  </Card>
                </Section>
              ) : null}

              {persons ? (
                <Section title={persons.title}>
                  <GrammarTableView table={persons} />
                  {foundation ? <FoundationHint to={foundation} /> : null}
                </Section>
              ) : foundation ? <FoundationHint to={foundation} /> : null}

              {lesson.uses?.length ? (
                <Section title="How to use">
                  {lesson.uses.map((u, i) => (
                    <Card key={i} style={{ gap: 8, padding: 14 }}>
                      <T weight="extrabold">{i + 1}. {u.title}</T>
                      <T size={14}>{u.explain}</T>
                      {u.examples.slice(0, 2).map((e, k) => <Example key={k} en={e.en} vi={e.vi} />)}
                    </Card>
                  ))}
                </Section>
              ) : null}

              {lesson.signals?.length ? (
                <Section title="Signal words">
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {lesson.signals.map((s) => (
                      <View key={s} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, backgroundColor: t.primarySoft }}>
                        <T size={13.5} weight="bold" tone="primaryInk">{s}</T>
                      </View>
                    ))}
                  </View>
                </Section>
              ) : null}

              {lesson.mistakes?.length ? (
                <Section title="Common mistakes">
                  {lesson.mistakes.map((m, i) => (
                    <Card key={i} style={{ gap: 6, padding: 14 }}>
                      <View accessible accessibilityLabel={'Wrong: ' + m.wrong + '. Right: ' + m.right} style={{ gap: 4 }}>
                        <T weight="semibold" style={{ color: t.danger, textDecorationLine: 'line-through' }}>✗ {m.wrong}</T>
                        <T weight="semibold" style={{ color: t.success }}>✓ {m.right}</T>
                      </View>
                      <T size={13.5} tone="muted">{m.explain}</T>
                    </Card>
                  ))}
                </Section>
              ) : null}

              {lesson.compare?.explain ? (
                <Section title={'vs ' + (lesson.compareName || TENSE_LABEL[lesson.compare.with] || 'a similar tense')}>
                  <Card style={{ gap: 8, padding: 14 }}>
                    <T size={14}>{lesson.compare.explain}</T>
                    {lesson.compare.examples.map((e, k) => (
                      <Example key={k} en={e.en} vi={e.vi}
                        tag={<View style={{ alignSelf: 'flex-start', marginBottom: 2 }}>
                          <Badge label={TENSE_LABEL[e.tense] ?? e.tense} bg={e.tense === lesson.id ? t.primarySoft : t.surface3} fg={e.tense === lesson.id ? t.primaryInk : t.muted} />
                        </View>} />
                    ))}
                  </Card>
                </Section>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                {prev ? <Button title="Previous" icon="left" variant="secondary" onPress={() => go(prev)} accessibilityLabel={'Previous lesson: ' + LESSON_LABEL[prev]} style={{ flex: 1 }} /> : <View style={{ flex: 1 }} />}
                {next ? <Button title="Next lesson" icon="right" variant="secondary" onPress={() => go(next)} accessibilityLabel={'Next lesson: ' + LESSON_LABEL[next]} style={{ flex: 1 }} /> : <View style={{ flex: 1 }} />}
              </View>
            </ScrollView>
            {practisable ? (
              <View style={{ gap: 8, padding: 12, paddingBottom: insets.bottom + 12, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <T size={13} weight="semibold" tone="muted" style={{ flex: 1 }}>
                    {lesson.attempts ? 'Your mastery · ' + lesson.attempts + (lesson.attempts === 1 ? ' answer' : ' answers') : 'Not practised yet'}
                  </T>
                  <MasteryBadge mastery={lesson.mastery} />
                </View>
                <Button title={'Practise this ' + (lesson.group === 'foundations' ? 'lesson' : 'tense') + ' (10 questions)'} icon="right" size="lg" block
                  onPress={() => router.push({ pathname: '/grammar/practice', params: { mode: lesson.id } })} />
              </View>
            ) : null}
          </>
        )}
    </View>
  );
}
