import type { Accent, Level } from './data';

/** Color tokens from the Wordbook design (same names as the web CSS variables). */
export interface Palette {
  bg: string; surface: string; surface2: string; surface3: string; border: string;
  text: string; muted: string; faint: string;
  primary: string; primaryHover: string; primarySoft: string; primaryInk: string; bar: string;
  success: string; successSoft: string; warning: string; warningSoft: string;
  danger: string; dangerSoft: string; info: string; infoSoft: string; orange: string; orangeSoft: string;
  dark: boolean;
}

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

/** Plus Jakarta Sans, one family per weight (React Native can't synthesize weights from one file). */
export const FONT = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold'
} as const;
