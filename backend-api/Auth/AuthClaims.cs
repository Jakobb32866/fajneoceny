namespace BackendApi.Auth;

/// <summary>
/// Claim names and values that separate the two kinds of caller.
///
/// Students and admins are distinct account types with distinct tokens, and
/// the ONLY thing standing between an admin token and a student route (or
/// vice versa) is the authorization policy keyed off these claims — see
/// Program.cs. Treat them as security-critical.
/// </summary>
public static class AuthClaims
{
    /// <summary>
    /// Which kind of account the token belongs to.
    ///
    /// Deliberately NOT named "typ": that is a reserved JOSE header parameter
    /// ("typ": "JWT"). A header is not a payload claim so there would be no
    /// functional collision, but JwtRegisteredClaimNames.Typ is the same
    /// string and the ambiguity belongs nowhere near this code.
    /// </summary>
    public const string Actor = "fo_actor";

    /// <summary>
    /// The admin's role at issue time. Only a first-pass filter for the
    /// SuperAdmin policy — the authoritative role is re-read from the
    /// database on every admin request (see AdminContext), so demoting an
    /// admin takes effect on their next request rather than at token expiry.
    ///
    /// Deliberately NOT named "role": that maps to ClaimTypes.Role under
    /// inbound claim mapping, which would make [Authorize(Roles = ...)] and
    /// IsInRole() appear to work while silently depending on framework
    /// defaults. Neither is used in this codebase; role checks go through the
    /// named policies.
    /// </summary>
    public const string Role = "fo_role";

    public const string ActorStudent = "student";
    public const string ActorAdmin = "admin";
}
