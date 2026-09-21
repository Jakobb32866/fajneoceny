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

## Community feature (schema laid, endpoints/UI not built yet)

The university/community *foundation* is in place: domain entities
(`University`, `UniversityCourse`, `CourseProposal`, `LessonLike`, plus
`User.UniversityId`, `Subject.UniversityCourseId`, and the sharing/fork/like
fields on `Lesson`), the `AddUniversitiesAndCommunity` migration, the PJATK
seed data (`backend-api/Data/UniversitySeeder.cs`), the shared
`CommunityAuthorization` / `CommunityQueries` helpers
(`backend-api/Services/Community/`), and the frontend API contract
(`frontend/src/api/types.ts`, `client.ts`, `cacheKeys.ts`,
`navigation/types.ts`). None of the actual behavior is implemented yet:

- [ ] **`backend-api/Endpoints/UniversityEndpoints.cs`**: `GET
      /api/universities`, `GET /api/universities/mine/courses`, `PUT
      /api/settings/university`. Currently an empty stub.
- [ ] **`backend-api/Endpoints/CommunityEndpoints.cs`**: share/unshare a
      lesson, sync-fork, list/get community lessons, like/unlike, fork.
      Currently an empty stub.
- [ ] **`SubjectEndpoints.cs`**: `POST /api/subjects` needs to accept the new
      `{ name?, description?, universityCourseId?, proposeAsCourse? }` shape
      (the frontend client already sends it) and create a `CourseProposal`
      when `proposeAsCourse` is set; subject responses need the new
      `universityCourseId` / `courseName` / `courseCode` / `proposalStatus`
      fields the frontend types already expect.
- [ ] **`AuthEndpoints.cs`**: `UserDto`/register/google need
      `universityId` / `universityName` / `isRecognised`, matching the
      extended frontend `AuthUser`.
- [ ] **Frontend UI**: no screens yet. `RootStackParamList` has a
      `CommunityLesson` route declared for a future screen, but nothing
      registers it.
- [ ] University/course rows themselves stay owner-curated via direct SQL
      (see the doc comments on `University`/`UniversityCourse`/
      `CourseProposal`) — there's no admin UI, by design.

## Auth follow-ups (from the original implementation plan, not blocking)

- [ ] Tighten CORS from `AllowAnyOrigin` to the known app origins now that
      auth is in place (`backend-api/Program.cs`).
- [ ] Consider refresh tokens / shorter-lived JWTs with re-auth, instead of
      the current single 30-day token issued at login.
- [ ] `Microsoft.Extensions.Identity.Core` triggers a `NU1510` "package will
      not be pruned" build warning — revisit whether a lighter-weight package
      can provide `PasswordHasher<T>` instead.
