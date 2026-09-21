# Community admin SQL

Universities, university courses, and course-proposal review are **not**
exposed through any admin UI — they're curated by the owner directly against
the SQLite database (`app.db`) with the `sqlite3` CLI. This doc is a cookbook
for the common tasks.

```sh
sqlite3 app.db
```

(Inside Docker: `docker compose exec backend-api sqlite3 app.db`, or copy
`app.db` out of the container first.)

## A note on GUID formatting

EF Core's SQLite provider stores `Guid` columns as `TEXT`, using the
**uppercase, hyphenated** form of `Guid.ToString()` — e.g.
`026D637E-6594-4AD4-8D69-717321A45AA8` (36 characters: 8-4-4-4-12). This
matters when you write a `Guid` literal by hand in an `INSERT`/`UPDATE`:
SQLite's text comparison is case-sensitive by default, so a lowercase GUID
you paste in won't match a row EF Core wrote (or vice versa) unless you
`UPPER()` one side.

To generate a fresh, correctly-formatted id straight from `sqlite3`, use:

```sql
upper(
  hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' ||
  hex(randomblob(2)) || '-' || hex(randomblob(6))
)
```

This isn't a "real" GUID (no version/variant bits set — SQLite has no native
UUIDv4 generator), but it's a valid unique 36-character TEXT id in the exact
shape EF Core expects, which is all `Id` columns here need. If you'd rather
paste a real GUID (e.g. from `uuidgen`, or your editor), just uppercase it.

Relevant column names below are taken directly from
`backend-api/Migrations/20260921202543_AddUniversitiesAndCommunity.cs`.

## Finding IDs

List universities:

```sql
SELECT Id, Name, ShortName FROM Universities ORDER BY Name;
```

List a university's courses:

```sql
SELECT c.Id, c.Code, c.Name
FROM UniversityCourses c
JOIN Universities u ON u.Id = c.UniversityId
WHERE u.Name = 'Polsko-Japońska Akademia Technik Komputerowych'
ORDER BY c.Name;
```

## Adding a University

```sql
INSERT INTO Universities (Id, Name, ShortName, CreatedAt)
VALUES (
  upper(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' ||
        hex(randomblob(2)) || '-' || hex(randomblob(6))),
  'Some University Name',
  'SUN',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
```

`Name` must be unique (`IX_Universities_Name`). `ShortName` is optional
(`NULL` is fine).

## Adding a UniversityCourse

```sql
INSERT INTO UniversityCourses (Id, UniversityId, Code, Name, CreatedAt)
VALUES (
  upper(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' ||
        hex(randomblob(2)) || '-' || hex(randomblob(6))),
  '<UniversityId, from the lookup above>',
  'ABC',              -- Code, optional (NULL allowed)
  'Course Name',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
```

## Listing pending course proposals

Shows the proposer's email and their university, so you know what you're
approving and where:

```sql
SELECT
  p.Id            AS ProposalId,
  p.Name          AS ProposedName,
  p.CreatedAt,
  u.Email         AS ProposerEmail,
  uni.Name        AS University
FROM CourseProposals p
JOIN Users u  ON u.Id = p.UserId
JOIN Universities uni ON uni.Id = p.UniversityId
WHERE p.Status = 'Pending'
ORDER BY p.CreatedAt;
```

(`Status` is stored as its string name — `'Pending'` / `'Approved'` /
`'Rejected'` — not an integer.)

## Approving a proposal

Approving means: pick (or create) the `UniversityCourse` the proposal should
become, then point the proposal at it and flip its status. **The app links
the student's `Subject` to that course itself**, the next time that student's
subjects list loads (`GET /api/subjects` runs
`CourseProposalReconciliation.ReconcileAsync` first) — you don't update
`Subjects` by hand.

If you're reusing an existing course:

```sql
UPDATE CourseProposals
SET Status = 'Approved',
    CourseId = '<UniversityCourse.Id>',
    ReviewedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE Id = '<ProposalId>';
```

If the proposal should become a brand-new course, insert it first (see
"Adding a UniversityCourse" above, reusing the proposal's `UniversityId` and
`Name`), then run the `UPDATE` above with that new course's id.

Note: if the student already linked a *different* subject to that same
course in the meantime, the app leaves the proposal `Approved` but unapplied
(`AppliedAt` stays `NULL`) rather than erroring or overwriting the other
link — that's expected, not a bug; the student resolves it on their end.

## Rejecting a proposal

```sql
UPDATE CourseProposals
SET Status = 'Rejected',
    ReviewedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE Id = '<ProposalId>';
```

`CourseId` is left `NULL` — a rejected proposal is never applied.

## Finding free-text school names (candidates for a new University row)

Users who typed a school name at registration instead of picking a curated
university have `UniversityId IS NULL` and a free-text `SchoolName`. This
lists the distinct values, most common first, as candidates worth adding:

```sql
SELECT SchoolName, COUNT(*) AS Users
FROM Users
WHERE UniversityId IS NULL AND TRIM(SchoolName) <> ''
GROUP BY SchoolName
ORDER BY Users DESC;
```

Adding a matching `University` row does **not** retroactively link these
users — nothing here rewrites `Users.UniversityId` in bulk. A user picks up
the new university only if they set it themselves afterwards, either at
registration (new accounts) or via `PUT /api/settings/university` (existing
accounts with `UniversityId IS NULL`); once set, that choice is permanent —
the endpoint 409s if `UniversityId` is already set, by design.
