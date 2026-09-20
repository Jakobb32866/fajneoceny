using BackendApi.Domain;

namespace BackendApi.Services.Flashcards;

/// <summary>Projected next intervals for each of the four grade buttons, pre-formatted for the UI.</summary>
public record IntervalPreview(string Again, string Hard, string Good, string Easy);

public interface ISpacedRepetitionService
{
    /// <summary>
    /// Applies a graded review to the card's scheduling state in place, using
    /// the given per-user settings and clock. Returns the projected intervals
    /// for the card's next appearance (for labelling the grade buttons).
    /// </summary>
    void ApplyReview(SpacedRepetitionState state, ReviewGrade grade, SchedulerSettings settings, DateTimeOffset now);

    /// <summary>
    /// Non-mutating: what would happen to <paramref name="state"/> for each of
    /// the four grades, formatted as human labels ("10 min", "3 dni", ...).
    /// </summary>
    IntervalPreview PreviewIntervals(SpacedRepetitionState state, SchedulerSettings settings, DateTimeOffset now);
}

/// <summary>
/// Anki's scheduler (its SM-2 variant with learning steps, lapses and
/// relearning), chosen over textbook SM-2 or FSRS because it behaves well from
/// day one with no per-user training data. Every tunable comes from the user's
/// <see cref="SchedulerSettings"/> so the Settings screen can drive it.
/// </summary>
public class AnkiScheduler : ISpacedRepetitionService
{
    private const double HardEasePenalty = 0.15;
    private const double LapseEasePenalty = 0.20;
    private const double EasyEaseBonus = 0.15;
    private const double FuzzRatio = 0.05;

    public void ApplyReview(SpacedRepetitionState state, ReviewGrade grade, SchedulerSettings s, DateTimeOffset now)
    {
        if (state.EaseFactor < SchedulerSettings.MinimumEase) state.EaseFactor = s.StartingEase;

        switch (state.Phase)
        {
            case CardPhase.New:
            case CardPhase.Learning:
                ApplyLearning(state, grade, s, now, relearning: false);
                break;
            case CardPhase.Relearning:
                ApplyLearning(state, grade, s, now, relearning: true);
                break;
            case CardPhase.Review:
                ApplyReviewPhase(state, grade, s, now);
                break;
        }

        state.LastReviewedAt = now;
        state.NextReviewDate = StudyClock.LocalDate(state.Due, s);
    }

    private static void ApplyLearning(SpacedRepetitionState state, ReviewGrade grade, SchedulerSettings s, DateTimeOffset now, bool relearning)
    {
        var steps = relearning ? s.RelearningStepsMinutes : s.LearningStepsMinutes;
        state.Phase = relearning ? CardPhase.Relearning : CardPhase.Learning;

        switch (grade)
        {
            case ReviewGrade.Again:
                state.LearningStepIndex = 0;
                state.Due = now.AddMinutes(steps[0]);
                break;

            case ReviewGrade.Hard:
                // Repeat the current step (Anki averages the again/current delay;
                // repeating the current step is a close, simpler equivalent).
                var current = Math.Clamp(state.LearningStepIndex, 0, steps.Length - 1);
                state.LearningStepIndex = current;
                state.Due = now.AddMinutes(steps[current]);
                break;

            case ReviewGrade.Good:
                var next = state.LearningStepIndex + 1;
                if (next >= steps.Length)
                    Graduate(state, s, now, relearning, easy: false);
                else
                {
                    state.LearningStepIndex = next;
                    state.Due = now.AddMinutes(steps[next]);
                }
                break;

            case ReviewGrade.Easy:
                Graduate(state, s, now, relearning, easy: true);
                break;
        }
    }

    private static void Graduate(SpacedRepetitionState state, SchedulerSettings s, DateTimeOffset now, bool relearning, bool easy)
    {
        int interval;
        if (relearning)
            // The reduced interval was computed and stored when the card lapsed;
            // Easy nudges it out to at least the graduating interval.
            interval = easy ? Math.Max(state.IntervalDays, s.GraduatingIntervalDays) : Math.Max(state.IntervalDays, s.MinimumIntervalDays);
        else
            interval = easy ? s.EasyIntervalDays : s.GraduatingIntervalDays;

        state.Phase = CardPhase.Review;
        state.LearningStepIndex = 0;
        state.IntervalDays = Math.Clamp(interval, s.MinimumIntervalDays, s.MaximumIntervalDays);
        state.Repetitions += 1;
        state.Due = StudyClock.DueForInterval(now, state.IntervalDays, s);
    }

    private static void ApplyReviewPhase(SpacedRepetitionState state, ReviewGrade grade, SchedulerSettings s, DateTimeOffset now)
    {
        var ease = state.EaseFactor;
        var scheduled = state.IntervalDays;

        // Reviewing ahead of schedule shouldn't earn full interval credit: base
        // the multiplier on days actually elapsed (Anki's early-review behaviour).
        var reviewedEarly = now < state.Due && state.LastReviewedAt is not null;
        var baseInterval = scheduled;
        if (reviewedEarly)
        {
            var elapsed = (StudyClock.LocalDate(now, s).DayNumber - StudyClock.LocalDate(state.LastReviewedAt!.Value, s).DayNumber);
            baseInterval = Math.Clamp(elapsed, 1, scheduled);
        }

        if (grade == ReviewGrade.Again)
        {
            state.EaseFactor = Math.Max(SchedulerSettings.MinimumEase, ease - LapseEasePenalty);
            state.Lapses += 1;

            var lapsedInterval = Math.Max(s.MinimumIntervalDays, (int)Math.Round(scheduled * s.LapseNewIntervalMultiplier));
            state.IntervalDays = Math.Min(lapsedInterval, s.MaximumIntervalDays);

            if (s.RelearningStepsMinutes.Length > 0)
            {
                state.Phase = CardPhase.Relearning;
                state.LearningStepIndex = 0;
                state.Due = now.AddMinutes(s.RelearningStepsMinutes[0]);
            }
            else
            {
                // No relearning steps configured: straight back to Review at the reduced interval.
                state.Due = StudyClock.DueForInterval(now, state.IntervalDays, s);
            }
            return;
        }

        double raw;
        switch (grade)
        {
            case ReviewGrade.Hard:
                state.EaseFactor = Math.Max(SchedulerSettings.MinimumEase, ease - HardEasePenalty);
                raw = baseInterval * s.HardMultiplier;
                break;
            case ReviewGrade.Easy:
                state.EaseFactor = ease + EasyEaseBonus;
                raw = baseInterval * ease * s.EasyBonus;
                break;
            default: // Good
                raw = baseInterval * ease;
                break;
        }

        var days = (int)Math.Round(raw);
        // Guarantee forward progress (except Hard, which may hold roughly steady).
        var floor = grade == ReviewGrade.Hard ? scheduled : scheduled + 1;
        days = Math.Max(days, floor);
        days = Fuzz(days);
        state.IntervalDays = Math.Clamp(days, s.MinimumIntervalDays, s.MaximumIntervalDays);
        state.Repetitions += 1;
        state.Due = StudyClock.DueForInterval(now, state.IntervalDays, s);
    }

    // Small deterministic-free jitter so cards introduced together don't stay
    // clumped on the same day forever. Only applied to multi-day intervals.
    private static int Fuzz(int days)
    {
        if (days < 3) return days;
        var span = Math.Max(1, (int)Math.Round(days * FuzzRatio));
        return days + Random.Shared.Next(-span, span + 1);
    }

    public IntervalPreview PreviewIntervals(SpacedRepetitionState state, SchedulerSettings s, DateTimeOffset now)
    {
        return new IntervalPreview(
            Preview(state, ReviewGrade.Again, s, now),
            Preview(state, ReviewGrade.Hard, s, now),
            Preview(state, ReviewGrade.Good, s, now),
            Preview(state, ReviewGrade.Easy, s, now));
    }

    private string Preview(SpacedRepetitionState state, ReviewGrade grade, SchedulerSettings s, DateTimeOffset now)
    {
        var copy = Clone(state);
        ApplyReview(copy, grade, s, now);
        return FormatInterval(copy.Due - now);
    }

    private static SpacedRepetitionState Clone(SpacedRepetitionState state) => new()
    {
        Phase = state.Phase,
        LearningStepIndex = state.LearningStepIndex,
        EaseFactor = state.EaseFactor,
        IntervalDays = state.IntervalDays,
        Repetitions = state.Repetitions,
        Lapses = state.Lapses,
        Due = state.Due,
        LastReviewedAt = state.LastReviewedAt,
    };

    // Pinned so the decimal separator is always a Polish comma ("1,5 mies.")
    // regardless of the host machine's locale.
    private static readonly System.Globalization.CultureInfo PlCulture = System.Globalization.CultureInfo.GetCultureInfo("pl-PL");

    /// <summary>Formats a delay as a compact Polish label ("&lt;1 min", "10 min", "3 dni", "1,2 mies.").</summary>
    public static string FormatInterval(TimeSpan delay)
    {
        var minutes = delay.TotalMinutes;
        if (minutes < 1) return "<1 min";
        if (minutes < 60) return $"{(int)Math.Round(minutes)} min";

        var hours = delay.TotalHours;
        if (hours < 24) return $"{(int)Math.Round(hours)} godz.";

        var days = delay.TotalDays;
        if (days < 30) return $"{(int)Math.Round(days)} dni";

        var months = days / 30.0;
        if (months < 12) return string.Format(PlCulture, "{0:0.#} mies.", months);

        var years = days / 365.0;
        return string.Format(PlCulture, "{0:0.#} lata", years);
    }
}
