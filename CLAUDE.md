# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Deferred tasks

All deferred/follow-up tasks — work that's intentionally left for later
(manual configuration steps, non-blocking cleanup, etc.) — are tracked in
[TODO.md](TODO.md) at the repo root. When you defer something instead of
doing it now, add it there rather than only mentioning it in chat.

## Committing

When asked to commit (or commit and push), the work goes to `main`:

- Commit directly on `main` and push `main`. Do **not** create a feature
  branch for it, even though `main` is the default branch.
- Only if committing straight to `main` isn't possible (e.g. the session is
  already on another branch or in a worktree), commit there, then merge that
  branch into `main` and push `main`, so the work never stays on a side branch.
