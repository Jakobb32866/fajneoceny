using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using BackendApi.Data;
using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BackendApi.Tests;

/// <summary>
/// The enforcement that makes moderation bite, driven through the real HTTP
/// endpoint: a moderation lock and an active share ban must both stop a
/// re-share. Without these, a takedown is a suggestion — the author could
/// simply toggle sharing back on.
/// </summary>
public class ShareEnforcementTests(AdminTestFactory factory) : IClassFixture<AdminTestFactory>
{
    private record Fixture(HttpClient Client, Guid UserId, Guid LessonId);

    /// <summary>Registers a student on a seeded course and gives them one shareable lesson.</summary>
    private async Task<Fixture> ArrangeSharableLessonAsync()
    {
        var client = factory.CreateClient();
        var email = $"{Guid.NewGuid():N}@example.com";

        Guid universityId, courseId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var university = new University { Name = "Uni " + Guid.NewGuid() };
            var course = new UniversityCourse { UniversityId = university.Id, Name = "Course " + Guid.NewGuid() };
            db.Universities.Add(university);
            db.UniversityCourses.Add(course);
            await db.SaveChangesAsync();
            universityId = university.Id;
            courseId = course.Id;
        }

        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "Password123!",
            firstName = "Test",
            lastName = "Student",
            universityId,
        });
        register.EnsureSuccessStatusCode();

        var auth = await register.Content.ReadFromJsonAsync<AuthPayload>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.Token);

        var subject = await client.PostAsJsonAsync("/api/subjects", new { universityCourseId = courseId });
        subject.EnsureSuccessStatusCode();
        var subjectId = (await subject.Content.ReadFromJsonAsync<IdPayload>())!.Id;

        var lesson = await client.PostAsJsonAsync($"/api/subjects/{subjectId}/lessons", new { title = "Lekcja" });
        lesson.EnsureSuccessStatusCode();
        var lessonId = (await lesson.Content.ReadFromJsonAsync<IdPayload>())!.Id;

        // A lesson needs content before it may be shared.
        var note = await client.PutAsJsonAsync($"/api/lessons/{lessonId}/notes", new { content = "<p>Treść notatki</p>" });
        note.EnsureSuccessStatusCode();

        return new Fixture(client, auth.User.Id, lessonId);
    }

    private async Task MutateAsync(Func<AppDbContext, Task> mutate)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await mutate(db);
    }

    [Fact]
    public async Task ASharableLesson_CanBeSharedAndLogsAShareEvent()
    {
        var f = await ArrangeSharableLessonAsync();

        var response = await f.Client.PostAsync($"/api/lessons/{f.LessonId}/share", null);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        await MutateAsync(async db =>
        {
            var events = await db.ShareEvents.AsNoTracking()
                .Where(e => e.LessonId == f.LessonId && e.Kind == ShareEventKind.Shared)
                .CountAsync();
            Assert.Equal(1, events);
        });
    }

    [Fact]
    public async Task AModerationLockedLesson_CannotBeReshared()
    {
        var f = await ArrangeSharableLessonAsync();
        (await f.Client.PostAsync($"/api/lessons/{f.LessonId}/share", null)).EnsureSuccessStatusCode();

        // Simulate the takedown.
        await MutateAsync(async db =>
        {
            var lesson = await db.Lessons.IgnoreQueryFilters().FirstAsync(l => l.Id == f.LessonId);
            lesson.IsShared = false;
            lesson.ModerationLockedAt = DateTimeOffset.UtcNow;
            lesson.ModerationLockReason = "Narusza regulamin";
            await db.SaveChangesAsync();
        });

        var response = await f.Client.PostAsync($"/api/lessons/{f.LessonId}/share", null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Contains("Narusza regulamin", await response.Content.ReadAsStringAsync());

        await MutateAsync(async db =>
        {
            var lesson = await db.Lessons.IgnoreQueryFilters().AsNoTracking().FirstAsync(l => l.Id == f.LessonId);
            Assert.False(lesson.IsShared);
        });
    }

    [Fact]
    public async Task LiftingTheLock_RestoresTheAbilityToShare()
    {
        var f = await ArrangeSharableLessonAsync();

        await MutateAsync(async db =>
        {
            var lesson = await db.Lessons.IgnoreQueryFilters().FirstAsync(l => l.Id == f.LessonId);
            lesson.ModerationLockedAt = DateTimeOffset.UtcNow;
            lesson.ModerationLockReason = "spam";
            await db.SaveChangesAsync();
        });

        Assert.Equal(HttpStatusCode.Forbidden,
            (await f.Client.PostAsync($"/api/lessons/{f.LessonId}/share", null)).StatusCode);

        await MutateAsync(async db =>
        {
            var lesson = await db.Lessons.IgnoreQueryFilters().FirstAsync(l => l.Id == f.LessonId);
            lesson.ModerationLockedAt = null;
            lesson.ModerationLockReason = null;
            await db.SaveChangesAsync();
        });

        Assert.Equal(HttpStatusCode.NoContent,
            (await f.Client.PostAsync($"/api/lessons/{f.LessonId}/share", null)).StatusCode);
    }

    [Fact]
    public async Task ABannedUser_CannotShare_AndTheBanExpiresOnItsOwn()
    {
        var f = await ArrangeSharableLessonAsync();
        var now = DateTimeOffset.UtcNow;

        await MutateAsync(async db =>
        {
            db.ShareBans.Add(new ShareBan
            {
                UserId = f.UserId,
                IssuedByAdminId = Guid.NewGuid(),
                Reason = "Spam w społeczności",
                Hours = 24,
                StartsAt = now,
                ExpiresAt = now.AddHours(24),
            });
            await db.SaveChangesAsync();
        });

        var blocked = await f.Client.PostAsync($"/api/lessons/{f.LessonId}/share", null);
        Assert.Equal(HttpStatusCode.Forbidden, blocked.StatusCode);
        Assert.Contains("Spam w społeczności", await blocked.Content.ReadAsStringAsync());

        // Expire it by moving the window into the past, rather than waiting.
        await MutateAsync(async db =>
        {
            var ban = await db.ShareBans.FirstAsync(b => b.UserId == f.UserId);
            ban.StartsAt = now.AddHours(-48);
            ban.ExpiresAt = now.AddHours(-24);
            await db.SaveChangesAsync();
        });

        Assert.Equal(HttpStatusCode.NoContent,
            (await f.Client.PostAsync($"/api/lessons/{f.LessonId}/share", null)).StatusCode);
    }

    [Fact]
    public async Task LiftingABanEarly_RestoresSharing()
    {
        var f = await ArrangeSharableLessonAsync();
        var now = DateTimeOffset.UtcNow;

        await MutateAsync(async db =>
        {
            db.ShareBans.Add(new ShareBan
            {
                UserId = f.UserId,
                IssuedByAdminId = Guid.NewGuid(),
                Reason = "spam",
                Hours = 72,
                StartsAt = now,
                ExpiresAt = now.AddHours(72),
            });
            await db.SaveChangesAsync();
        });

        Assert.Equal(HttpStatusCode.Forbidden,
            (await f.Client.PostAsync($"/api/lessons/{f.LessonId}/share", null)).StatusCode);

        await MutateAsync(async db =>
        {
            var ban = await db.ShareBans.FirstAsync(b => b.UserId == f.UserId);
            ban.LiftedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
        });

        Assert.Equal(HttpStatusCode.NoContent,
            (await f.Client.PostAsync($"/api/lessons/{f.LessonId}/share", null)).StatusCode);
    }

    [Fact]
    public async Task UnsharingLogsAnUnshareEvent()
    {
        var f = await ArrangeSharableLessonAsync();
        (await f.Client.PostAsync($"/api/lessons/{f.LessonId}/share", null)).EnsureSuccessStatusCode();

        var response = await f.Client.DeleteAsync($"/api/lessons/{f.LessonId}/share");
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        await MutateAsync(async db =>
        {
            var unshares = await db.ShareEvents.AsNoTracking()
                .CountAsync(e => e.LessonId == f.LessonId && e.Kind == ShareEventKind.Unshared);
            Assert.Equal(1, unshares);
        });
    }

    private record AuthPayload(string Token, UserPayload User);
    private record UserPayload(Guid Id);
    private record IdPayload(Guid Id);
}
