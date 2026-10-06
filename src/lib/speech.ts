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

/** A dialogue speaker's voice: a voice identifier ('' = the learner's own voice setting) and a pitch multiplier. */
export interface SpeakerVoice { voice: string; pitch: number }

/**
 * Speaks one line and calls `onEnd(true)` when it finishes, `onEnd(false)` when it's stopped or fails
 * (stopping also ends whatever was playing, so callers should ignore ends from an earlier line).
 */
export function speakThen(text: string, onEnd: (finished: boolean) => void, factor = 1, v?: SpeakerVoice): void {
  Speech.stop();
  Speech.speak(text, {
    language: 'en-US',
    voice: (v?.voice || prefs.voice) || undefined,
    rate: Math.min(2, Math.max(0.3, prefs.rate * factor)),
    pitch: Math.min(2, Math.max(0.5, prefs.pitch * (v?.pitch ?? 1))),
    onDone: () => onEnd(true),
    onStopped: () => onEnd(false),
    onError: () => onEnd(false)
  });
}

// Common voice names (iOS) and Google TTS voice codes (Android) by gender; most devices don't say otherwise.
const FEMALE_RE = /female|woman|samantha|victoria|karen|moira|tessa|fiona|veena|allison|ava\b|susan|zoe|kate|serena|nicky|joelle|catherine|martha|\b(sfg|iob|iog|tpc|tpf|gba|gbc|gbg)\b/i;
const MALE_RE = /(^|[^e])male|\bman\b|daniel|alex\b|fred|\btom\b|aaron|arthur|gordon|oliver|rishi|\blee\b|evan|nathan|ralph|albert|reed|eddy|\b(iol|iom|tpd|gbb|gbd|rjs)\b/i;
function genderOf(v: Speech.Voice): 'female' | 'male' | '' {
  const s = v.name + ' ' + v.identifier;
  if (FEMALE_RE.test(s)) return 'female';
  if (MALE_RE.test(s)) return 'male';
  return '';
}

/**
 * Two different voices for a dialogue's speakers, preferring voices whose name suggests the speaker's gender
 * (US English first). When the device doesn't have them, the learner's voice is used with a higher pitch
 * for women (1.15) and a lower one for men (0.85), so the speakers still sound different.
 */
export function pickDialogueVoices(voices: Speech.Voice[], genders: ('female' | 'male')[]): SpeakerVoice[] {
  const used = new Set<string>();
  const us = (v: Speech.Voice) => (v.language.toLowerCase().replace('_', '-') === 'en-us' ? 0 : 1);
  const picked = genders.map((g) => {
    const v = voices.filter((x) => !used.has(x.identifier) && genderOf(x) === g).sort((a, b) => us(a) - us(b))[0];
    if (v) used.add(v.identifier);
    return v ? { voice: v.identifier, pitch: 1 } : { voice: '', pitch: g === 'female' ? 1.15 : 0.85 };
  });
  // Same voice and pitch for both (e.g. two women on a device without named voices): make them differ.
  if (picked.length === 2 && picked[0].voice === picked[1].voice && picked[0].pitch === picked[1].pitch) {
    return [{ ...picked[0], pitch: 1.15 }, { ...picked[1], pitch: 0.85 }];
  }
  return picked;
}

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
