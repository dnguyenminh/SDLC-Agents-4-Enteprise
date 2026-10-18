/**
 * Sentinel for an over-cap request body — caught at the readBody call site in
 * handleMcp and mapped to a clean HTTP 413 + JSON-RPC error envelope (never a
 * socket reset, the original SA4E-363 bug). Matched via instanceof, never by
 * message string.
 */
export class BodyTooLargeError extends Error {
  constructor() {
    super("Request body too large");
    this.name = "BodyTooLargeError";
  }
}
