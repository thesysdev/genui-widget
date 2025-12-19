import type { N8NConfig, WebhookMessage } from "../types";
import type { ChatProvider } from "./ChatProvider";
import { log, logError } from "../utils/logger";

/**
 * Chat provider for webhook-based backends
 * Supports n8n, Make.com, Zapier, and custom webhook endpoints
 */
export class WebhookProvider implements ChatProvider {
  readonly name = "webhook";

  constructor(private readonly config: N8NConfig) {}

  async sendMessage(sessionId: string, prompt: string): Promise<Response> {
    const message: WebhookMessage = {
      chatInput: prompt,
      sessionId: sessionId,
    };

    const webhookMethod = this.config.webhookConfig?.method || "POST";
    const customHeaders = this.config.webhookConfig?.headers || {};

    const headers = {
      "Content-Type": "application/json",
      ...customHeaders,
    };

    log("[Webhook] Sending request:", {
      url: this.config.webhookUrl,
      method: webhookMethod,
      sessionId,
    });

    let response: Response;
    try {
      response = await fetch(this.config.webhookUrl, {
        method: webhookMethod,
        headers: headers,
        body: JSON.stringify(message),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Network error";
      logError("[Webhook] Network error:", errorMessage);
      throw new Error(`Failed to connect to webhook: ${errorMessage}`);
    }

    log("[Webhook] Response status:", response.status, response.statusText);

    if (!response.ok) {
      const errorMessage = `Webhook error: ${response.status} ${response.statusText}`;
      logError("[Webhook] API error:", errorMessage);
      throw new Error(errorMessage);
    }

    // Check Content-Type to help determine how to handle the response
    const contentType = response.headers.get("Content-Type") || "";
    const isStreamContentType =
      contentType.includes("text/event-stream") ||
      contentType.includes("application/x-ndjson");

    // Determine streaming behavior:
    // - If user explicitly enabled streaming, trust that config (backend may send wrong Content-Type)
    // - If Content-Type indicates streaming, handle as stream
    const shouldStream = this.config.enableStreaming || isStreamContentType;

    // If NOT streaming, parse as JSON
    if (!shouldStream) {
      const clonedResponse = response.clone();
      try {
        const data = await clonedResponse.json();
        log("[Webhook] Parsed JSON response");
        // Successfully parsed JSON - return it
        return new Response(
          data.output || data.message || JSON.stringify(data)
        );
      } catch (error) {
        // JSON parsing failed - try to handle as stream as fallback
        if (!response.body) {
          throw new Error(
            `Failed to parse response as JSON and no body available: ${error}`
          );
        }
        log("[Webhook] JSON parse failed, falling back to stream");
      }
    }

    // For streaming, transform line-delimited JSON format to plain text stream
    if (!response.body) {
      throw new Error("Response body is null");
    }

    return this.transformStream(response);
  }

  /**
   * Transform webhook streaming format (NDJSON) to plain text stream
   */
  private transformStream(response: Response): Response {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        let hasStreamedContent = false;

        // Helper to extract content from various JSON formats
        const extractContent = (
          data: Record<string, unknown>
        ): string | null => {
          // NDJSON streaming format: {"type":"item","content":"..."}
          if (data.type === "item" && typeof data.content === "string") {
            return data.content;
          }
          // Regular JSON response format: {"output":"..."} or {"message":"..."}
          if (typeof data.output === "string") return data.output;
          if (typeof data.message === "string") return data.message;
          return null;
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
                  const data = JSON.parse(line);
                  const content = extractContent(data);
                  if (content) {
                    controller.enqueue(new TextEncoder().encode(content));
                    hasStreamedContent = true;
                  }
                } catch (e) {
                  logError(
                    "[Webhook] Failed to parse streaming line:",
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
                  "[Webhook] Failed to parse final streaming data:",
                  buffer,
                  e
                );
              }
            }
          }
        } catch (error) {
          logError("[Webhook] Streaming error:", error);
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
