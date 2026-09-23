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
- [ ] Fill in `frontend/src/api/config.ts` → `GOOGLE_OAUTH_CLIENT_IDS.web`
      with the new client ID.
- [ ] Fill in the backend's allow-list so it only accepts ID tokens minted for
      this app:
  - Local `dotnet run`: `backend-api/appsettings.json` → `Google.ClientIds`.
  - Docker: uncomment and set `Google__ClientIds__0` in `docker-compose.yml`.
  - Restart the backend for the setting to take effect.
- [ ] **Native (iOS/Android), later:** `frontend/app.json` has no
      `ios.bundleIdentifier` or `android.package` set yet — required before
      Google Console will issue matching iOS/Android client IDs (Android also
      needs the signing cert's SHA-1 fingerprint). Once set, create those
      client IDs, fill in `GOOGLE_OAUTH_CLIENT_IDS.ios` / `.android`, and add
      both IDs to the backend's `Google.ClientIds` allow-list.

## LLM and text-to-speech API keys

Both are cloud services now; the local Ollama server and the bundled Piper
voice were removed from the Docker image. Copy `.env.example` to `.env` and
fill these in:

- [ ] **`OPENAI_API_KEY`** — https://platform.openai.com/api-keys. Without it
      flashcard generation silently falls back to the offline heuristic
      generator, so the app keeps working but produces simpler cards. Set a
      spend limit on the key; `gpt-4o-mini` is cheap but not free.
- [ ] **`GOOGLE_TTS_API_KEY`** — a Google Cloud API key with the
      Text-to-Speech API enabled
      (https://console.cloud.google.com/apis/credentials). Without it audio
      export fails with a clear message; nothing else is affected.
      **Restrict the key to the Text-to-Speech API** before using it anywhere
      real — an unrestricted key is usable for any enabled API on the project.
- [ ] Consider `GOOGLE_TTS_VOICE`. **Verify any name against the live list
      first** — Google silently falls back to a default voice when the name
      does not exist, so a typo produces working audio in the wrong voice and
      nothing reports an error:

          curl "https://texttospeech.googleapis.com/v1/voices?languageCode=pl-PL" \
               -H "X-Goog-Api-Key: $GOOGLE_TTS_API_KEY"

      For pl-PL the real names are `Standard-F/G`, `Wavenet-F/G` and ~30
      `Chirp3-HD-*`. Measured on this account: `Standard-F` and `Wavenet-F`
      return byte-identical audio (same for G), so the Standard tier is the
      cheaper way to get that voice; the `Chirp3-HD-*` voices genuinely sound
      different and are the ones worth auditioning.
      https://cloud.google.com/text-to-speech/pricing

Neither key is needed for local development unless you want to exercise those
features — the app boots and runs without them.

## Expo Go on a physical device

Working, but needs one machine-specific setting:

- [ ] `.env` at the repo root sets `LAN_IP` (the host's LAN address), which
      compose passes to Expo as `REACT_NATIVE_PACKAGER_HOSTNAME`. It is
      gitignored, so each dev has to create their own — and it must be updated
      whenever DHCP hands out a new address or you switch networks. If Expo Go
      can't connect, re-check this first (`ipconfig getifaddr en0`).

## Admin & super admin

The admin panel is implemented (see [docs/admin.md](docs/admin.md)). What is
deliberately left:

- [ ] **Set `SuperAdmin__Email` and `SuperAdmin__PasswordHash` in production.**
      Without them no admin account exists at all — the app logs a warning and
      boots normally. Generate the hash with
      `cd backend-api && dotnet run -- hash-password '<password>'` and put only
      the hash in the environment; plaintext never belongs in config.
- [ ] **Set `Jwt__AdminKey` in production.** Admin tokens fall back to
      `Jwt__Key` when it is empty, which works but means one leaked secret can
      mint both student and admin tokens.
- [ ] **Email notifications.** Nothing tells a student why their course
      proposal was rejected, that a lesson was taken down, or that they have
      been banned from sharing — the rejected proposal's badge simply stops
      showing. This was the decided channel; it needs an actual mail sender
      (the reason is already stored on `CourseProposal.ReviewReason`, the
      moderation lock and the `ShareBan` row, so only delivery is missing).
- [ ] **Merging duplicate courses.** Students can no longer *propose* a name
      that already exists in their university, and approving offers the
      existing courses first — but any duplicates that already exist still
      need merging by hand (repoint `Subjects.UniversityCourseId`, then
      archive the loser). Worth a real admin action if it ever happens twice.
- [ ] **Rate limiting on `/api/admin/auth/login`.** There is none, and the
      endpoint is public by necessity.
- [ ] **The remaining `DateTimeOffset` columns are still TEXT**, so SQLite
      cannot sort or filter them and the community feed still orders in
      memory (`LessonPaging`). The converter pattern in `AppDbContext` makes
      converting them mechanical if that list ever grows large enough to
      matter.

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

## Dashboard bento grid follow-ups (not blocking)

The dashboard is a bento grid: daily-flashcards hero, two most-recent lessons,
one most-recent subject, a "Dodaj przedmiot" tile, a cross-subject "Ostatnie
oceny" digest, and a "Zobacz wszystkie przedmioty" tile (the full subject list
moved to the new `Subjects` screen).

- [x] **Persist recents**: `frontend/src/api/recents.ts` now persists recently
      visited lessons/subjects to AsyncStorage (localStorage on web) and wipes
      them on sign-out via `clearRecents()`. Empty slots fall back to the most
      recently *added* lesson/subject.
- [ ] **Rebuild the backend for `createdAt`**: the recents fallback orders by a
      new `createdAt` field added to `SubjectSummary` / `LessonSummary`
      (`backend-api/Endpoints/*.cs`). Until the running backend is rebuilt
      (`docker compose up -d --build --remove-orphans backend-api`, or restart
      the local `dotnet run`), the field is absent and the fallback degrades to
      raw API order — correct once rebuilt.
- [ ] **Profile screen**: the primary nav's "Profil" item (`AppNav`) routes to
      `Settings` as a placeholder. Add a dedicated Profile screen/route and point
      the item at it (`frontend/src/components/AppNav.tsx`, `ITEMS`).
- [ ] **Recent-grades endpoint**: the "Ostatnie oceny" tile aggregates by
      calling `GET /api/subjects/{id}/grades` for every subject
      (`fetchRecentGrades` in `DashboardScreen.tsx`). A dedicated backend
      endpoint returning the latest N entries across subjects would replace the
      N-request fan-out.

## Community feature (Społeczność) follow-ups

The community feature (universities, curated courses, course proposals, shared
lessons with likes, fork + sync) is implemented end-to-end. Universities,
courses and proposal review are owner-curated via SQL by design — see
[docs/community-admin-sql.md](docs/community-admin-sql.md). Deferred:

- [ ] **Notifications** ("your proposal was approved/rejected", "someone
      liked your lesson"). The schema already records what a notifier needs:
      `CourseProposals.ReviewedAt`/`AppliedAt` and `LessonLikes.CreatedAt`.
      Suggested shape: a `Notifications` table (`UserId`, `Kind`, `Payload`,
      `CreatedAt`, `ReadAt`) filled by the reconciliation step and the like
      endpoint, plus `GET /api/notifications` and an unread badge in
      `AppHeader`. Push (`expo-notifications`) can piggyback on it later.
- [ ] **Note format across platforms.** The web editor stores Quill HTML,
      the native editor stores markdown, and `Note.Content` has no format
      marker. This predates community sharing, but a note authored on one
      platform now renders as raw markup for a classmate on the other.
      Options: store a `Format` column, or convert to one canonical format on
      save.
- [ ] **Cross-user HTML.** Shared note HTML is rendered by Quill (web) which
      normalises it through its clipboard matcher, so scripts are dropped,
      but there is no server-side sanitiser. Add one (e.g. HtmlSanitizer) if
      the note is ever rendered outside Quill.
- [ ] **Free-text schools are never auto-linked.** When a university is added
      to the curated list, users who typed that name still have
      `UniversityId = NULL` until they pick it in Settings. A one-off SQL
      `UPDATE Users SET UniversityId = … WHERE lower(SchoolName) = …` is the
      manual workaround.
- [ ] **Community list ordering is done in memory** (SQLite can't `ORDER BY`
      a `DateTimeOffset` column). Fine for course-sized lists; revisit if a
      course ever has thousands of shared lessons.
- [ ] The `backend-api-smoke` entry in `.claude/launch.json` (port 8099,
      throwaway `smoke.db`) exists for local end-to-end checks while the
      docker container holds 8080; `backend-api/smoke.db` is gitignored.

## Auth follow-ups (from the original implementation plan, not blocking)

- [ ] Tighten CORS from `AllowAnyOrigin` to the known app origins now that
      auth is in place (`backend-api/Program.cs`).
- [ ] Consider refresh tokens / shorter-lived JWTs with re-auth, instead of
      the current single 30-day token issued at login.
- [ ] `Microsoft.Extensions.Identity.Core` triggers a `NU1510` "package will
      not be pruned" build warning — revisit whether a lighter-weight package
      can provide `PasswordHasher<T>` instead.
