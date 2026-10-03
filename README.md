# OpsFlow — Operational Work Management

OpsFlow is a mission-critical, enterprise operational work-management platform designed to coordinate incident response, manage operational queues, prevent lost updates under concurrency contention, and provide immutable audit trails.

---

## Architecture Overview

OpsFlow follows a modular MVC-oriented, layered architecture:

```
React Frontend (Vite + TypeScript + Tailwind CSS + TanStack Query)
       │
       │  HTTP / REST / JSON
       ▼
Express API (TypeScript)
       │
       ├── Middleware (Request Logging, CORS, JWT Auth, Resource RBAC, Zod Validation)
       ├── Routes
       ├── Controllers (Thin HTTP Adapters)
       ├── Services (Domain Logic, State Machine, OCC Guard, Idempotency Manager)
       └── Repositories / Prisma ORM
              │
              ▼
    PostgreSQL Database (Neon Cloud / Local / Docker)
```

Detailed visual architecture diagrams (High-Level Topology, Sequence Diagrams, ER Diagrams, and State Machine specifications) are documented in [`docs/architecture.md`](docs/architecture.md).

---

## Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Backend** | Node.js, TypeScript, Express.js |
| **Database & ORM** | PostgreSQL (Neon Serverless / Local), Prisma ORM v6 |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS |
| **State & Data Fetching** | TanStack Query v5 (React Query), React Router v6 |
| **Validation & Security** | Zod, JWT (`jsonwebtoken`), `bcrypt` (12 salt rounds) |
| **Testing** | Vitest, Supertest, React Testing Library, jsdom |

---

## Core Capabilities & Engineering Highlights

- **State Machine Enforcement**: Work items transition through strict operational statuses (`OPEN` ➔ `IN_PROGRESS` ➔ `RESOLVED` ➔ `CLOSED` / `BLOCKED`), preventing illegal status skips.
- **Optimistic Concurrency Control (OCC)**: Prevents lost updates using atomic monotonic `version` checking (`WHERE version = expected`), returning HTTP 409 `STALE_WORK_ITEM` with client conflict recovery banners.
- **Idempotency & Duplicate Operation Protection**: Database-backed atomic request deduplication scoped to `(key, userId)` preventing double-billing / double-dispatch on client retries.
- **Multi-Tenant Role-Based Access Control (RBAC)**: Team-scoped isolation with granular role enforcement (`ADMIN`, `TEAM_LEAD`, `MEMBER`).
- **Comprehensive Audit Trail**: Append-only `activities` table logging every mutation with actor reference, timestamp, and diff metadata.
- **Database-Level Search & Pagination**: Full-text searching, multi-field filtering, and indexed sorting executed entirely at the PostgreSQL layer with pagination metadata (`total`, `totalPages`, `pageSize`).

---

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **PostgreSQL** (Free cloud instance like [Neon.tech](https://neon.tech) / [Supabase](https://supabase.com) or local PostgreSQL 16+)

---

## Quick Start Guide

### 1. Clone the repository

```bash
git clone https://github.com/Snehaaaaaaaa1412/opsflow-operations-management.git
cd opsflow
```

### 2. Configure Database

Create `backend/.env` with your PostgreSQL connection URL (e.g. from Neon.tech):

```env
DATABASE_URL="postgresql://user:password@host/neondb?sslmode=require"
JWT_SECRET="your-secure-jwt-secret-key"
JWT_EXPIRES_IN="24h"
PORT=3000
NODE_ENV=development
CORS_ORIGIN="http://localhost:5173"
```

### 3. Backend Setup

```bash
cd backend
npm install

# Push database schema to PostgreSQL
npx prisma db push

# Generate Prisma Client
npx prisma generate

# Start backend server
npm run dev
```
The backend starts on **http://localhost:3000**.

### 4. Frontend Setup

In a new terminal:

```bash
cd frontend
npm install

# Start development server
npm run dev
```
The frontend starts on **http://localhost:5173** and proxies `/api/*` requests to the backend.

---

## API Reference Summary

### Authentication
- `POST /api/auth/register` — Register a new operator account
- `POST /api/auth/login` — Authenticate and receive signed JWT
- `GET /api/auth/me` — Retrieve current authenticated session

### Teams & Memberships
- `POST /api/teams` — Create a new operational team (assigns creator as `ADMIN`)
- `GET /api/teams` — List teams the authenticated user belongs to
- `GET /api/teams/:id` — Retrieve team details and roster
- `POST /api/teams/:id/members` — Invite/add member (`ADMIN` or `TEAM_LEAD`)
- `PATCH /api/teams/:id/members/:userId` — Update member role (`ADMIN` only)
- `DELETE /api/teams/:id/members/:userId` — Remove team member

### Work Items
- `POST /api/teams/:teamId/work-items` — Create work item (supports `Idempotency-Key`)
- `GET /api/teams/:teamId/work-items` — Query work items with search, filter, sort & pagination
- `GET /api/work-items/:id` — Get work item details
- `PATCH /api/work-items/:id` — Update work item (enforces OCC `version`)
- `DELETE /api/work-items/:id` — Delete work item (`ADMIN` or `TEAM_LEAD`)
- `POST /api/work-items/:id/transition` — Transition status (enforces state machine and `version`)

### Comments & Audit History
- `POST /api/work-items/:id/comments` — Add operational comment
- `GET /api/work-items/:id/comments` — List threaded comments
- `DELETE /api/work-items/:id/comments/:commentId` — Delete comment (author or admin)
- `GET /api/work-items/:id/activity` — Get immutable chronological audit trail

---

## Verification & Test Suites

The codebase includes comprehensive unit, service, concurrency, authorization, and multi-module integration test suites:

```bash
# Run all backend tests (227 passing tests)
cd backend
npm test

# Run all frontend tests (21 passing tests)
cd frontend
npm test
```

| Suite | Tests | Result |
| :--- | :---: | :---: |
| **Backend Suites** (Auth, Teams, Authz, Work Items, Workflow, OCC, Idempotency, Comments, Activity, Query, Integration) | 227 | ✅ Passed |
| **Frontend Suites** (App Shell, Auth, Dashboard, Work Item Detail, Integration Flows) | 21 | ✅ Passed |
| **Total Automated Tests** | **248** | **✅ 100% Passed** |

---

## Development Phases

- [x] **Phase 0:** Project foundation and architecture
- [x] **Phase 1:** Authentication (User registration, JWT login, authentication middleware)
- [x] **Phase 2:** Users and Teams (Team management, memberships, and roles)
- [x] **Phase 3:** Work Items (Core CRUD operations, assignment safety)
- [x] **Phase 4:** Authorization and resource-level access (Team and work item permissions)
- [x] **Phase 5:** Workflow and status transitions (State machine validation)
- [x] **Phase 6:** Concurrency and stale-update protection (Optimistic locking via version field)
- [x] **Phase 7:** Idempotency and duplicate-operation protection (Database-backed deduplication records)
- [x] **Phase 8:** Comments and Activity/Audit History (Work item comments, structured activity audit trail)
- [x] **Phase 9:** Search, filtering, sorting, and pagination
- [x] **Phase 10:** Frontend dashboard and work-management UI
- [x] **Phase 11:** Integration testing (Scenarios A through I)
- [x] **Phase 12:** Documentation, architecture diagram, and final polishing
