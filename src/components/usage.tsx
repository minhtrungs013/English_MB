import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { api, type Quota, type WordUsage } from '../lib/api';
import { speak } from '../lib/speech';
import { useTheme } from '../state/store';
import { Badge, Button, Icon, IconButton, Input, T } from './ui';

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

function Head({ children }: { children: string }) {
  return <T size={12.5} weight="extrabold" tone="muted">{children}</T>;
}

/** The usage itself: structures, collocations, notes, mistakes, look-alikes. */
export function UsageBody({ u }: { u: WordUsage }) {
  const t = useTheme();
  return (
    <View style={{ gap: 14 }}>
      {u.patterns.length ? (
        <View style={{ gap: 8 }}>
          <Head>Structures</Head>
          {u.patterns.map((p, k) => (
            <View key={k} style={{ gap: 2 }}>
              <T weight="bold" tone="primaryInk">{p.pattern}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <T size={14.5} style={{ flex: 1, fontStyle: 'italic' }}>“{p.ex}”</T>
                <IconButton name="volume" label={'Play: ' + p.ex} size={36} onPress={() => speak(p.ex)} />
              </View>
              {p.vi ? <T size={13.5} tone="muted">{p.vi}</T> : null}
            </View>
          ))}
        </View>
      ) : null}
      {u.collocations.length ? (
        <View style={{ gap: 6 }}>
          <Head>Goes with</Head>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{u.collocations.map((c) => <Badge key={c} label={c} bg={t.surface2} fg={t.text} />)}</View>
        </View>
      ) : null}
      {u.notes.length ? (
        <View style={{ gap: 4 }}>
          <Head>Notes</Head>
          {u.notes.map((n, k) => <T key={k} size={14}>• {n}</T>)}
        </View>
      ) : null}
      {u.mistakes.length ? (
        <View style={{ gap: 8 }}>
          <Head>Common mistakes</Head>
          {u.mistakes.map((m, k) => (
            <View key={k} style={{ gap: 2 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}><Icon name="x" size={15} color={t.danger} /><T size={14} tone="danger" style={{ flex: 1, textDecorationLine: 'line-through' }}>{m.wrong}</T></View>
              <View style={{ flexDirection: 'row', gap: 6 }}><Icon name="check" size={15} color={t.success} /><T size={14} weight="semibold" style={{ flex: 1, color: t.success }}>{m.right}</T></View>
              {m.why ? <T size={13} tone="muted">{m.why}</T> : null}
            </View>
          ))}
        </View>
      ) : null}
      {u.related.length ? (
        <View style={{ gap: 4 }}>
          <Head>Don’t mix up</Head>
          {u.related.map((r, k) => (
            <T key={k} size={14}><T size={14} weight="bold">{r.word}</T>{r.pos ? <T size={13} tone="muted">{' (' + r.pos + ')'}</T> : null}{r.vi ? ' · ' + r.vi : ''}{r.note ? <T size={13} tone="muted">{' — ' + r.note}</T> : null}</T>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * "How to use" for a word: shown when someone already has it (shared, free to read). With canWrite, a missing one can be
 * written by AI on request (one of today's Usage allowance). Without it (e.g. inside a course), nothing shows until one exists.
 */
export function UsagePanel({ word, canWrite = true }: { word: string; canWrite?: boolean }) {
  const t = useTheme();
  const [u, setU] = useState<WordUsage | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [ai, setAi] = useState(true);
  const [stale, setStale] = useState(false);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'writing' | 'failed'>('loading');
  const [err, setErr] = useState('');
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const [reported, setReported] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setPhase('loading'); setU(null); setErr(''); setReported(false); setReporting(false);
    // A word that was just added gets its usage written in the background: look again a few times.
    const load = (tries: number) => api.usage(word).then((r) => {
      if (!alive) return;
      if (r.writing && !r.usage && tries > 0) { setPhase('writing'); timer = setTimeout(() => void load(tries - 1), 3000); return; }
      setU(r.usage); setQuota(r.quota); setAi(r.ai !== false); setStale(!!r.stale); setPhase('ready');
    }).catch((e) => { if (alive) { setErr(errText(e, 'Couldn’t load how to use this word.')); setPhase('failed'); } });
    void load(8);
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [word]);

  const write = async () => {
    setPhase('writing'); setErr('');
    try {
      const r = await api.usage(word, true);
      setU(r.usage); setQuota(r.quota); setStale(false);
    } catch (e) {
      setErr(errText(e, 'Couldn’t write how to use this word.'));
    } finally {
      setPhase('ready');
    }
  };
  const report = async () => {
    try { await api.reportUsage(word, note); setReported(true); setReporting(false); } catch (e) { setErr(errText(e, 'Couldn’t send the report.')); }
  };

  if (!canWrite && (phase !== 'ready' || !u || stale)) return null;
  const left = quota ? Math.max(0, quota.limit - quota.used) : null;
  return (
    <View style={{ gap: 10 }} accessibilityLabel={'How to use ' + word}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T size={13} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>How to use</T>
        {u && !stale ? (u.status === 'approved' ? <Badge label="Checked" bg={t.successSoft} fg={t.success} /> : <Badge label="AI" bg={t.surface2} fg={t.muted} />) : null}
      </View>
      {phase === 'loading' || (phase === 'writing' && !u && quota === null) ? (
        <ActivityIndicator color={t.primary} style={{ alignSelf: 'flex-start' }} />
      ) : u && !stale ? (
        <>
          <UsageBody u={u} />
          {reported ? <T size={12.5} tone="muted">Thanks — an admin will check it.</T> : reporting ? (
            <View style={{ gap: 8 }}>
              <Input value={note} onChangeText={setNote} placeholder="What’s wrong? (optional)" multiline maxLength={300} accessibilityLabel="What’s wrong" />
              <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
                <Button title="Cancel" variant="ghost" size="sm" onPress={() => setReporting(false)} />
                <Button title="Send report" variant="secondary" size="sm" onPress={report} />
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setReporting(true)} accessibilityRole="button" style={{ alignSelf: 'flex-end', paddingVertical: 6 }}>
              <T size={12.5} tone="muted" style={{ textDecorationLine: 'underline' }}>Something wrong? Report it</T>
            </Pressable>
          )}
        </>
      ) : !ai ? (
        <T size={14} tone="muted">There’s no usage for this word yet.</T>
      ) : (
        <View style={{ gap: 8 }}>
          <T size={14} tone="muted">{stale ? 'The meaning of this word changed — its usage needs updating.' : 'Structures, word partners and common mistakes for “' + word + '”.'}</T>
          <Button title={phase === 'writing' ? 'Writing…' : stale ? 'Update' : 'Show how to use'} icon="sparkle" variant="secondary" size="sm" loading={phase === 'writing'}
            disabled={left === 0} onPress={write} style={{ alignSelf: 'flex-start' }} />
          {left !== null ? <T size={12.5} tone="muted">{left === 0 ? (quota!.limit ? 'No usage look-ups left today.' : 'Not included in your plan.') : left + ' of ' + quota!.limit + ' left today'}</T> : null}
        </View>
      )}
      {err ? <T size={13} tone="danger">{err}</T> : null}
    </View>
  );
}

/** A link that opens "How to use" for a word right below it (Write a sentence, My mistakes, the chat's word cards). */
export function UsageToggle({ word }: { word: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, alignSelf: 'flex-start' }}>
        <Icon name={open ? 'x' : 'down'} size={16} color={t.primaryInk} />
        <T size={14} weight="bold" tone="primaryInk">How to use “{word}”</T>
      </Pressable>
      {open ? <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface }}><UsagePanel word={word} /></View> : null}
    </View>
  );
}
