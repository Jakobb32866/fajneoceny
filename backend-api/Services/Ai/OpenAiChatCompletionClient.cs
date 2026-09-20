using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace BackendApi.Services.Ai;

/// <summary>
/// <see cref="IChatCompletionClient"/> for any OpenAI-compatible
/// /chat/completions endpoint — OpenAI, Azure OpenAI, or a local Ollama server.
/// Centralises the HTTP transport, auth, JSON-mode request shaping, and the
/// response parsing that used to be duplicated across every task service.
/// </summary>
public class OpenAiChatCompletionClient(
    HttpClient httpClient,
    IOptions<AiOptions> options) : IChatCompletionClient
{
    private readonly AiOptions _options = options.Value;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_options.BaseUrl);

    public async Task<string> CompleteAsync(ChatCompletionRequest request, CancellationToken ct = default)
    {
        var requestBody = new
        {
            model = _options.Model,
            messages = new object[]
            {
                new { role = "system", content = request.SystemPrompt },
                new { role = "user", content = request.UserPrompt },
            },
            temperature = request.Temperature,
            // Constrain the model to emit syntactically valid JSON (supported by
            // OpenAI and Ollama). Forces a top-level object, so JSON prompts must
            // ask for {"key": [...]} rather than a bare array.
            response_format = request.RequireJsonObject ? new { type = "json_object" } : null,
        };

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, $"{_options.BaseUrl.TrimEnd('/')}/chat/completions")
        {
            Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json"),
        };
        if (!string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            httpRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _options.ApiKey);
        }

        using var response = await httpClient.SendAsync(httpRequest, ct);
        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<ChatCompletionResponse>(cancellationToken: ct);
        var content = payload?.Choices?.FirstOrDefault()?.Message?.Content
            ?? throw new InvalidOperationException("Empty AI response");

        return request.RequireJsonObject ? ExtractJsonObject(content) : content;
    }

    /// <summary>
    /// Slices to the outermost {...} in case the model wraps its JSON object in
    /// prose or code fences. Throws when no object is present.
    /// </summary>
    private static string ExtractJsonObject(string content)
    {
        var jsonStart = content.IndexOf('{');
        var jsonEnd = content.LastIndexOf('}');
        if (jsonStart < 0 || jsonEnd < jsonStart)
            throw new InvalidOperationException("AI response did not contain a JSON object");

        return content[jsonStart..(jsonEnd + 1)];
    }

    private class ChatCompletionResponse
    {
        [JsonPropertyName("choices")]
        public List<Choice>? Choices { get; set; }

        public class Choice
        {
            [JsonPropertyName("message")]
            public Message? Message { get; set; }
        }

        public class Message
        {
            [JsonPropertyName("content")]
            public string? Content { get; set; }
        }
    }
}
