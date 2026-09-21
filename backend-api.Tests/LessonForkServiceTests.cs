using BackendApi.Domain;
using BackendApi.Services.Community;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Tests;

/// <summary>
/// Covers LessonForkService: forking copies a shared lesson's content into a
/// new lesson owned by the forking user (with fresh ids and no SRS/quiz
/// history), and syncing wipes + re-copies that content from a changed
/// original.
/// </summary>
public class LessonForkServiceTests
{
    private static async Task<(Guid ownerId, Guid targetUserId, Guid targetSubjectId, Guid lessonId)> SeedAsync(TestDb db)
    {
        var universityId = Guid.NewGuid();
        var courseId = Guid.NewGuid();
        var ownerId = Guid.NewGuid();
        var targetUserId = Guid.NewGuid();

        await using (var setup = db.For(ownerId))
        {
            setup.Universities.Add(new University { Id = universityId, Name = "Test University " + Guid.NewGuid() });
            setup.UniversityCourses.Add(new UniversityCourse { Id = courseId, UniversityId = universityId, Name = "Course" });
            setup.Users.Add(new User { Id = ownerId, Email = $"{ownerId}@example.com", FirstName = "Ann", LastName = "Owner", UniversityId = universityId });
            setup.Users.Add(new User { Id = targetUserId, Email = $"{targetUserId}@example.com", FirstName = "Bob", LastName = "Target", UniversityId = universityId });
            await setup.SaveChangesAsync();
        }

        Guid lessonId, deckId;
        await using (var owner = db.For(ownerId))
        {
            var subject = new Subject { Name = "Owner subject", UniversityCourseId = courseId };
            owner.Subjects.Add(subject);
            await owner.SaveChangesAsync();

            var lesson = new Lesson { SubjectId = subject.Id, Title = "Original lesson", IsShared = true, SharedAt = DateTimeOffset.UtcNow };
            owner.Lessons.Add(lesson);
            await owner.SaveChangesAsync();
            lessonId = lesson.Id;

            owner.Notes.Add(new Note { LessonId = lessonId, Content = "note content" });

            var deck = new Deck { LessonId = lessonId, Name = "Deck 1", IsAiGenerated = true, Difficulty = Difficulty.Medium };
            owner.Decks.Add(deck);
            await owner.SaveChangesAsync();
            deckId = deck.Id;

            var card = new Flashcard { LessonId = lessonId, DeckId = deckId, Question = "Q1", Answer = "A1", Difficulty = Difficulty.Medium };
            owner.Flashcards.Add(card);
            await owner.SaveChangesAsync();

            // SRS state + a quiz session on the original — must never be copied to the fork.
            owner.SpacedRepetitionStates.Add(new SpacedRepetitionState { FlashcardId = card.Id });
            owner.QuizSessions.Add(new QuizSession { LessonId = lessonId, RequestedCount = 1, Difficulty = Difficulty.Medium, FlashcardIds = [card.Id] });
            await owner.SaveChangesAsync();
        }

        Guid targetSubjectId;
        await using (var target = db.For(targetUserId))
        {
            var subject = new Subject { Name = "Target subject", UniversityCourseId = courseId };
            target.Subjects.Add(subject);
            await target.SaveChangesAsync();
            targetSubjectId = subject.Id;
        }

        return (ownerId, targetUserId, targetSubjectId, lessonId);
    }

    private static async Task<Lesson> LoadOriginalAsync(BackendApi.Data.AppDbContext db, Guid lessonId) =>
        await CommunityQueries.VisibleLessonById(db, lessonId)
            .Include(l => l.Notes)
            .Include(l => l.Decks).ThenInclude(d => d.Flashcards)
            .AsSplitQuery()
            .FirstAsync();

    [Fact]
    public async Task ForkAsync_CopiesContentWithNewIdsOwnedByTarget_AndSkipsStudyProgress()
    {
        await using var db = await TestDb.CreateAsync();
        var (_, targetUserId, targetSubjectId, lessonId) = await SeedAsync(db);

        Lesson fork;
        await using (var target = db.For(targetUserId))
        {
            var original = await LoadOriginalAsync(target, lessonId);
            fork = await LessonForkService.ForkAsync(target, original, targetSubjectId, "Ann Owner");
        }

        Assert.NotEqual(lessonId, fork.Id);
        Assert.Equal(targetSubjectId, fork.SubjectId);
        Assert.Equal("Original lesson", fork.Title);
        Assert.Equal(lessonId, fork.ForkedFromLessonId);
        Assert.Equal("Ann Owner", fork.ForkedFromAuthorName);
        Assert.NotNull(fork.ForkSyncedAt);

        await using var verify = db.For(targetUserId);
        var saved = await verify.Lessons
            .Include(l => l.Notes)
            .Include(l => l.Decks).ThenInclude(d => d.Flashcards)
            .AsSplitQuery()
            .FirstAsync(l => l.Id == fork.Id);

        Assert.Equal(targetUserId, saved.UserId);

        Assert.Single(saved.Notes);
        Assert.Equal("note content", saved.Notes[0].Content);
        Assert.Equal(targetUserId, saved.Notes[0].UserId);

        Assert.Single(saved.Decks);
        var deck = saved.Decks[0];
        Assert.Equal("Deck 1", deck.Name);
        Assert.True(deck.IsAiGenerated);
        Assert.Equal(Difficulty.Medium, deck.Difficulty);
        Assert.Equal(targetUserId, deck.UserId);

        Assert.Single(deck.Flashcards);
        var card = deck.Flashcards[0];
        Assert.Equal("Q1", card.Question);
        Assert.Equal("A1", card.Answer);
        Assert.Equal(targetUserId, card.UserId);
        Assert.Equal(deck.Id, card.DeckId);
        Assert.Equal(fork.Id, card.LessonId);

        var srsCount = await verify.SpacedRepetitionStates.CountAsync(s => s.FlashcardId == card.Id);
        Assert.Equal(0, srsCount);
        var quizCount = await verify.QuizSessions.CountAsync(q => q.LessonId == fork.Id);
        Assert.Equal(0, quizCount);
    }

    [Fact]
    public async Task SyncAsync_WipesAndRecopiesContent_AndUpdatesForkSyncedAt()
    {
        await using var db = await TestDb.CreateAsync();
        var (ownerId, targetUserId, targetSubjectId, lessonId) = await SeedAsync(db);

        Guid forkId;
        DateTimeOffset firstSyncedAt;
        await using (var target = db.For(targetUserId))
        {
            var original = await LoadOriginalAsync(target, lessonId);
            var fork = await LessonForkService.ForkAsync(target, original, targetSubjectId, "Ann Owner");
            forkId = fork.Id;
            firstSyncedAt = fork.ForkSyncedAt!.Value;
        }

        await Task.Delay(10);

        // Change the original: edited note content and a second card, bumping ContentUpdatedAt.
        await using (var owner = db.For(ownerId))
        {
            var note = await owner.Notes.FirstAsync(n => n.LessonId == lessonId);
            note.Content = "updated content";

            var deck = await owner.Decks.FirstAsync(d => d.LessonId == lessonId);
            owner.Flashcards.Add(new Flashcard { LessonId = lessonId, DeckId = deck.Id, Question = "Q2", Answer = "A2", Difficulty = Difficulty.Easy });

            await owner.SaveChangesAsync();
        }

        await using (var target = db.For(targetUserId))
        {
            var fork = await target.Lessons
                .Include(l => l.Notes)
                .Include(l => l.Decks).ThenInclude(d => d.Flashcards)
                .AsSplitQuery()
                .FirstAsync(l => l.Id == forkId);

            var original = await LoadOriginalAsync(target, lessonId);

            await LessonForkService.SyncAsync(target, fork, original);

            Assert.Equal(forkId, fork.Id);
            Assert.True(fork.ForkSyncedAt > firstSyncedAt);
        }

        await using var verify = db.For(targetUserId);
        var synced = await verify.Lessons
            .Include(l => l.Notes)
            .Include(l => l.Decks).ThenInclude(d => d.Flashcards)
            .AsSplitQuery()
            .FirstAsync(l => l.Id == forkId);

        Assert.Single(synced.Notes);
        Assert.Equal("updated content", synced.Notes[0].Content);
        Assert.Single(synced.Decks);
        Assert.Equal(2, synced.Decks[0].Flashcards.Count);
    }
}
