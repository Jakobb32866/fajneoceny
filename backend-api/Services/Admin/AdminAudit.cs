using BackendApi.Data;
using BackendApi.Domain;

namespace BackendApi.Services.Admin;

/// <summary>
/// Writes AdminAuditEntry rows. One helper so every admin action records the
/// same shape, and so the Summary snapshot is never forgotten — without it,
/// history for a taken-down lesson would be unreadable (the lesson itself
/// becomes invisible to admins the moment it is unshared).
///
/// Adds to the change tracker; the caller saves.
/// </summary>
public static class AdminAudit
{
    public static void Record(
        AppDbContext db,
        Domain.Admin admin,
        string action,
        string targetType,
        Guid targetId,
        Guid? universityId,
        string summary,
        string? reason = null)
    {
        db.AdminAuditEntries.Add(new AdminAuditEntry
        {
            AdminId = admin.Id,
            Action = action,
            TargetType = targetType,
            TargetId = targetId,
            UniversityId = universityId,
            Summary = Truncate(summary, 500),
            Reason = reason is null ? null : Truncate(reason, 1000),
        });
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max];
}
