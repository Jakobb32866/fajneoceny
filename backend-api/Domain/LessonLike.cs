namespace BackendApi.Domain;

/// <summary>
/// A "like" on a shared lesson. Deliberately NOT IOwnedByUser: like counts
/// are read cross-user (any eligible course member can see a lesson's like
/// count and their own liked state), so endpoints must set UserId explicitly
/// rather than relying on the automatic ownership stamp.
/// </summary>
public class LessonLike
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid LessonId { get; set; }
    public Lesson? Lesson { get; set; }
    public Guid UserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
