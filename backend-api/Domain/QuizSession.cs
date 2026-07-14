namespace BackendApi.Domain;

/// <summary>
/// Record of an on-demand quiz request against a lesson. The actual
/// "repeat until all correct" stack behavior lives client-side; this just
/// tracks what was requested and which cards were served, for history.
/// </summary>
public class QuizSession : IOwnedByUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid LessonId { get; set; }
    public Lesson? Lesson { get; set; }

    public int RequestedCount { get; set; }
    public Difficulty Difficulty { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<Guid> FlashcardIds { get; set; } = [];
}
