using BackendApi.Data;
using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Services.Admin;

/// <summary>
/// The single definition of "is this user banned from sharing right now?".
///
/// ShareBan is history — many rows per user, never overwritten — so the
/// current state is a query, not a column. Routing every caller through here
/// keeps the share endpoint, the lesson DTO and the admin user list from
/// disagreeing about whether someone is banned.
/// </summary>
public static class ShareBanQueries
{
    /// <summary>The ban currently in force for a user, or null. Latest-expiring wins when several overlap.</summary>
    public static async Task<ShareBan?> ActiveBanAsync(AppDbContext db, Guid userId, DateTimeOffset now)
    {
        return await ActiveBans(db, now)
            .Where(b => b.UserId == userId)
            .OrderByDescending(b => b.ExpiresAt)
            .FirstOrDefaultAsync();
    }

    /// <summary>All bans in force, for batch lookups (e.g. the admin user list).</summary>
    public static IQueryable<ShareBan> ActiveBans(AppDbContext db, DateTimeOffset now) =>
        db.ShareBans.AsNoTracking().Where(b => b.LiftedAt == null && b.ExpiresAt > now);
}
