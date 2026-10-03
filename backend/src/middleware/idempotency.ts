import { Request, Response, NextFunction } from 'express';
import {
  IdempotencyService,
  idempotencyService as defaultIdempotencyService,
  computeOperationFingerprint,
} from '../services/idempotencyService';
import {
  InvalidIdempotencyKeyError,
  UnauthorizedError,
} from '../utils/errors';
import { logger } from '../utils/logger';

export function idempotency(
  service: IdempotencyService = defaultIdempotencyService
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const rawHeader =
      req.header('idempotency-key') ?? req.header('Idempotency-Key');

    // If no header is provided, execute transparently
    if (rawHeader === undefined) {
      return next();
    }

    // Validate header format
    if (
      typeof rawHeader !== 'string' ||
      rawHeader.trim().length === 0 ||
      rawHeader.length > 255
    ) {
      return next(
        new InvalidIdempotencyKeyError(
          'Idempotency-Key header must be a non-empty string of up to 255 characters.',
          'INVALID_IDEMPOTENCY_KEY'
        )
      );
    }

    const key = rawHeader.trim();
    const userId = req.user?.id;

    if (!userId) {
      return next(
        new UnauthorizedError(
          'Authentication token required.',
          'UNAUTHORIZED'
        )
      );
    }

    const normalizedPath = (req.originalUrl || req.url || '').split('?')[0]!;
    const operation = computeOperationFingerprint(
      req.method,
      normalizedPath,
      req.body
    );

    try {
      const reservation = await service.checkOrReserve(key, userId, operation);

      if (reservation.completed) {
        res.status(reservation.status).json(reservation.body);
        return;
      }

      // Intercept response methods to record result or release reservation
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);
      let responseHandled = false;

      const handleResponse = async (status: number, body: unknown) => {
        if (responseHandled) return;
        responseHandled = true;

        if (status >= 200 && status < 300) {
          try {
            const serializedBody =
              body !== undefined ? JSON.parse(JSON.stringify(body)) : null;
            await service.recordSuccess(key, userId, status, serializedBody);
          } catch (err: any) {
            logger.error('Failed to record idempotency response', {
              error: err?.message,
              key,
              userId,
            });
          }
        } else {
          try {
            await service.releaseReservation(key, userId);
          } catch (err: any) {
            logger.error('Failed to release idempotency reservation', {
              error: err?.message,
              key,
              userId,
            });
          }
        }
      };

      res.json = function (body: any) {
        res.json = originalJson;
        res.send = originalSend;

        handleResponse(res.statusCode, body)
          .catch(() => {})
          .finally(() => {
            originalJson(body);
          });

        return res;
      };

      res.send = function (body: any) {
        res.json = originalJson;
        res.send = originalSend;

        let parsed = body;
        try {
          if (typeof body === 'string') {
            parsed = JSON.parse(body);
          }
        } catch {
          // not JSON format
        }

        handleResponse(res.statusCode, parsed)
          .catch(() => {})
          .finally(() => {
            originalSend(body);
          });

        return res;
      };

      res.on('close', () => {
        if (!responseHandled) {
          responseHandled = true;
          void service.releaseReservation(key, userId);
        }
      });

      next();
    } catch (error) {
      next(error);
    }
  };
}

export const idempotencyMiddleware = idempotency;
export const idempotent = idempotency;
