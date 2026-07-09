using BackendApi.Data;
using BackendApi.Domain;
using BackendApi.Services.Flashcards;
using BackendApi.Services.Tts;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Endpoints;

public record CreateQuizRequest(int Count, Difficulty Difficulty);
public record ReviewFlashcardRequest(bool Correct);
public record ExportAudioRequest(List<Guid> FlashcardIds);

public static class FlashcardEndpoints
{
    private const int MaxAudioExportBatchSize = 100;

    public static void MapFlashcardEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/flashcards").WithTags("Flashcards");

        app.MapPost("/api/lessons/{lessonId:guid}/quiz", async (
            Guid lessonId,
            CreateQuizRequest request,
            AppDbContext db,
            IFlashcardGenerationService generator) =>
        {
            if (request.Count is <= 0 or > 200) return Results.BadRequest("Count must be between 1 and 200.");

            var lesson = await db.Lessons
                .Include(l => l.Notes)
                .Include(l => l.Sources)
                .Include(l => l.Flashcards)
                .FirstOrDefaultAsync(l => l.Id == lessonId);
            if (lesson is null) return Results.NotFound();

            var sourceText = string.Join("\n\n", new[]
                {
                    string.Join("\n", lesson.Notes.Select(n => n.Content)),
                    string.Join("\n", lesson.Sources.Where(s => s.ExtractedText is not null).Select(s => s.ExtractedText)),
                }.Where(s => !string.IsNullOrWhiteSpace(s)));

            if (string.IsNullOrWhiteSpace(sourceText))
            {
                return Results.BadRequest("Lesson has no notes or extracted source text to generate a quiz from yet.");
            }

            var generated = await generator.GenerateAsync(sourceText, request.Count, request.Difficulty);

            var flashcards = generated.Select(g => new Flashcard
            {
                LessonId = lessonId,
                Question = g.Question,
                Answer = g.Answer,
                Difficulty = request.Difficulty,
            }).ToList();

            db.Flashcards.AddRange(flashcards);

            var session = new QuizSession
            {
                LessonId = lessonId,
                RequestedCount = request.Count,
                Difficulty = request.Difficulty,
                FlashcardIds = flashcards.Select(f => f.Id).ToList(),
            };
            db.QuizSessions.Add(session);

            await db.SaveChangesAsync();

            return Results.Ok(flashcards.Select(f => new FlashcardDto(f.Id, f.Question, f.Answer, f.Difficulty)));
        });

        app.MapGet("/api/lessons/{lessonId:guid}/flashcards", async (Guid lessonId, AppDbContext db) =>
        {
            var flashcards = await db.Flashcards.Where(f => f.LessonId == lessonId).ToListAsync();
            return flashcards.Select(f => new FlashcardDto(f.Id, f.Question, f.Answer, f.Difficulty));
        });

        group.MapPost("/{id:guid}/review", async (Guid id, ReviewFlashcardRequest request, AppDbContext db, ISpacedRepetitionService sm2) =>
        {
            var flashcard = await db.Flashcards.Include(f => f.ReviewState).FirstOrDefaultAsync(f => f.Id == id);
            if (flashcard is null) return Results.NotFound();

            flashcard.ReviewState ??= new SpacedRepetitionState { FlashcardId = id };
            sm2.ApplyReview(flashcard.ReviewState, request.Correct);

            if (db.Entry(flashcard.ReviewState).State == EntityState.Detached)
                db.SpacedRepetitionStates.Add(flashcard.ReviewState);

            await db.SaveChangesAsync();
            return Results.Ok(flashcard.ReviewState);
        });

        // The daily set: due reviews first (per SM-2), topped up with new cards
        // weighted towards the most recent lesson. See DailyFlashcardSelector.
        group.MapGet("/daily", async (AppDbContext db, IDailyFlashcardSelector selector, int count = 30) =>
        {
            var all = await db.Flashcards.Include(f => f.ReviewState).Include(f => f.Lesson).ToListAsync();
            var picked = selector.SelectDailySet(all, count);
            return picked.Select(f => new FlashcardDto(f.Id, f.Question, f.Answer, f.Difficulty));
        });

        // On-demand version of the same stack, for "give me everything due right now".
        group.MapGet("/stack", async (AppDbContext db, Guid? lessonId, Guid? subjectId) =>
        {
            var query = db.Flashcards.Include(f => f.ReviewState).Include(f => f.Lesson).AsQueryable();
            if (lessonId is not null) query = query.Where(f => f.LessonId == lessonId);
            if (subjectId is not null) query = query.Where(f => f.Lesson!.SubjectId == subjectId);

            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var cards = await query.ToListAsync();
            var due = cards
                .Where(c => c.ReviewState is null || c.ReviewState.NextReviewDate <= today)
                .OrderBy(c => c.ReviewState?.NextReviewDate ?? today)
                .ToList();

            return due.Select(f => new FlashcardDto(f.Id, f.Question, f.Answer, f.Difficulty));
        });

        group.MapPost("/export-audio", async (ExportAudioRequest request, AppDbContext db, IFlashcardAudioExportService exporter) =>
        {
            if (request.FlashcardIds.Count == 0) return Results.BadRequest("No flashcard ids given.");
            if (request.FlashcardIds.Count > MaxAudioExportBatchSize)
                return Results.BadRequest($"At most {MaxAudioExportBatchSize} flashcards per audio export.");

            var cards = await db.Flashcards
                .Where(f => request.FlashcardIds.Contains(f.Id))
                .ToListAsync();
            if (cards.Count == 0) return Results.NotFound();

            // Preserve the order the caller asked for.
            var ordered = request.FlashcardIds
                .Select(id => cards.FirstOrDefault(c => c.Id == id))
                .Where(c => c is not null)
                .Cast<Flashcard>()
                .ToList();

            var wav = await exporter.ExportAsync(ordered);
            return Results.File(wav, "audio/wav", "flashcards.wav");
        });
    }
}
