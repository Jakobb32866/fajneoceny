using BackendApi.Auth;
using BackendApi.Data;
using BackendApi.Domain;
using Google.Apis.Auth;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Endpoints;

public record RegisterRequest(string Email, string Password, string FirstName, string LastName, string SchoolName);
public record LoginRequest(string Email, string Password);
public record GoogleAuthRequest(string IdToken, string? SchoolName);
public record UserDto(Guid Id, string Email, string FirstName, string LastName, string SchoolName);
public record AuthResponse(string Token, UserDto User);

public static class AuthEndpoints
{
    private static UserDto ToDto(this User user) => new(user.Id, user.Email, user.FirstName, user.LastName, user.SchoolName);

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
                || string.IsNullOrWhiteSpace(request.FirstName) || string.IsNullOrWhiteSpace(request.LastName)
                || string.IsNullOrWhiteSpace(request.SchoolName))
            {
                return Results.BadRequest("Email, password, first name, last name and school name are required.");
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
                SchoolName = request.SchoolName.Trim(),
            };
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
            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
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

            var email = profile.Email.Trim().ToLowerInvariant();
            var user = await db.Users.FirstOrDefaultAsync(u => u.GoogleSubjectId == profile.Subject);

            if (user is null)
            {
                // Link an existing password-based account with the same email.
                user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
                if (user is not null)
                {
                    user.GoogleSubjectId = profile.Subject;
                }
            }

            if (user is null)
            {
                user = new User
                {
                    GoogleSubjectId = profile.Subject,
                    Email = email,
                    FirstName = profile.GivenName ?? string.Empty,
                    LastName = profile.FamilyName ?? string.Empty,
                    SchoolName = request.SchoolName ?? string.Empty,
                };
                db.Users.Add(user);
            }

            await db.SaveChangesAsync();

            var token = jwt.IssueToken(user);
            return Results.Ok(new AuthResponse(token, user.ToDto()));
        });

        group.MapGet("/me", async (ICurrentUser currentUser, AppDbContext db) =>
        {
            var user = await db.Users.FindAsync(currentUser.UserId);
            return user is null ? Results.NotFound() : Results.Ok(user.ToDto());
        }).RequireAuthorization();
    }
}
