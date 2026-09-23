namespace BackendApi.Domain;

public enum ShareEventKind
{
    Shared,
    Unshared,
}

/// <summary>
/// Append-only log of every share/unshare of a lesson.
///
/// Lesson.SharedAt cannot answer "how many lessons were shared today": it is
/// overwritten on every re-share and left behind when a lesson is unshared,
/// so it describes current state, not history. Stats read this log instead,
/// counting DISTINCT LessonId so a lesson shared, unshared and re-shared on
/// the same day counts exactly once.
///
/// Not IOwnedByUser (same reasoning as LessonLike): it is read across users,
/// so UserId is set explicitly by the writer rather than by AppDbContext's
/// ownership stamp.
/// </summary>
public class ShareEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid LessonId { get; set; }
    public Guid UserId { get; set; }

    /// <summary>Snapshot of the sharing user's university, so stats can scope per school without a join.</summary>
    public Guid? UniversityId { get; set; }

    public ShareEventKind Kind { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
