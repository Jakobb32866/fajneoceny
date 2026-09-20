namespace BackendApi.Services.Tts;

/// <summary>
/// Turns a piece of text into a speech clip. Implementations (local Piper, a
/// cloud provider like ElevenLabs, …) are swapped via the registration in
/// Program.cs. All implementations must return WAV — see
/// <see cref="SynthesizedSpeech"/> — so the audio export can splice clips
/// without knowing which backend produced them.
/// </summary>
public interface ITextToSpeechService
{
    Task<SynthesizedSpeech> SynthesizeAsync(string text, CancellationToken ct = default);
}
