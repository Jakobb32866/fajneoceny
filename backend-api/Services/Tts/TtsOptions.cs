namespace BackendApi.Services.Tts;

/// <summary>
/// Text-to-speech configuration. Provider-specific settings live in their own
/// nested section so a new backend (e.g. ElevenLabs) can be added alongside
/// Piper without disturbing it. Which provider is actually used is decided by
/// the registration in Program.cs, not by config.
/// </summary>
public class TtsOptions
{
    public PiperOptions Piper { get; set; } = new();
}

/// <summary>Settings for the local Piper TTS engine.</summary>
public class PiperOptions
{
    /// <summary>Path to the piper executable, e.g. "./.tts-venv/bin/piper" locally, or "piper" if it's on PATH.</summary>
    public string ExecutablePath { get; set; } = "piper";

    /// <summary>Path to the .onnx voice model (a matching .onnx.json must sit next to it).</summary>
    public string VoiceModelPath { get; set; } = string.Empty;
}
