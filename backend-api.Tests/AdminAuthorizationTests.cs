using BackendApi.Domain;
using BackendApi.Services.Admin;

namespace BackendApi.Tests;

/// <summary>
/// Scope resolution and revocation: which university an admin request acts
/// on, and whether the caller is still an admin at all.
/// </summary>
public class AdminAuthorizationTests
{
    private static async Task<(Guid uniA, Guid uniB)> SeedUniversitiesAsync(TestDb db)
    {
        var uniA = Guid.NewGuid();
        var uniB = Guid.NewGuid();
        await using var setup = db.ForAdmin();
        setup.Universities.AddRange(
            new University { Id = uniA, Name = "A " + uniA },
            new University { Id = uniB, Name = "B " + uniB });
        await setup.SaveChangesAsync();
        return (uniA, uniB);
    }

    private static async Task<Guid> AddAdminAsync(TestDb db, AdminRole role, Guid? universityId, bool disabled = false)
    {
        await using var setup = db.ForAdmin();
        var admin = new Admin
        {
            Email = $"{Guid.NewGuid()}@e.com",
            DisplayName = "T",
            Role = role,
            UniversityId = universityId,
            DisabledAt = disabled ? DateTimeOffset.UtcNow : null,
        };
        setup.Admins.Add(admin);
        await setup.SaveChangesAsync();
        return admin.Id;
    }

    [Fact]
    public async Task NormalAdmin_ResolvesToTheirOwnUniversity_AndCannotOverrideIt()
    {
        await using var db = await TestDb.CreateAsync();
        var (uniA, uniB) = await SeedUniversitiesAsync(db);
        var adminId = await AddAdminAsync(db, AdminRole.Admin, uniA);

        await using var ctx = db.ForAdmin();
        var admin = await db.AdminContextFor(ctx, adminId).GetAsync();
        Assert.NotNull(admin);

        Assert.Equal(uniA, await AdminAuthorization.ResolveUniversityAsync(ctx, admin!, null));

        // Asking for someone else's university must not grant it.
        Assert.Equal(uniA, await AdminAuthorization.ResolveUniversityAsync(ctx, admin!, uniB));
    }

    [Fact]
    public async Task UnassignedAdmin_ResolvesToNothing()
    {
        await using var db = await TestDb.CreateAsync();
        var (uniA, _) = await SeedUniversitiesAsync(db);
        var adminId = await AddAdminAsync(db, AdminRole.Admin, universityId: null);

        await using var ctx = db.ForAdmin();
        var admin = await db.AdminContextFor(ctx, adminId).GetAsync();

        // The 0-of-0..1 case: an admin with no university can do nothing.
        Assert.Null(await AdminAuthorization.ResolveUniversityAsync(ctx, admin!, null));
        Assert.Null(await AdminAuthorization.ResolveUniversityAsync(ctx, admin!, uniA));
    }

    [Fact]
    public async Task SuperAdmin_MustNameAUniversity_AndItMustExist()
    {
        await using var db = await TestDb.CreateAsync();
        var (uniA, _) = await SeedUniversitiesAsync(db);
        var adminId = await AddAdminAsync(db, AdminRole.SuperAdmin, universityId: null);

        await using var ctx = db.ForAdmin();
        var admin = await db.AdminContextFor(ctx, adminId).GetAsync();

        Assert.Equal(uniA, await AdminAuthorization.ResolveUniversityAsync(ctx, admin!, uniA));

        // No implicit server-wide scope on a university-scoped route.
        Assert.Null(await AdminAuthorization.ResolveUniversityAsync(ctx, admin!, null));
        Assert.Null(await AdminAuthorization.ResolveUniversityAsync(ctx, admin!, Guid.NewGuid()));
    }

    [Fact]
    public async Task DisabledAdmin_ResolvesToNoAdmin()
    {
        await using var db = await TestDb.CreateAsync();
        var (uniA, _) = await SeedUniversitiesAsync(db);
        var adminId = await AddAdminAsync(db, AdminRole.Admin, uniA, disabled: true);

        await using var ctx = db.ForAdmin();

        // A still-valid token must stop working the moment the row is
        // disabled — this is the whole point of re-reading per request.
        Assert.Null(await db.AdminContextFor(ctx, adminId).GetAsync());
    }

    [Fact]
    public async Task DeletedAdmin_ResolvesToNoAdmin()
    {
        await using var db = await TestDb.CreateAsync();
        await SeedUniversitiesAsync(db);

        await using var ctx = db.ForAdmin();
        Assert.Null(await db.AdminContextFor(ctx, Guid.NewGuid()).GetAsync());
    }

    [Fact]
    public async Task DemotedSuperAdmin_LosesSuperAdminResolution()
    {
        await using var db = await TestDb.CreateAsync();
        var (uniA, _) = await SeedUniversitiesAsync(db);
        var adminId = await AddAdminAsync(db, AdminRole.SuperAdmin, null);

        await using (var demote = db.ForAdmin())
        {
            var admin = await demote.Admins.FindAsync(adminId);
            admin!.Role = AdminRole.Admin;
            admin.UniversityId = uniA;
            await demote.SaveChangesAsync();
        }

        await using var ctx = db.ForAdmin();
        var adminContext = db.AdminContextFor(ctx, adminId);

        Assert.NotNull(await adminContext.GetAsync());
        Assert.Null(await adminContext.GetSuperAdminAsync());
    }
}
