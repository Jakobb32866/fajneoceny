namespace BackendApi.Domain;

public enum Difficulty
{
    Easy,
    Medium,
    Hard,
}

/// <summary>
/// Anki's four card states. New = never studied; Learning = walking the
/// short intra-day learning steps; Review = graduated, scheduled in days;
/// Relearning = lapsed a review and walking the (short) relearning steps.
/// </summary>
public enum CardPhase
{
    New,
    Learning,
    Review,
    Relearning,
}

public class Flashcard : IOwnedByUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
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
/// Per-card scheduling state for the Anki-style scheduler. One row per
/// flashcard, per user (a card belongs to a single user in this app).
/// <see cref="Due"/> is the source of truth for when the card next surfaces;
/// <see cref="NextReviewDate"/> is a denormalized day-granular copy kept for
/// cheap "due today" style queries and reporting.
/// </summary>
public class SpacedRepetitionState : IOwnedByUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid FlashcardId { get; set; }
    public Flashcard? Flashcard { get; set; }

    public CardPhase Phase { get; set; } = CardPhase.New;

    // Position within the active learning / relearning step list.
    public int LearningStepIndex { get; set; }

    public double EaseFactor { get; set; } = 2.5;
    public int IntervalDays { get; set; } = 0;
    public int Repetitions { get; set; } = 0;

    // Times this card has lapsed (fallen out of Review via an "Again" grade).
    public int Lapses { get; set; } = 0;

    // When the card next becomes due. Intra-day for learning steps (minutes
    // from now), or the local day-rollover instant for review cards.
    public DateTimeOffset Due { get; set; } = DateTimeOffset.UtcNow;

    // Denormalized day of Due (in the user's timezone) for reporting/queries.
    public DateOnly NextReviewDate { get; set; } = DateOnly.FromDateTime(DateTime.UtcNow);

    public DateTimeOffset? LastReviewedAt { get; set; }

    // When this state row was first created, i.e. when the card left the "new"
    // pool. Used to enforce the per-day new-card limit without a separate log.
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
