namespace BackendApi.Services.Grading;

/// <summary>
/// Extracts weighted grading components from raw syllabus text. Implementations
/// range from offline regex heuristics to an LLM parse; both return the same
/// draft list, which the student then reviews/edits in the grade sheet.
/// </summary>
public interface IGradingSchemeExtractor
{
    Task<List<DraftGradingComponent>> ExtractAsync(string rawText, CancellationToken ct = default);
}

/// <summary>Offline regex-based extraction (see <see cref="GradingSchemeExtractor"/>).</summary>
public class HeuristicGradingSchemeExtractor : IGradingSchemeExtractor
{
    public Task<List<DraftGradingComponent>> ExtractAsync(string rawText, CancellationToken ct = default) =>
        Task.FromResult(GradingSchemeExtractor.Extract(rawText));
}
