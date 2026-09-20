using BackendApi.Domain;

namespace BackendApi.Services.Flashcards;

/// <summary>
/// Builds the user prompt for LLM flashcard generation. Kept separate from
/// <see cref="AiFlashcardGenerationService"/> so the orchestration (rounds,
/// dedup, fallback) and the prompt wording can change independently.
/// </summary>
internal static class FlashcardPrompt
{
    private const int MaxSourceChars = 12000;

    public static string Build(
        string sourceText, int count, Difficulty difficulty, IReadOnlyCollection<string> avoidQuestions)
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
            : "Nie twórz pytań powtarzających się lub podobnych do poniższych (utwórz zupełnie NOWE):\n" +
              string.Join("\n", avoidQuestions.Select(q => $"- {q}")) + "\n";

        return
            $"Na podstawie poniższych notatek/materiałów z zajęć utwórz dokładnie {count} fiszek\n" +
            $"(pytanie i odpowiedź) na poziomie trudności {difficultyLabel}.\n" +
            "Odpowiedz WYŁĄCZNIE poprawnym JSON-em: obiektem z polem \"flashcards\" " +
            "będącym tablicą obiektów, np. " +
            "{\"flashcards\": [{\"question\": \"...\", \"answer\": \"...\"}]}.\n" +
            avoidClause +
            "Materiał źródłowy:\n---\n" +
            $"{Truncate(sourceText, MaxSourceChars)}\n---";
    }

    private static string Truncate(string text, int maxLength) =>
        text.Length <= maxLength ? text : text[..maxLength];
}
