import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackBar, Button, Card, Chip, Field, Icon, Input, LevelBadge, T, TopicBadge } from '../components/ui';
import { api, ApiError, type LibraryWord } from '../lib/api';
import { LEVELS, POS_LIST, type Level } from '../lib/data';
import { errMsg, useStore, useTheme } from '../state/store';

const toList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

/** While adding a word: the library's entry for exactly that word (if any), checked as you type. */
function useLibraryMatch(word: string, enabled: boolean): LibraryWord | null {
  const [match, setMatch] = useState<{ key: string; w: LibraryWord | null } | null>(null);
  const key = word.trim().toLowerCase();
  useEffect(() => {
    if (!enabled || !key) return;
    let alive = true;
    const t = setTimeout(() => {
      api.findInLibrary(key).then((r) => { if (alive) setMatch({ key, w: r.word }); }).catch(() => { /* offline: just don't suggest */ });
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [key, enabled]);
  return enabled && key && match?.key === key ? match.w : null;
}

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
  const autofillLeft = Math.max(0, data.autofill.limit - data.autofill.used);
  const libMatch = useLibraryMatch(word, !editing);
  const mineMatch = !editing && word.trim() ? data.words.find((w) => w.word.toLowerCase() === word.trim().toLowerCase()) : undefined;
  const [usingLib, setUsingLib] = useState(false);
  const useLibraryWord = async () => {
    if (!libMatch || usingLib) return;
    setUsingLib(true);
    const w = await actions.saveFromLibrary(libMatch);
    setUsingLib(false);
    if (w) router.replace({ pathname: '/word/[id]', params: { id: w.id } });
  };

  const autofill = async () => {
    const w = word.trim();
    if (!w) { setErr('Type a word first, then auto-fill its details.'); return; }
    setErr('');
    setLooking(true);
    try {
      const d = await api.lookup(w);
      if (d.quota) actions.setAutofill(d.quota);
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
      const quota = e instanceof ApiError ? (e.body?.quota as { used: number; limit: number } | undefined) : undefined;
      if (quota) actions.setAutofill(quota);
      // Daily limit reached: mark today's auto-fills as used up.
      if (e instanceof ApiError && e.status === 429) actions.setAutofill({ ...data.autofill, used: data.autofill.limit });
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
          {mineMatch ? (
            <View style={{ gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: t.primary, backgroundColor: t.primarySoft }}>
              <T weight="bold" tone="primaryInk">You already have “{mineMatch.word}” in your vocabulary.</T>
              <Button title="Open it" icon="right" variant="secondary" size="sm" onPress={() => router.replace({ pathname: '/word/[id]', params: { id: mineMatch.id } })} />
            </View>
          ) : libMatch ? (
            <View accessibilityLiveRegion="polite" style={{ gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: t.primary, backgroundColor: t.primarySoft }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Icon name="globe" size={16} color={t.primaryInk} />
                <T weight="bold" tone="primaryInk" style={{ flex: 1 }}>“{libMatch.word}” is already in the library — save it instead of typing it again.</T>
              </View>
              <View style={{ backgroundColor: t.surface, borderRadius: 10, borderWidth: 1, borderColor: t.border, padding: 12, gap: 4 }}>
                <T size={17} weight="extrabold">{libMatch.word}</T>
                <T ipa size={13} tone="muted">{libMatch.ipa}</T>
                <T weight="semibold">{libMatch.vi}</T>
                <T size={13.5} tone="muted">{libMatch.meaning}</T>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}><TopicBadge topic={libMatch.topic} /><LevelBadge level={libMatch.level} /></View>
              </View>
              <Button title="Save from library" icon="plus" loading={usingLib} onPress={useLibraryWord} />
            </View>
          ) : (
            <Button title={looking ? 'Looking up…' : autofillLeft <= 0 ? 'No auto-fills left today' : 'Auto-fill details'} icon="sparkle" loading={looking} disabled={autofillLeft <= 0} onPress={autofill} />
          )}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name="sparkle" size={14} color={t.primary} />
            <T size={12.5} tone="muted" style={{ flex: 1 }}>
              {autofillLeft > 0
                ? 'Optional — ' + autofillLeft + ' of ' + data.autofill.limit + ' auto-fills left today. Every field below can be filled in or edited by hand.'
                : 'You’ve used today’s ' + data.autofill.limit + ' auto-fills — fill in the details by hand, or try again tomorrow.'}
            </T>
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
        {libMatch && !mineMatch
          ? <Button title="Save from library" icon="plus" loading={usingLib} onPress={useLibraryWord} style={{ flex: 2 }} />
          : <Button title={editing ? 'Save Changes' : 'Save Vocabulary'} icon="check" loading={busy} onPress={save} style={{ flex: 2 }} />}
      </View>
    </KeyboardAvoidingView>
  );
}
