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

/**
 * Normalize an error to an Error instance and log it
 * Use this for internal logging without notifying consumers
 *
 * @param error - The caught error (unknown type)
 * @param context - Description of where the error occurred
 * @returns The normalized Error object
 */
export function normalizeError(error: unknown, context: string): Error {
  const err = error instanceof Error ? error : new Error(String(error));
  logError(`${context}:`, err.message);
  return err;
}

/**
 * Handle an error at a boundary: normalize, log, and notify consumer
 * Only call this at top-level boundaries (SDK callbacks, initialization)
 * Inner code should just throw - don't call this in nested handlers
 *
 * @param error - The caught error (unknown type)
 * @param context - Description of where the error occurred
 * @param onError - Callback to notify consumers
 * @returns The normalized Error object for re-throwing
 */
export function handleError(
  error: unknown,
  context: string,
  onError?: (error: Error) => void
): Error {
  const err = normalizeError(error, context);
  onError?.(err);
  return err;
}
