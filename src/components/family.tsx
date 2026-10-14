import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View, ActivityIndicator } from 'react-native';
import { api, type FamilyStatusItem } from '../lib/api';
import { FAMILY_MAX, FAMILY_POS, type FamilyMember, type FamilyPos } from '../lib/data';
import { speak } from '../lib/speech';
import { useStore, useTheme } from '../state/store';
import { Badge, Button, Card, Field, Icon, IconButton, Input, PosBadge, SectionTitle, T } from './ui';

/** Any part of speech → one of the five family groups. */
export function famPos(pos: string | undefined): FamilyPos {
  return (FAMILY_POS as string[]).includes(pos ?? '') ? (pos as FamilyPos) : 'Other';
}

/** Members ordered Verb → Noun → Adjective → Adverb → Other (stable within a group). */
export function sortFamily(family: FamilyMember[]): FamilyMember[] {
  return family
    .map((m, i) => ({ m, i, g: FAMILY_POS.indexOf(famPos(m.pos)) }))
    .sort((a, b) => a.g - b.g || a.i - b.i)
    .map((x) => x.m);
}

/** Number of other forms (members minus the word itself); 0 when there's no family. */
export function familyExtra(family: FamilyMember[] | undefined): number {
  return family && family.length >= 2 ? family.length - 1 : 0;
}

/** Small muted "+N forms" tag shown next to a word in lists. */
export function FormsTag({ family }: { family?: FamilyMember[] }) {
  const n = familyExtra(family);
  if (!n) return null;
  return <T size={12} weight="semibold" tone="faint">+{n} {n === 1 ? 'form' : 'forms'}</T>;
}

/**
 * "Word family" section for a word's detail screen. Looks up (once) which members are in the library or already
 * in my words, so each row can offer Save / "In your words". `compact` (learn cards): rows only, no lookups.
 */
const POS_SHORT: Record<string, string> = { Noun: 'n', Verb: 'v', Adjective: 'adj', Adverb: 'adv', Other: '—' };

export function WordFamily({ word, family, compact = false }: { word: string; family?: FamilyMember[]; compact?: boolean }) {
  const { data, actions } = useStore();
  const t = useTheme();
  const [status, setStatus] = useState<Record<string, FamilyStatusItem>>({});
  const [saving, setSaving] = useState('');
  const self = word.trim().toLowerCase();
  const members = family && family.length >= 2 ? sortFamily(family) : [];
  const others = [...new Set(members.map((m) => m.word.trim().toLowerCase()).filter((x) => x && x !== self))].slice(0, 10);
  const key = others.join('|');

  useEffect(() => {
    if (compact || !key) return;
    let live = true;
    api.familyStatus(key.split('|'))
      .then((r) => {
        if (!live) return;
        const m: Record<string, FamilyStatusItem> = {};
        for (const it of r.items) m[it.word.toLowerCase()] = it;
        setStatus(m);
      })
      .catch(() => { /* offline: rows just show no action */ });
    return () => { live = false; };
  }, [key, compact]);

  if (!members.length) return null;

  const rows = members.map((m, i) => {
    const lower = m.word.trim().toLowerCase();
    const isSelf = lower === self;
    const st = status[lower];
    const mineId = data.words.find((x) => x.word.toLowerCase() === lower)?.id ?? st?.myWordId ?? null;
    const save = async () => {
      if (!st?.libraryId || saving) return;
      setSaving(lower);
      await actions.saveFromLibrary({ id: st.libraryId, word: m.word });
      setSaving('');
    };
    // Small round action: + (save from the library) or ✓ (already in your words, opens it).
    let action = null;
    if (!isSelf && !compact) {
      if (mineId) {
        action = <IconButton name="check" label={'Open ' + m.word + ' in your words'} color={t.success} onPress={() => router.push({ pathname: '/word/[id]', params: { id: mineId } })} />;
      } else if (st?.libraryId) {
        action = saving === lower ? <ActivityIndicator style={{ width: 44 }} color={t.primaryInk} />
          : <IconButton name="plus" label={'Save ' + m.word + ' to your words'} color={t.primaryInk} onPress={save} />;
      }
    }
    const posColor = m.pos === 'Noun' ? t.info : m.pos === 'Verb' ? t.success : m.pos === 'Adjective' ? t.orange ?? t.warning : t.primaryInk;
    return (
      <View key={lower + i} accessibilityLabel={(isSelf ? 'This word: ' : '') + m.word + ', ' + m.pos + (m.vi ? ', ' + m.vi : '')} style={{
        borderTopWidth: i ? 1 : 0, borderTopColor: t.border, borderLeftWidth: 3, borderLeftColor: isSelf ? t.primary : 'transparent',
        backgroundColor: isSelf ? t.primarySoft : 'transparent', paddingLeft: 10, paddingVertical: compact ? 6 : 8,
        flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'stretch'
      }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 6 }}>
            <T size={11.5} weight="extrabold" style={{ color: posColor, minWidth: 26 }}>{POS_SHORT[famPos(m.pos)]}</T>
            <T size={compact ? 15 : 16} weight="extrabold" tone={isSelf ? 'primaryInk' : 'text'}>{m.word}</T>
            {m.vi ? <T size={13.5} tone="muted" style={{ flexShrink: 1 }}>· {m.vi}</T> : null}
          </View>
          {m.note ? <T size={11.5} tone="faint" style={{ fontStyle: 'italic', paddingLeft: 32 }}>{m.note}</T> : null}
          {m.ex && !compact ? <T size={13} tone="muted" style={{ paddingLeft: 32 }}>{m.ex}</T> : null}
        </View>
        <IconButton name="volume" label={'Play ' + m.word} color={t.muted} onPress={() => speak(m.word)} />
        {action}
      </View>
    );
  });

  if (compact) {
    return (
      <View style={{ alignSelf: 'stretch', gap: 6 }}>
        <SectionTitle>Word family</SectionTitle>
        {rows}
      </View>
    );
  }
  return (
    <Card style={{ gap: 6 }}>
      <SectionTitle>Word family</SectionTitle>
      <View style={{ marginHorizontal: -4 }}>{rows}</View>
    </Card>
  );
}

const blank = (): FamilyMember => ({ word: '', pos: 'Noun', vi: '', ex: '' });

/** Trimmed members with a word; adds the word itself if missing; [] when fewer than 2 remain. */
export function cleanFamily(list: FamilyMember[], self: { word: string; pos: string; vi: string }): FamilyMember[] {
  const out: FamilyMember[] = [];
  for (const m of list) {
    const word = m.word.trim();
    if (!word || out.some((x) => x.word.toLowerCase() === word.toLowerCase() && x.pos === famPos(m.pos))) continue;
    const x: FamilyMember = { word: word.slice(0, 40), pos: famPos(m.pos), vi: m.vi.trim().slice(0, 80) };
    if (m.ex?.trim()) x.ex = m.ex.trim().slice(0, 160);
    if (m.note?.trim()) x.note = m.note.trim().slice(0, 30);
    out.push(x);
  }
  const w = self.word.trim();
  if (out.length && w && !out.some((x) => x.word.toLowerCase() === w.toLowerCase())) {
    out.unshift({ word: w.slice(0, 40), pos: famPos(self.pos), vi: self.vi.trim().slice(0, 80) });
  }
  return out.length >= 2 ? out.slice(0, FAMILY_MAX) : [];
}

/** Collapsible "Word family" editor for the add/edit word form. */
export function FamilyEditor({ value, onChange, word, pos, vi }: {
  value: FamilyMember[]; onChange: (v: FamilyMember[]) => void; word: string; pos: string; vi: string;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(value.length > 0);
  // Open by itself when members arrive (e.g. auto-fill).
  const prev = useRef(value.length);
  useEffect(() => {
    if (value.length > 0 && prev.current === 0) setOpen(true);
    prev.current = value.length;
  }, [value.length]);

  const set = (i: number, p: Partial<FamilyMember>) => onChange(value.map((m, k) => (k === i ? { ...m, ...p } : m)));
  const add = () => {
    if (value.length >= FAMILY_MAX) return;
    // Starting a family: begin with the word itself, then an empty row.
    if (!value.length && word.trim()) onChange([{ word: word.trim(), pos: famPos(pos), vi: vi.trim().slice(0, 80), ex: '' }, blank()]);
    else onChange([...value, blank()]);
  };
  const filled = value.filter((m) => m.word.trim()).length;

  return (
    <Card style={{ gap: 12 }}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={'Word family, ' + (filled ? filled + ' forms' : 'none') + (open ? ', collapse' : ', expand')}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <T size={13.5} weight="bold">Word family</T>
          <T size={12.5} tone="muted">{filled ? filled + ' forms · ' : ''}Related forms, e.g. decide → decision, decisive</T>
        </View>
        <Icon name={open ? 'down' : 'right'} size={18} color={t.muted} />
      </Pressable>
      {open ? (
        <>
          {value.map((m, i) => (
            <View key={i} style={{ gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <T size={12.5} weight="extrabold" tone="muted" style={{ flex: 1 }}>FORM {i + 1}</T>
                <IconButton name="trash" tone="danger" label={'Remove form ' + (i + 1) + (m.word ? ' ' + m.word : '')} onPress={() => onChange(value.filter((_, k) => k !== i))} />
              </View>
              <Field label="Word">
                <Input value={m.word} onChangeText={(v) => set(i, { word: v })} placeholder="e.g. decision" autoCapitalize="none" autoCorrect={false} maxLength={40} accessibilityLabel={'Form ' + (i + 1) + ' word'} />
              </Field>
              <Field label="Part of speech">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {FAMILY_POS.map((p) => {
                    const on = famPos(m.pos) === p;
                    return (
                      <Pressable key={p} onPress={() => set(i, { pos: p })} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={p}
                        style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1, justifyContent: 'center',
                          borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : t.surface }}>
                        <T size={13} weight="bold" style={{ color: on ? t.primaryInk : t.muted }}>{p}</T>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>
              <Field label="Vietnamese">
                <Input value={m.vi} onChangeText={(v) => set(i, { vi: v })} placeholder="quyết định" maxLength={80} accessibilityLabel={'Form ' + (i + 1) + ' Vietnamese'} />
              </Field>
              <Field label="Example (optional)">
                <Input value={m.ex ?? ''} onChangeText={(v) => set(i, { ex: v })} placeholder="She made a quick decision." maxLength={160} multiline accessibilityLabel={'Form ' + (i + 1) + ' example'} />
              </Field>
            </View>
          ))}
          <Button title={value.length >= FAMILY_MAX ? 'Up to ' + FAMILY_MAX + ' forms' : 'Add a form'} icon="plus" variant="secondary" disabled={value.length >= FAMILY_MAX} onPress={add} />
          {value.length ? <T size={12.5} tone="muted">Include the word itself. Leave rows empty to skip them; a family needs at least 2 forms.</T> : null}
        </>
      ) : null}
    </Card>
  );
}
