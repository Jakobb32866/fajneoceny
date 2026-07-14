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

    public List<Note> Notes { get; set; } = [];
    public List<Source> Sources { get; set; } = [];
    public List<Flashcard> Flashcards { get; set; } = [];
    public List<Deck> Decks { get; set; } = [];
}
