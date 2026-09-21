using BackendApi.Auth;
using BackendApi.Data;
using BackendApi.Domain;
using BackendApi.Services;
using BackendApi.Services.Community;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Endpoints;

public record CreateLessonRequest(string Title);
public record UpdateLessonRequest(string Title);
public record LessonSummary(Guid Id, string Title, int Order, int FlashcardCount, DateTimeOffset CreatedAt);
public record LessonDetail(
    Guid Id,
    string Title,
    int Order,
    string? NoteContent,
    List<DeckDto> Decks,
    bool IsShared,
    bool CanShare,
    int LikeCount,
    ForkedFromDto? ForkedFrom);
public record ForkedFromDto(Guid LessonId, string AuthorName, bool OriginalStillShared, bool HasNewerVersion);
public record FlashcardDto(Guid Id, string Question, string Answer, Difficulty Difficulty);
public record UpsertNoteRequest(string Content);

public static class LessonEndpoints
{
    public static void MapLessonEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/subjects/{subjectId:guid}/lessons", async (Guid subjectId, AppDbContext db) =>
        {
            var lessons = await db.Lessons
                .Where(l => l.SubjectId == subjectId)
                .OrderBy(l => l.Order)
                .Include(l => l.Flashcards)
                .ToListAsync();
            return lessons.Select(l => new LessonSummary(l.Id, l.Title, l.Order, l.Flashcards.Count, l.CreatedAt));
        }).WithTags("Lessons").RequireAuthorization();

        app.MapPost("/api/subjects/{subjectId:guid}/lessons", async (Guid subjectId, CreateLessonRequest request, AppDbContext db) =>
        {
            var subject = await db.Subjects.FirstOrDefaultAsync(e => e.Id == subjectId);
            if (subject is null) return Results.NotFound();

            var maxOrder = await db.Lessons.Where(l => l.SubjectId == subjectId)
                .Select(l => (int?)l.Order).MaxAsync() ?? -1;

            var lesson = new Lesson { SubjectId = subjectId, Title = request.Title, Order = maxOrder + 1 };
            db.Lessons.Add(lesson);
            await db.SaveChangesAsync();
            return Results.Created($"/api/lessons/{lesson.Id}", lesson);
        }).WithTags("Lessons").RequireAuthorization();

        app.MapGet("/api/lessons/{id:guid}", async (Guid id, AppDbContext db, ICurrentUser currentUser) =>
        {
            var detail = await BuildLessonDetailAsync(db, id, currentUser.UserId);
            return detail is null ? Results.NotFound() : Results.Ok(detail);
        }).WithTags("Lessons").RequireAuthorization();

        app.MapPut("/api/lessons/{id:guid}", async (Guid id, UpdateLessonRequest request, AppDbContext db) =>
        {
            var title = request.Title?.Trim();
            if (string.IsNullOrEmpty(title)) return Results.BadRequest("Title is required.");

            var lesson = await db.Lessons.FirstOrDefaultAsync(e => e.Id == id);
            if (lesson is null) return Results.NotFound();

            lesson.Title = title;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).WithTags("Lessons").RequireAuthorization();

        app.MapDelete("/api/lessons/{id:guid}", async (Guid id, AppDbContext db) =>
        {
            var lesson = await db.Lessons.FirstOrDefaultAsync(e => e.Id == id);
            if (lesson is null) return Results.NotFound();
            db.Lessons.Remove(lesson);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).WithTags("Lessons").RequireAuthorization();

        app.MapPut("/api/lessons/{lessonId:guid}/notes", async (Guid lessonId, UpsertNoteRequest request, AppDbContext db) =>
        {
            var lesson = await db.Lessons.Include(l => l.Notes).FirstOrDefaultAsync(l => l.Id == lessonId);
            if (lesson is null) return Results.NotFound();

            var note = lesson.Notes.OrderByDescending(n => n.UpdatedAt).FirstOrDefault();
            if (note is null)
            {
                note = new Note { LessonId = lessonId, Content = request.Content };
                db.Notes.Add(note);
            }
            else
            {
                note.Content = request.Content;
                note.UpdatedAt = DateTimeOffset.UtcNow;
            }

            await db.SaveChangesAsync();
            return Results.Ok(note);
        }).WithTags("Notes").RequireAuthorization();

        app.MapPost("/api/lessons/{id:guid}/share", async (Guid id, AppDbContext db, ICurrentUser currentUser) =>
        {
            var lesson = await db.Lessons
                .Include(l => l.Subject)
                .Include(l => l.Notes)
                .Include(l => l.Decks).ThenInclude(d => d.Flashcards)
                .AsSplitQuery()
                .FirstOrDefaultAsync(l => l.Id == id);
            if (lesson is null) return Results.NotFound();

            if (lesson.Subject?.UniversityCourseId is null)
                return Results.BadRequest("This lesson's subject isn't linked to a university course.");

            if (await CommunityAuthorization.GetUniversityAsync(db, currentUser.UserId) is null)
                return Results.BadRequest("You must set your university before sharing lessons.");

            var hasNoteContent = lesson.Notes.Any(n => !string.IsNullOrWhiteSpace(HtmlText.Strip(n.Content)));
            var hasCards = lesson.Decks.Any(d => d.Flashcards.Count > 0);
            if (!hasNoteContent && !hasCards)
                return Results.BadRequest("This lesson has no content to share yet.");

            lesson.IsShared = true;
            lesson.SharedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).WithTags("Lessons").RequireAuthorization();

        app.MapDelete("/api/lessons/{id:guid}/share", async (Guid id, AppDbContext db) =>
        {
            var lesson = await db.Lessons.FirstOrDefaultAsync(l => l.Id == id);
            if (lesson is null) return Results.NotFound();

            lesson.IsShared = false;
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).WithTags("Lessons").RequireAuthorization();

        app.MapPost("/api/lessons/{id:guid}/sync-fork", async (Guid id, AppDbContext db, ICurrentUser currentUser) =>
        {
            // The Lesson query filter already scopes this to the caller's own
            // lessons, so a fork belonging to someone else 404s here too.
            var fork = await db.Lessons
                .Include(l => l.Notes)
                .Include(l => l.Decks).ThenInclude(d => d.Flashcards)
                .AsSplitQuery()
                .FirstOrDefaultAsync(l => l.Id == id);
            if (fork is null || fork.ForkedFromLessonId is null) return Results.NotFound();

            var original = await CommunityQueries.VisibleLessonById(db, fork.ForkedFromLessonId.Value)
                .Include(l => l.Subject)
                .Include(l => l.Notes)
                .Include(l => l.Decks).ThenInclude(d => d.Flashcards)
                .AsSplitQuery()
                .FirstOrDefaultAsync();
            if (original is null) return Results.StatusCode(StatusCodes.Status410Gone);

            var courseId = original.Subject!.UniversityCourseId!.Value;
            if (!await CommunityAuthorization.CanAccessCourseAsync(db, currentUser.UserId, courseId))
                return Results.StatusCode(StatusCodes.Status409Conflict);

            await LessonForkService.SyncAsync(db, fork, original);

            var detail = await BuildLessonDetailAsync(db, id, currentUser.UserId);
            return Results.Ok(detail);
        }).WithTags("Lessons").RequireAuthorization();
    }

    /// <summary>
    /// Builds the full LessonDetail DTO, including the community-facing
    /// CanShare flag and ForkedFrom snapshot/staleness check. Shared by the
    /// plain GET and the sync-fork endpoint (which returns the same shape).
    /// </summary>
    private static async Task<LessonDetail?> BuildLessonDetailAsync(AppDbContext db, Guid id, Guid userId)
    {
        var lesson = await db.Lessons
            .Include(l => l.Subject)
            .Include(l => l.Notes)
            .Include(l => l.Decks).ThenInclude(d => d.Flashcards)
            .AsSplitQuery()
            .FirstOrDefaultAsync(l => l.Id == id);
        if (lesson is null) return null;

        var canShare = lesson.Subject?.UniversityCourseId is not null
            && await CommunityAuthorization.GetUniversityAsync(db, userId) is not null;

        ForkedFromDto? forkedFrom = null;
        if (lesson.ForkedFromLessonId is not null)
        {
            var original = await CommunityQueries.VisibleLessonById(db, lesson.ForkedFromLessonId.Value)
                .FirstOrDefaultAsync();
            var originalStillShared = original is not null;
            var hasNewerVersion = original is not null
                && original.ContentUpdatedAt > (lesson.ForkSyncedAt ?? DateTimeOffset.MinValue);

            forkedFrom = new ForkedFromDto(
                lesson.ForkedFromLessonId.Value,
                lesson.ForkedFromAuthorName ?? string.Empty,
                originalStillShared,
                hasNewerVersion);
        }

        return new LessonDetail(
            lesson.Id,
            lesson.Title,
            lesson.Order,
            lesson.Notes.OrderByDescending(n => n.UpdatedAt).FirstOrDefault()?.Content,
            lesson.Decks.OrderBy(d => d.CreatedAt).Select(d => d.ToDto()).ToList(),
            lesson.IsShared,
            canShare,
            lesson.LikeCount,
            forkedFrom);
    }
}
