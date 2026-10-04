import { router } from 'expo-router';
import { useState } from 'react';
import type { LibraryWord } from '../lib/api';
import { useStore } from '../state/store';
import { Button } from './ui';

/** Save button, or "Saved" when the word is already in my words. */
export function SaveFromLibrary({ w, size = 'sm' }: { w: LibraryWord; size?: 'sm' | 'md' | 'lg' }) {
  const { data, actions } = useStore();
  const [busy, setBusy] = useState(false);
  const mine = data.words.find((x) => x.word.toLowerCase() === w.word.toLowerCase());
  if (mine) {
    return <Button title="Saved" icon="check" variant="ghost" size={size} onPress={() => router.push({ pathname: '/word/[id]', params: { id: mine.id } })} accessibilityLabel={'Open ' + w.word + ' in my words'} />;
  }
  return <Button title="Save" icon="plus" variant="secondary" size={size} loading={busy} accessibilityLabel={'Save ' + w.word}
    onPress={async () => { setBusy(true); await actions.saveFromLibrary(w); setBusy(false); }} />;
}
