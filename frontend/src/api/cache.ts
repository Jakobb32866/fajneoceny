/**
 * In-memory cache for API reads, shared across screens for the life of the app
 * session. Follows the module-singleton shape already used by token.ts.
 *
 * Stores the *parsed* payload (SubjectSummary[], SrsSettings, …) keyed by a
 * logical resource key from cacheKeys.ts — not Response objects, so a cached
 * value is handed straight to a screen with no re-parsing.
 *
 * Deliberately not persisted to disk: this data is per-user and auth-gated, so
 * persisting it would require guaranteeing a wipe on every sign-out and account
 * switch to avoid leaking one student's grades to the next.
 */

interface Entry {
  data: unknown;
  /** Epoch ms of the last successful fetch. 0 means "invalidated, refetch". */
  fetchedAt: number;
}

const store = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string): void {
  listeners.get(key)?.forEach((listener) => listener());
}

export function subscribe(key: string, listener: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

/**
 * Snapshot for useSyncExternalStore. Returns the Entry object itself so its
 * identity doubles as the change signal — every write replaces the object.
 */
export function getEntry(key: string): Entry | undefined {
  return store.get(key);
}

export function getCached<T>(key: string): T | undefined {
  return store.get(key)?.data as T | undefined;
}

export function isStale(key: string, staleMs: number): boolean {
  const entry = store.get(key);
  if (!entry) return true;
  return Date.now() - entry.fetchedAt >= staleMs;
}

/** Write-through after a mutation, so a refetch isn't needed at all. */
export function setCached<T>(key: string, data: T): void {
  store.set(key, { data, fetchedAt: Date.now() });
  notify(key);
}

/**
 * Marks matching entries stale rather than deleting them, so subscribers keep
 * rendering the old value while the refetch runs. Deleting would momentarily
 * expose `undefined` and flash a spinner over good content.
 *
 * Matches the key itself plus anything nested under it: invalidate('subject/42')
 * also hits 'subject/42/grades' and 'subject/42/lessons'. The trailing-slash
 * check keeps 'subjects' from matching the 'subject' prefix.
 */
export function invalidate(prefix: string): void {
  for (const [key, entry] of store) {
    if (key === prefix || key.startsWith(`${prefix}/`)) {
      store.set(key, { data: entry.data, fetchedAt: 0 });
      notify(key);
    }
  }
}

/**
 * Fetches and caches, collapsing concurrent callers onto one request — several
 * screens read lesson/{id}, and without this a push+focus would fire two.
 * Rejections are not cached; the next focus retries.
 */
export function fetchCached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetcher()
    .then((data) => {
      setCached(key, data);
      return data;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/** Full wipe. Must run on sign-out and on a 401 so the next user starts clean. */
export function clearCache(): void {
  const keys = [...listeners.keys()];
  store.clear();
  inFlight.clear();
  keys.forEach(notify);
}
