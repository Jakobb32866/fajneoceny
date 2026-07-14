namespace BackendApi.Auth;

public class JwtOptions
{
    public string Issuer { get; set; } = "fajneoceny";
    public string Audience { get; set; } = "fajneoceny-app";
    public string Key { get; set; } = string.Empty;
    public int ExpiryMinutes { get; set; } = 43200;
}
