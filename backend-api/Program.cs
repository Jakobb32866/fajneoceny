using BackendApi.Data;
using BackendApi.Endpoints;
using BackendApi.Services.Flashcards;
using BackendApi.Services.Grading;
using BackendApi.Services.Storage;
using BackendApi.Services.Tts;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
});

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection("Storage"));
builder.Services.Configure<AiOptions>(builder.Configuration.GetSection("Ai"));
builder.Services.Configure<TtsOptions>(builder.Configuration.GetSection("Tts"));

builder.Services.AddSingleton<IFileStorageService, FileStorageService>();
builder.Services.AddSingleton<IGradeCalculationService, GradeCalculationService>();
builder.Services.AddSingleton<IDocumentTextExtractionService, DocumentTextExtractionService>();

builder.Services.AddSingleton<ISpacedRepetitionService, Sm2SpacedRepetitionService>();
builder.Services.AddSingleton<IDailyFlashcardSelector, DailyFlashcardSelector>();
builder.Services.AddSingleton<HeuristicFlashcardGenerationService>();
builder.Services.AddHttpClient<AiFlashcardGenerationService>();
builder.Services.AddSingleton<IFlashcardGenerationService>(sp => sp.GetRequiredService<AiFlashcardGenerationService>());

builder.Services.AddSingleton<ITextToSpeechService, PiperTextToSpeechService>();
builder.Services.AddSingleton<IFlashcardAudioExportService, FlashcardAudioExportService>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();
app.UseHttpsRedirection();

app.MapSubjectEndpoints();
app.MapLessonEndpoints();
app.MapFlashcardEndpoints();

app.Run();
