import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { Topic } from '../lib/api';
import { ST_LABEL, type Level, type Status } from '../lib/data';
import { IC, type IconName } from '../lib/icons';
import { FONT, levelColors } from '../lib/theme';
import { useStore, useTheme } from '../state/store';

/* ---------- icon (same stroke icons as the web design) ---------- */
export function Icon({ name, size = 20, color, strokeWidth = 1.9 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const t = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? t.text} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d={IC[name]} />
    </Svg>
  );
}

/* ---------- text ---------- */
type Weight = keyof typeof FONT;
type Tone = 'text' | 'muted' | 'faint' | 'primary' | 'primaryInk' | 'danger' | 'success' | 'warning' | 'info' | 'white';
export function T({ children, size = 15, weight = 'regular', tone = 'text', style, numberOfLines, center }: {
  children: ReactNode; size?: number; weight?: Weight; tone?: Tone; style?: StyleProp<TextStyle>; numberOfLines?: number; center?: boolean;
}) {
  const t = useTheme();
  const color = tone === 'white' ? '#fff' : (t as unknown as Record<string, string>)[tone];
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontFamily: FONT[weight], fontSize: size, color, lineHeight: Math.round(size * 1.45) }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

/* ---------- buttons ---------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerSoft' | 'white';
export function Button({ title, onPress, variant = 'primary', size = 'md', icon, loading, disabled, block, style, accessibilityLabel }: {
  title: string; onPress?: () => void; variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: IconName;
  loading?: boolean; disabled?: boolean; block?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}) {
  const t = useTheme();
  const v: Record<Variant, { bg: string; fg: string; border: string; pressed: string }> = {
    primary: { bg: t.primary, fg: '#fff', border: t.primary, pressed: t.primaryHover },
    secondary: { bg: t.surface, fg: t.text, border: t.border, pressed: t.surface2 },
    ghost: { bg: 'transparent', fg: t.muted, border: 'transparent', pressed: t.surface2 },
    danger: { bg: t.danger, fg: '#fff', border: t.danger, pressed: t.danger },
    dangerSoft: { bg: t.surface, fg: t.danger, border: t.border, pressed: t.dangerSoft },
    white: { bg: '#fff', fg: t.dark ? t.primary : t.primaryInk, border: '#fff', pressed: '#F1EFFF' }
  };
  const c = v[variant];
  const h = size === 'sm' ? 38 : size === 'lg' ? 52 : 46;
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress} disabled={off} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!off }}
      style={({ pressed }) => [
        { minHeight: h, paddingHorizontal: size === 'sm' ? 12 : size === 'lg' ? 24 : 18, borderRadius: size === 'lg' ? 12 : 10, borderWidth: 1,
          backgroundColor: pressed ? c.pressed : c.bg, borderColor: c.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: off ? 0.55 : 1 },
        block && { alignSelf: 'stretch' }, style
      ]}>
      {loading ? <ActivityIndicator size="small" color={c.fg} /> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} color={c.fg} /> : null}
      <T weight="bold" size={size === 'sm' ? 13.5 : size === 'lg' ? 16 : 14.5} style={{ color: c.fg }}>{title}</T>
    </Pressable>
  );
}

export function IconButton({ name, onPress, label, color, size = 44, tone }: { name: IconName; onPress: () => void; label: string; color?: string; size?: number; tone?: 'danger' }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? (tone === 'danger' ? t.dangerSoft : t.surface2) : 'transparent' })}>
      <Icon name={name} size={size > 40 ? 20 : 18} color={color ?? (tone === 'danger' ? t.danger : t.muted)} />
    </Pressable>
  );
}

/* ---------- layout ---------- */
export function Card({ children, style, pad = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: boolean }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: 16 }, pad && { padding: 18 }, style]}>{children}</View>;
}

/** Scrollable screen with safe-area padding and an optional title row. */
export function Screen({ title, sub, right, children, scroll = true, bottomPad = 24 }: {
  title?: string; sub?: string; right?: ReactNode; children: ReactNode; scroll?: boolean; bottomPad?: number;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const head = title ? (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
      <View style={{ flex: 1 }}>
        <T size={26} weight="extrabold" style={{ letterSpacing: -0.5 }}>{title}</T>
        {sub ? <T tone="muted" style={{ marginTop: 4 }}>{sub}</T> : null}
      </View>
      {right}
    </View>
  ) : null;
  if (!scroll) {
    return <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top + 12, paddingHorizontal: 16 }}>{head}{children}</View>;
  }
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: bottomPad }} keyboardShouldPersistTaps="handled">
      {head}
      {children}
    </ScrollView>
  );
}

export function SectionTitle({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <T size={12} weight="extrabold" tone="muted" style={[{ textTransform: 'uppercase', letterSpacing: 0.7 }, style]}>{children}</T>;
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.border }} />;
}

/* ---------- badges & chips ---------- */
export function Badge({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 7, backgroundColor: bg, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <T size={12.5} weight="bold" style={{ color: fg, lineHeight: 16 }}>{label}</T>
    </View>
  );
}
export function LevelBadge({ level }: { level: Level }) {
  const t = useTheme();
  const c = levelColors(level, t.dark);
  return <Badge label={level} bg={c.bg} fg={c.fg} />;
}
export function StatusBadge({ status }: { status: Status }) {
  const t = useTheme();
  const c = status === 'new' ? [t.infoSoft, t.info] : status === 'learning' ? [t.warningSoft, t.warning] : [t.successSoft, t.success];
  return <Badge label={'● ' + ST_LABEL[status]} bg={c[0]} fg={c[1]} />;
}
export function PosBadge({ pos }: { pos: string }) {
  const t = useTheme();
  return <Badge label={pos} bg={t.surface2} fg={t.muted} />;
}
export const TOPIC_LABEL: Record<Topic, string> = { it: 'IT', interview: 'Interview', customer: 'Customer meetings', leader: 'Leader meetings', other: 'Other' };
export function TopicBadge({ topic }: { topic: Topic }) {
  const t = useTheme();
  const m: Record<Topic, [string, string]> = {
    it: [t.infoSoft, t.info], interview: [t.primarySoft, t.primaryInk], customer: [t.successSoft, t.success],
    leader: [t.orangeSoft, t.orange], other: [t.warningSoft, t.warning]
  };
  return <Badge label={TOPIC_LABEL[topic]} bg={m[topic][0]} fg={m[topic][1]} />;
}

export function Chip({ label, on, onPress, soft }: { label: string; on: boolean; onPress: () => void; soft?: boolean }) {
  const t = useTheme();
  const bg = on ? (soft ? t.primarySoft : t.primary) : t.surface;
  const fg = on ? (soft ? t.primaryInk : '#fff') : t.muted;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ minHeight: 38, paddingHorizontal: 13, borderRadius: 99, borderWidth: 1, borderColor: on ? t.primary : t.border, backgroundColor: bg, justifyContent: 'center' }}>
      <T size={13.5} weight="bold" style={{ color: fg }}>{label}</T>
    </Pressable>
  );
}

/** Horizontally scrolling row of chips. */
export function ChipRow({ children }: { children: ReactNode }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 16 }}>{children}</ScrollView>;
}

/* ---------- inputs ---------- */
export function Field({ label, children, hint, error }: { label?: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <View style={{ gap: 7 }}>
      {label ? <T size={13.5} weight="bold">{label}</T> : null}
      {children}
      {error ? <T size={13} weight="semibold" tone="danger">{error}</T> : hint ? <T size={12.5} tone="muted">{hint}</T> : null}
    </View>
  );
}

export function Input(props: TextInputProps & { invalid?: boolean; big?: boolean; leftIcon?: IconName }) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  const { invalid, big, leftIcon, style, multiline, ...rest } = props;
  return (
    <View style={{ justifyContent: 'center' }}>
      {leftIcon ? <View style={{ position: 'absolute', left: 13, zIndex: 1 }}><Icon name={leftIcon} size={18} color={t.faint} /></View> : null}
      <TextInput
        placeholderTextColor={t.faint}
        {...rest}
        multiline={multiline}
        onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
        style={[{
          minHeight: big ? 56 : 46, paddingHorizontal: 14, paddingLeft: leftIcon ? 40 : 14, paddingVertical: multiline ? 11 : 0,
          borderWidth: 1, borderRadius: big ? 12 : 10, backgroundColor: t.surface, color: t.text,
          borderColor: invalid ? t.danger : focus ? t.primary : t.border,
          fontFamily: big ? FONT.bold : FONT.regular, fontSize: big ? 20 : 15, textAlignVertical: multiline ? 'top' : 'center'
        }, multiline && { minHeight: 88 }, style]}
      />
    </View>
  );
}

/* ---------- feedback ---------- */
export function EmptyState({ icon, title, text, children, tone = 'indigo' }: { icon: IconName; title: string; text: string; children?: ReactNode; tone?: 'indigo' | 'blue' | 'green' | 'red' }) {
  const t = useTheme();
  const tint = { indigo: [t.primarySoft, t.primaryInk], blue: [t.infoSoft, t.info], green: [t.successSoft, t.success], red: [t.dangerSoft, t.danger] }[tone];
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, gap: 10 }}>
      <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: tint[0], alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <Icon name={icon} size={30} color={tint[1]} />
      </View>
      <T size={19} weight="extrabold" center>{title}</T>
      <T tone="muted" center style={{ maxWidth: 320, marginBottom: 8 }}>{text}</T>
      {children}
    </View>
  );
}

export function ToastHost() {
  const { toast } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return (
    <View pointerEvents="none" style={[styles.toast, { bottom: insets.bottom + 92, backgroundColor: t.dark ? '#ECEEF3' : '#1C1F2A' }]} accessibilityLiveRegion="polite">
      <Icon name={toast.kind === 'bad' ? 'alert' : 'checkc'} size={18} color={toast.kind === 'bad' ? (t.dark ? '#C0352E' : '#FCA5A5') : (t.dark ? '#177A45' : '#6EE7A8')} />
      <T weight="semibold" size={14} style={{ color: t.dark ? '#1C1F2A' : '#fff', flexShrink: 1 }}>{toast.msg}</T>
    </View>
  );
}

/** Small colored square with an icon, as used on the design's stat cards. */
export function IconTile({ name, tone, size = 38 }: { name: IconName; tone: 'indigo' | 'amber' | 'green' | 'orange' | 'blue' | 'red'; size?: number }) {
  const t = useTheme();
  const m: Record<string, [string, string]> = {
    indigo: [t.primarySoft, t.primaryInk], amber: [t.warningSoft, t.warning], green: [t.successSoft, t.success],
    orange: [t.orangeSoft, t.orange], blue: [t.infoSoft, t.info], red: [t.dangerSoft, t.danger]
  };
  return (
    <View style={{ width: size, height: size, borderRadius: size > 40 ? 14 : 10, backgroundColor: m[tone][0], alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={size > 40 ? 24 : 20} color={m[tone][1]} />
    </View>
  );
}


const styles = StyleSheet.create({
  toast: { position: 'absolute', left: 16, right: 16, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }
});

/** Top bar for pushed screens: back button, optional title, optional actions on the right. */
export function BackBar({ title, right, onBack }: { title?: string; right?: ReactNode; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 56 + insets.top }}>
      <IconButton name="left" label="Back" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))} />
      <T size={16} weight="extrabold" numberOfLines={1} style={{ flex: 1 }}>{title ?? ''}</T>
      {right}
    </View>
  );
}
