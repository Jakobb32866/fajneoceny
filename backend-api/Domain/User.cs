namespace BackendApi.Domain;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Email { get; set; } = string.Empty; // stored lower-cased
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string SchoolName { get; set; } = string.Empty;
    public string? PasswordHash { get; set; }
    public string? GoogleSubjectId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// Stamped on every successful sign-in. Drives the "active users today /
    /// last 7 days" stats, so it is stored as an integer column (see
    /// AppDbContext's UtcEpochMillis converter) to stay queryable in SQLite.
    /// Null for accounts that have never signed in since this was added.
    /// </summary>
    public DateTimeOffset? LastLoginAt { get; set; }

    /// <summary>Set once the user picks their university; null means "not recognised" for community features.</summary>
    public Guid? UniversityId { get; set; }
    public University? University { get; set; }
}
