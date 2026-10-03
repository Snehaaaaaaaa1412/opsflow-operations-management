# Known Limitations

This document tracks known limitations, incomplete features, and technical debt.

---

## Phase 0 — Foundation

### KL-001: No Authentication

The application currently has no authentication or authorization. All endpoints are publicly accessible. This will be addressed in Phase 1.

### KL-002: No Business Logic

No business modules are implemented yet. The application only serves a health check endpoint. Work items, teams, comments, and other features will be added in subsequent phases.

### KL-003: No Production Configuration

The application is configured for development only. Production concerns such as HTTPS, rate limiting, helmet security headers, and production logging are not yet addressed.

### KL-004: No Database Connection Validation at Startup

The backend does not validate the database connection at startup. If PostgreSQL is unavailable, errors will only surface when the first database query is attempted. This may be improved in a later phase.

### KL-005: Frontend Types Not Shared with Backend

Frontend TypeScript types (enums, interfaces) are manually duplicated from the backend Prisma schema. There is no shared types package. For the current project size, this is acceptable, but it means types could drift if not carefully maintained.

### KL-006: No CI/CD Pipeline

There is no continuous integration or deployment pipeline. Tests must be run manually.

---

*Limitations will be updated as modules are implemented and technical debt is identified or resolved.*
