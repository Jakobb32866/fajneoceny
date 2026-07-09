using BackendApi.Domain;

namespace BackendApi.Services.Flashcards;

public record GeneratedFlashcard(string Question, string Answer);

public interface IFlashcardGenerationService
{
    Task<List<GeneratedFlashcard>> GenerateAsync(
        string sourceText,
        int count,
        Difficulty difficulty,
        CancellationToken ct = default);
}
