import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { GrammarView } from '../lib/api';
import { useTheme } from '../state/store';
import { Button, Icon, T } from './ui';

type Role = GrammarView['parts'][number]['role'];
const ROLE: Record<Role, string> = {
  S: 'Subject', V: 'Verb', O: 'Object', C: 'Complement', time: 'Time', place: 'Place', adv: 'Adverb', clause: 'Clause', other: ''
};
/** Lessons without drills (nothing to practise). */
const NO_PRACTICE = new Set(['aux-cheatsheet']);

function Label({ children }: { children: string }) {
  return <T size={11} weight="extrabold" tone="faint" style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{children}</T>;
}

/**
 * "Grammar" for one sentence: a toggle that opens a card with the tense, the sentence split into parts (or with its
 * time clues highlighted), the formula, the explanation and the lesson. Only given sentences the learner may see the
 * answer of.
 */
export function SentenceGrammar({ g, practice = true }: { g: GrammarView | null | undefined; practice?: boolean }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  if (!g) return null;
  // Text and soft background per role (the same pairs as the web app).
  const tint: Record<Role | 'aux', [string, string]> = {
    S: [t.info, t.infoSoft], V: [t.success, t.successSoft], O: [t.orange, t.orangeSoft], C: [t.orange, t.orangeSoft],
    time: [t.warning, t.warningSoft], place: [t.warning, t.warningSoft], adv: [t.primaryInk, t.primarySoft], clause: [t.primaryInk, t.primarySoft],
    other: [t.text, t.surface2], aux: [t.text, t.surface2]
  };
  const notes = [...(g.explain ? [g.explain] : []), ...g.notes.map((n) => n.text)];
  // The sentence cut around its time clues, for highlighting when it has no parts.
  const marked = g.signals.length
    ? g.text.split(new RegExp('(' + g.signals.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi'))
    : [g.text];
  const pieces = g.formula ? g.formula.split(/\s\+\s/).map((p) => p.trim()) : [];

  return (
    <View style={{ gap: 10, alignSelf: 'stretch' }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel="Grammar of this sentence"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 12, borderRadius: 999,
          borderWidth: 1, borderColor: pressed ? t.primary : t.bar, backgroundColor: t.primarySoft })}>
        <Icon name="type" size={15} color={t.primaryInk} />
        <T size={13} weight="bold" tone="primaryInk">Grammar</T>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><Icon name="down" size={15} color={t.primaryInk} /></View>
      </Pressable>

      {open ? (
        <View style={{ gap: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: t.border, borderTopWidth: 4, borderTopColor: t.primary, backgroundColor: t.surface }}>
          {g.lesson ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <Icon name="clock" size={16} color={t.primaryInk} />
              <T size={16} weight="extrabold" tone="primaryInk">{g.lesson.name}</T>
              <T size={14} weight="semibold" tone="muted">{g.lesson.vi}</T>
              {g.label ? <T size={14} weight="semibold" tone="muted">· {g.label}</T> : null}
              {g.level === 'basic' ? (
                <View style={{ marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: t.border }} accessibilityLabel="Found from the sentence pattern">
                  <T size={10.5} weight="extrabold" tone="faint" style={{ letterSpacing: 0.5 }}>AUTO</T>
                </View>
              ) : null}
            </View>
          ) : g.label ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="type" size={16} color={t.primaryInk} />
              <T size={16} weight="extrabold" tone="primaryInk" style={{ flex: 1 }}>{g.label}</T>
            </View>
          ) : null}

          {g.parts.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 6, rowGap: 10 }} accessibilityLabel={'Sentence structure: ' + g.parts.map((p) => (ROLE[p.role] ? ROLE[p.role] + ': ' : '') + p.text).join(', ')}>
              {g.parts.map((p, i) => (
                <View key={i} style={{ alignItems: 'center', gap: 4, maxWidth: '100%' }}>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: tint[p.role][1] }}>
                    <T size={15} weight="bold" style={{ color: tint[p.role][0] }}>{p.text}</T>
                  </View>
                  <T size={10.5} weight="extrabold" style={{ color: ROLE[p.role] ? tint[p.role][0] : 'transparent', textTransform: 'uppercase', letterSpacing: 0.5 }}>{ROLE[p.role] || ' '}</T>
                </View>
              ))}
            </View>
          ) : (
            <T size={16} weight="semibold" style={{ lineHeight: 26 }}>
              {marked.map((p, i) => (i % 2 ? <T key={i} size={16} weight="extrabold" style={{ color: t.warning, backgroundColor: t.warningSoft }}> {p} </T> : p))}
            </T>
          )}

          {pieces.length ? (
            <View style={{ gap: 6 }} accessible accessibilityLabel={'Formula: ' + g.formula}>
              <Label>Formula</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                {pieces.map((p, i) => {
                  const kind = /^S\b/.test(p) ? 'S' : /^V/.test(p) ? 'V' : 'aux';
                  const m = /^(.*?)(\s*\(.*\))?$/.exec(p)!;
                  return (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {i > 0 ? <T size={14} weight="extrabold" tone="faint">+</T> : null}
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: tint[kind][1] }}>
                        <T size={14} weight="extrabold" style={{ color: tint[kind][0] }}>{m[1]}</T>
                        {m[2] ? <T size={12} tone="muted">{m[2].trim()}</T> : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          {g.signals.length && g.parts.length ? (
            <View style={{ gap: 6 }}>
              <Label>Time clues</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {g.signals.map((s) => (
                  <View key={s} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: t.warningSoft }}>
                    <T size={13} weight="bold" style={{ color: t.warning }}>{s}</T>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {notes.length ? (
            <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: t.warningSoft }}>
              <T size={16}>💡</T>
              <View style={{ flex: 1, gap: 4 }}>{notes.map((n, i) => <T key={i} size={14}>{n}</T>)}</View>
            </View>
          ) : null}

          {g.lesson ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.border }}>
              <Button title="Open lesson" icon="book" size="sm" style={{ minHeight: 44 }}
                onPress={() => router.push({ pathname: '/grammar/[tense]', params: { tense: g.lesson!.id } })} />
              {practice && !NO_PRACTICE.has(g.lesson.id) ? (
                <Button title="Practise 10" icon="zap" variant="secondary" size="sm" style={{ minHeight: 44 }}
                  onPress={() => router.push({ pathname: '/grammar/practice', params: { mode: g.lesson!.id } })} />
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
