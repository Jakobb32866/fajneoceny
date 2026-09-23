using System.Text;

namespace BackendApi.Auth;

public class JwtOptions
{
    /// <summary>The audience of student tokens. Admin tokens use <see cref="AdminAudience"/>.</summary>
    public const string AdminAudience = "fajneoceny-admin";

    /// <summary>HS256 needs a key of at least 256 bits.</summary>
    public const int MinimumKeyBytes = 32;

    /// <summary>
    /// Prefix of the keys committed in appsettings.Development.json. They are
    /// public (the repository is), so they are refused outside Development.
    /// </summary>
    public const string DevelopmentKeyPrefix = "dev-only-";

    public string Issuer { get; set; } = "fajneoceny";
    public string Audience { get; set; } = "fajneoceny-app";
    public string Key { get; set; } = string.Empty;
    public int ExpiryMinutes { get; set; } = 43200;

    /// <summary>
    /// Signing key for admin tokens. Required, and must differ from Key: the
    /// student-token secret must never be able to mint an admin token.
    /// </summary>
    public string AdminKey { get; set; } = string.Empty;

    /// <summary>Admin sessions are short: 8 hours, not the students' 30 days.</summary>
    public int AdminExpiryMinutes { get; set; } = 480;

    /// <summary>
    /// Refuses to start with signing keys that would let someone forge
    /// tokens: missing, too short, shared between students and admins, or
    /// (outside Development) one of the publicly committed development keys.
    /// </summary>
    public void EnsureValid(bool isDevelopment)
    {
        var problems = new List<string>();

        CheckKey("Jwt:Key", Key, isDevelopment, problems);
        CheckKey("Jwt:AdminKey", AdminKey, isDevelopment, problems);

        if (!string.IsNullOrEmpty(Key) && Key == AdminKey)
        {
            problems.Add("Jwt:Key and Jwt:AdminKey must be different, otherwise the student key can mint admin tokens.");
        }

        if (problems.Count > 0)
        {
            throw new InvalidOperationException(
                "Invalid JWT signing configuration:\n  - " + string.Join("\n  - ", problems) +
                "\nGenerate each key with `openssl rand -base64 48` and set Jwt__Key / Jwt__AdminKey " +
                "(JWT_KEY / JWT_ADMIN_KEY in .env for docker compose).");
        }
    }

    private static void CheckKey(string name, string key, bool isDevelopment, List<string> problems)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            problems.Add($"{name} is not set.");
            return;
        }

        if (Encoding.UTF8.GetByteCount(key) < MinimumKeyBytes)
        {
            problems.Add($"{name} must be at least {MinimumKeyBytes} bytes.");
        }

        if (!isDevelopment && key.StartsWith(DevelopmentKeyPrefix, StringComparison.OrdinalIgnoreCase))
        {
            problems.Add($"{name} is a public development key and cannot be used outside Development.");
        }
    }
}
