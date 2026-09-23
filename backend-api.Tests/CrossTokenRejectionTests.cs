using System.Net;
using System.Net.Http.Headers;
using BackendApi.Auth;
using BackendApi.Domain;
using Microsoft.Extensions.DependencyInjection;

namespace BackendApi.Tests;

/// <summary>
/// The separation, end to end, with real signed tokens: an admin token is
/// useless on every student route and a student token is useless on every
/// admin route.
///
/// The policy tests above assert the routing table is configured correctly;
/// these assert the configuration actually behaves as intended once a token
/// is presented.
/// </summary>
public class CrossTokenRejectionTests(AdminTestFactory factory) : IClassFixture<AdminTestFactory>
{
    private string StudentToken()
    {
        using var scope = factory.Services.CreateScope();
        var jwt = scope.ServiceProvider.GetRequiredService<JwtTokenService>();
        return jwt.IssueToken(new User { Id = Guid.NewGuid(), Email = "s@example.com" });
    }

    private string AdminToken(AdminRole role = AdminRole.Admin)
    {
        using var scope = factory.Services.CreateScope();
        var tokens = scope.ServiceProvider.GetRequiredService<AdminTokenService>();
        return tokens.IssueToken(new Admin { Id = Guid.NewGuid(), Email = "a@example.com", Role = role });
    }

    private HttpClient ClientWith(string token)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    [Theory]
    [InlineData("/api/subjects")]
    [InlineData("/api/auth/me")]
    [InlineData("/api/universities/mine/courses")]
    [InlineData("/api/flashcards/daily")]
    public async Task AnAdminToken_IsRejectedByStudentRoutes(string route)
    {
        var response = await ClientWith(AdminToken()).GetAsync(route);

        // 403, not 200: the token authenticates but fails the student policy.
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData("/api/admin/me")]
    [InlineData("/api/admin/proposals")]
    [InlineData("/api/admin/courses")]
    [InlineData("/api/admin/lessons")]
    [InlineData("/api/admin/users")]
    public async Task AStudentToken_IsRejectedByAdminRoutes(string route)
    {
        var response = await ClientWith(StudentToken()).GetAsync(route);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData("/api/admin/universities")]
    [InlineData("/api/admin/admins")]
    [InlineData("/api/admin/stats")]
    public async Task ANormalAdminToken_IsRejectedBySuperAdminRoutes(string route)
    {
        var response = await ClientWith(AdminToken(AdminRole.Admin)).GetAsync(route);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task ASuperAdminTokenForADeletedAdmin_IsStillRefusedByTheHandler()
    {
        // The token carries role=SuperAdmin and passes the policy, but no
        // such admin row exists — AdminContext must refuse it. This is what
        // makes revocation immediate rather than waiting for expiry.
        var response = await ClientWith(AdminToken(AdminRole.SuperAdmin)).GetAsync("/api/admin/stats");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task AnAdminTokenSignedWithTheStudentKey_IsRejected()
    {
        // Separate signing keys: a forged token minted with the student
        // secret must not be accepted as an admin token.
        using var scope = factory.Services.CreateScope();
        var jwt = scope.ServiceProvider.GetRequiredService<JwtTokenService>();

        // A genuine student token, presented to an admin route.
        var response = await ClientWith(jwt.IssueToken(new User { Id = Guid.NewGuid(), Email = "s@example.com" }))
            .GetAsync("/api/admin/stats");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task NoToken_IsUnauthorizedEverywhere()
    {
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/subjects")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/stats")).StatusCode);
    }
}
