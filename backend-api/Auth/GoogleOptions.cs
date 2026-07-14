namespace BackendApi.Auth;

/// <summary>
/// Google OAuth client ids allowed as the audience of a verified Google
/// ID token. Deployment-specific — always configure real client ids in
/// production. Left empty in dev config; an empty list means Google
/// signature/issuer checks still run but no audience allow-list is enforced.
/// </summary>
public class GoogleOptions
{
    public List<string> ClientIds { get; set; } = [];
}
