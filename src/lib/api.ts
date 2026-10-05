import * as SecureStore from 'expo-secure-store';
import type { Category, Data, Progress, Rating, Settings, Word } from './data';

/** Same NestJS API as the web app. Set EXPO_PUBLIC_API_URL in .env (or the EAS build profile). */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';
const TOKEN_KEY = 'wordbook_token';

export class ApiError extends Error {
  /** `body` is the server's JSON error, when there is one. */
  constructor(message: string, readonly status: number, readonly body: Record<string, unknown> | null = null) { super(message); }
}

/* ---------- session token (kept in the device's secure storage) ---------- */
let token: string | null = null;
let onUnauthorized: ((msg: string) => void) | null = null;

export async function loadToken(): Promise<string | null> {
  try { token = await SecureStore.getItemAsync(TOKEN_KEY); } catch { token = null; }
  return token;
}
export async function setToken(t: string | null): Promise<void> {
  token = t;
  try {
    if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch { /* secure storage unavailable: keep the token in memory */ }
}
export function getToken(): string | null { return token; }
/** Called when a signed-in request comes back 401 (expired token, deleted account). */
export function setUnauthorizedHandler(fn: (msg: string) => void): void { onUnauthorized = fn; }

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const sentToken = token;
  if (sentToken) headers.Authorization = 'Bearer ' + sentToken;
  let res: Response;
  const ctl = new AbortController();
  // Generous timeout: a sleeping free-tier server (e.g. Render) can take ~1 minute to wake up.
  const timer = setTimeout(() => ctl.abort(), 60000);
  try {
    res = await fetch(API_URL + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctl.signal });
  } catch {
    throw new ApiError('Can’t reach the server at ' + API_URL + '. Check your internet connection and try again.', 0);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const m = json?.message;
    const msg = Array.isArray(m) ? m.join(' ') : m || 'Request failed (' + res.status + ')';
    if (res.status === 401 && sentToken && sentToken === token && !path.startsWith('/auth/change-password')) onUnauthorized?.(msg);
    throw new ApiError(msg, res.status, json);
  }
  return json as T;
}

export type WordInput = Omit<Word, 'id' | 'status' | 'dueAt' | 'addedAt' | 'hist'>;
export interface Quota { used: number; limit: number }
export interface LookupResult {
  quota?: Quota;
  source: 'collection' | 'builtin' | 'online';
  ipa?: string; pos?: string; meaning?: string; vi?: string; ex?: string; syn?: string[]; ant?: string[]; level?: Word['level'];
}
export interface User { id: string; name: string; email: string }
export interface AuthResponse { accessToken: string; user: User }

export type Topic = 'it' | 'interview' | 'customer' | 'leader' | 'toeic' | 'other';
export interface LibraryWord {
  id: string; word: string; ipa: string; pos: string; meaning: string; vi: string; ex: string;
  syn: string[]; ant: string[]; level: Word['level']; topic: Topic;
  /** '' for built-in words. */
  authorId: string; authorName: string; saves: number; sharedAt: number;
}
export interface LibraryPage { items: LibraryWord[]; total: number; page: number; limit: number; topics: Record<Topic, number>; all: number }
export interface LibraryQuery { q?: string; topic?: Topic; level?: string; source?: 'me' | 'community' | 'builtin'; page?: number; limit?: number }

/* ---------- courses ---------- */
export interface CourseWord {
  word: string; ipa: string; pos: string; meaning: string; vi: string; ex: string;
  syn: string[]; ant: string[]; level: Word['level'];
  /** '' when the word isn't in the shared library. */
  libraryId: string; source: 'library' | 'ai' | 'manual';
}
/**
 * currentDay 1..30: day 1 is the day they joined ('YYYY-MM-DD' startDay), +1 each day (Vietnam time).
 * warmedUp: days whose warm-up (review of earlier days) was finished or skipped.
 */
export type CourseEnrollment = { startDay: string; currentDay: number; learned: number[]; warmedUp: number[] } | null;
export type CourseVisibility = 'private' | 'public';
export interface CourseSummary {
  id: string; title: string; description: string; ownerId: string; ownerName: string; isOwner: boolean;
  visibility: CourseVisibility; wordsPerDay: number; totalDays: number; tag: string; readyDays: number; members: number;
  /** Only sent to the owner. */
  joinCode?: string;
  enrollment: CourseEnrollment;
}
export interface CourseDay {
  day: number; count: number; /** null = locked for this learner. */ words: CourseWord[] | null;
  /** My final homework score for this day (only when enrolled and handed in). */
  myScore?: number | null;
  /** Question bank counts for this day (owner only). */
  bank?: { pending: number; approved: number };
}
export interface CourseDetail extends CourseSummary { days: CourseDay[] }
export interface CourseInput { title: string; description?: string; wordsPerDay?: number; visibility?: CourseVisibility }
export interface AiWordResult { source: 'library' | 'ai' | 'online'; word: CourseWord; quota: Quota }
export interface LearnResult { added: Word[]; skipped: string[]; tag: string; course: CourseDetail }

/* ---------- tense question bank (owner) ---------- */
export const TENSES = ['present-simple', 'present-continuous', 'present-perfect', 'past-simple', 'past-continuous', 'future-simple', 'going-to'] as const;
export type Tense = (typeof TENSES)[number];
/** Same labels as the server's `tenseLabel` (for pickers, before an item comes back from the server). */
export const TENSE_LABEL: Record<Tense, string> = {
  'present-simple': 'Present simple',
  'present-continuous': 'Present continuous',
  'present-perfect': 'Present perfect',
  'past-simple': 'Past simple',
  'past-continuous': 'Past continuous',
  'future-simple': 'Future simple (will)',
  'going-to': 'Future (be going to)'
};
/**
 * 'tense': typed — a sentence with one "___" and the base verb in brackets.
 * 'tenseChoice': the same with 4 choices. 'recap': a short story of earlier words (explain = Vietnamese translation).
 */
export type BankKind = 'tense' | 'tenseChoice' | 'recap';
export type BankStatus = 'pending' | 'approved' | 'rejected';
export interface BankItem {
  id: string; day: number; kind: BankKind; word: string;
  /** '' for recaps. */
  tense: Tense | ''; tenseLabel: string;
  prompt: string; choices: string[]; answer: string; accept: string[]; explain: string;
  source: 'ai' | 'template' | 'manual'; status: BankStatus;
}
export interface BankItemInput { kind: BankKind; word?: string; tense?: Tense | ''; prompt: string; choices?: string[]; answer?: string; accept?: string[]; explain?: string }
export interface GenerateResult { source: 'ai' | 'template'; added: number; quota: Quota; items: BankItem[] }

/* ---------- homework & leaderboard ---------- */
export type HomeworkType = 'meaning' | 'word' | 'type' | 'blank' | 'tense' | 'tenseChoice';
export interface HomeworkQuestion {
  type: HomeworkType;
  /** A word from an earlier day. */
  review: boolean;
  prompt: string; hint: string;
  /** Empty for typed answers ('type' / 'blank' / 'tense'). */
  choices: string[];
}
export interface HomeworkReviewItem extends HomeworkQuestion {
  yourAnswer: string; answer: string; correct: boolean;
  /** Tense questions only. */
  tense?: string; tenseLabel?: string; explain?: string;
}
export interface HomeworkResult {
  /** Final score after the late penalty (0–100). */
  score: number;
  /** Score before the penalty (0–100). */
  raw: number;
  correct: number; total: number; lateDays: number;
  /** % of the score kept: 100 on time, then 80, 60, 50. */
  penalty: number;
  durationMs: number; submittedAt: number | string;
  review: HomeworkReviewItem[];
}
export interface Homework {
  day: number; total: number; lateDays: number; penalty: number;
  questions: HomeworkQuestion[];
  submission: HomeworkResult | null;
}
/* ---------- warm-up (learner, not graded) ---------- */
export interface WarmupQuestion {
  type: HomeworkType; word: string; prompt: string; hint: string; choices: string[];
  answer: string; accept: string[]; tense: string; tenseLabel: string; explain: string;
}
export interface Warmup {
  day: number;
  /** The day's approved recap story; `vi` is its Vietnamese translation. */
  recap: { text: string; vi: string } | null;
  /** Words from earlier days; `missed` = how many times the learner got it wrong. */
  words: { word: string; ipa: string; vi: string; meaning: string; missed: number }[];
  questions: WarmupQuestion[];
}

export type BoardRow<T> = { rank: number; name: string; me: boolean } & T;
export interface Board<T> { rows: BoardRow<T>[]; me: BoardRow<T> | null; count: number }
export type DayBoardRow = { score: number; correct: number; total: number; lateDays: number; durationMs: number };
export type OverallBoardRow = { score: number; days: number };
export type StreakBoardRow = { streak: number; score: number };
export interface Leaderboard {
  day: number; maxDay: number; members: number;
  dayBoard: Board<DayBoardRow>; overall: Board<OverallBoardRow>; streak: Board<StreakBoardRow>;
}

export const api = {
  register: (name: string, email: string, password: string) => req<AuthResponse>('POST', '/auth/register', { name, email, password }),
  login: (email: string, password: string) => req<AuthResponse>('POST', '/auth/login', { email, password }),
  updateMe: (name: string) => req<User>('PATCH', '/auth/me', { name }),
  changePassword: (currentPassword: string, newPassword: string) => req<void>('POST', '/auth/change-password', { currentPassword, newPassword }),
  deleteAccount: () => req<void>('DELETE', '/auth/me'),

  bootstrap: () => req<Data>('GET', '/bootstrap'),

  createWord: (w: WordInput) => req<Word>('POST', '/words', w),
  updateWord: (id: string, w: Partial<WordInput>) => req<Word>('PATCH', '/words/' + id, w),
  deleteWord: (id: string) => req<void>('DELETE', '/words/' + id),
  reviewWord: (id: string, rating: Rating, practice: boolean, day: string) =>
    req<{ word: Word; progress?: Progress }>('POST', '/words/' + id + '/review', { rating, practice, day }),

  createCategory: (c: Omit<Category, 'id'>) => req<Category>('POST', '/categories', c),
  updateCategory: (id: string, c: Partial<Omit<Category, 'id'>>) => req<Category>('PATCH', '/categories/' + id, c),
  deleteCategory: (id: string) => req<void>('DELETE', '/categories/' + id),
  createTag: (name: string) => req<{ name: string }>('POST', '/tags', { name }),
  deleteTag: (name: string) => req<void>('DELETE', '/tags/' + encodeURIComponent(name)),

  updateSettings: (s: Partial<Omit<Settings, 'name' | 'email'>>) => req<Settings>('PATCH', '/profile/settings', s),
  lookup: (word: string) => req<LookupResult>('GET', '/lookup?word=' + encodeURIComponent(word)),

  library: (q: LibraryQuery) => {
    const qs = Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => k + '=' + encodeURIComponent(String(v))).join('&');
    return req<LibraryPage>('GET', '/library' + (qs ? '?' + qs : ''));
  },
  libraryWord: (id: string) => req<LibraryWord>('GET', '/library/' + id),
  /** Exact library entry for a word (case-insensitive), or null. */
  findInLibrary: (word: string) => req<{ word: LibraryWord | null }>('GET', '/library/find?word=' + encodeURIComponent(word)),
  saveFromLibrary: (id: string) => req<{ word: Word; tag: string }>('POST', '/library/' + id + '/save'),
  shareToLibrary: (wordId: string, topic: Topic) => req<LibraryWord>('POST', '/library/share', { wordId, topic }),
  unshare: (id: string) => req<void>('DELETE', '/library/' + id),

  courses: (scope: 'joined' | 'mine' | 'public') => req<CourseSummary[]>('GET', '/courses?scope=' + scope),
  createCourse: (c: CourseInput) => req<CourseDetail>('POST', '/courses', c),
  course: (id: string) => req<CourseDetail>('GET', '/courses/' + id),
  updateCourse: (id: string, c: Partial<CourseInput>) => req<CourseDetail>('PATCH', '/courses/' + id, c),
  deleteCourse: (id: string) => req<void>('DELETE', '/courses/' + id),
  /** Replaces the words of one day (owner only). */
  setCourseDay: (id: string, day: number, words: CourseWord[]) => req<CourseDetail>('PUT', '/courses/' + id + '/days/' + day, { words }),
  /** Word details for a course: the library's entry, or generated (daily limit). Not saved until the day is PUT. */
  courseAiWord: (word: string) => req<AiWordResult>('POST', '/courses/ai-word', { word }),
  shareCourseWord: (id: string, day: number, index: number, topic?: Topic) =>
    req<CourseDetail>('POST', '/courses/' + id + '/days/' + day + '/words/' + index + '/library', topic ? { topic } : {}),
  joinCourseByCode: (code: string) => req<CourseDetail>('POST', '/courses/join', { code }),
  joinCourse: (id: string) => req<CourseDetail>('POST', '/courses/' + id + '/join'),
  leaveCourse: (id: string) => req<void>('DELETE', '/courses/' + id + '/enrollment'),
  learnCourseDay: (id: string, day: number) => req<LearnResult>('POST', '/courses/' + id + '/days/' + day + '/learn'),
  /** Opening the homework starts its timer (time breaks ties), so only call this when the learner starts. */
  getHomework: (id: string, day: number) => req<Homework>('GET', '/courses/' + id + '/days/' + day + '/homework'),
  /** One answer per question, in order ('' when left blank). Can be handed in once. */
  submitHomework: (id: string, day: number, answers: string[]) =>
    req<HomeworkResult>('POST', '/courses/' + id + '/days/' + day + '/homework', { answers }),
  /** Practice before the homework. Not graded: answers are included and checked on the device. */
  getWarmup: (id: string, day: number) => req<Warmup>('GET', '/courses/' + id + '/days/' + day + '/warmup'),
  /** Marks a day's warm-up as done: with the practice result when finished, without one when skipped. */
  warmupDone: (id: string, day: number, result?: { correct: number; total: number }) =>
    req<{ warmedUp: number[] }>('POST', '/courses/' + id + '/days/' + day + '/warmup/done', result ?? {}),

  /* question bank (owner) */
  courseQuestions: (id: string, day: number) => req<BankItem[]>('GET', '/courses/' + id + '/questions?day=' + day),
  /** Can take 10–40 s. New items wait for approval. */
  generateQuestions: (id: string, day: number, opts: { tenses?: Tense[]; perWord?: number }) =>
    req<GenerateResult>('POST', '/courses/' + id + '/days/' + day + '/questions/generate', opts),
  /** Written by the owner, so approved straight away. A recap replaces the day's recap. */
  createQuestion: (id: string, day: number, q: BankItemInput) => req<BankItem>('POST', '/courses/' + id + '/days/' + day + '/questions', q),
  updateQuestion: (id: string, qid: string, q: Partial<BankItemInput> & { status?: BankStatus }) =>
    req<BankItem>('PATCH', '/courses/' + id + '/questions/' + qid, q),
  setQuestionsStatus: (id: string, ids: string[], status: BankStatus) => req<unknown>('POST', '/courses/' + id + '/questions/status', { ids, status }),
  deleteQuestion: (id: string, qid: string) => req<void>('DELETE', '/courses/' + id + '/questions/' + qid),

  getLeaderboard: (id: string, day?: number) => req<Leaderboard>('GET', '/courses/' + id + '/leaderboard' + (day ? '?day=' + day : ''))
};
