using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Tests;

/// <summary>
/// Covers LessonLike's unique (LessonId, UserId) constraint: a user can like
/// a given lesson at most once, but different users can each like the same
/// lesson independently.
/// </summary>
public class LessonLikeTests
{
    private static async Task<Guid> SeedSharedLessonAsync(TestDb db)
    {
        var ownerId = Guid.NewGuid();

        Guid lessonId;
        await using (var owner = db.For(ownerId))
        {
            var subject = new Subject { Name = "Subject" };
            owner.Subjects.Add(subject);
            await owner.SaveChangesAsync();

            var lesson = new Lesson { SubjectId = subject.Id, Title = "Lesson", IsShared = true, SharedAt = DateTimeOffset.UtcNow };
            owner.Lessons.Add(lesson);
            await owner.SaveChangesAsync();
            lessonId = lesson.Id;
        }

        return lessonId;
    }

    [Fact]
    public async Task DuplicateLike_BySameUser_ViolatesUniqueIndex()
    {
        await using var db = await TestDb.CreateAsync();
        var lessonId = await SeedSharedLessonAsync(db);
        var likerId = Guid.NewGuid();

        await using (var context = db.For(likerId))
        {
            context.LessonLikes.Add(new LessonLike { LessonId = lessonId, UserId = likerId });
            await context.SaveChangesAsync();
        }

        await using (var context = db.For(likerId))
        {
            context.LessonLikes.Add(new LessonLike { LessonId = lessonId, UserId = likerId });
            await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
        }
    }

    [Fact]
    public async Task DifferentUsers_CanEachLikeTheSameLesson()
    {
        await using var db = await TestDb.CreateAsync();
        var lessonId = await SeedSharedLessonAsync(db);
        var firstLikerId = Guid.NewGuid();
        var secondLikerId = Guid.NewGuid();

        await using (var context = db.For(firstLikerId))
        {
            context.LessonLikes.Add(new LessonLike { LessonId = lessonId, UserId = firstLikerId });
            await context.SaveChangesAsync();
        }

        await using (var context = db.For(secondLikerId))
        {
            context.LessonLikes.Add(new LessonLike { LessonId = lessonId, UserId = secondLikerId });
            await context.SaveChangesAsync();
        }

        await using var verify = db.For(firstLikerId);
        var count = await verify.LessonLikes.CountAsync(l => l.LessonId == lessonId);
        Assert.Equal(2, count);
    }
}
