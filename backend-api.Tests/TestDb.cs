using BackendApi.Auth;
using BackendApi.Data;
using BackendApi.Services.Admin;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Tests;

/// <summary>ICurrentUser stub for tests: a fixed user id, always authenticated.</summary>
public class FakeCurrentUser(Guid userId) : ICurrentUser
{
    public Guid UserId { get; } = userId;
    public bool IsAuthenticated => true;
}

/// <summary>ICurrentAdmin stub for tests.</summary>
public class FakeCurrentAdmin(Guid adminId) : ICurrentAdmin
{
    public Guid AdminId { get; } = adminId;
    public bool IsAuthenticated => AdminId != Guid.Empty;
}

/// <summary>
/// In-memory SQLite database for AppDbContext tests. A single open connection
/// backs the whole instance (SQLite's :memory: database disappears when the
/// last connection to it closes), and each call to For(userId) hands back a
/// fresh AppDbContext over that same connection — fresh so its change
/// tracker starts empty and its query filters are captured for that user via
/// the injected ICurrentUser, but sharing the underlying data.
/// </summary>
public class TestDb : IAsyncDisposable
{
    private readonly SqliteConnection _connection;
    private readonly DbContextOptions<AppDbContext> _options;

    private TestDb(SqliteConnection connection, DbContextOptions<AppDbContext> options)
    {
        _connection = connection;
        _options = options;
    }

    public static async Task<TestDb> CreateAsync()
    {
        var connection = new SqliteConnection("DataSource=:memory:");
        await connection.OpenAsync();

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(connection)
            .Options;

        await using (var context = new AppDbContext(options, new FakeCurrentUser(Guid.NewGuid())))
        {
            await context.Database.EnsureCreatedAsync();
        }

        return new TestDb(connection, options);
    }

    public AppDbContext For(Guid userId) => new(_options, new FakeCurrentUser(userId));

    /// <summary>
    /// A context as an admin request sees it: ICurrentUser.UserId is
    /// Guid.Empty, exactly as CurrentUser yields for an admin token, so every
    /// per-user query filter matches nothing. Admin code must reach data
    /// through AdminQueries instead.
    /// </summary>
    public AppDbContext ForAdmin() => new(_options, new FakeCurrentUser(Guid.Empty));

    /// <summary>An AdminContext over a context, for the given admin id.</summary>
    public AdminContext AdminContextFor(AppDbContext db, Guid adminId) => new(db, new FakeCurrentAdmin(adminId));

    public async ValueTask DisposeAsync()
    {
        await _connection.DisposeAsync();
    }
}
