namespace BackendApi.Services.Ai;

/// <summary>
/// A single chat-completion request: a system prompt that sets the assistant's
/// role, a user prompt with the actual task, and the sampling temperature.
/// When <see cref="RequireJsonObject"/> is set the client asks the model for a
/// JSON object and returns only the outermost {...} from the response.
/// </summary>
public record ChatCompletionRequest(
    string SystemPrompt,
    string UserPrompt,
    double Temperature = 0.7,
    bool RequireJsonObject = true);

/// <summary>
/// Transport-level abstraction over a chat-completions LLM. Task services
/// (flashcard generation, grading-scheme extraction) depend on this rather
/// than on <c>HttpClient</c>, so switching between Ollama, OpenAI, or another
/// provider is a matter of swapping the implementation wired in Program.cs —
/// no change to the task services.
/// </summary>
public interface IChatCompletionClient
{
    /// <summary>
    /// True when a backend is configured. Callers use this to decide whether to
    /// attempt an AI call at all, or go straight to their offline fallback.
    /// </summary>
    bool IsConfigured { get; }

    /// <summary>
    /// Sends the request and returns the assistant's message content. When
    /// <see cref="ChatCompletionRequest.RequireJsonObject"/> is true the result
    /// is sliced to the outermost JSON object; throws if none is present.
    /// </summary>
    Task<string> CompleteAsync(ChatCompletionRequest request, CancellationToken ct = default);
}
