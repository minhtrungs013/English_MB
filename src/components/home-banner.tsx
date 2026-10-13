import { router } from 'expo-router';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { IconName } from '../lib/icons';
import { tilesFor, type TileKey } from '../lib/theme';
import { bannerFor, seasonAt, SEASON_LINE, type BannerName, type Season } from '../lib/season';
import { useStore, useTheme } from '../state/store';
import { Icon, T } from './ui';

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

/* ---------- seasonal decorations (level L, layered on any style) ---------- */

/** The season to decorate for right now, or null when off (Settings) or out of season. */
function useSeason(): Season {
  const { seasonal } = useStore();
  return seasonal ? seasonAt(Date.now()) : null;
}

export interface NextStep { label: string; go: () => void }

const BANNERS: Record<BannerName, number> = {
  classic: require('../../assets/banners/classic.webp'),
  midnight: require('../../assets/banners/midnight.webp'),
  mono: require('../../assets/banners/mono.webp'),
  royal: require('../../assets/banners/royal.webp'),
  autumn: require('../../assets/banners/autumn.webp'),
  spring: require('../../assets/banners/spring.webp'),
  summer: require('../../assets/banners/summer.webp'),
  winter: require('../../assets/banners/winter.webp'),
  tet: require('../../assets/banners/tet.webp'),
  midautumn: require('../../assets/banners/midautumn.webp'),
  xmas: require('../../assets/banners/xmas.webp')
};

/** Illustrated hero: full-bleed painted image (subject on the right), dark overlay from the left, white text and a cream "Continue" pill. */
export function GreetingBanner({ greeting, next, stat }: { greeting: string; next: NextStep; stat: string }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const narrow = width < 420;
  const season = useSeason();
  const banner = bannerFor(t.style, season);
  return (
    <View style={{ height: narrow ? 220 : 210, borderRadius: 22, overflow: 'hidden', backgroundColor: '#1a120c' }}>
      <Image source={BANNERS[banner]} contentFit="cover" contentPosition="right center" transition={150}
        accessible={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <Svg pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0 }} width="100%" height="100%">
        <Defs>
          <LinearGradient id="ov" x1="0" y1={narrow ? '0.3' : '0'} x2="1" y2="0">
            <Stop offset="0" stopColor="#140c06" stopOpacity={narrow ? 0.8 : 0.72} />
            <Stop offset={narrow ? '0.55' : '0.45'} stopColor="#140c06" stopOpacity={narrow ? 0.55 : 0.45} />
            <Stop offset={narrow ? '0.9' : '0.75'} stopColor="#140c06" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#ov)" />
      </Svg>
      <View style={{ flex: 1, padding: 18, justifyContent: 'center', gap: 6, maxWidth: narrow ? '78%' : '62%' }}>
        <T size={13} weight="bold" tone="white" numberOfLines={1} style={{ opacity: 0.9 }}>{season ? SEASON_LINE[season] : greeting}</T>
        <T size={24} weight="extrabold" tone="white" numberOfLines={2} style={{ lineHeight: 29, letterSpacing: -0.3 }}>
          {season ? greeting : lineOfDay(Date.now())}
        </T>
        <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
          <T size={12} weight="bold" tone="white" numberOfLines={1}>{stat}</T>
        </View>
        <Pressable onPress={next.go} accessibilityRole="button" accessibilityLabel={'Continue learning: ' + next.label}
          style={({ pressed }) => ({ alignSelf: 'flex-start', marginTop: 4, minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: '#FFF8EE', flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.85 : 1 })}>
          <T size={14} weight="extrabold" style={{ color: '#2a1a0e' }}>Continue learning ▸</T>
        </Pressable>
      </View>
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
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
              <Icon name={s.icon} size={22} color={c.ink} strokeWidth={1.8} />
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
