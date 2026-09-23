namespace BackendApi.Services.Tts;

/// <summary>Which speech backend to use. Selected by configuration, not by code.</summary>
public enum TtsProvider
{
    /// <summary>Google Cloud Text-to-Speech (needs an API key, no local install).</summary>
    Google,

    /// <summary>Local Piper engine — offline, free, but the binary and voice model must be installed.</summary>
    Piper,
}

/// <summary>
/// Text-to-speech configuration. Provider-specific settings live in their own
/// nested section so backends can sit side by side, and <see cref="Provider"/>
/// picks which one is actually resolved in Program.cs.
///
/// Note that the flashcard audio export splices clips itself and takes the
/// WAV format from the FIRST clip (see WavAudio), so clips from different
/// providers must never be mixed within one export — which is why this is a
/// single global setting rather than a per-request choice.
/// </summary>
public class TtsOptions
{
    public TtsProvider Provider { get; set; } = TtsProvider.Google;

    public GoogleTtsOptions Google { get; set; } = new();
    public PiperOptions Piper { get; set; } = new();
}

/// <summary>
/// Settings for Google Cloud Text-to-Speech.
///
/// Named GoogleTtsOptions rather than GoogleOptions because BackendApi.Auth
/// already has a GoogleOptions for Sign-In; these are unrelated credentials.
/// </summary>
public class GoogleTtsOptions
{
    /// <summary>
    /// A Google Cloud API key with the Text-to-Speech API enabled. Leave empty
    /// to disable speech synthesis — audio export then fails with a clear
    /// message rather than the app refusing to start.
    /// </summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>BCP-47 language of the voice.</summary>
    public string LanguageCode { get; set; } = "pl-PL";

    /// <summary>
    /// Voice name.
    ///
    /// **Verify any value against the live list before using it.** Google
    /// does NOT reject an unknown voice name — it silently falls back to a
    /// default for the language, so a typo produces working audio in the
    /// wrong voice and nothing anywhere reports a problem:
    ///
    ///   curl "https://texttospeech.googleapis.com/v1/voices?languageCode=pl-PL" \
    ///        -H "X-Goog-Api-Key: $GOOGLE_TTS_API_KEY"
    ///
    /// For pl-PL the real names are Standard-F/G, Wavenet-F/G and ~30
    /// Chirp3-HD-* voices. Note that Standard-F and Wavenet-F currently
    /// return byte-identical audio (likewise G), so the Standard tier is the
    /// cheaper way to get that voice — see
    /// https://cloud.google.com/text-to-speech/pricing
    /// </summary>
    public string VoiceName { get; set; } = "pl-PL-Standard-F";

    /// <summary>
    /// Output sample rate. Pinned explicitly so every clip in an export
    /// matches — WavAudio reads the format from the first clip only. 24 kHz
    /// is the Polish voices' native rate, so this avoids a resample.
    /// </summary>
    public int SampleRateHertz { get; set; } = 24000;

    /// <summary>Speaking rate, 0.25–4.0. 1.0 is the voice's natural pace.</summary>
    public double SpeakingRate { get; set; } = 1.0;
}

/// <summary>Settings for the local Piper TTS engine.</summary>
public class PiperOptions
{
    /// <summary>Path to the piper executable, e.g. "./.tts-venv/bin/piper" locally, or "piper" if it's on PATH.</summary>
    public string ExecutablePath { get; set; } = "piper";

    /// <summary>Path to the .onnx voice model (a matching .onnx.json must sit next to it).</summary>
    public string VoiceModelPath { get; set; } = string.Empty;
}
