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

## Phase 1A — User Registration

### ED-013: User Registration, Bcrypt Hashing, and Safe User Representation

**Decision:**
- Passwords are securely hashed with `bcrypt` (10 rounds) before persistence. Plaintext passwords or hashes are strictly forbidden from being returned in API responses or written to logs.
- Emails are normalized via `.toLowerCase().trim()` before uniqueness validation and storage to prevent duplicate accounts differing only in case or whitespace.
- Duplicate emails are checked in `AuthService` and guarded against race conditions by intercepting Prisma `P2002` unique constraint violations in `PrismaUserRepository`, consistently mapping both to HTTP 409 `EMAIL_ALREADY_EXISTS`.
- Input validation is decoupled using Zod schemas (`registerSchema`) executed via a generic `validateRequest` Express middleware.
- Data access is isolated behind `IUserRepository` to decouple business logic from Prisma.

---

## Phase 1B — JWT Login & Authentication

### ED-014: JWT Authentication, Anti-Enumeration Generic Errors, and Minimal Payloads

**Decision:**
- Login endpoint (`POST /api/auth/login`) validates user credentials using `bcrypt.compare` against the stored `passwordHash`.
- Both non-existent email addresses and incorrect passwords return the exact same HTTP 401 response: `{ "error": { "code": "INVALID_CREDENTIALS", "message": "Invalid email or password." } }`. This strictly prevents user/account enumeration.
- Passwords in login requests are not trimmed to preserve exact character input, whereas emails are normalized (`.toLowerCase().trim()`) for case-insensitive authentication.
- Signed JSON Web Tokens (JWT) are generated using a minimal payload containing only the subject identifier (`{ "sub": user.id }`), along with standard `iat` and `exp` claims. No sensitive fields (passwords, hashes, PII) are ever placed in tokens.
- Token expiration defaults to `1h` (configurable via `JWT_EXPIRES_IN`) with HMAC SHA-256 signing via `JWT_SECRET`.
- The login endpoint returns `{ data: { token, user } }` where `user` is mapped through `toSafeUser`, omitting all password-related fields.

---

## Phase 2A — Teams

### ED-015: Team Ownership via `createdById` and Authentication Middleware

**Decision:**
- Established an explicit ownership relation on `Team` via `createdById` referencing `User.id` (`@relation("CreatedTeams")`), indexed with `@@index([createdById])`. This represents the minimal, non-disruptive schema change needed to record team creation before membership/roles are introduced.
- Introduced `authenticate` Express middleware in `src/middleware/authenticate.ts` that enforces Bearer token presence, verifies signature with `jwt.verify`, and populates `req.user.id`.
- All team routes (`POST /api/teams`, `GET /api/teams`, `GET /api/teams/:id`) require authentication.
- Team names must be unique. Duplicate team names return HTTP 409 `TEAM_ALREADY_EXISTS`.
- Input validation for team creation (`createTeamSchema`) is enforced via Zod (`name`: required, trimmed, min 1, max 100 characters).
- Full team membership, roles (ADMIN, TEAM_LEAD, MEMBER), and resource-level authorization are intentionally postponed to later phases.

---

## Phase 2B — Team Membership & Roles

### ED-016: Team Membership and Role Management

**Decision:**
- Team membership maps `User` to `Team` via the `TeamMember` join model with composite unique constraint `@@unique([userId, teamId])` and role enum `TeamRole` (`ADMIN`, `TEAM_LEAD`, `MEMBER`).
- Endpoint `POST /api/teams/:id/members` adds a member to a team with an optional role (defaults to `MEMBER`). Validated via `addTeamMemberSchema` (Zod).
- Checks are enforced for team existence (404 `TEAM_NOT_FOUND`), target user existence (404 `USER_NOT_FOUND`), and duplicate membership (409 `MEMBER_ALREADY_EXISTS`), with Prisma `P2002` violations caught and remapped to 409.
- Endpoint `GET /api/teams/:id/members` lists team members with safe user representations (`id`, `name`, `email`), `role`, and membership `createdAt` timestamp.
- Endpoint `DELETE /api/teams/:id/members/:userId` removes a team member and returns HTTP 204 No Content. Returns 404 `TEAM_NOT_FOUND` if the team does not exist, or 404 `MEMBER_NOT_FOUND` if the target user is not a member.
- Data access is isolated behind `ITeamMemberRepository` / `PrismaTeamMemberRepository`.
- Resource-level authorization and caller permission checks (e.g. verifying caller is ADMIN before adding/removing members) are strictly postponed to Phase 2C.

---

## Phase 2C — Authorization & Permissions

### ED-017: Resource-Level Authorization

**Decision:**
- **Authentication vs Authorization:** Authentication verifies caller identity via cryptographic JWT Bearer tokens, rejecting unauthenticated or malformed requests with HTTP 401 `UNAUTHORIZED`. Authorization determines what an authenticated user may do on a specific resource, returning HTTP 403 `FORBIDDEN` when the caller lacks membership or sufficient role permissions.
- **Evaluation Against TeamMember:** Authorization is resource-aware and evaluated against the caller's membership in the target team (`TeamMember` join model). Global user roles or creator status (`createdById`) alone do not grant access; permissions depend strictly on the actor's `TeamRole` (`ADMIN`, `TEAM_LEAD`, `MEMBER`) within the specific team.
- **Server-Side Enforcement:** All permission boundaries are strictly enforced on the server. Every team and membership route validates the actor's team membership and role before returning data or applying mutations, preventing horizontal privilege escalation across teams and vertical privilege escalation within teams.
- **Explicit Roles & Hierarchy:**
  - `ADMIN`: Full access within the team (view team, view members, add any member role, remove any member, change any member role).
  - `TEAM_LEAD`: Operational delegation (view team, view members, add `MEMBER`, remove `MEMBER`, promote `MEMBER` to `TEAM_LEAD`). Prohibited from removing `ADMIN` or other `TEAM_LEAD`s, assigning or promoting to `ADMIN`, and demoting `ADMIN`.
  - `MEMBER`: Read-only access within their team (view team, view members). Prohibited from adding/removing members or modifying roles.
- **Unauthorized Team Access Returns 403:** If a team exists but the caller is not a member, the API returns HTTP 403 `FORBIDDEN`. To enforce complete resource isolation, `GET /api/teams` filters exclusively by the authenticated user's memberships (`findByUserId`), preventing cross-tenant enumeration.
- **Centralized Authorization Service:** Permission rules are centralized within `AuthorizationService` (`requireTeamMember`, `requireTeamRole`, `canAddMember`, `canRemoveMember`, `canChangeRole`) to avoid scattering ad-hoc conditional logic across routes or controllers.
- **Team Creator Automatic ADMIN Membership:** When a team is created (`POST /api/teams`), the creator is automatically provisioned as an `ADMIN` member in `team_members`. This prevents orphaned teams and ensures immediate, coherent resource-level access for the creator.

---

## Phase 3 — Work Items / Core Operations

### ED-018: Core Work Item Domain & Team-Scoped Operations

**Decision:**
- **Domain Entity & Defaults:** Work items represent operational tasks strictly owned by a team. Initial status defaults to `OPEN` and priority defaults to `MEDIUM`. The `version` integer field defaults to 1 for forward-compatibility with future optimistic concurrency controls.
- **Team-Scoped Resource Access:** Work items cannot exist without an owning team. Creating (`POST /api/teams/:teamId/work-items`) and listing (`GET /api/teams/:teamId/work-items`) require caller membership in that team (403 `FORBIDDEN` otherwise). Direct operations (`GET`, `PATCH`, `DELETE` on `/api/work-items/:id`) resolve the work item's owning team and verify caller membership.
- **Assignment Safety Boundary:** When assigning or reassigning a work item (`assigneeId`), the service layer verifies that the assignee exists and is an active member of the work item's team. Cross-team assignment attempts are rejected with HTTP 400 `INVALID_ASSIGNEE`.
- **Role-Restricted Deletion:** Deleting work items is restricted to team `ADMIN` and `TEAM_LEAD` roles. General `MEMBER` users receive HTTP 403 `FORBIDDEN`, preventing accidental or unauthorized operational task deletion.
- **Generic Update Boundaries:** The generic `PATCH /api/work-items/:id` endpoint allows updating `title`, `description`, `priority`, and `assigneeId` (or unassigning via `null`), but strictly disallows altering `status`, `id`, `teamId`, `createdById`, or `version`. Status transitions are intentionally deferred to dedicated workflow logic in later phases.
- **Data Protection:** Work item responses project `createdBy` and `assignee` relations as safe user objects (`id`, `name`, `email`), ensuring password hashes and credentials are never exposed.

---

## Phase 4/5 — Workflow & Status Transitions

### ED-019: Work Item Workflow & Status State Machine Transitions

**Decision:**
- **Explicit State Transitions vs. Generic Mutability:** Work item status can NOT be altered via generic resource updates (`PATCH /api/work-items/:id`). Status changes must pass through dedicated transition endpoints (`POST /api/work-items/:id/transition` and `PATCH /api/work-items/:id/status`) that validate business invariants against an explicit finite state machine.
- **Allowed Finite State Transitions:**
  - `OPEN` $\rightarrow$ `IN_PROGRESS`, `BLOCKED`, `CLOSED`
  - `IN_PROGRESS` $\rightarrow$ `OPEN` (return to backlog), `BLOCKED`, `RESOLVED`
  - `BLOCKED` $\rightarrow$ `OPEN`, `IN_PROGRESS` (unblocked/resumed), `CLOSED` (abandoned)
  - `RESOLVED` $\rightarrow$ `IN_PROGRESS` (verification failure), `CLOSED` (accepted/finalized)
  - `CLOSED` $\rightarrow$ `OPEN` (reopened)
- **Disallowed / Illegal Transitions:**
  - Direct resolution jumps from unworked or blocked states (e.g. `OPEN` $\rightarrow$ `RESOLVED`, `BLOCKED` $\rightarrow$ `RESOLVED`) are rejected with HTTP 400 `INVALID_STATUS_TRANSITION`.
  - Direct transitions out of `CLOSED` to non-open states (e.g. `CLOSED` $\rightarrow$ `IN_PROGRESS`, `CLOSED` $\rightarrow$ `RESOLVED`, `CLOSED` $\rightarrow$ `BLOCKED`) are rejected with HTTP 400 `INVALID_STATUS_TRANSITION`.
  - Self-transitions (transitioning to the exact same current status) are rejected with HTTP 400 `INVALID_STATUS_TRANSITION` ("Work item is already in status '...'").
- **Authorization & Access Control:**
  - Status transitions require active membership in the work item's owning team (enforced via `AuthorizationService.requireTeamMember`). Non-team callers receive HTTP 403 `FORBIDDEN`.
  - All team member roles (`ADMIN`, `TEAM_LEAD`, and `MEMBER`) have operational agency to progress items through valid state machine transitions within their team.
- **Validation:**
  - Payloads are validated via `transitionWorkItemSchema` (Zod), rejecting invalid enum values or missing status attributes with HTTP 400 `VALIDATION_ERROR`.
- **Dual REST/RPC Endpoint Support:** Both `POST /api/work-items/:id/transition` (action-oriented RPC pattern) and `PATCH /api/work-items/:id/status` (RESTful sub-resource pattern) are supported and behave identically.

---

## Phase 6 — Concurrency & Stale Update Protection

### ED-020: Optimistic Concurrency Control & Stale-Update Protection

**Decision:**
- **Optimistic Concurrency Model (`WorkItem.version`):**
  - Work items maintain an integer `version` field initialized to `1` upon creation.
  - Every mutating operation on existing work items (`PATCH /api/work-items/:id` and status transitions via `POST /api/work-items/:id/transition` or `PATCH /api/work-items/:id/status`) requires the client to supply the `version` it read.
  - On every successful update or status transition, `version` is atomically incremented by exactly `+1` (`version: { increment: 1 }`).
- **Why Versioning is Used:**
  - High-stress operational systems have multiple team members viewing, updating, and transitioning work items concurrently.
  - Without versioning, a user submitting changes based on an outdated view would silently overwrite edits made by a coworker ("lost update anomaly").
  - Optimistic locking avoids the performance overhead, lock contention, and deadlock hazards of pessimistic database row locks (`SELECT FOR UPDATE`), providing high throughput under normal operation while guaranteeing absolute safety during conflicts.
- **Atomic Database-Level Enforcement:**
  - Checking the version in memory in Node.js before updating is insufficient because concurrent requests can interleave between read and write (time-of-check to time-of-use race condition).
  - Concurrency checks must execute atomically within the database engine:
    ```sql
    UPDATE work_items
    SET ..., version = version + 1, updated_at = NOW()
    WHERE id = :id AND version = :expectedVersion;
    ```
  - Executed in Prisma via `prisma.workItem.updateMany({ where: { id, version: expectedVersion }, data: { ...fields, version: { increment: 1 } } })`.
  - If the affected rows count is `0`, the update is rejected because the target row's version was already changed by a prior committed transaction (or does not exist).
- **HTTP 409 Conflict (`STALE_WORK_ITEM`):**
  - When a stale version is detected, the API immediately halts mutation and returns HTTP 409 Conflict with envelope:
    ```json
    {
      "error": {
        "code": "STALE_WORK_ITEM",
        "message": "The work item has been modified since it was last read."
      }
    }
    ```
  - Database internals are never exposed. The client can re-fetch the latest state (`GET /api/work-items/:id`), present differences to the user, and re-attempt.
- **Workflow State Machine Integration:**
  - Status transitions validate both state machine rules (`ALLOWED_STATUS_TRANSITIONS`) and version invariants simultaneously.
  - A transition fails atomically if either the transition path is invalid or the expected version is stale.
- **Client Contract & Schema Validation:**
  - The `version` attribute is strictly required in request bodies for `updateWorkItemSchema` and `transitionWorkItemSchema`. It must be a positive integer (`z.number().int().positive()`). Arbitrary strings, negative values, and non-integer values are rejected with HTTP 400 `VALIDATION_ERROR`.
  - Non-mutating read operations (`GET`) and deletions (`DELETE`) do not require version checks.

---

## Phase 7 — Idempotency & Duplicate Operation Protection

### ED-021: Database-Backed Idempotency for Mutating Operations

**Decision:** Implement database-backed idempotency protection using the existing `IdempotencyRecord` Prisma model, scoped per authenticated user (`@@unique([key, userId])`), with SHA-256 operation fingerprinting and atomic reservations.

**Rationale & Technical Architecture:**

- **Purpose & Resilience:**
  - Operations under pressure frequently encounter retried requests caused by client double-clicks, mobile connection reconnects, browser background retries, and reverse-proxy timeouts.
  - Without idempotency protection, retries can duplicate work items or trigger spurious workflow/concurrency errors (e.g. attempting to re-apply an already transitioned state).
- **Target Mutating Operations:**
  - `POST /api/teams/:teamId/work-items` (Work Item Creation)
  - `POST /api/work-items/:id/transition` (Status Transition)
  - `PATCH /api/work-items/:id/status` (Status Transition)
- **Header Contract & Validation:**
  - Clients provide the `Idempotency-Key` HTTP header (case-insensitive retrieval via Express `req.header()`).
  - If the header is missing, execution is transparent (calls `next()` without caching or reservations).
  - If provided, the key must be a non-empty string of up to 255 characters. Empty strings, whitespace-only keys, and keys exceeding 255 characters are rejected with HTTP 400 `INVALID_IDEMPOTENCY_KEY`.
- **User Scoping & Isolation:**
  - The key is strictly scoped to the authenticated `userId`: `@@unique([key, userId])`.
  - Independent users submitting identical idempotency keys (e.g., standard client UUIDs or counters) never collide with or block one another.
- **Operation Fingerprinting & Conflicting Reuse:**
  - Fingerprint format: `${METHOD}:${NORMALIZED_PATH}:${SHA256(CANONICAL_BODY)}`.
  - JSON keys are sorted recursively (`canonicalizeJson`) before hashing to guarantee deterministic fingerprint comparison regardless of JSON key serialization order.
  - If an existing record for `(key, userId)` is found with a different fingerprint, the API rejects the request immediately with HTTP 409 `IDEMPOTENCY_KEY_REUSED` without modifying any resources.
- **Atomic Reservation & Concurrency Safety:**
  - To prevent concurrent duplicate requests from both executing the downstream mutation, the middleware attempts an atomic reservation insert (`responseStatus: 0`) in the database.
  - A concurrent request attempting the same operation hits the database unique constraint (`P2002`). It catches the conflict and awaits completion (`waitForCompletion`) via polling.
  - Once the leader request completes successfully, both requests return the exact same HTTP response and data payload without creating duplicate records.
- **Failure Resilience & Reservation Release:**
  - Only successful responses (`200 <= status < 300`) are stored in `IdempotencyRecord`.
  - If an operation fails (e.g., HTTP 400 validation error, 403 authorization error, or unhandled 500 error), the pending reservation is deleted. This allows the client to correct invalid parameters and retry the operation safely.

---

## Phase 8 — Comments & Activity/Audit History

### ED-022: Activity and Audit History

**Decision:** Maintain an append-only `Activity` audit trail distinct from `WorkItem` state, recording `workItemId`, `actorId`, `action`, `metadata` (structured JSONB), and `createdAt` on successful mutating operations, alongside work item collaboration comments.

**Rationale & Technical Architecture:**

- **Separation of Audit History from WorkItem State:**
  - `WorkItem` represents the *current mutable state* of an operational task (its current status, priority, title, assignee, and concurrency version).
  - An audit trail represents the *immutable chronological sequence of events* that led to that current state.
  - Conflating current state with historical events leads to bloated entities, complex queries, and potential data corruption. By keeping `Activity` in a dedicated append-only table, query performance for current work items remains optimal while audit records cannot be altered by regular work item updates.
- **Actor, Timestamp, and Action Triad:**
  - Every operational change under pressure must answer: *who did what, and when?*
  - `actorId` explicitly attributes actions to the authenticated user (`req.user.id`), preventing impersonation.
  - `createdAt` provides unambiguous chronological sequencing for post-incident reviews, compliance audits, and team coordination.
  - Standardized action identifiers (`WORK_ITEM_CREATED`, `WORK_ITEM_UPDATED`, `STATUS_CHANGED`, `ASSIGNEE_CHANGED`, `COMMENT_ADDED`, `COMMENT_DELETED`, `WORK_ITEM_DELETED`) enable programmatic filtering, timeline rendering, and automated alerting.
- **Structured JSONB Metadata vs. Arbitrary Text:**
  - Traditional text logs ("User Bob changed priority to HIGH") are brittle and difficult to localize, parse, or query programmatically.
  - Structured JSONB metadata records exact before/after diffs (e.g., `{ changes: { priority: { from: "MEDIUM", to: "HIGH" } } }` or `{ from: "OPEN", to: "IN_PROGRESS", version: 2 }`).
  - This allows the frontend to render localized, rich visual diffs, while preserving full machine-readability and PostgreSQL JSONB indexing support.
- **Tying Audit Creation to Successful Mutations:**
  - Audit records are only generated when mutations succeed. Failed mutations (due to validation failures, stale concurrency conflicts, or permission denials) do not generate audit records, preventing false audit entries.
  - In the event of an audit write failure, the error is not silently swallowed; the operation fails so the client is not falsely informed that the mutation succeeded without reliable audit tracking.
- **Collaborative Comments:**
  - Comments provide conversational context alongside work items.
  - Comment author is strictly derived from the authenticated token (`req.user.id`) and validated against team membership.
  - Comment deletion is authorized only for the comment author or team leadership (ADMIN / TEAM_LEAD).

---

## Phase 9 — Search, Filtering, Sorting, and Pagination

### ED-023: Database-Level Search, Filtering, Sorting, and Pagination

**Decision:** Enforce all work item filtering, text search, sorting, and pagination strictly within the database query layer (PostgreSQL via Prisma), rejecting any in-memory array manipulation, bounded by strict validation and backed by targeted composite indexes.

**Rationale & Technical Architecture:**

- **Database-Level Execution & Memory Protection:**
  - Operations teams manage tens of thousands of active and historical work items. Fetching large result sets into Node.js application memory to filter or paginate (`array.filter()`, `array.slice()`) creates catastrophic CPU and memory spikes, increases Garbage Collection pauses, and causes out-of-memory server crashes.
  - Pushing `where`, `orderBy`, `skip`, and `take` to PostgreSQL delegates sorting and filtering to the database engine's optimized query planner, b-tree indexes, and streaming execution, keeping backend memory usage flat and predictable (`O(limit)` rather than `O(total)`).
- **Strictly Bounded Pagination:**
  - `page` defaults to 1 and `limit` defaults to 20, with an enforced upper ceiling of `limit=100`.
  - Non-positive values (`page < 1`, `limit < 1`) or requests exceeding `limit > 100` are rejected at the edge with HTTP 400 Bad Request.
  - Bounded pagination defends against Denial of Service (DoS) attacks where a malicious client requests `limit=1000000`, exhausting database connection buffers and network bandwidth.
- **Whitelisted Sort Fields & Direction:**
  - Allowed sort fields are strictly whitelisted to known client-facing attributes: `createdAt`, `updatedAt`, `priority`, `status`, `title`.
  - Sort direction is strictly constrained to `asc` or `desc`.
  - Whitelisting protects against arbitrary column sorting that could leak internal database schema details, trigger unindexed full-table scans, or generate runtime Prisma query exceptions.
- **Composite Index Design & Tradeoffs:**
  - In OpsFlow, work item queries are always team-scoped (`teamId`). Standalone indexes on `status` or `priority` would require multi-index bitmap heap scans or full index scans filtered by `teamId`.
  - Adding composite indexes leading with `teamId`:
    - `@@index([teamId, status])`
    - `@@index([teamId, priority])`
    - `@@index([teamId, assigneeId])`
    - `@@index([teamId, createdAt])`
  - *Tradeoff:* Composite indexes consume additional disk space and slightly increase write overhead during work item creation and updates. However, for an operations management platform where read/filter/dashboard workloads dwarf write rates, sub-millisecond query latency on team-scoped operational queues is well worth the negligible write cost.
- **Consistent Response Envelope:**
  - Responses wrap results in `{ data: [...], meta: { page, limit, total, totalPages } }`.
  - `total` represents the total count of matching items across all pages calculated atomically via `prisma.workItem.count({ where })`, allowing frontend clients to render accurate pagination controls.

---

*Future decisions will be added as modules are implemented.*



