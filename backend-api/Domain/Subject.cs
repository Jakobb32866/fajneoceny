namespace BackendApi.Domain;

public class Subject
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public string? SyllabusFileName { get; set; }
    public string? SyllabusRawText { get; set; }

    public List<Lesson> Lessons { get; set; } = [];
    public GradingScheme? GradingScheme { get; set; }
}
