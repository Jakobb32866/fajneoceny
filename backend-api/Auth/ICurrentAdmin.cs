namespace BackendApi.Auth;

/// <summary>
/// The authenticated admin for the current HTTP request, as resolved from the
/// admin JWT. The mirror of ICurrentUser, and deliberately a separate
/// abstraction: an admin id must never be usable where a user id is expected,
/// because AppDbContext compares user ids against owned rows.
///
/// This reports only WHO is calling. Whether that admin still exists, is
/// enabled, and what they may do is answered by AdminContext, which re-reads
/// the row from the database on every request.
/// </summary>
public interface ICurrentAdmin
{
    /// <summary>The calling admin's id, or Guid.Empty when the caller isn't an admin.</summary>
    Guid AdminId { get; }

    bool IsAuthenticated { get; }
}
