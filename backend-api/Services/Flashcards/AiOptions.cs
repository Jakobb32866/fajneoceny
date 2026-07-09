namespace BackendApi.Services.Flashcards;

/// <summary>
/// Any OpenAI-compatible chat-completions endpoint works here: OpenAI itself,
/// Azure OpenAI, or a local server like Ollama (http://localhost:11434/v1).
/// Leave BaseUrl empty to skip AI generation and use the offline heuristic
/// generator instead.
/// </summary>
public class AiOptions
{
    public string BaseUrl { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string Model { get; set; } = "gpt-4o-mini";
}
