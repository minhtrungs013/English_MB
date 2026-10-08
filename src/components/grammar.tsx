import { router } from 'expo-router';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { LESSON_IDS, LESSON_LABEL, TENSES, type GrammarTable, type LessonId, type Tense } from '../lib/api';
import type { Palette } from '../lib/theme';
import { useTheme } from '../state/store';
import { Progress } from './course';
import { Badge, Icon, T } from './ui';

/** True for one of the 7 tense ids (lesson links are only shown for those). */
export function isTense(s: string | undefined | null): s is Tense {
  return !!s && (TENSES as readonly string[]).includes(s);
}

/** True for any of the 12 grammar lesson ids (Foundations and tenses). */
export function isLesson(s: string | undefined | null): s is LessonId {
  return !!s && (LESSON_IDS as readonly string[]).includes(s);
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

/** Small link to a grammar lesson ("Learn this tense"). Renders nothing for an unknown lesson id. */
export function LessonLink({ lesson, title = 'Open the lesson' }: { lesson?: string; title?: string }) {
  const t = useTheme();
  if (!isLesson(lesson)) return null;
  return (
    <Pressable onPress={() => router.push({ pathname: '/grammar/[tense]', params: { tense: lesson } })} accessibilityRole="link"
      accessibilityLabel={title + ': ' + LESSON_LABEL[lesson]}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10, borderRadius: 10, alignSelf: 'flex-start', backgroundColor: pressed ? t.surface2 : 'transparent' })}>
      <Icon name="book" size={16} color={t.primaryInk} />
      <T size={13.5} weight="bold" tone="primaryInk">{title}</T>
    </Pressable>
  );
}

/** "Learn this tense" link for course questions: only for the 7 tenses (renders nothing otherwise). */
export function LearnTenseLink({ tense, title = 'Learn this tense' }: { tense?: string; title?: string }) {
  if (!isTense(tense)) return null;
  return <LessonLink lesson={tense} title={title} />;
}

const COL_MIN = 128;
type Row = GrammarTable['rows'][number];

/** Screen-reader text for one row: "Column: cell" pairs, plus where the row leads. */
function rowLabel(tb: GrammarTable, r: Row, link: LessonId | null): string {
  const parts = tb.columns.map((c, k) => (c ? c + ': ' : '') + (r.cells[k] ?? ''));
  if (r.label && r.label !== r.cells[0]) parts.unshift(r.label);
  return parts.join('. ') + (link ? '. Opens the lesson ' + LESSON_LABEL[link] : '');
}

/** The first cell (emphasised), with the row's label underneath when it says something else. */
function FirstCell({ r }: { r: Row }) {
  const first = r.cells[0] ?? r.label;
  return (
    <View style={{ gap: 2 }}>
      <T size={14} weight="extrabold">{first}</T>
      {r.label && r.label !== first ? <T size={12.5} tone="muted">{r.label}</T> : null}
    </View>
  );
}

/**
 * A conjugation table: a grid (scrolls sideways when it doesn't fit) with a header row and the first column
 * emphasised, or one card per row when the screen is too narrow for the columns. Rows with a `link` open that lesson.
 */
export function GrammarTableView({ table: tb }: { table: GrammarTable }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const cols = tb.columns.length || Math.max(0, ...tb.rows.map((r) => r.cells.length));
  const avail = width - 32;
  const grid = cols > 0 && cols * COL_MIN <= avail;
  const colW = grid ? Math.max(COL_MIN, Math.floor((avail - 2) / cols)) : COL_MIN;
  const open = (to: LessonId) => router.push({ pathname: '/grammar/[tense]', params: { tense: to } });

  const rowBody = (r: Row, link: LessonId | null) => grid ? (
    <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
      {Array.from({ length: cols }, (_, k) => (
        <View key={k} style={{ width: colW, padding: 10, justifyContent: 'center', backgroundColor: k === 0 ? t.surface2 : 'transparent', borderLeftWidth: k ? 1 : 0, borderLeftColor: t.border }}>
          {k === 0 ? <FirstCell r={r} /> : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <T size={14} style={{ flex: 1 }}>{r.cells[k] ?? ''}</T>
              {link && k === cols - 1 ? <Icon name="right" size={14} color={t.primaryInk} /> : null}
            </View>
          )}
        </View>
      ))}
    </View>
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
      <View style={{ flex: 1, gap: 6 }}>
        <FirstCell r={r} />
        {tb.columns.slice(1).map((c, k) => (
          <View key={k} style={{ gap: 1 }}>
            <T size={12} weight="bold" tone="muted">{c}</T>
            <T size={14}>{r.cells[k + 1] ?? ''}</T>
          </View>
        ))}
      </View>
      {link ? <Icon name="right" size={16} color={t.primaryInk} /> : null}
    </View>
  );

  const rows = tb.rows.map((r, i) => {
    const link = isLesson(r.link) ? r.link : null;
    const border = { borderTopWidth: grid || i ? 1 : 0, borderTopColor: t.border };
    return link ? (
      <Pressable key={i} onPress={() => open(link)} accessibilityRole="link" accessibilityLabel={rowLabel(tb, r, link)}
        style={({ pressed }) => [border, { minHeight: 44, backgroundColor: pressed ? t.primarySoft : 'transparent' }]}>
        {rowBody(r, link)}
      </Pressable>
    ) : (
      <View key={i} accessible accessibilityLabel={rowLabel(tb, r, null)} style={border}>{rowBody(r, null)}</View>
    );
  });

  return (
    <View style={{ gap: 8 }}>
      <View style={{ backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }}>
        {grid ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', backgroundColor: t.surface3 }}>
                {Array.from({ length: cols }, (_, k) => (
                  <View key={k} style={{ width: colW, paddingHorizontal: 10, paddingVertical: 8, borderLeftWidth: k ? 1 : 0, borderLeftColor: t.border }}>
                    <T size={12} weight="extrabold" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>{tb.columns[k] ?? ''}</T>
                  </View>
                ))}
              </View>
              {rows}
            </View>
          </ScrollView>
        ) : rows}
      </View>
      {tb.note ? <T size={13.5} tone="muted">{tb.note}</T> : null}
    </View>
  );
}
