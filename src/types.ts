/**
 * Storage type for persisting chat data
 */
export type StorageType = "none" | "localstorage" | "langgraph";

/**
 * LangGraph specific configuration
 */
export interface LangGraphConfig {
  /**
   * The LangGraph deployment URL to use
   */
  deploymentUrl: string;
  /**
   * The LangGraph assistant ID to use
   */
  assistantId: string;
}

/**
 * n8n/webhook specific configuration
 */
export interface N8NConfig {
  /**
   * The webhook URL to send chat messages to
   * Supports n8n, Make.com, Zapier, or custom webhook endpoints
   */
  webhookUrl: string;

  /**
   * Enable streaming responses from webhook
   * @default false
   */
  enableStreaming?: boolean;

  /**
   * Configuration for the webhook request
   * @default { method: 'POST', headers: {} }
   */
  webhookConfig?: {
    method?: string;
    headers?: Record<string, string>;
  };
}

/**
 * Form factor for the chat widget layout
 */
export type ChatFormFactor = "full-page" | "side-panel" | "bottom-tray";

/**
 * Bottom tray specific configuration options
 */
export interface BottomTrayOptions {
  /**
   * Control the open state of the bottom tray (controlled mode)
   */
  isOpen?: boolean;

  /**
   * Callback when bottom tray open state changes
   */
  onOpenChange?: (isOpen: boolean) => void;

  /**
   * Default open state for bottom tray (uncontrolled mode)
   */
  defaultOpen?: boolean;
}

/**
 * Quick suggestion displayed above the composer input
 */
export interface QuickSuggestion {
  /**
   * The text to display and copy into the input on click
   */
  text: string;

  /**
   * Optional emoji or icon character to display before the text
   */
  icon?: string;
}

/**
 * Configuration options for the chat widget
 */
export interface ChatConfig {
  /**
   * LangGraph configuration
   */
  langgraph?: LangGraphConfig;

  /**
   * n8n webhook configuration
   */
  n8n?: N8NConfig;

  /**
   * Callback fired when a session starts
   * The sessionId is the threadId from C1Chat
   */
  onSessionStart?: (sessionId: string) => void;

  /**
   * Callback fired when an error occurs during message processing
   * Useful for logging, analytics, or custom error UI
   * Note: The SDK will still display error states in the chat UI
   */
  onError?: (error: Error) => void;

  /**
   * Theme configuration
   */
  theme?: {
    mode: "light" | "dark";
  };

  /**
   * Name of the agent/bot
   * @default "Assistant"
   */
  agentName?: string;

  /**
   * URL to the logo image to display in the chat
   */
  logoUrl?: string;

  /**
   * Form factor for the chat widget layout
   * - "full-page": Takes up the entire viewport (default)
   * - "side-panel": Appears as a side panel on the right
   * - "bottom-tray": Appears as a collapsible tray at the bottom
   * @default "full-page"
   */
  formFactor?: ChatFormFactor;

  /**
   * Bottom tray specific options (only used when formFactor is "bottom-tray")
   */
  bottomTray?: BottomTrayOptions;

  /**
   * Display mode for the chat widget
   * @deprecated Use `formFactor` instead. "fullscreen" maps to "full-page", "sidepanel" maps to "side-panel"
   * @default "fullscreen"
   */
  mode?: "fullscreen" | "sidepanel";

  /**
   * Storage type for persisting threads and messages
   * - "none": No persistence (default)
   * - "localstorage": Persist to browser localStorage
   * @default "none"
   */
  storageType?: StorageType;

  /**
   * Enable debug logging to console
   * @default false
   */
  enableDebugLogging?: boolean;

  /**
   * Quick suggestions to display above the composer input
   * Only shown when the input is empty
   * Clicking a suggestion copies its text into the input
   */
  quickSuggestions?: QuickSuggestion[];
}

/**
 * Chat widget instance returned by createChat
 */
export interface ChatInstance {
  /**
   * Programmatically open the chat window
   */
  open: () => void;

  /**
   * Programmatically close the chat window
   */
  close: () => void;

  /**
   * Destroy the chat widget and remove it from the DOM
   */
  destroy: () => void;

  /**
   * Get the current session ID
   */
  getSessionId: () => string;
}

/**
 * Message format sent to webhook
 * This is the default format, but can be customized for different providers
 */
export interface WebhookMessage {
  chatInput: string;
  sessionId: string;
}

/**
 * Response format from webhook (non-streaming)
 * Most providers (n8n, Make.com, Zapier) return this format
 */
export interface WebhookResponse {
  output: string;
}

/**
 * Streaming response item format
 * Used by n8n and other providers that support line-delimited JSON streaming
 */
export interface WebhookStreamItem {
  type: "item";
  content: string;
}

/**
 * Error from webhook
 */
export interface WebhookError {
  message: string;
  status?: number;
}

// Legacy aliases for backward compatibility
/** @deprecated Use WebhookMessage instead */
export type N8NMessage = WebhookMessage;
/** @deprecated Use WebhookResponse instead */
export type N8NResponse = WebhookResponse;
/** @deprecated Use WebhookStreamItem instead */
export type N8NStreamItem = WebhookStreamItem;
/** @deprecated Use WebhookError instead */
export type N8NError = WebhookError;

// Re-export types for convenience
export type { Message } from "@thesysai/genui-sdk";
export type { Thread } from "@crayonai/react-core";
