using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using BackendApi.Domain;
using Microsoft.Extensions.Options;

namespace BackendApi.Services.Flashcards;

/// <summary>
/// Generates flashcards by calling an OpenAI-compatible chat-completions
/// endpoint. Falls back to <see cref="HeuristicFlashcardGenerationService"/>
/// when no endpoint is configured (see <see cref="AiOptions"/>) or when the
/// call fails, so quiz creation never hard-fails for the student.
/// </summary>
public class AiFlashcardGenerationService(
    HttpClient httpClient,
    IOptions<AiOptions> options,
    HeuristicFlashcardGenerationService fallback,
    ILogger<AiFlashcardGenerationService> logger) : IFlashcardGenerationService
{
    private readonly AiOptions _options = options.Value;

    // Local models (e.g. qwen/Bielik on Ollama) don't reliably honour the exact
    // count — they often return a few too few. So we generate, then re-request
    // only the shortfall, deduping by question, up to this many rounds.
    private const int MaxGenerationRounds = 3;

    public async Task<List<GeneratedFlashcard>> GenerateAsync(
        string sourceText, int count, Difficulty difficulty, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_options.BaseUrl))
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
        var difficultyLabel = difficulty switch
        {
            Difficulty.Easy => "łatwym (podstawowe fakty i definicje)",
            Difficulty.Medium => "średnim (zastosowanie i porównania pojęć)",
            Difficulty.Hard => "trudnym (analiza, wnioskowanie, wyjątki od reguł)",
            _ => "średnim",
        };

        var avoidClause = avoidQuestions.Count == 0
            ? string.Empty
            : "Nie twórz pytań powtarzających lub podobnych do poniższych (utwórz zupełnie NOWE):\n" +
              string.Join("\n", avoidQuestions.Select(q => $"- {q}")) + "\n";

        var prompt =
            $"Na podstawie poniższych notatek/materiałów z zajęć utwórz dokładnie {count} fiszek\n" +
            $"(pytanie i odpowiedź) na poziomie trudności {difficultyLabel}.\n" +
            "Odpowiedz WYŁĄCZNIE poprawnym JSON-em: obiektem z polem \"flashcards\" " +
            "będącym tablicą obiektów, np. " +
            "{\"flashcards\": [{\"question\": \"...\", \"answer\": \"...\"}]}.\n" +
            avoidClause +
            "Materiał źródłowy:\n---\n" +
            $"{Truncate(sourceText, 12000)}\n---";

        var requestBody = new
        {
            model = _options.Model,
            messages = new object[]
            {
                new { role = "system", content = "Jesteś asystentem tworzącym fiszki edukacyjne dla studentów. Odpowiadasz tylko czystym JSON-em." },
                new { role = "user", content = prompt },
            },
            temperature = 0.7,
            // Constrain the model to emit syntactically valid JSON (supported by
            // OpenAI and Ollama). Forces a top-level object, which is why the
            // prompt asks for {"flashcards": [...]} rather than a bare array.
            response_format = new { type = "json_object" },
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{_options.BaseUrl.TrimEnd('/')}/chat/completions")
        {
            Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json"),
        };
        if (!string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _options.ApiKey);
        }

        using var response = await httpClient.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<ChatCompletionResponse>(cancellationToken: ct);
        var content = payload?.Choices?.FirstOrDefault()?.Message?.Content
            ?? throw new InvalidOperationException("Empty AI response");

        // response_format=json_object yields a top-level object. Slice to the
        // outermost {...} in case the model wraps it in prose or code fences.
        var jsonStart = content.IndexOf('{');
        var jsonEnd = content.LastIndexOf('}');
        if (jsonStart < 0 || jsonEnd < jsonStart)
            throw new InvalidOperationException("AI response did not contain a JSON object");

        var json = content[jsonStart..(jsonEnd + 1)];
        var wrapper = JsonSerializer.Deserialize<FlashcardsWrapper>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
        });
        var cards = wrapper?.Flashcards ?? [];

        return cards.Count == 0
            ? throw new InvalidOperationException("AI returned zero flashcards")
            : cards;
    }

    private static string Truncate(string text, int maxLength) =>
        text.Length <= maxLength ? text : text[..maxLength];

    private class FlashcardsWrapper
    {
        [JsonPropertyName("flashcards")]
        public List<GeneratedFlashcard>? Flashcards { get; set; }
    }

    private class ChatCompletionResponse
    {
        [JsonPropertyName("choices")]
        public List<Choice>? Choices { get; set; }

        public class Choice
        {
            [JsonPropertyName("message")]
            public Message? Message { get; set; }
        }

        public class Message
        {
            [JsonPropertyName("content")]
            public string? Content { get; set; }
        }
    }
}
