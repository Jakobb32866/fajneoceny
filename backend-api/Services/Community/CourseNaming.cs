using BackendApi.Data;
using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Services.Community;

/// <summary>
/// The rule that keeps a university's course catalogue free of near-duplicates.
///
/// Two courses differing only by case or whitespace ("Bazy danych" /
/// "Bazy Danych") are, to a student, the same course — but each gets its own
/// community feed, so the shared notes for that subject end up split in half
/// with no way back short of a manual merge. Cheaper to refuse the name.
///
/// Shared deliberately: students hit it when proposing a course
/// (SubjectEndpoints) and admins hit it when creating or approving one
/// (AdminEndpoints), and the two must agree.
/// </summary>
public static class CourseNaming
{
    /// <summary>
    /// Whether a course name is already claimed in a university, by a real
    /// course or by a proposal still awaiting review.
    /// </summary>
    public static async Task<bool> IsNameTakenAsync(
        AppDbContext db, Guid universityId, string name, Guid? excludingProposalId = null)
    {
        var normalized = name.Trim().ToLowerInvariant();
        if (normalized.Length == 0) return false;

        var courseExists = await db.UniversityCourses
            .AnyAsync(c => c.UniversityId == universityId && c.Name.ToLower() == normalized);
        if (courseExists) return true;

        // Only PENDING proposals hold a name. A rejected one must not burn
        // that course name for everyone, for good.
        return await db.CourseProposals.IgnoreQueryFilters()
            .AnyAsync(p => p.UniversityId == universityId
                && p.Status == CourseProposalStatus.Pending
                && p.Name.ToLower() == normalized
                && (excludingProposalId == null || p.Id != excludingProposalId));
    }
}
