import { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../utils/errors';

/**
 * Catch-all for unmatched routes.
 */
export function notFoundHandler(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
}
