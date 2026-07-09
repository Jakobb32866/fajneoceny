using System.Text.RegularExpressions;
using BackendApi.Domain;

namespace BackendApi.Services.Grading;

public record DraftGradingComponent(string Name, double WeightPercent, GradeCategory Category);

/// <summary>
/// Best-effort heuristic extraction of weighted grading components (e.g.
/// "Kolokwium 1 - 20%") from raw syllabus text. This is intentionally
/// simple regex matching rather than full NLP/LLM parsing — the frontend
/// shows the results in an editable table so the student can correct
/// anything the heuristic gets wrong.
/// </summary>
public static class GradingSchemeExtractor
{
    private static readonly Regex WeightedLine = new(
        @"(?<name>[\p{L}0-9 ,./\-]{3,80}?)[\s:\-–—]{1,4}\(?\s*(?<weight>\d{1,3}(?:[.,]\d+)?)\s*%\)?",
        RegexOptions.Compiled | RegexOptions.Multiline);

    public static List<DraftGradingComponent> Extract(string rawText)
    {
        var results = new List<DraftGradingComponent>();

        foreach (Match match in WeightedLine.Matches(rawText))
        {
            var name = match.Groups["name"].Value.Trim(' ', '-', '–', '—', ':', '\t');
            if (name.Length < 3) continue;

            var weightText = match.Groups["weight"].Value.Replace(',', '.');
            if (!double.TryParse(weightText, System.Globalization.CultureInfo.InvariantCulture, out var weight))
                continue;
            if (weight is <= 0 or > 100) continue;

            results.Add(new DraftGradingComponent(name, weight, GuessCategory(name)));
        }

        return results;
    }

    private static GradeCategory GuessCategory(string name)
    {
        var lower = name.ToLowerInvariant();
        if (lower.Contains("projekt") || lower.Contains("project"))
            return GradeCategory.Project;
        if (lower.Contains("kolokwium") || lower.Contains("egzamin") || lower.Contains("test")
            || lower.Contains("sprawdzian") || lower.Contains("exam"))
            return GradeCategory.Exam;
        if (lower.Contains("zadani") || lower.Contains("praca domowa") || lower.Contains("homework")
            || lower.Contains("ćwiczen"))
            return GradeCategory.Homework;
        return GradeCategory.Other;
    }
}
