# Known Limitations & Future Roadmap

This document records the current operational limitations, intentional architectural trade-offs, and technical debt of the OpsFlow platform as of Phase 12 completion.

---

## 1. Resolved Historical Limitations

The following initial Phase 0 limitations have been systematically resolved:

- **[RESOLVED] KL-001: Authentication & Authorization:** Implemented comprehensive JWT authentication with bcrypt password hashing (12 salt rounds), team multi-tenancy, and resource-level role-based authorization (`ADMIN`, `TEAM_LEAD`, `MEMBER`) across all API routes and frontend contexts.
- **[RESOLVED] KL-002: Business Logic & Operations:** Implemented full Work Item domain CRUD, state machine workflow transitions, optimistic concurrency control (`version`), idempotency deduplication (`(key, userId)`), comments collaboration, immutable audit history, and database-level search, filter, sort, and pagination.

---

## 2. Current Production & Operational Limitations

### KL-003: Polling / Manual Refresh vs Real-Time WebSocket Updates
- **Current State:** The React frontend utilizes TanStack Query with caching and invalidation queries on mutations. Cross-operator updates are surfaced when operators perform mutations, reload the dashboard, or encounter an OCC 409 conflict.
- **Trade-off:** Chose TanStack Query HTTP polling/invalidation to minimize operational complexity and avoid stateful WebSocket server infrastructure.
- **Future Direction:** Introduce WebSockets or Server-Sent Events (SSE) to push instant notifications when another team member updates an active work item.

### KL-004: Rate Limiting & Denial-of-Service Protection
- **Current State:** The Express server utilizes standard request logging and input validation via Zod schemas, but does not currently apply IP-based rate limiting on sensitive authentication endpoints (e.g. `express-rate-limit`).
- **Trade-off:** Kept transport layer lightweight for test execution speed and minimal dependencies during development.
- **Future Direction:** Add `express-rate-limit` with Redis-backed token buckets on `/api/auth/*` routes in production environments.

### KL-005: Out-of-Process Background Job Queue
- **Current State:** All operational mutations (including activity logging and idempotency bookkeeping) execute synchronously within the Express request lifecycle and Prisma transactions.
- **Trade-off:** Simplifies deployment architecture to a single Node.js runtime and PostgreSQL database without requiring a separate message broker.
- **Future Direction:** Introduce an asynchronous queue (e.g. BullMQ with Redis) for secondary side-effects such as external email/Slack webhook dispatches.

### KL-006: File and Artifact Attachments
- **Current State:** Work items and comments support formatted markdown text and structured JSON metadata, but binary file attachments (e.g. screenshot PNGs or log files) are not stored directly.
- **Trade-off:** Avoided coupling data storage to cloud object stores (S3 / GCS) for initial MVP operational requirements.
- **Future Direction:** Integrate S3 presigned URLs for direct object store uploads linked to work item comments.

### KL-007: Distributed Tracing & APM
- **Current State:** Structured console logger formats ISO timestamps and JSON metadata for local and containerized inspection.
- **Trade-off:** Zero overhead and zero external APM vendor lock-in.
- **Future Direction:** Adopt OpenTelemetry instrumentation or Pino structured logging for distributed log aggregation (Datadog, Grafana Loki).

### KL-008: Monorepo Package Sharing
- **Current State:** Frontend and backend maintain decoupled TypeScript type definitions mirroring the Prisma schema.
- **Trade-off:** Allows independent building and testing of frontend and backend without a monorepo workspace coordinator like Turborepo.
- **Future Direction:** Extract shared types into a `packages/shared` workspace package.
