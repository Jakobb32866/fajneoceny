namespace BackendApi.Domain;

public enum GradeCategory
{
    Project,
    Exam,
    Homework,
    Other,
}

public class GradingScheme : IOwnedByUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid SubjectId { get; set; }
    public Subject? Subject { get; set; }

    public List<GradingComponent> Components { get; set; } = [];
}

/// <summary>
/// A single weighted piece of the final grade, either extracted from the
/// uploaded syllabus (IsAdHoc = false) or added later by the student
/// (IsAdHoc = true) for a homework/quiz the syllabus didn't mention.
/// </summary>
public class GradingComponent : IOwnedByUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid GradingSchemeId { get; set; }
    public GradingScheme? GradingScheme { get; set; }

    public string Name { get; set; } = string.Empty;
    public GradeCategory Category { get; set; }

    /// <summary>Weight as a percentage of the final grade, e.g. 20 for 20%.</summary>
    public double WeightPercent { get; set; }

    public bool IsAdHoc { get; set; }

    public List<GradeEntry> Entries { get; set; } = [];
}

/// <summary>
/// An actual score the student recorded against a GradingComponent
/// (e.g. "Kolokwium 1: 18/20").
/// </summary>
public class GradeEntry : IOwnedByUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid GradingComponentId { get; set; }
    public GradingComponent? GradingComponent { get; set; }

    public string Name { get; set; } = string.Empty;
    public double Score { get; set; }
    public double MaxScore { get; set; } = 100;
    public DateTimeOffset Date { get; set; } = DateTimeOffset.UtcNow;
}
