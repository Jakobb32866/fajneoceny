using BackendApi.Domain;

namespace BackendApi.Services.Flashcards;

public enum ReviewGrade
{
    Again,
    Hard,
    Good,
    Easy,
}

/// <summary>
/// Immutable, parsed view of <see cref="UserSrsSettings"/> for the scheduler —
/// step lists are pre-parsed to int arrays so the hot path does no string work.
/// </summary>
public record SchedulerSettings(
    int[] LearningStepsMinutes,
    int[] RelearningStepsMinutes,
    int GraduatingIntervalDays,
    int EasyIntervalDays,
    double StartingEase,
    double EasyBonus,
    double HardMultiplier,
    double LapseNewIntervalMultiplier,
    int MinimumIntervalDays,
    int MaximumIntervalDays,
    int NewCardsPerDay,
    int DailySessionSize,
    string Timezone,
    int DayRolloverHour)
{
    public const double MinimumEase = 1.3;

    public static readonly SchedulerSettings Defaults = From(new UserSrsSettings());

    public static SchedulerSettings From(UserSrsSettings s) => new(
        LearningStepsMinutes: Fallback(UserSrsSettings.ParseSteps(s.LearningStepsMinutes), new[] { 1, 10 }),
        RelearningStepsMinutes: Fallback(UserSrsSettings.ParseSteps(s.RelearningStepsMinutes), new[] { 10 }),
        GraduatingIntervalDays: Math.Max(1, s.GraduatingIntervalDays),
        EasyIntervalDays: Math.Max(1, s.EasyIntervalDays),
        StartingEase: Math.Max(MinimumEase, s.StartingEase),
        EasyBonus: Math.Max(1.0, s.EasyBonus),
        HardMultiplier: Math.Max(1.0, s.HardMultiplier),
        LapseNewIntervalMultiplier: Math.Clamp(s.LapseNewIntervalMultiplier, 0.0, 1.0),
        MinimumIntervalDays: Math.Max(1, s.MinimumIntervalDays),
        MaximumIntervalDays: Math.Max(1, s.MaximumIntervalDays),
        NewCardsPerDay: Math.Max(0, s.NewCardsPerDay),
        DailySessionSize: Math.Max(1, s.DailySessionSize),
        Timezone: string.IsNullOrWhiteSpace(s.Timezone) ? "Europe/Warsaw" : s.Timezone,
        DayRolloverHour: Math.Clamp(s.DayRolloverHour, 0, 23));

    private static int[] Fallback(int[] parsed, int[] fallback) => parsed.Length > 0 ? parsed : fallback;
}

/// <summary>
/// Resolves the user's "study day" (with an Anki-style rollover a few hours
/// after midnight, so a late-night session still counts as the previous day)
/// and turns day-granular intervals into concrete due instants.
/// </summary>
public static class StudyClock
{
    public static TimeZoneInfo ResolveTimeZone(SchedulerSettings s)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(s.Timezone);
        }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return TimeZoneInfo.Utc;
        }
    }

    /// <summary>The user's current study date, accounting for the rollover hour.</summary>
    public static DateOnly StudyDate(DateTimeOffset now, SchedulerSettings s)
    {
        var tz = ResolveTimeZone(s);
        var local = TimeZoneInfo.ConvertTime(now, tz);
        // Shift back by the rollover so e.g. 02:00 with a 4h rollover reads as the previous day.
        return DateOnly.FromDateTime(local.AddHours(-s.DayRolloverHour).DateTime);
    }

    /// <summary>The instant a card scheduled <paramref name="intervalDays"/> out becomes due.</summary>
    public static DateTimeOffset DueForInterval(DateTimeOffset now, int intervalDays, SchedulerSettings s)
    {
        var tz = ResolveTimeZone(s);
        var dueDate = StudyDate(now, s).AddDays(intervalDays);
        var localDue = dueDate.ToDateTime(new TimeOnly(s.DayRolloverHour, 0));
        return new DateTimeOffset(localDue, tz.GetUtcOffset(localDue));
    }

    public static DateOnly LocalDate(DateTimeOffset instant, SchedulerSettings s) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, ResolveTimeZone(s)).DateTime);
}
