import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { Style } from '../lib/data';
import type { IconName } from '../lib/icons';
import { tilesFor, type Theme, type TileKey } from '../lib/theme';
import { seasonAt, SEASON_LINE, type Season } from '../lib/season';
import { useStore, useTheme } from '../state/store';
import { Button, DuoIcon, T } from './ui';

/* ---------- greeting banner ---------- */

const LINES = [
  'A few words a day add up to a whole language.',
  'Small steps every day beat one big push.',
  'Every review makes a word stick a little longer.',
  'You are closer to fluent than yesterday.',
  'Five minutes now is worth an hour next week.',
  'Mistakes are how new words find their place.',
  'Keep the streak warm — one lesson is enough.',
  'Read it, say it, use it: that is how words stay.'
];
/** A motivating line that stays the same for the whole day. */
export function lineOfDay(now: number): string {
  const d = new Date(now);
  const n = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  return LINES[n % LINES.length];
}

/** Scene per style, drawn from the theme tokens so it follows light/dark. Decorative only. */
function Illustration({ style, t, size }: { style: Style; t: Theme; size: number }) {
  const ink = t.primary, soft = t.surface, mid = t.bar, warm = t.warning, line = t.primaryInk;
  let scene: ReactNode;
  switch (style) {
    case 'warm':
      scene = (
        <G>
          <Rect x={8} y={58} width={46} height={32} rx={4} fill={soft} stroke={mid} strokeWidth={2} />
          <Line x1={16} y1={68} x2={46} y2={68} stroke={mid} strokeWidth={2} />
          <Line x1={16} y1={76} x2={40} y2={76} stroke={mid} strokeWidth={2} />
          <Path d="M62 50 h36 v26 a14 14 0 0 1 -14 14 h-8 a14 14 0 0 1 -14 -14 z" fill={ink} />
          <Path d="M98 56 a8 8 0 0 1 0 16" fill="none" stroke={ink} strokeWidth={4} />
          <Path d="M72 42 q-4 -8 0 -14 q4 -6 0 -12 M84 42 q-4 -8 0 -14 q4 -6 0 -12" fill="none" stroke={mid} strokeWidth={2.5} strokeLinecap="round" />
          <Path d="M20 20 l4 8 l8 -2 l-4 6 l6 4 l-8 1 l1 8 l-7 -5 l-7 5 l1 -8 l-8 -1 l6 -4 l-4 -6 l8 2 z" fill={warm} opacity={0.85} />
          <Path d="M104 14 l3 6 l6 -1 l-3 4 l4 3 l-6 1 l1 6 l-5 -4 l-5 4 l1 -6 l-6 -1 l4 -3 l-3 -4 l6 1 z" fill={t.orange} opacity={0.8} />
        </G>
      );
      break;
    case 'ocean':
      scene = (
        <G>
          <Circle cx={92} cy={24} r={13} fill={warm} opacity={0.9} />
          <Path d="M36 62 h44 l-8 12 h-28 z" fill={soft} stroke={ink} strokeWidth={2} />
          <Path d="M58 62 v-30 l18 26 z" fill={ink} />
          <Path d="M0 80 q15 -10 30 0 t30 0 t30 0 t30 0 v20 h-120 z" fill={mid} />
          <Path d="M0 90 q15 -8 30 0 t30 0 t30 0 t30 0 v10 h-120 z" fill={ink} opacity={0.75} />
        </G>
      );
      break;
    case 'sakura':
      scene = (
        <G>
          <Path d="M118 8 q-30 10 -52 34 q-14 16 -36 22" fill="none" stroke={line} strokeWidth={4} strokeLinecap="round" />
          <Path d="M82 28 q-6 -14 -20 -16" fill="none" stroke={line} strokeWidth={3} strokeLinecap="round" />
          {[[64, 40], [92, 22], [40, 58], [60, 14]].map(([x, y], i) => (
            <G key={i}>
              {[0, 72, 144, 216, 288].map((a) => (
                <Ellipse key={a} cx={x} cy={y - 6} rx={4.5} ry={7} fill={mid} transform={`rotate(${a} ${x} ${y})`} />
              ))}
              <Circle cx={x} cy={y} r={3} fill={ink} />
            </G>
          ))}
          <Ellipse cx={30} cy={84} rx={4} ry={6} fill={mid} transform="rotate(30 30 84)" />
          <Ellipse cx={86} cy={78} rx={4} ry={6} fill={mid} transform="rotate(-40 86 78)" />
          <Ellipse cx={104} cy={92} rx={3.5} ry={5} fill={ink} opacity={0.6} transform="rotate(60 104 92)" />
        </G>
      );
      break;
    case 'midnight':
      scene = (
        <G>
          <Path d="M40 10 a22 22 0 1 0 20 30 a18 18 0 1 1 -20 -30 z" fill={warm} />
          {[[82, 14], [104, 30], [70, 34], [14, 18]].map(([x, y], i) => (
            <Path key={i} d={`M${x} ${y - 5} l1.5 3.5 l3.5 1.5 l-3.5 1.5 l-1.5 3.5 l-1.5 -3.5 l-3.5 -1.5 l3.5 -1.5 z`} fill={line} />
          ))}
          <Rect x={8} y={88} width={104} height={6} rx={3} fill={mid} />
          <Rect x={86} y={84} width={20} height={4} rx={2} fill={ink} />
          <Line x1={96} y1={84} x2={84} y2={62} stroke={ink} strokeWidth={4} strokeLinecap="round" />
          <Line x1={84} y1={62} x2={98} y2={50} stroke={ink} strokeWidth={4} strokeLinecap="round" />
          <Path d="M90 46 l18 -4 l2 14 z" fill={ink} />
          <Path d="M104 56 l-10 30 h30 z" fill={warm} opacity={0.25} />
        </G>
      );
      break;
    case 'mono':
      scene = (
        <G>
          <Rect x={20} y={74} width={64} height={12} rx={2} fill={ink} />
          <Rect x={26} y={62} width={56} height={12} rx={2} fill={mid} />
          <Rect x={18} y={50} width={60} height={12} rx={2} fill={t.muted} />
          <Circle cx={96} cy={30} r={16} fill="none" stroke={ink} strokeWidth={3} />
          <Path d="M28 14 l16 28 h-32 z" fill={mid} />
          <Rect x={92} y={60} width={20} height={20} fill="none" stroke={t.muted} strokeWidth={3} />
        </G>
      );
      break;
    case 'aurora':
      scene = (
        <G>
          {[[82, 4], [104, 20], [16, 10], [60, 6]].map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={1.6} fill={line} />)}
          <Path d="M0 40 q20 -26 40 -10 t40 -6 t40 -16" fill="none" stroke={t.success} strokeWidth={7} strokeLinecap="round" opacity={0.75} />
          <Path d="M0 52 q24 -22 46 -8 t40 -8 t34 -12" fill="none" stroke={t.info} strokeWidth={5} strokeLinecap="round" opacity={0.7} />
          <Path d="M6 62 q22 -16 44 -6 t40 -6 t30 -8" fill="none" stroke={line} strokeWidth={3} strokeLinecap="round" opacity={0.6} />
          <Path d="M0 100 l28 -34 l16 16 l22 -28 l26 30 l12 -10 l16 26 z" fill={ink} />
          <Path d="M66 54 l9 10 l-6 -2 l-4 6 l-4 -5 z M28 66 l6 7 l-4 -1 l-3 4 l-2 -4 z" fill={soft} />
        </G>
      );
      break;
    case 'royal':
      scene = (
        <G>
          <Path d="M22 92 q-14 -16 -8 -40 M98 92 q14 -16 8 -40" fill="none" stroke={t.success} strokeWidth={2.5} strokeLinecap="round" />
          {[[14, 80, -40], [10, 66, -20], [12, 54, 0], [106, 80, 40], [110, 66, 20], [108, 54, 0]].map(([x, y, a], i) => (
            <Ellipse key={i} cx={x} cy={y} rx={3.5} ry={7} fill={t.success} opacity={0.85} transform={`rotate(${a} ${x} ${y})`} />
          ))}
          <Path d="M46 52 h28 v8 a14 14 0 0 1 -28 0 z" fill={mid} stroke={warm} strokeWidth={2} />
          <Path d="M46 54 a6 6 0 0 1 -6 -8 M74 54 a6 6 0 0 0 6 -8" fill="none" stroke={warm} strokeWidth={2.5} />
          <Rect x={56} y={72} width={8} height={10} fill={warm} />
          <Rect x={46} y={82} width={28} height={8} rx={2} fill={ink} />
          <Path d="M40 36 l8 -18 l12 12 l12 -12 l8 18 z" fill={mid} stroke={warm} strokeWidth={2} strokeLinejoin="round" />
          <Circle cx={48} cy={16} r={3} fill={warm} /><Circle cx={60} cy={28} r={3} fill={warm} /><Circle cx={72} cy={16} r={3} fill={warm} />
        </G>
      );
      break;
    default: // classic
      scene = (
        <G>
          <Path d="M60 52 q-22 -10 -48 -4 v40 q26 -6 48 4 z" fill={soft} stroke={ink} strokeWidth={2} />
          <Path d="M60 52 q22 -10 48 -4 v40 q-26 -6 -48 4 z" fill={soft} stroke={ink} strokeWidth={2} />
          <Line x1={60} y1={52} x2={60} y2={92} stroke={ink} strokeWidth={2} />
          <Line x1={20} y1={60} x2={50} y2={60} stroke={mid} strokeWidth={2} />
          <Line x1={20} y1={68} x2={46} y2={68} stroke={mid} strokeWidth={2} />
          <Line x1={70} y1={60} x2={100} y2={60} stroke={mid} strokeWidth={2} />
          <Path d="M88 40 l20 -30 l6 4 l-20 30 l-8 3 z" fill={warm} />
          <SvgText x={18} y={30} fontSize={18} fontWeight="bold" fill={ink}>A</SvgText>
          <SvgText x={44} y={18} fontSize={14} fontWeight="bold" fill={line}>b</SvgText>
          <SvgText x={66} y={34} fontSize={16} fontWeight="bold" fill={mid}>c</SvgText>
        </G>
      );
  }
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden pointerEvents="none">
      <Svg width={size} height={size * (100 / 120)} viewBox="0 0 120 100">{scene}</Svg>
    </View>
  );
}

/* ---------- seasonal decorations (level L, layered on any style) ---------- */

/** The season to decorate for right now, or null when off (Settings) or out of season. */
function useSeason(): Season {
  const { seasonal } = useStore();
  return seasonal ? seasonAt(Date.now()) : null;
}

/** Small static scene for the banner corner: lanterns + apricot blossoms, lantern + moon, snowflakes + pine, confetti. */
function SeasonArt({ season, t }: { season: Exclude<Season, null>; t: Theme }) {
  const red = t.danger, gold = t.warning;
  const lantern = (x: number, y: number, s: number, c: string) => (
    <G key={x + '-' + y} transform={`translate(${x} ${y}) scale(${s})`}>
      <Line x1={0} y1={-14} x2={0} y2={-6} stroke={gold} strokeWidth={1.5} />
      <Ellipse cx={0} cy={4} rx={9} ry={11} fill={c} />
      <Rect x={-5} y={-8} width={10} height={3} rx={1} fill={gold} />
      <Rect x={-5} y={13} width={10} height={3} rx={1} fill={gold} />
      <Line x1={0} y1={16} x2={0} y2={24} stroke={gold} strokeWidth={1.5} />
    </G>
  );
  const flake = (x: number, y: number, r: number) => (
    <Path key={x + '-' + y} d={`M${x - r} ${y}h${2 * r}M${x} ${y - r}v${2 * r}M${x - r * 0.7} ${y - r * 0.7}l${1.4 * r} ${1.4 * r}M${x + r * 0.7} ${y - r * 0.7}l${-1.4 * r} ${1.4 * r}`}
      stroke={t.info} strokeWidth={1.6} strokeLinecap="round" />
  );
  let art: ReactNode;
  switch (season) {
    case 'tet':
      art = (
        <G>
          {lantern(52, 16, 1, red)}{lantern(30, 10, 0.75, red)}
          {[[10, 44], [22, 56], [6, 62]].map(([x, y], i) => (
            <G key={i}>{[0, 72, 144, 216, 288].map((a) => <Ellipse key={a} cx={x} cy={y - 4} rx={3} ry={4.5} fill={gold} transform={`rotate(${a} ${x} ${y})`} />)}
              <Circle cx={x} cy={y} r={1.8} fill={red} /></G>
          ))}
        </G>
      );
      break;
    case 'midautumn':
      art = <G><Circle cx={46} cy={18} r={14} fill={gold} opacity={0.9} /><Circle cx={41} cy={14} r={2.5} fill={t.surface} opacity={0.5} />{lantern(18, 30, 0.9, red)}</G>;
      break;
    case 'christmas':
      art = (
        <G>
          {flake(12, 12, 5)}{flake(40, 8, 4)}{flake(58, 30, 3.5)}{flake(24, 34, 3)}
          <Path d="M30 64 l24 -14" stroke={t.success} strokeWidth={2.5} strokeLinecap="round" />
          {[0, 1, 2, 3, 4].map((i) => <Path key={i} d={`M${32 + i * 5} ${63 - i * 3} l-3 -7 M${32 + i * 5} ${63 - i * 3} l4 5`} stroke={t.success} strokeWidth={1.6} strokeLinecap="round" />)}
          <Circle cx={50} cy={54} r={2.6} fill={red} />
        </G>
      );
      break;
    default: // newyear
      art = (
        <G>
          {[[8, 10, red], [26, 6, gold], [44, 14, t.info], [58, 6, t.success], [16, 30, gold], [36, 28, t.info], [54, 34, red], [28, 48, t.success], [48, 52, gold]].map(([x, y, c], i) => (
            <Rect key={i} x={x as number} y={y as number} width={5} height={3} rx={1} fill={c as string} transform={`rotate(${i * 40} ${x} ${y})`} />
          ))}
        </G>
      );
  }
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
      style={{ position: 'absolute', top: 0, right: 0 }}>
      <Svg width={64} height={68} viewBox="0 0 64 68">{art}</Svg>
    </View>
  );
}

export interface NextStep { label: string; go: () => void }

/** Greeting, line of the day, "Continue learning" and a small stat, with the style's scene on the right. */
export function GreetingBanner({ greeting, next, stat }: { greeting: string; next: NextStep; stat: string }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const art = width < 360 ? 84 : 112;
  const season = useSeason();
  return (
    <View style={{ backgroundColor: t.primarySoft, borderRadius: t.radius.lg, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
      <View style={{ flex: 1, gap: 6 }}>
        <T size={21} weight="extrabold" style={{ letterSpacing: -0.4 }} numberOfLines={2}>{greeting}</T>
        <T size={13.5} tone="muted" numberOfLines={2}>{season ? SEASON_LINE[season] : lineOfDay(Date.now())}</T>
        <T size={13} weight="bold" tone="primaryInk">{stat}</T>
        <Button title="Continue learning" icon="right" size="sm" onPress={next.go}
          accessibilityLabel={'Continue learning: ' + next.label} style={{ alignSelf: 'flex-start', minHeight: 44, marginTop: 4 }} />
      </View>
      <Illustration style={t.style} t={t} size={art} />
      {season ? <SeasonArt season={season} t={t} /> : null}
    </View>
  );
}

/* ---------- background decoration ---------- */

/** A few large faint shapes behind the Home content (static, never touchable, hidden from screen readers). */
export function HomeDecor() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const season = useSeason();
  if (t.style === 'mono' && !season) return null;
  const c = t.primary;
  const leaf = 'l6 12 l12 -3 l-6 9 l9 6 l-12 1 l1 12 l-10 -7 l-10 7 l1 -12 l-12 -1 l9 -6 l-6 -9 l12 3 z';
  const spots: [number, number, number][] = [[0.88, 40, 1.4], [0.08, 300, 1], [0.92, 520, 1.2], [0.15, 760, 0.9], [0.8, 980, 1.1]];
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
      style={{ position: 'absolute', top: 0, left: -16, right: -16, height: 1200 }}>
      <Svg width={width} height={1200} opacity={0.1}>
        {spots.map(([fx, y, s], i) => {
          const x = fx * width;
          // Seasonal pattern replaces the style's one (snow at Christmas, confetti at New Year, gold sparks for Tết/Mid-Autumn).
          if (season === 'christmas') return <Path key={i} d={`M${x - 12 * s} ${y}h${24 * s}M${x} ${y - 12 * s}v${24 * s}M${x - 8 * s} ${y - 8 * s}l${16 * s} ${16 * s}M${x + 8 * s} ${y - 8 * s}l${-16 * s} ${16 * s}`} stroke={t.info} strokeWidth={3} strokeLinecap="round" />;
          if (season === 'newyear') return <Rect key={i} x={x} y={y} width={18 * s} height={9 * s} rx={2} fill={[t.danger, t.warning, t.info, t.success][i % 4]} transform={`rotate(${i * 33} ${x} ${y})`} />;
          if (season) return <Circle key={i} cx={x} cy={y} r={14 * s} fill={i % 2 ? t.warning : t.danger} />;
          switch (t.style) {
            case 'warm': return <Path key={i} d={'M0 0 ' + leaf} fill={c} transform={`translate(${x} ${y}) scale(${s}) rotate(${i * 37})`} />;
            case 'sakura': return <Ellipse key={i} cx={x} cy={y} rx={9 * s} ry={15 * s} fill={c} transform={`rotate(${i * 50} ${x} ${y})`} />;
            case 'ocean': return i % 2
              ? <Path key={i} d={`M${x - 60} ${y} q15 -10 30 0 t30 0 t30 0 t30 0`} fill="none" stroke={c} strokeWidth={4} />
              : <Circle key={i} cx={x} cy={y} r={18 * s} fill="none" stroke={c} strokeWidth={4} />;
            case 'midnight': return <Path key={i} d={`M${x} ${y - 10 * s} l${3 * s} ${7 * s} l${7 * s} ${3 * s} l${-7 * s} ${3 * s} l${-3 * s} ${7 * s} l${-3 * s} ${-7 * s} l${-7 * s} ${-3 * s} l${7 * s} ${-3 * s} z`} fill={c} />;
            case 'aurora': return i % 2
              ? <Path key={i} d={`M${x - 70} ${y} q35 -24 70 -6 t70 -10`} fill="none" stroke={c} strokeWidth={5} strokeLinecap="round" />
              : <Circle key={i} cx={x} cy={y} r={3 * s} fill={c} />;
            case 'royal': return <Path key={i} d={`M${x} ${y - 16 * s} l${11 * s} ${16 * s} l${-11 * s} ${16 * s} l${-11 * s} ${-16 * s} z`} fill="none" stroke={c} strokeWidth={3} />;
            default: return <Circle key={i} cx={x} cy={y} r={30 * s} fill={c} />;
          }
        })}
      </Svg>
    </View>
  );
}

/* ---------- shortcut tiles ---------- */

export interface Shortcut { key: TileKey; icon: IconName; title: string; sub: string; go: () => void }

/** 2×2 grid of colourful shortcut cards; each tint comes from the style's tile palette. */
export function ShortcutTiles({ items }: { items: Shortcut[] }) {
  const t = useTheme();
  const tiles = tilesFor(t);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {items.map((s) => {
        const c = tiles[s.key];
        return (
          <Pressable key={s.key} onPress={s.go} accessibilityRole="button" accessibilityLabel={s.title + '. ' + s.sub}
            style={({ pressed }) => ({ flexBasis: '47%', flexGrow: 1, minHeight: 104, padding: 14, gap: 4, borderRadius: t.radius.lg, backgroundColor: c.bg, opacity: pressed ? 0.85 : 1 })}>
            <View style={{ width: 36, height: 36, borderRadius: t.radius.sm, backgroundColor: t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              <DuoIcon name={s.icon} size={20} color={c.ink} />
            </View>
            <T size={15} weight="extrabold" numberOfLines={1}>{s.title}</T>
            <T size={12.5} weight="semibold" tone="muted" numberOfLines={2}>{s.sub}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Go to the review queue (helper shared by the banner and the tiles). */
export const goReview = () => router.push({ pathname: '/review', params: { mode: 'due' } });
