using System.Text;
using BackendApi.Auth;
using BackendApi.Data;
using BackendApi.Domain;
using BackendApi.Endpoints;
using BackendApi.Services.Flashcards;
using BackendApi.Services.Grading;
using BackendApi.Services.Storage;
using BackendApi.Services.Tts;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

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
builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection("Jwt"));
builder.Services.Configure<GoogleOptions>(builder.Configuration.GetSection("Google"));

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddSingleton<GoogleTokenVerifier>();
builder.Services.AddSingleton<PasswordHasher<User>>();

builder.Services.AddSingleton<IFileStorageService, FileStorageService>();
builder.Services.AddSingleton<IGradeCalculationService, GradeCalculationService>();
builder.Services.AddSingleton<IDocumentTextExtractionService, DocumentTextExtractionService>();

builder.Services.AddSingleton<ISpacedRepetitionService, Sm2SpacedRepetitionService>();
builder.Services.AddSingleton<IDailyFlashcardSelector, DailyFlashcardSelector>();
builder.Services.AddSingleton<HeuristicFlashcardGenerationService>();
// Local LLM inference (Ollama, CPU) can take well over HttpClient's default
// 100s for a multi-card request — give it generous headroom so slow-but-valid
// responses aren't cancelled into the heuristic fallback.
builder.Services.AddHttpClient<AiFlashcardGenerationService>(client =>
    client.Timeout = TimeSpan.FromMinutes(5));
builder.Services.AddSingleton<IFlashcardGenerationService>(sp => sp.GetRequiredService<AiFlashcardGenerationService>());

// Grading-scheme extraction: LLM parse of the syllabus, with the offline regex
// heuristic as the fallback (same wiring as flashcard generation).
builder.Services.AddSingleton<HeuristicGradingSchemeExtractor>();
builder.Services.AddHttpClient<AiGradingSchemeExtractor>(client =>
    client.Timeout = TimeSpan.FromMinutes(5));
builder.Services.AddSingleton<IGradingSchemeExtractor>(sp => sp.GetRequiredService<AiGradingSchemeExtractor>());

builder.Services.AddSingleton<ITextToSpeechService, PiperTextToSpeechService>();
builder.Services.AddSingleton<IFlashcardAudioExportService, FlashcardAudioExportService>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var jwtSection = builder.Configuration.GetSection("Jwt");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtSection["Issuer"],
            ValidateAudience = true,
            ValidAudience = jwtSection["Audience"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSection["Key"]!)),
            ValidateLifetime = true,
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
    await DeckBackfill.RunAsync(db);
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();
// Only redirect to HTTPS in development. In the container we listen on plain
// HTTP (:8080); redirecting would 307 browser fetches to an unserved https://
// URL, breaking the audio download and surfacing as an opaque/CORS-like error.
if (app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseAuthentication();
app.UseAuthorization();

app.MapAuthEndpoints();
app.MapSubjectEndpoints();
app.MapLessonEndpoints();
app.MapDeckEndpoints();
app.MapFlashcardEndpoints();

app.Run();
