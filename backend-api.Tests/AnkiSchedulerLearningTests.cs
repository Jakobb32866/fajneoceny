using BackendApi.Domain;
using BackendApi.Services.Flashcards;

namespace BackendApi.Tests;

public class AnkiSchedulerLearningTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 14, 9, 0, 0, TimeSpan.Zero);
    private static readonly SchedulerSettings Settings = SchedulerSettings.Defaults;

    private static SpacedRepetitionState NewCard() => new()
    {
        Phase = CardPhase.New,
        LearningStepIndex = 0,
        EaseFactor = 2.5,
        IntervalDays = 0,
        Repetitions = 0,
        Lapses = 0,
        Due = Now,
        LastReviewedAt = null,
    };

    [Fact]
    public void NewCard_GoodTwice_Graduates()
    {
        var scheduler = new AnkiScheduler();
        var state = NewCard();

        scheduler.ApplyReview(state, ReviewGrade.Good, Settings, Now);

        Assert.Equal(CardPhase.Learning, state.Phase);
        Assert.Equal(1, state.LearningStepIndex);
        Assert.Equal(Now.AddMinutes(10), state.Due);

        scheduler.ApplyReview(state, ReviewGrade.Good, Settings, Now);

        Assert.Equal(CardPhase.Review, state.Phase);
        Assert.Equal(Settings.GraduatingIntervalDays, state.IntervalDays);
        Assert.Equal(1, state.IntervalDays);
        Assert.True(state.Due > Now.AddHours(12), $"expected a day-based due instant, got {state.Due}");
    }

    [Fact]
    public void Learning_AgainAfterGood_RestartsFirstStep()
    {
        var scheduler = new AnkiScheduler();
        var state = NewCard();

        scheduler.ApplyReview(state, ReviewGrade.Good, Settings, Now);
        Assert.Equal(1, state.LearningStepIndex);

        scheduler.ApplyReview(state, ReviewGrade.Again, Settings, Now);

        Assert.Equal(CardPhase.Learning, state.Phase);
        Assert.Equal(0, state.LearningStepIndex);
        Assert.Equal(Now.AddMinutes(1), state.Due);
    }

    [Fact]
    public void NewCard_Easy_GraduatesImmediatelyAtEasyInterval()
    {
        var scheduler = new AnkiScheduler();
        var state = NewCard();

        scheduler.ApplyReview(state, ReviewGrade.Easy, Settings, Now);

        Assert.Equal(CardPhase.Review, state.Phase);
        Assert.Equal(Settings.EasyIntervalDays, state.IntervalDays);
        Assert.Equal(4, state.IntervalDays);
    }

    [Fact]
    public void CustomThreeLearningSteps_GoodThreeTimesGraduates()
    {
        var scheduler = new AnkiScheduler();
        var custom = new UserSrsSettings { LearningStepsMinutes = "1,10,60" };
        var settings = SchedulerSettings.From(custom);
        var state = NewCard();

        scheduler.ApplyReview(state, ReviewGrade.Good, settings, Now);
        Assert.Equal(CardPhase.Learning, state.Phase);
        Assert.Equal(1, state.LearningStepIndex);
        Assert.Equal(Now.AddMinutes(10), state.Due);

        scheduler.ApplyReview(state, ReviewGrade.Good, settings, Now);
        Assert.Equal(CardPhase.Learning, state.Phase);
        Assert.Equal(2, state.LearningStepIndex);
        Assert.Equal(Now.AddMinutes(60), state.Due);

        scheduler.ApplyReview(state, ReviewGrade.Good, settings, Now);
        Assert.Equal(CardPhase.Review, state.Phase);
        Assert.Equal(settings.GraduatingIntervalDays, state.IntervalDays);
    }
}
