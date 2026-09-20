/**
 * Structured API failures. `request()` in client.ts throws these instead of a
 * bare Error so screens can branch on the HTTP status and show their own
 * wording, rather than surfacing the raw "POST /api/auth/login failed: 401"
 * string to the user.
 *
 * `message` deliberately stays technical — it is what ends up in logs and in
 * screens that have no tailored copy yet. User-facing text belongs in the
 * screen (see auth/authErrors.ts for the auth flow).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly method: string;
  readonly path: string;
  /** Raw response body, useful for debugging; not safe to show to users. */
  readonly body: string;

  constructor(params: { status: number; method: string; path: string; body: string }) {
    super(`${params.method} ${params.path} failed: ${params.status} ${params.body}`);
    this.name = 'ApiError';
    this.status = params.status;
    this.method = params.method;
    this.path = params.path;
    this.body = params.body;
  }
}

/**
 * True when the request never reached the server — airplane mode, wrong LAN
 * address, backend not running. `fetch` rejects with a TypeError in that case
 * rather than resolving with a status, so there is nothing to branch on but
 * the absence of an ApiError.
 */
export function isNetworkError(error: unknown): boolean {
  return error instanceof Error && !(error instanceof ApiError) && error.name === 'TypeError';
}
