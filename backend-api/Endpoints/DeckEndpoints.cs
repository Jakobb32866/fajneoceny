using BackendApi.Data;
using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Endpoints;

public record DeckDto(Guid Id, string Name, bool IsAiGenerated, Difficulty? Difficulty, List<FlashcardDto> Flashcards);
public record CreateDeckRequest(string? Name);
public record RenameDeckRequest(string Name);
public record CreateCardRequest(string Question, string Answer, Difficulty? Difficulty);
public record UpdateCardRequest(string Question, string Answer, Difficulty? Difficulty);

public static class DeckEndpoints
{
    public static DeckDto ToDto(this Deck deck) => new(
        deck.Id,
        deck.Name,
        deck.IsAiGenerated,
        deck.Difficulty,
        deck.Flashcards
            .OrderBy(f => f.CreatedAt)
            .Select(f => new FlashcardDto(f.Id, f.Question, f.Answer, f.Difficulty))
            .ToList());

    /// <summary>Default name for the next deck in a lesson: "Talia 1", "Talia 2"…</summary>
    public static async Task<string> NextDeckNameAsync(AppDbContext db, Guid lessonId)
    {
        var count = await db.Decks.CountAsync(d => d.LessonId == lessonId);
        return $"Talia {count + 1}";
    }

    public static void MapDeckEndpoints(this IEndpointRouteBuilder app)
    {
        // Create an empty deck ("from scratch", no AI).
        app.MapPost("/api/lessons/{lessonId:guid}/decks", async (Guid lessonId, CreateDeckRequest request, AppDbContext db) =>
        {
            var lesson = await db.Lessons.FirstOrDefaultAsync(e => e.Id == lessonId);
            if (lesson is null) return Results.NotFound();

            var name = string.IsNullOrWhiteSpace(request.Name)
                ? await NextDeckNameAsync(db, lessonId)
                : request.Name.Trim();

            var deck = new Deck { LessonId = lessonId, Name = name, IsAiGenerated = false };
            db.Decks.Add(deck);
            await db.SaveChangesAsync();
            return Results.Created($"/api/decks/{deck.Id}", deck.ToDto());
        }).WithTags("Decks").RequireAuthorization();

        app.MapPut("/api/decks/{deckId:guid}", async (Guid deckId, RenameDeckRequest request, AppDbContext db) =>
        {
            var deck = await db.Decks.FirstOrDefaultAsync(e => e.Id == deckId);
            if (deck is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(request.Name)) return Results.BadRequest("Name must not be empty.");

            deck.Name = request.Name.Trim();
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).WithTags("Decks").RequireAuthorization();

        app.MapDelete("/api/decks/{deckId:guid}", async (Guid deckId, AppDbContext db) =>
        {
            var deck = await db.Decks.FirstOrDefaultAsync(e => e.Id == deckId);
            if (deck is null) return Results.NotFound();
            db.Decks.Remove(deck);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).WithTags("Decks").RequireAuthorization();

        // Add a card to a deck.
        app.MapPost("/api/decks/{deckId:guid}/cards", async (Guid deckId, CreateCardRequest request, AppDbContext db) =>
        {
            var deck = await db.Decks.FirstOrDefaultAsync(e => e.Id == deckId);
            if (deck is null) return Results.NotFound();

            var card = new Flashcard
            {
                DeckId = deckId,
                LessonId = deck.LessonId,
                Question = request.Question,
                Answer = request.Answer,
                Difficulty = request.Difficulty ?? deck.Difficulty ?? Difficulty.Medium,
            };
            db.Flashcards.Add(card);
            await db.SaveChangesAsync();
            return Results.Created($"/api/flashcards/{card.Id}", new FlashcardDto(card.Id, card.Question, card.Answer, card.Difficulty));
        }).WithTags("Decks").RequireAuthorization();

        app.MapPut("/api/flashcards/{id:guid}", async (Guid id, UpdateCardRequest request, AppDbContext db) =>
        {
            var card = await db.Flashcards.FirstOrDefaultAsync(e => e.Id == id);
            if (card is null) return Results.NotFound();

            card.Question = request.Question;
            card.Answer = request.Answer;
            if (request.Difficulty is not null) card.Difficulty = request.Difficulty.Value;
            await db.SaveChangesAsync();
            return Results.Ok(new FlashcardDto(card.Id, card.Question, card.Answer, card.Difficulty));
        }).WithTags("Decks").RequireAuthorization();

        app.MapDelete("/api/flashcards/{id:guid}", async (Guid id, AppDbContext db) =>
        {
            var card = await db.Flashcards.FirstOrDefaultAsync(e => e.Id == id);
            if (card is null) return Results.NotFound();
            db.Flashcards.Remove(card);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).WithTags("Decks").RequireAuthorization();
    }
}
