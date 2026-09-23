using BackendApi.Data;

namespace BackendApi.Services.Admin;

/// <summary>The admin and the university their request acts on, once both have been validated.</summary>
public record AdminScope(Domain.Admin Admin, Guid UniversityId);

public static class AdminScopeResolver
{
    /// <summary>
    /// The standard opening move of every university-scoped admin handler:
    /// confirm the caller is still a live admin (AdminContext re-reads the
    /// row, so revocation is immediate), then resolve which university they
    /// are acting on.
    ///
    /// Returns null on any failure. Callers answer 404 — matching the
    /// community endpoints' convention of not leaking whether a thing exists.
    /// </summary>
    public static async Task<AdminScope?> ResolveAsync(AppDbContext db, AdminContext adminContext, Guid? universityId)
    {
        var admin = await adminContext.GetAsync();
        if (admin is null) return null;

        var resolved = await AdminAuthorization.ResolveUniversityAsync(db, admin, universityId);
        return resolved is null ? null : new AdminScope(admin, resolved.Value);
    }
}
