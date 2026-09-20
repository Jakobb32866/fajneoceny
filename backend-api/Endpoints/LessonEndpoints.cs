using BackendApi.Data;
using BackendApi.Domain;
using BackendApi.Services.Grading;
using BackendApi.Services.Storage;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Endpoints;

public record CreateLessonRequest(string Title);
public record LessonSummary(Guid Id, string Title, int Order, int FlashcardCount, DateTimeOffset CreatedAt);
public record LessonDetail(Guid Id, string Title, int Order, string? NoteContent, List<SourceDto> Sources, List<DeckDto> Decks);
public record SourceDto(Guid Id, string Title, SourceType Type, string Location);
public record FlashcardDto(Guid Id, string Question, string Answer, Difficulty Difficulty);
public record UpsertNoteRequest(string Content);
public record CreateLinkSourceRequest(string Title, string Url, SourceType Type);

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

        app.MapGet("/api/lessons/{id:guid}", async (Guid id, AppDbContext db) =>
        {
            var lesson = await db.Lessons
                .Include(l => l.Notes)
                .Include(l => l.Sources)
                .Include(l => l.Decks).ThenInclude(d => d.Flashcards)
                .FirstOrDefaultAsync(l => l.Id == id);
            if (lesson is null) return Results.NotFound();

            return Results.Ok(new LessonDetail(
                lesson.Id,
                lesson.Title,
                lesson.Order,
                lesson.Notes.OrderByDescending(n => n.UpdatedAt).FirstOrDefault()?.Content,
                lesson.Sources.Select(s => new SourceDto(s.Id, s.Title, s.Type, s.Location)).ToList(),
                lesson.Decks.OrderBy(d => d.CreatedAt).Select(d => d.ToDto()).ToList()));
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

        app.MapPost("/api/lessons/{lessonId:guid}/sources/link", async (Guid lessonId, CreateLinkSourceRequest request, AppDbContext db) =>
        {
            var lesson = await db.Lessons.FirstOrDefaultAsync(e => e.Id == lessonId);
            if (lesson is null) return Results.NotFound();

            var source = new Source
            {
                LessonId = lessonId,
                Title = request.Title,
                Type = request.Type,
                Location = request.Url,
            };
            db.Sources.Add(source);
            await db.SaveChangesAsync();
            return Results.Created($"/api/sources/{source.Id}", source);
        }).WithTags("Sources").RequireAuthorization();

        app.MapPost("/api/lessons/{lessonId:guid}/sources/file", async (
            Guid lessonId,
            IFormFile file,
            AppDbContext db,
            IFileStorageService storage,
            IDocumentTextExtractionService extractor) =>
        {
            var lesson = await db.Lessons.FirstOrDefaultAsync(e => e.Id == lessonId);
            if (lesson is null) return Results.NotFound();

            string savedName;
            await using (var stream = file.OpenReadStream())
            {
                savedName = await storage.SaveAsync(stream, file.FileName);
            }

            string? extractedText = null;
            if (extractor.CanHandle(file.FileName))
            {
                using var textStream = file.OpenReadStream();
                extractedText = extractor.ExtractText(textStream, file.FileName);
            }

            var source = new Source
            {
                LessonId = lessonId,
                Title = file.FileName,
                Type = SourceType.Pdf,
                Location = savedName,
                ExtractedText = extractedText,
            };
            db.Sources.Add(source);
            await db.SaveChangesAsync();
            return Results.Created($"/api/sources/{source.Id}", new SourceDto(source.Id, source.Title, source.Type, source.Location));
        }).DisableAntiforgery().WithTags("Sources").RequireAuthorization();

        app.MapDelete("/api/sources/{id:guid}", async (Guid id, AppDbContext db) =>
        {
            var source = await db.Sources.FirstOrDefaultAsync(e => e.Id == id);
            if (source is null) return Results.NotFound();
            db.Sources.Remove(source);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).WithTags("Sources").RequireAuthorization();
    }
}
