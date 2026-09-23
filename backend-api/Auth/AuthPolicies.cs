namespace BackendApi.Auth;

/// <summary>
/// Named authorization policies. Student routes use the DEFAULT policy (a
/// bare RequireAuthorization()), so only the admin ones need names.
/// </summary>
public static class AuthPolicies
{
    /// <summary>Any enabled admin. University scoping is resolved per request, not by the policy.</summary>
    public const string Admin = "Admin";

    /// <summary>The single server-wide super admin.</summary>
    public const string SuperAdmin = "SuperAdmin";
}
