import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { clearCache } from '../api/cache';
import { api, setUnauthorizedHandler } from '../api/client';
import { GOOGLE_OAUTH_CLIENT_IDS } from '../api/config';
import { clearToken, getToken, setToken } from '../api/token';
import type { AuthUser } from '../api/types';

// Required so the browser tab/window used for the Google OAuth redirect
// closes itself and hands control back to the app (web + Expo Go proxy).
WebBrowser.maybeCompleteAuthSession();

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  schoolName: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  signInWithGoogle: () => Promise<{ needsSchoolName: boolean }>;
  completeGoogleProfile: (schoolName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const GOOGLE_PLATFORM_CLIENT_ID = Platform.select({
  ios: GOOGLE_OAUTH_CLIENT_IDS.ios,
  android: GOOGLE_OAUTH_CLIENT_IDS.android,
  default: GOOGLE_OAUTH_CLIENT_IDS.web,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const pendingGoogleIdToken = useRef<string | null>(null);

  const [, , promptGoogleSignInAsync] = Google.useIdTokenAuthRequest({
    webClientId: GOOGLE_OAUTH_CLIENT_IDS.web,
    iosClientId: GOOGLE_OAUTH_CLIENT_IDS.ios,
    androidClientId: GOOGLE_OAUTH_CLIENT_IDS.android,
    redirectUri: AuthSession.makeRedirectUri(),
    scopes: ['openid', 'profile', 'email'],
  });

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearCache();
      setUser(null);
      setStatus('signedOut');
    });

    (async () => {
      const token = await getToken();
      if (!token) {
        setStatus('signedOut');
        return;
      }
      try {
        const me = await api.auth.me();
        setUser(me);
        setStatus('signedIn');
      } catch {
        await clearToken();
        setUser(null);
        setStatus('signedOut');
      }
    })();

    return () => setUnauthorizedHandler(null);
  }, []);

  async function signInWithEmail(email: string, password: string) {
    const response = await api.auth.login(email, password);
    await setToken(response.token);
    setUser(response.user);
    setStatus('signedIn');
  }

  async function register(data: RegisterData) {
    const response = await api.auth.register(data);
    await setToken(response.token);
    setUser(response.user);
    setStatus('signedIn');
  }

  async function signInWithGoogle(): Promise<{ needsSchoolName: boolean }> {
    if (!GOOGLE_PLATFORM_CLIENT_ID) {
      throw new Error('Logowanie przez Google nie jest jeszcze skonfigurowane.');
    }

    const result = await promptGoogleSignInAsync();

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { needsSchoolName: false };
    }
    if (result.type !== 'success') {
      throw new Error('Logowanie przez Google nie powiodło się.');
    }

    const idToken = result.params.id_token;
    if (!idToken) {
      throw new Error('Logowanie przez Google nie powiodło się.');
    }

    const response = await api.auth.google(idToken);
    if (!response.user.schoolName) {
      pendingGoogleIdToken.current = idToken;
      return { needsSchoolName: true };
    }

    await setToken(response.token);
    setUser(response.user);
    setStatus('signedIn');
    return { needsSchoolName: false };
  }

  async function completeGoogleProfile(schoolName: string) {
    const idToken = pendingGoogleIdToken.current;
    if (!idToken) {
      throw new Error('Sesja logowania przez Google wygasła — spróbuj ponownie.');
    }
    const response = await api.auth.google(idToken, schoolName);
    pendingGoogleIdToken.current = null;
    await setToken(response.token);
    setUser(response.user);
    setStatus('signedIn');
  }

  async function signOut() {
    await clearToken();
    // Must happen on every sign-out: cached grades/settings are per-user, and
    // the next account to sign in on this device would otherwise see them.
    clearCache();
    setUser(null);
    setStatus('signedOut');
  }

  return (
    <AuthContext.Provider
      value={{ status, user, signInWithEmail, register, signInWithGoogle, completeGoogleProfile, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
