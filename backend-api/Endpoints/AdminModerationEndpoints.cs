using BackendApi.Auth;
using BackendApi.Data;
using BackendApi.Domain;
using BackendApi.Services.Admin;
using BackendApi.Services.Community;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Endpoints;

/// <summary>
/// Moderation of shared lessons, the per-university user list, and share bans.
///
/// The invariant that shapes this whole file: every lesson read goes through
/// AdminQueries, which hard-codes IsShared. An admin can never read a lesson
/// its author did not share — including one the admin themselves just took
/// down, which is why the moderated list is metadata-only.
/// </summary>
public static class AdminModerationEndpoints
{
    public static void MapAdminModerationEndpoints(this IEndpointRouteBuilder app)
    {
        MapLessons(app);
        MapUsers(app);
    }

    private static void MapLessons(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/lessons", async (
            Guid? universityId, Guid? courseId, string? sort, string? q, int? page,
            AppDbContext db, AdminContext adminContext) =>
        {
            var scope = await AdminScopeResolver.ResolveAsync(db, adminContext, universityId);
            if (scope is null) return Results.NotFound();

            var query = AdminQueries.SharedLessonsForUniversity(db, scope.UniversityId);
            if (courseId is { } cid) query = query.Where(l => l.Subject!.UniversityCourseId == cid);

            // Same ordering/paging contract as the student Społeczność feed.
            var pageIds = await LessonPaging.PageAsync(query, sort, q, page);

            var items = await LoadListItemsAsync(db, scope.UniversityId, pageIds.Ids);

            return Results.Ok(new AdminLessonPage(
                items, pageIds.Page, pageIds.PageSize, pageIds.TotalCount, pageIds.TotalPages));
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);

        app.MapGet("/api/admin/lessons/moderated", async (
            Guid? universityId, AppDbContext db, AdminContext adminContext) =>
        {
            var scope = await AdminScopeResolver.ResolveAsync(db, adminContext, universityId);
            if (scope is null) return Results.NotFound();

            // METADATA ONLY. These lessons are unshared by definition (a
            // takedown unshares them), so their notes and flashcards are off
            // limits — this view exists solely to review and lift a lock.
            var rows = await AdminQueries.LockedLessonsForUniversity(db, scope.UniversityId)
                .Select(l => new
                {
                    l.Id,
                    l.Title,
                    l.UserId,
                    l.ModerationLockedAt,
                    l.ModerationLockReason,
                })
                .ToListAsync();

            var authorNames = await AuthorNamesAsync(db, rows.Select(r => r.UserId));

            var items = rows
                .OrderByDescending(r => r.ModerationLockedAt)
                .Select(r => new AdminModeratedLessonDto(
                    r.Id,
                    r.Title,
                    authorNames.GetValueOrDefault(r.UserId, string.Empty),
                    r.ModerationLockedAt!.Value,
                    r.ModerationLockReason))
                .ToList();

            return Results.Ok(items);
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);

        app.MapGet("/api/admin/lessons/{id:guid}", async (
            Guid id, Guid? universityId, AppDbContext db, AdminContext adminContext) =>
        {
            var scope = await AdminScopeResolver.ResolveAsync(db, adminContext, universityId);
            if (scope is null) return Results.NotFound();

            var lesson = await AdminQueries.SharedLessonById(db, scope.UniversityId, id)
                .Include(l => l.Subject).ThenInclude(s => s!.UniversityCourse)
                .Include(l => l.Notes)
                .Include(l => l.Decks).ThenInclude(d => d.Flashcards)
                .AsSplitQuery()
                .FirstOrDefaultAsync();
            if (lesson is null) return Results.NotFound();

            var author = await db.Users.Where(u => u.Id == lesson.UserId)
                .Select(u => new { u.FirstName, u.LastName, u.Email })
                .FirstOrDefaultAsync();

            return Results.Ok(new AdminLessonDetail(
                lesson.Id,
                lesson.Title,
                lesson.Notes.OrderByDescending(n => n.UpdatedAt).FirstOrDefault()?.Content,
                lesson.Decks.OrderBy(d => d.CreatedAt).Select(d => d.ToDto()).ToList(),
                lesson.UserId,
                author is null ? string.Empty : $"{author.FirstName} {author.LastName}".Trim(),
                author?.Email ?? string.Empty,
                lesson.Subject!.UniversityCourseId!.Value,
                lesson.Subject!.UniversityCourse!.Name,
                lesson.LikeCount,
                lesson.SharedAt ?? default,
                lesson.ContentUpdatedAt));
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);

        app.MapPost("/api/admin/lessons/{id:guid}/takedown", async (
            Guid id, Guid? universityId, TakedownRequest request, AppDbContext db, AdminContext adminContext) =>
        {
            var scope = await AdminScopeResolver.ResolveAsync(db, adminContext, universityId);
            if (scope is null) return Results.NotFound();

            if (string.IsNullOrWhiteSpace(request.Reason))
                return Results.BadRequest("A reason is required — it is the only record of why this was removed.");

            var lesson = await AdminQueries.SharedLessonByIdForUpdate(db, scope.UniversityId, id)
                .FirstOrDefaultAsync();
            if (lesson is null) return Results.NotFound();

            var now = DateTimeOffset.UtcNow;
            var reason = request.Reason.Trim();

            var author = await db.Users.Where(u => u.Id == lesson.UserId)
                .Select(u => new { u.FirstName, u.LastName, u.UniversityId })
                .FirstOrDefaultAsync();
            var authorName = author is null ? string.Empty : $"{author.FirstName} {author.LastName}".Trim();

            lesson.IsShared = false;
            lesson.ModerationLockedAt = now;
            lesson.ModerationLockReason = reason;

            db.ShareEvents.Add(new ShareEvent
            {
                LessonId = lesson.Id,
                UserId = lesson.UserId,
                UniversityId = author?.UniversityId,
                Kind = ShareEventKind.Unshared,
                CreatedAt = now,
            });

            // The audit snapshot is the ONLY durable record of what was taken
            // down: the lesson is now unshared, so no admin — not even a
            // super admin reviewing this decision — can read it again.
            AdminAudit.Record(db, scope.Admin, AdminAuditActions.LessonTakedown, "Lesson", lesson.Id,
                scope.UniversityId, $"«{lesson.Title}» — {authorName}", reason);

            if (request.BanHours is { } hours && hours > 0)
            {
                IssueBan(db, scope.Admin, lesson.UserId, hours, reason, now, scope.UniversityId, authorName);
            }

            await db.SaveChangesAsync();
            return Results.NoContent();
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);

        app.MapDelete("/api/admin/lessons/{id:guid}/takedown", async (
            Guid id, Guid? universityId, AppDbContext db, AdminContext adminContext) =>
        {
            var scope = await AdminScopeResolver.ResolveAsync(db, adminContext, universityId);
            if (scope is null) return Results.NotFound();

            var lesson = await AdminQueries.LockedLessonById(db, scope.UniversityId, id).FirstOrDefaultAsync();
            if (lesson is null) return Results.NotFound();

            lesson.ModerationLockedAt = null;
            lesson.ModerationLockReason = null;

            // Deliberately does NOT re-share: lifting the lock restores the
            // author's ability to choose, it doesn't make the choice for them.
            AdminAudit.Record(db, scope.Admin, AdminAuditActions.LessonLockLifted, "Lesson", lesson.Id,
                scope.UniversityId, $"«{lesson.Title}»");

            await db.SaveChangesAsync();
            return Results.NoContent();
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);
    }

    private static void MapUsers(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/users", async (
            Guid? universityId, string? q, int? page, AppDbContext db, AdminContext adminContext) =>
        {
            var scope = await AdminScopeResolver.ResolveAsync(db, adminContext, universityId);
            if (scope is null) return Results.NotFound();

            const int pageSize = 25;
            var query = AdminQueries.UsersForUniversity(db, scope.UniversityId);

            if (!string.IsNullOrWhiteSpace(q))
            {
                query = query.Where(u =>
                    EF.Functions.Like(u.FirstName, $"%{q}%") ||
                    EF.Functions.Like(u.LastName, $"%{q}%") ||
                    EF.Functions.Like(u.Email, $"%{q}%"));
            }

            var totalCount = await query.CountAsync();
            var pageNum = page is null or < 1 ? 1 : page.Value;

            var rows = await query
                .OrderBy(u => u.LastName).ThenBy(u => u.FirstName)
                .Skip((pageNum - 1) * pageSize)
                .Take(pageSize)
                .Select(u => new
                {
                    u.Id,
                    u.FirstName,
                    u.LastName,
                    u.Email,
                    u.LastLoginAt,
                    u.CreatedAt,
                    SharedLessonCount = db.Lessons.IgnoreQueryFilters()
                        .Count(l => l.UserId == u.Id && l.IsShared && l.Subject!.UniversityCourseId != null),
                })
                .ToListAsync();

            var now = DateTimeOffset.UtcNow;
            var userIds = rows.Select(r => r.Id).ToList();
            var activeBans = await ShareBanQueries.ActiveBans(db, now)
                .Where(b => userIds.Contains(b.UserId))
                .Select(b => new { b.UserId, b.ExpiresAt })
                .ToListAsync();
            var banByUser = activeBans
                .GroupBy(b => b.UserId)
                .ToDictionary(g => g.Key, g => g.Max(b => b.ExpiresAt));

            var items = rows.Select(r => new AdminUserListItem(
                r.Id, r.FirstName, r.LastName, r.Email, r.SharedLessonCount, r.LastLoginAt, r.CreatedAt,
                banByUser.TryGetValue(r.Id, out var until) ? until : null)).ToList();

            return Results.Ok(new AdminUserPage(
                items, pageNum, pageSize, totalCount, (int)Math.Ceiling(totalCount / (double)pageSize)));
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);

        app.MapGet("/api/admin/users/{id:guid}", async (
            Guid id, Guid? universityId, AppDbContext db, AdminContext adminContext) =>
        {
            var scope = await AdminScopeResolver.ResolveAsync(db, adminContext, universityId);
            if (scope is null) return Results.NotFound();

            var user = await AdminQueries.UsersForUniversity(db, scope.UniversityId)
                .FirstOrDefaultAsync(u => u.Id == id);
            if (user is null) return Results.NotFound();

            // Only what they published. Private lessons are not admin business.
            var lessonIds = await AdminQueries.SharedLessonsForUser(db, scope.UniversityId, id)
                .Select(l => l.Id)
                .ToListAsync();
            var sharedLessons = await LoadListItemsAsync(db, scope.UniversityId, lessonIds);

            var ban = await ShareBanQueries.ActiveBanAsync(db, id, DateTimeOffset.UtcNow);

            return Results.Ok(new AdminUserDetail(
                user.Id, user.FirstName, user.LastName, user.Email, user.CreatedAt, user.LastLoginAt,
                ban?.ExpiresAt, ban?.Reason, sharedLessons));
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);

        app.MapGet("/api/admin/users/{id:guid}/share-bans", async (
            Guid id, Guid? universityId, AppDbContext db, AdminContext adminContext) =>
        {
            var scope = await AdminScopeResolver.ResolveAsync(db, adminContext, universityId);
            if (scope is null) return Results.NotFound();

            var inScope = await AdminQueries.UsersForUniversity(db, scope.UniversityId).AnyAsync(u => u.Id == id);
            if (!inScope) return Results.NotFound();

            var now = DateTimeOffset.UtcNow;
            var bans = await db.ShareBans.AsNoTracking()
                .Where(b => b.UserId == id)
                .OrderByDescending(b => b.StartsAt)
                .Select(b => new ShareBanDto(
                    b.Id, b.Reason, b.Hours, b.StartsAt, b.ExpiresAt, b.LiftedAt,
                    b.LiftedAt == null && b.ExpiresAt > now))
                .ToListAsync();

            return Results.Ok(bans);
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);

        app.MapPost("/api/admin/users/{id:guid}/share-ban", async (
            Guid id, Guid? universityId, IssueShareBanRequest request, AppDbContext db, AdminContext adminContext) =>
        {
            var scope = await AdminScopeResolver.ResolveAsync(db, adminContext, universityId);
            if (scope is null) return Results.NotFound();

            if (request.Hours <= 0) return Results.BadRequest("Ban length must be at least one hour.");
            if (string.IsNullOrWhiteSpace(request.Reason)) return Results.BadRequest("A reason is required.");

            var user = await AdminQueries.UsersForUniversity(db, scope.UniversityId)
                .FirstOrDefaultAsync(u => u.Id == id);
            if (user is null) return Results.NotFound();

            IssueBan(db, scope.Admin, id, request.Hours, request.Reason.Trim(), DateTimeOffset.UtcNow,
                scope.UniversityId, $"{user.FirstName} {user.LastName}".Trim());

            await db.SaveChangesAsync();
            return Results.NoContent();
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);

        app.MapDelete("/api/admin/users/{id:guid}/share-ban", async (
            Guid id, Guid? universityId, AppDbContext db, AdminContext adminContext) =>
        {
            var scope = await AdminScopeResolver.ResolveAsync(db, adminContext, universityId);
            if (scope is null) return Results.NotFound();

            var inScope = await AdminQueries.UsersForUniversity(db, scope.UniversityId).AnyAsync(u => u.Id == id);
            if (!inScope) return Results.NotFound();

            var now = DateTimeOffset.UtcNow;

            // Lift every ban currently in force, not just the newest: two
            // overlapping bans would otherwise leave the user still blocked.
            // The rows are stamped, never deleted — the history is the point.
            var active = await db.ShareBans
                .Where(b => b.UserId == id && b.LiftedAt == null && b.ExpiresAt > now)
                .ToListAsync();
            if (active.Count == 0) return Results.NotFound();

            foreach (var ban in active)
            {
                ban.LiftedAt = now;
                ban.LiftedByAdminId = scope.Admin.Id;
            }

            AdminAudit.Record(db, scope.Admin, AdminAuditActions.ShareBanLifted, "User", id,
                scope.UniversityId, $"Lifted {active.Count} active share ban(s)");

            await db.SaveChangesAsync();
            return Results.NoContent();
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);
    }

    /// <summary>Adds a ban plus its audit entry to the change tracker. The caller saves.</summary>
    private static void IssueBan(
        AppDbContext db, Domain.Admin admin, Guid userId, int hours, string reason,
        DateTimeOffset now, Guid universityId, string userName)
    {
        db.ShareBans.Add(new ShareBan
        {
            UserId = userId,
            IssuedByAdminId = admin.Id,
            Reason = reason,
            Hours = hours,
            StartsAt = now,
            ExpiresAt = now.AddHours(hours),
        });

        AdminAudit.Record(db, admin, AdminAuditActions.ShareBanIssued, "User", userId,
            universityId, $"{userName} — {hours}h", reason);
    }

    /// <summary>Hydrates list rows for a set of lesson ids, preserving the given order.</summary>
    private static async Task<List<AdminLessonListItem>> LoadListItemsAsync(
        AppDbContext db, Guid universityId, List<Guid> lessonIds)
    {
        if (lessonIds.Count == 0) return [];

        var rows = await AdminQueries.SharedLessonsForUniversity(db, universityId)
            .Where(l => lessonIds.Contains(l.Id))
            .Select(l => new
            {
                l.Id,
                l.Title,
                l.UserId,
                CourseId = l.Subject!.UniversityCourseId!.Value,
                CourseName = l.Subject!.UniversityCourse!.Name,
                l.LikeCount,
                DeckCount = l.Decks.Count,
                CardCount = l.Flashcards.Count,
                SharedAt = l.SharedAt ?? default,
                l.ContentUpdatedAt,
            })
            .ToListAsync();

        var authorNames = await AuthorNamesAsync(db, rows.Select(r => r.UserId));

        var items = rows.Select(r => new AdminLessonListItem(
            r.Id, r.Title, r.UserId, authorNames.GetValueOrDefault(r.UserId, string.Empty),
            r.CourseId, r.CourseName, r.LikeCount, r.DeckCount, r.CardCount, r.SharedAt, r.ContentUpdatedAt))
            .ToList();

        return LessonPaging.ApplyOrder(lessonIds, items, i => i.Id);
    }

    private static async Task<Dictionary<Guid, string>> AuthorNamesAsync(AppDbContext db, IEnumerable<Guid> userIds)
    {
        var ids = userIds.Distinct().ToList();
        if (ids.Count == 0) return [];

        return (await db.Users
            .Where(u => ids.Contains(u.Id))
            .Select(u => new { u.Id, u.FirstName, u.LastName })
            .ToListAsync())
            .ToDictionary(u => u.Id, u => $"{u.FirstName} {u.LastName}".Trim());
    }
}
