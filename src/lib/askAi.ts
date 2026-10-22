import { router } from 'expo-router';

/** Opens the chat assistant and asks about a word (from a search that found nothing in the library). */
export function askAi(word: string): void {
  router.push({ pathname: '/chat', params: { ask: '“' + word.trim() + '” nghĩa là gì? Cho mình ví dụ khi đi làm.' } });
}
