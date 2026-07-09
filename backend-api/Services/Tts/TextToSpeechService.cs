using System.Diagnostics;
using Microsoft.Extensions.Options;

namespace BackendApi.Services.Tts;

public interface ITextToSpeechService
{
    Task<byte[]> SynthesizeAsync(string text, CancellationToken ct = default);
}

/// <summary>
/// Wraps the local Piper TTS engine (https://github.com/OHF-Voice/piper1-gpl)
/// as a subprocess. Piper was picked because it runs fully offline, has no
/// GPU requirement, ships ready-made Polish voices, and its CLI is trivial
/// to shell out to — no bindings/native interop needed.
/// </summary>
public class PiperTextToSpeechService(IOptions<TtsOptions> options) : ITextToSpeechService
{
    private readonly TtsOptions _options = options.Value;

    public async Task<byte[]> SynthesizeAsync(string text, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_options.VoiceModelPath))
        {
            throw new InvalidOperationException(
                "Tts:VoiceModelPath is not configured. Download a Piper voice model " +
                "(see https://github.com/rhasspy/piper/blob/master/VOICES.md) and set its path.");
        }

        var outputPath = Path.Combine(Path.GetTempPath(), $"tts-{Guid.NewGuid()}.wav");
        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = _options.PiperExecutablePath,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            };
            startInfo.ArgumentList.Add("-m");
            startInfo.ArgumentList.Add(_options.VoiceModelPath);
            startInfo.ArgumentList.Add("-f");
            startInfo.ArgumentList.Add(outputPath);

            using var process = Process.Start(startInfo)
                ?? throw new InvalidOperationException("Failed to start the piper process");

            await process.StandardInput.WriteAsync(text);
            process.StandardInput.Close();

            var stderrTask = process.StandardError.ReadToEndAsync(ct);
            await process.WaitForExitAsync(ct);

            if (process.ExitCode != 0)
            {
                var stderr = await stderrTask;
                throw new InvalidOperationException($"piper exited with code {process.ExitCode}: {stderr}");
            }

            return await File.ReadAllBytesAsync(outputPath, ct);
        }
        finally
        {
            if (File.Exists(outputPath)) File.Delete(outputPath);
        }
    }
}
