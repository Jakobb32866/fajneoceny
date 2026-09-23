using BackendApi.Domain;
using BackendApi.Services.Community;

namespace BackendApi.Tests;

/// <summary>
/// Duplicate course names are rejected at submission, because a near-duplicate
/// ("Bazy danych" vs "Bazy Danych") silently splits a community feed in two
/// and nothing short of a manual merge can undo it.
/// </summary>
public class CourseProposalDuplicateTests
{
    private static async Task<(Guid universityId, Guid userId)> SeedAsync(TestDb db, string existingCourseName)
    {
        var universityId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        await using var setup = db.For(userId);
        setup.Universities.Add(new University { Id = universityId, Name = "Uni " + universityId });
        setup.UniversityCourses.Add(new UniversityCourse
        {
            UniversityId = universityId,
            Name = existingCourseName,
        });
        setup.Users.Add(new User { Id = userId, Email = $"{userId}@e.com", UniversityId = universityId });
        await setup.SaveChangesAsync();

        return (universityId, userId);
    }

    [Theory]
    [InlineData("Bazy danych")]          // exact
    [InlineData("bazy danych")]          // case
    [InlineData("BAZY DANYCH")]          // case
    [InlineData("  Bazy danych  ")]      // whitespace
    public async Task ANameMatchingAnExistingCourse_IsTaken(string proposed)
    {
        await using var db = await TestDb.CreateAsync();
        var (universityId, userId) = await SeedAsync(db, "Bazy danych");

        await using var ctx = db.For(userId);
        Assert.True(await CourseNaming.IsNameTakenAsync(ctx, universityId, proposed));
    }

    [Fact]
    public async Task ANameMatchingAPendingProposal_IsTaken()
    {
        await using var db = await TestDb.CreateAsync();
        var (universityId, userId) = await SeedAsync(db, "Sieci");

        await using var ctx = db.For(userId);
        var subject = new Subject { Name = "Bazy danych" };
        ctx.Subjects.Add(subject);
        await ctx.SaveChangesAsync();

        ctx.CourseProposals.Add(new CourseProposal
        {
            UniversityId = universityId,
            SubjectId = subject.Id,
            Name = "Bazy danych",
            Status = CourseProposalStatus.Pending,
        });
        await ctx.SaveChangesAsync();

        Assert.True(await CourseNaming.IsNameTakenAsync(ctx, universityId, "bazy DANYCH"));
    }

    [Fact]
    public async Task ARejectedProposalDoesNotBlockTheNameAgain()
    {
        await using var db = await TestDb.CreateAsync();
        var (universityId, userId) = await SeedAsync(db, "Sieci");

        await using var ctx = db.For(userId);
        var subject = new Subject { Name = "Bazy danych" };
        ctx.Subjects.Add(subject);
        await ctx.SaveChangesAsync();

        ctx.CourseProposals.Add(new CourseProposal
        {
            UniversityId = universityId,
            SubjectId = subject.Id,
            Name = "Bazy danych",
            Status = CourseProposalStatus.Rejected,
        });
        await ctx.SaveChangesAsync();

        // Only PENDING proposals hold a name; otherwise one rejection would
        // burn that course name for good.
        Assert.False(await CourseNaming.IsNameTakenAsync(ctx, universityId, "Bazy danych"));
    }

    [Fact]
    public async Task TheSameNameInAnotherUniversityIsFine()
    {
        await using var db = await TestDb.CreateAsync();
        var (_, userId) = await SeedAsync(db, "Bazy danych");
        var otherUniversityId = Guid.NewGuid();

        await using var ctx = db.For(userId);
        ctx.Universities.Add(new University { Id = otherUniversityId, Name = "Other " + otherUniversityId });
        await ctx.SaveChangesAsync();

        Assert.False(await CourseNaming.IsNameTakenAsync(ctx, otherUniversityId, "Bazy danych"));
    }

    [Fact]
    public async Task AGenuinelyNewNameIsFree()
    {
        await using var db = await TestDb.CreateAsync();
        var (universityId, userId) = await SeedAsync(db, "Bazy danych");

        await using var ctx = db.For(userId);
        Assert.False(await CourseNaming.IsNameTakenAsync(ctx, universityId, "Grafika komputerowa"));
    }
}
