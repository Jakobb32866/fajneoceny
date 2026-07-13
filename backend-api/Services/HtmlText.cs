using System.Net;
using System.Text.RegularExpressions;

namespace BackendApi.Services;

/// <summary>
/// Notes are authored in the web rich-text editor and stored as HTML. When we
/// feed them to the flashcard generator we want plain text, so tags don't leak
/// into the prompt.
/// </summary>
public static partial class HtmlText
{
    public static string Strip(string? html)
    {
        if (string.IsNullOrWhiteSpace(html)) return string.Empty;

        // Turn block-level breaks into newlines so sentences don't run together.
        var withBreaks = BlockBreakRegex().Replace(html, "\n");
        var noTags = TagRegex().Replace(withBreaks, string.Empty);
        var decoded = WebUtility.HtmlDecode(noTags);
        return CollapseBlankLinesRegex().Replace(decoded, "\n\n").Trim();
    }

    [GeneratedRegex(@"</(p|div|h[1-6]|li|ul|ol|blockquote|br)\s*>|<br\s*/?>", RegexOptions.IgnoreCase)]
    private static partial Regex BlockBreakRegex();

    [GeneratedRegex("<[^>]+>")]
    private static partial Regex TagRegex();

    [GeneratedRegex(@"\n\s*\n\s*\n+")]
    private static partial Regex CollapseBlankLinesRegex();
}
