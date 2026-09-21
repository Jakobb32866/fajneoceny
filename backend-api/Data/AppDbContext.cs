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
    public DbSet<GradingScheme> GradingSchemes => Set<GradingScheme>();
    public DbSet<GradingComponent> GradingComponents => Set<GradingComponent>();
    public DbSet<GradeEntry> GradeEntries => Set<GradeEntry>();
    public DbSet<Deck> Decks => Set<Deck>();
    public DbSet<Flashcard> Flashcards => Set<Flashcard>();
    public DbSet<SpacedRepetitionState> SpacedRepetitionStates => Set<SpacedRepetitionState>();
    public DbSet<QuizSession> QuizSessions => Set<QuizSession>();
    public DbSet<UserSrsSettings> UserSrsSettings => Set<UserSrsSettings>();
    public DbSet<University> Universities => Set<University>();
    public DbSet<UniversityCourse> UniversityCourses => Set<UniversityCourse>();
    public DbSet<CourseProposal> CourseProposals => Set<CourseProposal>();
    public DbSet<LessonLike> LessonLikes => Set<LessonLike>();

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

        // University / community schema. Universities and their courses are
        // owner-curated (never user-created), so they carry no UserId and no
        // query filter. Restrict deletes on the user->university and
        // subject->course links so removing a course/university doesn't
        // silently cascade into unrelated users' or subjects' rows.
        modelBuilder.Entity<University>().Property(u => u.Name).HasMaxLength(200);
        modelBuilder.Entity<University>().Property(u => u.ShortName).HasMaxLength(40);
        modelBuilder.Entity<University>().HasIndex(u => u.Name).IsUnique();

        modelBuilder.Entity<UniversityCourse>().Property(c => c.Code).HasMaxLength(20);
        modelBuilder.Entity<UniversityCourse>().Property(c => c.Name).HasMaxLength(200);
        modelBuilder.Entity<University>()
            .HasMany(u => u.Courses)
            .WithOne(c => c.University)
            .HasForeignKey(c => c.UniversityId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<User>()
            .HasOne(u => u.University)
            .WithMany()
            .HasForeignKey(u => u.UniversityId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Subject>()
            .HasOne(s => s.UniversityCourse)
            .WithMany()
            .HasForeignKey(s => s.UniversityCourseId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<CourseProposal>().Property(p => p.Name).HasMaxLength(200);
        // Owner reviews/edits Status directly via SQL, so it's stored as its string name rather than an int.
        modelBuilder.Entity<CourseProposal>().Property(p => p.Status).HasConversion<string>();
        modelBuilder.Entity<CourseProposal>()
            .HasOne(p => p.Subject)
            .WithMany()
            .HasForeignKey(p => p.SubjectId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<CourseProposal>().HasIndex(p => p.SubjectId).IsUnique();

        modelBuilder.Entity<LessonLike>()
            .HasOne(l => l.Lesson)
            .WithMany()
            .HasForeignKey(l => l.LessonId)
            .OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<LessonLike>().HasIndex(l => new { l.LessonId, l.UserId }).IsUnique();

        // One Subject per (owner, university course) — a student can't link
        // two of their own subjects to the same shared course. The filter
        // only applies the constraint to rows that are actually linked.
        modelBuilder.Entity<Subject>()
            .HasIndex(s => new { s.UserId, s.UniversityCourseId })
            .IsUnique()
            .HasFilter("\"UniversityCourseId\" IS NOT NULL");

        // Per-user data isolation: every owned entity is only ever visible
        // through a query scoped to the current request's user. Note that
        // EF's FindAsync(id) bypasses these global query filters entirely,
        // so endpoints must use FirstOrDefaultAsync(e => e.Id == id) instead.
        // University, UniversityCourse and LessonLike are NOT owned entities
        // (see their doc comments) and so get no query filter here; only
        // CourseProposal among the new community types is user-owned.
        modelBuilder.Entity<Subject>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<Lesson>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<Note>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<GradingScheme>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<GradingComponent>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<GradeEntry>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<Deck>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<Flashcard>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<SpacedRepetitionState>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<QuizSession>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<UserSrsSettings>().HasQueryFilter(e => e.UserId == currentUser.UserId);
        modelBuilder.Entity<CourseProposal>().HasQueryFilter(e => e.UserId == currentUser.UserId);

        // One settings row per user.
        modelBuilder.Entity<UserSrsSettings>().HasIndex(e => e.UserId).IsUnique();
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        StampOwnedEntities();
        var lessonIdsToBump = CollectLessonIdsToBump();
        var result = await base.SaveChangesAsync(cancellationToken);
        await BumpContentUpdatedAtAsync(lessonIdsToBump, cancellationToken);
        return result;
    }

    public override int SaveChanges()
    {
        StampOwnedEntities();
        var lessonIdsToBump = CollectLessonIdsToBump();
        var result = base.SaveChanges();
        if (lessonIdsToBump.Count > 0)
        {
            Lessons.Where(l => lessonIdsToBump.Contains(l.Id))
                .ExecuteUpdate(s => s.SetProperty(l => l.ContentUpdatedAt, DateTimeOffset.UtcNow));
        }
        return result;
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

    /// <summary>
    /// Lesson.ContentUpdatedAt should reflect the last time a lesson's notes,
    /// decks or flashcards changed, but the Lesson row itself usually isn't
    /// tracked when only a child entity is added/edited/removed — so we can't
    /// rely on a per-entity "modified" timestamp on Lesson alone. Instead,
    /// collect the affected LessonIds from the change tracker BEFORE the save
    /// (their entries flip to Unchanged/Detached once base.SaveChanges(Async)
    /// runs), then stamp Lesson rows directly after.
    /// </summary>
    private List<Guid> CollectLessonIdsToBump()
    {
        bool IsPending(EntityState state) => state is EntityState.Added or EntityState.Modified or EntityState.Deleted;

        var lessonIds = ChangeTracker.Entries<Note>().Where(e => IsPending(e.State)).Select(e => e.Entity.LessonId)
            .Concat(ChangeTracker.Entries<Deck>().Where(e => IsPending(e.State)).Select(e => e.Entity.LessonId))
            .Concat(ChangeTracker.Entries<Flashcard>().Where(e => IsPending(e.State)).Select(e => e.Entity.LessonId))
            .Distinct()
            .ToList();

        return lessonIds;
    }

    /// <summary>
    /// Applies the ContentUpdatedAt bump via ExecuteUpdateAsync, which issues
    /// its own UPDATE statement directly against the database rather than
    /// going through SaveChangesAsync, so it does not re-enter this override
    /// (no recursion) and doesn't require the affected Lesson rows to be
    /// loaded/tracked.
    /// </summary>
    private async Task BumpContentUpdatedAtAsync(List<Guid> lessonIds, CancellationToken cancellationToken)
    {
        if (lessonIds.Count == 0) return;

        await Lessons.Where(l => lessonIds.Contains(l.Id))
            .ExecuteUpdateAsync(s => s.SetProperty(l => l.ContentUpdatedAt, DateTimeOffset.UtcNow), cancellationToken);
    }
}
