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
/// Reviewed out-of-band by the owner via SQL: setting CourseId + Status =
/// Approved links the proposal to a real UniversityCourse. The app then
/// links the subject to that course and stamps AppliedAt the next time the
/// subjects list loads.
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

    /// <summary>Set by the owner alongside Status = Approved, via SQL.</summary>
    public Guid? CourseId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReviewedAt { get; set; }

    /// <summary>When the app linked the subject to the approved course.</summary>
    public DateTimeOffset? AppliedAt { get; set; }
}
