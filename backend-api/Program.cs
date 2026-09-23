using System.Text;
using BackendApi;
using BackendApi.Auth;
using BackendApi.Data;
using BackendApi.Domain;
using BackendApi.Endpoints;
using BackendApi.Services.Admin;
using BackendApi.Services.Ai;
using BackendApi.Services.Flashcards;
using BackendApi.Services.Grading;
using BackendApi.Services.Storage;
using BackendApi.Services.Tts;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

// Must run before CreateBuilder: this is a one-shot CLI utility, not a
// request path, and it should never spin up the host or touch the database.
if (PasswordHashCommand.TryRun(args)) return;

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
builder.Services.AddScoped<ICurrentAdmin, CurrentAdmin>();
builder.Services.AddScoped<AdminContext>();
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddSingleton<AdminTokenService>();
builder.Services.AddSingleton<GoogleTokenVerifier>();
builder.Services.AddSingleton<PasswordHasher<User>>();

builder.Services.AddSingleton<IFileStorageService, FileStorageService>();
builder.Services.AddSingleton<IGradeCalculationService, GradeCalculationService>();
builder.Services.AddSingleton<IDocumentTextExtractionService, DocumentTextExtractionService>();

builder.Services.AddSingleton<ISpacedRepetitionService, AnkiScheduler>();
builder.Services.AddSingleton<IDailyFlashcardSelector, DailyFlashcardSelector>();

// Chat-completions backend, hardwired to the OpenAI-compatible client (serves
// OpenAI and local Ollama alike). Swapping providers = swapping this one line.
// Local LLM inference (Ollama, CPU) can take well over HttpClient's default
// 100s for a multi-card request — give it generous headroom so slow-but-valid
// responses aren't cancelled into the heuristic fallback.
builder.Services.AddHttpClient<IChatCompletionClient, OpenAiChatCompletionClient>(client =>
    client.Timeout = TimeSpan.FromMinutes(5));

// Flashcard generation: AI first, offline heuristic as the fallback. The AI
// service depends on IFlashcardGenerationService for its fallback (DIP), wired
// explicitly here to the heuristic implementation.
builder.Services.AddSingleton<HeuristicFlashcardGenerationService>();
builder.Services.AddSingleton<IFlashcardGenerationService>(sp => new AiFlashcardGenerationService(
    sp.GetRequiredService<IChatCompletionClient>(),
    sp.GetRequiredService<HeuristicFlashcardGenerationService>(),
    sp.GetRequiredService<ILogger<AiFlashcardGenerationService>>()));

// Grading-scheme extraction: LLM parse of the syllabus, with the offline regex
// heuristic as the fallback (same wiring as flashcard generation).
builder.Services.AddSingleton<HeuristicGradingSchemeExtractor>();
builder.Services.AddSingleton<IGradingSchemeExtractor>(sp => new AiGradingSchemeExtractor(
    sp.GetRequiredService<IChatCompletionClient>(),
    sp.GetRequiredService<HeuristicGradingSchemeExtractor>(),
    sp.GetRequiredService<ILogger<AiGradingSchemeExtractor>>()));

// Text-to-speech. Unlike the LLM seam, the provider here is chosen by
// configuration (Tts:Provider) rather than a hardwired line, because the two
// backends have genuinely different deployment stories: Google needs an API
// key and nothing installed, Piper needs a binary and a ~60 MB voice model in
// the image but costs nothing to run. Both satisfy ITextToSpeechService's
// WAV contract, so the rest of the app cannot tell them apart.
builder.Services.AddHttpClient(GoogleTextToSpeechService.HttpClientName, client =>
    client.Timeout = TimeSpan.FromMinutes(2));
builder.Services.AddSingleton<GoogleTextToSpeechService>();
builder.Services.AddSingleton<PiperTextToSpeechService>();
builder.Services.AddSingleton<ITextToSpeechService>(sp =>
{
    var provider = sp.GetRequiredService<IOptions<TtsOptions>>().Value.Provider;
    return provider == TtsProvider.Piper
        ? sp.GetRequiredService<PiperTextToSpeechService>()
        : sp.GetRequiredService<GoogleTextToSpeechService>();
});
builder.Services.AddSingleton<IFlashcardAudioExportService, FlashcardAudioExportService>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var jwtOptions = builder.Configuration.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();

// Fail at startup rather than run with forgeable tokens: missing, short,
// shared, or publicly committed signing keys are all refused here.
jwtOptions.EnsureValid(builder.Environment.IsDevelopment());

// One bearer scheme PER TOKEN TYPE, each trusting exactly one key and one
// audience (see AuthSchemes). Every policy below is pinned to a single
// scheme, and the authorization middleware then sets HttpContext.User from
// that scheme alone — which is what CurrentUser/CurrentAdmin read.
//
// Do not merge these back into one scheme with both keys: a single scheme
// accepts a token signed by either key, and since the signer chooses the
// fo_actor/fo_role claims, the student key could then mint a super-admin
// token (CrossTokenRejectionTests covers this).
//
// No default scheme is set on purpose: no request is authenticated except
// through a policy, so nothing can reach an endpoint on the wrong scheme.
builder.Services.AddAuthentication()
    .AddJwtBearer(AuthSchemes.Student, options =>
        ConfigureBearer(options, jwtOptions.Issuer, jwtOptions.Audience, jwtOptions.Key))
    .AddJwtBearer(AuthSchemes.Admin, options =>
        ConfigureBearer(options, jwtOptions.Issuer, JwtOptions.AdminAudience, jwtOptions.AdminKey));

builder.Services.AddAuthorization(options =>
{
    // DefaultPolicy is what a bare RequireAuthorization() resolves to, which
    // is every existing student route. Those mean "a student token", not
    // merely "some valid JWT": only the student scheme is consulted, so an
    // admin token is not even authenticated on them.
    options.DefaultPolicy = new AuthorizationPolicyBuilder(AuthSchemes.Student)
        .RequireAuthenticatedUser()
        .RequireClaim(AuthClaims.Actor, AuthClaims.ActorStudent)
        .Build();

    // FallbackPolicy covers endpoints carrying NO authorization metadata at
    // all — which DefaultPolicy never reaches. Without it, a route that
    // simply forgets RequireAuthorization() is wide open; with it, such a
    // route is student-only and the mistake is safe. The genuinely public
    // routes opt out explicitly with .AllowAnonymous().
    options.FallbackPolicy = options.DefaultPolicy;

    options.AddPolicy(AuthPolicies.Admin, policy => policy
        .AddAuthenticationSchemes(AuthSchemes.Admin)
        .RequireAuthenticatedUser()
        .RequireClaim(AuthClaims.Actor, AuthClaims.ActorAdmin));

    // The role claim is a first-pass filter only; AdminContext re-reads the
    // authoritative role from the database on every admin request.
    options.AddPolicy(AuthPolicies.SuperAdmin, policy => policy
        .AddAuthenticationSchemes(AuthSchemes.Admin)
        .RequireAuthenticatedUser()
        .RequireClaim(AuthClaims.Actor, AuthClaims.ActorAdmin)
        .RequireClaim(AuthClaims.Role, nameof(AdminRole.SuperAdmin)));
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
    await DeckBackfill.RunAsync(db);
    await UniversitySeeder.RunAsync(db);
    await SuperAdminSeeder.RunAsync(db, app.Configuration, app.Logger);
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
app.MapSettingsEndpoints();
app.MapUniversityEndpoints();
app.MapCommunityEndpoints();
app.MapAdminEndpoints();

app.Run();

static void ConfigureBearer(JwtBearerOptions options, string issuer, string audience, string key)
{
    // Never remap inbound claim names. This is already the default on modern
    // .NET, but these policies are security-critical and must not depend on a
    // framework default that could change: remapping would rewrite
    // "fo_role"-style names and silently alter what the policies match.
    options.MapInboundClaims = false;

    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = issuer,
        ValidateAudience = true,
        ValidAudience = audience,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
        ValidateLifetime = true,
    };
}
