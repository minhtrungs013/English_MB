import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../state/store';
import { addDaysKey, courseTodayKey, daysBetweenKeys, daysInMonth, fmtDateKey, isDateKey } from './course';
import { Chip, Icon, T } from './ui';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The next Monday after today (a week away when today is Monday). */
function nextMonday(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDaysKey(today, ((8 - wd) % 7) || 7);
}

/** Client-side check of a course start date: '' when fine, else a message to show. */
export function startDateError(v: string): string {
  if (!v) return '';
  return isDateKey(v) ? '' : 'Please pick a real date for the start.';
}

/** Short explanation of what a start date means for learners. */
function explain(v: string, totalDays: number, today: string): string {
  if (!v) return 'Day 1 is the day each person joins, so everyone goes at their own pace.';
  const diff = daysBetweenKeys(today, v);
  const late = 'People who join later start on the course’s current day; the days they missed count as late.';
  if (diff > 0) return 'Learners can join now, but nothing opens until ' + fmtDateKey(v) + '. ' + late;
  if (diff === 0) return 'Day 1 opens today. ' + late;
  const open = Math.min(totalDays, 1 - diff);
  return 'This date has passed: ' + (open >= totalDays ? 'all ' + totalDays + ' days' : 'days 1–' + open) + ' open at once, and earlier days count as late (lower homework scores).';
}

function StepButton({ dir, label, onPress, disabled }: { dir: 'left' | 'right'; label: string; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center',
        backgroundColor: pressed ? t.surface2 : t.surface, opacity: disabled ? 0.4 : 1 })}>
      <Icon name={dir} size={18} color={t.text} />
    </Pressable>
  );
}

/** One "− value +" row of the date picker. */
function StepRow({ name, value, onStep, canDown, canUp }: { name: string; value: string; onStep: (n: number) => void; canDown: boolean; canUp: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <T size={13.5} weight="bold" tone="muted" style={{ width: 52 }}>{name}</T>
      <StepButton dir="left" label={'Earlier ' + name.toLowerCase()} onPress={() => onStep(-1)} disabled={!canDown} />
      <T weight="extrabold" center style={{ flex: 1 }}>{value}</T>
      <StepButton dir="right" label={'Later ' + name.toLowerCase()} onPress={() => onStep(1)} disabled={!canUp} />
    </View>
  );
}

/** Day / month / year steppers for a 'YYYY-MM-DD' date, from last year to two years ahead. */
function DateSteppers({ value, onChange, today }: { value: string; onChange: (v: string) => void; today: string }) {
  const [y, m, d] = value.split('-').map(Number);
  const minY = Number(today.slice(0, 4)) - 1;
  const maxY = minY + 3;
  const min = minY + '-01-01';
  const max = maxY + '-12-31';
  const key = (yy: number, mm: number, dd: number) => yy + '-' + String(mm).padStart(2, '0') + '-' + String(Math.min(dd, daysInMonth(yy, mm))).padStart(2, '0');
  const stepMonth = (n: number) => {
    const total = y * 12 + (m - 1) + n;
    const ny = Math.floor(total / 12);
    if (ny < minY || ny > maxY) return;
    onChange(key(ny, (total % 12) + 1, d));
  };
  const stepYear = (n: number) => { if (y + n >= minY && y + n <= maxY) onChange(key(y + n, m, d)); };
  return (
    <View style={{ gap: 8 }}>
      <StepRow name="Day" value={String(d)} onStep={(n) => onChange(addDaysKey(value, n))} canDown={value > min} canUp={value < max} />
      <StepRow name="Month" value={MONTH_NAMES[m - 1]} onStep={stepMonth} canDown={y > minY || m > 1} canUp={y < maxY || m < 12} />
      <StepRow name="Year" value={String(y)} onStep={stepYear} canDown={y > minY} canUp={y < maxY} />
    </View>
  );
}

/** One choice of the "Start" setting (a radio button). */
function StartOption({ on, title, text, onPress }: { on: boolean; title: string; text: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={title + '. ' + text}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 52, padding: 12, borderRadius: 12, borderWidth: on ? 1.5 : 1,
        borderColor: on ? t.primary : t.border, backgroundColor: pressed ? t.surface2 : on ? t.primarySoft : t.surface })}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? t.primary : t.faint, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.primary }} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T weight="extrabold">{title}</T>
        <T size={13} tone="muted">{text}</T>
      </View>
    </Pressable>
  );
}

/**
 * The course's "Start" setting: self-paced ('') or one start date for everyone ('YYYY-MM-DD').
 * `note` is shown under the picker (e.g. a warning that changing it moves everyone's days).
 */
export function StartDateField({ value, onChange, totalDays = 30, error, note }: {
  value: string; onChange: (v: string) => void; totalDays?: number; error?: string; note?: string;
}) {
  const t = useTheme();
  const today = courseTodayKey();
  // Remember the picked date while "each learner" is selected, so switching back keeps it.
  const [last, setLast] = useState(value || addDaysKey(today, 1));
  const fixed = !!value;
  const pick = (k: string) => { setLast(k); onChange(k); };
  const quick: [string, string][] = [['Today', today], ['Tomorrow', addDaysKey(today, 1)], ['Next Monday', nextMonday(today)]];
  return (
    <View style={{ gap: 8 }}>
      <T size={13.5} weight="bold">Start</T>
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        <StartOption on={!fixed} title="Each learner starts when they join" text={explain('', totalDays, today)} onPress={() => onChange('')} />
        <StartOption on={fixed} title={'Everyone starts on ' + (fixed ? fmtDateKey(value, true) : 'a date')}
          text={fixed ? 'Day 1 is the same date for everyone.' : 'Pick the date day 1 opens for everyone.'} onPress={() => { if (!fixed) onChange(last); }} />
      </View>
      {fixed ? (
        <View style={{ gap: 10, padding: 12, borderRadius: 12, backgroundColor: t.surface2 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {quick.map(([label, k]) => <Chip key={label} soft label={label} on={value === k} onPress={() => pick(k)} />)}
          </View>
          <View accessible accessibilityLiveRegion="polite" accessibilityLabel={'Start date ' + (isDateKey(value) ? fmtDateKey(value, true) : value)}>
            <T size={17} weight="extrabold" center>{isDateKey(value) ? fmtDateKey(value, true) : value}</T>
          </View>
          {isDateKey(value) ? <DateSteppers value={value} onChange={pick} today={today} /> : null}
          <T size={12.5} tone="muted">{explain(value, totalDays, today)}</T>
        </View>
      ) : null}
      {error ? <T size={13} weight="semibold" tone="danger">{error}</T> : note ? <T size={12.5} weight="semibold" tone="warning">{note}</T> : null}
    </View>
  );
}
