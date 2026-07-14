namespace BackendApi.Domain;

/// <summary>
/// Marks an entity as belonging to a single user. Implementers get a global
/// EF query filter (see AppDbContext.OnModelCreating) and an automatic
/// UserId stamp on insert (see AppDbContext.SaveChangesAsync).
/// </summary>
public interface IOwnedByUser
{
    Guid UserId { get; set; }
}
