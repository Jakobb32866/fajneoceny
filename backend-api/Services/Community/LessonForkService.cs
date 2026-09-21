using BackendApi.Data;
using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Services.Community;

/// <summary>
/// Copies a shared lesson's content (title, newest note, decks and cards)
/// into a new lesson owned by the forking user, and re-syncs that copy later
/// if the original changes. Deliberately never copies SpacedRepetitionState
/// or QuizSession rows — those are per-user study progress, not content.
/// </summary>
public static class LessonForkService
{
    /// <summary>
    /// Creates a new lesson under <paramref name="targetSubjectId"/> that
    /// copies <paramref name="original"/>'s content. <paramref name="original"/>
    /// must already have its Notes, Decks and Decks.Flashcards loaded (query
    /// filters ignored, since it belongs to another user) — callers get this
    /// from CommunityQueries.VisibleLessonById with the right Includes.
    /// </summary>
    public static async Task<Lesson> ForkAsync(AppDbContext db, Lesson original, Guid targetSubjectId, string authorName)
    {
        var maxOrder = await db.Lessons
            .Where(l => l.SubjectId == targetSubjectId)
            .Select(l => (int?)l.Order)
            .MaxAsync() ?? -1;

        var fork = new Lesson
        {
            SubjectId = targetSubjectId,
            Title = original.Title,
            Order = maxOrder + 1,
            ForkedFromLessonId = original.Id,
            ForkedFromAuthorName = authorName,
            ForkSyncedAt = original.ContentUpdatedAt,
        };

        CopyContent(fork, original);

        db.Lessons.Add(fork);
        await db.SaveChangesAsync();
        return fork;
    }

    /// <summary>
    /// Wipes the fork's current Notes/Decks/Flashcards and re-copies them
    /// from the (possibly changed) original, updating ForkSyncedAt. Keeps the
    /// fork's own Id/Title/Order. <paramref name="fork"/> must be tracked and
    /// loaded with Notes/Decks/Flashcards; <paramref name="original"/> as for
    /// ForkAsync.
    /// </summary>
    public static async Task SyncAsync(AppDbContext db, Lesson fork, Lesson original)
    {
        db.Flashcards.RemoveRange(fork.Decks.SelectMany(d => d.Flashcards));
        db.Decks.RemoveRange(fork.Decks);
        db.Notes.RemoveRange(fork.Notes);
        fork.Decks.Clear();
        fork.Notes.Clear();

        CopyContent(fork, original);
        fork.ForkSyncedAt = original.ContentUpdatedAt;

        // The fork is already tracked, so entities that merely appear in its
        // navigations during DetectChanges would be picked up as Modified
        // (their Guid keys are pre-set) and fail with 0 rows updated. Add
        // them explicitly; AddRange marks the reachable Flashcards Added too.
        db.Notes.AddRange(fork.Notes);
        db.Decks.AddRange(fork.Decks);

        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Builds new Note/Deck/Flashcard entities under <paramref name="fork"/>
    /// from <paramref name="original"/>'s content and attaches them via
    /// navigation properties, so SaveChanges picks up the whole graph as
    /// Added without any explicit db.Xxx.Add calls. Every copy gets a fresh
    /// Guid (the domain types' own Id initializers) and both DeckId/LessonId
    /// are stamped on each card. UserId is left unset so AppDbContext's
    /// ownership stamp fills it in with the caller (the forking user) at
    /// SaveChanges time.
    /// </summary>
    private static void CopyContent(Lesson fork, Lesson original)
    {
        var newestNote = original.Notes.OrderByDescending(n => n.UpdatedAt).FirstOrDefault();
        if (newestNote is not null)
        {
            fork.Notes.Add(new Note { LessonId = fork.Id, Content = newestNote.Content });
        }

        foreach (var deck in original.Decks)
        {
            var newDeck = new Deck
            {
                LessonId = fork.Id,
                Name = deck.Name,
                IsAiGenerated = deck.IsAiGenerated,
                Difficulty = deck.Difficulty,
            };

            foreach (var card in deck.Flashcards)
            {
                newDeck.Flashcards.Add(new Flashcard
                {
                    DeckId = newDeck.Id,
                    LessonId = fork.Id,
                    Question = card.Question,
                    Answer = card.Answer,
                    Difficulty = card.Difficulty,
                });
            }

            fork.Decks.Add(newDeck);
        }
    }
}
