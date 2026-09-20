namespace BackendApi.Domain;

/// <summary>
/// Per-user spaced-repetition tuning, mirroring Anki's deck options. Persisted
/// server-side so the values follow the user across every device they sign in
/// on. One row per user, created lazily with defaults on first read.
///
/// Step lists are stored as comma-separated minute counts (e.g. "1,10") to keep
/// the schema flat; <see cref="ParseSteps"/> turns them into an int array.
/// </summary>
public class UserSrsSettings : IOwnedByUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }

    // Session / new-card budget.
    public int DailySessionSize { get; set; } = 30;
    public int NewCardsPerDay { get; set; } = 20;

    // Learning.
    public string LearningStepsMinutes { get; set; } = "1,10";
    public string RelearningStepsMinutes { get; set; } = "10";
    public int GraduatingIntervalDays { get; set; } = 1;
    public int EasyIntervalDays { get; set; } = 4;

    // Review.
    public double StartingEase { get; set; } = 2.5;
    public double EasyBonus { get; set; } = 1.3;
    public double HardMultiplier { get; set; } = 1.2;
    public double LapseNewIntervalMultiplier { get; set; } = 0.5;
    public int MinimumIntervalDays { get; set; } = 1;
    public int MaximumIntervalDays { get; set; } = 365;

    // Day boundary.
    public string Timezone { get; set; } = "Europe/Warsaw";
    public int DayRolloverHour { get; set; } = 4;

    public static int[] ParseSteps(string csv) =>
        csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => int.TryParse(s, out var n) ? n : 0)
            .Where(n => n > 0)
            .ToArray();
}
