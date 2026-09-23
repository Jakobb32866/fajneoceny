using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using BackendApi.Auth;
using BackendApi.Data;
using BackendApi.Domain;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace BackendApi.Tests;

/// <summary>
/// The separation, end to end, with real signed tokens: an admin token is
/// useless on every student route, a student token is useless on every admin
/// route, and — the part that actually matters — a token FORGED with one
/// kind's signing key cannot pass as the other kind, whatever claims it
/// carries.
///
/// Cross-kind tokens answer 401, not 403: each route consults only its own
/// scheme, so a token signed with the other key does not authenticate at all.
/// </summary>
public class CrossTokenRejectionTests(AdminTestFactory factory) : IClassFixture<AdminTestFactory>
{
    private string StudentToken()
    {
        using var scope = factory.Services.CreateScope();
        var jwt = scope.ServiceProvider.GetRequiredService<JwtTokenService>();
        return jwt.IssueToken(new User { Id = Guid.NewGuid(), Email = "s@example.com" });
    }

    private string AdminToken(AdminRole role = AdminRole.Admin) => AdminToken(new Admin
    {
        Id = Guid.NewGuid(), Email = "a@example.com", Role = role,
    });

    private string AdminToken(Admin admin)
    {
        using var scope = factory.Services.CreateScope();
        var tokens = scope.ServiceProvider.GetRequiredService<AdminTokenService>();
        return tokens.IssueToken(admin);
    }

    /// <summary>A real super-admin row, so a forged token for it would get through if forgery worked.</summary>
    private async Task<Admin> SeedSuperAdminAsync()
    {
        var admin = new Admin
        {
            Email = $"super-{Guid.NewGuid():N}@example.com",
            DisplayName = "Super",
            Role = AdminRole.SuperAdmin,
        };

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Admins.Add(admin);
        await db.SaveChangesAsync();
        return admin;
    }

    /// <summary>Hand-signs a token with arbitrary key, audience and claims — what an attacker holding a key would do.</summary>
    private static string Forge(string signingKey, string audience, Guid subject, string actor, string? role = null)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, subject.ToString()),
            new(ClaimTypes.NameIdentifier, subject.ToString()),
            new(AuthClaims.Actor, actor),
        };
        if (role is not null) claims.Add(new Claim(AuthClaims.Role, role));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey));
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            issuer: "fajneoceny",
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256)));
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

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
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

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("/api/admin/universities")]
    [InlineData("/api/admin/admins")]
    [InlineData("/api/admin/stats")]
    public async Task ANormalAdminToken_IsRejectedBySuperAdminRoutes(string route)
    {
        // A valid admin token that authenticates but fails the role claim.
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
    public async Task AGenuineSuperAdminToken_IsAccepted()
    {
        // Positive control for the forgery tests below: the very same admin
        // row IS reachable with a properly issued token, so their 401s come
        // from the signature check and not from something incidental.
        var admin = await SeedSuperAdminAsync();

        var response = await ClientWith(AdminToken(admin)).GetAsync("/api/admin/admins");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData(JwtOptions.AdminAudience)]
    [InlineData("fajneoceny-app")]
    public async Task ASuperAdminTokenForgedWithTheStudentKey_IsRejected(string audience)
    {
        // Whoever signs a token chooses its fo_actor/fo_role claims, so the
        // student key must not be trusted for admin tokens at all — for
        // either audience, and for a real super admin's id.
        var admin = await SeedSuperAdminAsync();
        var forged = Forge(AdminTestFactory.StudentKey, audience, admin.Id,
            AuthClaims.ActorAdmin, nameof(AdminRole.SuperAdmin));

        var response = await ClientWith(forged).GetAsync("/api/admin/admins");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("fajneoceny-app")]
    [InlineData(JwtOptions.AdminAudience)]
    public async Task AStudentTokenForgedWithTheAdminKey_IsRejected(string audience)
    {
        // The mirror image: the admin key must not mint student tokens, or
        // an admin could impersonate any student and read their private data.
        var forged = Forge(AdminTestFactory.AdminKey, audience, Guid.NewGuid(), AuthClaims.ActorStudent);

        var response = await ClientWith(forged).GetAsync("/api/subjects");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task NoToken_IsUnauthorizedEverywhere()
    {
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/subjects")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/stats")).StatusCode);
    }
}
