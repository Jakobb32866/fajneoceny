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

    public async Task<List<GeneratedFlashcard>> GenerateAsync(
        string sourceText, int count, Difficulty difficulty, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_options.BaseUrl))
        {
            return await fallback.GenerateAsync(sourceText, count, difficulty, ct);
        }

        try
        {
            return await CallAiAsync(sourceText, count, difficulty, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AI flashcard generation failed, falling back to heuristic generator");
            return await fallback.GenerateAsync(sourceText, count, difficulty, ct);
        }
    }

    private async Task<List<GeneratedFlashcard>> CallAiAsync(
        string sourceText, int count, Difficulty difficulty, CancellationToken ct)
    {
        var difficultyLabel = difficulty switch
        {
            Difficulty.Easy => "łatwym (podstawowe fakty i definicje)",
            Difficulty.Medium => "średnim (zastosowanie i porównania pojęć)",
            Difficulty.Hard => "trudnym (analiza, wnioskowanie, wyjątki od reguł)",
            _ => "średnim",
        };

        var prompt =
            $"Na podstawie poniższych notatek/materiałów z zajęć utwórz dokładnie {count} fiszek\n" +
            $"(pytanie i odpowiedź) na poziomie trudności {difficultyLabel}.\n" +
            "Odpowiedz WYŁĄCZNIE poprawnym JSON-em: obiektem z polem \"flashcards\" " +
            "będącym tablicą obiektów, np. " +
            "{\"flashcards\": [{\"question\": \"...\", \"answer\": \"...\"}]}.\n" +
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
