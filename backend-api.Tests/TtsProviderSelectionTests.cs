using BackendApi.Services.Tts;
using Microsoft.Extensions.Options;

namespace BackendApi.Tests;

/// <summary>
/// The TTS provider is chosen by configuration, and both backends must satisfy
/// the same WAV contract. These pin the selection and the "not configured"
/// messages, which are the two things a deployment actually gets wrong.
/// </summary>
public class TtsProviderSelectionTests
{
    private static IOptions<TtsOptions> Options(TtsOptions options) => Microsoft.Extensions.Options.Options.Create(options);

    [Fact]
    public void GoogleIsTheDefaultProvider()
    {
        // The Docker image ships no speech engine, so defaulting to Piper
        // would mean audio export fails out of the box in production.
        Assert.Equal(TtsProvider.Google, new TtsOptions().Provider);
    }

    [Fact]
    public void DefaultVoiceIsARealPolishVoice()
    {
        var google = new TtsOptions().Google;

        Assert.Equal("pl-PL", google.LanguageCode);

        // Pinned to an exact name that exists in Google's pl-PL catalogue.
        // A weaker assertion (e.g. just Contains("Standard")) is worthless
        // here: "pl-PL-Standard-A" looks perfectly plausible, does not
        // exist, and Google answers it with a silent fallback to a default
        // voice rather than an error — so a wrong name ships happily and
        // every end-to-end test still passes.
        Assert.Equal("pl-PL-Standard-F", google.VoiceName);
    }

    [Fact]
    public void DefaultSampleRateMatchesThePolishVoicesNativeRate()
    {
        // The pl-PL voices are natively 24 kHz; asking for anything else
        // makes Google resample and costs quality for nothing.
        Assert.Equal(24000, new TtsOptions().Google.SampleRateHertz);
    }

    [Fact]
    public async Task GoogleWithoutAnApiKey_FailsWithAnActionableMessage()
    {
        var service = new GoogleTextToSpeechService(
            new ThrowingHttpClientFactory(), Options(new TtsOptions()));

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.SynthesizeAsync("cokolwiek"));

        // Must name the setting, or a deployment has nothing to go on.
        Assert.Contains("Tts:Google:ApiKey", ex.Message);

        // And must fail before any network call is attempted.
        Assert.DoesNotContain("HTTP", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task PiperWithoutAVoiceModel_FailsWithAnActionableMessage()
    {
        var service = new PiperTextToSpeechService(Options(new TtsOptions
        {
            Provider = TtsProvider.Piper,
            Piper = new PiperOptions { VoiceModelPath = string.Empty },
        }));

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.SynthesizeAsync("cokolwiek"));

        Assert.Contains("VoiceModelPath", ex.Message);
    }

    [Fact]
    public async Task GoogleRejectsTextOverTheApiLimit_BeforeCallingOut()
    {
        var service = new GoogleTextToSpeechService(
            new ThrowingHttpClientFactory(),
            Options(new TtsOptions { Google = new GoogleTtsOptions { ApiKey = "test-key" } }));

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.SynthesizeAsync(new string('a', 5001)));

        Assert.Contains("5000", ex.Message);
    }

    /// <summary>Fails loudly if a test ever reaches the network — none of these should.</summary>
    private sealed class ThrowingHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) =>
            throw new InvalidOperationException("A test tried to make a real HTTP call.");
    }
}
