import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { CourseSummary, CourseWord } from '../lib/api';
import { speak } from '../lib/speech';
import { useTheme } from '../state/store';
import { Badge, Icon, IconButton, LevelBadge, T } from './ui';

export const WORDS_PER_DAY = [3, 4, 5, 6, 7, 8, 9, 10];

/** Thin progress bar (0–100). */
export function Progress({ pct, color, height = 6 }: { pct: number; color?: string; height?: number }) {
  const t = useTheme();
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <View style={{ height, borderRadius: 99, backgroundColor: t.surface3, overflow: 'hidden' }}>
      <View style={{ width: `${p}%` as const, height: '100%', backgroundColor: color ?? t.primary, borderRadius: 99 }} />
    </View>
  );
}

/** "Day 4 of 30 · 3 learned" for a learner, or '' when not joined. */
export function courseProgressLabel(c: CourseSummary): string {
  const e = c.enrollment;
  return e ? 'Day ' + e.currentDay + ' of ' + c.totalDays + ' · ' + e.learned.length + ' learned' : '';
}

/** One course in a list. The whole card is a single button (nothing tappable inside it). */
export function CourseCard({ c }: { c: CourseSummary }) {
  const t = useTheme();
  const e = c.enrollment;
  const owner = c.isOwner ? 'You' : c.ownerName;
  const label = courseProgressLabel(c);
  return (
    <Pressable onPress={() => router.push({ pathname: '/course/[id]', params: { id: c.id } })} accessibilityRole="button"
      accessibilityLabel={c.title + ', by ' + owner + ', ' + c.readyDays + ' of ' + c.totalDays + ' days ready' + (label ? ', ' + label : '')}
      style={({ pressed }) => ({ backgroundColor: pressed ? t.surface2 : t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="cap" size={22} color={t.primaryInk} />
        </View>
        <View style={{ flex: 1 }}>
          <T size={16.5} weight="extrabold" numberOfLines={2}>{c.title}</T>
          <T size={13} tone="muted" numberOfLines={1}>by {owner}</T>
        </View>
        <Icon name="right" size={16} color={t.faint} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <Badge label={c.readyDays + '/' + c.totalDays + ' days ready'} bg={t.surface2} fg={t.muted} />
        <Badge label={c.members + (c.members === 1 ? ' member' : ' members')} bg={t.surface2} fg={t.muted} />
        <Badge label={c.wordsPerDay + ' words/day'} bg={t.surface2} fg={t.muted} />
        {c.visibility === 'private' ? <Badge label="Private" bg={t.warningSoft} fg={t.warning} /> : null}
      </View>
      {e ? (
        <View style={{ gap: 6 }}>
          <Progress pct={(e.learned.length / c.totalDays) * 100} />
          <T size={13} weight="semibold" tone="muted">{label}</T>
        </View>
      ) : null}
    </Pressable>
  );
}

/** A course word's details, with a speak button and optional actions on the right. */
export function CourseWordCard({ w, right, children }: { w: CourseWord; right?: ReactNode; children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <T size={18} weight="extrabold">{w.word}</T>
            <LevelBadge level={w.level} />
          </View>
          {w.ipa ? <T ipa size={13} tone="muted">{w.ipa}</T> : null}
        </View>
        <IconButton name="volume" label={'Play ' + w.word} color={t.primaryInk} onPress={() => speak(w.word)} />
        {right}
      </View>
      {w.vi ? <T weight="semibold">{w.vi}</T> : null}
      {w.meaning ? <T size={13.5} tone="muted">{w.meaning}</T> : null}
      {w.ex ? <T size={13.5} style={{ fontStyle: 'italic' }}>“{w.ex}”</T> : null}
      {children}
    </View>
  );
}
