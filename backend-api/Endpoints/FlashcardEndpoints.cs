using BackendApi.Data;
using BackendApi.Domain;
using BackendApi.Services;
using BackendApi.Services.Flashcards;
using BackendApi.Services.Tts;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Endpoints;

public record CreateQuizRequest(int Count, Difficulty Difficulty);
// Grade is the Anki-style four-button outcome ("again" | "hard" | "good" | "easy").
// Correct is accepted as a legacy fallback (true -> good, false -> again) so the
// endpoint can ship ahead of the four-button UI.
public record ReviewFlashcardRequest(string? Grade, bool? Correct);
public record ExportAudioRequest(List<Guid> FlashcardIds);

public record DailyCardDto(Guid Id, string Question, string Answer, Difficulty Difficulty, CardPhase Phase, IntervalPreview Intervals);
public record DailyResponse(int DueCount, int NewAvailable, int NewLimit, DateTimeOffset? NextDueAt, List<DailyCardDto> Cards);
public record DailySummaryDto(int DueCount, int NewAvailable, int NewLimit, int DailySessionSize);
public record ReviewResultDto(CardPhase Phase, DateTimeOffset Due, int IntervalDays, int Lapses, IntervalPreview Intervals);

public static class FlashcardEndpoints
{
    private const int MaxAudioExportBatchSize = 100;

    public static void MapFlashcardEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/flashcards").WithTags("Flashcards").RequireAuthorization();

        app.MapPost("/api/lessons/{lessonId:guid}/quiz", async (
            Guid lessonId,
            CreateQuizRequest request,
            AppDbContext db,
            IFlashcardGenerationService generator) =>
        {
            if (request.Count is <= 0 or > 200) return Results.BadRequest("Count must be between 1 and 200.");

            var lesson = await db.Lessons
                .Include(l => l.Notes)
                .FirstOrDefaultAsync(l => l.Id == lessonId);
            if (lesson is null) return Results.NotFound();

            var sourceText = string.Join("\n", lesson.Notes.Select(n => HtmlText.Strip(n.Content)));

            if (string.IsNullOrWhiteSpace(sourceText))
            {
                return Results.BadRequest("Lesson has no notes to generate a quiz from yet.");
            }

            var generated = await generator.GenerateAsync(sourceText, request.Count, request.Difficulty);

            // Each generation run becomes its own named deck.
            var deck = new Deck
            {
                LessonId = lessonId,
                Name = await DeckEndpoints.NextDeckNameAsync(db, lessonId),
                IsAiGenerated = true,
                Difficulty = request.Difficulty,
            };
            db.Decks.Add(deck);

            var flashcards = generated.Select(g => new Flashcard
            {
                LessonId = lessonId,
                DeckId = deck.Id,
                Question = g.Question,
                Answer = g.Answer,
                Difficulty = request.Difficulty,
            }).ToList();

            db.Flashcards.AddRange(flashcards);
            deck.Flashcards = flashcards;

            var session = new QuizSession
            {
                LessonId = lessonId,
                RequestedCount = request.Count,
                Difficulty = request.Difficulty,
                FlashcardIds = flashcards.Select(f => f.Id).ToList(),
            };
            db.QuizSessions.Add(session);

            await db.SaveChangesAsync();

            return Results.Ok(deck.ToDto());
        }).RequireAuthorization();

        app.MapGet("/api/lessons/{lessonId:guid}/flashcards", async (Guid lessonId, AppDbContext db) =>
        {
            var flashcards = await db.Flashcards.Where(f => f.LessonId == lessonId).ToListAsync();
            return flashcards.Select(f => new FlashcardDto(f.Id, f.Question, f.Answer, f.Difficulty));
        }).RequireAuthorization();

        group.MapPost("/{id:guid}/review", async (Guid id, ReviewFlashcardRequest request, AppDbContext db, ISpacedRepetitionService scheduler) =>
        {
            if (ResolveGrade(request) is not { } grade)
                return Results.BadRequest("Provide a grade of \"again\", \"hard\", \"good\" or \"easy\".");

            var flashcard = await db.Flashcards.Include(f => f.ReviewState).FirstOrDefaultAsync(f => f.Id == id);
            if (flashcard is null) return Results.NotFound();

            var settings = SchedulerSettings.From(await SettingsEndpoints.GetOrCreateAsync(db));
            var now = DateTimeOffset.UtcNow;

            flashcard.ReviewState ??= new SpacedRepetitionState { FlashcardId = id, EaseFactor = settings.StartingEase };
            scheduler.ApplyReview(flashcard.ReviewState, grade, settings, now);

            if (db.Entry(flashcard.ReviewState).State == EntityState.Detached)
                db.SpacedRepetitionStates.Add(flashcard.ReviewState);

            await db.SaveChangesAsync();

            var state = flashcard.ReviewState;
            return Results.Ok(new ReviewResultDto(state.Phase, state.Due, state.IntervalDays, state.Lapses,
                scheduler.PreviewIntervals(state, settings, now)));
        });

        // Today's session: cards actually due first (most overdue first), then
        // new cards up to the daily budget. Counts describe the full backlog so
        // the UI can warn when there are more due than one session covers.
        group.MapGet("/daily", async (AppDbContext db, IDailyFlashcardSelector selector, ISpacedRepetitionService scheduler, int? count) =>
        {
            var settings = SchedulerSettings.From(await SettingsEndpoints.GetOrCreateAsync(db));
            if (count is > 0) settings = settings with { DailySessionSize = count.Value };
            var now = DateTimeOffset.UtcNow;

            var all = await db.Flashcards.Include(f => f.ReviewState).Include(f => f.Lesson).ToListAsync();
            var selection = selector.Select(all, settings, now);

            var cards = selection.Cards.Select(f => ToDailyCard(f, scheduler, settings, now)).ToList();
            return Results.Ok(new DailyResponse(selection.DueCount, selection.NewAvailable, selection.NewLimit, selection.NextDueAt, cards));
        });

        // Lightweight counts for the dashboard badge — no card payload.
        group.MapGet("/daily/summary", async (AppDbContext db, IDailyFlashcardSelector selector) =>
        {
            var settings = SchedulerSettings.From(await SettingsEndpoints.GetOrCreateAsync(db));
            var now = DateTimeOffset.UtcNow;
            var all = await db.Flashcards.Include(f => f.ReviewState).ToListAsync();
            var selection = selector.Select(all, settings, now);
            return Results.Ok(new DailySummaryDto(selection.DueCount, selection.NewAvailable, selection.NewLimit, settings.DailySessionSize));
        });

        // "Review ahead": the next cards closest to being forgotten, for the user
        // who wants extra work after clearing today's due queue.
        group.MapGet("/extra", async (AppDbContext db, IDailyFlashcardSelector selector, ISpacedRepetitionService scheduler, int count, string? excludeIds) =>
        {
            if (count is <= 0 or > 200) return Results.BadRequest("Count must be between 1 and 200.");
            var settings = SchedulerSettings.From(await SettingsEndpoints.GetOrCreateAsync(db));
            var now = DateTimeOffset.UtcNow;

            var exclude = ParseGuidList(excludeIds);
            var all = await db.Flashcards.Include(f => f.ReviewState).Include(f => f.Lesson).ToListAsync();
            var picked = selector.SelectExtra(all, count, exclude, now);
            return Results.Ok(picked.Select(f => ToDailyCard(f, scheduler, settings, now)).ToList());
        });

        // Cram mode: everything for a lesson/subject, due first. Callers must NOT
        // grade these through /review — cramming shouldn't disturb the schedule.
        group.MapGet("/stack", async (AppDbContext db, Guid? lessonId, Guid? subjectId) =>
        {
            var query = db.Flashcards.Include(f => f.ReviewState).Include(f => f.Lesson).AsQueryable();
            if (lessonId is not null) query = query.Where(f => f.LessonId == lessonId);
            if (subjectId is not null) query = query.Where(f => f.Lesson!.SubjectId == subjectId);

            var now = DateTimeOffset.UtcNow;
            var cards = await query.ToListAsync();
            var due = cards
                .Where(c => c.ReviewState is null || c.ReviewState.Due <= now)
                .OrderBy(c => c.ReviewState?.Due ?? DateTimeOffset.MinValue)
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

    private static ReviewGrade? ResolveGrade(ReviewFlashcardRequest request)
    {
        if (!string.IsNullOrWhiteSpace(request.Grade))
            return Enum.TryParse<ReviewGrade>(request.Grade, ignoreCase: true, out var g) ? g : null;
        if (request.Correct is { } correct)
            return correct ? ReviewGrade.Good : ReviewGrade.Again;
        return null;
    }

    private static DailyCardDto ToDailyCard(Flashcard f, ISpacedRepetitionService scheduler, SchedulerSettings settings, DateTimeOffset now)
    {
        // New cards have no persisted state yet; preview against a fresh default
        // so the four buttons still show meaningful intervals.
        var state = f.ReviewState ?? new SpacedRepetitionState { FlashcardId = f.Id, EaseFactor = settings.StartingEase };
        var previews = scheduler.PreviewIntervals(state, settings, now);
        var phase = f.ReviewState?.Phase ?? CardPhase.New;
        return new DailyCardDto(f.Id, f.Question, f.Answer, f.Difficulty, phase, previews);
    }

    private static List<Guid> ParseGuidList(string? csv)
    {
        if (string.IsNullOrWhiteSpace(csv)) return new List<Guid>();
        return csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => Guid.TryParse(s, out var id) ? id : (Guid?)null)
            .Where(id => id is not null)
            .Select(id => id!.Value)
            .ToList();
    }
}
