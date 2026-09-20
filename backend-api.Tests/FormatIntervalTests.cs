using BackendApi.Services.Flashcards;

namespace BackendApi.Tests;

public class FormatIntervalTests
{
    [Fact]
    public void SubMinute_FormatsAsLessThanOneMinute()
    {
        Assert.Equal("<1 min", AnkiScheduler.FormatInterval(TimeSpan.FromSeconds(30)));
    }

    [Fact]
    public void TenMinutes_FormatsAsMinutes()
    {
        Assert.Equal("10 min", AnkiScheduler.FormatInterval(TimeSpan.FromMinutes(10)));
    }

    [Fact]
    public void NinetyMinutes_FormatsAsHours()
    {
        // 90 min = 1.5h, rounds to 2 godz.
        Assert.Equal("2 godz.", AnkiScheduler.FormatInterval(TimeSpan.FromMinutes(90)));
    }

    [Fact]
    public void ThreeDays_FormatsAsDays()
    {
        Assert.Equal("3 dni", AnkiScheduler.FormatInterval(TimeSpan.FromDays(3)));
    }

    [Fact]
    public void FortyFiveDays_FormatsAsMonthsWithPolishDecimalComma()
    {
        // 45 / 30 = 1.5 months. The label is formatted with the current
        // culture's decimal separator (Polish-style comma in this app), not
        // forced to invariant/period.
        var label = AnkiScheduler.FormatInterval(TimeSpan.FromDays(45));

        Assert.Contains("mies.", label);
        Assert.True(label == "1,5 mies." || label == "1.5 mies.",
            $"expected a ~1.5 months label, got '{label}'");
    }

    [Fact]
    public void AboutFourHundredDays_FormatsAsYears()
    {
        var label = AnkiScheduler.FormatInterval(TimeSpan.FromDays(400));

        Assert.Contains("lata", label);
    }
}
