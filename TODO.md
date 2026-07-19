# TODO

Deferred tasks that need a human to finish — not blocking, but required before
the relevant feature is fully usable in production.

## Google OAuth sign-in

The email/password auth path is fully functional. Google sign-in is wired up
end-to-end in code but needs real credentials from Google Cloud Console before
it works (right now it fails fast with "Logowanie przez Google nie jest
jeszcze skonfigurowane.").

- [ ] Create a Google Cloud project and configure the OAuth consent screen
      (External, scopes: `openid`, `profile`, `email`).
- [ ] Create an OAuth 2.0 **Web application** client ID.
  - Authorized JavaScript origins: `http://localhost:8090` (dev preview) plus
    the production domain once deployed.
  - Authorized redirect URIs: trigger the Google sign-in flow once with a
    placeholder client ID — Google's `redirect_uri_mismatch` error page shows
    the exact URI it received; add that.
- [ ] Fill in `mobile-app/src/api/config.ts` → `GOOGLE_OAUTH_CLIENT_IDS.web`
      with the new client ID.
- [ ] Fill in the backend's allow-list so it only accepts ID tokens minted for
      this app:
  - Local `dotnet run`: `backend-api/appsettings.json` → `Google.ClientIds`.
  - Docker: uncomment and set `Google__ClientIds__0` in `docker-compose.yml`.
  - Restart the backend for the setting to take effect.
- [ ] **Native (iOS/Android), later:** `mobile-app/app.json` has no
      `ios.bundleIdentifier` or `android.package` set yet — required before
      Google Console will issue matching iOS/Android client IDs (Android also
      needs the signing cert's SHA-1 fingerprint). Once set, create those
      client IDs, fill in `GOOGLE_OAUTH_CLIENT_IDS.ios` / `.android`, and add
      both IDs to the backend's `Google.ClientIds` allow-list.

## Expo Go on a physical device

Working, but needs one machine-specific setting:

- [ ] `.env` at the repo root sets `LAN_IP` (the host's LAN address), which
      compose passes to Expo as `REACT_NATIVE_PACKAGER_HOSTNAME`. It is
      gitignored, so each dev has to create their own — and it must be updated
      whenever DHCP hands out a new address or you switch networks. If Expo Go
      can't connect, re-check this first (`ipconfig getifaddr en0`).

## Spaced repetition follow-ups (from the Anki-scheduler plan, not blocking)

The Anki-style scheduler, per-user SRS settings, daily/extra queues and the
Settings screen are implemented. Deferred enhancements:

- [ ] **Push notifications**: wire `expo-notifications` to fire a morning
      reminder with the due count (the dashboard badge is the only "notifier"
      today). Needs notification permissions + a scheduled local notification
      keyed off `GET /api/flashcards/daily/summary`.
- [ ] **Leech tagging**: flag/suspend cards once `Lapses` crosses a threshold
      (Anki's default is 8) so chronically-failed cards stop dominating reviews.
      `SpacedRepetitionState.Lapses` is already tracked.
- [ ] **FSRS**: once enough review history accrues, offer FSRS as an alternate
      `ISpacedRepetitionService` implementation (the interface is already the
      seam) with a per-user opt-in in `UserSrsSettings`.

## Auth follow-ups (from the original implementation plan, not blocking)

- [ ] Tighten CORS from `AllowAnyOrigin` to the known app origins now that
      auth is in place (`backend-api/Program.cs`).
- [ ] Consider refresh tokens / shorter-lived JWTs with re-auth, instead of
      the current single 30-day token issued at login.
- [ ] `Microsoft.Extensions.Identity.Core` triggers a `NU1510` "package will
      not be pruned" build warning — revisit whether a lighter-weight package
      can provide `PasswordHasher<T>` instead.
