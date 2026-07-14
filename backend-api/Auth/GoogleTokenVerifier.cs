using Google.Apis.Auth;
using Microsoft.Extensions.Options;

namespace BackendApi.Auth;

public record GoogleProfile(string Subject, string Email, string? GivenName, string? FamilyName);

/// <summary>Verifies a Google-issued ID token via Google's own signature/issuer checks.</summary>
public class GoogleTokenVerifier(IOptions<GoogleOptions> options)
{
    private readonly GoogleOptions _options = options.Value;

    public async Task<GoogleProfile> VerifyAsync(string idToken)
    {
        var settings = new GoogleJsonWebSignature.ValidationSettings();
        // Only restrict by audience when client ids are configured. Dev
        // environments without configured client ids still get signature and
        // issuer validation from Google's library; production should always
        // set Google:ClientIds so tokens minted for other apps are rejected.
        if (_options.ClientIds.Count > 0)
        {
            settings.Audience = _options.ClientIds;
        }

        var payload = await GoogleJsonWebSignature.ValidateAsync(idToken, settings);

        return new GoogleProfile(payload.Subject, payload.Email, payload.GivenName, payload.FamilyName);
    }
}
