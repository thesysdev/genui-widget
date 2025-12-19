/**
 * Interface for chat backend providers
 * Implementations handle communication with different chat backends
 * (LangGraph, n8n webhooks, Make.com, Zapier, etc.)
 */
export interface ChatProvider {
  /**
   * Unique identifier for this provider type
   */
  readonly name: string;

  /**
   * Send a message to the chat backend and get a streaming response
   *
   * @param sessionId - The thread/session ID for the conversation
   * @param prompt - The user's message
   * @returns A Response object with a readable stream body
   */
  sendMessage(sessionId: string, prompt: string): Promise<Response>;
}
