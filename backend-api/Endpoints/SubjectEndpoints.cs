using BackendApi.Data;
using BackendApi.Domain;
using BackendApi.Services.Grading;
using BackendApi.Services.Storage;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Endpoints;

public record CreateSubjectRequest(string Name, string? Description);
public record SubjectSummary(Guid Id, string Name, string? Description, int LessonCount, double? CurrentEstimatePercent);
public record DraftGradingComponentDto(string Name, GradeCategory Category, double WeightPercent);
public record SyllabusUploadResult(Guid SubjectId, string RawTextPreview, List<DraftGradingComponentDto> DraftComponents);
public record SyllabusTextRequest(string Text);
public record GradingComponentInput(string Name, GradeCategory Category, double WeightPercent);
public record GradeEntryDto(Guid Id, string Name, double Score, double MaxScore, DateTimeOffset Date);
public record GradingComponentDto(Guid Id, string Name, GradeCategory Category, double WeightPercent, bool IsAdHoc, double? AverageScorePercent, List<GradeEntryDto> Entries);
public record SubjectGradesResponse(double? CurrentEstimatePercent, double ProvisionalFinalPercent, double TotalWeightPercent, List<GradingComponentDto> Components);
public record AddGradeEntryRequest(string Name, double Score, double MaxScore);

public static class SubjectEndpoints
{
    /// <summary>
    /// Runs the grading-scheme extractor over the given syllabus text, replaces
    /// the subject's draft components with the result, persists, and returns the
    /// upload result. Shared by the file and pasted-text endpoints.
    /// </summary>
    private static async Task<SyllabusUploadResult> ApplySyllabusTextAsync(
        Subject subject, string rawText, AppDbContext db, IGradingSchemeExtractor extractor)
    {
        var draft = await extractor.ExtractAsync(rawText);

        var scheme = await db.GradingSchemes.FirstOrDefaultAsync(g => g.SubjectId == subject.Id);
        if (scheme is null)
        {
            scheme = new GradingScheme { SubjectId = subject.Id };
            db.GradingSchemes.Add(scheme);
        }
        else
        {
            // Replace the previous components. A direct DB delete avoids the
            // change-tracking pitfalls of swapping a loaded navigation collection.
            await db.GradingComponents.Where(c => c.GradingSchemeId == scheme.Id).ExecuteDeleteAsync();
        }

        db.GradingComponents.AddRange(draft.Select(d => new GradingComponent
        {
            GradingSchemeId = scheme.Id,
            Name = d.Name,
            Category = d.Category,
            WeightPercent = d.WeightPercent,
            IsAdHoc = false,
        }));

        await db.SaveChangesAsync();

        var preview = rawText.Length > 500 ? rawText[..500] : rawText;
        return new SyllabusUploadResult(
            subject.Id,
            preview,
            draft.Select(d => new DraftGradingComponentDto(d.Name, d.Category, d.WeightPercent)).ToList());
    }

    public static void MapSubjectEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/subjects").WithTags("Subjects").RequireAuthorization();

        group.MapGet("/", async (AppDbContext db, IGradeCalculationService gradeCalc) =>
        {
            var subjects = await db.Subjects
                .Include(s => s.Lessons)
                .Include(s => s.GradingScheme).ThenInclude(g => g!.Components).ThenInclude(c => c.Entries)
                .ToListAsync();

            return subjects.Select(s => new SubjectSummary(
                s.Id,
                s.Name,
                s.Description,
                s.Lessons.Count,
                s.GradingScheme is null ? null : gradeCalc.Calculate(s.GradingScheme).CurrentEstimatePercent));
        });

        group.MapPost("/", async (CreateSubjectRequest request, AppDbContext db) =>
        {
            var subject = new Subject { Name = request.Name, Description = request.Description };
            db.Subjects.Add(subject);
            await db.SaveChangesAsync();
            return Results.Created($"/api/subjects/{subject.Id}", subject);
        });

        group.MapGet("/{id:guid}", async (Guid id, AppDbContext db) =>
        {
            var subject = await db.Subjects
                .Include(s => s.Lessons.OrderBy(l => l.Order))
                .FirstOrDefaultAsync(s => s.Id == id);
            return subject is null ? Results.NotFound() : Results.Ok(subject);
        });

        group.MapDelete("/{id:guid}", async (Guid id, AppDbContext db) =>
        {
            var subject = await db.Subjects.FirstOrDefaultAsync(e => e.Id == id);
            if (subject is null) return Results.NotFound();
            db.Subjects.Remove(subject);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        group.MapPost("/{id:guid}/syllabus", async (
            Guid id,
            IFormFile file,
            AppDbContext db,
            IFileStorageService storage,
            IDocumentTextExtractionService extractor,
            IGradingSchemeExtractor schemeExtractor) =>
        {
            var subject = await db.Subjects.FirstOrDefaultAsync(s => s.Id == id);
            if (subject is null) return Results.NotFound();
            if (!extractor.CanHandle(file.FileName))
                return Results.BadRequest("Only .pdf and .docx syllabus files are supported.");

            await using (var stream = file.OpenReadStream())
            {
                subject.SyllabusFileName = await storage.SaveAsync(stream, file.FileName);
            }

            using (var textStream = file.OpenReadStream())
            {
                subject.SyllabusRawText = extractor.ExtractText(textStream, file.FileName);
            }

            var result = await ApplySyllabusTextAsync(subject, subject.SyllabusRawText ?? string.Empty, db, schemeExtractor);
            return Results.Ok(result);
        }).DisableAntiforgery();

        // Same outcome as the file upload, but from raw text the student pasted
        // in (e.g. copied from an email or a course page) instead of a document.
        group.MapPost("/{id:guid}/syllabus/text", async (
            Guid id, SyllabusTextRequest request, AppDbContext db, IGradingSchemeExtractor schemeExtractor) =>
        {
            var subject = await db.Subjects.FirstOrDefaultAsync(s => s.Id == id);
            if (subject is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(request.Text))
                return Results.BadRequest("Pasted syllabus text is empty.");

            subject.SyllabusFileName = null;
            subject.SyllabusRawText = request.Text;

            var result = await ApplySyllabusTextAsync(subject, request.Text, db, schemeExtractor);
            return Results.Ok(result);
        });

        group.MapPut("/{id:guid}/grading-scheme", async (Guid id, List<GradingComponentInput> components, AppDbContext db) =>
        {
            var subject = await db.Subjects
                .Include(s => s.GradingScheme).ThenInclude(g => g!.Components)
                .FirstOrDefaultAsync(s => s.Id == id);
            if (subject is null) return Results.NotFound();

            subject.GradingScheme ??= new GradingScheme { SubjectId = subject.Id };
            subject.GradingScheme.Components = components
                .Select(c => new GradingComponent
                {
                    GradingSchemeId = subject.GradingScheme.Id,
                    Name = c.Name,
                    Category = c.Category,
                    WeightPercent = c.WeightPercent,
                    IsAdHoc = false,
                })
                .ToList();

            await db.SaveChangesAsync();
            return Results.Ok(subject.GradingScheme);
        });

        group.MapGet("/{id:guid}/grades", async (Guid id, AppDbContext db, IGradeCalculationService gradeCalc) =>
        {
            var scheme = await db.GradingSchemes
                .Include(g => g.Components).ThenInclude(c => c.Entries)
                .FirstOrDefaultAsync(g => g.SubjectId == id);
            if (scheme is null) return Results.NotFound();

            var result = gradeCalc.Calculate(scheme);
            var components = scheme.Components.Select(c => new GradingComponentDto(
                c.Id, c.Name, c.Category, c.WeightPercent, c.IsAdHoc,
                result.Components.First(r => r.ComponentId == c.Id).AverageScorePercent,
                c.Entries.Select(e => new GradeEntryDto(e.Id, e.Name, e.Score, e.MaxScore, e.Date)).ToList()
            )).ToList();

            return Results.Ok(new SubjectGradesResponse(
                result.CurrentEstimatePercent, result.ProvisionalFinalPercent, result.TotalWeightPercent, components));
        });

        group.MapPost("/{id:guid}/grades/components", async (Guid id, GradingComponentInput request, AppDbContext db) =>
        {
            var scheme = await db.GradingSchemes.FirstOrDefaultAsync(g => g.SubjectId == id);
            if (scheme is null)
            {
                scheme = new GradingScheme { SubjectId = id };
                db.GradingSchemes.Add(scheme);
            }

            var component = new GradingComponent
            {
                GradingSchemeId = scheme.Id,
                Name = request.Name,
                Category = request.Category,
                WeightPercent = request.WeightPercent,
                IsAdHoc = true,
            };
            db.GradingComponents.Add(component);
            await db.SaveChangesAsync();
            return Results.Created($"/api/subjects/{id}/grades", component);
        });

        group.MapPost("/grades/components/{componentId:guid}/entries", async (Guid componentId, AddGradeEntryRequest request, AppDbContext db) =>
        {
            var component = await db.GradingComponents.FirstOrDefaultAsync(e => e.Id == componentId);
            if (component is null) return Results.NotFound();

            var entry = new GradeEntry
            {
                GradingComponentId = componentId,
                Name = request.Name,
                Score = request.Score,
                MaxScore = request.MaxScore,
            };
            db.GradeEntries.Add(entry);
            await db.SaveChangesAsync();
            return Results.Created($"/api/subjects/grades/entries/{entry.Id}", entry);
        });

        group.MapDelete("/grades/entries/{entryId:guid}", async (Guid entryId, AppDbContext db) =>
        {
            var entry = await db.GradeEntries.FirstOrDefaultAsync(e => e.Id == entryId);
            if (entry is null) return Results.NotFound();
            db.GradeEntries.Remove(entry);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }
}
