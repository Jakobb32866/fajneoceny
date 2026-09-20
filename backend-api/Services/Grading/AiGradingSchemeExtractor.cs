using System.Text.Json;
using System.Text.Json.Serialization;
using BackendApi.Domain;
using BackendApi.Services.Ai;

namespace BackendApi.Services.Grading;

/// <summary>
/// Extracts a grading scheme from syllabus text via an
/// <see cref="IChatCompletionClient"/>. Falls back to the injected heuristic
/// extractor when no LLM is configured or the call fails/returns nothing, so
/// syllabus parsing never hard-fails.
/// </summary>
public class AiGradingSchemeExtractor(
    IChatCompletionClient chatClient,
    IGradingSchemeExtractor fallback,
    ILogger<AiGradingSchemeExtractor> logger) : IGradingSchemeExtractor
{
    public async Task<List<DraftGradingComponent>> ExtractAsync(string rawText, CancellationToken ct = default)
    {
        if (!chatClient.IsConfigured || string.IsNullOrWhiteSpace(rawText))
        {
            return await fallback.ExtractAsync(rawText, ct);
        }

        try
        {
            var components = await CallAiAsync(rawText, ct);
            // If the model found nothing usable, the regex heuristic might still
            // catch simple "Nazwa – 20%" lines, so try it before giving up.
            return components.Count > 0 ? components : await fallback.ExtractAsync(rawText, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "AI grading-scheme extraction failed, falling back to heuristic extractor");
            return await fallback.ExtractAsync(rawText, ct);
        }
    }

    private async Task<List<DraftGradingComponent>> CallAiAsync(string rawText, CancellationToken ct)
    {
        var prompt =
            "Przeanalizuj poniższe zasady zaliczenia przedmiotu i wypisz wszystkie składniki oceny " +
            "wraz z ich wagą procentową.\n" +
            "Odpowiedz WYŁĄCZNIE poprawnym JSON-em: obiektem z polem \"components\" będącym tablicą " +
            "obiektów postaci {\"name\": \"...\", \"weightPercent\": <liczba 0-100>, \"category\": \"Exam\"}.\n" +
            "Dozwolone kategorie: \"Exam\" (egzamin, kolokwium, test, sprawdzian), \"Project\" (projekt), " +
            "\"Homework\" (praca domowa, zadania, ćwiczenia), \"Other\" (pozostałe).\n" +
            "Podaj wagi jako liczby (bez znaku %). Nie dodawaj komentarzy ani wyjaśnień.\n" +
            "Zasady zaliczenia:\n---\n" +
            $"{Truncate(rawText, 8000)}\n---";

        var json = await chatClient.CompleteAsync(
            new ChatCompletionRequest(
                SystemPrompt: "Jesteś asystentem analizującym sylabusy uczelniane. Odpowiadasz tylko czystym JSON-em.",
                UserPrompt: prompt,
                // Low temperature: this is an extraction task, we want faithfulness.
                Temperature: 0.1),
            ct);

        var wrapper = JsonSerializer.Deserialize<ComponentsWrapper>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
        });

        var results = new List<DraftGradingComponent>();
        foreach (var c in wrapper?.Components ?? [])
        {
            var name = c.Name?.Trim();
            if (string.IsNullOrWhiteSpace(name)) continue;
            if (c.WeightPercent is <= 0 or > 100) continue;

            // Trust the model's category if it's one of the enum values,
            // otherwise derive it from the name with the keyword heuristic.
            var category = Enum.TryParse<GradeCategory>(c.Category, ignoreCase: true, out var parsed)
                ? parsed
                : GradingSchemeExtractor.GuessCategory(name);

            results.Add(new DraftGradingComponent(name, c.WeightPercent, category));
        }

        return results;
    }

    private static string Truncate(string text, int maxLength) => text.Length <= maxLength ? text : text[..maxLength];

    private class ComponentsWrapper
    {
        [JsonPropertyName("components")]
        public List<AiComponent>? Components { get; set; }
    }

    private class AiComponent
    {
        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("weightPercent")]
        public double WeightPercent { get; set; }

        [JsonPropertyName("category")]
        public string? Category { get; set; }
    }
}
