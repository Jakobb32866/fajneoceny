using BackendApi.Domain;
using BackendApi.Services.Admin;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Tests;

/// <summary>
/// The central promise of the admin feature: an admin can only ever see
/// lessons their author chose to share, and only within their own university.
///
/// Mirrors CommunityVisibilityTests, which guards the same invariant on the
/// student side.
/// </summary>
public class AdminVisibilityTests
{
    private record Seed(Guid UniversityId, Guid OtherUniversityId, Guid CourseId, Guid OtherCourseId, Guid OwnerId, Guid OtherOwnerId);

    private static async Task<Seed> SeedAsync(TestDb db)
    {
        var uniA = Guid.NewGuid();
        var uniB = Guid.NewGuid();
        var courseA = Guid.NewGuid();
        var courseB = Guid.NewGuid();
        var ownerA = Guid.NewGuid();
        var ownerB = Guid.NewGuid();

        await using (var setup = db.For(ownerA))
        {
            setup.Universities.AddRange(
                new University { Id = uniA, Name = "Uni A " + uniA },
                new University { Id = uniB, Name = "Uni B " + uniB });
            setup.UniversityCourses.AddRange(
                new UniversityCourse { Id = courseA, UniversityId = uniA, Name = "Course A" },
                new UniversityCourse { Id = courseB, UniversityId = uniB, Name = "Course B" });
            setup.Users.AddRange(
                new User { Id = ownerA, Email = $"{ownerA}@e.com", FirstName = "A", LastName = "One", UniversityId = uniA },
                new User { Id = ownerB, Email = $"{ownerB}@e.com", FirstName = "B", LastName = "Two", UniversityId = uniB });
            await setup.SaveChangesAsync();
        }

        return new Seed(uniA, uniB, courseA, courseB, ownerA, ownerB);
    }

    private static async Task<(Guid shared, Guid unshared)> SeedLessonsAsync(TestDb db, Guid ownerId, Guid courseId)
    {
        await using var owner = db.For(ownerId);
        var subject = new Subject { Name = "S", UniversityCourseId = courseId };
        owner.Subjects.Add(subject);
        await owner.SaveChangesAsync();

        var shared = new Lesson { SubjectId = subject.Id, Title = "Shared", IsShared = true, SharedAt = DateTimeOffset.UtcNow };
        var unshared = new Lesson { SubjectId = subject.Id, Title = "Private", IsShared = false };
        owner.Lessons.AddRange(shared, unshared);
        await owner.SaveChangesAsync();

        return (shared.Id, unshared.Id);
    }

    [Fact]
    public async Task SharedLessonsForUniversity_NeverReturnsAnUnsharedLesson()
    {
        await using var db = await TestDb.CreateAsync();
        var seed = await SeedAsync(db);
        var (shared, unshared) = await SeedLessonsAsync(db, seed.OwnerId, seed.CourseId);

        await using var admin = db.ForAdmin();
        var visible = await AdminQueries.SharedLessonsForUniversity(admin, seed.UniversityId)
            .Select(l => l.Id).ToListAsync();

        Assert.Contains(shared, visible);
        Assert.DoesNotContain(unshared, visible);
    }

    [Fact]
    public async Task SharedLessonById_RefusesAnUnsharedLessonEvenWhenItsIdIsKnown()
    {
        await using var db = await TestDb.CreateAsync();
        var seed = await SeedAsync(db);
        var (_, unshared) = await SeedLessonsAsync(db, seed.OwnerId, seed.CourseId);

        await using var admin = db.ForAdmin();
        var found = await AdminQueries.SharedLessonById(admin, seed.UniversityId, unshared).FirstOrDefaultAsync();

        Assert.Null(found);
    }

    [Fact]
    public async Task SharedLessonById_RefusesALessonFromAnotherUniversity()
    {
        await using var db = await TestDb.CreateAsync();
        var seed = await SeedAsync(db);
        var (sharedElsewhere, _) = await SeedLessonsAsync(db, seed.OtherOwnerId, seed.OtherCourseId);

        await using var admin = db.ForAdmin();

        // Knowing the Guid must not be enough to cross a university boundary.
        var found = await AdminQueries.SharedLessonById(admin, seed.UniversityId, sharedElsewhere).FirstOrDefaultAsync();
        Assert.Null(found);

        var visible = await AdminQueries.SharedLessonsForUniversity(admin, seed.UniversityId)
            .Select(l => l.Id).ToListAsync();
        Assert.DoesNotContain(sharedElsewhere, visible);
    }

    [Fact]
    public async Task TakenDownLesson_BecomesInvisibleToAdminsImmediately()
    {
        await using var db = await TestDb.CreateAsync();
        var seed = await SeedAsync(db);
        var (shared, _) = await SeedLessonsAsync(db, seed.OwnerId, seed.CourseId);

        await using (var admin = db.ForAdmin())
        {
            var lesson = await AdminQueries.SharedLessonByIdForUpdate(admin, seed.UniversityId, shared).FirstAsync();
            lesson.IsShared = false;
            lesson.ModerationLockedAt = DateTimeOffset.UtcNow;
            lesson.ModerationLockReason = "spam";
            await admin.SaveChangesAsync();
        }

        await using var after = db.ForAdmin();

        // Content is gone from every admin view — this is the invariant, not
        // a gap. The AdminAuditEntry snapshot is what keeps the action
        // reviewable afterwards.
        Assert.Null(await AdminQueries.SharedLessonById(after, seed.UniversityId, shared).FirstOrDefaultAsync());

        // Only the metadata-only locked view can still reach it, so the lock
        // can be lifted.
        Assert.NotNull(await AdminQueries.LockedLessonById(after, seed.UniversityId, shared).FirstOrDefaultAsync());
    }

    [Fact]
    public async Task SharedLessonsForUser_ShowsOnlyWhatThatUserPublished()
    {
        await using var db = await TestDb.CreateAsync();
        var seed = await SeedAsync(db);
        var (shared, unshared) = await SeedLessonsAsync(db, seed.OwnerId, seed.CourseId);

        await using var admin = db.ForAdmin();
        var ids = await AdminQueries.SharedLessonsForUser(admin, seed.UniversityId, seed.OwnerId)
            .Select(l => l.Id).ToListAsync();

        Assert.Equal([shared], ids);
        Assert.DoesNotContain(unshared, ids);
    }

    [Fact]
    public async Task AdminContext_LeavesOwnedEntityQueriesEmpty()
    {
        await using var db = await TestDb.CreateAsync();
        var seed = await SeedAsync(db);
        await SeedLessonsAsync(db, seed.OwnerId, seed.CourseId);

        await using var admin = db.ForAdmin();

        // A plain (filtered) query on an admin request must return nothing:
        // CurrentUser.UserId is Guid.Empty, so admin code cannot accidentally
        // read student-owned data without going through AdminQueries.
        Assert.Empty(await admin.Lessons.ToListAsync());
        Assert.Empty(await admin.Subjects.ToListAsync());
    }
}
