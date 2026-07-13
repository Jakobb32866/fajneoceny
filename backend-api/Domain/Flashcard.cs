namespace BackendApi.Domain;

public enum Difficulty
{
    Easy,
    Medium,
    Hard,
}

public class Flashcard
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid LessonId { get; set; }
    public Lesson? Lesson { get; set; }

    // Nullable so existing rows survive the migration; a startup backfill wraps
    // any deck-less cards into a per-lesson deck, after which this is always set
    // for cards created through the app.
    public Guid? DeckId { get; set; }
    public Deck? Deck { get; set; }

    public string Question { get; set; } = string.Empty;
    public string Answer { get; set; } = string.Empty;
    public Difficulty Difficulty { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public SpacedRepetitionState? ReviewState { get; set; }
}

/// <summary>
/// Per-card SM-2 scheduling state. One row per flashcard (single-user app,
/// so no separate UserId dimension for now).
/// </summary>
public class SpacedRepetitionState
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid FlashcardId { get; set; }
    public Flashcard? Flashcard { get; set; }

    public double EaseFactor { get; set; } = 2.5;
    public int IntervalDays { get; set; } = 0;
    public int Repetitions { get; set; } = 0;
    public DateOnly NextReviewDate { get; set; } = DateOnly.FromDateTime(DateTime.UtcNow);
    public DateTimeOffset? LastReviewedAt { get; set; }
}
