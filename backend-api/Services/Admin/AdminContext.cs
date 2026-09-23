using BackendApi.Auth;
using BackendApi.Data;
using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Services.Admin;

/// <summary>
/// Resolves the calling admin's CURRENT state from the database, once per
/// request.
///
/// The JWT cannot be trusted for authority. Tokens live for hours with no
/// revocation list, so a disabled admin, a demoted super admin, or an admin
/// whose university was reassigned would otherwise keep their old powers
/// until the token expired. Re-reading the row costs one primary-key lookup
/// per admin request — and admin traffic is a rounding error next to student
/// traffic — so correctness wins.
///
/// Returns null when the token's admin no longer exists or has been disabled,
/// which every admin endpoint turns into a 401.
/// </summary>
public sealed class AdminContext(AppDbContext db, ICurrentAdmin currentAdmin)
{
    private Domain.Admin? _cached;
    private bool _loaded;

    public async Task<Domain.Admin?> GetAsync()
    {
        if (_loaded) return _cached;
        _loaded = true;

        var adminId = currentAdmin.AdminId;
        if (adminId == Guid.Empty) return _cached = null;

        var admin = await db.Admins.FirstOrDefaultAsync(a => a.Id == adminId);
        return _cached = admin is { DisabledAt: null } ? admin : null;
    }

    /// <summary>The calling admin, or null if they are not a super admin.</summary>
    public async Task<Domain.Admin?> GetSuperAdminAsync()
    {
        var admin = await GetAsync();
        return admin?.Role == AdminRole.SuperAdmin ? admin : null;
    }
}
