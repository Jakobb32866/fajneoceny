using System.Security.Claims;

namespace BackendApi.Auth;

/// <summary>
/// Scoped ICurrentAdmin backed by the current request's ClaimsPrincipal.
/// Mirrors CurrentUser: falls back to Guid.Empty rather than throwing, so it
/// can be constructed for any request, including anonymous ones.
/// </summary>
public class CurrentAdmin(IHttpContextAccessor httpContextAccessor) : ICurrentAdmin
{
    public bool IsAuthenticated => AdminId != Guid.Empty;

    public Guid AdminId
    {
        get
        {
            var principal = httpContextAccessor.HttpContext?.User;

            // Symmetric with CurrentUser: a student token must never resolve
            // to an admin id, whatever its subject claim happens to contain.
            if (principal?.FindFirstValue(AuthClaims.Actor) != AuthClaims.ActorAdmin) return Guid.Empty;

            var value = principal.FindFirstValue(ClaimTypes.NameIdentifier);
            return value is not null && Guid.TryParse(value, out var id) ? id : Guid.Empty;
        }
    }
}
