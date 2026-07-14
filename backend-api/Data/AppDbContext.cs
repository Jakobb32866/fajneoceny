using BackendApi.Auth;
using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace BackendApi.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options, ICurrentUser currentUser) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Subject> Subjects => Set<Subject>();
    public DbSet<Lesson> Lessons => Set<Lesson>();
    public DbSet<Note> Notes => Set<Note>();
    public DbSet<Source> Sources => Set<Source>();
    public DbSet<GradingScheme> GradingSchemes => Set<GradingScheme>();
    public DbSet<GradingComponent> GradingComponents => Set<GradingComponent>();
    public DbSet<GradeEntry> GradeEntries => Set<GradeEntry>();
    public DbSet<Deck> Decks => Set<Deck>();
    public DbSet<Flashcard> Flashcards => Set<Flashcard>();
    public DbSet<SpacedRepetitionState> SpacedRepetitionStates => Set<SpacedRepetitionState>();
    public DbSet<QuizSession> QuizSessions => Set<QuizSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Subject>()
            .HasMany(s => s.Lessons)
            .WithOne(l => l.Subject)
            .HasForeignKey(l => l.SubjectId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Subject>()
            .HasOne(s => s.GradingScheme)
            .WithOne(g => g.Subject)
            .HasForeignKey<GradingScheme>(g => g.SubjectId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Lesson>()
            .HasMany(l => l.Notes)
            .WithOne(n => n.Lesson)
            .HasForeignKey(n => n.LessonId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Lesson>()
            .HasMany(l => l.Sources)
            .WithOne(s => s.Lesson)
            .HasForeignKey(s => s.LessonId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Lesson>()
            .HasMany(l => l.Flashcards)
            .WithOne(f => f.Lesson)
            .HasForeignKey(f => f.LessonId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Lesson>()
            .HasMany(l => l.Decks)
            .WithOne(d => d.Lesson)
            .HasForeignKey(d => d.LessonId)
            .OnDelete(DeleteBehavior.Cascade);

        // Deleting a deck removes its cards. A card also has a direct LessonId
        // (kept for the daily/stack selectors); deleting the lesson cascades
        // through both paths, which SQLite permits.
        modelBuilder.Entity<Deck>()
            .HasMany(d => d.Flashcards)
            .WithOne(f => f.Deck)
            .HasForeignKey(f => f.DeckId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Deck>().Property(d => d.Name).HasMaxLength(200);

        modelBuilder.Entity<GradingScheme>()
            .HasMany(g => g.Components)
            .WithOne(c => c.GradingScheme)
            .HasForeignKey(c => c.GradingSchemeId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<GradingComponent>()
            .HasMany(c => c.Entries)
            .WithOne(e => e.GradingComponent)
            .HasForeignKey(e => e.GradingComponentId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Flashcard>()
            .HasOne(f => f.ReviewState)
            .WithOne(r => r.Flashcard)
            .HasForeignKey<SpacedRepetitionState>(r => r.FlashcardId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<QuizSession>()
            .Property(q => q.FlashcardIds)
            .HasConversion(
                v => string.Join(',', v),
                v => v == "" ? new List<Guid>() : v.Split(',', StringSplitOptions.None).Select(Guid.Parse).ToList(),
                new ValueComparer<List<Guid>>(
                    (a, b) => (a ?? new()).SequenceEqual(b ?? new()),
                    v => v.Aggregate(0, (hash, id) => HashCode.Combine(hash, id)),
                    v => v.ToList()));

        modelBuilder.Entity<Subject>().Property(s => s.Name).HasMaxLength(200);
        modelBuilder.Entity<Lesson>().Property(l => l.Title).HasMaxLength(200);

        modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();
        modelBuilder.Entity<User>().Property(u => u.Email).HasMaxLength(320);

        // Per-user data isolation: every owned entity is only ever visible
        // through a query scoped to the current request's user. Note that
        // EF's FindAsync(id) bypasses these global query filters entirely,
        // so endpoints must use FirstOrDefaultAsync(e => e.Id == id) instead.
        modelBuilder.Entity<Subject>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<Lesson>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<Note>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<Source>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<GradingScheme>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<GradingComponent>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<GradeEntry>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<Deck>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<Flashcard>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<SpacedRepetitionState>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<QuizSession>().HasQueryFilter(e => e.UserId == currentUser.UserId);
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        StampOwnedEntities();
        return base.SaveChangesAsync(cancellationToken);
    }

    public override int SaveChanges()
    {
        StampOwnedEntities();
        return base.SaveChanges();
    }

    private void StampOwnedEntities()
    {
        foreach (var entry in ChangeTracker.Entries<IOwnedByUser>())
        {
            if (entry.State == EntityState.Added && entry.Entity.UserId == Guid.Empty)
            {
                entry.Entity.UserId = currentUser.UserId;
            }
        }
    }
}
