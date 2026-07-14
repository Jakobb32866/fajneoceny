import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Persists the auth JWT. Mirrors the Platform.OS === 'web' fallback pattern
 * used elsewhere in this codebase (see src/utils/confirm.ts,
 * src/utils/exportAudio.ts) since expo-secure-store has no web implementation.
 */

const TOKEN_KEY = 'fajneoceny_auth_token';
let cachedToken: string | null | undefined; // undefined = not yet loaded from storage

async function readStoredToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getToken(): Promise<string | null> {
  if (cachedToken === undefined) {
    cachedToken = await readStoredToken();
  }
  return cachedToken;
}

/** Synchronous read of whatever is currently cached in memory (no storage hit). */
export function getTokenSync(): string | null {
  return cachedToken ?? null;
}

export async function setToken(token: string): Promise<void> {
  cachedToken = token;
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
