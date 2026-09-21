using BackendApi.Data;
using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Services.Community;

/// <summary>
/// The only place in the codebase allowed to call IgnoreQueryFilters() on
/// Lesson — community browsing is inherently cross-user, unlike everything
/// else behind AppDbContext's per-user query filters. Callers MUST
/// additionally check the caller's eligibility via CommunityAuthorization
/// before using these, must always project the result to a DTO, and must
/// never leak the IQueryable itself past the endpoint handler.
/// </summary>
public static class CommunityQueries
{
    /// <summary>All shared lessons belonging to subjects linked to the given university course.</summary>
    public static IQueryable<Lesson> VisibleLessonsForCourse(AppDbContext db, Guid courseId) =>
        db.Lessons.IgnoreQueryFilters().AsNoTracking()
            .Where(l => l.IsShared && l.Subject!.UniversityCourseId == courseId);

    /// <summary>A single shared lesson by id, only if it belongs to some university course.</summary>
    public static IQueryable<Lesson> VisibleLessonById(AppDbContext db, Guid lessonId) =>
        db.Lessons.IgnoreQueryFilters().AsNoTracking()
            .Where(l => l.Id == lessonId && l.IsShared && l.Subject!.UniversityCourseId != null);
}
