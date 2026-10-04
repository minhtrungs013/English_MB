import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';

export interface VoicePrefs {
  /** Voice identifier; '' = the device's default English voice. */
  voice: string;
  rate: number;
  pitch: number;
}

let prefs: VoicePrefs = { voice: '', rate: 0.9, pitch: 1 };

/** Called by the app whenever the learner's voice settings change. */
export function setVoicePrefs(p: VoicePrefs): void { prefs = p; }

/**
 * Speaks English text with the learner's voice settings.
 * `factor` scales their chosen speed (e.g. 0.6 for "play slowly").
 */
export function speak(text: string, factor = 1, override?: Partial<VoicePrefs>): void {
  const p = { ...prefs, ...override };
  Speech.stop();
  Speech.speak(text, {
    language: 'en-US',
    voice: p.voice || undefined,
    rate: Math.min(2, Math.max(0.3, p.rate * factor)),
    pitch: p.pitch
  });
}

export function stopSpeaking(): void { Speech.stop(); }

/** English voices installed on this device (the list can arrive late on Android, so retry a few times). */
export function useEnglishVoices(): Speech.Voice[] {
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  useEffect(() => {
    let alive = true;
    let tries = 0;
    const load = async () => {
      const all = await Speech.getAvailableVoicesAsync().catch(() => []);
      const en = all.filter((v) => v.language.toLowerCase().startsWith('en'))
        .sort((a, b) => a.language.localeCompare(b.language) || a.name.localeCompare(b.name));
      if (!alive) return;
      if (en.length || tries >= 5) setVoices(en);
      else { tries++; setTimeout(load, 600); }
    };
    void load();
    return () => { alive = false; };
  }, []);
  return voices;
}
