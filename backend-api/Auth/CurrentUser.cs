using System.Security.Claims;

namespace BackendApi.Auth;

/// <summary>
/// Scoped ICurrentUser backed by the current request's ClaimsPrincipal.
/// UserId falls back to Guid.Empty (rather than throwing) when there is no
/// authenticated student, so AppDbContext can be constructed safely for the
/// public /api/auth endpoints and for admin requests alike — neither of
/// which may touch owned entities.
/// </summary>
public class CurrentUser(IHttpContextAccessor httpContextAccessor) : ICurrentUser
{
    public bool IsAuthenticated =>
        httpContextAccessor.HttpContext?.User.Identity?.IsAuthenticated ?? false;

    public Guid UserId
    {
        get
        {
            var principal = httpContextAccessor.HttpContext?.User;

            // An admin token must never produce a UserId. AppDbContext
            // compares this against Lesson.UserId, Subject.UserId and so on,
            // and Guid.Empty matches no row — so every owned-entity query
            // fails closed for admin requests instead of silently comparing
            // an admin id against user-owned data. This is what makes the
            // separation structural rather than merely conventional; the
            // authorization policies are the other half.
            if (principal?.FindFirstValue(AuthClaims.Actor) != AuthClaims.ActorStudent) return Guid.Empty;

            var value = principal.FindFirstValue(ClaimTypes.NameIdentifier);
            return value is not null && Guid.TryParse(value, out var id) ? id : Guid.Empty;
        }
    }
}
