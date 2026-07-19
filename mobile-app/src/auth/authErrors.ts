import { ApiError, isNetworkError } from '../api/errors';

/**
 * Turns an auth request failure into copy a student can act on.
 *
 * The status codes here mirror backend-api/Endpoints/AuthEndpoints.cs — keep
 * the two in sync. Server-supplied text is deliberately ignored: it is English
 * and phrased for developers ("An account with this email already exists.").
 */

const NETWORK = 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.';
const UNEXPECTED = 'Coś poszło nie tak. Spróbuj ponownie za chwilę.';
const SERVER = 'Serwer nie odpowiada. Spróbuj ponownie za chwilę.';

function serverSideMessage(status: number): string | null {
  if (status >= 500) return SERVER;
  if (status === 429) return 'Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.';
  return null;
}

export function loginErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return NETWORK;
  if (error instanceof ApiError) {
    const shared = serverSideMessage(error.status);
    if (shared) return shared;
    // The backend returns 401 for both "no such user" and "wrong password",
    // and should keep doing so — telling them apart lets anyone probe which
    // emails have accounts.
    if (error.status === 401) return 'Nieprawidłowy e-mail lub hasło.';
    if (error.status === 400) return 'Podaj e-mail i hasło.';
  }
  return UNEXPECTED;
}

export function registerErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return NETWORK;
  if (error instanceof ApiError) {
    const shared = serverSideMessage(error.status);
    if (shared) return shared;
    if (error.status === 409) return 'Konto z tym adresem e-mail już istnieje. Zaloguj się.';
    if (error.status === 400) return 'Uzupełnij wszystkie pola, żeby założyć konto.';
  }
  return UNEXPECTED;
}

export function googleErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return NETWORK;
  if (error instanceof ApiError) {
    const shared = serverSideMessage(error.status);
    if (shared) return shared;
    if (error.status === 401) return 'Nie udało się zweryfikować konta Google. Spróbuj ponownie.';
  }
  // signInWithGoogle throws plain Errors with copy already written for the
  // student (unconfigured client id, expired session) — pass those through.
  if (error instanceof Error && error.message) return error.message;
  return UNEXPECTED;
}
