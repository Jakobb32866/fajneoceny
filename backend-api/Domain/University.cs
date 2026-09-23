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

    /// <summary>
    /// Hidden from registration and course pickers without being destroyed.
    /// Deleting is only possible when nothing references the row (Subject and
    /// User links are DeleteBehavior.Restrict, so a real delete would throw);
    /// archiving is the answer for everything else.
    /// </summary>
    public bool IsArchived { get; set; }

    public List<UniversityCourse> Courses { get; set; } = [];
}
