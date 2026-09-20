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