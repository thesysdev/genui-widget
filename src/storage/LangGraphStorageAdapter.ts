import type { Message } from "@thesysai/genui-sdk";
import type { Thread } from "@crayonai/react-core";
import type { StorageAdapter } from "./StorageAdapter";
import { log, logError } from "../utils/logger";

/**
 * LangGraph API response types
 */
interface LangGraphThread {
  thread_id: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

interface LangGraphMessage {
  type: string;
  id: string;
  content: string | { type: string; text?: string }[];
}

interface LangGraphHistoryEntry {
  values: {
    messages?: LangGraphMessage[];
  };
}

/**
 * Storage adapter that integrates with LangGraph's thread management APIs.
 *
 * LangGraph automatically persists messages as part of runs, so saveThread
 * and saveThreadList are no-ops.
 */
export class LangGraphStorageAdapter implements StorageAdapter {
  constructor(private deploymentUrl: string) {}

  /**
   * Fetch all threads from LangGraph
   * GET /threads
   */
  async getThreadList(): Promise<Thread[]> {
    try {
      const res = await fetch(`${this.deploymentUrl}/threads/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch threads: ${res.status}`);
      }

      const threads: LangGraphThread[] = await res.json();
      log("[LangGraph] Fetched threads:", threads.length);

      return threads.map((t) => ({
        threadId: t.thread_id,
        title: (t.metadata?.title as string) || "New Chat",
        createdAt: new Date(t.created_at),
        isRunning: false,
      }));
    } catch (error) {
      logError("[LangGraph] Error fetching thread list:", error);
      return [];
    }
  }

  /**
   * Get messages for a specific thread
   * GET /threads/{thread_id}/history
   */
  async getThread(threadId: string): Promise<Message[] | null> {
    try {
      const res = await fetch(
        `${this.deploymentUrl}/threads/${threadId}/history`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!res.ok) {
        if (res.status === 404) {
          return null;
        }
        throw new Error(`Failed to fetch thread: ${res.status}`);
      }

      const history: LangGraphHistoryEntry[] = await res.json();
      log("[LangGraph] Fetched history for thread:", threadId);

      // Get the latest state (first entry has most recent messages)
      const latestEntry = history[0];
      if (!latestEntry?.values?.messages) {
        return [];
      }

      return latestEntry.values.messages.map((msg) => ({
        id: msg.id,
        role: this.mapMessageType(msg.type),
        content: this.extractContent(msg.content),
      }));
    } catch (error) {
      logError("[LangGraph] Error fetching thread:", error);
      return null;
    }
  }

  /**
   * No-op - LangGraph manages thread list automatically
   */
  async saveThreadList(_threads: Thread[]): Promise<void> {
    // No-op: LangGraph manages thread list through thread creation/deletion
  }

  /**
   * No-op - LangGraph persists messages as part of runs
   */
  async saveThread(_threadId: string, _messages: Message[]): Promise<void> {
    // No-op: LangGraph automatically persists messages during /runs/stream
  }

  /**
   * Delete a thread
   * DELETE /threads/{thread_id}
   */
  async deleteThread(threadId: string): Promise<void> {
    try {
      const res = await fetch(`${this.deploymentUrl}/threads/${threadId}`, {
        method: "DELETE",
      });

      if (!res.ok && res.status !== 404) {
        throw new Error(`Failed to delete thread: ${res.status}`);
      }

      log("[LangGraph] Deleted thread:", threadId);
    } catch (error) {
      logError("[LangGraph] Error deleting thread:", error);
      throw error;
    }
  }

  /**
   * Update thread metadata (e.g., title)
   * PATCH /threads/{thread_id}
   */
  async updateThread(thread: Thread): Promise<void> {
    try {
      const res = await fetch(
        `${this.deploymentUrl}/threads/${thread.threadId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            metadata: { title: thread.title },
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Failed to update thread: ${res.status}`);
      }

      log("[LangGraph] Updated thread:", thread.threadId);
    } catch (error) {
      logError("[LangGraph] Error updating thread:", error);
      throw error;
    }
  }

  /**
   * Create a new thread in LangGraph
   * POST /threads
   *
   * Note: This is called from the threadListManager, not the StorageAdapter interface
   */
  async createThread(title: string): Promise<Thread> {
    const res = await fetch(`${this.deploymentUrl}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: { title },
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to create thread: ${res.status}`);
    }

    const data: LangGraphThread = await res.json();
    log("[LangGraph] Created thread:", data.thread_id);

    return {
      threadId: data.thread_id,
      title: (data.metadata?.title as string) || title,
      createdAt: new Date(data.created_at),
      isRunning: false,
    };
  }

  /**
   * Map LangGraph message type to role
   */
  private mapMessageType(type: string): "user" | "assistant" {
    switch (type) {
      case "human":
        return "user";
      case "ai":
      case "system":
      default:
        return "assistant";
    }
  }

  /**
   * Extract text content from LangGraph message content
   */
  private extractContent(
    content: string | { type: string; text?: string }[]
  ): string {
    if (typeof content === "string") {
      return content;
    }
    // Handle array of content blocks (e.g., [{ type: "text", text: "..." }])
    return content
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join("");
  }
}
