using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Data;

/// <summary>
/// One-time data fix: flashcards created before decks existed have no DeckId.
/// Wrap those orphans into a single "Zaimportowane fiszki" deck per lesson so
/// every card belongs to an editable deck. A no-op once all cards have decks.
/// </summary>
public static class DeckBackfill
{
    public static async Task RunAsync(AppDbContext db)
    {
        var orphanLessonIds = await db.Flashcards
            .Where(f => f.DeckId == null)
            .Select(f => f.LessonId)
            .Distinct()
            .ToListAsync();

        if (orphanLessonIds.Count == 0) return;

        foreach (var lessonId in orphanLessonIds)
        {
            var deck = new Deck
            {
                LessonId = lessonId,
                Name = "Zaimportowane fiszki",
                IsAiGenerated = true,
            };
            db.Decks.Add(deck);

            var cards = await db.Flashcards.Where(f => f.LessonId == lessonId && f.DeckId == null).ToListAsync();
            foreach (var card in cards) card.DeckId = deck.Id;
        }

        await db.SaveChangesAsync();
    }
}
