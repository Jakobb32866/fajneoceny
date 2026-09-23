using BackendApi.Auth;
using BackendApi.Data;
using BackendApi.Domain;
using BackendApi.Services.Admin;
using BackendApi.Services.Community;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Endpoints;

/// <summary>
/// Admin surface: course-proposal review and course-catalogue curation,
/// plus admin sign-in. Moderation lives in AdminModerationEndpoints and the
/// super-admin-only routes in AdminSuperEndpoints.
///
/// Every route here is Admin-policy gated AND re-resolves the caller through
/// AdminScopeResolver, which re-reads the admin row (immediate revocation)
/// and pins the university the request may touch.
/// </summary>
public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        MapAuth(app);
        MapProposals(app);
        MapCourses(app);

        app.MapAdminModerationEndpoints();
        app.MapAdminSuperEndpoints();
    }

    private static void MapAuth(IEndpointRouteBuilder app)
    {
        app.MapPost("/api/admin/auth/login", async (
            AdminLoginRequest request,
            AppDbContext db,
            PasswordHasher<User> hasher,
            AdminTokenService tokens) =>
        {
            var email = request.Email.Trim().ToLowerInvariant();
            var admin = await db.Admins.Include(a => a.University).FirstOrDefaultAsync(a => a.Email == email);

            // One uniform 401 for "no such admin", "no password set" and
            // "wrong password", matching AuthEndpoints: never reveal which.
            if (admin is null || admin.PasswordHash is null || admin.DisabledAt is not null)
            {
                return Results.Unauthorized();
            }

            // PasswordHasher<User> is reused deliberately — it is a generic
            // hasher and the type argument does not enter the hash, so admin
            // hashes are produced and verified exactly like user ones (and by
            // the `hash-password` command).
            var result = hasher.VerifyHashedPassword(new User(), admin.PasswordHash, request.Password);
            if (result is not (PasswordVerificationResult.Success or PasswordVerificationResult.SuccessRehashNeeded))
            {
                return Results.Unauthorized();
            }

            return Results.Ok(new AdminLoginResponse(tokens.IssueToken(admin), admin.ToDto()));
        }).WithTags("Admin").AllowAnonymous();

        app.MapGet("/api/admin/me", async (AppDbContext db, AdminContext adminContext) =>
        {
            var admin = await adminContext.GetAsync();
            if (admin is null) return Results.Unauthorized();

            await db.Entry(admin).Reference(a => a.University).LoadAsync();
            return Results.Ok(admin.ToDto());
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);
    }

    private static void MapProposals(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/proposals", async (
            Guid? universityId, string? status, AppDbContext db, AdminContext adminContext) =>
        {
            var scope = await AdminScopeResolver.ResolveAsync(db, adminContext, universityId);
            if (scope is null) return Results.NotFound();

            var query = AdminQueries.ProposalsForUniversity(db, scope.UniversityId);

            // Default to the queue that needs work.
            if (Enum.TryParse<CourseProposalStatus>(status, ignoreCase: true, out var parsed))
            {
                query = query.Where(p => p.Status == parsed);
            }
            else if (string.IsNullOrWhiteSpace(status))
            {
                query = query.Where(p => p.Status == CourseProposalStatus.Pending);
            }

            var rows = await query
                .Select(p => new
                {
                    p.Id,
                    p.Name,
                    p.Status,
                    p.UserId,
                    p.CreatedAt,
                    p.ReviewedAt,
                    p.ReviewReason,
                })
                .ToListAsync();

            var proposerIds = rows.Select(r => r.UserId).Distinct().ToList();
            var proposers = await db.Users
                .Where(u => proposerIds.Contains(u.Id))
                .Select(u => new { u.Id, u.FirstName, u.LastName, u.Email })
                .ToListAsync();
            var byId = proposers.ToDictionary(u => u.Id);

            // CreatedAt on CourseProposal is still a TEXT column, so order in
            // memory (see AppDbContext's note on DateTimeOffset in SQLite).
            var items = rows
                .OrderByDescending(r => r.CreatedAt)
                .Select(r => new AdminProposalDto(
                    r.Id,
                    r.Name,
                    r.Status,
                    byId.TryGetValue(r.UserId, out var u) ? $"{u.FirstName} {u.LastName}".Trim() : string.Empty,
                    byId.TryGetValue(r.UserId, out var e) ? e.Email : string.Empty,
                    r.CreatedAt,
                    r.ReviewedAt,
                    r.ReviewReason))
                .ToList();

            return Results.Ok(items);
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);

        app.MapPost("/api/admin/proposals/{id:guid}/approve", async (
            Guid id, Guid? universityId, ApproveProposalRequest request, AppDbContext db, AdminContext adminContext) =>
        {
            var scope = await AdminScopeResolver.ResolveAsync(db, adminContext, universityId);
            if (scope is null) return Results.NotFound();

            var proposal = await AdminQueries.ProposalByIdForUpdate(db, scope.UniversityId, id).FirstOrDefaultAsync();
            if (proposal is null) return Results.NotFound();
            if (proposal.Status != CourseProposalStatus.Pending)
                return Results.Conflict("This proposal has already been reviewed.");

            Guid courseId;

            if (request.CourseId is { } existingId)
            {
                // Linking to an existing course is the preferred path: it is
                // what keeps near-duplicate courses from splitting a feed.
                var exists = await db.UniversityCourses
                    .AnyAsync(c => c.Id == existingId && c.UniversityId == scope.UniversityId);
                if (!exists) return Results.BadRequest("No such course in this university.");
                courseId = existingId;
            }
            else if (!string.IsNullOrWhiteSpace(request.NewCourseName))
            {
                var name = request.NewCourseName.Trim();
                if (await CourseNaming.IsNameTakenAsync(db, scope.UniversityId, name, excludingProposalId: proposal.Id))
                    return Results.Conflict("A course with that name already exists in this university.");

                var course = new UniversityCourse
                {
                    UniversityId = scope.UniversityId,
                    Name = name,
                    Code = string.IsNullOrWhiteSpace(request.NewCourseCode) ? null : request.NewCourseCode.Trim(),
                };
                db.UniversityCourses.Add(course);
                courseId = course.Id;

                AdminAudit.Record(db, scope.Admin, AdminAuditActions.CourseCreated, "Course", course.Id,
                    scope.UniversityId, course.Name);
            }
            else
            {
                return Results.BadRequest("Provide either courseId or newCourseName.");
            }

            proposal.Status = CourseProposalStatus.Approved;
            proposal.CourseId = courseId;
            proposal.ReviewedAt = DateTimeOffset.UtcNow;
            proposal.ReviewedByAdminId = scope.Admin.Id;

            AdminAudit.Record(db, scope.Admin, AdminAuditActions.ProposalApproved, "CourseProposal", proposal.Id,
                scope.UniversityId, proposal.Name);

            await db.SaveChangesAsync();

            // The student's Subject is linked by CourseProposalReconciliation
            // on their next GET /api/subjects — deliberately not duplicated here.
            return Results.NoContent();
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);

        app.MapPost("/api/admin/proposals/{id:guid}/reject", async (
            Guid id, Guid? universityId, RejectProposalRequest request, AppDbContext db, AdminContext adminContext) =>
        {
            var scope = await AdminScopeResolver.ResolveAsync(db, adminContext, universityId);
            if (scope is null) return Results.NotFound();

            var proposal = await AdminQueries.ProposalByIdForUpdate(db, scope.UniversityId, id).FirstOrDefaultAsync();
            if (proposal is null) return Results.NotFound();
            if (proposal.Status != CourseProposalStatus.Pending)
                return Results.Conflict("This proposal has already been reviewed.");

            proposal.Status = CourseProposalStatus.Rejected;
            proposal.ReviewedAt = DateTimeOffset.UtcNow;
            proposal.ReviewedByAdminId = scope.Admin.Id;
            proposal.ReviewReason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();

            AdminAudit.Record(db, scope.Admin, AdminAuditActions.ProposalRejected, "CourseProposal", proposal.Id,
                scope.UniversityId, proposal.Name, proposal.ReviewReason);

            await db.SaveChangesAsync();
            return Results.NoContent();
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);
    }

    private static void MapCourses(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/courses", async (
            Guid? universityId, AppDbContext db, AdminContext adminContext) =>
        {
            var scope = await AdminScopeResolver.ResolveAsync(db, adminContext, universityId);
            if (scope is null) return Results.NotFound();

            // Subject is query-filtered per user, so count it unfiltered:
            // an admin asking "is this course in use?" means by anyone.
            var courses = await db.UniversityCourses
                .AsNoTracking()
                .Where(c => c.UniversityId == scope.UniversityId)
                .OrderBy(c => c.Name)
                .Select(c => new AdminCourseDto(
                    c.Id,
                    c.Code,
                    c.Name,
                    c.IsArchived,
                    db.Subjects.IgnoreQueryFilters().Count(s => s.UniversityCourseId == c.Id),
                    db.Lessons.IgnoreQueryFilters().Count(l => l.IsShared && l.Subject!.UniversityCourseId == c.Id)))
                .ToListAsync();

            return Results.Ok(courses);
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);

        app.MapPost("/api/admin/courses", async (
            Guid? universityId, CreateCourseRequest request, AppDbContext db, AdminContext adminContext) =>
        {
            var scope = await AdminScopeResolver.ResolveAsync(db, adminContext, universityId);
            if (scope is null) return Results.NotFound();

            var name = request.Name?.Trim();
            if (string.IsNullOrWhiteSpace(name)) return Results.BadRequest("Course name is required.");
            if (await CourseNaming.IsNameTakenAsync(db, scope.UniversityId, name))
                return Results.Conflict("A course with that name already exists in this university.");

            var course = new UniversityCourse
            {
                UniversityId = scope.UniversityId,
                Name = name,
                Code = string.IsNullOrWhiteSpace(request.Code) ? null : request.Code.Trim(),
            };
            db.UniversityCourses.Add(course);

            AdminAudit.Record(db, scope.Admin, AdminAuditActions.CourseCreated, "Course", course.Id,
                scope.UniversityId, course.Name);
            await db.SaveChangesAsync();

            return Results.Ok(new AdminCourseDto(course.Id, course.Code, course.Name, course.IsArchived, 0, 0));
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);

        app.MapPut("/api/admin/courses/{id:guid}", async (
            Guid id, Guid? universityId, UpdateCourseRequest request, AppDbContext db, AdminContext adminContext) =>
        {
            var scope = await AdminScopeResolver.ResolveAsync(db, adminContext, universityId);
            if (scope is null) return Results.NotFound();

            var course = await db.UniversityCourses
                .FirstOrDefaultAsync(c => c.Id == id && c.UniversityId == scope.UniversityId);
            if (course is null) return Results.NotFound();

            if (!string.IsNullOrWhiteSpace(request.Name))
            {
                var name = request.Name.Trim();
                if (!string.Equals(name, course.Name, StringComparison.OrdinalIgnoreCase)
                    && await CourseNaming.IsNameTakenAsync(db, scope.UniversityId, name))
                {
                    return Results.Conflict("A course with that name already exists in this university.");
                }
                course.Name = name;
            }

            if (request.Code is not null)
            {
                course.Code = string.IsNullOrWhiteSpace(request.Code) ? null : request.Code.Trim();
            }

            var archiveChanged = request.IsArchived is not null && request.IsArchived != course.IsArchived;
            if (request.IsArchived is { } archived) course.IsArchived = archived;

            AdminAudit.Record(db, scope.Admin,
                archiveChanged && course.IsArchived ? AdminAuditActions.CourseArchived : AdminAuditActions.CourseUpdated,
                "Course", course.Id, scope.UniversityId, course.Name);
            await db.SaveChangesAsync();

            return Results.NoContent();
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);

        app.MapDelete("/api/admin/courses/{id:guid}", async (
            Guid id, Guid? universityId, AppDbContext db, AdminContext adminContext) =>
        {
            var scope = await AdminScopeResolver.ResolveAsync(db, adminContext, universityId);
            if (scope is null) return Results.NotFound();

            var course = await db.UniversityCourses
                .FirstOrDefaultAsync(c => c.Id == id && c.UniversityId == scope.UniversityId);
            if (course is null) return Results.NotFound();

            // Subject -> UniversityCourse is DeleteBehavior.Restrict, so a
            // referenced course cannot be deleted at all: the DB would throw.
            // Report the real numbers and point at archiving instead of
            // surfacing a constraint violation.
            var subjectCount = await db.Subjects.IgnoreQueryFilters()
                .CountAsync(s => s.UniversityCourseId == course.Id);
            var proposalCount = await db.CourseProposals.IgnoreQueryFilters()
                .CountAsync(p => p.CourseId == course.Id);

            if (subjectCount > 0 || proposalCount > 0)
            {
                return Results.Conflict(
                    $"This course is in use ({subjectCount} subject(s), {proposalCount} proposal(s)) and cannot be " +
                    "deleted. Archive it instead to hide it from students without affecting their data.");
            }

            db.UniversityCourses.Remove(course);
            AdminAudit.Record(db, scope.Admin, AdminAuditActions.CourseDeleted, "Course", course.Id,
                scope.UniversityId, course.Name);
            await db.SaveChangesAsync();

            return Results.NoContent();
        }).WithTags("Admin").RequireAuthorization(AuthPolicies.Admin);
    }

    internal static AdminDto ToDto(this Domain.Admin admin) => new(
        admin.Id,
        admin.Email,
        admin.DisplayName,
        admin.Role,
        admin.UniversityId,
        admin.University?.Name,
        admin.DisabledAt is not null);
}
