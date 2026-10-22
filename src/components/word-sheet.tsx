import { router } from 'expo-router';
import { Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fmtAgo, fmtNext } from '../lib/data';
import { speak } from '../lib/speech';
import { useStore, useTheme } from '../state/store';
import { WordFamily } from './family';
import { Badge, Button, IconButton, LevelBadge, PosBadge, StatusBadge, T } from './ui';

/** Quick look at one of my words as a bottom sheet: the essentials and the main actions. */
export function WordSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const w = id ? data.words.find((x) => x.id === id) : undefined;
  const go = (fn: () => void) => { onClose(); fn(); };
  const confirmDelete = () => w && Alert.alert('Delete “' + w.word + '”?', 'This action cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { if (await actions.deleteWord(w.id)) onClose(); } }
  ]);
  const cat = w ? data.cats.find((c) => c.id === w.cat) : undefined;

  return (
    <Modal visible={!!w} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable onPress={onClose} accessibilityLabel="Close" style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(10,12,20,0.5)' }} />
        {w ? (
          <View style={{ maxHeight: '88%', backgroundColor: t.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 12 }}>
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginTop: 8 }} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 12, gap: 8 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}><PosBadge pos={w.pos} /><LevelBadge level={w.level} /><StatusBadge status={w.status} /></View>
                <T size={30} weight="extrabold" style={{ letterSpacing: -0.6 }}>{w.word}</T>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <T ipa size={15} tone="muted">{w.ipa}</T>
                  <IconButton name="volume" label="Play pronunciation" size={36} color={t.primaryInk} onPress={() => speak(w.word)} />
                </View>
              </View>
              <IconButton name="x" label="Close" onPress={onClose} />
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 14 }}>
              <View style={{ gap: 4 }}>
                <T size={19} weight="extrabold">{w.vi}</T>
                <T size={15}>{w.meaning}</T>
              </View>
              {w.ex ? (
                <View style={{ backgroundColor: t.surface2, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                  <T size={15} style={{ fontStyle: 'italic', flex: 1 }}>“{w.ex}”</T>
                  <IconButton name="volume" label="Play example" size={32} onPress={() => speak(w.ex, 0.95)} />
                </View>
              ) : null}
              {w.syn.length || w.ant.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {w.syn.map((x) => <Badge key={'s' + x} label={'≈ ' + x} bg={t.surface2} fg={t.text} />)}
                  {w.ant.map((x) => <Badge key={'a' + x} label={'≠ ' + x} bg={t.surface2} fg={t.muted} />)}
                </View>
              ) : null}
              <WordFamily word={w.word} family={w.family} />
              {w.notes ? <View style={{ backgroundColor: t.warningSoft, borderRadius: 12, padding: 12 }}><T size={14}>{w.notes}</T></View> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                <T size={13} tone="muted">Category <T size={13} weight="bold">{cat ? cat.name : 'Uncategorized'}</T></T>
                <T size={13} tone="muted">Next review <T size={13} weight="bold">{fmtNext(w.dueAt)}</T></T>
                <T size={13} tone="muted">Added <T size={13} weight="bold">{fmtAgo(w.addedAt)}</T></T>
                {w.tags.length ? <T size={13} tone="primaryInk">{w.tags.map((x) => '#' + x).join('  ')}</T> : null}
              </View>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.border, alignItems: 'center' }}>
              <IconButton name="trash" label="Delete" tone="danger" onPress={confirmDelete} />
              <Button title="Edit" icon="edit" variant="secondary" onPress={() => go(() => router.push({ pathname: '/word-form', params: { id: w.id } }))} />
              <Button title="Review" icon="refresh" onPress={() => go(() => router.push({ pathname: '/review', params: { mode: 'ids', ids: w.id } }))} style={{ flex: 1 }} />
            </View>
            <Pressable onPress={() => go(() => router.push({ pathname: '/word/[id]', params: { id: w.id } }))} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 }}>
              <T size={13.5} weight="bold" tone="primaryInk">Full details ›</T>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
