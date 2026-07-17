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
- **Flashcard generation**: **LLM** (Ollama, OpenAI-compatible API) with an **offline heuristic generator** as fallback.
- **Grading-scheme extraction**: reads uploaded syllabi (PDF via **PdfPig**, `.docx` via **OpenXML**), then extracts the point/grade rules with an LLM and a regex heuristic fallback.
- **Spaced repetition**: an **Anki-style scheduler**
- **Text-to-speech**: **Piper** TTS, exporting a daily session as a downloadable audio.
- **Tests**: `backend-api.Tests/` — **xUnit**, focused on the scheduler's learning/review/relearn logic.

### Mobile / web client — `mobile-app/`
- **Expo** + **React Native**, one codebase targeting iOS, Android, and web.
- Custom theme/design-token layer in `src/theme/`.

### Marketing site — `landing/`
- Zero-dependency **static HTML/CSS/JS**. Builded uppon design system made using Claude Design.

### Infrastructure
- **docker-compose** wires up the backend, an **Ollama** LLM server, a one-shot model-puller, and the Expo web dev server.

---

## Repository layout

```
backend-api/        .NET 10 API — Endpoints, Domain, Services, Auth, Data, Migrations
backend-api.Tests/  xUnit tests (scheduler logic)
mobile-app/         Expo / React Native client (iOS / Android / web)
docker-compose.yml  Backend + Ollama + Expo web
TODO.md             Deferred, human-only follow-ups (e.g. real Google OAuth creds)
```

## Running it

```bash
# Full stack (API + local LLM + Expo web) via Docker
docker compose up

# — or — run pieces individually —

# Backend API
cd backend-api && dotnet run

# Backend tests
dotnet test backend-api.Tests

# Mobile / web client
cd mobile-app && npm install && npm run web   # or: npm run ios / npm run android
```

> Google Sign-In needs real OAuth credentials before it works end-to-end;
> email/password auth works out of the box. See [TODO.md](TODO.md) for the
> remaining manual setup.

