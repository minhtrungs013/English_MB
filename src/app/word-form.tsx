import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackBar, Button, Card, Chip, Field, Icon, Input, T } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { LEVELS, POS_LIST, type Level } from '../lib/data';
import { errMsg, useStore, useTheme } from '../state/store';

const toList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export default function WordForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data, actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const editing = id ? data.words.find((w) => w.id === id) : undefined;

  const [word, setWord] = useState(editing?.word ?? '');
  const [ipa, setIpa] = useState(editing?.ipa ?? '');
  const [pos, setPos] = useState(editing?.pos ?? 'Noun');
  const [meaning, setMeaning] = useState(editing?.meaning ?? '');
  const [vi, setVi] = useState(editing?.vi ?? '');
  const [ex, setEx] = useState(editing?.ex ?? '');
  const [syn, setSyn] = useState((editing?.syn ?? []).join(', '));
  const [ant, setAnt] = useState((editing?.ant ?? []).join(', '));
  const [level, setLevel] = useState<Level>(editing?.level ?? 'B1');
  const [tags, setTags] = useState<string[]>(editing?.tags ?? []);
  const [cat, setCat] = useState(editing?.cat ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);

  const autofill = async () => {
    const w = word.trim();
    if (!w) { setErr('Type a word first, then auto-fill its details.'); return; }
    setErr('');
    setLooking(true);
    try {
      const d = await api.lookup(w);
      if (d.ipa) setIpa(d.ipa);
      if (d.pos) setPos(d.pos);
      if (d.meaning) setMeaning(d.meaning);
      if (d.vi) setVi(d.vi);
      if (d.ex) setEx(d.ex);
      if (d.syn?.length) setSyn(d.syn.join(', '));
      if (d.ant?.length) setAnt(d.ant.join(', '));
      if (d.level) setLevel(d.level);
      actions.showToast('Details filled in — review them before saving.');
    } catch (e) {
      actions.showToast(e instanceof ApiError && e.status === 404 ? 'No details found for “' + w + '”. Fill them in yourself.' : errMsg(e), 'bad');
    } finally {
      setLooking(false);
    }
  };

  const save = async () => {
    const w = word.trim();
    if (!w) { setErr('Please enter a word.'); return; }
    setErr('');
    setBusy(true);
    try {
      const saved = await actions.saveWord({
        word: w, ipa: ipa.trim(), pos, meaning: meaning.trim(), vi: vi.trim(), ex: ex.trim(),
        syn: toList(syn), ant: toList(ant), level, cat, tags, notes: notes.trim()
      }, editing?.id);
      actions.showToast(editing ? 'Changes saved.' : 'Saved “' + w + '” to your words.');
      if (editing) router.back();
      else router.replace({ pathname: '/word/[id]', params: { id: saved.id } });
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <BackBar title={editing ? 'Edit Vocabulary' : 'Add Vocabulary'} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 12 }}>
          <Field label="Word *" error={err}>
            <Input value={word} onChangeText={(v) => { setWord(v); setErr(''); }} placeholder="e.g. maintain" autoCapitalize="none" autoCorrect={false} big invalid={!!err} autoFocus={!editing} returnKeyType="search" onSubmitEditing={autofill} />
          </Field>
          <Button title={looking ? 'Looking up…' : 'Auto-fill details'} icon="sparkle" loading={looking} onPress={autofill} />
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name="sparkle" size={14} color={t.primary} />
            <T size={12.5} tone="muted" style={{ flex: 1 }}>Optional — every field below can be filled in or edited by hand.</T>
          </View>
        </Card>

        <Card style={{ gap: 16 }}>
          <Field label="Pronunciation"><Input ipa value={ipa} onChangeText={setIpa} placeholder="/mənˈteɪn/" autoCapitalize="none" /></Field>
          <Field label="Part of speech">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{POS_LIST.map((p) => <Chip key={p} soft label={p} on={pos === p} onPress={() => setPos(p)} />)}</View>
          </Field>
          <Field label="Meaning"><Input value={meaning} onChangeText={setMeaning} placeholder="To keep something in good condition…" multiline /></Field>
          <Field label="Vietnamese translation"><Input value={vi} onChangeText={setVi} placeholder="duy trì, bảo trì" /></Field>
          <Field label="Example sentence"><Input value={ex} onChangeText={setEx} placeholder="We need to maintain the system regularly." multiline /></Field>
          <Field label="Synonyms" hint="Separate with commas"><Input value={syn} onChangeText={setSyn} placeholder="preserve, sustain" autoCapitalize="none" /></Field>
          <Field label="Antonyms" hint="Separate with commas"><Input value={ant} onChangeText={setAnt} placeholder="neglect" autoCapitalize="none" /></Field>
          <Field label="Level">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{LEVELS.map((l) => <Chip key={l} label={l} on={level === l} onPress={() => setLevel(l)} />)}</View>
          </Field>
          {data.cats.length > 0 && (
            <Field label="Category">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {[{ id: '', name: 'No category' }, ...data.cats].map((c) => <Chip key={c.id || 'none'} soft label={c.name} on={cat === c.id} onPress={() => setCat(c.id)} />)}
              </View>
            </Field>
          )}
          {data.tags.length > 0 && (
            <Field label="Tags">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {data.tags.map((g) => {
                  const on = tags.includes(g);
                  return <Chip key={g} soft label={'#' + g} on={on} onPress={() => setTags(on ? tags.filter((x) => x !== g) : [...tags, g])} />;
                })}
              </View>
            </Field>
          )}
          <Field label="Personal notes"><Input value={notes} onChangeText={setNotes} placeholder="Why do I want to remember this word?" multiline /></Field>
        </Card>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10, padding: 12, paddingBottom: insets.bottom + 12, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }}>
        <Button title="Cancel" variant="secondary" onPress={() => router.back()} style={{ flex: 1 }} />
        <Button title={editing ? 'Save Changes' : 'Save Vocabulary'} icon="check" loading={busy} onPress={save} style={{ flex: 2 }} />
      </View>
    </KeyboardAvoidingView>
  );
}
