import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PatternChips } from '../../components/phrases';
import { BackBar, Badge, Button, Card, EmptyState, IconButton, LevelBadge, SectionTitle, T } from '../../components/ui';
import { api, type Phrase } from '../../lib/api';
import { FUNCTION_LABEL, REGISTER_LABEL } from '../../lib/phrases';
import { speak } from '../../lib/speech';
import { errMsg, useStore, useTheme } from '../../state/store';

/** A phrase's details: meaning, pattern and forms (slot) or situations, dialogue and replies (fixed), words it takes, notes. */
export default function PhraseScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { data, actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [p, setP] = useState<Phrase | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  useEffect(() => {
    let live = true;
    api.phrase(String(key)).then((r) => { if (live) setP(r); }).catch((e) => { if (live) setErr(errMsg(e)); });
    return () => { live = false; };
  }, [key]);

  if (err) return <View style={{ flex: 1, backgroundColor: t.bg }}><BackBar title="Phrase" /><View style={{ padding: 16 }}><EmptyState icon="alert" tone="red" title="Can’t load this phrase" text={err} /></View></View>;
  if (!p) return <View style={{ flex: 1, backgroundColor: t.bg }}><BackBar title="Phrase" /><T tone="muted" style={{ padding: 16 }}>Loading…</T></View>;

  const savedId = p.savedId || data.words.find((w) => w.word.toLowerCase() === p.phrase.toLowerCase().replace(/[?.!]+$/, ''))?.id || '';
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.savePhrase(p.key);
      actions.addSavedWord(r.word, r.tag);
      setP({ ...p, savedId: r.word.id });
      actions.showToast('Saved “' + p.phrase + '” to your words.');
    } catch (e) { actions.showToast(errMsg(e), 'bad'); } finally { setBusy(false); }
  };
  /** AI looks for my words that fit this phrase (only the ones it hasn't looked at). */
  const findMine = async () => {
    setFinding(true);
    try {
      const r = await api.phraseMyWords(p.key);
      setP(await api.phrase(p.key));
      actions.showToast(r.added ? 'Found ' + r.added + (r.added === 1 ? ' word' : ' words') + ' of yours.' : 'None of your ' + r.checked + ' new words fit “' + p.phrase + '”.');
    } catch (e) { actions.showToast(errMsg(e), 'bad'); } finally { setFinding(false); }
  };
  const saveWord = async (libraryId: string, word: string) => {
    const w = await actions.saveFromLibrary({ id: libraryId, word });
    if (w) setP({ ...p, fillers: p.fillers.map((f) => (f.word === word ? { ...f, mine: true, wordId: w.id } : f)) });
  };
  const Box = ({ children }: { children: React.ReactNode }) => <View style={{ padding: 10, borderRadius: 10, backgroundColor: t.surface2, gap: 2 }}>{children}</View>;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title="Phrase" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, paddingBottom: insets.bottom + 24 }}>
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Badge label={p.kind === 'slot' ? 'Phrase with a slot' : FUNCTION_LABEL[p.function] ?? 'Conversation'} bg={t.surface2} fg={t.text} />
            <LevelBadge level={p.level} />
            <Badge label={REGISTER_LABEL[p.register] ?? p.register} bg={p.register === 'informal' ? t.warningSoft : t.successSoft} fg={p.register === 'informal' ? t.warning : t.success} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T size={28} weight="extrabold" style={{ flexShrink: 1 }}>{p.phrase}</T>
            <IconButton name="volume" label={'Hear ' + p.phrase} onPress={() => speak(p.phrase)} />
          </View>
          {p.pattern ? <PatternChips pattern={p.pattern} /> : null}
          <T size={18} weight="bold">{p.vi}</T>
          <T tone="muted">{p.meaning}</T>
          {p.slot?.hint ? <T size={13} tone="muted">… = {p.slot.hint}</T> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            {savedId ? <Badge label="✓ In my words" bg={t.successSoft} fg={t.success} />
              : <Button title="Save" icon="plus" variant="secondary" loading={busy} onPress={save} />}
            <Button title="Role-play" icon="users" variant="secondary" onPress={() => router.push({ pathname: '/roleplay', params: { keys: p.key } })} />
            <Button title="Practise" icon="zap" onPress={() => router.push({ pathname: '/phrase-practice', params: { key: p.key } })} style={{ flex: 1 }} />
          </View>
        </Card>

        {p.forms.length ? (
          <Card style={{ gap: 8 }}>
            <SectionTitle>Forms</SectionTitle>
            {p.forms.map((f, i) => (
              <Box key={i}><T size={12.5} tone="muted">{f.use}</T>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}><T style={{ flex: 1, fontStyle: 'italic' }}>{f.en}</T><IconButton name="volume" label="Hear" onPress={() => speak(f.en)} /></View></Box>
            ))}
          </Card>
        ) : null}

        {p.fillers.length ? (
          <Card style={{ gap: 8 }}>
            <SectionTitle>Words it takes · {p.fillers.filter((f) => f.mine).length} in my words</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {p.fillers.map((f) => (
                <View key={f.en} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: f.mine ? t.success : t.border, backgroundColor: f.mine ? t.successSoft : t.surface }}>
                  <T size={13.5} weight="bold" style={{ color: f.mine ? t.success : t.text }}>{f.ai ? '✨ ' : ''}{f.en}{f.mine ? ' ✓' : ''}</T>
                  {!f.mine && f.libraryId ? <Pressable onPress={() => void saveWord(f.libraryId, f.word)} accessibilityRole="button" accessibilityLabel={'Save ' + f.word} hitSlop={8}><T size={13} weight="bold" style={{ color: t.primaryInk }}>+ Save</T></Pressable> : null}
                </View>
              ))}
            </View>
            {p.unchecked > 0 ? <Button title={finding ? 'Looking at your words…' : 'Find my words that fit (' + p.unchecked + ')'} icon="sparkle" variant="secondary" size="sm" loading={finding} onPress={findMine} /> : null}
          </Card>
        ) : null}

        {p.situations.length ? <Card style={{ gap: 6 }}><SectionTitle>When to use it</SectionTitle>{p.situations.map((x) => <T key={x}>• {x}</T>)}</Card> : null}

        {p.dialogue.length ? (
          <Card style={{ gap: 8 }}>
            <SectionTitle>In a conversation</SectionTitle>
            {p.dialogue.map((d, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8, padding: 10, borderRadius: 10, backgroundColor: d.s === 'B' ? t.primarySoft : t.surface2 }}>
                <T weight="extrabold">{d.s}</T>
                <View style={{ flex: 1, gap: 2 }}><T style={{ fontStyle: 'italic' }}>{d.en}</T><T size={13} tone="muted">{d.vi}</T></View>
                <IconButton name="volume" label="Hear this line" onPress={() => speak(d.en)} />
              </View>
            ))}
          </Card>
        ) : null}

        {p.replies.good.length || p.variants.length ? (
          <Card style={{ gap: 6 }}>
            {p.replies.good.length ? <><SectionTitle>Natural replies</SectionTitle>{p.replies.good.map((x) => <T key={x}>✓ {x}</T>)}{p.replies.bad.map((x) => <T key={x} tone="muted" style={{ textDecorationLine: 'line-through' }}>✗ {x}</T>)}</> : null}
            {p.variants.length ? <><SectionTitle>Also said</SectionTitle><T>{p.variants.join(' · ')}</T></> : null}
          </Card>
        ) : null}

        {p.examples.length ? (
          <Card style={{ gap: 8 }}>
            <SectionTitle>Examples</SectionTitle>
            {p.examples.map((x, i) => (
              <Box key={i}><View style={{ flexDirection: 'row', alignItems: 'center' }}><T style={{ flex: 1, fontStyle: 'italic' }}>{x.en}</T><IconButton name="volume" label="Hear" onPress={() => speak(x.en)} /></View><T size={13} tone="muted">{x.vi}</T></Box>
            ))}
          </Card>
        ) : null}

        {p.notes.length || p.mistakes.length ? (
          <Card style={{ gap: 6 }}>
            {p.notes.length ? <><SectionTitle>Notes</SectionTitle>{p.notes.map((x) => <T key={x} size={14}>• {x}</T>)}</> : null}
            {p.mistakes.length ? <><SectionTitle>Common mistakes</SectionTitle>{p.mistakes.map((m, i) => (
              <Box key={i}><T size={14} tone="danger">✗ {m.wrong}</T><T size={14} weight="bold" style={{ color: t.success }}>✓ {m.right}</T><T size={13} tone="muted">{m.why}</T></Box>
            ))}</> : null}
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}
