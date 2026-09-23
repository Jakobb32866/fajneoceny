using BackendApi.Domain;
using BackendApi.Services.Admin;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Tests;

/// <summary>
/// Share bans are history, not a flag: many bans per user, every reason kept,
/// rows never overwritten or deleted.
/// </summary>
public class ShareBanTests
{
    private static ShareBan Ban(Guid userId, string reason, int hours, DateTimeOffset start) => new()
    {
        UserId = userId,
        IssuedByAdminId = Guid.NewGuid(),
        Reason = reason,
        Hours = hours,
        StartsAt = start,
        ExpiresAt = start.AddHours(hours),
    };

    [Fact]
    public async Task ActiveBan_IsFoundWhileInForce()
    {
        await using var db = await TestDb.CreateAsync();
        var userId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        await using var ctx = db.ForAdmin();
        ctx.ShareBans.Add(Ban(userId, "spam", 24, now));
        await ctx.SaveChangesAsync();

        var active = await ShareBanQueries.ActiveBanAsync(ctx, userId, now.AddHours(1));
        Assert.NotNull(active);
        Assert.Equal("spam", active!.Reason);
    }

    [Fact]
    public async Task Ban_ExpiresOnItsOwn()
    {
        await using var db = await TestDb.CreateAsync();
        var userId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        await using var ctx = db.ForAdmin();
        ctx.ShareBans.Add(Ban(userId, "spam", 2, now));
        await ctx.SaveChangesAsync();

        Assert.NotNull(await ShareBanQueries.ActiveBanAsync(ctx, userId, now.AddHours(1)));
        Assert.Null(await ShareBanQueries.ActiveBanAsync(ctx, userId, now.AddHours(3)));
    }

    [Fact]
    public async Task LiftingABan_StampsItRatherThanDeletingIt()
    {
        await using var db = await TestDb.CreateAsync();
        var userId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        await using var ctx = db.ForAdmin();
        var ban = Ban(userId, "spam", 48, now);
        ctx.ShareBans.Add(ban);
        await ctx.SaveChangesAsync();

        ban.LiftedAt = now.AddHours(1);
        ban.LiftedByAdminId = Guid.NewGuid();
        await ctx.SaveChangesAsync();

        Assert.Null(await ShareBanQueries.ActiveBanAsync(ctx, userId, now.AddHours(2)));

        // The row survives, with its reason, so the history is intact.
        var stored = await ctx.ShareBans.AsNoTracking().SingleAsync(b => b.UserId == userId);
        Assert.Equal("spam", stored.Reason);
        Assert.NotNull(stored.LiftedAt);
    }

    [Fact]
    public async Task ASecondBan_DoesNotEraseTheFirstsReason()
    {
        await using var db = await TestDb.CreateAsync();
        var userId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        await using var ctx = db.ForAdmin();
        ctx.ShareBans.Add(Ban(userId, "first reason", 1, now.AddDays(-10)));
        ctx.ShareBans.Add(Ban(userId, "second reason", 24, now));
        await ctx.SaveChangesAsync();

        var reasons = await ctx.ShareBans.AsNoTracking()
            .Where(b => b.UserId == userId)
            .Select(b => b.Reason)
            .ToListAsync();

        // This is the difference between a history table and a column: an
        // old ban's reason is still answerable long after it expired.
        Assert.Equal(2, reasons.Count);
        Assert.Contains("first reason", reasons);
        Assert.Contains("second reason", reasons);

        var active = await ShareBanQueries.ActiveBanAsync(ctx, userId, now.AddHours(1));
        Assert.Equal("second reason", active!.Reason);
    }

    [Fact]
    public async Task OverlappingBans_ResolveToTheLatestExpiry()
    {
        await using var db = await TestDb.CreateAsync();
        var userId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        await using var ctx = db.ForAdmin();
        ctx.ShareBans.Add(Ban(userId, "short", 2, now));
        ctx.ShareBans.Add(Ban(userId, "long", 72, now));
        await ctx.SaveChangesAsync();

        var active = await ShareBanQueries.ActiveBanAsync(ctx, userId, now.AddHours(1));
        Assert.Equal("long", active!.Reason);
    }

    [Fact]
    public async Task BansOfOtherUsers_AreNotReturned()
    {
        await using var db = await TestDb.CreateAsync();
        var banned = Guid.NewGuid();
        var innocent = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        await using var ctx = db.ForAdmin();
        ctx.ShareBans.Add(Ban(banned, "spam", 24, now));
        await ctx.SaveChangesAsync();

        Assert.NotNull(await ShareBanQueries.ActiveBanAsync(ctx, banned, now));
        Assert.Null(await ShareBanQueries.ActiveBanAsync(ctx, innocent, now));
    }
}
