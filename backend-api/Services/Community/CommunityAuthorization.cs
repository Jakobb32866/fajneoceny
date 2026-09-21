using BackendApi.Data;
using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Services.Community;

/// <summary>
/// Eligibility checks shared by the community endpoints: is this user
/// "recognised" (has a university set), and can they reach a given course.
/// </summary>
public static class CommunityAuthorization
{
    /// <summary>Returns the user's university, or null if they haven't set one ("not recognised" for community features).</summary>
    public static async Task<University?> GetUniversityAsync(AppDbContext db, Guid userId)
    {
        var universityId = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => u.UniversityId)
            .FirstOrDefaultAsync();

        if (universityId is null) return null;

        return await db.Universities.FirstOrDefaultAsync(u => u.Id == universityId);
    }

    /// <summary>True iff the course exists and belongs to the user's own university.</summary>
    public static async Task<bool> CanAccessCourseAsync(AppDbContext db, Guid userId, Guid courseId)
    {
        var universityId = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => u.UniversityId)
            .FirstOrDefaultAsync();

        if (universityId is null) return false;

        return await db.UniversityCourses.AnyAsync(c => c.Id == courseId && c.UniversityId == universityId);
    }
}
