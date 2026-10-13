/** Seasonal decorations (level L): which one is on for a moment in time, in the app time zone (Asia/Ho_Chi_Minh, UTC+7, no DST). */
export type Season = 'tet' | 'midautumn' | 'christmas' | 'newyear' | null;

const DAY = 86400000;
/** Lunar New Year (Tết), 2026–2030. */
const TET = ['2026-02-17', '2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03'];
/** Mid-Autumn (15th day of the 8th lunar month), 2026–2030. */
const MID_AUTUMN = ['2026-09-25', '2027-09-15', '2028-10-03', '2029-09-22', '2030-09-12'];

/** Day number (days since 1970-01-01) of a YYYY-MM-DD date. */
const dayNo = (iso: string) => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY);
const near = (table: string[], d: number, span: number) => table.some((iso) => Math.abs(d - dayNo(iso)) <= span);

/** Pure: the season for a timestamp (ms), or null. */
export function seasonAt(ms: number): Season {
  const local = ms + 7 * 3600000; // Vietnam time, read with the UTC getters
  const d = Math.floor(local / DAY);
  if (near(TET, d, 7)) return 'tet';
  if (near(MID_AUTUMN, d, 5)) return 'midautumn';
  const dt = new Date(local);
  const m = dt.getUTCMonth() + 1, day = dt.getUTCDate();
  if (m === 12 && day >= 18 && day <= 26) return 'christmas';
  if ((m === 12 && day >= 30) || (m === 1 && day <= 2)) return 'newyear';
  return null;
}

/** Greeting shown in the banner during a season (null = keep the normal line). */
export const SEASON_LINE: Record<Exclude<Season, null>, string> = {
  tet: 'Chúc mừng năm mới!',
  midautumn: 'Happy Mid-Autumn Festival!',
  christmas: 'Merry Christmas!',
  newyear: 'Happy New Year!'
};
