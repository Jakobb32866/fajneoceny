using BackendApi.Domain;
using BackendApi.Services.Community;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Tests;

/// <summary>
/// Covers CourseProposalReconciliation.ReconcileAsync: linking a Subject to
/// its approved CourseProposal's course, the "leave Approved but unapplied"
/// behavior when that link would collide with an existing subject on the
/// same course, and that Pending/Rejected proposals and other users'
/// proposals are left alone.
/// </summary>
public class CourseProposalReconciliationTests
{
    /// <summary>
    /// University/UniversityCourse are owner-curated, not user-owned (no
    /// query filter), so any context can create them.
    /// </summary>
    private static async Task<(University university, UniversityCourse course)> SeedCourseAsync(TestDb db)
    {
        await using var context = db.For(Guid.NewGuid());
        var university = new University { Name = $"Test University {Guid.NewGuid()}" };
        context.Universities.Add(university);
        var course = new UniversityCourse { UniversityId = university.Id, Name = "Test Course" };
        context.UniversityCourses.Add(course);
        await context.SaveChangesAsync();
        return (university, course);
    }

    [Fact]
    public async Task ApprovedProposalWithCourseId_LinksSubjectAndSetsAppliedAt()
    {
        await using var db = await TestDb.CreateAsync();
        var (university, course) = await SeedCourseAsync(db);
        var userId = Guid.NewGuid();

        Guid subjectId, proposalId;
        await using (var setup = db.For(userId))
        {
            var subject = new Subject { Name = "Subject" };
            setup.Subjects.Add(subject);
            await setup.SaveChangesAsync();
            subjectId = subject.Id;

            var proposal = new CourseProposal
            {
                UniversityId = university.Id,
                SubjectId = subject.Id,
                Name = "Subject",
                Status = CourseProposalStatus.Approved,
                CourseId = course.Id,
            };
            setup.CourseProposals.Add(proposal);
            await setup.SaveChangesAsync();
            proposalId = proposal.Id;
        }

        await using (var context = db.For(userId))
        {
            await CourseProposalReconciliation.ReconcileAsync(context);
        }

        await using (var verify = db.For(userId))
        {
            var subject = await verify.Subjects.FirstAsync(s => s.Id == subjectId);
            var proposal = await verify.CourseProposals.FirstAsync(p => p.Id == proposalId);

            Assert.Equal(course.Id, subject.UniversityCourseId);
            Assert.NotNull(proposal.AppliedAt);
            Assert.Equal(CourseProposalStatus.Approved, proposal.Status);
        }
    }

    [Fact]
    public async Task Conflict_LeavesProposalApprovedAndSubjectUnlinked()
    {
        await using var db = await TestDb.CreateAsync();
        var (university, course) = await SeedCourseAsync(db);
        var userId = Guid.NewGuid();

        Guid subjectBId, proposalId;
        await using (var setup = db.For(userId))
        {
            // Subject A already occupies this course for this user.
            var subjectA = new Subject { Name = "Subject A", UniversityCourseId = course.Id };
            setup.Subjects.Add(subjectA);

            var subjectB = new Subject { Name = "Subject B" };
            setup.Subjects.Add(subjectB);
            await setup.SaveChangesAsync();
            subjectBId = subjectB.Id;

            var proposal = new CourseProposal
            {
                UniversityId = university.Id,
                SubjectId = subjectB.Id,
                Name = "Subject B",
                Status = CourseProposalStatus.Approved,
                CourseId = course.Id,
            };
            setup.CourseProposals.Add(proposal);
            await setup.SaveChangesAsync();
            proposalId = proposal.Id;
        }

        await using (var context = db.For(userId))
        {
            await CourseProposalReconciliation.ReconcileAsync(context);
        }

        await using (var verify = db.For(userId))
        {
            var subjectB = await verify.Subjects.FirstAsync(s => s.Id == subjectBId);
            var proposal = await verify.CourseProposals.FirstAsync(p => p.Id == proposalId);

            Assert.Null(subjectB.UniversityCourseId);
            Assert.Equal(CourseProposalStatus.Approved, proposal.Status);
            Assert.Null(proposal.AppliedAt);
        }
    }

    [Fact]
    public async Task PendingAndRejectedProposals_AreUntouched()
    {
        await using var db = await TestDb.CreateAsync();
        var (university, course) = await SeedCourseAsync(db);
        var userId = Guid.NewGuid();

        Guid pendingSubjectId, pendingProposalId, rejectedSubjectId, rejectedProposalId;
        await using (var setup = db.For(userId))
        {
            var pendingSubject = new Subject { Name = "Pending subject" };
            var rejectedSubject = new Subject { Name = "Rejected subject" };
            setup.Subjects.AddRange(pendingSubject, rejectedSubject);
            await setup.SaveChangesAsync();
            pendingSubjectId = pendingSubject.Id;
            rejectedSubjectId = rejectedSubject.Id;

            var pendingProposal = new CourseProposal
            {
                UniversityId = university.Id,
                SubjectId = pendingSubject.Id,
                Name = "Pending subject",
                Status = CourseProposalStatus.Pending,
            };
            var rejectedProposal = new CourseProposal
            {
                UniversityId = university.Id,
                SubjectId = rejectedSubject.Id,
                Name = "Rejected subject",
                Status = CourseProposalStatus.Rejected,
            };
            setup.CourseProposals.AddRange(pendingProposal, rejectedProposal);
            await setup.SaveChangesAsync();
            pendingProposalId = pendingProposal.Id;
            rejectedProposalId = rejectedProposal.Id;
        }

        await using (var context = db.For(userId))
        {
            await CourseProposalReconciliation.ReconcileAsync(context);
        }

        await using (var verify = db.For(userId))
        {
            var pendingSubject = await verify.Subjects.FirstAsync(s => s.Id == pendingSubjectId);
            var pendingProposal = await verify.CourseProposals.FirstAsync(p => p.Id == pendingProposalId);
            var rejectedSubject = await verify.Subjects.FirstAsync(s => s.Id == rejectedSubjectId);
            var rejectedProposal = await verify.CourseProposals.FirstAsync(p => p.Id == rejectedProposalId);

            Assert.Null(pendingSubject.UniversityCourseId);
            Assert.Null(pendingProposal.AppliedAt);
            Assert.Equal(CourseProposalStatus.Pending, pendingProposal.Status);

            Assert.Null(rejectedSubject.UniversityCourseId);
            Assert.Null(rejectedProposal.AppliedAt);
            Assert.Equal(CourseProposalStatus.Rejected, rejectedProposal.Status);
        }
    }

    [Fact]
    public async Task AnotherUsersApprovedProposal_IsNotTouched()
    {
        await using var db = await TestDb.CreateAsync();
        var (university, course) = await SeedCourseAsync(db);
        var reconcilingUserId = Guid.NewGuid();
        var otherUserId = Guid.NewGuid();

        Guid otherSubjectId, otherProposalId;
        await using (var setup = db.For(otherUserId))
        {
            var subject = new Subject { Name = "Other user's subject" };
            setup.Subjects.Add(subject);
            await setup.SaveChangesAsync();
            otherSubjectId = subject.Id;

            var proposal = new CourseProposal
            {
                UniversityId = university.Id,
                SubjectId = subject.Id,
                Name = "Other user's subject",
                Status = CourseProposalStatus.Approved,
                CourseId = course.Id,
            };
            setup.CourseProposals.Add(proposal);
            await setup.SaveChangesAsync();
            otherProposalId = proposal.Id;
        }

        // Reconcile scoped to a different user; CourseProposals' query filter
        // means this call should never see (or touch) otherUserId's proposal.
        await using (var context = db.For(reconcilingUserId))
        {
            await CourseProposalReconciliation.ReconcileAsync(context);
        }

        await using (var verify = db.For(otherUserId))
        {
            var subject = await verify.Subjects.FirstAsync(s => s.Id == otherSubjectId);
            var proposal = await verify.CourseProposals.FirstAsync(p => p.Id == otherProposalId);

            Assert.Null(subject.UniversityCourseId);
            Assert.Null(proposal.AppliedAt);
            Assert.Equal(CourseProposalStatus.Approved, proposal.Status);
        }
    }
}
