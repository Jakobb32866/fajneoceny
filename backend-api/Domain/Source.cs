namespace BackendApi.Domain;

public enum SourceType
{
    Pdf,
    YoutubeLink,
    Link,
}

public class Source
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid LessonId { get; set; }
    public Lesson? Lesson { get; set; }

    public string Title { get; set; } = string.Empty;
    public SourceType Type { get; set; }

    // For SourceType.Pdf: path under the file storage root. For links: the URL.
    public string Location { get; set; } = string.Empty;

    // Extracted text used as grounding material for flashcard/quiz generation.
    public string? ExtractedText { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
