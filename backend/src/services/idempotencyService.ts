import crypto from 'crypto';
import {
  IIdempotencyRepository,
  idempotencyRepository,
  IdempotencyRecordEntity,
} from '../repositories/idempotencyRepository';
import {
  IdempotencyConflictError,
  ConflictError,
} from '../utils/errors';

export function canonicalizeJson(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(canonicalizeJson);
  }
  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    result[key] = canonicalizeJson((obj as Record<string, unknown>)[key]);
  }
  return result;
}

export function computeOperationFingerprint(
  method: string,
  path: string,
  body: unknown
): string {
  const canonicalBody = canonicalizeJson(body ?? {});
  const bodyHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalBody))
    .digest('hex');
  return `${method.toUpperCase()}:${path}:${bodyHash}`;
}

export type CheckOrReserveResult =
  | { completed: true; status: number; body: unknown }
  | { completed: false };

export class IdempotencyService {
  constructor(
    private repository: IIdempotencyRepository = idempotencyRepository
  ) {}

  async checkOrReserve(
    key: string,
    userId: string,
    operation: string
  ): Promise<CheckOrReserveResult> {
    const existing = await this.repository.findByKeyAndUserId(key, userId);

    if (existing) {
      if (existing.operation !== operation) {
        throw new IdempotencyConflictError(
          'Idempotency key has already been used with different request parameters.',
          'IDEMPOTENCY_KEY_REUSED'
        );
      }

      if (existing.responseStatus > 0) {
        return {
          completed: true,
          status: existing.responseStatus,
          body: existing.responseBody,
        };
      }

      // Record is currently in-flight (responseStatus === 0). Await completion.
      const completed = await this.waitForCompletion(key, userId, operation);
      return {
        completed: true,
        status: completed.responseStatus,
        body: completed.responseBody,
      };
    }

    // Record does not exist: attempt atomic reservation
    try {
      await this.repository.create({
        key,
        userId,
        operation,
        responseStatus: 0,
        responseBody: null,
      });
      return { completed: false };
    } catch (error: any) {
      // Handle unique constraint conflict from concurrent insertion
      if (
        error.code === 'P2002' ||
        error.message?.includes('Unique constraint') ||
        error.message?.includes('already exists')
      ) {
        const raceExisting = await this.repository.findByKeyAndUserId(
          key,
          userId
        );
        if (raceExisting) {
          if (raceExisting.operation !== operation) {
            throw new IdempotencyConflictError(
              'Idempotency key has already been used with different request parameters.',
              'IDEMPOTENCY_KEY_REUSED'
            );
          }
          if (raceExisting.responseStatus > 0) {
            return {
              completed: true,
              status: raceExisting.responseStatus,
              body: raceExisting.responseBody,
            };
          }
          const completed = await this.waitForCompletion(
            key,
            userId,
            operation
          );
          return {
            completed: true,
            status: completed.responseStatus,
            body: completed.responseBody,
          };
        }
      }
      throw error;
    }
  }

  async waitForCompletion(
    key: string,
    userId: string,
    _operation: string,
    timeoutMs = 5000,
    pollIntervalMs = 25
  ): Promise<IdempotencyRecordEntity> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const record = await this.repository.findByKeyAndUserId(key, userId);
      if (record && record.responseStatus > 0) {
        return record;
      }
      if (!record) {
        throw new ConflictError(
          'In-flight operation was aborted. Please retry the request.',
          'IN_FLIGHT_REQUEST_ABORTED'
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new ConflictError(
      'Concurrent request timed out waiting for in-flight operation to complete.',
      'CONCURRENT_OPERATION_TIMEOUT'
    );
  }

  async recordSuccess(
    key: string,
    userId: string,
    responseStatus: number,
    responseBody: unknown
  ): Promise<void> {
    await this.repository.update(key, userId, {
      responseStatus,
      responseBody,
    });
  }

  async releaseReservation(key: string, userId: string): Promise<void> {
    await this.repository.delete(key, userId);
  }
}

export const idempotencyService = new IdempotencyService();
