import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, EmptyState, Icon, IconButton, LevelBadge, PosBadge, T } from '../components/ui';
import { shuffle, type Rating } from '../lib/data';
import type { IconName } from '../lib/icons';
import { speak, stopSpeaking } from '../lib/speech';
import { useStore, useTheme } from '../state/store';

const RATINGS: [Rating, string, IconName][] = [['Again', '10 min', 'refresh'], ['Hard', '1 day', 'meh'], ['Good', '3 days', 'smile'], ['Easy', '7 days', 'zap']];

/** Flashcard review. mode=due (words due today), flash (random practice), ids (specific words). */
export default function Review() {
  const params = useLocalSearchParams<{ mode?: string; ids?: string }>();
  const { data, actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const practice = params.mode === 'flash';
  const [queue] = useState<string[]>(() =>
    params.mode === 'ids' ? (params.ids ?? '').split(',').filter(Boolean)
      : practice ? shuffle(data.words.map((w) => w.id)).slice(0, 20)
      : actions.dueIds());
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [again, setAgain] = useState(0);
  const [done, setDone] = useState(false);
  const title = practice ? 'Flashcards' : 'Review';

  const w = data.words.find((x) => x.id === queue[i]);
  const viFirst = data.settings.dir === 'vi-en';

  // Auto-play the English word whenever it becomes visible.
  const spoken = useRef('');
  useEffect(() => {
    if (!w || done || !data.settings.autoplay) return;
    const showsEnglish = viFirst ? flipped : !flipped;
    const key = i + ':' + flipped;
    if (showsEnglish && spoken.current !== key) { spoken.current = key; speak(w.word); }
  }, [w, i, flipped, done, viFirst, data.settings.autoplay]);
  useEffect(() => () => stopSpeaking(), []);

  const rate = (r: Rating) => {
    if (!w) return;
    actions.rate(w.id, r, practice);
    if (r === 'Again') setAgain((n) => n + 1);
    if (i + 1 >= queue.length) setDone(true);
    else { setI(i + 1); setFlipped(false); }
  };

  const n = queue.length;
  const pct = done ? 100 : n ? Math.round((i / n) * 100) : 100;
  const close = () => { stopSpeaking(); router.back(); };

  const bar = (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <T weight="extrabold">{title}</T>
      <View style={{ flex: 1, height: 8, borderRadius: 99, backgroundColor: t.surface3, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%` as const, height: '100%', backgroundColor: t.primary, borderRadius: 99 }} />
      </View>
      <T size={14} weight="bold" tone="muted">{n ? (done ? n : i + 1) + ' / ' + n : '0 / 0'}</T>
      <IconButton name="x" label="Exit" onPress={close} />
    </View>
  );

  if (!n || (!done && !w)) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {bar}
        <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
          <Card>
            <EmptyState icon="checkc" tone="green" title="You're all caught up!" text="No words need review right now.">
              <View style={{ gap: 10, alignSelf: 'stretch' }}>
                <Button title="Practice More" size="lg" onPress={() => router.replace('/practice')} block />
                <Button title="Back" variant="ghost" onPress={close} block />
              </View>
            </EmptyState>
          </Card>
        </View>
      </View>
    );
  }

  if (done) {
    const streak = data.progress.streak;
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {bar}
        <View style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
          <Card style={{ alignItems: 'center', gap: 10, padding: 24 }}>
            <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="trophy" size={32} color={t.primaryInk} /></View>
            <T size={26} weight="extrabold" center>{practice ? 'Practice complete!' : 'Review complete!'}</T>
            <T tone="muted" center>{practice ? 'You went through ' + n + (n === 1 ? ' card.' : ' cards.') : 'You reviewed ' + n + (n === 1 ? ' word' : ' words') + ' today.'}</T>
            <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginVertical: 8 }}>
              {[[n, 'completed', t.text], [n - again, 'remembered', t.success], [again, 'need practice', t.danger]].map(([v, l, c]) => (
                <View key={l as string} style={{ flex: 1, backgroundColor: t.surface2, borderRadius: 12, padding: 12, alignItems: 'center' }}>
                  <T size={24} weight="extrabold" style={{ color: c as string }}>{v as number}</T>
                  <T size={12} weight="semibold" tone="muted" center>{l as string}</T>
                </View>
              ))}
            </View>
            {!practice && streak > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 16, borderRadius: 99, backgroundColor: t.orangeSoft }}>
                <Icon name="flame" size={18} color={t.orange} /><T weight="extrabold" style={{ color: t.orange }}>{streak} day streak</T>
              </View>
            ) : null}
            <Button title="Done" size="lg" onPress={close} block style={{ marginTop: 6 }} />
          </Card>
        </View>
      </View>
    );
  }

  const word = w!;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {bar}
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16, gap: 14, justifyContent: 'center' }}>
        <Pressable onPress={() => !flipped && setFlipped(true)} accessibilityRole="button" accessibilityLabel={flipped ? word.word : 'Show answer'}>
          <Card style={{ minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, borderRadius: 22 }}>
            {!flipped ? (
              <>
                <PosBadge pos={word.pos} />
                <T size={38} weight="extrabold" center style={{ letterSpacing: -1, lineHeight: 44 }}>{viFirst ? word.vi : word.word}</T>
                {!viFirst && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <T size={18} tone="muted">{word.ipa}</T>
                    <IconButton name="volume" label="Play pronunciation" size={38} color={t.primaryInk} onPress={() => speak(word.word)} />
                  </View>
                )}
                <T size={13} weight="semibold" tone="muted" style={{ marginTop: 12 }}>Tap the card to see the answer</T>
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 6 }}><PosBadge pos={word.pos} /><LevelBadge level={word.level} /></View>
                <T size={36} weight="extrabold" center style={{ letterSpacing: -1, lineHeight: 42 }}>{word.word}</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <T size={18} tone="muted">{word.ipa}</T>
                  <IconButton name="volume" label="Play pronunciation" size={38} color={t.primaryInk} onPress={() => speak(word.word)} />
                </View>
                <View style={{ width: 56, height: 3, borderRadius: 3, backgroundColor: t.surface3, marginVertical: 4 }} />
                <T size={21} weight="extrabold" center>{word.vi}</T>
                <T size={15} tone="muted" center>{word.meaning}</T>
                {data.settings.showEx && word.ex ? (
                  <View style={{ backgroundColor: t.surface2, borderRadius: 12, padding: 14, alignSelf: 'stretch' }}>
                    <T size={15} style={{ fontStyle: 'italic' }} center>“{word.ex}”</T>
                  </View>
                ) : null}
              </>
            )}
          </Card>
        </Pressable>
        {!flipped ? (
          <Button title="Show Answer" size="lg" onPress={() => setFlipped(true)} />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {RATINGS.map(([r, ivl, icon]) => {
              const c = { Again: t.danger, Hard: t.warning, Good: t.success, Easy: t.info }[r];
              return (
                <Pressable key={r} onPress={() => rate(r)} accessibilityRole="button" accessibilityLabel={r + ', next review in ' + ivl}
                  style={({ pressed }) => ({ width: '48%', flexGrow: 1, minHeight: 76, borderRadius: 14, borderWidth: 1, borderColor: pressed ? c : t.border, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center', gap: 2 })}>
                  <Icon name={icon} size={22} color={c} />
                  <T weight="extrabold" style={{ color: c }}>{r}</T>
                  <T size={12.5} weight="semibold" tone="muted">{ivl}</T>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
      <View style={{ height: insets.bottom }} />
    </View>
  );
}
