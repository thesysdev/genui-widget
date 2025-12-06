import type { StorageAdapter } from "./StorageAdapter";
import type { LangGraphConfig } from "../types";
import { LocalStorageAdapter } from "./LocalStorageAdapter";
import { NoOpStorageAdapter } from "./NoOpStorageAdapter";
import { LangGraphStorageAdapter } from "./LangGraphStorageAdapter";

export type { StorageAdapter } from "./StorageAdapter";
export { LocalStorageAdapter } from "./LocalStorageAdapter";
export { NoOpStorageAdapter } from "./NoOpStorageAdapter";
export { LangGraphStorageAdapter } from "./LangGraphStorageAdapter";

/**
 * Factory function to create a storage adapter based on the storage type
 * @param type - The type of storage to use
 * @param langgraphConfig - LangGraph configuration (required when type is "langgraph")
 * @returns An instance of the appropriate StorageAdapter
 */
export function createStorageAdapter(
  type: "none" | "localstorage" | "langgraph",
  langgraphConfig?: LangGraphConfig
): StorageAdapter {
  switch (type) {
    case "langgraph":
      if (!langgraphConfig?.deploymentUrl) {
        throw new Error(
          "LangGraph deploymentUrl is required when using langgraph storage"
        );
      }
      return new LangGraphStorageAdapter(langgraphConfig.deploymentUrl);
    case "localstorage":
      return new LocalStorageAdapter();
    case "none":
    default:
      return new NoOpStorageAdapter();
  }
}
