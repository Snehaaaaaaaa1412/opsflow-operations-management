/**
 * Shared TypeScript types for the frontend.
 * These mirror the backend domain models.
 * Will be populated as modules are implemented.
 */

// ─── Common Types ───────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

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

// ─── Domain Models ──────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Team {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  role?: TeamRole;
}

export interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  role: TeamRole;
  createdAt: string;
  user?: User;
}

export interface WorkItem {
  id: string;
  title: string;
  description: string | null;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  teamId: string;
  createdById: string;
  assigneeId: string | null;
  version: number;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: User;
  assignee?: User | null;
  team?: {
    id: string;
    name: string;
  };
}

export interface Comment {
  id: string;
  workItemId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: User;
}

export interface Activity {
  id: string;
  workItemId: string;
  actorId: string;
  action: string;
  metadata: Record<string, any> | null;
  createdAt: string;
  actor: User;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
}
