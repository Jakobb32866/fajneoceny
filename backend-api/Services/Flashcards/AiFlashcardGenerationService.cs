using BackendApi.Domain;
using BackendApi.Services.Ai;

namespace BackendApi.Services.Flashcards;

/// <summary>
/// Generates flashcards via an <see cref="IChatCompletionClient"/>. Falls back
/// to the injected heuristic generator when no LLM is configured (see
/// <see cref="AiOptions"/> via <see cref="IChatCompletionClient"/>) or when the
/// call fails, so quiz creation never hard-fails for the student.
/// </summary>
public class AiFlashcardGenerationService(
    IChatCompletionClient chatClient,
    IFlashcardGenerationService fallback,
    ILogger<AiFlashcardGenerationService> logger) : IFlashcardGenerationService
{
    // Local models (e.g. qwen/Bielik on Ollama) don't reliably honour the exact
    // count — they often return a few too few. So we generate, then re-request
    // only the shortfall, deduping by question, up to this many rounds.
    private const int MaxGenerationRounds = 3;

    public async Task<List<GeneratedFlashcard>> GenerateAsync(
        string sourceText, int count, Difficulty difficulty, CancellationToken ct = default)
    {
        if (!chatClient.IsConfigured)
        {
            return await fallback.GenerateAsync(sourceText, count, difficulty, ct);
        }

        var collected = new List<GeneratedFlashcard>();
        var seenQuestions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        for (var round = 0; round < MaxGenerationRounds && collected.Count < count; round++)
        {
            var remaining = count - collected.Count;
            List<GeneratedFlashcard> batch;
            try
            {
                // On top-up rounds, tell the model which questions it already
                // produced so it generates new ones instead of near-duplicates.
                var avoid = collected.Select(c => c.Question).ToList();
                batch = await CallAiAsync(sourceText, remaining, difficulty, avoid, ct);
            }
            catch (Exception ex)
            {
                // First round failed outright: no AI cards at all → heuristic.
                // A later round failing just ends the top-up; keep what we have.
                logger.LogWarning(ex, "AI flashcard generation round {Round} failed", round + 1);
                if (collected.Count == 0)
                    return await fallback.GenerateAsync(sourceText, count, difficulty, ct);
                break;
            }

            AddUnique(collected, seenQuestions, batch, count);
        }

        // The model under-delivered across all rounds; top up with heuristic
        // cards so the student still gets the number they asked for.
        if (collected.Count < count)
        {
            try
            {
                var filler = await fallback.GenerateAsync(sourceText, count - collected.Count, difficulty, ct);
                AddUnique(collected, seenQuestions, filler, count);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Heuristic top-up failed; returning {Count} AI cards", collected.Count);
            }
        }

        return collected;
    }

    /// <summary>Appends cards with a not-yet-seen question until <paramref name="max"/> is reached.</summary>
    private static void AddUnique(
        List<GeneratedFlashcard> collected, HashSet<string> seen, IEnumerable<GeneratedFlashcard> incoming, int max)
    {
        foreach (var card in incoming)
        {
            if (collected.Count >= max) break;
            if (string.IsNullOrWhiteSpace(card.Question)) continue;
            if (seen.Add(card.Question.Trim())) collected.Add(card);
        }
    }

    private async Task<List<GeneratedFlashcard>> CallAiAsync(
        string sourceText, int count, Difficulty difficulty, IReadOnlyCollection<string> avoidQuestions, CancellationToken ct)
    {
        var json = await chatClient.CompleteAsync(
            new ChatCompletionRequest(
                SystemPrompt: "Jesteś asystentem tworzącym fiszki edukacyjne. Odpowiadasz TYLKO czystym JSON-em.",
                UserPrompt: FlashcardPrompt.Build(sourceText, count, difficulty, avoidQuestions),
                Temperature: 0.7),
            ct);

        var wrapper = System.Text.Json.JsonSerializer.Deserialize<FlashcardsWrapper>(json, new System.Text.Json.JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
        });
        var cards = wrapper?.Flashcards ?? [];

        return cards.Count == 0
            ? throw new InvalidOperationException("AI returned zero flashcards")
            : cards;
    }

    private class FlashcardsWrapper
    {
        [System.Text.Json.Serialization.JsonPropertyName("flashcards")]
        public List<GeneratedFlashcard>? Flashcards { get; set; }
    }
}
