namespace BackendApi.Auth;

/// <summary>
/// The authenticated user for the current HTTP request, as resolved from the
/// app JWT's "sub" claim. Consumed by AppDbContext for per-user query
/// filters and to stamp UserId on newly-inserted owned entities.
/// </summary>
public interface ICurrentUser
{
    Guid UserId { get; }
    bool IsAuthenticated { get; }
}
