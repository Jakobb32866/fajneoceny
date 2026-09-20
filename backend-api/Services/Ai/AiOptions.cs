namespace BackendApi.Services.Ai;

/// <summary>
/// Configuration for the chat-completions LLM backend. Any OpenAI-compatible
/// endpoint works here: OpenAI itself, Azure OpenAI, or a local server like
/// Ollama (http://localhost:11434/v1). Leave BaseUrl empty to skip AI calls
/// entirely — callers then fall back to their offline heuristic.
/// </summary>
public class AiOptions
{
    public string BaseUrl { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string Model { get; set; } = "gpt-4o-mini";
}
