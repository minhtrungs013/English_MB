import { FAMILY_POS, type FamilyMember, type FamilyPos } from './data';

/** A "word form" question built from a word family (TOEIC Part 5 style). */
export interface WordformQuestion {
  /** Sentence with the member blanked out and the hint after it: "The ___ (decide) was announced yesterday." */
  prompt: string;
  /** The family member to type, as it appears in its example. */
  answer: string;
  /** Part of speech of the answer, lowercase (e.g. "noun") — the key clue. */
  pos: string;
  /** The base form given in brackets. */
  hint: string;
  /** "decide (v) → decision (n) → decisive (adj) → decisively (adv)". */
  familyLine: string;
  /** Vietnamese of the answer. */
  vi: string;
}

/** Case/spacing/outer-punctuation-insensitive form used to compare answers (same as the server). */
export function normalizeAnswer(s: string): string {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

const ABBR: Record<FamilyPos, string> = { Verb: 'v', Noun: 'n', Adjective: 'adj', Adverb: 'adv', Other: 'other' };
const posOf = (p: string | undefined): FamilyPos => ((FAMILY_POS as string[]).includes(p ?? '') ? (p as FamilyPos) : 'Other');
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Family as "decide (v) → decision (n) → …", ordered Verb → Noun → Adjective → Adverb → Other. */
export function familyLine(family: FamilyMember[]): string {
  return family
    .map((m, i) => ({ m, i, g: FAMILY_POS.indexOf(posOf(m.pos)) }))
    .sort((a, b) => a.g - b.g || a.i - b.i)
    .map(({ m }) => m.word.trim() + ' (' + ABBR[posOf(m.pos)] + ')')
    .join(' → ');
}

/** Where `word` appears as a whole word in `ex` (case-insensitive), or null. */
function findWhole(ex: string, word: string): { start: number; text: string } | null {
  const w = word.trim();
  if (!w) return null;
  const m = new RegExp('(^|[^\\p{L}\\p{N}])(' + escape(w) + ')(?![\\p{L}\\p{N}])', 'iu').exec(ex);
  return m ? { start: m.index + m[1].length, text: m[2] } : null;
}

/** Another member to give as the hint: the Verb if there is one, else the shortest; never equal to the answer. */
function pickHint(family: FamilyMember[], member: FamilyMember): string | null {
  const self = normalizeAnswer(member.word);
  const others = family.filter((o) => o !== member && o.word.trim() && normalizeAnswer(o.word) !== self);
  if (!others.length) return null;
  const verb = others.find((o) => posOf(o.pos) === 'Verb');
  const hint = verb ?? [...others].sort((a, b) => a.word.trim().length - b.word.trim().length)[0];
  return hint.word.trim();
}

/** Builds the question for one member, or null when it isn't usable. */
function questionFor(family: FamilyMember[], member: FamilyMember): WordformQuestion | null {
  if (!member.ex) return null;
  const at = findWhole(member.ex, member.word);
  if (!at) return null;
  const hint = pickHint(family, member);
  if (!hint) return null;
  const prompt = (member.ex.slice(0, at.start) + '___ (' + hint + ')' + member.ex.slice(at.start + at.text.length)).trim();
  return { prompt, answer: at.text, pos: posOf(member.pos).toLowerCase(), hint, familyLine: familyLine(family), vi: member.vi };
}

/** Every usable question of a family ([] when it has fewer than 2 members). */
export function wordformQuestions(family: FamilyMember[] | undefined): WordformQuestion[] {
  if (!family || family.length < 2) return [];
  return family.map((m) => questionFor(family, m)).filter((q): q is WordformQuestion => !!q);
}

/** The family gives at least one usable question. */
export function hasWordform(family: FamilyMember[] | undefined): boolean {
  return wordformQuestions(family).length > 0;
}

/** One random usable question from a family, or null. */
export function pickWordform(family: FamilyMember[] | undefined, rnd: () => number = Math.random): WordformQuestion | null {
  const qs = wordformQuestions(family);
  return qs.length ? qs[Math.floor(rnd() * qs.length)] : null;
}

/** The typed answer is right. */
export function isWordformCorrect(input: string, q: Pick<WordformQuestion, 'answer'>): boolean {
  return !!input.trim() && normalizeAnswer(input) === normalizeAnswer(q.answer);
}
