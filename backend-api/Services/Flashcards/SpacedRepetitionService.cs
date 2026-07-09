using BackendApi.Domain;

namespace BackendApi.Services.Flashcards;

public interface ISpacedRepetitionService
{
    /// <summary>
    /// Applies the SM-2 algorithm to a review outcome. The UI only asks the
    /// student to self-grade "correct" or "incorrect" (Quizlet-style), which
    /// we map onto SM-2's 0-5 quality scale as a full recall (5) or a
    /// forgotten card that resets repetitions (2).
    /// </summary>
    void ApplyReview(SpacedRepetitionState state, bool wasCorrect, DateOnly? today = null);
}

/// <summary>
/// SM-2 (SuperMemo 2) — the algorithm behind Anki and most spaced-repetition
/// apps. Chosen over newer alternatives (SM-17, FSRS) because it needs no
/// training data or per-user history to behave well from day one, which
/// matters for a fresh app with no review history yet.
/// </summary>
public class Sm2SpacedRepetitionService : ISpacedRepetitionService
{
    private const int CorrectQuality = 5;
    private const int IncorrectQuality = 2;

    public void ApplyReview(SpacedRepetitionState state, bool wasCorrect, DateOnly? today = null)
    {
        var quality = wasCorrect ? CorrectQuality : IncorrectQuality;
        var date = today ?? DateOnly.FromDateTime(DateTime.UtcNow);

        if (quality < 3)
        {
            state.Repetitions = 0;
            state.IntervalDays = 1;
        }
        else
        {
            state.IntervalDays = state.Repetitions switch
            {
                0 => 1,
                1 => 6,
                _ => (int)Math.Round(state.IntervalDays * state.EaseFactor),
            };
            state.Repetitions += 1;
        }

        state.EaseFactor += 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
        state.EaseFactor = Math.Max(1.3, state.EaseFactor);

        state.NextReviewDate = date.AddDays(state.IntervalDays);
        state.LastReviewedAt = DateTimeOffset.UtcNow;
    }
}
