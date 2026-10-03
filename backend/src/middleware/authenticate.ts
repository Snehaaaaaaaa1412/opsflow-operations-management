import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UnauthorizedError } from '../utils/errors';

export interface AuthPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
      };
    }
  }
}

/**
 * Middleware that requires a valid JWT Bearer token in the Authorization header.
 * Attaches the authenticated user's ID to `req.user`.
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authentication token required.', 'UNAUTHORIZED');
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    throw new UnauthorizedError('Authentication token required.', 'UNAUTHORIZED');
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as AuthPayload;
    if (!decoded.sub) {
      throw new UnauthorizedError('Invalid authentication token.', 'UNAUTHORIZED');
    }

    req.user = {
      id: decoded.sub,
    };

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else if (
      error instanceof jwt.JsonWebTokenError ||
      error instanceof jwt.TokenExpiredError
    ) {
      next(
        new UnauthorizedError(
          'Invalid or expired authentication token.',
          'UNAUTHORIZED'
        )
      );
    } else {
      next(error);
    }
  }
}
