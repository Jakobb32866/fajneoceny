namespace BackendApi.Domain;

public enum CourseProposalStatus
{
    Pending,
    Approved,
    Rejected,
}

/// <summary>
/// A student's request to add a new course to their university's catalogue
/// (raised when they create a Subject and propose it as a shared course).
/// Reviewed by an admin for the proposal's university (POST
/// /api/admin/proposals/{id}/approve|reject), which sets CourseId + Status.
/// The app then links the subject to that course and stamps AppliedAt the
/// next time the subjects list loads — see CourseProposalReconciliation.
/// </summary>
public class CourseProposal : IOwnedByUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid UniversityId { get; set; }
    public Guid SubjectId { get; set; }
    public Subject? Subject { get; set; }

    public string Name { get; set; } = string.Empty;
    public CourseProposalStatus Status { get; set; } = CourseProposalStatus.Pending;

    /// <summary>Set by the reviewing admin alongside Status = Approved.</summary>
    public Guid? CourseId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReviewedAt { get; set; }

    /// <summary>
    /// Why the proposal was rejected. A proposal is reviewed exactly once, so
    /// unlike ShareBan a single column is the right shape here.
    /// </summary>
    public string? ReviewReason { get; set; }

    /// <summary>Which admin reviewed it.</summary>
    public Guid? ReviewedByAdminId { get; set; }

    /// <summary>When the app linked the subject to the approved course.</summary>
    public DateTimeOffset? AppliedAt { get; set; }
}
