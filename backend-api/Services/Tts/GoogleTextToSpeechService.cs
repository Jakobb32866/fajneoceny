using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace BackendApi.Services.Tts;

/// <summary>
/// <see cref="ITextToSpeechService"/> backed by Google Cloud Text-to-Speech.
///
/// Chosen over the local Piper engine for deployment: no binary to install,
/// no ~60 MB voice model in the image, and no CPU spent on inference — at the
/// cost of a per-character bill and a network round trip.
///
/// Requests LINEAR16, which Google returns *with* a RIFF/WAVE header, so the
/// response is already the WAV that <see cref="ITextToSpeechService"/>
/// requires and no transcoding is needed.
/// </summary>
public class GoogleTextToSpeechService(
    IHttpClientFactory httpClientFactory,
    IOptions<TtsOptions> options) : ITextToSpeechService
{
    /// <summary>Named client so the timeout is configured once, in Program.cs.</summary>
    public const string HttpClientName = "google-tts";

    /// <summary>Google rejects inputs over 5000 bytes on this endpoint.</summary>
    private const int MaxInputBytes = 5000;

    private const string Endpoint = "https://texttospeech.googleapis.com/v1/text:synthesize";

    private readonly GoogleTtsOptions _options = options.Value.Google;

    public async Task<SynthesizedSpeech> SynthesizeAsync(string text, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            throw new InvalidOperationException(
                "Tts:Google:ApiKey is not configured. Create a Google Cloud API key with the " +
                "Text-to-Speech API enabled and set GOOGLE_TTS_API_KEY (see TODO.md).");
        }

        if (Encoding.UTF8.GetByteCount(text) > MaxInputBytes)
        {
            throw new InvalidOperationException(
                $"Text is too long for a single Text-to-Speech request (limit {MaxInputBytes} bytes). " +
                "Flashcard questions and answers are synthesized one at a time, so this should not " +
                "happen in normal use.");
        }

        var requestBody = new
        {
            input = new { text },
            voice = new
            {
                languageCode = _options.LanguageCode,
                name = string.IsNullOrWhiteSpace(_options.VoiceName) ? null : _options.VoiceName,
            },
            audioConfig = new
            {
                audioEncoding = "LINEAR16",
                sampleRateHertz = _options.SampleRateHertz,
                speakingRate = _options.SpeakingRate,
            },
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(requestBody, JsonOptions), Encoding.UTF8, "application/json"),
        };

        // The key goes in a header, never the query string: URLs end up in
        // proxy logs, browser history and crash reports.
        request.Headers.Add("X-Goog-Api-Key", _options.ApiKey);

        // Resolved per call via the factory rather than held as a typed
        // client: this service is a singleton (the audio exporter that
        // consumes it is too), and a singleton holding one HttpClient forever
        // never picks up DNS changes.
        using var httpClient = httpClientFactory.CreateClient(HttpClientName);
        using var response = await httpClient.SendAsync(request, ct);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException(
                $"Google Text-to-Speech returned {(int)response.StatusCode}: {Truncate(body, 500)}");
        }

        var payload = await response.Content.ReadFromJsonSafeAsync(ct);

        if (string.IsNullOrWhiteSpace(payload?.AudioContent))
        {
            throw new InvalidOperationException("Google Text-to-Speech returned no audio content.");
        }

        return new SynthesizedSpeech(Convert.FromBase64String(payload.AudioContent), SpeechAudioFormat.Wav);
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max] + "…";
}

internal record GoogleTtsResponse([property: JsonPropertyName("audioContent")] string? AudioContent);

internal static class GoogleTtsHttpExtensions
{
    /// <summary>Reads the response body as the TTS payload, tolerating an unexpected shape.</summary>
    public static async Task<GoogleTtsResponse?> ReadFromJsonSafeAsync(this HttpContent content, CancellationToken ct)
    {
        var json = await content.ReadAsStringAsync(ct);
        try
        {
            return JsonSerializer.Deserialize<GoogleTtsResponse>(json);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
