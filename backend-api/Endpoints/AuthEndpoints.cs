using BackendApi.Auth;
using BackendApi.Data;
using BackendApi.Domain;
using Google.Apis.Auth;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Endpoints;

public record RegisterRequest(string Email, string Password, string FirstName, string LastName, string? SchoolName, Guid? UniversityId);
public record LoginRequest(string Email, string Password);
public record GoogleAuthRequest(string IdToken, string? SchoolName, Guid? UniversityId);
public record UserDto(Guid Id, string Email, string FirstName, string LastName, string SchoolName, Guid? UniversityId, string? UniversityName, bool IsRecognised);
public record AuthResponse(string Token, UserDto User);

public static class AuthEndpoints
{
    /// <summary>
    /// Projects a User to its DTO. Relies on the University navigation being
    /// loaded (via Include, or assigned in-memory on a freshly created user)
    /// so this stays synchronous and reusable across endpoints/files.
    /// </summary>
    internal static UserDto ToDto(this User user) => new(
        user.Id, user.Email, user.FirstName, user.LastName, user.SchoolName,
        user.UniversityId, user.University?.Name, user.UniversityId != null);

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        group.MapPost("/register", async (
            RegisterRequest request,
            AppDbContext db,
            PasswordHasher<User> hasher,
            JwtTokenService jwt) =>
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password)
                || string.IsNullOrWhiteSpace(request.FirstName) || string.IsNullOrWhiteSpace(request.LastName))
            {
                return Results.BadRequest("Email, password, first name and last name are required.");
            }

            var hasUniversityId = request.UniversityId.HasValue;
            var hasSchoolName = !string.IsNullOrWhiteSpace(request.SchoolName);
            if (hasUniversityId == hasSchoolName)
            {
                return Results.BadRequest("Provide exactly one of university or school name.");
            }

            University? university = null;
            if (hasUniversityId)
            {
                university = await db.Universities.FirstOrDefaultAsync(u => u.Id == request.UniversityId!.Value);
                if (university is null) return Results.BadRequest("Unknown university.");
            }

            var email = request.Email.Trim().ToLowerInvariant();
            if (await db.Users.AnyAsync(u => u.Email == email))
            {
                return Results.Conflict("An account with this email already exists.");
            }

            var user = new User
            {
                Email = email,
                FirstName = request.FirstName.Trim(),
                LastName = request.LastName.Trim(),
            };

            if (university is not null)
            {
                user.UniversityId = university.Id;
                user.University = university;
                user.SchoolName = university.Name;
            }
            else
            {
                user.SchoolName = request.SchoolName!.Trim();
            }

            user.PasswordHash = hasher.HashPassword(user, request.Password);

            db.Users.Add(user);
            await db.SaveChangesAsync();

            var token = jwt.IssueToken(user);
            return Results.Created($"/api/auth/me", new AuthResponse(token, user.ToDto()));
        });

        group.MapPost("/login", async (
            LoginRequest request,
            AppDbContext db,
            PasswordHasher<User> hasher,
            JwtTokenService jwt) =>
        {
            var email = request.Email.Trim().ToLowerInvariant();
            var user = await db.Users.Include(u => u.University).FirstOrDefaultAsync(u => u.Email == email);
            if (user is null || user.PasswordHash is null)
            {
                return Results.Unauthorized();
            }

            var result = hasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
            if (result is not (PasswordVerificationResult.Success or PasswordVerificationResult.SuccessRehashNeeded))
            {
                return Results.Unauthorized();
            }

            var token = jwt.IssueToken(user);
            return Results.Ok(new AuthResponse(token, user.ToDto()));
        });

        group.MapPost("/google", async (
            GoogleAuthRequest request,
            AppDbContext db,
            GoogleTokenVerifier verifier,
            JwtTokenService jwt) =>
        {
            GoogleProfile profile;
            try
            {
                profile = await verifier.VerifyAsync(request.IdToken);
            }
            catch (InvalidJwtException)
            {
                return Results.Unauthorized();
            }

            var hasUniversityId = request.UniversityId.HasValue;
            var hasSchoolName = !string.IsNullOrWhiteSpace(request.SchoolName);
            if (hasUniversityId && hasSchoolName)
            {
                return Results.BadRequest("Provide either a university or a school name, not both.");
            }

            University? university = null;
            if (hasUniversityId)
            {
                university = await db.Universities.FirstOrDefaultAsync(u => u.Id == request.UniversityId!.Value);
                if (university is null) return Results.BadRequest("Unknown university.");
            }

            var email = profile.Email.Trim().ToLowerInvariant();
            var user = await db.Users.Include(u => u.University).FirstOrDefaultAsync(u => u.GoogleSubjectId == profile.Subject);

            if (user is null)
            {
                // Link an existing password-based account with the same email.
                user = await db.Users.Include(u => u.University).FirstOrDefaultAsync(u => u.Email == email);
                if (user is not null)
                {
                    user.GoogleSubjectId = profile.Subject;
                }
            }

            var isNewUser = user is null;
            if (isNewUser)
            {
                user = new User
                {
                    GoogleSubjectId = profile.Subject,
                    Email = email,
                    FirstName = profile.GivenName ?? string.Empty,
                    LastName = profile.FamilyName ?? string.Empty,
                };
                db.Users.Add(user);
            }

            // Set the university/school on a brand-new user, and also on an
            // existing user who has never set one (today this branch only
            // ran for new users). Never overwrite a choice already made —
            // the university is permanent (see PUT /api/settings/university).
            var shouldSetSchool = isNewUser || (user!.UniversityId is null && string.IsNullOrWhiteSpace(user.SchoolName));
            if (shouldSetSchool)
            {
                if (university is not null)
                {
                    user!.UniversityId = university.Id;
                    user.University = university;
                    user.SchoolName = university.Name;
                }
                else if (hasSchoolName)
                {
                    user!.SchoolName = request.SchoolName!.Trim();
                }
                // If neither was supplied, leave both empty (for a new user) or
                // untouched (for an existing schoolless user) — the client will
                // re-call once it has collected the school/university info.
            }

            await db.SaveChangesAsync();

            var token = jwt.IssueToken(user!);
            return Results.Ok(new AuthResponse(token, user!.ToDto()));
        });

        group.MapGet("/me", async (ICurrentUser currentUser, AppDbContext db) =>
        {
            var user = await db.Users.Include(u => u.University).FirstOrDefaultAsync(u => u.Id == currentUser.UserId);
            return user is null ? Results.NotFound() : Results.Ok(user.ToDto());
        }).RequireAuthorization();
    }
}
