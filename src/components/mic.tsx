import { useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { useTheme } from '../state/store';
import { Icon } from './ui';

/** The speech recognition module; null in a build without it (e.g. Expo Go), where the mic is simply hidden. */
type Sub = { remove(): void };
type Mod = {
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  isRecognitionAvailable(): boolean;
  start(o: { lang: string; interimResults: boolean; continuous: boolean }): void;
  stop(): void; abort(): void;
  addListener(event: string, cb: (e: { results?: { transcript: string }[]; isFinal?: boolean; error?: string; message?: string }) => void): Sub;
};
let mod: Mod | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = (require('expo-speech-recognition') as { ExpoSpeechRecognitionModule: Mod }).ExpoSpeechRecognitionModule ?? null;
} catch { mod = null; }

const ERRORS: Record<string, string> = {
  'not-allowed': 'Allow the microphone and speech recognition in Settings to speak your answer.',
  'service-not-allowed': 'Turn on speech recognition (Siri & Dictation on iPhone, Google voice typing on Android).',
  'language-not-supported': 'English speech recognition isn’t available on this phone.',
  'no-speech': 'I didn’t hear anything — try again a bit closer to the microphone.',
  network: 'Speech recognition needs an internet connection.'
};

/**
 * 🎤 Speak instead of typing: what you say (English) is written into the box after what's already there, as you speak.
 * Press again to stop.
 */
export function MicButton({ value, onChange, disabled, onError }: { value: string; onChange: (v: string) => void; disabled?: boolean; onError?: (m: string) => void }) {
  const t = useTheme();
  const [on, setOn] = useState(false);
  const base = useRef('');
  const valueRef = useRef(value);
  valueRef.current = value;
  const subs = useRef<Sub[]>([]);
  const clear = () => { subs.current.forEach((x) => x.remove()); subs.current = []; };
  useEffect(() => () => { clear(); if (on) mod?.abort(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!mod) return null;
  const m = mod;

  const toggle = async () => {
    if (on) { m.stop(); return; }
    const perm = await m.requestPermissionsAsync().catch(() => ({ granted: false }));
    if (!perm.granted) { onError?.(ERRORS['not-allowed']); return; }
    if (!m.isRecognitionAvailable()) { onError?.(ERRORS['service-not-allowed']); return; }
    base.current = valueRef.current.trim();
    clear();
    subs.current = [
      m.addListener('result', (e) => {
        const said = (e.results?.[0]?.transcript ?? '').trim();
        if (said) onChange((base.current ? base.current + ' ' : '') + said.charAt(0).toUpperCase() + said.slice(1));
      }),
      m.addListener('error', (e) => { if (e.error !== 'aborted') onError?.(ERRORS[e.error ?? ''] ?? 'Couldn’t hear you (' + (e.error ?? 'error') + ').'); }),
      m.addListener('end', () => { setOn(false); clear(); })
    ];
    try { m.start({ lang: 'en-US', interimResults: true, continuous: false }); setOn(true); } catch { setOn(false); clear(); }
  };

  return (
    <Pressable onPress={() => void toggle()} disabled={disabled} accessibilityRole="button" accessibilityLabel={on ? 'Stop listening' : 'Speak your answer'} hitSlop={6}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1,
        backgroundColor: on ? t.danger : pressed ? t.surface2 : t.primarySoft })}>
      <Icon name={on ? 'stop' : 'mic'} size={20} color={on ? '#fff' : t.primaryInk} />
    </Pressable>
  );
}
