using BackendApi.Auth;
using BackendApi.Data;
using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Endpoints;

public record SetUniversityRequest(Guid UniversityId);

/// <summary>Full set of user-tunable spaced-repetition settings. Used for both GET response and PUT request.</summary>
public record SrsSettingsDto(
    int DailySessionSize,
    int NewCardsPerDay,
    string LearningStepsMinutes,
    string RelearningStepsMinutes,
    int GraduatingIntervalDays,
    int EasyIntervalDays,
    double StartingEase,
    double EasyBonus,
    double HardMultiplier,
    double LapseNewIntervalMultiplier,
    int MinimumIntervalDays,
    int MaximumIntervalDays,
    string Timezone,
    int DayRolloverHour);

public static class SettingsEndpoints
{
    public static void MapSettingsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/settings").WithTags("Settings").RequireAuthorization();

        group.MapGet("/srs", async (AppDbContext db) =>
        {
            var settings = await GetOrCreateAsync(db);
            return Results.Ok(ToDto(settings));
        });

        group.MapPut("/srs", async (SrsSettingsDto dto, AppDbContext db) =>
        {
            if (Validate(dto) is { } error) return Results.BadRequest(error);

            var settings = await GetOrCreateAsync(db);
            Apply(settings, dto);
            await db.SaveChangesAsync();
            return Results.Ok(ToDto(settings));
        });

        // University choice is permanent: once set, it can't be changed here.
        group.MapPut("/university", async (SetUniversityRequest request, ICurrentUser currentUser, AppDbContext db) =>
        {
            var user = await db.Users.Include(u => u.University).FirstOrDefaultAsync(u => u.Id == currentUser.UserId);
            if (user is null) return Results.NotFound();

            if (user.UniversityId is not null)
            {
                return Results.Conflict("University is already set and cannot be changed.");
            }

            var university = await db.Universities.FirstOrDefaultAsync(u => u.Id == request.UniversityId);
            if (university is null) return Results.BadRequest("Unknown university.");

            user.UniversityId = university.Id;
            user.University = university;
            user.SchoolName = university.Name;
            await db.SaveChangesAsync();

            return Results.Ok(user.ToDto());
        });
    }

    /// <summary>Loads the current user's settings row, creating it with defaults on first access.</summary>
    public static async Task<UserSrsSettings> GetOrCreateAsync(AppDbContext db)
    {
        var settings = await db.UserSrsSettings.FirstOrDefaultAsync();
        if (settings is null)
        {
            settings = new UserSrsSettings();
            db.UserSrsSettings.Add(settings);
            await db.SaveChangesAsync();
        }
        return settings;
    }

    private static SrsSettingsDto ToDto(UserSrsSettings s) => new(
        s.DailySessionSize, s.NewCardsPerDay, s.LearningStepsMinutes, s.RelearningStepsMinutes,
        s.GraduatingIntervalDays, s.EasyIntervalDays, s.StartingEase, s.EasyBonus, s.HardMultiplier,
        s.LapseNewIntervalMultiplier, s.MinimumIntervalDays, s.MaximumIntervalDays, s.Timezone, s.DayRolloverHour);

    private static void Apply(UserSrsSettings s, SrsSettingsDto dto)
    {
        s.DailySessionSize = dto.DailySessionSize;
        s.NewCardsPerDay = dto.NewCardsPerDay;
        s.LearningStepsMinutes = NormalizeSteps(dto.LearningStepsMinutes);
        s.RelearningStepsMinutes = NormalizeSteps(dto.RelearningStepsMinutes);
        s.GraduatingIntervalDays = dto.GraduatingIntervalDays;
        s.EasyIntervalDays = dto.EasyIntervalDays;
        s.StartingEase = dto.StartingEase;
        s.EasyBonus = dto.EasyBonus;
        s.HardMultiplier = dto.HardMultiplier;
        s.LapseNewIntervalMultiplier = dto.LapseNewIntervalMultiplier;
        s.MinimumIntervalDays = dto.MinimumIntervalDays;
        s.MaximumIntervalDays = dto.MaximumIntervalDays;
        s.Timezone = dto.Timezone;
        s.DayRolloverHour = dto.DayRolloverHour;
    }

    private static string NormalizeSteps(string csv) => string.Join(",", UserSrsSettings.ParseSteps(csv));

    /// <summary>Returns an error message if the payload is invalid, or null if it's good.</summary>
    private static string? Validate(SrsSettingsDto d)
    {
        if (d.DailySessionSize is < 1 or > 500) return "Rozmiar sesji musi być między 1 a 500.";
        if (d.NewCardsPerDay is < 0 or > 1000) return "Liczba nowych fiszek dziennie musi być między 0 a 1000.";
        if (UserSrsSettings.ParseSteps(d.LearningStepsMinutes).Length == 0) return "Kroki nauki muszą zawierać co najmniej jedną dodatnią liczbę minut.";
        if (UserSrsSettings.ParseSteps(d.RelearningStepsMinutes).Length == 0) return "Kroki ponownej nauki muszą zawierać co najmniej jedną dodatnią liczbę minut.";
        if (d.GraduatingIntervalDays < 1) return "Interwał absolwencki musi wynosić co najmniej 1 dzień.";
        if (d.EasyIntervalDays < 1) return "Interwał „łatwe” musi wynosić co najmniej 1 dzień.";
        if (d.StartingEase < 1.3) return "Startowa łatwość musi wynosić co najmniej 1,3.";
        if (d.EasyBonus < 1.0) return "Bonus „łatwe” musi wynosić co najmniej 1,0.";
        if (d.HardMultiplier < 1.0) return "Mnożnik „trudne” musi wynosić co najmniej 1,0.";
        if (d.LapseNewIntervalMultiplier is < 0.0 or > 1.0) return "Mnożnik po wpadce musi być między 0 a 1.";
        if (d.MinimumIntervalDays < 1) return "Minimalny interwał musi wynosić co najmniej 1 dzień.";
        if (d.MaximumIntervalDays < d.MinimumIntervalDays) return "Maksymalny interwał nie może być mniejszy niż minimalny.";
        if (d.DayRolloverHour is < 0 or > 23) return "Godzina zmiany dnia musi być między 0 a 23.";
        try { TimeZoneInfo.FindSystemTimeZoneById(d.Timezone); }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException) { return "Nieprawidłowa strefa czasowa."; }
        return null;
    }
}
