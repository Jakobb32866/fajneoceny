using BackendApi.Data;
using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Services.Admin;

/// <summary>
/// The only place besides CommunityQueries allowed to call
/// IgnoreQueryFilters(). Moderation is inherently cross-user, unlike
/// everything else behind AppDbContext's per-user query filters.
///
/// Two invariants, both enforced by the method signatures rather than by
/// discipline:
///
///  1. Every lesson-returning method hard-codes l.IsShared. An admin must
///     NEVER be able to read a lesson its author did not share — that is the
///     central promise of this feature, and it is why there is no
///     "LessonById" here without the IsShared predicate.
///
///  2. Every method REQUIRES a universityId. There is deliberately no
///     unscoped overload, so a handler cannot forget to scope its query; a
///     missing scope is a compile error rather than a cross-university leak.
///     The id comes from AdminAuthorization.ResolveUniversityAsync.
///
/// Callers must always project to a DTO and must never let the IQueryable
/// escape the endpoint handler.
/// </summary>
public static class AdminQueries
{
    /// <summary>All shared lessons across every course of the given university.</summary>
    public static IQueryable<Lesson> SharedLessonsForUniversity(AppDbContext db, Guid universityId) =>
        db.Lessons.IgnoreQueryFilters().AsNoTracking()
            .Where(l => l.IsShared && l.Subject!.UniversityCourse!.UniversityId == universityId);

    /// <summary>
    /// A single shared lesson. Scoped by university as well as id: knowing a
    /// Guid must not let an admin reach across schools.
    /// </summary>
    public static IQueryable<Lesson> SharedLessonById(AppDbContext db, Guid universityId, Guid lessonId) =>
        db.Lessons.IgnoreQueryFilters().AsNoTracking()
            .Where(l => l.Id == lessonId && l.IsShared && l.Subject!.UniversityCourse!.UniversityId == universityId);

    /// <summary>
    /// The same lesson as <see cref="SharedLessonById"/> but TRACKED, for the
    /// takedown write path. Still requires IsShared: you can only take down
    /// something that is currently shared.
    /// </summary>
    public static IQueryable<Lesson> SharedLessonByIdForUpdate(AppDbContext db, Guid universityId, Guid lessonId) =>
        db.Lessons.IgnoreQueryFilters()
            .Where(l => l.Id == lessonId && l.IsShared && l.Subject!.UniversityCourse!.UniversityId == universityId);

    /// <summary>
    /// A moderation-locked lesson, for lifting the lock. This is the one
    /// place that reaches a lesson which is NOT shared — necessarily, since a
    /// takedown unshares it. Callers must only ever expose its METADATA
    /// (id, title, author, lock reason); never its notes or flashcards.
    /// </summary>
    public static IQueryable<Lesson> LockedLessonById(AppDbContext db, Guid universityId, Guid lessonId) =>
        db.Lessons.IgnoreQueryFilters()
            .Where(l => l.Id == lessonId
                && l.ModerationLockedAt != null
                && l.Subject!.UniversityCourse!.UniversityId == universityId);

    /// <summary>
    /// Currently locked lessons in a university, for the "moderated" list.
    /// METADATA ONLY at the call site, for the reason above.
    /// </summary>
    public static IQueryable<Lesson> LockedLessonsForUniversity(AppDbContext db, Guid universityId) =>
        db.Lessons.IgnoreQueryFilters().AsNoTracking()
            .Where(l => l.ModerationLockedAt != null
                && l.Subject!.UniversityCourse!.UniversityId == universityId);

    /// <summary>Course proposals raised by students of the given university.</summary>
    public static IQueryable<CourseProposal> ProposalsForUniversity(AppDbContext db, Guid universityId) =>
        db.CourseProposals.IgnoreQueryFilters().AsNoTracking()
            .Where(p => p.UniversityId == universityId);

    /// <summary>A single proposal, tracked, for the approve/reject write path.</summary>
    public static IQueryable<CourseProposal> ProposalByIdForUpdate(AppDbContext db, Guid universityId, Guid proposalId) =>
        db.CourseProposals.IgnoreQueryFilters()
            .Where(p => p.Id == proposalId && p.UniversityId == universityId);

    /// <summary>Students who belong to the given university.</summary>
    public static IQueryable<User> UsersForUniversity(AppDbContext db, Guid universityId) =>
        db.Users.AsNoTracking().Where(u => u.UniversityId == universityId);

    /// <summary>
    /// A single user's SHARED lessons. Used by the per-user admin view, which
    /// must show what someone has published and nothing else.
    /// </summary>
    public static IQueryable<Lesson> SharedLessonsForUser(AppDbContext db, Guid universityId, Guid userId) =>
        SharedLessonsForUniversity(db, universityId).Where(l => l.UserId == userId);
}
