using BackendApi.Domain;
using BackendApi.Services.Flashcards;

namespace BackendApi.Tests;

public class PreviewIntervalsTests
{
    private static readonly DateTimeOffset Now = new(2026, 7, 14, 9, 0, 0, TimeSpan.Zero);
    private static readonly SchedulerSettings Settings = SchedulerSettings.Defaults;

    [Fact]
    public void PreviewIntervals_DoesNotMutateState_AndReturnsFourLabels()
    {
        var scheduler = new AnkiScheduler();
        var state = new SpacedRepetitionState
        {
            Phase = CardPhase.Review,
            LearningStepIndex = 0,
            EaseFactor = 2.5,
            IntervalDays = 10,
            Repetitions = 3,
            Lapses = 1,
            Due = Now,
            LastReviewedAt = Now.AddDays(-10),
        };

        var snapshot = (state.Phase, state.LearningStepIndex, state.EaseFactor, state.IntervalDays,
            state.Repetitions, state.Lapses, state.Due, state.LastReviewedAt);

        var preview = scheduler.PreviewIntervals(state, Settings, Now);

        var after = (state.Phase, state.LearningStepIndex, state.EaseFactor, state.IntervalDays,
            state.Repetitions, state.Lapses, state.Due, state.LastReviewedAt);
        Assert.Equal(snapshot, after);

        Assert.False(string.IsNullOrEmpty(preview.Again));
        Assert.False(string.IsNullOrEmpty(preview.Hard));
        Assert.False(string.IsNullOrEmpty(preview.Good));
        Assert.False(string.IsNullOrEmpty(preview.Easy));
    }

    [Fact]
    public void PreviewIntervals_DoesNotMutateState_ForNewCard()
    {
        var scheduler = new AnkiScheduler();
        var state = new SpacedRepetitionState
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

        var snapshot = (state.Phase, state.LearningStepIndex, state.EaseFactor, state.IntervalDays,
            state.Repetitions, state.Lapses, state.Due, state.LastReviewedAt);

        var preview = scheduler.PreviewIntervals(state, Settings, Now);

        var after = (state.Phase, state.LearningStepIndex, state.EaseFactor, state.IntervalDays,
            state.Repetitions, state.Lapses, state.Due, state.LastReviewedAt);
        Assert.Equal(snapshot, after);

        Assert.False(string.IsNullOrEmpty(preview.Again));
        Assert.False(string.IsNullOrEmpty(preview.Hard));
        Assert.False(string.IsNullOrEmpty(preview.Good));
        Assert.False(string.IsNullOrEmpty(preview.Easy));
    }
}
