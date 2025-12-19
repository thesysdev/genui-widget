import type { ChatConfig } from "../types";
import type { ChatProvider } from "./ChatProvider";
import { LangGraphProvider } from "./LangGraphProvider";
import { WebhookProvider } from "./WebhookProvider";

export type { ChatProvider } from "./ChatProvider";
export { LangGraphProvider } from "./LangGraphProvider";
export { WebhookProvider } from "./WebhookProvider";

/**
 * Create a chat provider based on the configuration
 * Automatically selects LangGraph or Webhook provider based on config
 *
 * @param config - The chat configuration
 * @returns A ChatProvider instance
 * @throws Error if no valid provider configuration is found
 */
export function createChatProvider(config: ChatConfig): ChatProvider {
  if (config.langgraph?.deploymentUrl) {
    return new LangGraphProvider(config.langgraph);
  }

  if (config.n8n?.webhookUrl) {
    return new WebhookProvider(config.n8n);
  }

  throw new Error(
    "No valid provider configuration found. Provide either langgraph or n8n config."
  );
}
