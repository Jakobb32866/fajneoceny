using System.Text.RegularExpressions;
using BackendApi.Domain;

namespace BackendApi.Services.Flashcards;

/// <summary>
/// Offline flashcard generator used when no AI endpoint is configured
/// (see <see cref="AiOptions"/>). Pulls "term – definition" style lines for
/// easy cards, and builds cloze-deletion questions (blank out a key word)
/// from longer sentences for medium/hard cards. Much lower quality than an
/// LLM, but keeps the feature usable fully offline.
/// </summary>
public class HeuristicFlashcardGenerationService : IFlashcardGenerationService
{
    private static readonly Regex DefinitionLine = new(
        @"^\s*(?<term>[\p{L}0-9 ]{2,60}?)\s*[:\-–—]\s*(?<def>.{10,300})$",
        RegexOptions.Compiled | RegexOptions.Multiline);

    public Task<List<GeneratedFlashcard>> GenerateAsync(
        string sourceText, int count, Difficulty difficulty, CancellationToken ct = default)
    {
        var cards = new List<GeneratedFlashcard>();

        var definitions = DefinitionLine.Matches(sourceText)
            .Select(m => new GeneratedFlashcard(
                $"Co oznacza: {m.Groups["term"].Value.Trim()}?",
                m.Groups["def"].Value.Trim()))
            .ToList();

        var sentences = Regex.Split(sourceText, @"(?<=[.!?])\s+")
            .Select(s => s.Trim())
            .Where(s => s.Length >= 20 && s.Split(' ').Length >= 6)
            .Distinct()
            .OrderByDescending(s => difficulty == Difficulty.Hard ? s.Length : -s.Length)
            .ToList();

        if (difficulty == Difficulty.Easy)
        {
            cards.AddRange(definitions);
        }
        else
        {
            cards.AddRange(BuildClozeCards(sentences, count));
            cards.AddRange(definitions);
        }

        if (cards.Count < count)
        {
            cards.AddRange(BuildClozeCards(sentences.Skip(cards.Count).ToList(), count - cards.Count));
        }

        return Task.FromResult(cards.Take(count).ToList());
    }

    private static IEnumerable<GeneratedFlashcard> BuildClozeCards(List<string> sentences, int count)
    {
        var rng = Random.Shared;
        foreach (var sentence in sentences.Take(count))
        {
            var words = sentence.Split(' ');
            var candidateIndices = Enumerable.Range(0, words.Length)
                .Where(i => words[i].Length > 4)
                .ToList();
            if (candidateIndices.Count == 0) continue;

            var blankIndex = candidateIndices[rng.Next(candidateIndices.Count)];
            var answer = words[blankIndex].Trim(',', '.', ';', ':');
            var question = string.Join(' ', words.Select((w, i) => i == blankIndex ? "____" : w));

            yield return new GeneratedFlashcard($"Uzupełnij lukę: {question}", answer);
        }
    }
}
