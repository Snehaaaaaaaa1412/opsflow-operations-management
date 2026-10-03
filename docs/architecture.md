# OpsFlow — System Architecture & Design Specification

OpsFlow is an enterprise-grade operational work-management platform built to streamline incident resolution, team coordination, task tracking, and audit compliance under high operational pressure.

---

## 1. High-Level System Architecture

OpsFlow follows a clean, decoupled client-server architecture. The frontend communicates with the backend exclusively via RESTful JSON APIs, and the backend delegates persistence and transactions to a PostgreSQL database via Prisma ORM.

```mermaid
flowchart TD
    subgraph Client["Client Tier (Frontend)"]
        UI["React 18 SPA (Vite + TypeScript)"]
        Router["React Router v6"]
        Query["TanStack Query v5 (Server Cache)"]
        Context["Auth & Team Context"]
    end

    subgraph Gateway["API Gateway / Transport Tier"]
        ViteProxy["Vite Dev Proxy / Reverse Proxy"]
        ExpressApp["Express.js Server (Port 3000)"]
        CorsLogger["CORS & Request Logger Middleware"]
    end

    subgraph Security["Security & Invariant Enforcement"]
        AuthMiddleware["JWT Authentication Middleware"]
        RBACMiddleware["Resource Authorization (Team Member / Role Guard)"]
        ZodValidator["Zod Input Validation Engine"]
    end

    subgraph Business["Domain & Orchestration Tier"]
        Controllers["Express Controllers (Thin HTTP Adapters)"]
        WorkItemService["WorkItem Service (State Machine & OCC)"]
        TeamService["Team & Membership Service"]
        AuthService["Auth Service (bcrypt & JWT)"]
        AuditService["Audit & Activity Service"]
        IdempotencyService["Idempotency Manager"]
    end

    subgraph Persistence["Data & Storage Tier"]
        Repositories["Prisma Repositories (Data Access Layer)"]
        PrismaClient["Prisma Client v6"]
        PostgresDB[("PostgreSQL Database (Neon / Cloud / Local)")]
    end

    UI --> Router
    Router --> Query
    Query --> Context
    Query -->|HTTP / JSON Requests| ViteProxy
    ViteProxy --> ExpressApp
    ExpressApp --> CorsLogger
    CorsLogger --> AuthMiddleware
    AuthMiddleware --> RBACMiddleware
    RBACMiddleware --> ZodValidator
    ZodValidator --> Controllers

    Controllers --> WorkItemService
    Controllers --> TeamService
    Controllers --> AuthService
    Controllers --> AuditService
    Controllers --> IdempotencyService

    WorkItemService --> Repositories
    TeamService --> Repositories
    AuthService --> Repositories
    AuditService --> Repositories
    IdempotencyService --> Repositories

    Repositories --> PrismaClient
    PrismaClient --> PostgresDB
```

---

## 2. Layer Responsibilities & Data Flow

OpsFlow implements strict separation of concerns across dedicated architectural layers:

```mermaid
sequenceDiagram
    autonumber
    actor User as Operator / Browser
    participant Controller as Express Controller
    participant Service as Business Domain Service
    participant OCC as Concurrency / Invariant Guard
    participant Repo as Data Repository
    participant DB as PostgreSQL Database
    participant Audit as Activity Audit Logger

    User->>Controller: POST /api/work-items/:id/transition (status, version)
    Controller->>Service: transitionWorkItemStatus(id, actorId, status, version)
    Service->>Repo: findById(id)
    Repo->>DB: SELECT * FROM work_items WHERE id = ?
    DB-->>Repo: WorkItem Record (version: N)
    Repo-->>Service: WorkItem Entity
    Service->>OCC: Verify valid transition (State Machine) & Version match (v == N)
    alt Version Mismatch (v != N)
        OCC-->>Service: Throw StaleWorkItemError (409 Conflict)
        Service-->>Controller: 409 Conflict Envelope
        Controller-->>User: HTTP 409 { code: "STALE_WORK_ITEM" }
    else Valid Version & Transition
        OCC-->>Service: Invariant Verified
        Service->>Repo: updateStatusWithVersion(id, status, version N -> N+1)
        Repo->>DB: UPDATE work_items SET status=?, version=N+1 WHERE id=? AND version=N
        DB-->>Repo: Updated WorkItem (version: N+1)
        Repo-->>Service: Updated WorkItem Entity
        Service->>Audit: recordActivity(id, actorId, "STATUS_CHANGED", { from, to })
        Audit->>DB: INSERT INTO activities (...)
        Service-->>Controller: WorkItem Data
        Controller-->>User: HTTP 200 { data: WorkItem (v: N+1) }
    end
```

---

## 3. Relational Entity-Relationship Diagram

The database schema models users, multi-tenant teams, role assignments, operational work items, threaded comments, append-only audit activities, and deduplication records.

```mermaid
erDiagram
    User ||--o{ TeamMember : "has memberships"
    Team ||--o{ TeamMember : "composed of"
    User ||--o{ WorkItem : "creates (createdBy)"
    User ||--o{ WorkItem : "assigned to (assignee)"
    Team ||--o{ WorkItem : "owns"
    WorkItem ||--o{ Comment : "contains"
    User ||--o{ Comment : "writes"
    WorkItem ||--o{ Activity : "tracks history"
    User ||--o{ Activity : "triggered by"
    User ||--o{ IdempotencyRecord : "scoped to"

    User {
        string id PK "UUID"
        string name "User full name"
        string email UK "Normalized unique email"
        string passwordHash "Bcrypt hashed password"
        datetime createdAt "Timestamp"
        datetime updatedAt "Timestamp"
    }

    Team {
        string id PK "UUID"
        string name UK "Unique team name"
        datetime createdAt "Timestamp"
        datetime updatedAt "Timestamp"
    }

    TeamMember {
        string id PK "UUID"
        string userId FK "Reference to User"
        string teamId FK "Reference to Team"
        TeamRole role "ADMIN | TEAM_LEAD | MEMBER"
        datetime createdAt "Timestamp"
    }

    WorkItem {
        string id PK "UUID"
        string title "Task title"
        string description "Detailed operational note"
        WorkItemStatus status "OPEN | IN_PROGRESS | BLOCKED | RESOLVED | CLOSED"
        WorkItemPriority priority "LOW | MEDIUM | HIGH | URGENT"
        string teamId FK "Reference to Team"
        string createdById FK "Reference to User"
        string assigneeId FK "Nullable User reference"
        int version "OCC Monotonic Version Counter"
        datetime dueAt "Nullable due date"
        datetime createdAt "Timestamp"
        datetime updatedAt "Timestamp"
    }

    Comment {
        string id PK "UUID"
        string workItemId FK "Cascade on delete"
        string authorId FK "Reference to User"
        string body "Comment text content"
        datetime createdAt "Timestamp"
        datetime updatedAt "Timestamp"
    }

    Activity {
        string id PK "UUID"
        string workItemId FK "Cascade on delete"
        string actorId FK "Reference to User"
        string action "Event action code"
        jsonb metadata "Old/New values and diffs"
        datetime createdAt "Monotonic timestamp"
    }

    IdempotencyRecord {
        string id PK "UUID"
        string key "Client Idempotency Key"
        string userId FK "Scoped to authenticated user"
        string operation "Operation route / type"
        int responseStatus "HTTP status code"
        jsonb responseBody "Cached response payload"
        datetime createdAt "Timestamp"
    }
```

---

## 4. Work Item State Machine

The core operational state machine enforces strict lifecycle invariants. Arbitrary status jumps are rejected at the service layer with an `INVALID_STATUS_TRANSITION` error.

```mermaid
stateDiagram-v2
    [*] --> OPEN : Initial Creation (v=1)

    OPEN --> IN_PROGRESS : Start Work
    OPEN --> BLOCKED : Encounter Impediment
    OPEN --> CLOSED : Abandon / Not Needed

    IN_PROGRESS --> OPEN : Return to Queue
    IN_PROGRESS --> BLOCKED : Blocked on Dependency
    IN_PROGRESS --> RESOLVED : Work Completed

    BLOCKED --> OPEN : Unblocked (Back to Queue)
    BLOCKED --> IN_PROGRESS : Unblocked (Direct Resume)
    BLOCKED --> CLOSED : Cancelled while Blocked

    RESOLVED --> IN_PROGRESS : Reopened / Verification Failed
    RESOLVED --> CLOSED : Confirmed & Finalized

    CLOSED --> OPEN : Explicit Reopen

    CLOSED --> [*] : Terminal State (Unless Reopened)
```

### State Machine Transition Invariants

| From Status | Allowed Target Statuses | Notes / Rationale |
| :--- | :--- | :--- |
| `OPEN` | `IN_PROGRESS`, `BLOCKED`, `CLOSED` | Cannot jump directly to `RESOLVED` without work being done. |
| `IN_PROGRESS` | `OPEN`, `BLOCKED`, `RESOLVED` | Work in progress can finish into `RESOLVED` or be paused. |
| `BLOCKED` | `OPEN`, `IN_PROGRESS`, `CLOSED` | Must be unblocked before it can be marked resolved. |
| `RESOLVED` | `IN_PROGRESS`, `CLOSED` | Can be closed or rejected back to active work. |
| `CLOSED` | `OPEN` | Can be revived back into the active queue. |

---

## 5. Optimistic Concurrency Control (OCC) Architecture

To prevent lost updates and race conditions under heavy operator load, Work Items maintain an integer `version` field starting at `1`.

```mermaid
sequenceDiagram
    autonumber
    actor Operator_A as Operator Alice
    actor Operator_B as Operator Bob
    participant API as OpsFlow Backend
    participant DB as PostgreSQL

    Note over Operator_A, DB: Both operators view Work Item WI-101 simultaneously (version: 1)
    Operator_A->>API: Transition to IN_PROGRESS (version: 1)
    Operator_B->>API: Transition to BLOCKED (version: 1)

    Note over API, DB: Operator Alice's request arrives first
    API->>DB: UPDATE work_items SET status='IN_PROGRESS', version=2 WHERE id='WI-101' AND version=1
    DB-->>API: 1 row affected (version incremented to 2)
    API-->>Operator_A: 200 OK (Item updated, v: 2)

    Note over API, DB: Operator Bob's request arrives second
    API->>DB: UPDATE work_items SET status='BLOCKED', version=2 WHERE id='WI-101' AND version=1
    DB-->>API: 0 rows affected (Current DB version is 2, expected 1)
    API-->>Operator_B: 409 Conflict (code: "STALE_WORK_ITEM")

    Note over Operator_B: UI intercepts 409 and displays conflict recovery banner
    Operator_B->>API: Click "Refresh Item" (fetch latest state)
    API-->>Operator_B: 200 OK (Item in IN_PROGRESS, version: 2)
```

---

## 6. Idempotency & Duplicate Operation Protection

Mutating requests (e.g. Work Item creation) accept an optional `Idempotency-Key` header. Requests are deduplicated per authenticated user:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Operator / Browser Retry
    participant Guard as Idempotency Middleware
    participant Service as Domain Service
    participant Repo as Idempotency Record Store
    participant DB as PostgreSQL

    Client->>Guard: POST /api/teams/:id/work-items (Header: Idempotency-Key: "uuid-123")
    Guard->>Repo: findByKeyAndUser("uuid-123", req.user.id)
    alt Record Exists (Completed)
        Repo-->>Guard: Cached IdempotencyRecord { status: 201, body: {...} }
        Guard-->>Client: Replay 201 Created from cache (Zero database writes)
    else Record Pending (Concurrent In-Flight Request)
        Repo-->>Guard: Record exists with status PENDING
        Guard-->>Client: 409 Conflict (code: "OPERATION_IN_PROGRESS")
    else Key Not Found
        Guard->>Repo: createPendingRecord("uuid-123", req.user.id)
        Guard->>Service: Proceed with business execution
        Service->>DB: INSERT INTO work_items (...)
        DB-->>Service: Created Work Item
        Service-->>Guard: Execution Result (Status: 201, Data)
        Guard->>Repo: updateRecord("uuid-123", status=201, responseBody=Data)
        Guard-->>Client: 201 Created (Original Response)
    end
```

---

## 7. Role-Based Access Control (RBAC) Matrix

Team access and operations are governed by three explicit roles:

| Action / Capability | `ADMIN` | `TEAM_LEAD` | `MEMBER` | Non-Member |
| :--- | :---: | :---: | :---: | :---: |
| View Team & Work Items | ✅ | ✅ | ✅ | ❌ (403) |
| Create Work Item | ✅ | ✅ | ✅ | ❌ (403) |
| Transition Work Item Status | ✅ | ✅ | ✅ | ❌ (403) |
| Add & Remove Comments | ✅ | ✅ | ✅ (Own) | ❌ (403) |
| Update Work Item Properties | ✅ | ✅ | ✅ | ❌ (403) |
| Delete Work Item | ✅ | ✅ | ❌ (403) | ❌ (403) |
| Invite / Add Members | ✅ | ✅ | ❌ (403) | ❌ (403) |
| Promote / Demote Member | ✅ | ❌ (403) | ❌ (403) | ❌ (403) |
| Remove Team Member | ✅ | ✅ (Members only) | ❌ (403) | ❌ (403) |
| Delete Team | ✅ | ❌ (403) | ❌ (403) | ❌ (403) |

---

## 8. Search, Filtering, and Pagination Pipeline

To scale reliably across tens of thousands of work items, all search and filtering queries execute directly at the PostgreSQL layer with indexed fields:

```
GET /api/teams/:teamId/work-items?search=...&status=...&priority=...&assigneeId=...&sortBy=createdAt&sortOrder=desc&page=1&limit=20
```

1. **Validation**: Zod schema validates bounds (`page >= 1`, `1 <= limit <= 100`, sanitized enum values).
2. **Query Building**:
   - `teamId`: Strictly scoped (multi-tenant boundary).
   - `search`: Case-insensitive `ILIKE` pattern across `title` and `description`.
   - `status`, `priority`, `assigneeId`: Exact match filters.
3. **Execution**:
   - Parallel `findMany` (with `skip = (page-1)*limit` and `take = limit`) and `count` queries.
4. **Envelope**:
   - Returns paginated data array along with `{ page, limit, total, totalPages }` pagination metadata.
