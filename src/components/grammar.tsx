import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { TENSE_LABEL, TENSES, type Tense } from '../lib/api';
import type { Palette } from '../lib/theme';
import { useTheme } from '../state/store';
import { Progress } from './course';
import { Badge, Icon, T } from './ui';

/** True for one of the 7 tense ids (lesson links are only shown for those). */
export function isTense(s: string | undefined | null): s is Tense {
  return !!s && (TENSES as readonly string[]).includes(s);
}

/** New (0) · Learning (1–59) · Good (60–84) · Mastered (85+). */
export function masteryLabel(m: number): string {
  return m >= 85 ? 'Mastered' : m >= 60 ? 'Good' : m >= 1 ? 'Learning' : 'New';
}
/** Soft background and text color for a mastery level. */
export function masteryColors(m: number, t: Palette): [string, string] {
  return m >= 85 ? [t.successSoft, t.success] : m >= 60 ? [t.infoSoft, t.info] : m >= 1 ? [t.warningSoft, t.warning] : [t.surface2, t.muted];
}

/** "Learning · 40%" badge. */
export function MasteryBadge({ mastery }: { mastery: number }) {
  const t = useTheme();
  const [bg, fg] = masteryColors(mastery, t);
  return <Badge label={masteryLabel(mastery) + ' · ' + mastery + '%'} bg={bg} fg={fg} />;
}

/** Mastery bar with "% · label" underneath (not interactive; the parent describes it to screen readers). */
export function MasteryBar({ mastery }: { mastery: number }) {
  const t = useTheme();
  const [, fg] = masteryColors(mastery, t);
  return (
    <View style={{ gap: 4 }}>
      <Progress pct={mastery} color={mastery ? fg : t.surface3} />
      <T size={12.5} weight="bold" style={{ color: fg }}>{mastery}% · {masteryLabel(mastery)}</T>
    </View>
  );
}

/** Small "Learn this tense" link to a grammar lesson. Renders nothing for an unknown tense. */
export function LearnTenseLink({ tense, title = 'Learn this tense' }: { tense?: string; title?: string }) {
  const t = useTheme();
  if (!isTense(tense)) return null;
  return (
    <Pressable onPress={() => router.push({ pathname: '/grammar/[tense]', params: { tense } })} accessibilityRole="link"
      accessibilityLabel={title + ': ' + TENSE_LABEL[tense]}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10, borderRadius: 10, alignSelf: 'flex-start', backgroundColor: pressed ? t.surface2 : 'transparent' })}>
      <Icon name="book" size={16} color={t.primaryInk} />
      <T size={13.5} weight="bold" tone="primaryInk">{title}</T>
    </Pressable>
  );
}
