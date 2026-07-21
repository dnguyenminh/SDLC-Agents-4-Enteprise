/**
 * SA4E-50 — Repository error hierarchy.
 * Typed errors for database operations, enabling structured error handling in routes.
 * Implements: BR-07
 */

/**
 * Base error for all repository operations.
 * Wraps underlying database errors with context-safe messages.
 */
export class RepositoryError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'RepositoryError';
    // Preserve original stack trace for debugging
    if (cause?.stack) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/**
 * Thrown when a database operation is attempted without an active connection.
 */
export class DatabaseNotConnectedError extends RepositoryError {
  constructor() {
    super('Database connection is not available');
    this.name = 'DatabaseNotConnectedError';
  }
}

/**
 * Thrown when a UNIQUE or FOREIGN KEY constraint is violated.
 */
export class ConstraintViolationError extends RepositoryError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'ConstraintViolationError';
  }
}

/**
 * Translate raw database errors into typed RepositoryError subclasses.
 * @param err - The raw error from the database layer
 * @returns A typed RepositoryError instance
 */
export function translateError(err: unknown): RepositoryError {
  if (err instanceof RepositoryError) {
    return err;
  }
  if (err instanceof Error) {
    const msg = err.message || '';
    if (msg.includes('UNIQUE constraint') || msg.includes('FOREIGN KEY')) {
      return new ConstraintViolationError(msg, err);
    }
    if (msg.includes('not connected') || msg.includes('database is closed')) {
      return new DatabaseNotConnectedError();
    }
    return new RepositoryError(msg, err);
  }
  return new RepositoryError(String(err));
}
