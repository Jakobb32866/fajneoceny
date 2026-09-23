using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Data;

/// <summary>
/// Bootstraps the single super-admin account from configuration, on startup.
///
/// Config carries the email and a PASSWORD HASH, never a plaintext password:
/// generate the hash locally with `dotnet run -- hash-password` and put only
/// the hash in the environment. A leaked .env therefore does not hand anyone
/// a usable credential, and the deployment stays reproducible.
///
/// Idempotent: creates the row on first boot, and afterwards keeps the stored
/// hash and role in sync with config so rotating the secret is a restart.
/// Absent configuration is not an error — the app must still boot for local
/// development, matching how GoogleTokenVerifier degrades without client ids.
/// </summary>
public static class SuperAdminSeeder
{
    public static async Task RunAsync(AppDbContext db, IConfiguration configuration, ILogger logger)
    {
        var email = configuration["SuperAdmin:Email"]?.Trim().ToLowerInvariant();
        var passwordHash = configuration["SuperAdmin:PasswordHash"]?.Trim();

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(passwordHash))
        {
            logger.LogWarning(
                "SuperAdmin:Email / SuperAdmin:PasswordHash are not configured — no super-admin account exists. " +
                "Generate a hash with `dotnet run -- hash-password <password>` and set both before deploying.");
            return;
        }

        var existing = await db.Admins.FirstOrDefaultAsync(a => a.Email == email);

        if (existing is null)
        {
            // Demote any previous super admin first: the invariant is exactly
            // one, and changing SuperAdmin:Email should move the role rather
            // than quietly leaving two.
            await DemoteOtherSuperAdminsAsync(db, exceptEmail: email, logger);

            db.Admins.Add(new Admin
            {
                Email = email,
                PasswordHash = passwordHash,
                DisplayName = "Super Admin",
                Role = AdminRole.SuperAdmin,
                UniversityId = null,
            });

            await db.SaveChangesAsync();
            logger.LogInformation("Created super-admin account for {Email}.", email);
            return;
        }

        await DemoteOtherSuperAdminsAsync(db, exceptEmail: email, logger);

        existing.PasswordHash = passwordHash;
        existing.Role = AdminRole.SuperAdmin;
        existing.UniversityId = null;

        // Configuration is the source of truth for this account, so a
        // super admin can never lock themselves out by disabling it.
        existing.DisabledAt = null;

        await db.SaveChangesAsync();
    }

    private static async Task DemoteOtherSuperAdminsAsync(AppDbContext db, string exceptEmail, ILogger logger)
    {
        var others = await db.Admins
            .Where(a => a.Role == AdminRole.SuperAdmin && a.Email != exceptEmail)
            .ToListAsync();

        foreach (var other in others)
        {
            other.Role = AdminRole.Admin;
            logger.LogWarning(
                "Demoted former super admin {Email} to Admin: SuperAdmin:Email now points at a different account.",
                other.Email);
        }
    }
}
