using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Tests;

/// <summary>
/// Covers AppDbContext's Lesson.ContentUpdatedAt bump: adding/editing a
/// Note/Deck/Flashcard should bump the owning lesson (and only that lesson),
/// while saving an unrelated entity should leave it untouched.
/// </summary>
public class ContentUpdatedAtBumpTests
{
    private static async Task<(Guid userId, Guid subjectId, Guid lessonId)> SeedLessonAsync(TestDb db)
    {
        var userId = Guid.NewGuid();
        await using var setup = db.For(userId);

        var subject = new Subject { Name = "Subject" };
        setup.Subjects.Add(subject);
        await setup.SaveChangesAsync();

        var lesson = new Lesson { SubjectId = subject.Id, Title = "Lesson" };
        setup.Lessons.Add(lesson);
        await setup.SaveChangesAsync();

        return (userId, subject.Id, lesson.Id);
    }

    private static async Task<DateTimeOffset> GetContentUpdatedAtAsync(TestDb db, Guid userId, Guid lessonId)
    {
        await using var context = db.For(userId);
        var lesson = await context.Lessons.FirstAsync(l => l.Id == lessonId);
        return lesson.ContentUpdatedAt;
    }

    [Fact]
    public async Task AddingNote_BumpsLessonContentUpdatedAt()
    {
        await using var db = await TestDb.CreateAsync();
        var (userId, _, lessonId) = await SeedLessonAsync(db);

        var before = await GetContentUpdatedAtAsync(db, userId, lessonId);
        await Task.Delay(10);

        await using (var context = db.For(userId))
        {
            context.Notes.Add(new Note { LessonId = lessonId, Content = "hello" });
            await context.SaveChangesAsync();
        }

        var after = await GetContentUpdatedAtAsync(db, userId, lessonId);
        Assert.True(after > before, $"expected {after} > {before}");
    }

    [Fact]
    public async Task EditingFlashcard_BumpsOnlyItsOwnLesson()
    {
        await using var db = await TestDb.CreateAsync();
        var (userId, subjectId, lessonId) = await SeedLessonAsync(db);

        Guid flashcardId;
        Guid otherLessonId;
        await using (var context = db.For(userId))
        {
            var flashcard = new Flashcard { LessonId = lessonId, Question = "Q", Answer = "A" };
            context.Flashcards.Add(flashcard);

            var otherLesson = new Lesson { SubjectId = subjectId, Title = "Other lesson" };
            context.Lessons.Add(otherLesson);

            await context.SaveChangesAsync();
            flashcardId = flashcard.Id;
            otherLessonId = otherLesson.Id;
        }

        var lessonBefore = await GetContentUpdatedAtAsync(db, userId, lessonId);
        var otherBefore = await GetContentUpdatedAtAsync(db, userId, otherLessonId);
        await Task.Delay(10);

        await using (var context = db.For(userId))
        {
            var flashcard = await context.Flashcards.FirstAsync(f => f.Id == flashcardId);
            flashcard.Answer = "Updated answer";
            await context.SaveChangesAsync();
        }

        var lessonAfter = await GetContentUpdatedAtAsync(db, userId, lessonId);
        var otherAfter = await GetContentUpdatedAtAsync(db, userId, otherLessonId);

        Assert.True(lessonAfter > lessonBefore, $"expected {lessonAfter} > {lessonBefore}");
        Assert.Equal(otherBefore, otherAfter);
    }

    [Fact]
    public async Task SavingUnrelatedEntity_DoesNotBumpLesson()
    {
        await using var db = await TestDb.CreateAsync();
        var (userId, subjectId, lessonId) = await SeedLessonAsync(db);

        var before = await GetContentUpdatedAtAsync(db, userId, lessonId);
        await Task.Delay(10);

        await using (var context = db.For(userId))
        {
            var subject = await context.Subjects.FirstAsync(s => s.Id == subjectId);
            subject.Name = "Renamed subject";
            await context.SaveChangesAsync();
        }

        var after = await GetContentUpdatedAtAsync(db, userId, lessonId);
        Assert.Equal(before, after);
    }
}
