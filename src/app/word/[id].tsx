import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import {
  BackBar, Badge, Button, Card, Chip, EmptyState, IconButton, LevelBadge, PosBadge, SectionTitle, StatusBadge, T, TOPIC_LABEL
} from '../../components/ui';
import type { Topic } from '../../lib/api';
import { fmtAgo, fmtDate, fmtNext, type Word } from '../../lib/data';
import { speak } from '../../lib/speech';
import { useStore, useTheme } from '../../state/store';

function ShareCard({ w }: { w: Word }) {
  const { data, actions } = useStore();
  const [topic, setTopic] = useState<Topic>(w.tags.includes('interview') ? 'interview' : w.tags.includes('customer-meeting') ? 'customer' : w.tags.includes('leader-meeting') ? 'leader' : 'it');
  const [busy, setBusy] = useState(false);
  const inLibrary = data.shared.includes(w.word.toLowerCase());
  return (
    <Card style={{ gap: 10 }}>
      <SectionTitle>Vocabulary library</SectionTitle>
      {inLibrary ? (
        <>
          <T size={14} tone="muted">This word is in the shared library, so everyone can find and save it.</T>
          <Button title="Open the library" icon="globe" variant="secondary" onPress={() => router.push('/library')} />
        </>
      ) : (
        <>
          <T size={14} tone="muted">Not in the library yet. Share it so other learners can save it too — your name is shown as the author.</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(Object.keys(TOPIC_LABEL) as Topic[]).map((x) => <Chip key={x} soft label={TOPIC_LABEL[x]} on={topic === x} onPress={() => setTopic(x)} />)}
          </View>
          <Button title={busy ? 'Sharing…' : 'Share to library'} icon="globe" loading={busy} onPress={async () => { setBusy(true); await actions.shareWord(w, topic); setBusy(false); }} />
        </>
      )}
    </Card>
  );
}

export default function WordDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, actions } = useStore();
  const t = useTheme();
  const w = data.words.find((x) => x.id === id);

  if (!w) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar />
        <EmptyState icon="search" title="Word not found" text="It may have been deleted." />
      </View>
    );
  }

  const cat = data.cats.find((c) => c.id === w.cat);
  const confirmDelete = () => Alert.alert('Delete “' + w.word + '”?', 'This action cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { if (await actions.deleteWord(w.id)) router.back(); } }
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar right={<>
        <IconButton name="edit" label="Edit" onPress={() => router.push({ pathname: '/word-form', params: { id: w.id } })} />
        <IconButton name="trash" label="Delete" tone="danger" onPress={confirmDelete} />
      </>} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: 32 }}>
        <Card style={{ padding: 22, gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}><PosBadge pos={w.pos} /><LevelBadge level={w.level} /><StatusBadge status={w.status} /></View>
          <T size={38} weight="extrabold" style={{ letterSpacing: -1, lineHeight: 44 }}>{w.word}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <T ipa size={17} tone="muted">{w.ipa}</T>
            <IconButton name="volume" label="Play pronunciation" size={38} color={t.primaryInk} onPress={() => speak(w.word)} />
          </View>
          <View style={{ height: 1, backgroundColor: t.border, marginVertical: 6 }} />
          <T size={21} weight="extrabold">{w.vi}</T>
          <T size={16}>{w.meaning}</T>
        </Card>

        <Button title="Review This Word" icon="refresh" size="lg" onPress={() => router.push({ pathname: '/review', params: { mode: 'ids', ids: w.id } })} />

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

        {w.notes ? (
          <Card style={{ gap: 10 }}>
            <SectionTitle>My notes</SectionTitle>
            <View style={{ backgroundColor: t.warningSoft, borderRadius: 12, padding: 14 }}><T>{w.notes}</T></View>
          </Card>
        ) : null}

        <ShareCard w={w} />

        <Card style={{ gap: 12 }}>
          <SectionTitle>Details</SectionTitle>
          {[['Category', cat ? cat.name : 'Uncategorized'], ['Tags', w.tags.length ? w.tags.map((x) => '#' + x).join('  ') : 'No tags'], ['Next review', fmtNext(w.dueAt)], ['Added', fmtAgo(w.addedAt)]].map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <T size={14} tone="muted">{k}</T>
              <T size={14} weight="bold" style={{ flexShrink: 1, textAlign: 'right' }}>{v}</T>
            </View>
          ))}
        </Card>

        <Card style={{ gap: 6 }}>
          <SectionTitle style={{ marginBottom: 4 }}>Review history</SectionTitle>
          {w.hist.length ? w.hist.slice(0, 8).map((h, i) => {
            const c = { Again: t.danger, Hard: t.warning, Good: t.success, Easy: t.info }[h.r];
            return (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: t.border }}>
                <T size={14} weight="semibold">{fmtDate(h.at)}</T>
                <T size={14} weight="bold" style={{ color: c }}>{h.r}</T>
              </View>
            );
          }) : <T size={14} tone="muted">Not reviewed yet. Start a review to begin tracking this word.</T>}
        </Card>
      </ScrollView>
    </View>
  );
}
