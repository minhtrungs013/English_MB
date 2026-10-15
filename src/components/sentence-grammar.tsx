import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { GrammarView } from '../lib/api';
import { useTheme } from '../state/store';
import { Badge, Button, Icon, T } from './ui';

type Role = GrammarView['parts'][number]['role'];
const ROLE: Record<Role, string> = {
  S: 'Subject', V: 'Verb', O: 'Object', C: 'Complement', time: 'Time', place: 'Place', adv: 'Adverb', clause: 'Clause', other: ''
};
/** Lessons without drills (nothing to practise). */
const NO_PRACTICE = new Set(['aux-cheatsheet']);

/**
 * "Grammar" for one sentence: a toggle that opens its structure (subject / verb / object…), the tense with its formula
 * and time clues, the explanation and the lesson. Only given sentences the learner may see the answer of.
 */
export function SentenceGrammar({ g, practice = true }: { g: GrammarView | null | undefined; practice?: boolean }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  if (!g) return null;
  const roleColor: Record<Role, string> = {
    S: t.info, V: t.success, O: t.orange, C: t.orange, time: t.warning, place: t.warning, adv: t.primaryInk, clause: t.primaryInk, other: t.border
  };
  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }}>
      <Pressable onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={6}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, alignSelf: 'flex-start' }}>
        <Icon name="type" size={16} color={t.primaryInk} />
        <T size={13.5} weight="bold" tone="primaryInk">{open ? 'Hide grammar' : 'Grammar'}</T>
      </Pressable>
      {open ? (
        <View style={{ gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface2 }}>
          {g.parts.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityLabel={'Sentence structure: ' + g.parts.map((p) => (ROLE[p.role] ? ROLE[p.role] + ': ' : '') + p.text).join(', ')}>
              {g.parts.map((p, i) => (
                <View key={i} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: t.surface, borderBottomWidth: 3, borderBottomColor: roleColor[p.role] }}>
                  <T size={14} weight="bold">{p.text}</T>
                  {ROLE[p.role] ? <T size={10.5} weight="extrabold" style={{ color: roleColor[p.role], textTransform: 'uppercase', letterSpacing: 0.3 }}>{ROLE[p.role]}</T> : null}
                </View>
              ))}
            </View>
          ) : null}
          {g.lesson ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <Badge label={g.lesson.name} bg={t.infoSoft} fg={t.info} />
              <T size={13} tone="muted">{g.lesson.vi}</T>
            </View>
          ) : null}
          {g.formula ? (
            <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface }}>
              <T size={13} weight="bold">{g.formula}</T>
            </View>
          ) : null}
          {g.signals.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <T size={12} tone="muted">Time clues</T>
              {g.signals.map((s) => <Badge key={s} label={s} bg={t.surface} fg={t.text} />)}
            </View>
          ) : null}
          {g.explain ? <T size={13.5}>{g.explain}</T> : null}
          {g.notes.map((n, i) => <T key={i} size={13.5}>💡 {n.text}</T>)}
          {g.level === 'basic' && g.lesson ? <T size={12} tone="muted">Tense found automatically from the sentence pattern.</T> : null}
          {g.lesson ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Button title={'Open lesson: ' + g.lesson.name} icon="book" variant="secondary" size="sm" style={{ minHeight: 44 }}
                onPress={() => router.push({ pathname: '/grammar/[tense]', params: { tense: g.lesson!.id } })} />
              {practice && !NO_PRACTICE.has(g.lesson.id) ? (
                <Button title="Practise 10 questions" variant="ghost" size="sm" style={{ minHeight: 44 }}
                  onPress={() => router.push({ pathname: '/grammar/practice', params: { mode: g.lesson!.id } })} />
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
