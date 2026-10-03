import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Global error-handling middleware.
 * Catches all errors thrown or passed via next(err).
 * Returns a consistent JSON error envelope.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Handle known operational errors
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      error: {
        code: err.code,
        message: err.message,
      },
    };

    // Include validation details if present
    if (err instanceof ValidationError && err.details) {
      (body.error as Record<string, unknown>).details = err.details;
    }

    if (err.statusCode >= 500) {
      logger.error(err.message, { code: err.code, stack: err.stack });
    }

    res.status(err.statusCode).json(body);
    return;
  }

  // Unexpected errors — log fully, return generic message
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    name: err.name,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
