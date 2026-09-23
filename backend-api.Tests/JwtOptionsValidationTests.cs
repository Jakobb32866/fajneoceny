using BackendApi.Auth;

namespace BackendApi.Tests;

/// <summary>
/// The startup guard on the JWT signing keys. Every case it refuses is one
/// where tokens could be forged: no key, a guessable short key, one key for
/// both kinds of token, or a key that is published in the repository.
/// </summary>
public class JwtOptionsValidationTests
{
    private const string StudentKey = "a-real-random-student-key-0123456789abcdef";
    private const string AdminKey = "a-real-random-admin-key-0123456789abcdefgh";

    private static JwtOptions Options(string key, string adminKey) => new() { Key = key, AdminKey = adminKey };

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void TwoDistinctStrongKeys_AreAccepted(bool isDevelopment)
    {
        Options(StudentKey, AdminKey).EnsureValid(isDevelopment);
    }

    [Theory]
    [InlineData("", AdminKey)]
    [InlineData(StudentKey, "")]
    [InlineData("   ", AdminKey)]
    public void AMissingKey_IsRefused(string key, string adminKey)
    {
        Assert.Throws<InvalidOperationException>(() => Options(key, adminKey).EnsureValid(isDevelopment: true));
    }

    [Fact]
    public void AShortKey_IsRefused()
    {
        Assert.Throws<InvalidOperationException>(() => Options("too-short", AdminKey).EnsureValid(isDevelopment: true));
    }

    [Fact]
    public void TheSameKeyForStudentsAndAdmins_IsRefused()
    {
        Assert.Throws<InvalidOperationException>(() => Options(StudentKey, StudentKey).EnsureValid(isDevelopment: true));
    }

    [Theory]
    [InlineData("dev-only-student-signing-key-not-secret-0123456789", AdminKey)]
    [InlineData(StudentKey, "dev-only-admin-signing-key-not-secret-0123456789")]
    // The placeholder that used to ship in appsettings.json and docker-compose.yml.
    [InlineData("dev-only-placeholder-signing-key-change-me-32chars-min", AdminKey)]
    public void ThePublicDevelopmentKeys_AreRefusedOutsideDevelopment(string key, string adminKey)
    {
        Assert.Throws<InvalidOperationException>(() => Options(key, adminKey).EnsureValid(isDevelopment: false));

        // ...but are fine for local development, which is what they are for.
        Options(key, adminKey).EnsureValid(isDevelopment: true);
    }
}
