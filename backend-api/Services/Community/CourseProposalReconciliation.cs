using BackendApi.Data;
using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Services.Community;

/// <summary>
/// Applies approved-but-unapplied CourseProposals onto their Subject. The
/// owner reviews proposals out-of-band via SQL (setting Status = Approved and
/// CourseId together); this is what actually links the student's Subject to
/// that UniversityCourse, run opportunistically whenever the subjects list
/// loads (AppDbContext.CourseProposals is query-filtered to the current
/// user, so a single call only ever reconciles that user's own proposals).
/// </summary>
public static class CourseProposalReconciliation
{
    public static async Task ReconcileAsync(AppDbContext db)
    {
        var candidates = await db.CourseProposals
            .Include(p => p.Subject)
            .Where(p => p.Status == CourseProposalStatus.Approved && p.AppliedAt == null && p.CourseId != null)
            .ToListAsync();

        if (candidates.Count == 0) return;

        var now = DateTimeOffset.UtcNow;

        // Courses claimed by this pass, so two proposals in the same batch
        // that target the same course don't both look conflict-free against
        // the (not-yet-saved) database state.
        var claimedCourseIds = new HashSet<Guid>();

        foreach (var proposal in candidates)
        {
            var subject = proposal.Subject;
            if (subject is null) continue;

            var courseId = proposal.CourseId!.Value;

            // If the user already has a *different* subject linked to this
            // course — e.g. they joined it directly via UniversityCourseId
            // while the proposal was still pending — applying this proposal
            // would violate the one-subject-per-course unique index
            // (UserId, UniversityCourseId). Rather than fail the whole
            // reconciliation or silently steal the link from the other
            // subject, we leave the proposal Approved but unapplied: the
            // student keeps both subjects, sees their proposal is approved,
            // and can resolve the conflict themselves (e.g. by deleting or
            // relinking a subject). The next subjects-list load re-evaluates.
            var conflict = claimedCourseIds.Contains(courseId)
                || await db.Subjects.AnyAsync(s => s.UniversityCourseId == courseId && s.Id != subject.Id);
            if (conflict) continue;

            subject.UniversityCourseId = courseId;
            proposal.AppliedAt = now;
            claimedCourseIds.Add(courseId);
        }

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Unique index race (e.g. a concurrent request linked the same
            // course between our check and the save). Safe to ignore: no
            // partial state is exposed since nothing in this call is
            // persisted, and the next reconcile pass will re-evaluate and
            // either apply cleanly or detect the conflict above.
        }
    }
}
