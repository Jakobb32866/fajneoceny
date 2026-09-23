using BackendApi.Domain;
using Microsoft.EntityFrameworkCore;

namespace BackendApi.Services.Community;

/// <summary>One page of lesson ids, plus the totals needed to render a pager.</summary>
public record LessonPageIds(List<Guid> Ids, int Page, int PageSize, int TotalCount, int TotalPages);

/// <summary>
/// Shared ordering + pagination for every shared-lesson feed (the student
/// Społeczność list and the admin moderation list).
///
/// Extracted rather than copied because the logic has two non-obvious
/// details that a second copy would inevitably drift from:
///
///  - SQLite cannot ORDER BY a DateTimeOffset column — EF throws
///    NotSupportedException — and SharedAt/ContentUpdatedAt are still stored
///    as TEXT, so the sort has to happen in memory over a lightweight
///    projection. A course's shared-lesson list is small enough for this to
///    be cheap.
///  - The follow-up "fetch this page's rows" query returns rows in arbitrary
///    order, so the caller must re-apply the chosen order afterwards. See
///    ApplyOrder.
/// </summary>
public static class LessonPaging
{
    public const int DefaultPageSize = 15;

    /// <summary>Applies a title search, orders, and pages — returning just the ids for the page.</summary>
    public static async Task<LessonPageIds> PageAsync(
        IQueryable<Lesson> query,
        string? sort,
        string? q,
        int? page,
        int pageSize = DefaultPageSize)
    {
        if (!string.IsNullOrWhiteSpace(q))
        {
            query = query.Where(l => EF.Functions.Like(l.Title, $"%{q}%"));
        }

        var candidates = await query
            .Select(l => new { l.Id, l.LikeCount, SharedAt = l.SharedAt ?? default, l.ContentUpdatedAt })
            .ToListAsync();

        var ordered = sort switch
        {
            "published" => candidates.OrderByDescending(l => l.SharedAt),
            "updated" => candidates.OrderByDescending(l => l.ContentUpdatedAt),
            _ => candidates.OrderByDescending(l => l.LikeCount).ThenByDescending(l => l.SharedAt),
        };

        var pageNum = page is null or < 1 ? 1 : page.Value;
        var totalCount = candidates.Count;
        var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

        var ids = ordered.Skip((pageNum - 1) * pageSize).Take(pageSize).Select(l => l.Id).ToList();

        return new LessonPageIds(ids, pageNum, pageSize, totalCount, totalPages);
    }

    /// <summary>
    /// Re-applies the page's order to rows fetched by id, dropping any that
    /// vanished between the two queries.
    /// </summary>
    public static List<T> ApplyOrder<T>(List<Guid> orderedIds, List<T> rows, Func<T, Guid> idOf)
    {
        var byId = rows.ToDictionary(idOf);
        return orderedIds
            .Where(byId.ContainsKey)
            .Select(id => byId[id])
            .ToList();
    }
}
