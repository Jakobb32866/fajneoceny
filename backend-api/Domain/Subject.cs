namespace BackendApi.Domain;

public class Subject : IOwnedByUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public string? SyllabusFileName { get; set; }
    public string? SyllabusRawText { get; set; }

    /// <summary>Set when the subject is linked to a shared university course (directly, or via an approved CourseProposal).</summary>
    public Guid? UniversityCourseId { get; set; }
    public UniversityCourse? UniversityCourse { get; set; }

    public List<Lesson> Lessons { get; set; } = [];
    public GradingScheme? GradingScheme { get; set; }
}
