import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackBar, Badge, Button, Card, Icon, IconButton, IconTile, T } from '../components/ui';
import { api, type PhraseBrief, type RolePlaySession } from '../lib/api';
import { speak } from '../lib/speech';
import { errMsg, useTheme } from '../state/store';

/**
 * Role-play with AI: a short chat at work where I use up to 3 phrases (given as keys, or some of mine).
 * AI plays the other person, ticks each phrase as I use it right, and reviews my lines at the end.
 */
export default function RolePlay() {
  const { keys: keysParam } = useLocalSearchParams<{ keys?: string }>();
  const keys = String(keysParam ?? '').split('|').map((k) => k.trim()).filter(Boolean);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [play, setPlay] = useState<RolePlaySession | null>(null);
  const [picked, setPicked] = useState<PhraseBrief[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    let live = true;
    api.phrases().then((r) => { if (live) setPicked(keys.length ? r.items.filter((p) => keys.includes(p.key)) : r.items.filter((p) => p.saved).slice(0, 3)); }).catch(() => { if (live) setPicked([]); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysParam]);
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80); }, [play]);

  const start = async () => {
    setBusy('Setting up…'); setErr('');
    try { const r = await api.roleplayStart(keys); setPlay(r); speak(r.lines[0]?.text ?? ''); }
    catch (e) { setErr(errMsg(e)); } finally { setBusy(''); }
  };
  const send = async () => {
    if (!play || !text.trim() || busy) return;
    const line = text.trim();
    setBusy('…'); setErr('');
    setPlay({ ...play, lines: [...play.lines, { from: 'me', text: line, used: [], noteVi: '' }] });
    setText('');
    try {
      const r = await api.roleplaySay(play.id, line);
      setPlay(r);
      const last = r.lines[r.lines.length - 1];
      if (last?.from === 'ai' && !r.done) speak(last.text);
    } catch (e) { setErr(errMsg(e)); setPlay(play); setText(line); } finally { setBusy(''); }
  };
  const finish = async () => {
    if (!play) return;
    setBusy('Reviewing…'); setErr('');
    try { setPlay(await api.roleplayFinish(play.id)); } catch (e) { setErr(errMsg(e)); } finally { setBusy(''); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior="padding">
      <BackBar title="Role-play with AI" />
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        {!play ? (
          <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
            <IconTile name="users" tone="indigo" size={52} />
            <T size={20} weight="extrabold" center>Practise phrases in a conversation</T>
            <T tone="muted" center>AI sets up a situation at work and plays the other person. Use the phrases in your answers — each one is ticked when you use it right. At the end AI checks every line you wrote.</T>
            {picked && picked.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>{picked.map((p) => <Badge key={p.key} label={p.phrase} bg={t.surface2} fg={t.text} />)}</View>
              : picked ? <T size={13} tone="muted">AI will pick some phrases for you.</T> : null}
            {err ? <T tone="danger" center>{err}</T> : null}
            <Button title={busy || 'Start the role-play'} icon="sparkle" loading={!!busy} onPress={start} block />
            <T size={12} tone="muted">Uses one of today’s role-plays.</T>
          </Card>
        ) : (
          <>
            <Card style={{ gap: 4 }}>
              <T weight="extrabold">{play.scenario.title}{play.scenario.titleVi ? ' · ' + play.scenario.titleVi : ''}</T>
              <T size={14}>{play.scenario.settingVi}</T>
              <T size={12} tone="muted">AI: {play.scenario.aiRole} · You: {play.scenario.learnerRole}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' }}>
                {play.phrases.map((p) => {
                  const on = play.used.includes(p.key);
                  return <Badge key={p.key} label={(on ? '✓ ' : '') + p.phrase} bg={on ? t.successSoft : t.surface2} fg={on ? t.success : t.text} />;
                })}
                {!play.done ? <T size={12} tone="muted">{play.turnsLeft} turns left</T> : null}
              </View>
            </Card>

            {play.lines.map((l, k) => (
              <View key={k} style={{ alignSelf: l.from === 'me' ? 'flex-end' : 'flex-start', maxWidth: '85%', gap: 3, alignItems: l.from === 'me' ? 'flex-end' : 'flex-start' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 16, backgroundColor: l.from === 'me' ? t.primary : t.surface2 }}>
                  <T size={15} style={{ color: l.from === 'me' ? '#fff' : t.text, flexShrink: 1 }}>{l.text}</T>
                  {l.from === 'ai' ? <IconButton name="volume" label="Hear" onPress={() => speak(l.text)} /> : null}
                </View>
                {l.from === 'me' && l.used.length ? <T size={12.5} weight="bold" style={{ color: t.success }}>✓ {l.used.map((u) => play.phrases.find((p) => p.key === u)?.phrase ?? u).join(', ')}</T> : null}
                {l.from === 'me' && l.noteVi ? <T size={13} style={{ color: t.warning }}>💡 {l.noteVi}</T> : null}
              </View>
            ))}
            {busy === '…' ? <T tone="muted">typing…</T> : null}

            {play.done ? (
              <Card style={{ gap: 8 }}>
                <T size={18} weight="extrabold">{play.phrases.every((p) => play.used.includes(p.key)) ? 'You used every phrase!' : 'Role-play finished'}</T>
                {play.feedback?.summaryVi ? <T>{play.feedback.summaryVi}</T> : null}
                {(play.feedback?.items ?? []).map((it, k) => (
                  <View key={k} style={{ padding: 10, borderRadius: 10, backgroundColor: t.surface2, gap: 2 }}>
                    <T size={14} style={{ color: it.ok ? t.success : t.danger }}>{it.ok ? '✓' : '✗'} {it.text}</T>
                    {!it.ok && it.corrected !== it.text ? <T size={14}>→ <T size={14} weight="bold">{it.corrected}</T></T> : null}
                    {it.noteVi ? <T size={13} tone="muted">{it.noteVi}</T> : null}
                  </View>
                ))}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title="Phrases" variant="secondary" onPress={() => router.back()} />
                  <Button title="New role-play" icon="refresh" onPress={() => { setPlay(null); setErr(''); }} style={{ flex: 1 }} />
                </View>
              </Card>
            ) : (
              <Card style={{ gap: 8 }}>
                <TextInput value={text} onChangeText={setText} multiline maxLength={300} placeholder="Your answer in English…" placeholderTextColor={t.faint}
                  accessibilityLabel="Your answer" editable={!busy || busy === '…'}
                  style={{ minHeight: 56, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 12, fontSize: 16, color: t.text, backgroundColor: t.surface, textAlignVertical: 'top' }} />
                {err ? <T size={14} tone="danger">{err}</T> : null}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button title={busy && busy !== '…' ? busy : 'Finish'} variant="secondary" loading={!!busy && busy !== '…'} onPress={finish} disabled={!!busy} />
                  <Button title="Send" icon="right" onPress={() => void send()} disabled={!text.trim() || !!busy} style={{ flex: 1 }} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="sparkle" size={14} color={t.faint} /><T size={12} tone="muted">AI ticks a phrase when you use it right.</T></View>
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
