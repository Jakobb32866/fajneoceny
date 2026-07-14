using System.Security.Claims;

namespace BackendApi.Auth;

/// <summary>
/// Scoped ICurrentUser backed by the current request's ClaimsPrincipal.
/// UserId falls back to Guid.Empty (rather than throwing) when there is no
/// authenticated user, so AppDbContext can be constructed safely even for
/// the public /api/auth endpoints, which never touch owned entities.
/// </summary>
public class CurrentUser(IHttpContextAccessor httpContextAccessor) : ICurrentUser
{
    public bool IsAuthenticated =>
        httpContextAccessor.HttpContext?.User.Identity?.IsAuthenticated ?? false;

    public Guid UserId
    {
        get
        {
            var value = httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier);
            return value is not null && Guid.TryParse(value, out var id) ? id : Guid.Empty;
        }
    }
}
