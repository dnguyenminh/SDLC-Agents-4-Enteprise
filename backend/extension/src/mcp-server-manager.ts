/**
 * McpServerManager — Proxy class for RemoteBackendClient (KSA-293).
 *
 * Preserves the old McpServerManager class name to minimize refactoring across UI panels,
 * but implements the new Light Client architecture connecting to the remote backend.
 *
 * NOTE: McpServerManager is an alias for RemoteBackendClient. New code should import
 * RemoteBackendClient directly for clarity.
 */

export { RemoteBackendClient as McpServerManager, RemoteBackendClient } from "./remote-backend-client";

// Re-export getNonce utility that some panels import from this module
import * as crypto from "crypto";

/**
 * Generate a cryptographic nonce for CSP script authorization.
 */
export function getNonce(): string {
  const array = crypto.randomBytes(16);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
