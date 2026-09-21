namespace BackendApi.Domain;

/// <summary>
/// A recognised university. Not user-created: these rows are curated by the
/// owner directly in SQL (see UniversitySeeder for the initial seed), never
/// created from user input.
/// </summary>
public class University
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string? ShortName { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<UniversityCourse> Courses { get; set; } = [];
}
