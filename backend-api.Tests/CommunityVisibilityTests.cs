using BackendApi.Domain;
using BackendApi.Services.Community;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Tests;

/// <summary>
/// Covers CommunityQueries.VisibleLessonsForCourse's filtering rules, plus a
/// regression check that AppDbContext's per-user query filter still holds:
/// a normal (filtered) Lessons query on another user's context must never
/// return someone else's lesson, shared or not.
/// </summary>
public class CommunityVisibilityTests
{
    private static async Task<(Guid ownerId, Guid courseId, Guid linkedSubjectId, Guid unlinkedSubjectId)> SeedAsync(TestDb db)
    {
        var universityId = Guid.NewGuid();
        var courseId = Guid.NewGuid();
        var ownerId = Guid.NewGuid();

        await using (var setup = db.For(ownerId))
        {
            setup.Universities.Add(new University { Id = universityId, Name = "Uni " + Guid.NewGuid() });
            setup.UniversityCourses.Add(new UniversityCourse { Id = courseId, UniversityId = universityId, Name = "Course" });
            setup.Users.Add(new User { Id = ownerId, Email = $"{ownerId}@example.com", FirstName = "A", LastName = "One", UniversityId = universityId });
            await setup.SaveChangesAsync();
        }

        Guid linkedSubjectId, unlinkedSubjectId;
        await using (var owner = db.For(ownerId))
        {
            var linked = new Subject { Name = "Linked subject", UniversityCourseId = courseId };
            var unlinked = new Subject { Name = "Unlinked subject" };
            owner.Subjects.AddRange(linked, unlinked);
            await owner.SaveChangesAsync();
            linkedSubjectId = linked.Id;
            unlinkedSubjectId = unlinked.Id;
        }

        return (ownerId, courseId, linkedSubjectId, unlinkedSubjectId);
    }

    [Fact]
    public async Task VisibleLessonsForCourse_OnlyIncludesSharedLessonsOnLinkedSubjects()
    {
        await using var db = await TestDb.CreateAsync();
        var (ownerId, courseId, linkedSubjectId, unlinkedSubjectId) = await SeedAsync(db);

        Guid sharedLinkedId, unsharedLinkedId, sharedUnlinkedId;
        await using (var owner = db.For(ownerId))
        {
            var sharedLinked = new Lesson { SubjectId = linkedSubjectId, Title = "Shared + linked", IsShared = true, SharedAt = DateTimeOffset.UtcNow };
            var unsharedLinked = new Lesson { SubjectId = linkedSubjectId, Title = "Unshared + linked", IsShared = false };
            var sharedUnlinked = new Lesson { SubjectId = unlinkedSubjectId, Title = "Shared + unlinked", IsShared = true, SharedAt = DateTimeOffset.UtcNow };
            owner.Lessons.AddRange(sharedLinked, unsharedLinked, sharedUnlinked);
            await owner.SaveChangesAsync();

            sharedLinkedId = sharedLinked.Id;
            unsharedLinkedId = unsharedLinked.Id;
            sharedUnlinkedId = sharedUnlinked.Id;
        }

        // A different user's context: VisibleLessonsForCourse ignores the owner filter by design
        // (that's the whole point), but must still apply the IsShared + linked-subject rules.
        await using var reader = db.For(Guid.NewGuid());
        var visibleIds = await CommunityQueries.VisibleLessonsForCourse(reader, courseId)
            .Select(l => l.Id)
            .ToListAsync();

        Assert.Contains(sharedLinkedId, visibleIds);
        Assert.DoesNotContain(unsharedLinkedId, visibleIds);
        Assert.DoesNotContain(sharedUnlinkedId, visibleIds);
    }

    [Fact]
    public async Task NormalLessonsQuery_NeverReturnsAnotherUsersLesson_EvenWhenShared()
    {
        await using var db = await TestDb.CreateAsync();
        var (ownerId, _, linkedSubjectId, _) = await SeedAsync(db);
        var otherUserId = Guid.NewGuid();

        Guid lessonId;
        await using (var owner = db.For(ownerId))
        {
            var lesson = new Lesson { SubjectId = linkedSubjectId, Title = "Shared lesson", IsShared = true, SharedAt = DateTimeOffset.UtcNow };
            owner.Lessons.Add(lesson);
            await owner.SaveChangesAsync();
            lessonId = lesson.Id;
        }

        await using var other = db.For(otherUserId);

        var found = await other.Lessons.FirstOrDefaultAsync(l => l.Id == lessonId);
        Assert.Null(found);

        var any = await other.Lessons.AnyAsync(l => l.Id == lessonId);
        Assert.False(any);

        var all = await other.Lessons.ToListAsync();
        Assert.Empty(all);
    }
}
