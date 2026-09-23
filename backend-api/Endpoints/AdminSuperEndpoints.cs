using BackendApi.Auth;
using BackendApi.Data;
using BackendApi.Domain;
using BackendApi.Services.Admin;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Endpoints;

/// <summary>
/// Super-admin-only routes: the university catalogue, admin accounts, and
/// server-wide stats.
///
/// Every handler re-resolves the caller through AdminContext.GetSuperAdminAsync
/// rather than trusting the token's role claim, so demoting a super admin
/// takes effect on their very next request.
/// </summary>
public static class AdminSuperEndpoints
{
    public static void MapAdminSuperEndpoints(this IEndpointRouteBuilder app)
    {
        MapUniversities(app);
        MapAdmins(app);
        MapStats(app);
    }

    private static void MapUniversities(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/universities", async (AppDbContext db, AdminContext adminContext) =>
        {
            if (await adminContext.GetSuperAdminAsync() is null) return Results.Unauthorized();

            var universities = await db.Universities.AsNoTracking()
                .OrderBy(u => u.Name)
                .Select(u => new AdminUniversityDto(
                    u.Id,
                    u.Name,
                    u.ShortName,
                    u.IsArchived,
                    db.UniversityCourses.Count(c => c.UniversityId == u.Id),
                    db.Users.Count(x => x.UniversityId == u.Id)))
                .ToListAsync();

            return Results.Ok(universities);
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.SuperAdmin);

        app.MapPost("/api/admin/universities", async (
            CreateUniversityRequest request, AppDbContext db, AdminContext adminContext) =>
        {
            var admin = await adminContext.GetSuperAdminAsync();
            if (admin is null) return Results.Unauthorized();

            var name = request.Name?.Trim();
            if (string.IsNullOrWhiteSpace(name)) return Results.BadRequest("University name is required.");
            if (await db.Universities.AnyAsync(u => u.Name.ToLower() == name.ToLower()))
                return Results.Conflict("A university with that name already exists.");

            var university = new University
            {
                Name = name,
                ShortName = string.IsNullOrWhiteSpace(request.ShortName) ? null : request.ShortName.Trim(),
            };
            db.Universities.Add(university);

            AdminAudit.Record(db, admin, AdminAuditActions.UniversityCreated, "University", university.Id,
                university.Id, university.Name);
            await db.SaveChangesAsync();

            return Results.Ok(new AdminUniversityDto(
                university.Id, university.Name, university.ShortName, university.IsArchived, 0, 0));
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.SuperAdmin);

        app.MapPut("/api/admin/universities/{id:guid}", async (
            Guid id, UpdateUniversityRequest request, AppDbContext db, AdminContext adminContext) =>
        {
            var admin = await adminContext.GetSuperAdminAsync();
            if (admin is null) return Results.Unauthorized();

            var university = await db.Universities.FirstOrDefaultAsync(u => u.Id == id);
            if (university is null) return Results.NotFound();

            if (!string.IsNullOrWhiteSpace(request.Name))
            {
                var name = request.Name.Trim();
                if (!string.Equals(name, university.Name, StringComparison.OrdinalIgnoreCase)
                    && await db.Universities.AnyAsync(u => u.Name.ToLower() == name.ToLower()))
                {
                    return Results.Conflict("A university with that name already exists.");
                }
                university.Name = name;
            }

            if (request.ShortName is not null)
            {
                university.ShortName = string.IsNullOrWhiteSpace(request.ShortName) ? null : request.ShortName.Trim();
            }

            var archiving = request.IsArchived == true && !university.IsArchived;
            if (request.IsArchived is { } archived) university.IsArchived = archived;

            AdminAudit.Record(db, admin,
                archiving ? AdminAuditActions.UniversityArchived : AdminAuditActions.UniversityUpdated,
                "University", university.Id, university.Id, university.Name);
            await db.SaveChangesAsync();

            return Results.NoContent();
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.SuperAdmin);

        app.MapDelete("/api/admin/universities/{id:guid}", async (
            Guid id, AppDbContext db, AdminContext adminContext) =>
        {
            var admin = await adminContext.GetSuperAdminAsync();
            if (admin is null) return Results.Unauthorized();

            var university = await db.Universities.FirstOrDefaultAsync(u => u.Id == id);
            if (university is null) return Results.NotFound();

            // User -> University is DeleteBehavior.Restrict and courses
            // cascade, so deleting a populated university would either throw
            // or quietly take a catalogue with it. Only ever delete an empty
            // one; archive the rest.
            var userCount = await db.Users.CountAsync(u => u.UniversityId == id);
            var courseCount = await db.UniversityCourses.CountAsync(c => c.UniversityId == id);
            var adminCount = await db.Admins.CountAsync(a => a.UniversityId == id);

            if (userCount > 0 || courseCount > 0 || adminCount > 0)
            {
                return Results.Conflict(
                    $"This university is in use ({userCount} user(s), {courseCount} course(s), {adminCount} admin(s)) " +
                    "and cannot be deleted. Archive it instead to hide it from registration.");
            }

            db.Universities.Remove(university);
            AdminAudit.Record(db, admin, AdminAuditActions.UniversityDeleted, "University", university.Id,
                null, university.Name);
            await db.SaveChangesAsync();

            return Results.NoContent();
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.SuperAdmin);
    }

    private static void MapAdmins(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/admins", async (AppDbContext db, AdminContext adminContext) =>
        {
            if (await adminContext.GetSuperAdminAsync() is null) return Results.Unauthorized();

            var admins = await db.Admins.AsNoTracking()
                .Include(a => a.University)
                .OrderBy(a => a.Email)
                .ToListAsync();

            return Results.Ok(admins.Select(a => a.ToDto()).ToList());
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.SuperAdmin);

        app.MapPost("/api/admin/admins", async (
            CreateAdminRequest request, AppDbContext db, AdminContext adminContext, PasswordHasher<User> hasher) =>
        {
            var admin = await adminContext.GetSuperAdminAsync();
            if (admin is null) return Results.Unauthorized();

            var email = request.Email?.Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(email)) return Results.BadRequest("Email is required.");
            if (string.IsNullOrWhiteSpace(request.Password)) return Results.BadRequest("Password is required.");
            if (await db.Admins.AnyAsync(a => a.Email == email))
                return Results.Conflict("An admin with that email already exists.");

            if (request.UniversityId is { } uid && !await db.Universities.AnyAsync(u => u.Id == uid))
                return Results.BadRequest("No such university.");

            var created = new Domain.Admin
            {
                Email = email,
                DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? email : request.DisplayName.Trim(),
                PasswordHash = hasher.HashPassword(new User(), request.Password),
                Role = AdminRole.Admin,
                UniversityId = request.UniversityId,
            };
            db.Admins.Add(created);

            AdminAudit.Record(db, admin, AdminAuditActions.AdminCreated, "Admin", created.Id,
                created.UniversityId, created.Email);
            await db.SaveChangesAsync();

            return Results.Ok(created.ToDto());
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.SuperAdmin);

        app.MapPut("/api/admin/admins/{id:guid}", async (
            Guid id, UpdateAdminRequest request, AppDbContext db, AdminContext adminContext,
            PasswordHasher<User> hasher) =>
        {
            var admin = await adminContext.GetSuperAdminAsync();
            if (admin is null) return Results.Unauthorized();

            var target = await db.Admins.FirstOrDefaultAsync(a => a.Id == id);
            if (target is null) return Results.NotFound();

            // Guard against the server ending up with no usable super admin.
            if (target.Id == admin.Id && request.IsDisabled == true)
                return Results.BadRequest("You cannot disable your own super-admin account.");

            if (target.Role == AdminRole.SuperAdmin && request.UniversityId is not null)
                return Results.BadRequest("A super admin is server-wide and cannot be scoped to a university.");

            if (!string.IsNullOrWhiteSpace(request.DisplayName)) target.DisplayName = request.DisplayName.Trim();

            if (!string.IsNullOrWhiteSpace(request.Password))
            {
                target.PasswordHash = hasher.HashPassword(new User(), request.Password);
            }

            if (request.UniversityId is { } uid)
            {
                if (!await db.Universities.AnyAsync(u => u.Id == uid)) return Results.BadRequest("No such university.");
                target.UniversityId = uid;
            }

            if (request.IsDisabled is { } disabled)
            {
                target.DisabledAt = disabled ? target.DisabledAt ?? DateTimeOffset.UtcNow : null;
            }

            AdminAudit.Record(db, admin, AdminAuditActions.AdminUpdated, "Admin", target.Id,
                target.UniversityId, target.Email);
            await db.SaveChangesAsync();

            return Results.NoContent();
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.SuperAdmin);

        app.MapDelete("/api/admin/admins/{id:guid}", async (
            Guid id, AppDbContext db, AdminContext adminContext) =>
        {
            var admin = await adminContext.GetSuperAdminAsync();
            if (admin is null) return Results.Unauthorized();

            var target = await db.Admins.FirstOrDefaultAsync(a => a.Id == id);
            if (target is null) return Results.NotFound();
            if (target.Id == admin.Id) return Results.BadRequest("You cannot remove your own super-admin account.");

            // Soft-delete: AdminAuditEntry stores only an AdminId and resolves
            // the acting admin by join, so destroying the row would erase the
            // record of everything they ever did.
            target.DisabledAt ??= DateTimeOffset.UtcNow;

            AdminAudit.Record(db, admin, AdminAuditActions.AdminDisabled, "Admin", target.Id,
                target.UniversityId, target.Email);
            await db.SaveChangesAsync();

            return Results.NoContent();
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.SuperAdmin);
    }

    private static void MapStats(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/stats", async (AppDbContext db, AdminContext adminContext) =>
        {
            if (await adminContext.GetSuperAdminAsync() is null) return Results.Unauthorized();

            var now = DateTimeOffset.UtcNow;
            var startOfToday = StatsClock.StartOfToday(now);
            var startOf7Days = StatsClock.StartOfDaysAgo(now, 6); // today plus the 6 days before it

            // These columns are stored as epoch millis precisely so these
            // comparisons translate to SQL — see AppDbContext's converter.
            var lessons = db.Lessons.IgnoreQueryFilters();

            var lessonsCreatedToday = await lessons.CountAsync(l => l.CreatedAt >= startOfToday);
            var lessonsCreated7d = await lessons.CountAsync(l => l.CreatedAt >= startOf7Days);

            // Count DISTINCT lessons, not events: a lesson shared, unshared
            // and re-shared in one day is one shared lesson, not three.
            var shared = db.ShareEvents.AsNoTracking().Where(e => e.Kind == ShareEventKind.Shared);

            var lessonsSharedToday = await shared
                .Where(e => e.CreatedAt >= startOfToday)
                .Select(e => e.LessonId).Distinct().CountAsync();

            var lessonsShared7d = await shared
                .Where(e => e.CreatedAt >= startOf7Days)
                .Select(e => e.LessonId).Distinct().CountAsync();

            var totalUsers = await db.Users.CountAsync();
            var activeToday = await db.Users.CountAsync(u => u.LastLoginAt != null && u.LastLoginAt >= startOfToday);
            var active7d = await db.Users.CountAsync(u => u.LastLoginAt != null && u.LastLoginAt >= startOf7Days);

            return Results.Ok(new AdminStats(
                lessonsCreatedToday, lessonsCreated7d,
                lessonsSharedToday, lessonsShared7d,
                totalUsers, activeToday, active7d));
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.SuperAdmin);
    }
}
