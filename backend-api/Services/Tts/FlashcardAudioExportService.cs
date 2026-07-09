using BackendApi.Domain;

namespace BackendApi.Services.Tts;

public interface IFlashcardAudioExportService
{
    /// <summary>
    /// Renders a whole flashcard set as a single WAV file: for each card,
    /// question audio → a difficulty-scaled thinking pause → answer audio,
    /// with a short gap between cards. Never split into per-card files —
    /// the whole set is meant to play back-to-back, e.g. during a commute.
    /// </summary>
    Task<byte[]> ExportAsync(IReadOnlyList<Flashcard> cards, CancellationToken ct = default);
}

public class FlashcardAudioExportService(ITextToSpeechService tts) : IFlashcardAudioExportService
{
    private static readonly Dictionary<Difficulty, TimeSpan> ThinkingPause = new()
    {
        [Difficulty.Easy] = TimeSpan.FromSeconds(2),
        [Difficulty.Medium] = TimeSpan.FromSeconds(3.5),
        [Difficulty.Hard] = TimeSpan.FromSeconds(5),
    };

    private static readonly TimeSpan GapBetweenCards = TimeSpan.FromSeconds(1);

    public async Task<byte[]> ExportAsync(IReadOnlyList<Flashcard> cards, CancellationToken ct = default)
    {
        if (cards.Count == 0) throw new ArgumentException("No flashcards to export", nameof(cards));

        WavFormat? format = null;
        var pcmChunks = new List<byte[]>();

        for (var i = 0; i < cards.Count; i++)
        {
            var card = cards[i];

            var questionWav = await tts.SynthesizeAsync(card.Question, ct);
            var (qFormat, qPcm) = WavAudio.Parse(questionWav);
            format ??= qFormat;
            pcmChunks.Add(qPcm);

            pcmChunks.Add(WavAudio.Silence(format, ThinkingPause[card.Difficulty]));

            var answerWav = await tts.SynthesizeAsync(card.Answer, ct);
            var (_, aPcm) = WavAudio.Parse(answerWav);
            pcmChunks.Add(aPcm);

            if (i < cards.Count - 1)
            {
                pcmChunks.Add(WavAudio.Silence(format, GapBetweenCards));
            }
        }

        return WavAudio.Build(format!, pcmChunks);
    }
}
