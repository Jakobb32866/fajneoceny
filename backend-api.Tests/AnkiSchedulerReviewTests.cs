using BackendApi.Domain;
using BackendApi.Services.Flashcards;

namespace BackendApi.Tests;

public class AnkiSchedulerReviewTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 14, 9, 0, 0, TimeSpan.Zero);
    private static readonly SchedulerSettings Settings = SchedulerSettings.Defaults;

    private static SpacedRepetitionState ReviewCard(int intervalDays, double ease, DateTimeOffset lastReviewedAt, DateTimeOffset due) => new()
    {
        Phase = CardPhase.Review,
        LearningStepIndex = 0,
        EaseFactor = ease,
        IntervalDays = intervalDays,
        Repetitions = 0,
        Lapses = 0,
        Due = due,
        LastReviewedAt = lastReviewedAt,
    };

    // Fuzz (see AnkiScheduler.Fuzz) is +/- round(days * 0.05) for days >= 3.
    private static int FuzzSpan(int days) => Math.Max(1, (int)Math.Round(days * 0.05));

    [Fact]
    public void Review_Good_MultipliesIntervalByEase()
    {
        var scheduler = new AnkiScheduler();
        var state = ReviewCard(intervalDays: 10, ease: 2.5, lastReviewedAt: Now.AddDays(-10), due: Now);

        scheduler.ApplyReview(state, ReviewGrade.Good, Settings, Now);

        // raw = 10 * 2.5 = 25, fuzz span = round(25*0.05) = 1 -> [24,26]
        var expected = 25;
        var span = FuzzSpan(expected);
        Assert.InRange(state.IntervalDays, expected - span, expected + span);
        Assert.Equal(2.5, state.EaseFactor); // Good does not change ease
        Assert.Equal(1, state.Repetitions);
        Assert.Equal(CardPhase.Review, state.Phase);
    }

    [Fact]
    public void Review_Hard_ReducesEaseAndGrowsSlowerThanGood()
    {
        var scheduler = new AnkiScheduler();
        var hardState = ReviewCard(intervalDays: 10, ease: 2.5, lastReviewedAt: Now.AddDays(-10), due: Now);
        var goodState = ReviewCard(intervalDays: 10, ease: 2.5, lastReviewedAt: Now.AddDays(-10), due: Now);

        scheduler.ApplyReview(hardState, ReviewGrade.Hard, Settings, Now);
        scheduler.ApplyReview(goodState, ReviewGrade.Good, Settings, Now);

        Assert.Equal(2.35, hardState.EaseFactor, precision: 6);

        // raw = 10 * 1.2 = 12, fuzz span = round(12*0.05) = 1 -> [11,13]
        var expected = 12;
        var span = FuzzSpan(expected);
        Assert.InRange(hardState.IntervalDays, expected - span, expected + span);

        Assert.True(hardState.IntervalDays < goodState.IntervalDays,
            $"expected Hard interval ({hardState.IntervalDays}) < Good interval ({goodState.IntervalDays})");
    }

    [Fact]
    public void Review_Easy_RaisesEaseAndGrowsFaster()
    {
        var scheduler = new AnkiScheduler();
        var state = ReviewCard(intervalDays: 10, ease: 2.5, lastReviewedAt: Now.AddDays(-10), due: Now);

        scheduler.ApplyReview(state, ReviewGrade.Easy, Settings, Now);

        Assert.Equal(2.65, state.EaseFactor, precision: 6);

        // raw = 10 * 2.5 * 1.3 = 32.5 -> Math.Round (banker's) -> 32,
        // fuzz span = round(32*0.05=1.6) -> 2 -> [30,34]. Keep the window a
        // touch wider to be robust to the exact rounding rule.
        Assert.InRange(state.IntervalDays, 29, 35);
    }

    [Fact]
    public void Review_EaseNeverDropsBelowFloor()
    {
        var scheduler = new AnkiScheduler();
        var state = ReviewCard(intervalDays: 10, ease: 2.5, lastReviewedAt: Now.AddDays(-10), due: Now);

        for (var i = 0; i < 30; i++)
        {
            // Force back onto the Review phase each iteration so both Again and
            // Hard exercise ApplyReviewPhase's ease-penalty path repeatedly,
            // independent of the phase transition Again would otherwise cause.
            state.Phase = CardPhase.Review;
            var grade = i % 2 == 0 ? ReviewGrade.Hard : ReviewGrade.Again;

            scheduler.ApplyReview(state, grade, Settings, Now);

            Assert.True(state.EaseFactor >= SchedulerSettings.MinimumEase,
                $"iteration {i}: ease {state.EaseFactor} fell below floor {SchedulerSettings.MinimumEase}");
        }

        Assert.Equal(SchedulerSettings.MinimumEase, state.EaseFactor, precision: 6);
    }

    [Fact]
    public void Review_IntervalClampsAtMaximum()
    {
        var scheduler = new AnkiScheduler();
        var state = ReviewCard(intervalDays: 300, ease: 2.5, lastReviewedAt: Now.AddDays(-300), due: Now);

        scheduler.ApplyReview(state, ReviewGrade.Good, Settings, Now);

        // raw = 300 * 2.5 = 750, even with max fuzz this stays far above the 365 cap.
        Assert.Equal(Settings.MaximumIntervalDays, state.IntervalDays);
        Assert.Equal(365, state.IntervalDays);
    }

    [Fact]
    public void Review_EarlyReview_ScalesFromElapsedNotScheduled()
    {
        var scheduler = new AnkiScheduler();

        // Reviewed 2 days into a 10-day schedule (due in 8 more days).
        var earlyState = ReviewCard(intervalDays: 10, ease: 2.5, lastReviewedAt: Now.AddDays(-2), due: Now.AddDays(8));
        // Control: reviewed exactly on schedule (elapsed == scheduled).
        var controlState = ReviewCard(intervalDays: 10, ease: 2.5, lastReviewedAt: Now.AddDays(-10), due: Now);

        scheduler.ApplyReview(earlyState, ReviewGrade.Good, Settings, Now);
        scheduler.ApplyReview(controlState, ReviewGrade.Good, Settings, Now);

        // Naive full-credit growth would be 10 * 2.5 = 25 for both; the early
        // card must grow substantially less than that.
        Assert.True(earlyState.IntervalDays < controlState.IntervalDays,
            $"expected early-reviewed interval ({earlyState.IntervalDays}) < control interval ({controlState.IntervalDays})");
        Assert.True(earlyState.IntervalDays < 15,
            $"expected early-reviewed interval well below 10*2.5=25, got {earlyState.IntervalDays}");

        var controlExpected = 25;
        var controlSpan = FuzzSpan(controlExpected);
        Assert.InRange(controlState.IntervalDays, controlExpected - controlSpan, controlExpected + controlSpan);
    }
}
