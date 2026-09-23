namespace BackendApi.Domain;

public enum AdminRole
{
    /// <summary>Scoped to a single university (or none, until one is assigned).</summary>
    Admin,

    /// <summary>Server-wide. Exactly one, bootstrapped from configuration.</summary>
    SuperAdmin,
}

/// <summary>
/// An administrator account. Deliberately a separate identity from User: an
/// admin is never a student, owns no subjects/lessons, and authenticates
/// through its own endpoint with its own JWT (audience "fajneoceny-admin").
/// Not IOwnedByUser, so no query filter — like University, this is
/// reference data rather than per-user data.
///
/// Rows are never hard-deleted: AdminAuditEntry stores only an AdminId and
/// resolves the acting admin by join, so destroying a row would erase the
/// trail of who did what. "Removing" an admin sets DisabledAt instead.
/// </summary>
public class Admin
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Stored lower-cased; unique index.</summary>
    public string Email { get; set; } = string.Empty;

    public string? PasswordHash { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public AdminRole Role { get; set; } = AdminRole.Admin;

    /// <summary>The one university this admin moderates; null for SuperAdmin, and for an Admin not yet assigned.</summary>
    public Guid? UniversityId { get; set; }
    public University? University { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>Soft-delete. A disabled admin fails AdminContext resolution on their very next request.</summary>
    public DateTimeOffset? DisabledAt { get; set; }
}
