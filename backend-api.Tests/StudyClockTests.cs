using BackendApi.Services.Flashcards;

namespace BackendApi.Tests;

public class StudyClockTests
{
    private static readonly SchedulerSettings Settings = SchedulerSettings.Defaults; // Europe/Warsaw, rollover 4

    [Fact]
    public void StudyDate_BeforeRollover_ReturnsPreviousCalendarDay()
    {
        var tz = StudyClock.ResolveTimeZone(Settings);
        var offset = tz.GetUtcOffset(new DateTime(2026, 7, 14, 2, 0, 0, DateTimeKind.Unspecified));
        var twoAmLocal = new DateTimeOffset(2026, 7, 14, 2, 0, 0, offset);

        var studyDate = StudyClock.StudyDate(twoAmLocal, Settings);

        Assert.Equal(new DateOnly(2026, 7, 13), studyDate);
    }

    [Fact]
    public void StudyDate_AfterRollover_ReturnsSameCalendarDay()
    {
        var tz = StudyClock.ResolveTimeZone(Settings);
        var offset = tz.GetUtcOffset(new DateTime(2026, 7, 14, 5, 0, 0, DateTimeKind.Unspecified));
        var fiveAmLocal = new DateTimeOffset(2026, 7, 14, 5, 0, 0, offset);

        var studyDate = StudyClock.StudyDate(fiveAmLocal, Settings);

        Assert.Equal(new DateOnly(2026, 7, 14), studyDate);
    }
}
