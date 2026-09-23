using BackendApi.Data;
using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Services.Admin;

/// <summary>
/// Answers "which university does this admin request act on?".
///
/// This is what lets "a super admin can do everything a normal admin can, in
/// any school" be one code path rather than two: every university-scoped
/// admin endpoint resolves its scope here and then works in terms of a plain
/// universityId.
///
/// Shaped after CommunityAuthorization, including its convention of
/// answering null (callers 404) rather than distinguishing "forbidden" from
/// "doesn't exist", so existence is never leaked.
/// </summary>
public static class AdminAuthorization
{
    /// <summary>
    /// The university the request acts on:
    ///  - a normal admin: their own, ignoring any requested id entirely. An
    ///    unassigned admin (UniversityId is null) resolves to null and can
    ///    therefore do nothing, which is the intended 0..1 behaviour.
    ///  - a super admin: the one named by ?universityId=, which must exist.
    ///    Null when none was supplied, so a scoped route can't silently act
    ///    server-wide.
    /// </summary>
    public static async Task<Guid?> ResolveUniversityAsync(AppDbContext db, Domain.Admin admin, Guid? requested)
    {
        if (admin.Role != AdminRole.SuperAdmin)
        {
            // Deliberately ignores `requested`: a normal admin cannot reach
            // another university by guessing its id.
            return admin.UniversityId;
        }

        if (requested is null) return null;

        return await db.Universities.AnyAsync(u => u.Id == requested.Value) ? requested : null;
    }
}
