using BackendApi.Domain;
using BackendApi.Services.Admin;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Tests;

/// <summary>
/// The stats counting rule: "lessons shared today" counts DISTINCT lessons,
/// so share/unshare churn can't inflate the number.
///
/// Also pins down that these queries translate to SQL at all — the columns
/// involved are stored as epoch millis precisely because SQLite cannot filter
/// or sort a DateTimeOffset TEXT column.
/// </summary>
public class ShareEventStatsTests
{
    private static ShareEvent Event(Guid lessonId, ShareEventKind kind, DateTimeOffset at) => new()
    {
        LessonId = lessonId,
        UserId = Guid.NewGuid(),
        Kind = kind,
        CreatedAt = at,
    };

    /// <summary>The production counting expression, kept identical to AdminSuperEndpoints.</summary>
    private static Task<int> CountSharedSinceAsync(Data.AppDbContext db, DateTimeOffset since) =>
        db.ShareEvents.AsNoTracking()
            .Where(e => e.Kind == ShareEventKind.Shared && e.CreatedAt >= since)
            .Select(e => e.LessonId)
            .Distinct()
            .CountAsync();

    [Fact]
    public async Task ALessonSharedUnsharedAndResharedInOneDay_CountsOnce()
    {
        await using var db = await TestDb.CreateAsync();
        var now = DateTimeOffset.UtcNow;
        var startOfDay = StatsClock.StartOfToday(now);
        var lessonId = Guid.NewGuid();

        await using var ctx = db.ForAdmin();
        ctx.ShareEvents.AddRange(
            Event(lessonId, ShareEventKind.Shared, startOfDay.AddHours(1)),
            Event(lessonId, ShareEventKind.Unshared, startOfDay.AddHours(2)),
            Event(lessonId, ShareEventKind.Shared, startOfDay.AddHours(3)));
        await ctx.SaveChangesAsync();

        Assert.Equal(1, await CountSharedSinceAsync(ctx, startOfDay));
    }

    [Fact]
    public async Task DistinctLessonsAreCountedSeparately()
    {
        await using var db = await TestDb.CreateAsync();
        var now = DateTimeOffset.UtcNow;
        var startOfDay = StatsClock.StartOfToday(now);

        await using var ctx = db.ForAdmin();
        ctx.ShareEvents.AddRange(
            Event(Guid.NewGuid(), ShareEventKind.Shared, startOfDay.AddHours(1)),
            Event(Guid.NewGuid(), ShareEventKind.Shared, startOfDay.AddHours(2)));
        await ctx.SaveChangesAsync();

        Assert.Equal(2, await CountSharedSinceAsync(ctx, startOfDay));
    }

    [Fact]
    public async Task UnshareEventsAreNotCountedAsShares()
    {
        await using var db = await TestDb.CreateAsync();
        var startOfDay = StatsClock.StartOfToday(DateTimeOffset.UtcNow);

        await using var ctx = db.ForAdmin();
        ctx.ShareEvents.Add(Event(Guid.NewGuid(), ShareEventKind.Unshared, startOfDay.AddHours(1)));
        await ctx.SaveChangesAsync();

        Assert.Equal(0, await CountSharedSinceAsync(ctx, startOfDay));
    }

    [Fact]
    public async Task EventsBeforeTheWindowAreExcluded()
    {
        await using var db = await TestDb.CreateAsync();
        var now = DateTimeOffset.UtcNow;
        var startOfDay = StatsClock.StartOfToday(now);

        await using var ctx = db.ForAdmin();
        ctx.ShareEvents.AddRange(
            Event(Guid.NewGuid(), ShareEventKind.Shared, startOfDay.AddMinutes(-1)),
            Event(Guid.NewGuid(), ShareEventKind.Shared, startOfDay.AddMinutes(1)));
        await ctx.SaveChangesAsync();

        Assert.Equal(1, await CountSharedSinceAsync(ctx, startOfDay));
        Assert.Equal(2, await CountSharedSinceAsync(ctx, StatsClock.StartOfDaysAgo(now, 6)));
    }

    [Fact]
    public async Task LessonCreatedAt_IsFilterableInSql()
    {
        // Guards the AppDbContext value converter: without it EF throws
        // "The LINQ expression could not be translated" here, and the
        // lessons-created stat is impossible.
        await using var db = await TestDb.CreateAsync();
        var ownerId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        await using (var owner = db.For(ownerId))
        {
            owner.Users.Add(new User { Id = ownerId, Email = $"{ownerId}@e.com" });
            var subject = new Subject { Name = "S" };
            owner.Subjects.Add(subject);
            await owner.SaveChangesAsync();

            owner.Lessons.AddRange(
                new Lesson { SubjectId = subject.Id, Title = "old", CreatedAt = now.AddDays(-30) },
                new Lesson { SubjectId = subject.Id, Title = "new", CreatedAt = now });
            await owner.SaveChangesAsync();
        }

        await using var ctx = db.ForAdmin();
        var since = StatsClock.StartOfDaysAgo(now, 6);
        var recent = await ctx.Lessons.IgnoreQueryFilters().CountAsync(l => l.CreatedAt >= since);

        Assert.Equal(1, recent);
    }

    [Fact]
    public void StartOfToday_IsAWarsawDayBoundary()
    {
        // 00:30 in Warsaw belongs to that Warsaw day, not the previous UTC one.
        var warsaw = TimeZoneInfo.FindSystemTimeZoneById("Europe/Warsaw");
        var localJustAfterMidnight = new DateTimeOffset(2026, 7, 1, 0, 30, 0, warsaw.GetUtcOffset(new DateTime(2026, 7, 1)));

        var start = StatsClock.StartOfToday(localJustAfterMidnight);

        Assert.True(start <= localJustAfterMidnight);
        Assert.True(localJustAfterMidnight - start < TimeSpan.FromHours(1));
    }
}
