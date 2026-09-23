namespace BackendApi.Domain;

/// <summary>
/// A course offered at a university (e.g. "BSI — Bezpieczeństwo systemów
/// informacyjnych"). Like University, these are curated by the owner directly
/// in SQL, never created from user input.
/// </summary>
public class UniversityCourse
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UniversityId { get; set; }
    public University? University { get; set; }

    public string? Code { get; set; }
    public string Name { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// Hidden from registration and course pickers without being destroyed.
    /// Deleting is only possible when nothing references the row (Subject and
    /// User links are DeleteBehavior.Restrict, so a real delete would throw);
    /// archiving is the answer for everything else.
    /// </summary>
    public bool IsArchived { get; set; }
}
