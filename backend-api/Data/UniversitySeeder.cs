using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Data;

/// <summary>
/// Seeds the initial curated university + course catalogue. Idempotent:
/// matches the university by Name and each course by Code within it, so
/// re-running on every startup is a no-op once the rows exist.
/// </summary>
public static class UniversitySeeder
{
    private static readonly (string Code, string Name)[] PjatkCourses =
    [
        ("BSI", "Bezpieczeństwo systemów informacyjnych"),
        ("UGP", "Uczenie głębokie w języku Python"),
        ("GRK", "Grafika komputerowa"),
        ("BYT", "Budowa i integracja systemów informatycznych"),
    ];

    public static async Task RunAsync(AppDbContext db)
    {
        var university = await db.Universities.FirstOrDefaultAsync(u => u.Name == "Polsko-Japońska Akademia Technik Komputerowych");
        if (university is null)
        {
            university = new University
            {
                Name = "Polsko-Japońska Akademia Technik Komputerowych",
                ShortName = "PJATK",
            };
            db.Universities.Add(university);
            await db.SaveChangesAsync();
        }

        foreach (var (code, name) in PjatkCourses)
        {
            var exists = await db.UniversityCourses.AnyAsync(c => c.UniversityId == university.Id && c.Code == code);
            if (exists) continue;

            db.UniversityCourses.Add(new UniversityCourse
            {
                UniversityId = university.Id,
                Code = code,
                Name = name,
            });
        }

        await db.SaveChangesAsync();
    }
}
