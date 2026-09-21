namespace BackendApi.Domain;

public class Lesson : IOwnedByUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid SubjectId { get; set; }
    public Subject? Subject { get; set; }

    public string Title { get; set; } = string.Empty;
    public int Order { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>Whether the lesson is currently shared to its course's community feed.</summary>
    public bool IsShared { get; set; }
    public DateTimeOffset? SharedAt { get; set; }

    /// <summary>
    /// Bumped whenever the lesson's notes/decks/flashcards change (see
    /// AppDbContext.SaveChanges[Async]). The lesson row itself usually isn't
    /// touched when only a child entity changes, so this can't just be an
    /// EF "last modified" convention on Lesson alone.
    /// </summary>
    public DateTimeOffset ContentUpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public int LikeCount { get; set; }

    /// <summary>
    /// Bare scalar id of the lesson this was forked from — no navigation/FK,
    /// since the original may later be deleted (or unshared) without
    /// affecting the fork.
    /// </summary>
    public Guid? ForkedFromLessonId { get; set; }

    /// <summary>Snapshot of the original author's display name at fork time, since the original User row may become unreachable.</summary>
    public string? ForkedFromAuthorName { get; set; }

    /// <summary>The original lesson's ContentUpdatedAt as of the fork (or last sync); used to detect "original has newer content".</summary>
    public DateTimeOffset? ForkSyncedAt { get; set; }

    public List<Note> Notes { get; set; } = [];
    public List<Flashcard> Flashcards { get; set; } = [];
    public List<Deck> Decks { get; set; } = [];
}
