using BackendApi.Domain;

namespace BackendApi.Services.Flashcards;

/// <summary>
/// The outcome of selecting a study session: the ordered cards to play now plus
/// the counts the UI needs to describe the backlog ("47 due, session covers 30").
/// </summary>
public record DailySelection(
    List<Flashcard> Cards,
    int DueCount,
    int NewAvailable,
    int NewLimit,
    DateTimeOffset? NextDueAt);

public interface IDailyFlashcardSelector
{
    /// <summary>
    /// Builds today's session: cards actually due (per the scheduler) first,
    /// most-overdue first, then — only if there's room and the daily new-card
    /// budget allows — brand-new cards, weighted towards the most recent lesson.
    /// No silent filler: an empty due queue with no new budget yields no cards.
    /// </summary>
    DailySelection Select(IEnumerable<Flashcard> allFlashcards, SchedulerSettings settings, DateTimeOffset now);

    /// <summary>
    /// "Review ahead": the next cards closest to being forgotten — review-phase
    /// cards not yet due, soonest-due first — for the user who wants extra work
    /// after clearing today. Falls back to new cards beyond the daily budget.
    /// </summary>
    List<Flashcard> SelectExtra(IEnumerable<Flashcard> allFlashcards, int count, IEnumerable<Guid> excludeIds, DateTimeOffset now);
}

public class DailyFlashcardSelector : IDailyFlashcardSelector
{
    private const double NewestLessonShare = 0.6;

    public DailySelection Select(IEnumerable<Flashcard> allFlashcards, SchedulerSettings s, DateTimeOffset now)
    {
        var cards = allFlashcards.ToList();
        var today = StudyClock.StudyDate(now, s);

        var due = cards
            .Where(c => c.ReviewState is not null && c.ReviewState.Due <= now)
            .OrderBy(c => c.ReviewState!.Due)
            .ToList();

        var newAvailable = cards.Count(c => c.ReviewState is null);

        var introducedToday = cards.Count(c =>
            c.ReviewState is not null && StudyClock.StudyDate(c.ReviewState.CreatedAt, s) == today);
        var newLimit = Math.Max(0, s.NewCardsPerDay - introducedToday);

        var nextDueAt = cards
            .Where(c => c.ReviewState is not null && c.ReviewState.Due > now)
            .Select(c => (DateTimeOffset?)c.ReviewState!.Due)
            .DefaultIfEmpty(null)
            .Min();

        // Session batch: due first (capped at the session size), then new cards
        // up to whatever session capacity and daily new budget remain.
        var selected = due.Take(s.DailySessionSize).ToList();
        var capacity = s.DailySessionSize - selected.Count;
        var newToAdd = Math.Min(capacity, newLimit);
        if (newToAdd > 0)
        {
            var seen = selected.Select(c => c.Id).ToHashSet();
            selected.AddRange(PickNewCards(cards.Where(c => c.ReviewState is null && !seen.Contains(c.Id)).ToList(), newToAdd));
        }

        return new DailySelection(selected, due.Count, newAvailable, newLimit, nextDueAt);
    }

    public List<Flashcard> SelectExtra(IEnumerable<Flashcard> allFlashcards, int count, IEnumerable<Guid> excludeIds, DateTimeOffset now)
    {
        if (count <= 0) return new List<Flashcard>();
        var exclude = excludeIds.ToHashSet();
        var cards = allFlashcards.Where(c => !exclude.Contains(c.Id)).ToList();

        // Cards on the line of being forgotten first: scheduled reviews not yet
        // due, soonest-due first.
        var upcoming = cards
            .Where(c => c.ReviewState is not null && c.ReviewState.Due > now)
            .OrderBy(c => c.ReviewState!.Due)
            .ToList();

        var result = upcoming.Take(count).ToList();
        if (result.Count >= count) return result;

        // Fall back to unseen new cards beyond the daily budget.
        var seen = result.Select(c => c.Id).ToHashSet();
        var newCards = PickNewCards(cards.Where(c => c.ReviewState is null && !seen.Contains(c.Id)).ToList(), count - result.Count);
        result.AddRange(newCards);
        return result;
    }

    // Weighted pick of new cards: favour the most recent lesson but mix in older
    // material so review doesn't only ever chase yesterday.
    private static List<Flashcard> PickNewCards(List<Flashcard> newCards, int take)
    {
        if (take <= 0 || newCards.Count == 0) return new List<Flashcard>();

        var newestLessonId = newCards
            .OrderByDescending(c => c.Lesson?.CreatedAt ?? c.CreatedAt)
            .Select(c => c.LessonId)
            .FirstOrDefault();

        var fromNewest = Shuffle(newCards.Where(c => c.LessonId == newestLessonId).ToList());
        var fromOlder = Shuffle(newCards.Where(c => c.LessonId != newestLessonId).ToList());

        var result = new List<Flashcard>();
        var newestTake = (int)Math.Round(take * NewestLessonShare);
        result.AddRange(fromNewest.Take(newestTake));
        result.AddRange(fromOlder.Take(take - result.Count));
        if (result.Count < take) result.AddRange(fromNewest.Skip(newestTake).Take(take - result.Count));
        return result;
    }

    private static List<Flashcard> Shuffle(List<Flashcard> input)
    {
        var rng = Random.Shared;
        return input.OrderBy(_ => rng.Next()).ToList();
    }
}
