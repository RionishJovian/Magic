/**
 * Universal Ollama client for streaming and non-streaming responses
 * Connects to Ollama API (localhost:11434 or via Docker bridge)
 * Models: deepseek-r1:8b (reasoning), qwen2.5-coder:7b (code), llama3.2 (general)
 */

export interface OllamaMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  done_reason?: string;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
}

// Model selection based on task type
export function getModelForTask(
  task:
    | "reasoning"
    | "code"
    | "chat"
    | "json"
    | "embedding" = "chat"
): string {
  switch (task) {
    case "reasoning":
      return "deepseek-r1:8b"; // Best for complex analysis, Magic Dude
    case "code":
      return "qwen2.5-coder:7b"; // Code generation, RouterOS scripts
    case "json":
      return "deepseek-r1:8b"; // Structured output
    case "chat":
    default:
      return "llama3.2:latest"; // General conversational
  }
}

// Get Ollama API base URL (localhost or Docker bridge)
function getOllamaUrl(): string {
  return process.env.OLLAMA_API_URL || "http://localhost:11434";
}

/**
 * Stream response from Ollama (for real-time UI updates)
 * Yields text chunks as they arrive from the model
 */
export async function* streamOllamaResponse(
  messages: OllamaMessage[],
  model: string = "deepseek-r1:8b",
  systemPrompt?: string
): AsyncGenerator<string, void, unknown> {
  const url = `${getOllamaUrl()}/api/chat`;
  const systemMessages: OllamaMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: systemMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("No response body from Ollama");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          try {
            const chunk: OllamaStreamChunk = JSON.parse(line);
            if (chunk.message?.content) {
              yield chunk.message.content;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    }
  } catch (error) {
    console.error("Ollama streaming error:", error);
    throw error;
  }
}

/**
 * Get non-streaming response from Ollama
 * Use for simple queries or when you need the complete response at once
 */
export async function getOllamaResponse(
  messages: OllamaMessage[],
  model: string = "deepseek-r1:8b",
  systemPrompt?: string
): Promise<string> {
  const url = `${getOllamaUrl()}/api/chat`;
  const systemMessages: OllamaMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: systemMessages,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data: OllamaResponse = await response.json();
    return data.message.content;
  } catch (error) {
    console.error("Ollama request error:", error);
    throw error;
  }
}

/**
 * Check if Ollama is running and responsive
 */
export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${getOllamaUrl()}/api/tags`, {
      method: "GET",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get list of available models
 */
export async function getAvailableModels(): Promise<string[]> {
  try {
    const response = await fetch(`${getOllamaUrl()}/api/tags`);
    if (!response.ok) return [];

    const data = await response.json();
    return (data.models || []).map((m: { name: string }) => m.name);
  } catch {
    return [];
  }
}
