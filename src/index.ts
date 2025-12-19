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
import type { ChatConfig, ChatInstance } from "./types";
import { createStorageAdapter, LangGraphStorageAdapter } from "./storage";
import type { StorageAdapter } from "./storage";
import { createChatProvider, type ChatProvider } from "./providers";
import { log, handleError, normalizeError } from "./utils/logger";
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

/**
 * React component wrapper that manages thread persistence
 */
function ChatWithPersistence({
  config,
  storage,
  provider,
  onSessionIdChange,
}: {
  config: ChatConfig;
  storage: StorageAdapter;
  provider: ChatProvider;
  onSessionIdChange: (sessionId: string | null) => void;
}) {
  const formFactor = config.mode === "sidepanel" ? "side-panel" : "full-page";

  // Initialize thread list manager
  const threadListManager = useThreadListManager({
    fetchThreadList: async () => {
      try {
        return await storage.getThreadList();
      } catch (error) {
        handleError(error, "[Storage] fetchThreadList failed", config.onError);
        return []; // Return empty list on error so UI still works
      }
    },
    createThread: async (firstMessage: UserMessage) => {
      const title = generateThreadTitle(firstMessage.message || "New Chat");

      try {
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
      } catch (error) {
        throw handleError(
          error,
          "[Storage] createThread failed",
          config.onError
        );
      }
    },
    deleteThread: async (threadId: string) => {
      try {
        await storage.deleteThread(threadId);
      } catch (error) {
        throw handleError(
          error,
          "[Storage] deleteThread failed",
          config.onError
        );
      }
    },
    updateThread: async (thread: Thread) => {
      try {
        await storage.updateThread(thread);
        return thread;
      } catch (error) {
        throw handleError(
          error,
          "[Storage] updateThread failed",
          config.onError
        );
      }
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
      try {
        log("[Storage] loadThread:", threadId);
        const messages = await storage.getThread(threadId);
        log("[Storage] Loaded", messages?.length || 0, "messages");
        return messages || [];
      } catch (error) {
        handleError(error, "[Storage] loadThread failed", config.onError);
        return []; // Return empty array so UI still works
      }
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
        try {
          await storage.saveThread(threadId, messages);
          log("[Storage] Saved user messages");
        } catch (error) {
          // Log but don't notify - message can still be sent even if save fails
          normalizeError(error, "[Storage] saveThread (user messages) failed");
        }
      }

      // Get prompt
      const lastMessage = messages[messages.length - 1];
      const prompt = lastMessage?.content || "";

      // Send message via provider
      let response: Response;
      try {
        response = await provider.sendMessage(threadId, prompt);
      } catch (error) {
        // Re-throw so the SDK can display error state in UI
        throw handleError(
          error,
          "[Provider] sendMessage failed",
          config.onError
        );
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
              try {
                await storage.saveThread(threadId, [
                  ...messages,
                  assistantMessage,
                ]);
                log(
                  "[Storage] Saved assistant message, total:",
                  messages.length + 1
                );
              } catch (error) {
                // Log but don't notify - response was already streamed successfully
                normalizeError(
                  error,
                  "[Storage] saveThread (assistant message) failed"
                );
              }

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
  // Set debug logging flag at window level (do this early so logging works)
  if (!window.__THESYS_CHAT__) {
    window.__THESYS_CHAT__ = {};
  }
  window.__THESYS_CHAT__.enableDebugLogging =
    config.enableDebugLogging || false;

  let provider: ChatProvider;
  let storage: StorageAdapter;
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  try {
    // Validate required config
    if (!config.n8n && !config.langgraph) {
      throw new Error("n8n or langgraph configuration is required");
    }

    log("[createChat] Initializing with config:", {
      hasLanggraph: !!config.langgraph,
      hasN8n: !!config.n8n,
      storageType: config.storageType,
    });

    // Create chat provider
    provider = createChatProvider(config);
    log("[createChat] Created provider:", provider.name);

    // Create storage adapter
    // Auto-select "langgraph" storage when langgraph config is present (unless explicitly set)
    const storageType =
      config.storageType || (config.langgraph ? "langgraph" : "none");
    storage = createStorageAdapter(storageType, config.langgraph);

    // Create container element
    container = document.createElement("div");
    container.id = "thesys-chat-root";
    document.body.appendChild(container);

    // Create React root
    root = createRoot(container);
  } catch (error) {
    throw handleError(
      error,
      "[createChat] Initialization failed",
      config.onError
    );
  }

  // Track current session ID
  let currentSessionId: string | null = null;

  // Render chat with persistence
  root.render(
    createElement(ChatWithPersistence, {
      config,
      storage,
      provider,
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
