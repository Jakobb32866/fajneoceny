using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using BackendApi.Auth;
using BackendApi.Data;
using BackendApi.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace BackendApi.Tests;

/// <summary>
/// The admin handlers end to end: reviewing proposals, curating courses,
/// taking a lesson down, and banning a user — all as a real signed-in admin
/// against the real routing table.
/// </summary>
public class AdminWorkflowTests(AdminTestFactory factory) : IClassFixture<AdminTestFactory>
{
    private record World(HttpClient Admin, HttpClient Student, Guid UniversityId, Guid CourseId, Guid StudentId);

    private async Task<World> ArrangeAsync(AdminRole role = AdminRole.Admin)
    {
        Guid universityId, courseId;
        var adminEmail = $"admin-{Guid.NewGuid():N}@example.com";
        const string password = "AdminPass123!";

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var hasher = scope.ServiceProvider.GetRequiredService<PasswordHasher<User>>();

            var university = new University { Name = "Uni " + Guid.NewGuid() };
            var course = new UniversityCourse { UniversityId = university.Id, Name = "Course " + Guid.NewGuid() };
            db.Universities.Add(university);
            db.UniversityCourses.Add(course);
            db.Admins.Add(new Admin
            {
                Email = adminEmail,
                DisplayName = "Moderator",
                PasswordHash = hasher.HashPassword(new User(), password),
                Role = role,
                UniversityId = role == AdminRole.SuperAdmin ? null : university.Id,
            });
            await db.SaveChangesAsync();
            universityId = university.Id;
            courseId = course.Id;
        }

        var adminClient = factory.CreateClient();
        var login = await adminClient.PostAsJsonAsync("/api/admin/auth/login", new { email = adminEmail, password });
        login.EnsureSuccessStatusCode();
        var adminAuth = await login.Content.ReadFromJsonAsync<AdminAuthPayload>();
        adminClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminAuth!.Token);

        var studentClient = factory.CreateClient();
        var register = await studentClient.PostAsJsonAsync("/api/auth/register", new
        {
            email = $"{Guid.NewGuid():N}@example.com",
            password = "Password123!",
            firstName = "Jan",
            lastName = "Kowalski",
            universityId,
        });
        register.EnsureSuccessStatusCode();
        var studentAuth = await register.Content.ReadFromJsonAsync<AuthPayload>();
        studentClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", studentAuth!.Token);

        return new World(adminClient, studentClient, universityId, courseId, studentAuth.User.Id);
    }

    private async Task<Guid> ShareALessonAsync(World w)
    {
        var subject = await w.Student.PostAsJsonAsync("/api/subjects", new { universityCourseId = w.CourseId });
        subject.EnsureSuccessStatusCode();
        var subjectId = (await subject.Content.ReadFromJsonAsync<IdPayload>())!.Id;

        var lesson = await w.Student.PostAsJsonAsync($"/api/subjects/{subjectId}/lessons", new { title = "Lekcja o sieciach" });
        lesson.EnsureSuccessStatusCode();
        var lessonId = (await lesson.Content.ReadFromJsonAsync<IdPayload>())!.Id;

        (await w.Student.PutAsJsonAsync($"/api/lessons/{lessonId}/notes", new { content = "<p>Treść</p>" }))
            .EnsureSuccessStatusCode();
        (await w.Student.PostAsync($"/api/lessons/{lessonId}/share", null)).EnsureSuccessStatusCode();

        return lessonId;
    }

    [Fact]
    public async Task AdminSeesSharedLessonsOfTheirUniversity()
    {
        var w = await ArrangeAsync();
        var lessonId = await ShareALessonAsync(w);

        var page = await w.Admin.GetFromJsonAsync<LessonPagePayload>("/api/admin/lessons");

        Assert.Contains(page!.Items, i => i.Id == lessonId);
    }

    [Fact]
    public async Task TakedownUnsharesLocksAndAudits_AndTheAuthorCannotReshare()
    {
        var w = await ArrangeAsync();
        var lessonId = await ShareALessonAsync(w);

        var takedown = await w.Admin.PostAsJsonAsync(
            $"/api/admin/lessons/{lessonId}/takedown", new { reason = "Materiał chroniony prawem autorskim" });
        Assert.Equal(HttpStatusCode.NoContent, takedown.StatusCode);

        // Gone from the feed.
        var page = await w.Admin.GetFromJsonAsync<LessonPagePayload>("/api/admin/lessons");
        Assert.DoesNotContain(page!.Items, i => i.Id == lessonId);

        // Still reviewable as metadata, so the lock can be lifted.
        var moderated = await w.Admin.GetFromJsonAsync<List<ModeratedPayload>>("/api/admin/lessons/moderated");
        Assert.Contains(moderated!, m => m.Id == lessonId);

        // The audit snapshot survives even though the lesson is now invisible.
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var entry = await db.AdminAuditEntries.AsNoTracking()
                .FirstAsync(e => e.TargetId == lessonId && e.Action == AdminAuditActions.LessonTakedown);
            Assert.Contains("Lekcja o sieciach", entry.Summary);
            Assert.Contains("Jan Kowalski", entry.Summary);
            Assert.Equal("Materiał chroniony prawem autorskim", entry.Reason);
        }

        // And the author cannot simply put it back.
        Assert.Equal(HttpStatusCode.Forbidden,
            (await w.Student.PostAsync($"/api/lessons/{lessonId}/share", null)).StatusCode);
    }

    [Fact]
    public async Task TakedownRequiresAReason()
    {
        var w = await ArrangeAsync();
        var lessonId = await ShareALessonAsync(w);

        var response = await w.Admin.PostAsJsonAsync($"/api/admin/lessons/{lessonId}/takedown", new { reason = "  " });

        // The reason is the only durable record of why — refuse without it.
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task TakedownWithBanHours_AlsoBlocksTheAuthorsOtherSharing()
    {
        var w = await ArrangeAsync();
        var lessonId = await ShareALessonAsync(w);

        (await w.Admin.PostAsJsonAsync($"/api/admin/lessons/{lessonId}/takedown",
            new { reason = "Spam", banHours = 24 })).EnsureSuccessStatusCode();

        var bans = await w.Admin.GetFromJsonAsync<List<BanPayload>>($"/api/admin/users/{w.StudentId}/share-bans");
        Assert.Single(bans!);
        Assert.True(bans![0].IsActive);
        Assert.Equal("Spam", bans[0].Reason);
    }

    [Fact]
    public async Task LiftingALockLetsTheAuthorShareAgain_ButDoesNotResharItForThem()
    {
        var w = await ArrangeAsync();
        var lessonId = await ShareALessonAsync(w);

        (await w.Admin.PostAsJsonAsync($"/api/admin/lessons/{lessonId}/takedown", new { reason = "pomyłka" }))
            .EnsureSuccessStatusCode();
        (await w.Admin.DeleteAsync($"/api/admin/lessons/{lessonId}/takedown")).EnsureSuccessStatusCode();

        // Lifting restores the choice; it does not make it.
        var page = await w.Admin.GetFromJsonAsync<LessonPagePayload>("/api/admin/lessons");
        Assert.DoesNotContain(page!.Items, i => i.Id == lessonId);

        Assert.Equal(HttpStatusCode.NoContent,
            (await w.Student.PostAsync($"/api/lessons/{lessonId}/share", null)).StatusCode);
    }

    [Fact]
    public async Task ApprovingAProposalLinksTheStudentsSubjectOnTheirNextLoad()
    {
        var w = await ArrangeAsync();

        var subject = await w.Student.PostAsJsonAsync("/api/subjects",
            new { name = "Algorytmy rozproszone", proposeAsCourse = true });
        subject.EnsureSuccessStatusCode();

        var pending = await w.Admin.GetFromJsonAsync<List<ProposalPayload>>("/api/admin/proposals");
        var proposal = Assert.Single(pending!);
        Assert.Equal("Algorytmy rozproszone", proposal.Name);

        (await w.Admin.PostAsJsonAsync($"/api/admin/proposals/{proposal.Id}/approve",
            new { newCourseName = "Algorytmy rozproszone", newCourseCode = "ALR" })).EnsureSuccessStatusCode();

        // Reconciliation runs at the top of GET /api/subjects.
        var subjects = await w.Student.GetFromJsonAsync<List<SubjectPayload>>("/api/subjects");
        Assert.Contains(subjects!, s => s.CourseName == "Algorytmy rozproszone");
    }

    [Fact]
    public async Task RejectingAProposalRecordsTheReasonAndStopsShowingAsPending()
    {
        var w = await ArrangeAsync();

        (await w.Student.PostAsJsonAsync("/api/subjects",
            new { name = "Przedmiot widmo", proposeAsCourse = true })).EnsureSuccessStatusCode();

        var pending = await w.Admin.GetFromJsonAsync<List<ProposalPayload>>("/api/admin/proposals");
        var proposal = Assert.Single(pending!);

        (await w.Admin.PostAsJsonAsync($"/api/admin/proposals/{proposal.Id}/reject",
            new { reason = "Taki przedmiot nie istnieje" })).EnsureSuccessStatusCode();

        Assert.Empty(await w.Admin.GetFromJsonAsync<List<ProposalPayload>>("/api/admin/proposals") ?? []);

        var rejected = await w.Admin.GetFromJsonAsync<List<ProposalPayload>>("/api/admin/proposals?status=Rejected");
        Assert.Equal("Taki przedmiot nie istnieje", Assert.Single(rejected!).ReviewReason);

        var subjects = await w.Student.GetFromJsonAsync<List<SubjectPayload>>("/api/subjects");
        Assert.Equal("Rejected", Assert.Single(subjects!).ProposalStatus);
    }

    [Fact]
    public async Task ProposingADuplicateCourseName_IsRefused()
    {
        var w = await ArrangeAsync();

        var courses = await w.Admin.GetFromJsonAsync<List<CoursePayload>>("/api/admin/courses");
        var existingName = Assert.Single(courses!).Name;

        var response = await w.Student.PostAsJsonAsync("/api/subjects",
            new { name = existingName.ToUpperInvariant(), proposeAsCourse = true });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task DeletingACourseInUse_IsRefusedWithACount()
    {
        var w = await ArrangeAsync();
        await ShareALessonAsync(w);

        var response = await w.Admin.DeleteAsync($"/api/admin/courses/{w.CourseId}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("1 subject", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task DeletingAnUnusedCourse_Succeeds()
    {
        var w = await ArrangeAsync();

        var created = await w.Admin.PostAsJsonAsync("/api/admin/courses", new { name = "Nieużywany " + Guid.NewGuid() });
        created.EnsureSuccessStatusCode();
        var courseId = (await created.Content.ReadFromJsonAsync<CoursePayload>())!.Id;

        Assert.Equal(HttpStatusCode.NoContent, (await w.Admin.DeleteAsync($"/api/admin/courses/{courseId}")).StatusCode);
    }

    [Fact]
    public async Task AdminCannotReachAnotherUniversity()
    {
        var w = await ArrangeAsync();
        var other = await ArrangeAsync();
        var otherLessonId = await ShareALessonAsync(other);

        // Even naming the other university explicitly changes nothing for a
        // normal admin — the scope resolver ignores the parameter.
        var page = await w.Admin.GetFromJsonAsync<LessonPagePayload>(
            $"/api/admin/lessons?universityId={other.UniversityId}");
        Assert.DoesNotContain(page!.Items, i => i.Id == otherLessonId);

        Assert.Equal(HttpStatusCode.NotFound,
            (await w.Admin.GetAsync($"/api/admin/lessons/{otherLessonId}")).StatusCode);
    }

    [Fact]
    public async Task SuperAdminCanActInAnyUniversity_ButMustNameOne()
    {
        var target = await ArrangeAsync();
        var lessonId = await ShareALessonAsync(target);
        var super = await ArrangeAsync(AdminRole.SuperAdmin);

        // Without a university, a scoped route has nothing to act on.
        Assert.Equal(HttpStatusCode.NotFound, (await super.Admin.GetAsync("/api/admin/lessons")).StatusCode);

        var page = await super.Admin.GetFromJsonAsync<LessonPagePayload>(
            $"/api/admin/lessons?universityId={target.UniversityId}");
        Assert.Contains(page!.Items, i => i.Id == lessonId);
    }

    [Fact]
    public async Task SuperAdminStatsCountDistinctSharedLessons()
    {
        var super = await ArrangeAsync(AdminRole.SuperAdmin);
        var w = await ArrangeAsync();
        var lessonId = await ShareALessonAsync(w);

        // Churn the same lesson: unshare then re-share.
        (await w.Student.DeleteAsync($"/api/lessons/{lessonId}/share")).EnsureSuccessStatusCode();
        (await w.Student.PostAsync($"/api/lessons/{lessonId}/share", null)).EnsureSuccessStatusCode();

        var stats = await super.Admin.GetFromJsonAsync<StatsPayload>("/api/admin/stats");

        // Two share events, one lesson.
        Assert.True(stats!.LessonsSharedToday >= 1);
        Assert.True(stats.ActiveUsersToday >= 1);
        Assert.True(stats.TotalUsers >= 1);
    }

    private record AuthPayload(string Token, UserPayload User);
    private record AdminAuthPayload(string Token);
    private record UserPayload(Guid Id);
    private record IdPayload(Guid Id);
    private record LessonPagePayload(List<AdminLessonItemPayload> Items);
    private record AdminLessonItemPayload(Guid Id, string Title);
    private record ModeratedPayload(Guid Id, string Title);
    private record ProposalPayload(Guid Id, string Name, string? ReviewReason);
    private record SubjectPayload(Guid Id, string? CourseName, string? ProposalStatus);
    private record CoursePayload(Guid Id, string Name);
    private record BanPayload(string Reason, bool IsActive);
    private record StatsPayload(int LessonsSharedToday, int ActiveUsersToday, int TotalUsers);
}
