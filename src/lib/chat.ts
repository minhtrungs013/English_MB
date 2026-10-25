import { fetch as streamFetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';
import { API_URL, ApiError, getToken } from './api';
import type { FamilyMember, Level } from './data';

/** A word card from the server: the data and the status (in my words / in the library / new) are real, not the bot's words. */
export interface ChatCard {
  word: string; ipa: string; pos: string; meaning: string; vi: string; ex: string; level: Level | ''; family: FamilyMember[];
  /** Missing on cards saved in the chat history before they were sent. */
  syn?: string[]; ant?: string[]; topic?: string;
  status: 'mine' | 'library' | 'new';
  /** My word's id ("mine") or the library word's id ("library"). */
  id?: string;
  /** New words: 'ai' (shared to the library when added) or 'online' (free dictionaries: only saved). */
  source?: 'ai' | 'online';
  /** The meaning this question is about, when the card's Vietnamese doesn't have it. */
  sense?: string;
}

/** True when a Vietnamese field ("nền tảng, sân ga") already has this meaning (the server's rule). */
export function hasMeaning(vi: string, sense: string): boolean {
  const s = sense.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
  const parts = vi.toLowerCase().normalize('NFC').split(/[,;/]/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return !!s && parts.some((p) => p === s || p.includes(s) || s.includes(p));
}
export interface ChatLesson { id: string; name: string; vi: string }

export interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  cards?: ChatCard[];
  /** Words the bot looked up but found nothing for. */
  missing?: string[];
  lessons?: ChatLesson[];
  error?: string;
}

export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'word'; card: ChatCard }
  | { type: 'notfound'; word: string }
  | { type: 'grammar'; lesson: ChatLesson }
  | { type: 'done'; quota: { used: number; limit: number } }
  | { type: 'error'; message: string };

export interface ChatStatus { used: number; limit: number; fake: boolean }

export async function chatStatus(): Promise<ChatStatus> {
  const res = await fetch(API_URL + '/chat', { headers: { Authorization: 'Bearer ' + (getToken() ?? '') } });
  if (!res.ok) throw new ApiError('Request failed (' + res.status + ')', res.status);
  return (await res.json()) as ChatStatus;
}

/**
 * Sends the conversation (the last 10 turns) and calls `onEvent` for each streamed event.
 * Uses expo/fetch, whose response body can be read while it streams (React Native's fetch can't).
 * Limit and validation errors come back as an ApiError before anything streams.
 */
export async function chatAsk(history: ChatMsg[], onEvent: (e: ChatEvent) => void, signal: AbortSignal): Promise<void> {
  const messages = history.filter((m) => m.text.trim() && !m.error).slice(-10).map((m) => ({ role: m.role, content: m.text.slice(0, 3000) }));
  let res: Awaited<ReturnType<typeof streamFetch>>;
  try {
    res = await streamFetch(API_URL + '/chat', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: 'Bearer ' + (getToken() ?? '') },
      body: JSON.stringify({ messages })
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new ApiError('Không kết nối được máy chủ. Bạn thử lại sau nhé.', 0);
  }
  if (!res.ok || !res.body) {
    const json = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const m = json?.message;
    throw new ApiError((Array.isArray(m) ? m.join(' ') : m) || 'Request failed (' + res.status + ')', res.status);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() ?? '';
    for (const p of parts) {
      const line = p.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      try { onEvent(JSON.parse(line.slice(5).trim()) as ChatEvent); } catch { /* ignore a malformed event */ }
    }
  }
}

/** Adds one streamed event to the bot's message being written. */
export function applyEvent(m: ChatMsg, e: ChatEvent): ChatMsg {
  switch (e.type) {
    case 'text': return { ...m, text: m.text + e.text };
    case 'word': return { ...m, cards: [...(m.cards ?? []), e.card] };
    case 'notfound': return { ...m, missing: [...(m.missing ?? []), e.word] };
    case 'grammar': return (m.lessons ?? []).some((l) => l.id === e.lesson.id) ? m : { ...m, lessons: [...(m.lessons ?? []), e.lesson] };
    case 'error': return { ...m, error: e.message };
    default: return m;
  }
}

/* ---------- history on this device (per user) ----------
 * Secure storage is the only on-device store the app has; a value should stay under ~2 KB,
 * so the history is split into chunks. The last 30 messages are kept.
 */
const CHUNK = 1800;
const MAX_CHUNKS = 40;
const key = (user: string, i: number | 'n') => 'wordbook_chat_' + user.replace(/[^A-Za-z0-9]/g, '') + '_' + i;

export async function loadChat(user: string): Promise<ChatMsg[]> {
  if (!user) return [];
  try {
    const n = Number(await SecureStore.getItemAsync(key(user, 'n'))) || 0;
    let s = '';
    for (let i = 0; i < Math.min(n, MAX_CHUNKS); i++) s += (await SecureStore.getItemAsync(key(user, i))) ?? '';
    const v = s ? (JSON.parse(s) as unknown) : [];
    return Array.isArray(v) ? (v as ChatMsg[]).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string') : [];
  } catch {
    return [];
  }
}

export async function saveChat(user: string, msgs: ChatMsg[]): Promise<void> {
  if (!user) return;
  try {
    // Word families are left out to keep it small (a card can still be saved without them).
    let keep = msgs.slice(-30).map((m) => (m.cards ? { ...m, cards: m.cards.map((c) => ({ ...c, family: [] })) } : m));
    let s = JSON.stringify(keep);
    while (s.length > CHUNK * MAX_CHUNKS && keep.length) { keep = keep.slice(2); s = JSON.stringify(keep); }
    const old = Number(await SecureStore.getItemAsync(key(user, 'n'))) || 0;
    const n = keep.length ? Math.ceil(s.length / CHUNK) : 0;
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(key(user, i), s.slice(i * CHUNK, (i + 1) * CHUNK));
    for (let i = n; i < old; i++) await SecureStore.deleteItemAsync(key(user, i));
    await SecureStore.setItemAsync(key(user, 'n'), String(n));
  } catch { /* storage unavailable: the chat lives in memory only */ }
}

/* ---------- "Add to My Vocabulary" from a card: the word form opens filled in ---------- */
let draft: ChatCard | null = null;
export function setWordDraft(c: ChatCard): void { draft = c; }
/** The card waiting to fill the add-word form (taken once). */
export function takeWordDraft(): ChatCard | null { const d = draft; draft = null; return d; }
