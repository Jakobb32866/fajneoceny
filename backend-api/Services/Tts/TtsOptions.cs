namespace BackendApi.Services.Tts;

public class TtsOptions
{
    /// <summary>Path to the piper executable, e.g. "./.tts-venv/bin/piper" locally, or "piper" if it's on PATH.</summary>
    public string PiperExecutablePath { get; set; } = "piper";

    /// <summary>Path to the .onnx voice model (a matching .onnx.json must sit next to it).</summary>
    public string VoiceModelPath { get; set; } = string.Empty;
}
