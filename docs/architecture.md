# Architecture

## System Overview

OpsFlow is a full-stack web application for operational work management. It follows a modular MVC-oriented architecture with clear separation of concerns.

```
┌───────────────────────────────────────────┐
│            React Frontend                 │
│  (Vite + TypeScript + Tailwind CSS)       │
│                                           │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐  │
│  │  Pages  │ │Components│ │  Hooks    │  │
│  └────┬────┘ └──────────┘ └───────────┘  │
│       │                                   │
│  ┌────▼────────────────────────────────┐  │
│  │      TanStack Query + API Client    │  │
│  └────┬────────────────────────────────┘  │
└───────┼───────────────────────────────────┘
        │ HTTP / JSON
        ▼
┌───────────────────────────────────────────┐
│            Express API                    │
│                                           │
│  ┌──────────────────────────────────────┐ │
│  │           Middleware                  │ │
│  │  (Auth, Validation, Logging, Errors) │ │
│  └──────────┬───────────────────────────┘ │
│             ▼                             │
│  ┌──────────────────────────────────────┐ │
│  │            Routes                     │ │
│  │  (URL → Controller mapping)          │ │
│  └──────────┬───────────────────────────┘ │
│             ▼                             │
│  ┌──────────────────────────────────────┐ │
│  │          Controllers                  │ │
│  │  (Request/Response handling — thin)   │ │
│  └──────────┬───────────────────────────┘ │
│             ▼                             │
│  ┌──────────────────────────────────────┐ │
│  │           Services                    │ │
│  │  (Business logic and orchestration)  │ │
│  └──────────┬───────────────────────────┘ │
│             ▼                             │
│  ┌──────────────────────────────────────┐ │
│  │     Repositories / Prisma ORM        │ │
│  │  (Data access and query building)    │ │
│  └──────────┬───────────────────────────┘ │
└─────────────┼─────────────────────────────┘
              ▼
┌───────────────────────────────────────────┐
│           PostgreSQL                      │
│  (Relational data, JSONB, indexes)       │
└───────────────────────────────────────────┘
```

## Layer Responsibilities

### Routes

Map HTTP methods and URL paths to controller functions. Routes are grouped by domain (health, auth, teams, work-items). They apply relevant middleware (validation, authentication, authorization) before reaching the controller.

### Controllers

Extract data from requests (params, query, body), call the appropriate service, and format the HTTP response. Controllers should remain **thin** — they should not contain business logic.

### Services

Contain all business rules, validation logic, and orchestration. Services coordinate between repositories, enforce domain invariants, and handle complex operations like workflow transitions and concurrency checks.

### Repositories / Prisma ORM

Isolate database access. Repositories encapsulate Prisma queries, making it easier to test services with mocked data access and to change query strategies without touching business logic.

### Middleware

Handle cross-cutting concerns that apply across multiple routes:

| Middleware       | Responsibility                                         |
| ---------------- | ------------------------------------------------------ |
| Request Logger   | Logs method, URL, status code, and response time       |
| Error Handler    | Catches errors, returns structured JSON error response |
| Not Found        | Returns 404 for unmatched routes                       |
| Auth (Phase 1)   | Validates JWT and attaches user to request             |
| Validation       | Validates request body/params using Zod schemas        |
| Authz (Phase 4)  | Checks resource-level permissions                      |

### Models

Defined in the Prisma schema. Models represent database entities and their relationships. The Prisma client provides type-safe access to these models.

## Database Schema

The database uses PostgreSQL with the following entity relationships:

```
User ──┬── TeamMember ──── Team
       │
       ├── WorkItem (created by)
       │      │
       │      ├── Comment
       │      └── Activity
       │
       └── WorkItem (assigned to)

IdempotencyRecord ──── User
```

Key design choices:
- **UUIDs** for all primary keys
- **Optimistic concurrency** via `version` field on WorkItem
- **JSONB** for flexible metadata (Activity, IdempotencyRecord)
- **Composite unique constraint** `(key, userId)` on IdempotencyRecord
- **Cascade deletes** for dependent records (Comments, Activities, TeamMembers)
- **Indexes** on foreign keys and commonly filtered columns

## Error Handling Strategy

All errors flow through a centralized error-handling middleware:

1. Application code throws typed `AppError` subclasses (BadRequestError, NotFoundError, ConflictError, etc.)
2. The error middleware catches these and returns a structured JSON response
3. Unexpected errors are logged with stack traces but return a generic 500 response
4. Stack traces are never exposed in API responses

## Frontend Architecture

The frontend uses a feature-based organization:

- **Pages** render complete views for routes
- **Components** are reusable UI building blocks
- **Hooks** encapsulate shared logic (API calls via TanStack Query)
- **API Client** provides a typed interface to the backend
- **Error Boundary** catches rendering errors gracefully

TanStack Query manages server state (caching, refetching, optimistic updates), while React Router handles client-side navigation.

---

*This document will be updated as the architecture evolves through subsequent phases.*
