import type { LangGraphConfig } from "../types";
import type { ChatProvider } from "./ChatProvider";
import { log, logError } from "../utils/logger";

/**
 * Chat provider for LangGraph deployments
 * Handles streaming communication with LangGraph cloud or self-hosted deployments
 */
export class LangGraphProvider implements ChatProvider {
  readonly name = "langgraph";

  constructor(private readonly config: LangGraphConfig) {}

  async sendMessage(sessionId: string, prompt: string): Promise<Response> {
    const url = `${this.config.deploymentUrl}/threads/${sessionId}/runs/stream`;
    log("[LangGraph] Sending request:", {
      url,
      assistantId: this.config.assistantId,
      sessionId,
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assistant_id: this.config.assistantId,
          input: {
            messages: [
              {
                role: "human",
                content: prompt,
              },
            ],
          },
          stream_mode: ["values", "messages-tuple", "custom"],
          stream_subgraphs: true,
          stream_resumable: true,
        }),
      });
    } catch (error) {
      // Network error (no internet, DNS failure, CORS, etc.)
      const message = error instanceof Error ? error.message : "Network error";
      logError("[LangGraph] Network error:", message);
      throw new Error(`Failed to connect to LangGraph: ${message}`);
    }

    log("[LangGraph] Response status:", response.status, response.statusText);

    if (!response.ok) {
      // Try to get error details from response body
      let errorMessage = `LangGraph error: ${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.json();
        if (errorBody.detail) {
          errorMessage = `LangGraph error: ${errorBody.detail}`;
        } else if (errorBody.message) {
          errorMessage = `LangGraph error: ${errorBody.message}`;
        }
      } catch {
        // Ignore JSON parsing errors, use default message
      }
      logError("[LangGraph] API error:", errorMessage);
      throw new Error(errorMessage);
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }

    return this.transformStream(response);
  }

  /**
   * Transform LangGraph streaming format to plain text stream
   */
  private transformStream(response: Response): Response {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        let hasStreamedContent = false;

        // Helper to extract content from LangGraph JSON format
        const extractContent = (
          data: { content?: string }[]
        ): string | null => {
          try {
            return data[0].content || null;
          } catch {
            return null;
          }
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            const lines = buffer.split("\n");

            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.trim()) {
                try {
                  // LangGraph format: "data: {...}"
                  const data = JSON.parse(line.slice(6));
                  const content = extractContent(data);
                  if (content) {
                    controller.enqueue(new TextEncoder().encode(content));
                    hasStreamedContent = true;
                  }
                } catch (e) {
                  logError(
                    "[LangGraph] Failed to parse streaming line:",
                    line,
                    e
                  );
                }
              }
            }
          }

          // Process remaining buffer
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer);
              const content = extractContent(data);
              if (content) {
                controller.enqueue(new TextEncoder().encode(content));
                hasStreamedContent = true;
              }
            } catch (e) {
              // Buffer might not be valid JSON - could be plain text
              if (!hasStreamedContent) {
                controller.enqueue(new TextEncoder().encode(buffer));
              } else {
                logError(
                  "[LangGraph] Failed to parse final streaming data:",
                  buffer,
                  e
                );
              }
            }
          }
        } catch (error) {
          logError("[LangGraph] Streaming error:", error);
          controller.error(error);
        } finally {
          controller.close();
          reader.releaseLock();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }
}
