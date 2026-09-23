# Admin & super admin

Moderation and curation for fajneoceny: reviewing course proposals, keeping a
university's course catalogue tidy, taking down shared notes that break the
rules, and time-boxing a user's ability to share.

## The two roles

| | Normal admin | Super admin |
|---|---|---|
| How many | Any number | Exactly one, per server |
| Scope | One university (or none, until assigned) | Every university |
| Course proposals | ✅ approve / reject | ✅ in any university |
| Course catalogue | ✅ add / rename / archive / delete | ✅ in any university |
| Shared lessons | ✅ browse and take down | ✅ in any university |
| Users & share bans | ✅ own university | ✅ in any university |
| Universities | — | ✅ add / edit / archive / delete |
| Admin accounts | — | ✅ create / edit / disable |
| Server stats | — | ✅ |

A super admin does everything a normal admin does by selecting a university
from the chip row at the top of each screen. Scoped screens stay empty until
one is chosen — the API refuses a scoped request that names no university
rather than silently acting server-wide.

An admin with **no** university assigned can see nothing. That is the intended
meaning of "0 or 1 university", not a bug.

## The rule that shapes everything

> **An admin can only ever see a lesson its author chose to share.**

Private notes are invisible to every admin, including the super admin. This is
enforced in `Services/Admin/AdminQueries`, where every lesson query hard-codes
`IsShared` and every method requires a `universityId` — so forgetting to scope
a query is a compile error, not a data leak.

One consequence is worth understanding before you moderate anything: **taking
a lesson down makes it invisible to you too.** Un-sharing is what removes it,
and an unshared lesson is off limits. That is why a takedown **requires a
reason**: the audit entry's snapshot — the title, the author's name and your
reason — becomes the only durable record of what was removed. Nothing can
recover the content for review afterwards.

## Signing in

Admins are a **separate account type** from students. An admin has no
subjects, no lessons and no community feed; a student's credentials will never
work on the admin panel, and an admin token is rejected by every student route
(and vice versa). Both sessions can coexist on one device.

The entry point is the understated "Panel administratora" link at the bottom
of the login screen.

## Bootstrapping the super admin

The super admin comes from configuration, not from the UI. Generate a password
**hash** locally — no plaintext credential ever enters config, `.env`,
docker-compose or the repo:

```bash
cd backend-api && dotnet run -- hash-password 'your password here'
```

Set both values in the environment (see `docker-compose.yml`):

```
SuperAdmin__Email=you@example.com
SuperAdmin__PasswordHash=<the hash printed above>
```

On every startup `SuperAdminSeeder` creates or updates that account and keeps
its hash and role in sync with config. So:

- rotating the password is a restart, not a database edit;
- the super admin can never lock themselves out (the seeder clears
  `DisabledAt`);
- pointing `SuperAdmin__Email` at a different address moves the role and
  demotes the previous holder to a normal admin.

Leaving either value empty logs a warning and creates no admin account.

## What each action does

### Course proposals

A student who can't find their course proposes it. Approving either **links
the proposal to an existing course** or creates a new one; the student's
subject is connected the next time their subject list loads
(`CourseProposalReconciliation`), so there is nothing else to do.

Prefer linking to an existing course. Two near-identical entries ("Bazy
danych" and "Bazy Danych") each get their own community feed, splitting that
subject's shared notes in half with no way back short of a manual merge.
Students are already blocked from proposing a name that exists, so in practice
you will mostly see genuinely new courses.

Rejecting records your reason and stops the student's "oczekuje na
zatwierdzenie" badge. **They are not told why** — there is no notification
channel yet (see `TODO.md`); reach them by email if it matters.

### Courses

Rename, re-code, archive or delete. Deleting only works when **nothing**
references the course — subjects link to courses with a restrict constraint,
so a course in use genuinely cannot be removed and the UI will say how many
subjects and proposals point at it. Archive instead: it disappears from
registration and course pickers without touching anyone's existing data.

### Taking a lesson down

Un-shares it and applies a **moderation lock**. The author cannot re-share it
until an admin lifts the lock — without that, a takedown would be a suggestion
rather than a sanction. The author sees your reason on the lesson.

Lifting a lock does **not** re-share the lesson. It restores the author's
ability to choose; it does not choose for them.

### Share bans

Blocks a user from sharing **anything** for a chosen number of hours, with a
reason. Offered in the takedown dialog too, for the "this person keeps doing
it" case.

A ban does not retroactively un-share anything — take individual lessons down
for that. Bans are **history**: every ban a user has ever received is kept with
its reason, lifting one early stamps it rather than deleting it, and a new ban
never overwrites an old one.

## Stats (super admin)

Lessons created and shared today and over the last 7 days, total users, and
users active today and in the last 7 days.

Two caveats worth knowing before you read anything into the numbers:

- **A lesson counts once per window, however often it is re-shared.** The
  counts come from an append-only `ShareEvents` log and count distinct
  lessons, so share/unshare churn can't inflate them.
- **The data starts at deployment.** `ShareEvents` and `Users.LastLoginAt`
  did not exist before this feature, and there is no way to backfill them. The
  first week's figures are partial.

"Today" means today in **Europe/Warsaw**, not UTC — a note shared at 00:30 CET
belongs to that day.

## Accountability

Every admin action writes an `AdminAuditEntry`: who, what, when, against which
target, in which university, with a reason and a text snapshot captured at the
time. Admin accounts are therefore **soft-disabled, never deleted** — removing
the row would erase the record of everything that admin ever did.

A super admin cannot disable or remove their own account, so the server can
never end up with no usable super admin.

## Applying configuration changes

Everything configurable — the API keys, the TTS voice, the super-admin
account — is read from the environment when the container starts. To apply a
change to `.env`:

```bash
docker compose up -d backend-api
```

**Not** `docker compose restart`: that reuses the existing container with its
old environment, so the change appears to do nothing. `up` recreates the
container when it notices the config differs.

Recreating is safe. The database and uploaded files live in the `backend-data`
volume at `/app/data`, so they survive recreation and `--build`. The only
command that destroys them is `docker compose down -v`.

If you ever copy a database file into the container by hand, `chown` it
afterwards — the backend runs as the non-root `app` user, and a file owned by
anyone else produces `SQLite Error 8: attempt to write a readonly database`
at startup:

```bash
docker exec -u root fajneoceny-backend-api-1 chown app:app /app/data/app.db
```
