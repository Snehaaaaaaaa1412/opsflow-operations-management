# Engineering Decisions

This document records key architectural and engineering decisions made during development, along with their rationale.

---

## Phase 0 — Foundation

### ED-001: Monorepo Structure (Backend + Frontend)

**Decision:** Use a flat monorepo with `backend/` and `frontend/` as top-level directories, without a monorepo tool like Turborepo or Nx.

**Rationale:** The project is a single application with one backend and one frontend. A tool like Turborepo adds complexity without proportional benefit at this scale. Each directory has its own `package.json` and can be developed, tested, and built independently.

---

### ED-002: Prisma ORM with PostgreSQL

**Decision:** Use Prisma as the sole ORM/data-access layer with PostgreSQL.

**Rationale:** Prisma provides type-safe database access, automatic migration generation, and a declarative schema format. PostgreSQL was chosen for its robustness, JSONB support (useful for activity metadata and idempotency records), and strong concurrency primitives.

---

### ED-003: UUIDs for Primary Keys

**Decision:** Use UUIDs (`@default(uuid())`) instead of auto-incrementing integers.

**Rationale:**
- Avoids exposing sequential IDs that leak information (e.g., how many users exist).
- Enables safe client-side ID generation in the future.
- Better suited for distributed systems if needed later.
- Trade-off: Slightly larger storage and slower index performance than integers, but acceptable for an internal operations tool.

---

### ED-004: Optimistic Concurrency via `version` Field

**Decision:** Include a `version` integer field on WorkItem, starting at 1.

**Rationale:** This enables optimistic concurrency control in later phases. When a client updates a work item, it sends the `version` it read. The backend can atomically check `WHERE version = expected` and increment, rejecting stale updates with a 409 Conflict. This is simpler and more performant than pessimistic locking for a web application.

---

### ED-005: Snake_case Database Columns, CamelCase Application Code

**Decision:** Use Prisma's `@@map` and `@map` to store database columns in snake_case while using camelCase in TypeScript code.

**Rationale:** snake_case is the PostgreSQL convention and makes raw SQL queries readable. camelCase is the TypeScript/JavaScript convention. Prisma's mapping bridges the two cleanly.

---

### ED-006: JSONB for Activity Metadata and Idempotency Response Body

**Decision:** Use PostgreSQL's JSONB type for `Activity.metadata` and `IdempotencyRecord.responseBody`.

**Rationale:** Activity metadata varies by action type (e.g., status change records old/new status, assignment change records old/new assignee). JSONB provides schema flexibility for these varied payloads while supporting indexing and querying.

---

### ED-007: Structured Error Response Format

**Decision:** Use a consistent error envelope: `{ error: { code: string, message: string, details?: unknown } }`.

**Rationale:** A predictable error format simplifies frontend error handling and debugging. The `code` field enables programmatic error handling (e.g., show different UI for CONFLICT vs UNAUTHORIZED), while `message` provides human-readable context.

---

### ED-008: Idempotency Key Scoped to User

**Decision:** The idempotency record uses a composite unique constraint of `(key, userId)` rather than just `key`.

**Rationale:** Different users may legitimately perform the same operation. Scoping to the user prevents one user's idempotency key from conflicting with another's, while still protecting against duplicate submissions from the same user.

---

### ED-009: Cascading Deletes for Dependent Records

**Decision:** Use `onDelete: Cascade` for Comments, Activities, and TeamMembers when their parent (WorkItem, Team) is deleted.

**Rationale:** Orphaned comments or activity records serve no purpose. Cascading simplifies cleanup. User deletion also cascades to TeamMember records, but WorkItem relations to User (createdBy, assignee) do NOT cascade — deleting a user should not silently delete all their created work items. This will be handled explicitly in the user management phase.

---

### ED-010: Simple Console Logger

**Decision:** Use a lightweight wrapper around `console.log` with timestamps and levels instead of a structured logging library like Pino or Winston.

**Rationale:** For an internal tool in early development, the overhead of a logging framework isn't justified. The wrapper provides consistent formatting and can be replaced later if structured logging becomes necessary.

---

### ED-011: Vite Proxy for API Requests

**Decision:** Configure Vite's dev server to proxy `/api` requests to the backend at `localhost:3000`.

**Rationale:** This avoids CORS issues during development and mirrors a production reverse-proxy setup. The frontend never needs to know the backend's actual URL during development.

---

### ED-012: TanStack Query with Conservative Defaults

**Decision:** Configure TanStack Query with `retry: 1`, `refetchOnWindowFocus: false`, and `staleTime: 30_000`.

**Rationale:** Default TanStack Query behaviour (3 retries, refetch on focus) is too aggressive for an internal tool. One retry handles transient network issues. Disabling refetch-on-focus prevents unexpected background requests. A 30-second stale time reduces unnecessary refetches.

---

*Future decisions will be added as modules are implemented.*
