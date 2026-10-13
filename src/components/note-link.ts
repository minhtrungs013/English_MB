import { router } from 'expo-router';
import type { NoteLink } from '../lib/api';
import { openStep } from './day-flow';

/** The link's step names → the day flow's step screens. */
const STEP = { review: 'review', learn: 'learn', listen: 'listening', homework: 'homework' } as const;

/** Goes where a tapped notification (in-app or push) points. */
export function openNoteLink(link: NoteLink, actions: { dueIds: () => unknown[]; showToast: (msg: string) => void }): void {
  if (link.to === 'review') {
    if (!actions.dueIds().length) { actions.showToast('No words are due right now.'); return; }
    router.push({ pathname: '/review', params: { mode: 'due' } });
  } else if (link.to === 'library') {
    router.push('/library');
  } else if (link.to === 'course' && link.courseId) {
    if (link.day && link.step && STEP[link.step]) openStep(link.courseId, link.day, STEP[link.step]);
    else router.push({ pathname: '/course/[id]', params: { id: link.courseId, ...(link.tab ? { tab: link.tab } : {}) } });
  }
}
