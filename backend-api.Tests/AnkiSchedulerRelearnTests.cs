using BackendApi.Domain;
using BackendApi.Services.Flashcards;

namespace BackendApi.Tests;

public class AnkiSchedulerRelearnTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 14, 9, 0, 0, TimeSpan.Zero);
    private static readonly SchedulerSettings Settings = SchedulerSettings.Defaults;

    [Fact]
    public void ReviewCard_Again_LapsesIntoRelearning_ThenGoodGraduatesBack()
    {
        var scheduler = new AnkiScheduler();
        var state = new SpacedRepetitionState
        {
            Phase = CardPhase.Review,
            LearningStepIndex = 0,
            EaseFactor = 2.5,
            IntervalDays = 20,
            Repetitions = 3,
            Lapses = 0,
            Due = Now,
            LastReviewedAt = Now.AddDays(-20),
        };

        scheduler.ApplyReview(state, ReviewGrade.Again, Settings, Now);

        Assert.Equal(1, state.Lapses);
        Assert.Equal(2.30, state.EaseFactor, precision: 6);
        Assert.Equal(CardPhase.Relearning, state.Phase);
        Assert.Equal(0, state.LearningStepIndex);
        Assert.Equal(Now.AddMinutes(10), state.Due); // default RelearningStepsMinutes = "10"
        // max(1, round(20 * 0.5)) = 10
        Assert.Equal(10, state.IntervalDays);

        scheduler.ApplyReview(state, ReviewGrade.Good, Settings, Now);

        Assert.Equal(CardPhase.Review, state.Phase);
        Assert.Equal(10, state.IntervalDays);
        Assert.True(state.Due > Now.AddHours(12), $"expected a day-based due instant, got {state.Due}");
        Assert.Equal(StudyClock.DueForInterval(Now, 10, Settings), state.Due);
    }
}
