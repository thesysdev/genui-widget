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
   *
   * LangGraph uses Server-Sent Events (SSE) format:
   * - event: <event_type>
   * - data: <json_line_1>
   * - data: <json_line_2>
   * - ...
   * - id: <id>
   * - (blank line separates events)
   *
   * We extract content from "messages|*" events where data[0].content contains the text.
   */
  private transformStream(response: Response): Response {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        let currentEvent = "";
        let dataLines: string[] = [];
        let detectedVersion: string | null = null;

        // Process a complete SSE event
        const processEvent = (eventType: string, dataLines: string[]) => {
          // Only process messages events (streaming content)
          if (!eventType.startsWith("messages|")) {
            return;
          }

          try {
            // Join all data lines (remove "data: " prefix from each)
            const jsonStr = dataLines
              .map((line) => {
                if (line.startsWith("data: ")) return line.slice(6);
                if (line.startsWith("data:")) return line.slice(5);
                return line;
              })
              .join("\n");

            const data = JSON.parse(jsonStr);

            // Detect and log LangGraph version from metadata (data[1])
            if (
              !detectedVersion &&
              Array.isArray(data) &&
              data[1]?.langgraph_version
            ) {
              detectedVersion = data[1].langgraph_version;
              log("[LangGraph] Detected version:", detectedVersion);
            }

            // data is an array: [aiMessage, metadata]
            // aiMessage.content contains the streaming text
            if (Array.isArray(data) && data[0]?.content) {
              const content = data[0].content;
              if (content) {
                controller.enqueue(new TextEncoder().encode(content));
              }
            }
          } catch (e) {
            log("[LangGraph] Failed to parse event:", eventType, e);
          }
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Process complete lines
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                // New event starting - process previous event if we have data
                if (currentEvent && dataLines.length > 0) {
                  processEvent(currentEvent, dataLines);
                }
                currentEvent = line.slice(7).trim();
                dataLines = [];
              } else if (line.startsWith("data:")) {
                dataLines.push(line);
              } else if (line.startsWith("id:")) {
                // End of event block - process it
                if (currentEvent && dataLines.length > 0) {
                  processEvent(currentEvent, dataLines);
                }
                currentEvent = "";
                dataLines = [];
              }
              // Ignore blank lines and other content
            }
          }

          // Process any remaining event
          if (currentEvent && dataLines.length > 0) {
            processEvent(currentEvent, dataLines);
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
