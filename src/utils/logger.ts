/**
 * Window namespace for chat configuration
 */
declare global {
  interface Window {
    __THESYS_CHAT__?: {
      enableDebugLogging?: boolean;
    };
  }
}

/**
 * Check if debug logging is enabled
 */
function isDebugEnabled(): boolean {
  return window.__THESYS_CHAT__?.enableDebugLogging === true;
}

/**
 * Log a message to console if debug logging is enabled
 */
export function log(...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.log("[ThesysChat]", ...args);
  }
}

/**
 * Log an error to console (always shown, not gated by debug flag)
 * Errors are important enough to always be visible
 */
export function logError(...args: unknown[]): void {
  console.error("[ThesysChat]", ...args);
}

/**
 * Log a warning to console if debug logging is enabled
 */
export function logWarn(...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.warn("[ThesysChat]", ...args);
  }
}
