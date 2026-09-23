using System.Net;
using System.Net.Http.Json;
using BackendApi.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace BackendApi.Tests;

/// <summary>
/// Guards the student/admin separation at the routing table itself, rather
/// than one endpoint at a time.
///
/// Two failure modes matter, and both are easy to reintroduce later:
///  1. a new /api/admin/* route that forgets its policy — under the default
///     policy that route would demand a STUDENT token, i.e. be unreachable by
///     any admin, or worse be written without any authorization at all;
///  2. the FallbackPolicy in Program.cs locking the genuinely public routes,
///     which would break registration and sign-in for everyone.
///
/// Walking EndpointDataSource keeps this true as endpoints are added.
/// </summary>
public class EndpointPolicyTests(AdminTestFactory factory) : IClassFixture<AdminTestFactory>
{
    /// <summary>The only routes that may be reached without a token.</summary>
    private static readonly HashSet<string> ExpectedPublicRoutes = new(StringComparer.OrdinalIgnoreCase)
    {
        "api/auth/register",
        "api/auth/login",
        "api/auth/google",
        "api/universities/",
        "api/admin/auth/login",
    };

    private IEnumerable<RouteEndpoint> Endpoints() =>
        factory.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>();

    [Fact]
    public void EveryAdminRoute_RequiresAnAdminPolicy()
    {
        var offenders = new List<string>();

        foreach (var endpoint in Endpoints())
        {
            var route = endpoint.RoutePattern.RawText ?? string.Empty;
            if (!route.StartsWith("/api/admin", StringComparison.OrdinalIgnoreCase)) continue;
            if (route.Equals("/api/admin/auth/login", StringComparison.OrdinalIgnoreCase)) continue;

            var policies = endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>()
                .Select(a => a.Policy)
                .Where(p => p is not null)
                .ToList();

            if (!policies.Contains(AuthPolicies.Admin) && !policies.Contains(AuthPolicies.SuperAdmin))
            {
                offenders.Add(route);
            }
        }

        Assert.True(offenders.Count == 0,
            "Admin routes missing an Admin/SuperAdmin policy: " + string.Join(", ", offenders.Distinct()));
    }

    [Fact]
    public void OnlyTheKnownPublicRoutes_AllowAnonymous()
    {
        var anonymous = Endpoints()
            .Where(e => e.Metadata.GetMetadata<IAllowAnonymous>() is not null)
            .Select(e => (e.RoutePattern.RawText ?? string.Empty).TrimStart('/'))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var unexpected = anonymous.Where(r => !ExpectedPublicRoutes.Contains(r)).ToList();
        Assert.True(unexpected.Count == 0, "Unexpectedly public routes: " + string.Join(", ", unexpected));

        // /api/auth/me must NOT be public — it was the casualty of putting
        // AllowAnonymous on the whole auth group.
        Assert.DoesNotContain(anonymous, r => r.Equals("api/auth/me", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ThePublicRoutes_AreActuallyReachableWithoutTheFallbackPolicyLockingThem()
    {
        var anonymous = Endpoints()
            .Where(e => e.Metadata.GetMetadata<IAllowAnonymous>() is not null)
            .Select(e => (e.RoutePattern.RawText ?? string.Empty).TrimStart('/'))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var route in ExpectedPublicRoutes)
        {
            Assert.True(anonymous.Contains(route),
                $"{route} must be AllowAnonymous, otherwise the FallbackPolicy makes it student-only.");
        }
    }

    [Fact]
    public async Task LoginAndRegistration_AnswerWithoutAToken()
    {
        var client = factory.CreateClient();

        // 401 for bad credentials is fine; 404/405 would mean the route is
        // gone. What must not happen is the authorization layer rejecting an
        // anonymous caller before the handler ever runs.
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email = "nobody@example.com", password = "x" });
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);

        var universities = await client.GetAsync("/api/universities/");
        Assert.Equal(HttpStatusCode.OK, universities.StatusCode);
    }

    [Fact]
    public async Task ProtectedRoutes_RejectAnAnonymousCaller()
    {
        var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/subjects")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/admin/me")).StatusCode);
    }
}

/// <summary>
/// Boots the real Program.cs (so the real policies and routing table are
/// under test) against a throwaway SQLite file.
/// </summary>
public class AdminTestFactory : WebApplicationFactory<Program>
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"policy-tests-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(Environments.Development);
        builder.UseSetting("ConnectionStrings:DefaultConnection", $"Data Source={_dbPath}");
        builder.UseSetting("Jwt:Key", "test-only-signing-key-at-least-32-characters-long");
        builder.UseSetting("Jwt:AdminKey", "test-only-admin-signing-key-at-least-32-chars");
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        try { File.Delete(_dbPath); } catch (IOException) { }
    }
}
