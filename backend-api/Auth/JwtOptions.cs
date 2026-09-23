namespace BackendApi.Auth;

public class JwtOptions
{
    /// <summary>The audience of student tokens. Admin tokens use <see cref="AdminAudience"/>.</summary>
    public const string AdminAudience = "fajneoceny-admin";

    public string Issuer { get; set; } = "fajneoceny";
    public string Audience { get; set; } = "fajneoceny-app";
    public string Key { get; set; } = string.Empty;
    public int ExpiryMinutes { get; set; } = 43200;

    /// <summary>
    /// Signing key for admin tokens. Deliberately separate from Key so the
    /// student-token secret alone cannot mint an admin token. Falls back to
    /// Key when unset so existing deployments still boot — production must
    /// set it (see TODO.md).
    /// </summary>
    public string AdminKey { get; set; } = string.Empty;

    /// <summary>Admin sessions are short: 8 hours, not the students' 30 days.</summary>
    public int AdminExpiryMinutes { get; set; } = 480;

    /// <summary>The effective admin signing key, falling back to the student key when none is configured.</summary>
    public string EffectiveAdminKey => string.IsNullOrWhiteSpace(AdminKey) ? Key : AdminKey;
}
