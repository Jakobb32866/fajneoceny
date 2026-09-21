using BackendApi.Auth;
using BackendApi.Data;
using BackendApi.Domain;
using BackendApi.Services.Community;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Endpoints;

public record CommunityLessonPage(List<CommunityLessonListItem> Items, int Page, int PageSize, int TotalCount, int TotalPages);

public record CommunityLessonListItem(
    Guid Id,
    string Title,
    string AuthorName,
    int LikeCount,
    bool LikedByMe,
    bool IsMine,
    int DeckCount,
    int CardCount,
    DateTimeOffset SharedAt,
    DateTimeOffset ContentUpdatedAt);

public record CommunityLessonDetail(
    Guid Id,
    string Title,
    string? NoteContent,
    List<DeckDto> Decks,
    string AuthorName,
    int LikeCount,
    bool LikedByMe,
    bool IsMine,
    DateTimeOffset SharedAt,
    DateTimeOffset ContentUpdatedAt,
    Guid CourseId);

public record LikeResult(int LikeCount, bool LikedByMe);

public record ForkResult(Guid Id, string Title, int Order, int FlashcardCount, DateTimeOffset CreatedAt, Guid SubjectId);

public static class CommunityEndpoints
{
    private const int PageSize = 15;

    public static void MapCommunityEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/community/courses/{courseId:guid}/lessons", async (
            Guid courseId, string? sort, string? q, int? page, AppDbContext db, ICurrentUser currentUser) =>
        {
            var userId = currentUser.UserId;
            if (!await CommunityAuthorization.CanAccessCourseAsync(db, userId, courseId)) return Results.NotFound();

            IQueryable<Lesson> query = CommunityQueries.VisibleLessonsForCourse(db, courseId);

            if (!string.IsNullOrWhiteSpace(q))
            {
                query = query.Where(l => EF.Functions.Like(l.Title, $"%{q}%"));
            }

            query = sort switch
            {
                "published" => query.OrderByDescending(l => l.SharedAt),
                "updated" => query.OrderByDescending(l => l.ContentUpdatedAt),
                _ => query.OrderByDescending(l => l.LikeCount).ThenByDescending(l => l.SharedAt),
            };

            var pageNum = page is null or < 1 ? 1 : page.Value;

            var totalCount = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalCount / (double)PageSize);

            var pageLessons = await query
                .Skip((pageNum - 1) * PageSize)
                .Take(PageSize)
                .Select(l => new
                {
                    l.Id,
                    l.Title,
                    l.UserId,
                    l.LikeCount,
                    DeckCount = l.Decks.Count,
                    CardCount = l.Flashcards.Count,
                    SharedAt = l.SharedAt ?? default,
                    l.ContentUpdatedAt,
                })
                .ToListAsync();

            var lessonIds = pageLessons.Select(l => l.Id).ToList();
            var likedLessonIds = (await db.LessonLikes
                .Where(like => lessonIds.Contains(like.LessonId) && like.UserId == userId)
                .Select(like => like.LessonId)
                .ToListAsync())
                .ToHashSet();

            var authorIds = pageLessons.Select(l => l.UserId).Distinct().ToList();
            var authorNames = (await db.Users
                .Where(u => authorIds.Contains(u.Id))
                .Select(u => new { u.Id, u.FirstName, u.LastName })
                .ToListAsync())
                .ToDictionary(u => u.Id, u => $"{u.FirstName} {u.LastName}");

            var items = pageLessons.Select(l => new CommunityLessonListItem(
                l.Id,
                l.Title,
                authorNames.GetValueOrDefault(l.UserId, string.Empty),
                l.LikeCount,
                likedLessonIds.Contains(l.Id),
                l.UserId == userId,
                l.DeckCount,
                l.CardCount,
                l.SharedAt,
                l.ContentUpdatedAt)).ToList();

            return Results.Ok(new CommunityLessonPage(items, pageNum, PageSize, totalCount, totalPages));
        }).WithTags("Community").RequireAuthorization();

        app.MapGet("/api/community/lessons/{id:guid}", async (Guid id, AppDbContext db, ICurrentUser currentUser) =>
        {
            var userId = currentUser.UserId;

            var lesson = await CommunityQueries.VisibleLessonById(db, id)
                .Include(l => l.Subject)
                .Include(l => l.Notes)
                .Include(l => l.Decks).ThenInclude(d => d.Flashcards)
                .AsSplitQuery()
                .FirstOrDefaultAsync();
            if (lesson is null) return Results.NotFound();

            var courseId = lesson.Subject!.UniversityCourseId!.Value;
            if (!await CommunityAuthorization.CanAccessCourseAsync(db, userId, courseId)) return Results.NotFound();

            var author = await db.Users.Where(u => u.Id == lesson.UserId)
                .Select(u => new { u.FirstName, u.LastName })
                .FirstOrDefaultAsync();
            var authorName = author is null ? string.Empty : $"{author.FirstName} {author.LastName}";

            var likedByMe = await db.LessonLikes.AnyAsync(l => l.LessonId == id && l.UserId == userId);

            return Results.Ok(new CommunityLessonDetail(
                lesson.Id,
                lesson.Title,
                lesson.Notes.OrderByDescending(n => n.UpdatedAt).FirstOrDefault()?.Content,
                lesson.Decks.OrderBy(d => d.CreatedAt).Select(d => d.ToDto()).ToList(),
                authorName,
                lesson.LikeCount,
                likedByMe,
                lesson.UserId == userId,
                lesson.SharedAt ?? default,
                lesson.ContentUpdatedAt,
                courseId));
        }).WithTags("Community").RequireAuthorization();

        app.MapPost("/api/community/lessons/{id:guid}/like", async (Guid id, AppDbContext db, ICurrentUser currentUser) =>
            await SetLikeAsync(db, currentUser.UserId, id, like: true))
            .WithTags("Community").RequireAuthorization();

        app.MapDelete("/api/community/lessons/{id:guid}/like", async (Guid id, AppDbContext db, ICurrentUser currentUser) =>
            await SetLikeAsync(db, currentUser.UserId, id, like: false))
            .WithTags("Community").RequireAuthorization();

        app.MapPost("/api/community/lessons/{id:guid}/fork", async (Guid id, AppDbContext db, ICurrentUser currentUser) =>
        {
            var userId = currentUser.UserId;

            var original = await CommunityQueries.VisibleLessonById(db, id)
                .Include(l => l.Subject)
                .Include(l => l.Notes)
                .Include(l => l.Decks).ThenInclude(d => d.Flashcards)
                .AsSplitQuery()
                .FirstOrDefaultAsync();
            if (original is null) return Results.NotFound();

            var courseId = original.Subject!.UniversityCourseId!.Value;
            if (!await CommunityAuthorization.CanAccessCourseAsync(db, userId, courseId)) return Results.NotFound();

            if (original.UserId == userId) return Results.BadRequest("You can't fork your own lesson.");

            // Subjects is a per-user query filter, so this only ever finds the caller's own subject.
            var targetSubject = await db.Subjects.FirstOrDefaultAsync(s => s.UniversityCourseId == courseId);
            if (targetSubject is null) return Results.BadRequest("You have no subject on this course.");

            var author = await db.Users.Where(u => u.Id == original.UserId)
                .Select(u => new { u.FirstName, u.LastName })
                .FirstOrDefaultAsync();
            var authorName = author is null ? string.Empty : $"{author.FirstName} {author.LastName}";

            var fork = await LessonForkService.ForkAsync(db, original, targetSubject.Id, authorName);
            var flashcardCount = original.Decks.Sum(d => d.Flashcards.Count);

            return Results.Ok(new ForkResult(fork.Id, fork.Title, fork.Order, flashcardCount, fork.CreatedAt, fork.SubjectId));
        }).WithTags("Community").RequireAuthorization();
    }

    /// <summary>
    /// Shared like/unlike handler. Idempotent: liking an already-liked lesson
    /// or unliking one that isn't liked is a no-op beyond returning the
    /// current state. LessonLike isn't IOwnedByUser, so UserId is set here
    /// explicitly rather than relying on AppDbContext's ownership stamp.
    /// </summary>
    private static async Task<IResult> SetLikeAsync(AppDbContext db, Guid userId, Guid lessonId, bool like)
    {
        var lesson = await CommunityQueries.VisibleLessonById(db, lessonId)
            .Include(l => l.Subject)
            .FirstOrDefaultAsync();
        if (lesson is null) return Results.NotFound();

        var courseId = lesson.Subject!.UniversityCourseId!.Value;
        if (!await CommunityAuthorization.CanAccessCourseAsync(db, userId, courseId)) return Results.NotFound();

        if (lesson.UserId == userId) return Results.BadRequest("You can't like your own lesson.");

        var alreadyLiked = await db.LessonLikes.AnyAsync(l => l.LessonId == lessonId && l.UserId == userId);

        if (like && !alreadyLiked)
        {
            db.LessonLikes.Add(new LessonLike { LessonId = lessonId, UserId = userId });
            await db.SaveChangesAsync();
            await CommunityQueries.VisibleLessonById(db, lessonId)
                .ExecuteUpdateAsync(s => s.SetProperty(l => l.LikeCount, l => l.LikeCount + 1));
        }
        else if (!like && alreadyLiked)
        {
            var existing = await db.LessonLikes.FirstAsync(l => l.LessonId == lessonId && l.UserId == userId);
            db.LessonLikes.Remove(existing);
            await db.SaveChangesAsync();
            await CommunityQueries.VisibleLessonById(db, lessonId)
                .Where(l => l.LikeCount > 0)
                .ExecuteUpdateAsync(s => s.SetProperty(l => l.LikeCount, l => l.LikeCount - 1));
        }

        var freshCount = await CommunityQueries.VisibleLessonById(db, lessonId).Select(l => l.LikeCount).FirstAsync();
        return Results.Ok(new LikeResult(freshCount, like));
    }
}
