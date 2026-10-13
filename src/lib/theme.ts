import type { Accent, Level, Style } from './data';

/** Color tokens from the Wordbook design (same names as the web CSS variables). */
export interface Palette {
  bg: string; surface: string; surface2: string; surface3: string; border: string;
  text: string; muted: string; faint: string;
  primary: string; primaryHover: string; primarySoft: string; primaryInk: string; bar: string;
  success: string; successSoft: string; warning: string; warningSoft: string;
  danger: string; dangerSoft: string; info: string; infoSoft: string; orange: string; orangeSoft: string;
  dark: boolean;
}

/** Font family per weight (undefined = system font) and the corner radius scale. */
export type FontSet = Record<'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold', string | undefined>;
export interface Radius { sm: number; md: number; lg: number }
export interface Theme extends Palette { style: Style; font: FontSet; radius: Radius }

const LIGHT: Palette = {
  bg: '#F5F6F8', surface: '#FFFFFF', surface2: '#F0F1F4', surface3: '#E6E8ED', border: '#E3E5EA',
  text: '#1C1F2A', muted: '#5D6371', faint: '#8A909C',
  primary: '#5847D6', primaryHover: '#4A39C4', primarySoft: '#EEEBFD', primaryInk: '#4231B8', bar: '#CFC8F7',
  success: '#177A45', successSoft: '#E5F4EB', warning: '#9A5405', warningSoft: '#FDF1DF',
  danger: '#C0352E', dangerSoft: '#FCEBEA', info: '#2259D6', infoSoft: '#E7EFFD', orange: '#C2560C', orangeSoft: '#FDEEE2',
  dark: false
};
const DARK: Palette = {
  bg: '#111318', surface: '#1A1D24', surface2: '#232730', surface3: '#2D323C', border: '#2E333D',
  text: '#ECEEF3', muted: '#A6ACB8', faint: '#7D8391',
  primary: '#6E5DEB', primaryHover: '#7D6EF0', primarySoft: '#29244E', primaryInk: '#BDB4FF', bar: '#453D86',
  success: '#56C98A', successSoft: '#16301F', warning: '#EBA845', warningSoft: '#382910',
  danger: '#F2766E', dangerSoft: '#3B1D1C', info: '#7AA5FF', infoSoft: '#1A2643', orange: '#F59A55', orangeSoft: '#3A2414',
  dark: true
};

type AccentTokens = Pick<Palette, 'primary' | 'primaryHover' | 'primarySoft' | 'primaryInk' | 'bar'>;
const ACCENT: Record<Exclude<Accent, 'indigo'>, { light: AccentTokens; dark: AccentTokens }> = {
  blue: { light: { primary: '#2563EB', primaryHover: '#1D4FD8', primarySoft: '#E6EEFE', primaryInk: '#1E46B8', bar: '#C3D5FB' }, dark: { primary: '#3069DD', primaryHover: '#447AE6', primarySoft: '#1B2A4D', primaryInk: '#A8C4FF', bar: '#2E4A82' } },
  teal: { light: { primary: '#0E7490', primaryHover: '#0B5F75', primarySoft: '#E0F2F5', primaryInk: '#0B5468', bar: '#B5DEE6' }, dark: { primary: '#127F93', primaryHover: '#1A8FA5', primarySoft: '#13343B', primaryInk: '#8FDCE8', bar: '#1F5A64' } },
  green: { light: { primary: '#15803D', primaryHover: '#116A32', primarySoft: '#E3F4E8', primaryInk: '#116130', bar: '#BCE3C7' }, dark: { primary: '#1A7F41', primaryHover: '#228F4C', primarySoft: '#16301F', primaryInk: '#8EE0AA', bar: '#245C38' } },
  orange: { light: { primary: '#C2410C', primaryHover: '#A3360A', primarySoft: '#FDECE2', primaryInk: '#9A3209', bar: '#F8CDB3' }, dark: { primary: '#BC4C17', primaryHover: '#CC5A22', primarySoft: '#3A2414', primaryInk: '#FDBA8C', bar: '#6A3A1E' } },
  rose: { light: { primary: '#BE185D', primaryHover: '#A3144F', primarySoft: '#FCE7EF', primaryInk: '#9D1550', bar: '#F5C1D6' }, dark: { primary: '#C72A6A', primaryHover: '#D63D7B', primarySoft: '#3B1A27', primaryInk: '#FDA4C4', bar: '#6A2943' } }
};

export const ACCENT_SWATCH: [Accent, string, string][] = [
  ['indigo', 'Indigo', '#5847D6'], ['blue', 'Blue', '#2563EB'], ['teal', 'Teal', '#0E7490'],
  ['green', 'Green', '#15803D'], ['orange', 'Orange', '#C2410C'], ['rose', 'Rose', '#BE185D']
];

export function makePalette(dark: boolean, accent: Accent): Palette {
  const base = dark ? DARK : LIGHT;
  if (accent === 'indigo' || !ACCENT[accent]) return base;
  return { ...base, ...ACCENT[accent][dark ? 'dark' : 'light'] };
}

/** CEFR level badge colors from the design. */
export function levelColors(level: Level, dark: boolean): { bg: string; fg: string } {
  const L: Record<Level, [string, string, string, string]> = {
    A1: ['#EEF0F3', '#474D5C', '#2B303A', '#C9CED8'], A2: ['#E4F1FB', '#1F5A86', '#17304A', '#9FCBF2'],
    B1: ['#DCE7FD', '#1C4CBF', '#1B2C55', '#A9C2FF'], B2: ['#ECE5FD', '#5634C0', '#2E2457', '#C8B8FF'],
    C1: ['#FDEADB', '#A1440D', '#3E2413', '#FDB98A'], C2: ['#FCE3E3', '#B01F22', '#3F1A1C', '#FDA4A4']
  };
  const c = L[level] ?? L.B1;
  return dark ? { bg: c[2], fg: c[3] } : { bg: c[0], fg: c[1] };
}

/* ---------- app styles (level S) ---------- */
type P = Omit<Palette, 'dark'>;
const STYLE_COLORS: Record<Exclude<Style, 'classic'>, { light: P; dark: P }> = {
  warm: {
    light: { bg: '#FBF5EE', surface: '#FFFDF9', surface2: '#F5ECE1', surface3: '#EADCCB', border: '#E8D9C7', text: '#3B2A1F', muted: '#6E5544', faint: '#7A604E',
      primary: '#C2410C', primaryHover: '#A3360A', primarySoft: '#FCE9DC', primaryInk: '#9A3209', bar: '#F4C9AE',
      success: '#2F7A3A', successSoft: '#E6F2E3', warning: '#8F5207', warningSoft: '#FBEFD9', danger: '#B42318', dangerSoft: '#FBE6E2', info: '#2B5FA8', infoSoft: '#E5EDF8', orange: '#A8460B', orangeSoft: '#FBE8D8' },
    dark: { bg: '#1C1410', surface: '#261B15', surface2: '#30231B', surface3: '#3B2C22', border: '#3F2F24', text: '#F5EBDF', muted: '#C9B5A3', faint: '#A8927F',
      primary: '#B8460F', primaryHover: '#A83F0D', primarySoft: '#3D2416', primaryInk: '#FDBA8C', bar: '#6A3A1E',
      success: '#6FCF8E', successSoft: '#1B2E1F', warning: '#EDB25A', warningSoft: '#3A2A12', danger: '#F58A7A', dangerSoft: '#3E1E19', info: '#8DB4F5', infoSoft: '#1D2738', orange: '#F59A55', orangeSoft: '#3A2414' }
  },
  ocean: {
    light: { bg: '#EEF3F7', surface: '#FFFFFF', surface2: '#E6EDF3', surface3: '#D8E2EB', border: '#D5DFE8', text: '#0F2233', muted: '#4A5D70', faint: '#56697C',
      primary: '#0B5E86', primaryHover: '#094C6D', primarySoft: '#E0EFF6', primaryInk: '#08496A', bar: '#B6D7E6',
      success: '#11734A', successSoft: '#E2F3EA', warning: '#8A5300', warningSoft: '#FBF0DC', danger: '#B42F2F', dangerSoft: '#FBE7E7', info: '#1D5BC4', infoSoft: '#E5EEFC', orange: '#A84B0B', orangeSoft: '#FCEBDD' },
    dark: { bg: '#0B1620', surface: '#12202C', surface2: '#1A2A38', surface3: '#233545', border: '#243747', text: '#E6EFF6', muted: '#A3B4C3', faint: '#8597A8',
      primary: '#157EA6', primaryHover: '#126F93', primarySoft: '#10303F', primaryInk: '#8FD3EE', bar: '#1F5670',
      success: '#5CCB97', successSoft: '#123026', warning: '#EDB04F', warningSoft: '#352911', danger: '#F48080', dangerSoft: '#3A1C1F', info: '#84ADFF', infoSoft: '#18263F', orange: '#F59A55', orangeSoft: '#3A2414' }
  },
  sakura: {
    light: { bg: '#FFF5F8', surface: '#FFFFFF', surface2: '#FCEBF1', surface3: '#F6DCE6', border: '#F2D9E3', text: '#3A1F33', muted: '#6E4A62', faint: '#825E75',
      primary: '#C2185B', primaryHover: '#A3134C', primarySoft: '#FDE4EE', primaryInk: '#9C1450', bar: '#F6C0D5',
      success: '#2C7A4B', successSoft: '#E5F3EA', warning: '#8F5207', warningSoft: '#FBEFD9', danger: '#B3261E', dangerSoft: '#FBE6E4', info: '#3D5BC4', infoSoft: '#E8ECFB', orange: '#A84B0B', orangeSoft: '#FCEBDD' },
    dark: { bg: '#1C1219', surface: '#261A22', surface2: '#31222C', surface3: '#3C2B37', border: '#42303C', text: '#F8E8F0', muted: '#D0B3C4', faint: '#AD91A2',
      primary: '#C72A6A', primaryHover: '#B52460', primarySoft: '#3B1A2B', primaryInk: '#FDA4C4', bar: '#6A2943',
      success: '#6FCF97', successSoft: '#18301F', warning: '#EDB25A', warningSoft: '#3A2A12', danger: '#F58A8A', dangerSoft: '#3E1E1F', info: '#9AB0FF', infoSoft: '#1E2442', orange: '#F59A55', orangeSoft: '#3A2414' }
  },
  midnight: {
    light: { bg: '#EEEDF6', surface: '#FAFAFF', surface2: '#E6E4F2', surface3: '#DAD7EC', border: '#D4D1E8', text: '#1A1833', muted: '#545172', faint: '#625F84',
      primary: '#5B3FE0', primaryHover: '#4B30CC', primarySoft: '#E8E3FC', primaryInk: '#4325C2', bar: '#CBC0F7',
      success: '#177A45', successSoft: '#E2F2E9', warning: '#8F5207', warningSoft: '#FBEFD9', danger: '#B8302A', dangerSoft: '#FBE7E6', info: '#2457C9', infoSoft: '#E5ECFB', orange: '#A84B0B', orangeSoft: '#FCEBDD' },
    dark: { bg: '#0B0D1A', surface: '#12152A', surface2: '#1A1E38', surface3: '#232846', border: '#2E3466', text: '#E9E8FF', muted: '#A9A8CF', faint: '#8B8AB5',
      primary: '#6847F5', primaryHover: '#5E3DEB', primarySoft: '#231C4D', primaryInk: '#C7B8FF', bar: '#3E3285',
      success: '#5EE0A0', successSoft: '#10291F', warning: '#F2B655', warningSoft: '#33270F', danger: '#FF8A8A', dangerSoft: '#3A1A22', info: '#7FB0FF', infoSoft: '#162444', orange: '#F7A160', orangeSoft: '#3A2414' }
  },
  mono: {
    light: { bg: '#F4F4F4', surface: '#FFFFFF', surface2: '#EDEDED', surface3: '#E0E0E0', border: '#D6D6D6', text: '#111111', muted: '#505050', faint: '#666666',
      primary: '#111111', primaryHover: '#333333', primarySoft: '#EAEAEA', primaryInk: '#111111', bar: '#C8C8C8',
      success: '#1F6B3A', successSoft: '#E8F0EA', warning: '#7A4A06', warningSoft: '#F5EEE2', danger: '#A52A24', dangerSoft: '#F7E7E6', info: '#2A4F9A', infoSoft: '#E8ECF4', orange: '#9A4510', orangeSoft: '#F6EBE2' },
    // Dark primary is a mid grey, not white: many screens draw white text on the primary color.
    dark: { bg: '#0A0A0A', surface: '#141414', surface2: '#1E1E1E', surface3: '#2A2A2A', border: '#333333', text: '#F2F2F2', muted: '#B0B0B0', faint: '#8F8F8F',
      primary: '#666666', primaryHover: '#595959', primarySoft: '#262626', primaryInk: '#F2F2F2', bar: '#4A4A4A',
      success: '#7CCB98', successSoft: '#17261C', warning: '#E3B266', warningSoft: '#2E2414', danger: '#F08C86', dangerSoft: '#331C1B', info: '#9DB6EA', infoSoft: '#1A2130', orange: '#EFA06A', orangeSoft: '#30221A' }
  }
};

const RADIUS: Record<Style, Radius> = {
  classic: { sm: 10, md: 12, lg: 16 }, warm: { sm: 14, md: 16, lg: 20 }, ocean: { sm: 8, md: 10, lg: 12 },
  sakura: { sm: 14, md: 16, lg: 20 }, midnight: { sm: 10, md: 12, lg: 16 }, mono: { sm: 6, md: 6, lg: 8 }
};

/* eslint-disable @typescript-eslint/no-require-imports */
const NUNITO = {
  Nunito_400Regular: require('@expo-google-fonts/nunito/400Regular/Nunito_400Regular.ttf'),
  Nunito_700Bold: require('@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf'),
  Nunito_800ExtraBold: require('@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf')
};
const INTER = {
  Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
  Inter_700Bold: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf')
};
/** Font files per style: only the weights used, loaded when the style becomes active. */
export const STYLE_FONT_FILES: Record<Exclude<Style, 'classic'>, Record<string, number>> = {
  warm: NUNITO,
  sakura: NUNITO,
  ocean: { ...INTER, Inter_800ExtraBold: require('@expo-google-fonts/inter/800ExtraBold/Inter_800ExtraBold.ttf') },
  midnight: { ...INTER, SpaceGrotesk_700Bold: require('@expo-google-fonts/space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf') },
  mono: {
    IBMPlexSans_400Regular: require('@expo-google-fonts/ibm-plex-sans/400Regular/IBMPlexSans_400Regular.ttf'),
    IBMPlexSans_700Bold: require('@expo-google-fonts/ibm-plex-sans/700Bold/IBMPlexSans_700Bold.ttf')
  }
};
/* eslint-enable @typescript-eslint/no-require-imports */

const STYLE_FONTS: Record<Exclude<Style, 'classic'>, FontSet> = {
  warm: { regular: 'Nunito_400Regular', medium: 'Nunito_400Regular', semibold: 'Nunito_700Bold', bold: 'Nunito_700Bold', extrabold: 'Nunito_800ExtraBold' },
  sakura: { regular: 'Nunito_400Regular', medium: 'Nunito_400Regular', semibold: 'Nunito_700Bold', bold: 'Nunito_700Bold', extrabold: 'Nunito_800ExtraBold' },
  ocean: { regular: 'Inter_400Regular', medium: 'Inter_400Regular', semibold: 'Inter_700Bold', bold: 'Inter_700Bold', extrabold: 'Inter_800ExtraBold' },
  midnight: { regular: 'Inter_400Regular', medium: 'Inter_400Regular', semibold: 'Inter_700Bold', bold: 'SpaceGrotesk_700Bold', extrabold: 'SpaceGrotesk_700Bold' },
  mono: { regular: 'IBMPlexSans_400Regular', medium: 'IBMPlexSans_400Regular', semibold: 'IBMPlexSans_700Bold', bold: 'IBMPlexSans_700Bold', extrabold: 'IBMPlexSans_700Bold' }
};
const SYSTEM_FONT: FontSet = { regular: undefined, medium: undefined, semibold: undefined, bold: undefined, extrabold: undefined };

/** Style id, name and one-line description, for the settings picker. */
export const STYLES: [Style, string, string][] = [
  ['classic', 'Classic', 'The original look, with your accent'], ['warm', 'Warm café', 'Cream paper, terracotta, rounded'],
  ['ocean', 'Ocean', 'Cool blue-grey and deep teal'], ['sakura', 'Sakura', 'Soft pink, rose and plum'],
  ['midnight', 'Midnight', 'Navy night with a violet glow'], ['mono', 'Mono', 'Black, white and greys']
];

/** Full theme: colors (style x light/dark; accent only for classic), fonts (system until loaded) and radius. */
export function makeTheme(style: Style, dark: boolean, accent: Accent, fontsLoaded = true): Theme {
  if (style === 'classic' || !STYLE_COLORS[style]) return { ...makePalette(dark, accent), style: 'classic', font: FONT, radius: RADIUS.classic };
  return { ...STYLE_COLORS[style][dark ? 'dark' : 'light'], dark, style, font: fontsLoaded ? STYLE_FONTS[style] : SYSTEM_FONT, radius: RADIUS[style] };
}

/** Plus Jakarta Sans, one family per weight (React Native can't synthesize weights from one file). */
export const FONT = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold'
} as const;

/* ---------- home shortcut tiles (level M) ---------- */
/** One soft tint per Home shortcut card: `bg` behind theme text/muted, `ink` for the icon and the live number. */
export interface Tile { bg: string; ink: string }
export type TileKey = 'vocab' | 'grammar' | 'listen' | 'review';
type TileSet = Record<TileKey, Tile>;
const TILES: Record<Style, { light: TileSet; dark: TileSet }> = {
  classic: {
    light: { vocab: { bg: '#EEEBFD', ink: '#4231B8' }, grammar: { bg: '#E5F4EB', ink: '#16723F' }, listen: { bg: '#FDF1DF', ink: '#8F4E05' }, review: { bg: '#E7EFFD', ink: '#2054C9' } },
    dark: { vocab: { bg: '#29244E', ink: '#BDB4FF' }, grammar: { bg: '#16301F', ink: '#56C98A' }, listen: { bg: '#382910', ink: '#EBA845' }, review: { bg: '#1A2643', ink: '#7AA5FF' } }
  },
  warm: {
    light: { vocab: { bg: '#FCE9DC', ink: '#9A3209' }, grammar: { bg: '#E6F2E3', ink: '#2A6E34' }, listen: { bg: '#FBEFD9', ink: '#814A06' }, review: { bg: '#E5EDF8', ink: '#2B5FA8' } },
    dark: { vocab: { bg: '#3D2416', ink: '#FDBA8C' }, grammar: { bg: '#1B2E1F', ink: '#6FCF8E' }, listen: { bg: '#3A2A12', ink: '#EDB25A' }, review: { bg: '#1D2738', ink: '#8DB4F5' } }
  },
  ocean: {
    light: { vocab: { bg: '#E0EFF6', ink: '#08496A' }, grammar: { bg: '#E2F3EA', ink: '#0F6A44' }, listen: { bg: '#FBF0DC', ink: '#7D4B00' }, review: { bg: '#E5EEFC', ink: '#1D5BC4' } },
    dark: { vocab: { bg: '#10303F', ink: '#8FD3EE' }, grammar: { bg: '#123026', ink: '#5CCB97' }, listen: { bg: '#352911', ink: '#EDB04F' }, review: { bg: '#18263F', ink: '#84ADFF' } }
  },
  sakura: {
    light: { vocab: { bg: '#FDE4EE', ink: '#9C1450' }, grammar: { bg: '#E5F3EA', ink: '#276E43' }, listen: { bg: '#FBEFD9', ink: '#814A06' }, review: { bg: '#EEE6FA', ink: '#5B3A9E' } },
    dark: { vocab: { bg: '#3B1A2B', ink: '#FDA4C4' }, grammar: { bg: '#18301F', ink: '#6FCF97' }, listen: { bg: '#3A2A12', ink: '#EDB25A' }, review: { bg: '#2A2040', ink: '#C4B0FF' } }
  },
  midnight: {
    light: { vocab: { bg: '#E8E3FC', ink: '#4325C2' }, grammar: { bg: '#E2F2E9', ink: '#16723F' }, listen: { bg: '#FBEFD9', ink: '#814A06' }, review: { bg: '#E5ECFB', ink: '#2457C9' } },
    dark: { vocab: { bg: '#231C4D', ink: '#C7B8FF' }, grammar: { bg: '#10291F', ink: '#5EE0A0' }, listen: { bg: '#33270F', ink: '#F2B655' }, review: { bg: '#162444', ink: '#7FB0FF' } }
  },
  mono: {
    light: { vocab: { bg: '#EAEAEA', ink: '#111111' }, grammar: { bg: '#E2E2E2', ink: '#111111' }, listen: { bg: '#F0F0F0', ink: '#111111' }, review: { bg: '#DADADA', ink: '#111111' } },
    dark: { vocab: { bg: '#262626', ink: '#F2F2F2' }, grammar: { bg: '#202020', ink: '#F2F2F2' }, listen: { bg: '#2C2C2C', ink: '#F2F2F2' }, review: { bg: '#333333', ink: '#F2F2F2' } }
  }
};
/* end TILES */

export function tilesFor(t: Theme): TileSet {
  return (TILES[t.style] ?? TILES.classic)[t.dark ? 'dark' : 'light'];
}
