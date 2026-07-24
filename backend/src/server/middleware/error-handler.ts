/**
 * Global error boundary middleware.
 * Catches unhandled errors and returns structured error responses.
 */

import type { ErrorHandler } from 'hono';
import type { Logger } from 'pino';

export function createErrorHandler(logger: Logger): ErrorHandler {
  return (err, c) => {
    logger.error({ err, path: c.req.path, method: c.req.method }, 'Unhandled error');

    return c.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
        },
      },
      500
    );
  };
}
