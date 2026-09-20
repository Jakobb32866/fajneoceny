namespace BackendApi.Services.Tts;

/// <summary>
/// Container audio format of synthesized speech. The flashcard audio export
/// splices PCM clips together itself, so every <see cref="ITextToSpeechService"/>
/// must return <see cref="Wav"/>; a provider whose native output differs
/// (e.g. ElevenLabs' MP3) is responsible for producing WAV before returning.
/// </summary>
public enum SpeechAudioFormat
{
    Wav,
}

/// <summary>
/// A synthesized speech clip and its container format. Making the format part
/// of the contract keeps downstream consumers (the WAV splicer) honest: a new
/// TTS backend can't silently hand back MP3 where WAV is expected.
/// </summary>
public record SynthesizedSpeech(byte[] Data, SpeechAudioFormat Format);
