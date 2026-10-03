# OpsFlow — Operational Work Management

OpsFlow is an internal operational work-management application that replaces the chaos of chat, spreadsheets, email, and direct conversations with a structured system for tracking and managing operational work.

## Architecture Overview

OpsFlow uses a modular MVC-oriented architecture:

```
React Frontend (Vite + TypeScript + Tailwind CSS)
       │
       │  HTTP/JSON
       ▼
Express API (TypeScript)
       │
       ├── Middleware (logging, error handling, CORS)
       ├── Routes
       ├── Controllers (thin — delegate to services)
       ├── Services (business logic)
       └── Repositories / Prisma ORM
              │
              ▼
         PostgreSQL
```

## Technology Stack

| Layer        | Technology                                    |
| ------------ | --------------------------------------------- |
| Backend      | Node.js, TypeScript, Express                  |
| Database     | PostgreSQL, Prisma ORM                        |
| Frontend     | React, TypeScript, Vite, Tailwind CSS         |
| State        | TanStack Query (React Query)                  |
| Routing      | React Router                                  |
| Validation   | Zod                                           |
| Auth (later) | JWT, bcrypt                                   |
| Testing      | Vitest, Supertest, React Testing Library      |

## Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- **PostgreSQL** 16+ (or Docker)
- **Docker & Docker Compose** (optional, for database)

## Getting Started

### 1. Clone the repository

```bash
git clone <repo-url>
cd opsflow
```

### 2. Start PostgreSQL

**Option A — Docker Compose:**

```bash
docker compose up -d
```

**Option B — Local PostgreSQL:**

Create a database named `opsflow` and update the connection string.

### 3. Backend Setup

```bash
cd backend
npm install

# Create .env from template
cp .env.example .env
# Edit .env if needed (defaults work with Docker Compose)

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init

# Start development server
npm run dev
```

The backend runs on **http://localhost:3000**.

### 4. Frontend Setup

```bash
cd frontend
npm install

# Start development server
npm run dev
```

The frontend runs on **http://localhost:5173** and proxies `/api` requests to the backend.

## Health Endpoint

```
GET /api/health
```

Response:
```json
{
  "status": "ok"
}
```

## Running Tests

**Backend:**
```bash
cd backend
npm test
```

**Frontend:**
```bash
cd frontend
npm test
```

## Building for Production

**Backend:**
```bash
cd backend
npm run build
npm start
```

**Frontend:**
```bash
cd frontend
npm run build
npm run preview
```

## Project Structure

```
opsflow/
├── backend/
│   ├── src/
│   │   ├── config/          # Environment configuration
│   │   ├── controllers/     # Request handlers (thin)
│   │   ├── services/        # Business logic
│   │   ├── repositories/    # Data access layer
│   │   ├── models/          # Prisma client instance
│   │   ├── routes/          # Express route definitions
│   │   ├── middleware/      # Cross-cutting concerns
│   │   ├── validators/      # Zod schemas
│   │   ├── utils/           # Shared utilities
│   │   ├── tests/           # Test files
│   │   ├── app.ts           # Express app setup
│   │   └── server.ts        # Server entry point
│   ├── prisma/
│   │   ├── schema.prisma    # Database schema
│   │   └── seed.ts          # Seed data
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/             # API client
│   │   ├── components/      # Shared UI components
│   │   ├── features/        # Feature modules
│   │   ├── hooks/           # Custom hooks
│   │   ├── layouts/         # Page layouts
│   │   ├── pages/           # Route pages
│   │   ├── routes/          # Route definitions
│   │   ├── types/           # TypeScript types
│   │   └── utils/           # Shared utilities
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── docs/
│   └── architecture.md
├── README.md
├── ENGINEERING_DECISIONS.md
├── KNOWN_LIMITATIONS.md
├── docker-compose.yml
└── .gitignore
```

## Development / Engineering Highlights

- **Clean Layered MVC Architecture**: Clear separation of concerns (`Routes` → `Controllers` → `Services` → `Repositories` → `Prisma ORM` → `PostgreSQL`).
- **Resilient Concurrency & Audit Model**: PostgreSQL Prisma schema pre-designed with an optimistic concurrency `version` counter on `WorkItem`, structured JSONB audit logging (`Activity`), and user-scoped idempotency keys (`IdempotencyRecord`).
- **Centralized Error Envelope**: Standardized error hierarchy (`AppError`, `BadRequestError`, `NotFoundError`, `ConflictError`, `ValidationError`) with structured JSON API responses (`{ error: { code, message } }`).
- **Modern Full-Stack Setup**: Node.js + TypeScript + Express backend with Vitest & Supertest testing; Vite + React + TypeScript + Tailwind CSS + TanStack Query frontend.
- **Automated Verification**: End-to-end type safety, schema validation, build verification, and comprehensive baseline testing for both backend and frontend suites.

## Development Phases

This application is being developed incrementally:

- [x] **Phase 0:** Project foundation and architecture
- [ ] Phase 1: Authentication
- [ ] Phase 2: Users and Teams
- [ ] Phase 3: Work Items (basic CRUD)
- [ ] Phase 4: Authorization and resource-level access
- [ ] Phase 5: Workflow and status transitions
- [ ] Phase 6: Concurrency and stale-update protection
- [ ] Phase 7: Idempotency and duplicate-operation protection
- [ ] Phase 8: Comments and Activity/Audit History
- [ ] Phase 9: Search, filtering, sorting, and pagination
- [ ] Phase 10: Frontend dashboard and work-management UI
- [ ] Phase 11: Integration testing
- [ ] Phase 12: Documentation, architecture diagram, and final polishing
