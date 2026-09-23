namespace BackendApi.Domain;

/// <summary>
/// Append-only record of every admin action.
///
/// This exists because moderation destroys its own evidence: taking a lesson
/// down sets IsShared = false, after which AdminQueries can no longer see it
/// (by design — admins must never read unshared content). Without a snapshot
/// taken at action time, a super admin reviewing a questionable takedown
/// would have nothing at all to review.
/// </summary>
public class AdminAuditEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The acting admin. Resolved by join for display — see Admin's note on soft-deletion.</summary>
    public Guid AdminId { get; set; }

    /// <summary>One of AdminAuditActions.</summary>
    public string Action { get; set; } = string.Empty;

    public string TargetType { get; set; } = string.Empty;
    public Guid TargetId { get; set; }

    /// <summary>Which university the action happened in, so a super admin can filter history per school.</summary>
    public Guid? UniversityId { get; set; }

    /// <summary>
    /// Denormalised human-readable description captured at action time
    /// (e.g. «Sieci 3» — Jan Kowalski). Deliberately text rather than a join:
    /// the target may be deleted, and re-reading a taken-down lesson to
    /// render history would breach the "no unshared content" rule.
    /// </summary>
    public string Summary { get; set; } = string.Empty;

    public string? Reason { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Action names used in AdminAuditEntry.Action, kept in one place so history stays filterable.</summary>
public static class AdminAuditActions
{
    public const string ProposalApproved = "ProposalApproved";
    public const string ProposalRejected = "ProposalRejected";
    public const string CourseCreated = "CourseCreated";
    public const string CourseUpdated = "CourseUpdated";
    public const string CourseArchived = "CourseArchived";
    public const string CourseDeleted = "CourseDeleted";
    public const string LessonTakedown = "LessonTakedown";
    public const string LessonLockLifted = "LessonLockLifted";
    public const string ShareBanIssued = "ShareBanIssued";
    public const string ShareBanLifted = "ShareBanLifted";
    public const string UniversityCreated = "UniversityCreated";
    public const string UniversityUpdated = "UniversityUpdated";
    public const string UniversityArchived = "UniversityArchived";
    public const string UniversityDeleted = "UniversityDeleted";
    public const string AdminCreated = "AdminCreated";
    public const string AdminUpdated = "AdminUpdated";
    public const string AdminDisabled = "AdminDisabled";
}
