import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';
import { SaveFromLibrary } from '../../components/library';
import { BackBar, Badge, Button, Card, EmptyState, IconButton, LevelBadge, PosBadge, SectionTitle, T, TopicBadge } from '../../components/ui';
import { api, type LibraryWord } from '../../lib/api';
import { fmtDate } from '../../lib/data';
import { speak } from '../../lib/speech';
import { errMsg, useStore, useTheme } from '../../state/store';

export default function LibraryWordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, actions } = useStore();
  const t = useTheme();
  const [w, setW] = useState<LibraryWord | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.libraryWord(id).then(setW).catch((e) => setErr(errMsg(e)));
  }, [id]);

  if (!w) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar />
        {err ? <EmptyState icon="alert" tone="red" title="Couldn’t open this word" text={err} /> : <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />}
      </View>
    );
  }

  const author = w.authorId === '' ? 'Wordbook' : w.authorId === data.userId ? 'You' : w.authorName;
  const mineShared = !!w.authorId && w.authorId === data.userId;
  const remove = () => Alert.alert('Remove “' + w.word + '” from the library?', 'Other learners won’t be able to find it any more. Copies they saved are kept.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => { if (await actions.unshare(w)) router.back(); } }
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title="Library" right={mineShared ? <IconButton name="trash" label="Remove from library" tone="danger" onPress={remove} /> : undefined} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: 32 }}>
        <Card style={{ padding: 22, gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}><PosBadge pos={w.pos} /><LevelBadge level={w.level} /><TopicBadge topic={w.topic} /></View>
          <T size={38} weight="extrabold" style={{ letterSpacing: -1, lineHeight: 44 }}>{w.word}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <T ipa size={17} tone="muted">{w.ipa}</T>
            <IconButton name="volume" label="Play pronunciation" size={38} color={t.primaryInk} onPress={() => speak(w.word)} />
          </View>
          <View style={{ height: 1, backgroundColor: t.border, marginVertical: 6 }} />
          <T size={21} weight="extrabold">{w.vi}</T>
          <T size={16}>{w.meaning}</T>
        </Card>

        <SaveFromLibrary w={w} size="lg" />

        {w.ex ? (
          <Card style={{ gap: 10 }}>
            <SectionTitle>Example</SectionTitle>
            <View style={{ backgroundColor: t.surface2, borderRadius: 12, padding: 14, flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <T size={16} style={{ fontStyle: 'italic', flex: 1 }}>“{w.ex}”</T>
              <IconButton name="volume" label="Play example" size={34} onPress={() => speak(w.ex, 0.95)} />
            </View>
          </Card>
        ) : null}

        {(w.syn.length > 0 || w.ant.length > 0) && (
          <Card style={{ gap: 14 }}>
            <View style={{ gap: 8 }}>
              <SectionTitle>Synonyms</SectionTitle>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{w.syn.length ? w.syn.map((x) => <Badge key={x} label={x} bg={t.surface2} fg={t.text} />) : <T tone="muted">—</T>}</View>
            </View>
            <View style={{ gap: 8 }}>
              <SectionTitle>Antonyms</SectionTitle>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{w.ant.length ? w.ant.map((x) => <Badge key={x} label={x} bg={t.surface2} fg={t.text} />) : <T tone="muted">—</T>}</View>
            </View>
          </Card>
        )}

        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#FBD9BC', alignItems: 'center', justifyContent: 'center' }}>
            <T size={13} weight="extrabold" style={{ color: '#7A3A0C' }}>{author.charAt(0)}</T>
          </View>
          <T size={14} tone="muted" style={{ flex: 1 }}>
            Added by <T size={14} weight="bold">{author}</T>{w.authorId ? ' · ' + fmtDate(w.sharedAt) : ''} · saved {w.saves} {w.saves === 1 ? 'time' : 'times'}
          </T>
        </Card>
        {mineShared ? <Button title="Remove from library" icon="trash" variant="dangerSoft" onPress={remove} /> : null}
      </ScrollView>
    </View>
  );
}
