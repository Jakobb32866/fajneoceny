namespace BackendApi.Domain;

/// <summary>
/// A time-boxed block on a user's ability to share lessons.
///
/// Bans are history, not a flag: a user may be banned many times, and every
/// reason is kept. Rows are never deleted or overwritten — lifting a ban
/// early stamps LiftedAt. "Is this user banned right now?" is therefore a
/// query, not a column; see ShareBanQueries.ActiveBanAsync, which every
/// caller must use so the share endpoint, the lesson DTO and the admin user
/// list can't disagree.
///
/// Not IOwnedByUser (same reasoning as LessonLike): admins read and write
/// these across users, so UserId is set explicitly.
/// </summary>
public class ShareBan
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The banned user.</summary>
    public Guid UserId { get; set; }

    public Guid IssuedByAdminId { get; set; }
    public string Reason { get; set; } = string.Empty;

    /// <summary>The duration the admin entered, kept for display alongside the computed expiry.</summary>
    public int Hours { get; set; }

    public DateTimeOffset StartsAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>Set when an admin lifts the ban before it expires. The row itself is never removed.</summary>
    public DateTimeOffset? LiftedAt { get; set; }
    public Guid? LiftedByAdminId { get; set; }
}
