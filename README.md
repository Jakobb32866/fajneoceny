# fajneoceny.pl

A study app for **working students** — people who have a job, a degree, and
ambition, but not much time. You capture or upload your notes, the app turns
them into flashcards and quizzes automatically, and an Anki-style spaced-repetition
engine schedules a short daily session you can either **click through** at your
desk or **listen to as audio** on the commute. Upload the syllabus PDF and it
also tells you exactly how many points you still need to pass — and warns you
before you slip below the line.

> The `landing/` folder is the best 60-second overview of the product vision —
> it's the marketing site (in Polish) explaining the problem and the three-step
> solution.

The repo is a monorepo with three deployables: a .NET backend API, an
Expo/React Native client (iOS, Android, and web from one codebase), and a
static marketing site.

---

## AI cooperation
Software was planned using UML. It enabled me to safely use coding agents (Claude Code being the harness) and not 
lose track of their work. I've made sure that I understand everything that's going on. I've carefully managed context, used
plan mode, and defined subagents.

## Tech stack

### Backend — `backend-api/`
- **.NET 10**
- **Entity Framework Core + SQLite** code-first approach.
- **Auth**: JWT + ready setup for Google Auth.
- **Flashcard generation**: **LLM** via any OpenAI-compatible API (OpenAI by default) with an **offline heuristic generator** as fallback.
- **Grading-scheme extraction**: reads uploaded syllabi (PDF via **PdfPig**, `.docx` via **OpenXML**), then extracts the point/grade rules with an LLM and a regex heuristic fallback.
- **Spaced repetition**: an **Anki-style scheduler**
- **Text-to-speech**: **Google Cloud TTS** (local **Piper** still supported offline), exporting a daily session as downloadable audio.
- **Tests**: `backend-api.Tests/` — **xUnit**: the scheduler's learning/review/relearn logic, community visibility, admin moderation, and an endpoint-policy sweep that fails the build if a route's authorization is miswired.

### Mobile / web client — `frontend/`
- **Expo** + **React Native**, one codebase targeting iOS, Android, and web.
- Custom theme/design-token layer in `src/theme/`.

### Marketing site — `landing/`
- Zero-dependency **static HTML/CSS/JS**. Builded uppon design system made using Claude Design.

### Infrastructure
- **docker-compose** wires up the backend and the Expo web dev server. The LLM and TTS are cloud services now, so nothing heavy runs locally — put the API keys in `.env` (see `.env.example`).

---

## Repository layout

```
backend-api/        .NET 10 API — Endpoints, Domain, Services, Auth, Data, Migrations
backend-api.Tests/  xUnit tests (scheduler, community, admin, auth policies)
frontend/         Expo / React Native client (iOS / Android / web)
docs/               Admin guide, and the break-glass SQL cookbook
docker-compose.yml  Backend + Ollama + Expo web
TODO.md             Deferred, human-only follow-ups (e.g. real Google OAuth creds)
```

### Administration

Course proposals, the course catalogue, shared-note moderation and share bans
are handled in an in-app admin panel — the "Panel administratora" link on the
login screen. Admins are a separate account type from students and can only
ever see notes their authors chose to share. The single super admin is
bootstrapped from configuration; see **[docs/admin.md](docs/admin.md)** for
the roles, the setup and what each action actually does.

## Running it

```bash
# Copy the env template and fill in your API keys first
cp .env.example .env

# Full stack (API + Expo web) via Docker
docker compose up

# After changing .env (API keys, TTS voice, super-admin), recreate the
# container — `restart` reuses the old environment and will NOT pick it up:
docker compose up -d backend-api

# — or — run pieces individually —

# Backend API
cd backend-api && dotnet run

# Backend tests
dotnet test backend-api.Tests

# Mobile / web client
cd frontend && npm install && npm run web   # or: npm run ios / npm run android
```

> The backend's database and uploaded files live in the `backend-data` Docker
> volume (mounted at `/app/data`), so they survive `docker compose up --build`.
> The only command that destroys them is `docker compose down -v`.

> Google Sign-In needs real OAuth credentials before it works end-to-end;
> email/password auth works out of the box. See [TODO.md](TODO.md) for the
> remaining manual setup.

