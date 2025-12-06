import { createRoot } from "react-dom/client";
import { createElement } from "react";
import {
  C1Chat,
  useThreadManager,
  useThreadListManager,
  type Message,
} from "@thesysai/genui-sdk";
import type { Thread, UserMessage } from "@crayonai/react-core";
import "@crayonai/react-ui/styles/index.css";
import type {
  ChatConfig,
  ChatInstance,
  LangGraphConfig,
  N8NConfig,
  WebhookMessage,
} from "./types";
import { createStorageAdapter, LangGraphStorageAdapter } from "./storage";
import type { StorageAdapter } from "./storage";
import { log, logError } from "./utils/logger";
import "./styles/widget.css";

/**
 * Helper function to generate thread title from first user message
 */
function generateThreadTitle(message: string): string {
  const maxLength = 50;
  const cleaned = message.trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return cleaned.substring(0, maxLength) + "...";
}

async function callLanggraph(
  langgraphConfig: LangGraphConfig,
  sessionId: string,
  prompt: string
): Promise<Response> {
  console.log("callLanggraph", langgraphConfig, sessionId, prompt);
  const response = await fetch(
    `${langgraphConfig.deploymentUrl}/threads/${sessionId}/runs/stream`,
    {
      method: "POST",
      body: JSON.stringify({
        assistant_id: langgraphConfig.assistantId,
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
    }
  );

  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      let hasStreamedContent = false;

      // Helper to extract content from various JSON formats
      const extractContent = (data: { content?: string }[]): string | null => {
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
                console.log("line", line);
                const data = JSON.parse(line.slice(6));
                console.log("datap", data);
                const content = extractContent(data);
                if (content) {
                  controller.enqueue(new TextEncoder().encode(content));
                  hasStreamedContent = true;
                }
              } catch (e) {
                logError("Failed to parse streaming line:", line, e);
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
              // If we haven't streamed anything, send buffer as-is
              controller.enqueue(new TextEncoder().encode(buffer));
            } else {
              logError("Failed to parse final streaming data:", buffer, e);
            }
          }
        }
      } catch (error) {
        logError("Streaming error:", error);
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

/**
 * Helper function to call webhook endpoint
 * Supports n8n, Make.com, Zapier, and custom webhook providers
 */
async function callWebhook(
  n8nConfig: N8NConfig,
  sessionId: string,
  prompt: string
): Promise<Response> {
  const message: WebhookMessage = {
    chatInput: prompt,
    sessionId: sessionId,
  };

  const webhookMethod = n8nConfig.webhookConfig?.method || "POST";
  const customHeaders = n8nConfig.webhookConfig?.headers || {};

  const headers = {
    "Content-Type": "application/json",
    ...customHeaders,
  };

  const response = await fetch(n8nConfig.webhookUrl, {
    method: webhookMethod,
    headers: headers,
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    throw new Error(`Webhook error: ${response.status} ${response.statusText}`);
  }

  // Check Content-Type to help determine how to handle the response
  const contentType = response.headers.get("Content-Type") || "";
  const isStreamContentType =
    contentType.includes("text/event-stream") ||
    contentType.includes("application/x-ndjson");

  // Determine streaming behavior:
  // - If user explicitly enabled streaming, trust that config (backend may send wrong Content-Type)
  // - If Content-Type indicates streaming, handle as stream
  const shouldStream = n8nConfig.enableStreaming || isStreamContentType;

  // If NOT streaming, parse as JSON
  if (!shouldStream) {
    const clonedResponse = response.clone();
    try {
      const data = await clonedResponse.json();
      // Successfully parsed JSON - return it
      return new Response(data.output || data.message || JSON.stringify(data));
    } catch (error) {
      // JSON parsing failed - try to handle as stream as fallback
      if (!response.body) {
        throw new Error(
          `Failed to parse response as JSON and no body available: ${error}`
        );
      }
    }
  }

  // For streaming, transform line-delimited JSON format to plain text stream
  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      let hasStreamedContent = false;

      // Helper to extract content from various JSON formats
      const extractContent = (data: Record<string, unknown>): string | null => {
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
                logError("Failed to parse streaming line:", line, e);
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
              // If we haven't streamed anything, send buffer as-is
              controller.enqueue(new TextEncoder().encode(buffer));
            } else {
              logError("Failed to parse final streaming data:", buffer, e);
            }
          }
        }
      } catch (error) {
        logError("Streaming error:", error);
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

/**
 * React component wrapper that manages thread persistence
 */
function ChatWithPersistence({
  config,
  storage,
  onSessionIdChange,
}: {
  config: ChatConfig;
  storage: StorageAdapter;
  onSessionIdChange: (sessionId: string | null) => void;
}) {
  const formFactor = config.mode === "sidepanel" ? "side-panel" : "full-page";

  // Initialize thread list manager
  const threadListManager = useThreadListManager({
    fetchThreadList: async () => {
      return await storage.getThreadList();
    },
    createThread: async (firstMessage: UserMessage) => {
      const title = generateThreadTitle(firstMessage.message || "New Chat");

      // Use LangGraph API to create thread if using LangGraph storage
      if (storage instanceof LangGraphStorageAdapter) {
        const thread = await storage.createThread(title);
        // Note: First message will be sent via processMessage, not saved here
        return thread;
      }

      // Default: create thread locally
      const threadId = crypto.randomUUID();
      const thread: Thread = {
        threadId,
        title,
        createdAt: new Date(),
        isRunning: false,
      };

      await storage.updateThread(thread);

      // Convert UserMessage to Message format (react-core -> genui-sdk)
      const message: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: firstMessage.message || "",
      };
      await storage.saveThread(threadId, [message]);

      return thread;
    },
    deleteThread: async (threadId: string) => {
      await storage.deleteThread(threadId);
    },
    updateThread: async (thread: Thread) => {
      await storage.updateThread(thread);
      return thread;
    },
    onSwitchToNew: () => {
      // Called when user switches to new thread
    },
    onSelectThread: (threadId: string) => {
      // Called when user selects a thread
      onSessionIdChange(threadId);
    },
  });

  // Initialize thread manager
  const threadManager = useThreadManager({
    threadListManager,
    loadThread: async (threadId: string) => {
      log("[Storage] loadThread:", threadId);
      const messages = await storage.getThread(threadId);
      log("[Storage] Loaded", messages?.length || 0, "messages");
      return messages || [];
    },
    processMessage: async ({
      threadId,
      messages,
      responseId,
      abortController: _abortController,
    }) => {
      log("[Storage] processMessage:", {
        threadId,
        messageCount: messages.length,
      });

      // Update session ID
      onSessionIdChange(threadId);

      // Call onSessionStart on first message
      if (messages.length === 1) {
        config.onSessionStart?.(threadId);
      }

      const isLangGraph = storage instanceof LangGraphStorageAdapter;

      // Save user messages (skip for LangGraph - messages are persisted via runs)
      if (!isLangGraph) {
        await storage.saveThread(threadId, messages);
        log("[Storage] Saved user messages");
      }

      // Get prompt
      const lastMessage = messages[messages.length - 1];
      const prompt = lastMessage?.content || "";

      // Call webhook or LangGraph
      let response: Response;
      if (config.n8n?.webhookUrl) {
        response = await callWebhook(config.n8n, threadId, prompt);
      } else if (config.langgraph?.deploymentUrl) {
        response = await callLanggraph(config.langgraph, threadId, prompt);
      } else {
        console.log("No webhook or langgraph configuration provided");
        throw new Error("No webhook or langgraph configuration provided");
      }

      // For LangGraph, messages are automatically persisted by the run
      // Just return the response directly
      if (isLangGraph) {
        return response;
      }

      // For other storage types, wrap stream to save assistant message when complete
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";

        const wrappedStream = new ReadableStream({
          async start(controller) {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value, { stream: true });
                fullContent += text;
                controller.enqueue(value);
              }

              // Save complete thread after stream ends
              const assistantMessage: Message = {
                id: responseId,
                role: "assistant",
                content: fullContent,
              };
              await storage.saveThread(threadId, [
                ...messages,
                assistantMessage,
              ]);
              log(
                "[Storage] Saved assistant message, total:",
                messages.length + 1
              );

              controller.close();
            } catch (error) {
              controller.error(error);
            }
          },
        });

        return new Response(wrappedStream, { headers: response.headers });
      }

      return response;
    },
    onUpdateMessage: () => {
      // Not called when threadManager is used with C1Chat
    },
  });

  return createElement(C1Chat, {
    threadManager,
    threadListManager,
    theme: config.theme,
    agentName: config.agentName || "Assistant",
    logoUrl: config.logoUrl,
    formFactor,
  });
}

/**
 * Create an embeddable chat widget in fullscreen mode
 *
 * @param config - Configuration options for the chat widget
 * @returns ChatInstance with methods to control the widget
 *
 * @example
 * ```typescript
 * import { createChat } from 'thesysai/chat-client';
 *
 * const chat = createChat({
 *   webhookUrl: 'https://your-webhook-endpoint.com/chat',
 *   agentName: 'My Bot',
 *   storageType: 'localstorage'
 * });
 * ```
 */
export function createChat(config: ChatConfig): ChatInstance {
  // Validate required config
  if (!config.n8n && !config.langgraph) {
    throw new Error("n8n or langgraph configuration is required");
  }

  console.log("config", config);

  // Set debug logging flag at window level
  if (!window.__THESYS_CHAT__) {
    window.__THESYS_CHAT__ = {};
  }
  window.__THESYS_CHAT__.enableDebugLogging =
    config.enableDebugLogging || false;

  // Create storage adapter
  // Auto-select "langgraph" storage when langgraph config is present (unless explicitly set)
  const storageType =
    config.storageType || (config.langgraph ? "langgraph" : "none");
  const storage = createStorageAdapter(storageType, config.langgraph);

  // Create container element
  const container = document.createElement("div");
  container.id = "thesys-chat-root";
  document.body.appendChild(container);

  // Create React root
  const root = createRoot(container);

  // Track current session ID
  let currentSessionId: string | null = null;

  // Render chat with persistence
  root.render(
    createElement(ChatWithPersistence, {
      config,
      storage,
      onSessionIdChange: (sessionId: string | null) => {
        currentSessionId = sessionId;
      },
    })
  );

  // Return ChatInstance API
  const instance: ChatInstance = {
    open: () => {
      container.style.display = "";
    },

    close: () => {
      container.style.display = "none";
    },

    destroy: () => {
      root.unmount();
      container.remove();
    },

    getSessionId: () => currentSessionId || "",
  };

  return instance;
}

// Export types
export type { ChatConfig, ChatInstance, N8NConfig } from "./types";
