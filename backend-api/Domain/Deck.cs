namespace BackendApi.Domain;

/// <summary>
/// A named set of flashcards within a lesson. Decks are created either by the
/// AI quiz generator (one deck per generation run) or by hand ("from scratch").
/// The deck is the unit the student renames, reviews, and edits.
/// </summary>
public class Deck : IOwnedByUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid LessonId { get; set; }
    public Lesson? Lesson { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>True when the deck's cards were produced by the AI generator.</summary>
    public bool IsAiGenerated { get; set; }

    /// <summary>The difficulty the deck was generated at; null for hand-built decks.</summary>
    public Difficulty? Difficulty { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<Flashcard> Flashcards { get; set; } = [];
}
