namespace BackendApi.Services.Admin;

/// <summary>
/// Day boundaries for the admin stats.
///
/// "Today" means today in Poland, not in UTC: a note shared at 00:30 CEST
/// belongs to that day, not the previous one. Timestamps are stored in UTC —
/// only the window boundaries are computed in local time and converted back.
/// </summary>
public static class StatsClock
{
    private static readonly TimeZoneInfo Warsaw = ResolveWarsaw();

    /// <summary>Start of the current local day, as a UTC instant.</summary>
    public static DateTimeOffset StartOfToday(DateTimeOffset now)
    {
        var local = TimeZoneInfo.ConvertTime(now, Warsaw);
        var midnight = new DateTimeOffset(local.Year, local.Month, local.Day, 0, 0, 0, local.Offset);
        return midnight.ToUniversalTime();
    }

    /// <summary>Start of the local day <paramref name="days"/> ago, as a UTC instant.</summary>
    public static DateTimeOffset StartOfDaysAgo(DateTimeOffset now, int days) =>
        StartOfToday(now).AddDays(-days);

    private static TimeZoneInfo ResolveWarsaw()
    {
        // Linux/macOS use the IANA id; Windows uses its own. Fall back to UTC
        // rather than throwing at startup on an unexpected host.
        foreach (var id in new[] { "Europe/Warsaw", "Central European Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException) { }
            catch (InvalidTimeZoneException) { }
        }

        return TimeZoneInfo.Utc;
    }
}
