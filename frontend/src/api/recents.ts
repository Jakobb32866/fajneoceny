import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Tracks the lessons and subjects the student has most recently opened, so the
 * dashboard can surface quick links back to them.
 *
 * Persisted to device storage (AsyncStorage — localStorage on web) so the
 * dashboard tiles survive a page refresh / app restart. This is per-user data,
 * so clearRecents() wipes both memory and storage on sign-out (see
 * AuthContext.signOut) to avoid leaking one student's titles to the next.
 */

export interface RecentLesson {
  lessonId: string;
  lessonTitle: string;
  visitedAt: number;
}

export interface RecentSubject {
  subjectId: string;
  subjectName: string;
  visitedAt: number;
}

interface RecentsState {
  lessons: RecentLesson[];
  subjects: RecentSubject[];
  /** False until the persisted state has been loaded from storage. */
  hydrated: boolean;
}

const MAX = 8;
const STORAGE_KEY = 'fajneoceny_recents_v1';

// A single snapshot object whose identity is the change signal for
// useSyncExternalStore — every write replaces it wholesale.
let state: RecentsState = { lessons: [], subjects: [], hydrated: false };

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function persist(): void {
  AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ lessons: state.lessons, subjects: state.subjects }),
  ).catch(() => {
    // Best-effort: a storage failure just means recents won't survive restart.
  });
}

function dedupeById<T>(items: T[], idOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = idOf(item);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out.slice(0, MAX);
}

// Load persisted recents once at startup. Any visits recorded before this
// resolves are merged ahead of the stored ones (they are newer).
AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    let stored: { lessons?: RecentLesson[]; subjects?: RecentSubject[] } = {};
    if (raw) {
      try {
        stored = JSON.parse(raw);
      } catch {
        stored = {};
      }
    }
    state = {
      lessons: dedupeById([...state.lessons, ...(stored.lessons ?? [])], (l) => l.lessonId),
      subjects: dedupeById([...state.subjects, ...(stored.subjects ?? [])], (s) => s.subjectId),
      hydrated: true,
    };
    notify();
  })
  .catch(() => {
    state = { ...state, hydrated: true };
    notify();
  });

export function recordLessonVisit(lessonId: string, lessonTitle: string): void {
  const lessons = dedupeById(
    [{ lessonId, lessonTitle, visitedAt: Date.now() }, ...state.lessons],
    (l) => l.lessonId,
  );
  state = { ...state, lessons };
  notify();
  persist();
}

export function recordSubjectVisit(subjectId: string, subjectName: string): void {
  const subjects = dedupeById(
    [{ subjectId, subjectName, visitedAt: Date.now() }, ...state.subjects],
    (s) => s.subjectId,
  );
  state = { ...state, subjects };
  notify();
  persist();
}

/** Must run on sign-out so the next account on this device starts clean. */
export function clearRecents(): void {
  state = { lessons: [], subjects: [], hydrated: true };
  notify();
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

/** Reactive read of the current recents snapshot. */
export function useRecents(): RecentsState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
