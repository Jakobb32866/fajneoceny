import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Persists the auth JWTs. Mirrors the Platform.OS === 'web' fallback pattern
 * used elsewhere in this codebase (see src/utils/confirm.ts,
 * src/utils/exportAudio.ts) since expo-secure-store has no web implementation.
 *
 * Two independent tokens are stored under separate keys. Students and admins
 * are different account types on the backend, with differently-signed tokens
 * and mutually exclusive routes — so signing in to the admin panel must not
 * evict a student session on the same device (and vice versa). The request
 * layer picks which one to send based on the path.
 */

export type TokenKind = 'student' | 'admin';

const TOKEN_KEYS: Record<TokenKind, string> = {
  student: 'fajneoceny_auth_token',
  admin: 'fajneoceny_admin_token',
};

// undefined = not yet loaded from storage
const cache: Record<TokenKind, string | null | undefined> = {
  student: undefined,
  admin: undefined,
};

async function readStoredToken(kind: TokenKind): Promise<string | null> {
  const key = TOKEN_KEYS[kind];
  if (Platform.OS === 'web') {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  }
  return SecureStore.getItemAsync(key);
}

export async function getToken(kind: TokenKind = 'student'): Promise<string | null> {
  if (cache[kind] === undefined) {
    cache[kind] = await readStoredToken(kind);
  }
  return cache[kind] ?? null;
}

/** Synchronous read of whatever is currently cached in memory (no storage hit). */
export function getTokenSync(kind: TokenKind = 'student'): string | null {
  return cache[kind] ?? null;
}

export async function setToken(token: string, kind: TokenKind = 'student'): Promise<void> {
  cache[kind] = token;
  const key = TOKEN_KEYS[kind];
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, token);
    return;
  }
  await SecureStore.setItemAsync(key, token);
}

export async function clearToken(kind: TokenKind = 'student'): Promise<void> {
  cache[kind] = null;
  const key = TOKEN_KEYS[kind];
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
