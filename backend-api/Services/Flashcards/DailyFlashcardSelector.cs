using BackendApi.Domain;

namespace BackendApi.Services.Flashcards;

public interface IDailyFlashcardSelector
{
    /// <summary>
    /// Picks up to <paramref name="count"/> cards for today's review: cards
    /// already due per SM-2 first (most overdue first), then, if there's
    /// room left, new cards — weighted towards the most recent lesson but
    /// mixing in older material so review doesn't only ever chase yesterday.
    /// </summary>
    List<Flashcard> SelectDailySet(IEnumerable<Flashcard> allFlashcards, int count, DateOnly? today = null);
}

public class DailyFlashcardSelector : IDailyFlashcardSelector
{
    private const double NewestLessonShare = 0.6;

    public List<Flashcard> SelectDailySet(IEnumerable<Flashcard> allFlashcards, int count, DateOnly? today = null)
    {
        var date = today ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var cards = allFlashcards.ToList();

        var due = cards
            .Where(c => c.ReviewState is not null && c.ReviewState.NextReviewDate <= date)
            .OrderBy(c => c.ReviewState!.NextReviewDate)
            .ToList();

        var selected = due.Take(count).ToList();
        var remaining = count - selected.Count;
        if (remaining <= 0) return selected;

        var seen = selected.Select(c => c.Id).ToHashSet();
        var newCards = cards.Where(c => c.ReviewState is null && !seen.Contains(c.Id)).ToList();
        if (newCards.Count == 0) return selected;

        var newestLessonId = newCards
            .OrderByDescending(c => c.Lesson?.CreatedAt ?? c.CreatedAt)
            .Select(c => c.LessonId)
            .FirstOrDefault();

        var fromNewest = Shuffle(newCards.Where(c => c.LessonId == newestLessonId).ToList());
        var fromOlder = Shuffle(newCards.Where(c => c.LessonId != newestLessonId).ToList());

        var newestTake = (int)Math.Round(remaining * NewestLessonShare);
        selected.AddRange(fromNewest.Take(newestTake));
        var stillRemaining = count - selected.Count;
        selected.AddRange(fromOlder.Take(stillRemaining));

        stillRemaining = count - selected.Count;
        if (stillRemaining > 0)
        {
            var leftover = fromNewest.Skip(newestTake).Take(stillRemaining);
            selected.AddRange(leftover);
        }

        return selected;
    }

    private static List<Flashcard> Shuffle(List<Flashcard> input)
    {
        var rng = Random.Shared;
        return input.OrderBy(_ => rng.Next()).ToList();
    }
}
