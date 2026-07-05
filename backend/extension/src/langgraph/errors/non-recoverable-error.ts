/**
 * NonRecoverableError — KSA-233
 * Thrown when an error should NOT be retried (missing config, invalid state).
 * BaseNode.run() checks instanceof to skip retry logic.
 */
export class NonRecoverableError extends Error {
  readonly recoverable = false;

  constructor(message: string, public readonly code: string = "NON_RECOVERABLE") {
    super(message);
    this.name = "NonRecoverableError";
  }
}
