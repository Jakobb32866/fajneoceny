using BackendApi.Domain;

namespace BackendApi.Services.Tts;

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

            var questionWav = await SynthesizeWavAsync(card.Question, ct);
            var (qFormat, qPcm) = WavAudio.Parse(questionWav);
            format ??= qFormat;
            pcmChunks.Add(qPcm);

            pcmChunks.Add(WavAudio.Silence(format, ThinkingPause[card.Difficulty]));

            var answerWav = await SynthesizeWavAsync(card.Answer, ct);
            var (_, aPcm) = WavAudio.Parse(answerWav);
            pcmChunks.Add(aPcm);

            if (i < cards.Count - 1)
            {
                pcmChunks.Add(WavAudio.Silence(format, GapBetweenCards));
            }
        }

        return WavAudio.Build(format!, pcmChunks);
    }

    /// <summary>
    /// Synthesizes one clip and enforces the WAV contract the splicer relies on.
    /// Guards against a future TTS backend returning a different container.
    /// </summary>
    private async Task<byte[]> SynthesizeWavAsync(string text, CancellationToken ct)
    {
        var speech = await tts.SynthesizeAsync(text, ct);
        if (speech.Format != SpeechAudioFormat.Wav)
        {
            throw new NotSupportedException(
                $"Flashcard audio export requires WAV, but the TTS service returned {speech.Format}.");
        }

        return speech.Data;
    }
}
