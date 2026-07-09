using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using UglyToad.PdfPig;

namespace BackendApi.Services.Grading;

public interface IDocumentTextExtractionService
{
    bool CanHandle(string fileName);
    string ExtractText(Stream fileStream, string fileName);
}

public class DocumentTextExtractionService : IDocumentTextExtractionService
{
    public bool CanHandle(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext is ".pdf" or ".docx";
    }

    public string ExtractText(Stream fileStream, string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext switch
        {
            ".pdf" => ExtractPdfText(fileStream),
            ".docx" => ExtractDocxText(fileStream),
            _ => throw new NotSupportedException($"Unsupported syllabus file type: {ext}"),
        };
    }

    private static string ExtractPdfText(Stream stream)
    {
        using var document = PdfDocument.Open(stream);
        var sb = new System.Text.StringBuilder();
        foreach (var page in document.GetPages())
        {
            sb.AppendLine(page.Text);
        }
        return sb.ToString();
    }

    private static string ExtractDocxText(Stream stream)
    {
        using var wordDoc = WordprocessingDocument.Open(stream, false);
        var body = wordDoc.MainDocumentPart?.Document?.Body;
        if (body is null) return string.Empty;

        var sb = new System.Text.StringBuilder();
        foreach (var paragraph in body.Descendants<Paragraph>())
        {
            sb.AppendLine(paragraph.InnerText);
        }
        return sb.ToString();
    }
}
