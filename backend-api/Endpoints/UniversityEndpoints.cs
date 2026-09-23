using BackendApi.Auth;
using BackendApi.Data;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Endpoints;

public record UniversityDto(Guid Id, string Name, string? ShortName);
public record UniversityCourseDto(Guid Id, string? Code, string Name);

public static class UniversityEndpoints
{
    public static void MapUniversityEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/universities").WithTags("Universities");

        // Anonymous: used by the registration screen before the user is signed
        // in. The opt-out is explicit because Program.cs sets a FallbackPolicy,
        // under which a route with no authorization metadata is student-only.
        group.MapGet("/", async (AppDbContext db) =>
        {
            var universities = await db.Universities
                .Where(u => !u.IsArchived)
                .OrderBy(u => u.Name)
                .Select(u => new UniversityDto(u.Id, u.Name, u.ShortName))
                .ToListAsync();
            return Results.Ok(universities);
        }).AllowAnonymous();

        group.MapGet("/mine/courses", async (ICurrentUser currentUser, AppDbContext db) =>
        {
            var universityId = await db.Users
                .Where(u => u.Id == currentUser.UserId)
                .Select(u => u.UniversityId)
                .FirstOrDefaultAsync();

            if (universityId is null) return Results.Ok(new List<UniversityCourseDto>());

            var courses = await db.UniversityCourses
                .Where(c => c.UniversityId == universityId && !c.IsArchived)
                .OrderBy(c => c.Name)
                .Select(c => new UniversityCourseDto(c.Id, c.Code, c.Name))
                .ToListAsync();
            return Results.Ok(courses);
        }).RequireAuthorization();
    }
}
