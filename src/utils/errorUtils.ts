/**
 * Utility functions for error handling.
 */

/**
 * Extract a human-readable message from an unknown error.
 * Handles Error instances, strings, and other types.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
