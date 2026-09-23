using BackendApi.Domain;

namespace BackendApi.Endpoints;

// ---- auth ----
public record AdminLoginRequest(string Email, string Password);
public record AdminDto(Guid Id, string Email, string DisplayName, AdminRole Role, Guid? UniversityId, string? UniversityName, bool IsDisabled);
public record AdminLoginResponse(string Token, AdminDto Admin);

// ---- proposals ----
public record AdminProposalDto(
    Guid Id,
    string Name,
    CourseProposalStatus Status,
    string ProposerName,
    string ProposerEmail,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ReviewedAt,
    string? ReviewReason);

/// <summary>Approve by linking to an existing course, or by creating a new one. Exactly one of the two.</summary>
public record ApproveProposalRequest(Guid? CourseId, string? NewCourseName, string? NewCourseCode);
public record RejectProposalRequest(string? Reason);

// ---- courses ----
public record AdminCourseDto(
    Guid Id,
    string? Code,
    string Name,
    bool IsArchived,
    int SubjectCount,
    int SharedLessonCount);

public record CreateCourseRequest(string Name, string? Code);
public record UpdateCourseRequest(string? Name, string? Code, bool? IsArchived);

// ---- lessons / moderation ----
public record AdminLessonListItem(
    Guid Id,
    string Title,
    Guid AuthorId,
    string AuthorName,
    Guid CourseId,
    string CourseName,
    int LikeCount,
    int DeckCount,
    int CardCount,
    DateTimeOffset SharedAt,
    DateTimeOffset ContentUpdatedAt);

public record AdminLessonPage(List<AdminLessonListItem> Items, int Page, int PageSize, int TotalCount, int TotalPages);

public record AdminLessonDetail(
    Guid Id,
    string Title,
    string? NoteContent,
    List<DeckDto> Decks,
    Guid AuthorId,
    string AuthorName,
    string AuthorEmail,
    Guid CourseId,
    string CourseName,
    int LikeCount,
    DateTimeOffset SharedAt,
    DateTimeOffset ContentUpdatedAt);

/// <summary>
/// Metadata only — deliberately no note content or flashcards. A taken-down
/// lesson is unshared, and an admin must not read unshared content; this view
/// exists solely so a lock can be reviewed and lifted.
/// </summary>
public record AdminModeratedLessonDto(
    Guid Id,
    string Title,
    string AuthorName,
    DateTimeOffset ModerationLockedAt,
    string? ModerationLockReason);

public record TakedownRequest(string Reason, int? BanHours);

// ---- users & bans ----
public record AdminUserListItem(
    Guid Id,
    string FirstName,
    string LastName,
    string Email,
    int SharedLessonCount,
    DateTimeOffset? LastLoginAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ShareBlockedUntil);

public record AdminUserPage(List<AdminUserListItem> Items, int Page, int PageSize, int TotalCount, int TotalPages);

public record AdminUserDetail(
    Guid Id,
    string FirstName,
    string LastName,
    string Email,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastLoginAt,
    DateTimeOffset? ShareBlockedUntil,
    string? ShareBlockReason,
    List<AdminLessonListItem> SharedLessons);

public record ShareBanDto(
    Guid Id,
    string Reason,
    int Hours,
    DateTimeOffset StartsAt,
    DateTimeOffset ExpiresAt,
    DateTimeOffset? LiftedAt,
    bool IsActive);

public record IssueShareBanRequest(int Hours, string Reason);

// ---- universities & admins (super admin) ----
public record AdminUniversityDto(
    Guid Id,
    string Name,
    string? ShortName,
    bool IsArchived,
    int CourseCount,
    int UserCount);

public record CreateUniversityRequest(string Name, string? ShortName);
public record UpdateUniversityRequest(string? Name, string? ShortName, bool? IsArchived);

public record CreateAdminRequest(string Email, string DisplayName, string Password, Guid? UniversityId);
public record UpdateAdminRequest(string? DisplayName, string? Password, Guid? UniversityId, bool? IsDisabled);

// ---- stats ----
public record AdminStats(
    int LessonsCreatedToday,
    int LessonsCreatedLast7Days,
    int LessonsSharedToday,
    int LessonsSharedLast7Days,
    int TotalUsers,
    int ActiveUsersToday,
    int ActiveUsersLast7Days);
