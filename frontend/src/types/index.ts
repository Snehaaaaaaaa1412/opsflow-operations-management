/**
 * Shared TypeScript types for the frontend.
 * These mirror the backend domain models.
 * Will be populated as modules are implemented.
 */

// ─── Common Types ───────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ─── Enums (matching backend) ───────────────────────────

export enum TeamRole {
  ADMIN = 'ADMIN',
  TEAM_LEAD = 'TEAM_LEAD',
  MEMBER = 'MEMBER',
}

export enum WorkItemStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum WorkItemPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}
