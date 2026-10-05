import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  api, ApiError, loadToken, setToken, setUnauthorizedHandler,
  type AuthResponse, type LibraryWord, type Topic, type WordInput
} from '../lib/api';
import { DAY, MIN, dayKey, isDue, type Category, type Data, type Rating, type Settings, type Word } from '../lib/data';
import { setVoicePrefs, stopSpeaking } from '../lib/speech';
import { makePalette, type Palette } from '../lib/theme';

export interface Toast { msg: string; kind: 'ok' | 'bad' }
type Status = 'booting' | 'auth' | 'loading' | 'ready' | 'error';

const EMPTY: Data = {
  words: [], cats: [], tags: [], shared: [], userId: '',
  settings: { name: '', email: '', goal: '20', dir: 'en-vi', autoplay: true, showEx: true, theme: 'light', accent: 'indigo', voice: '', rate: 0.9, pitch: 1 },
  progress: { streak: 0, lastStreakDay: '', reviewedDay: '', reviewedToday: 0 }
};

export function errMsg(e: unknown): string {
  return e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong.';
}

function useStoreState() {
  const [data, setData] = useState<Data>(EMPTY);
  const [status, setStatus] = useState<Status>('booting');
  const [loadError, setLoadError] = useState('');
  const [toast, setToastState] = useState<Toast | null>(null);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingSettings = useRef<Partial<Settings>>({});

  const patch = (p: Partial<Data> | ((d: Data) => Partial<Data>)) =>
    setData((d) => ({ ...d, ...(typeof p === 'function' ? p(d) : p) }));

  const showToast = (msg: string, kind: Toast['kind'] = 'ok') => {
    clearTimeout(toastTimer.current);
    setToastState({ msg, kind });
    toastTimer.current = setTimeout(() => setToastState(null), 2800);
  };
  /** Runs an API call; on failure shows the error as a toast and returns undefined. */
  const call = async <T,>(p: Promise<T>): Promise<T | undefined> => {
    try { return await p; } catch (e) { showToast(errMsg(e), 'bad'); return undefined; }
  };

  const load = async () => {
    setStatus('loading');
    setLoadError('');
    try {
      const d = await api.bootstrap();
      setData({ ...EMPTY, ...d, settings: { ...EMPTY.settings, ...d.settings } });
      setStatus('ready');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // already logged out
      setLoadError(errMsg(e));
      setStatus('error');
    }
  };

  const logout = async (msg?: string) => {
    await setToken(null);
    stopSpeaking();
    clearTimeout(settingsTimer.current);
    pendingSettings.current = {};
    setData(EMPTY);
    setStatus('auth');
    if (msg) showToast(msg, 'bad');
  };

  useEffect(() => {
    setUnauthorizedHandler((msg) => { void logout(msg); });
    void (async () => {
      if (await loadToken()) await load();
      else setStatus('auth');
    })();
    return () => { clearTimeout(toastTimer.current); clearTimeout(settingsTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the speech module in sync with the voice settings.
  const { voice, rate: speechRate, pitch } = data.settings;
  useEffect(() => { setVoicePrefs({ voice, rate: speechRate, pitch }); }, [voice, speechRate, pitch]);

  /* ---------- auth ---------- */
  const startSession = async (res: AuthResponse) => { await setToken(res.accessToken); await load(); };
  const login = async (email: string, password: string) => startSession(await api.login(email, password));
  const register = async (name: string, email: string, password: string) => startSession(await api.register(name, email, password));

  /* ---------- words ---------- */
  /** Creates (no id) or updates a word. Throws on failure so the form can show the message. */
  const saveWord = async (input: WordInput, id?: string): Promise<Word> => {
    if (id) {
      const w = await api.updateWord(id, input);
      patch((d) => ({ words: d.words.map((x) => (x.id === id ? w : x)) }));
      return w;
    }
    const w = await api.createWord(input);
    patch((d) => ({ words: [w, ...d.words] }));
    return w;
  };
  const deleteWord = async (id: string): Promise<boolean> => {
    const w = dataRef.current.words.find((x) => x.id === id);
    const ok = (await call(api.deleteWord(id).then(() => true))) ?? false;
    if (ok) { patch((d) => ({ words: d.words.filter((x) => x.id !== id) })); showToast('Deleted “' + (w?.word ?? '') + '”.'); }
    return ok;
  };
  /* ---------- categories & tags ---------- */
  /** Creates (no id) or updates a category. Throws on failure so the form can show the message. */
  const saveCategory = async (name: string, icon: Category['icon'], id?: string): Promise<Category> => {
    if (id) {
      const c = await api.updateCategory(id, { name, icon });
      patch((d) => ({ cats: d.cats.map((x) => (x.id === id ? c : x)) }));
      return c;
    }
    const c = await api.createCategory({ name, icon });
    patch((d) => ({ cats: [...d.cats, c] }));
    return c;
  };
  /** Deletes a category; its words become uncategorized. */
  const deleteCategory = async (id: string): Promise<boolean> => {
    const ok = (await call(api.deleteCategory(id).then(() => true))) ?? false;
    if (ok) {
      patch((d) => ({ cats: d.cats.filter((c) => c.id !== id), words: d.words.map((w) => (w.cat === id ? { ...w, cat: '' } : w)) }));
      showToast('Category deleted. Its words are now uncategorized.');
    }
    return ok;
  };
  /** Deletes a tag and removes it from every word. */
  const deleteTag = async (name: string): Promise<boolean> => {
    const ok = (await call(api.deleteTag(name).then(() => true))) ?? false;
    if (ok) {
      patch((d) => ({ tags: d.tags.filter((x) => x !== name), words: d.words.map((w) => (w.tags.includes(name) ? { ...w, tags: w.tags.filter((x) => x !== name) } : w)) }));
      showToast('Tag #' + name + ' deleted.');
    }
    return ok;
  };
  const createTag = async (name: string): Promise<string | undefined> => {
    const res = await call(api.createTag(name));
    if (res) patch((d) => ({ tags: d.tags.includes(res.name) ? d.tags : [...d.tags, res.name] }));
    return res?.name;
  };

  /** Rates a flashcard: updates the screen right away, then syncs with the server's result. */
  const rate = (id: string, r: Rating, practice: boolean) => {
    const now = Date.now();
    const today = dayKey(now);
    patch((d) => {
      const words = d.words.map((w): Word => {
        if (w.id !== id) return w;
        const goods = w.hist.filter((h) => h.r === 'Good' || h.r === 'Easy').length;
        let status = w.status, dueAt = w.dueAt;
        if (r === 'Again') { status = 'learning'; dueAt = now + 10 * MIN; }
        else if (r === 'Hard') { status = 'learning'; dueAt = now + DAY; }
        else if (r === 'Good') { status = goods >= 2 ? 'mastered' : 'learning'; dueAt = now + 3 * DAY; }
        else { status = goods >= 1 ? 'mastered' : 'learning'; dueAt = now + 7 * DAY; }
        return { ...w, status, dueAt, hist: [{ at: now, r }, ...w.hist] };
      });
      if (practice) return { words };
      const p = d.progress;
      const progress = { ...p, reviewedDay: today, reviewedToday: (p.reviewedDay === today ? p.reviewedToday : 0) + 1 };
      if (p.lastStreakDay !== today) {
        const y = new Date(); y.setDate(y.getDate() - 1);
        progress.streak = p.lastStreakDay === dayKey(y) ? p.streak + 1 : 1;
        progress.lastStreakDay = today;
      }
      return { words, progress };
    });
    void call(api.reviewWord(id, r, practice, today)).then((res) => {
      if (!res) return;
      patch((d) => ({ words: d.words.map((w) => (w.id === res.word.id ? res.word : w)), ...(res.progress ? { progress: res.progress } : {}) }));
    });
  };

  /** Due words, oldest first, capped at the daily goal. */
  const dueIds = (): string[] => {
    const d = dataRef.current;
    const now = Date.now();
    return d.words.filter((w) => isDue(w, now)).sort((a, b) => a.dueAt - b.dueAt).slice(0, Number(d.settings.goal) || 20).map((w) => w.id);
  };

  /* ---------- library ---------- */
  const saveFromLibrary = async (lw: LibraryWord): Promise<Word | undefined> => {
    const res = await call(api.saveFromLibrary(lw.id));
    if (!res) return undefined;
    patch((d) => ({
      words: [res.word, ...d.words],
      tags: d.tags.includes(res.tag) ? d.tags : [...d.tags, res.tag],
      shared: d.shared.includes(lw.word.toLowerCase()) ? d.shared : [...d.shared, lw.word.toLowerCase()]
    }));
    showToast('Saved “' + lw.word + '” to your words.');
    return res.word;
  };
  const shareWord = async (w: Word, topic: Topic): Promise<boolean> => {
    const res = await call(api.shareToLibrary(w.id, topic));
    if (!res) return false;
    patch((d) => ({ shared: [...d.shared, w.word.toLowerCase()] }));
    showToast('Shared “' + w.word + '” to the library.');
    return true;
  };
  const unshare = async (lw: LibraryWord): Promise<boolean> => {
    const ok = (await call(api.unshare(lw.id).then(() => true))) ?? false;
    if (ok) { patch((d) => ({ shared: d.shared.filter((x) => x !== lw.word.toLowerCase()) })); showToast('Removed “' + lw.word + '” from the library.'); }
    return ok;
  };

  /* ---------- settings (saved half a second after the last change) ---------- */
  const setSettings = (p: Partial<Settings>) => {
    patch((d) => ({ settings: { ...d.settings, ...p } }));
    pendingSettings.current = { ...pendingSettings.current, ...p };
    clearTimeout(settingsTimer.current);
    settingsTimer.current = setTimeout(() => {
      const { name, ...prefs } = pendingSettings.current;
      delete prefs.email;
      pendingSettings.current = {};
      if (name !== undefined && name.trim()) void call(api.updateMe(name.trim()));
      if (Object.keys(prefs).length) void call(api.updateSettings(prefs));
    }, 500);
  };

  return {
    data, status, loadError, toast,
    actions: {
      reload: load, login, register, logout, showToast, call,
      saveWord, deleteWord, createTag, deleteTag, saveCategory, deleteCategory, rate, dueIds,
      saveFromLibrary, shareWord, unshare, setSettings
    }
  };
}

type Store = ReturnType<typeof useStoreState>;
const StoreContext = createContext<Store | null>(null);
const ThemeContext = createContext<Palette>(makePalette(false, 'indigo'));

export function StoreProvider({ children }: { children: ReactNode }) {
  const store = useStoreState();
  const scheme = useColorScheme();
  const { theme, accent } = store.data.settings;
  const dark = theme === 'dark' || (theme === 'system' && scheme === 'dark');
  return (
    <StoreContext.Provider value={store}>
      <ThemeContext.Provider value={makePalette(dark, accent)}>{children}</ThemeContext.Provider>
    </StoreContext.Provider>
  );
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside <StoreProvider>');
  return s;
}
export const useTheme = (): Palette => useContext(ThemeContext);
