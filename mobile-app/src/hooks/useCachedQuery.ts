import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { fetchCached, getEntry, invalidate, subscribe } from '../api/cache';

/** Matches the plan's 5-minute freshness window. */
export const DEFAULT_STALE_MS = 5 * 60 * 1000;

interface Options {
  staleMs?: number;
  /** Skip fetching entirely — for data that isn't ready yet (missing id, etc.). */
  enabled?: boolean;
}

interface Result<T> {
  data: T | undefined;
  /** True only until the *first* value lands. A background revalidation of
   *  already-cached data stays false, so screens never flash a spinner over
   *  content they are already showing. */
  loading: boolean;
  error: unknown;
  /** Marks the key stale and refetches. */
  refetch: () => void;
}

/**
 * Read-through cache hook. Renders cached data instantly, and refetches on
 * screen focus only when the entry is missing or older than `staleMs`.
 *
 * Replaces the `useCallback(load)` + `useFocusEffect(load)` pair that every
 * screen used to repeat, which refetched unconditionally on every focus.
 */
export function useCachedQuery<T>(key: string, fetcher: () => Promise<T>, options: Options = {}): Result<T> {
  const { staleMs = DEFAULT_STALE_MS, enabled = true } = options;
  const [error, setError] = useState<unknown>(null);

  // Screens pass an inline arrow, so the fetcher identity changes every render.
  // Holding it in a ref keeps it out of effect dependencies.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const entry = useSyncExternalStore(
    useCallback((onChange: () => void) => subscribe(key, onChange), [key]),
    useCallback(() => getEntry(key), [key]),
    useCallback(() => getEntry(key), [key]),
  );

  const run = useCallback(() => {
    if (!enabled) return;
    const current = getEntry(key);
    const fresh = current && Date.now() - current.fetchedAt < staleMs;
    if (fresh) return;

    setError(null);
    fetchCached(key, fetcherRef.current).catch((e) => setError(e));
  }, [key, staleMs, enabled]);

  // Covers mount, and invalidation while this screen is already focused — the
  // entry object identity changes, re-running this.
  useEffect(run, [run, entry]);

  // Covers returning to an already-mounted screen whose data has since gone
  // stale. Native-stack keeps parent screens mounted, so this is the common case.
  useFocusEffect(run);

  const refetch = useCallback(() => {
    invalidate(key);
  }, [key]);

  return {
    data: entry?.data as T | undefined,
    loading: entry === undefined && enabled && error === null,
    error,
    refetch,
  };
}
