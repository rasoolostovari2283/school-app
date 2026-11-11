# EduConnect Architecture Assessment — Independent Investigation

**Audit Date:** 2026-11-11  
**Commit:** `838b5b2` (main)  
**Scope:** Architecture quality, maintainability, design patterns, technical debt, scalability boundaries

---

## Executive Summary

**Architecture Maturity:** **Prototype / Early Production**  
**Architectural Integrity:** **MODERATE** — Functional but with significant structural weaknesses  
**Maintainability:** **MODERATE** — Consistent patterns but growing technical debt  
**Scalability Ceiling:** **Single School / ~500 concurrent** — Hard limits at single-process, SQLite, in-memory Socket.IO  
**Technical Debt:** **HIGH** — Zero transactions, missing constraints, zero frontend tests, no observability

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EDUCONNECT HIGH-LEVEL ARCHITECTURE                  │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                        CLIENT LAYER (Next.js 15)                        │
  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
  │  │   Pages     │  │  Components │  │   Stores    │  │   API Lib   │   │
  │  │ (App Router)│  │  (React 19) │  │  (Zustand)  │  │  (Axios)    │   │
  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
  └────────────────────────────────┬────────────────────────────────────────┘
                                   │ HTTPS + WSS
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Single Node Process)                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Express.js + Socket.IO (Single Process)                             │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌────────────────┐   │   │
│  │  │Auth  │ │Class │ │Assign│ │Quiz  │ │Attend│ │  18 more...    │   │   │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └────────────────┘   │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │ Middleware: Auth, Error Handling, Upload, Persian Normalizer │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │ Socket.IO: Whiteboard, Chat, Screen Share, WebRTC, Live     │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │ knex (SQLite/PG)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DATABASE (SQLite default, PG optional)               │
│  44 tables, 17 migrations, WAL mode, single file (./educonnect.db)        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture Pattern Assessment

### Pattern: Monolithic Single-Process Application
**Implementation:** Express + Socket.IO in single Node.js process  
**Assessment:** ✅ **Appropriate for current scale** — Right-sized for single school, small team  
**Trade-off:** Simplicity vs. horizontal scalability — Cannot scale beyond single process

### Pattern: Module-per-Domain (Domain-Driven Design Light)
**Implementation:** 23 modules under `backend/src/modules/`, each with routes/service/controller  
**Assessment:** ✅ **Good separation** — Clear domain boundaries, consistent structure  
**Observation:** Some modules cross boundaries (AI → SIDA/Quiz/Gradebook, Quiz → Announcements)

### Pattern: Controller-Service-Routes (Layered)
**Implementation:** Most modules follow `routes → controller → service` pattern  
**Assessment:** ✅ **Consistent** — Predictable structure, easy to navigate  
**Gap:** Some modules skip controller (finance, analytics, videos, gradebook) — routes call service directly

### Pattern: Middleware Chain
**Implementation:** Express middleware chain — auth, error handling, upload, Persian normalizer  
**Assessment:** ✅ **Standard** — Well-organized, reusable

### Pattern: In-Memory State (Socket.IO Rooms)
**Implementation:** `activeClassrooms = new Map()` — all room state in process memory  
**Assessment:** ⚠️ **Limits scaling** — Cannot run multiple processes without Redis adapter  
**Trade-off:** Simplicity vs. horizontal scaling — Correct for current scale

### Pattern: File-Based Configuration
**Implementation:** `config/index.js` + `.env` + `knexfile.js`  
**Assessment:** ✅ **Standard** — Environment-based, secrets via env vars (but hardcoded defaults exist)

### Pattern: Migrations with Idempotent Guards
**Implementation:** 17 Knex migrations with `hasTable`/`hasColumn` guards  
**Assessment:** ✅ **Good practice** — Re-runnable, safe for repeated deploys  
**Gap:** `down()` migrations are destructive (drop tables), no safe rollback

### Pattern: Soft Deletes
**Implementation:** `is_active` on users, classes; `status` fields on tickets, ledgers  
**Assessment:** ✅ **Implemented** — Soft deletes on core entities  
**Gap:** No soft delete on messages, announcements, notifications — hard deletes only

### Pattern: Optimistic Locking
**Implementation:** **None** — No `version` columns, no `updated_at` checks on updates  
**Assessment:** ❌ **Missing** — Lost updates possible on concurrent edits  
**Impact:** Grade overwrites, concurrent profile updates, concurrent finance edits

### Pattern: Row-Level Security (RLS)
**Implementation:** **None** — Application-level only (`assertSameSchool`, `assertOwnsClass`)  
**Assessment:** ❌ **Missing** — Single query bug = cross-tenant data leak  
**PostgreSQL:** RLS policies not implemented (PG optional)

### Pattern: Caching
**Implementation:** In-memory `Map` cache for 4 routes (announcements, videos)  
**Assessment:** ✅ **Works at current scale** — TTL + manual invalidation  
**Gap:** Per-process only, invalidates on restart, no distributed cache

### Pattern: Background Jobs
**Implementation:** In-process `setInterval` (dbMaintenance: WAL checkpoint 6h, backup 24h)  
**Assessment:** ⚠️ **Fragile** — Blocks event loop, no persistence, no retry, no monitoring  
**Gap:** No job queue (Bull/BullMQ), no dead-letter, no visibility

### Pattern: Background AI Processing
**Implementation:** Synchronous in request handler (`paperToDigital.service.js`)  
**Assessment:** ❌ **Blocks event loop** — AI calls block Node event loop  
**Gap:** No job queue, no async processing, no progress tracking

---

## Coupling & Cohesion Analysis

### Module Coupling Matrix (Cross-Module Dependencies)

| Module | Depends On (Internal) | Coupling |
|---|---|---|
| **auth** | db, jwt, bcrypt, localCaptcha, usernameHelper, iranianValidators | Low (foundational) |
| **classes** | db, auth, messages, sida, upload, externalLive | Medium |
| **assignments** | db, auth, upload | Low |
| **quizzes** | db, auth, announcements | Medium (→ announcements) |
| **attendance** | db, auth, notifications, sms | Medium |
| **messages** | db, auth, usernameHelper, classroomPersistence | Medium |
| **notifications** | db, auth, announcements | Medium |
| **gradebook** | db, auth, auditLogger | Low |
| **finance** | db, auth, auditLogger, sms, iranianValidators | Medium |
| **ai** | db, auth, sida, quiz, iranianValidators | **High** (→ sida, quiz) |
| **school/sida** | db, auth, iranianValidators, usernameHelper | Low |
| **videos** | db, auth, cache, upload | Low |
| **announcements** | db, auth, cache, messages | Medium |
| **analytics** | db, auth | Low |
| **upload** | multer, sharp, config | None (utility) |

**Critical Cross-Module Edges (5 total):**
1. `ai/paperToDigital.service` → `school/sida.service` (importRoster)
2. `ai/paperToDigital.service` → `quizzes/quiz.service` (create quiz)
3. `classes/class.routes` → `messages/message.controller` (notifications)
3. `quiz.service.shareQuiz` → `announcements` table (direct INSERT)
4. `app.js` global quiz router → `quiz.service` (5 inline requires)

**Assessment:** Low coupling overall — but AI module violates boundaries (writes to 3 domains). Quiz→Announcements direct write bypasses module boundary.

---

## Separation of Concerns

| Layer | Implementation | Assessment |
|---|---|---|
| **Presentation** | Next.js App Router, React components | ✅ Separated (frontend repo) |
| **API/Controller** | `*.controller.js` (most modules) | ✅ Consistent |
| **Business Logic** | `*.service.js` (most modules) | ✅ Separated |
| **Data Access** | Knex.js in services | ✅ Abstracted (but raw SQL in migrations) |
| **Database** | SQLite/PG, migrations | ✅ Separated |
| **Real-time** | Socket.IO in `socket.js` | ⚠️ Mixed with HTTP (same process) |
| **Background Jobs** | In-process `setInterval` | ❌ Mixed with HTTP |
| **AI Processing** | In-request synchronous | ❌ Blocks event loop |
| **File Storage** | Local FS (`./uploads`) | ⚠️ Coupled to disk |

---

## Technical Debt Inventory

| Category | Debt Items | Severity |
|---|---|---|
| **Database** | Zero transactions, missing CHECK/UNIQUE constraints, no grade history, no financial reconciliation | **CRITICAL** |
| **Security** | CORS wildcard, JWT in localStorage, hardcoded secrets, no rate limiting on finance/Socket.IO | **CRITICAL** |
| **Transactions** | Zero `db.transaction()` calls — 8 race conditions | **CRITICAL** |
| **Testing** | Zero frontend tests, no E2E, no load testing, no chaos testing | **HIGH** |
| **Observability** | Console logging only, no metrics, no tracing, no request IDs | **HIGH** |
| **AI Safety** | PII to Google, fabricated data, review bypass, no transaction | **CRITICAL** |
| **Build/Deploy** | No lockfile, Docker broken, no CI/CD for frontend, no health checks | **HIGH** |
| **Observability** | Console logs only, no metrics, no request IDs, no structured logging | **HIGH** |
| **Background Jobs** | In-process intervals, no queue, no retry, no monitoring | **MEDIUM** |
| **File Storage** | No per-file ACL, no virus scan, EXIF preserved, local FS only | **HIGH** |
| **Background Jobs** | In-process `setInterval`, no persistence, no retry | **MEDIUM** |
| **Mobile** | Capacitor scaffold only (3 Java files) | **LOW** |
| **Documentation** | README drift (PG/Redis prerequisites false), no API docs | **MEDIUM** |
| **Code Quality** | Some modules 700+ lines, duplicated validation logic | **MEDIUM** |
| **Config** | Unused Redis config, misleading README prerequisites | **LOW** |

---

## Scalability Boundaries

| Dimension | Current Limit | Bottleneck | Mitigation |
|---|---|---|---|
| **Concurrent Users** | ~500-1000 | Single Node process, SQLite | Add Redis, PG, horizontal scaling |
| **Concurrent Socket.IO** | ~200-500 | In-memory rooms, single process | Redis adapter, horizontal scaling |
| **Database Size** | ~1-2 GB | SQLite file, WAL growth | Migrate to PG, vacuum/WAL management |
| **File Uploads** | 50 MB/file, 30 files/request | Disk I/O, Sharp CPU | Object storage, async processing |
| **AI Processing** | Sequential, blocks event loop | Blocks event loop | Job queue (BullMQ), async workers |
| **Database Writes** | Single writer (SQLite) | SQLite locking | Migrate to PG, connection pooling |
| **File Storage** | Local FS | Disk full, no redundancy | S3/GCS, CDN |
| **Backup** | Daily full copy | Disk I/O, blocks writes | Incremental, off-site, PITR |
| **Horizontal Scaling** | Impossible | In-memory Socket rooms, SQLite | Redis adapter, PG, K8s/ECS |

---

## Architectural Decision Records (Implicit)

| Decision | Rationale | Trade-off |
|---|---|---|
| **SQLite default** | Zero-config, portable, single-school | No horizontal scaling, no concurrent writers |
| **Single-process Socket.IO** | Simplicity, no Redis dependency | No horizontal scaling, room state in memory |
| **JWT in localStorage** | Simpler frontend, no cookie complexity | XSS = token theft |
| **CORS `origin: true`** | Works with tunnels, local dev | CSRF, token theft risk |
| **No transactions** | Simplicity, SQLite limitations | Data corruption risk |
| **In-memory Socket rooms** | No Redis needed | Cannot scale horizontally |
| **SQLite WAL mode** | Better concurrency | Single writer |
| **Deterministic AI fallback** | Works offline, no API key needed | Fabricates data on empty input |
| **localStorage tokens** | Simpler than httpOnly cookies | XSS = token theft |
| **Single-process background jobs** | No queue needed | Blocks event loop, no persistence |

---

## Architecture Quality Scorecard

| Dimension | Score | Notes |
|---|---|---|
| **Modularity** | 7/10 | Good module separation, minor cross-boundary violations |
| **Separation of Concerns** | 7/10 | Good layering, but AI/bg jobs mixed with HTTP |
| **Extensibility** | 6/10 | Module pattern allows additions, but coupling exists |
| **Maintainability** | 5/10 | Consistent patterns, but technical debt accumulating |
| **Testability** | 3/10 | Zero frontend tests, backend tests exist but incomplete |
| **Scalability** | 2/10 | Single-process, SQLite, in-memory state |
| **Reliability** | 3/10 | No transactions, no circuit breakers, no retries |
| **Observability** | 2/10 | Console logs only, no metrics, no tracing |
| **Security** | 2/10 | CORS, tokens, secrets, rate limiting gaps |
| **Data Integrity** | 2/10 | No transactions, missing constraints, race conditions |
| **Deployability** | 2/10 | No lockfile, broken Docker, no frontend CI |
| **Operability** | 2/10 | No DR, no monitoring, no alerting, no runbooks |

**Overall Architecture Score: 3.5/10** — **Prototype grade, not production-ready**

---

## Architectural Recommendations

### Immediate (P0 — Foundation)
1. **Add database transactions** — Wrap all multi-write operations (`db.transaction()`)
2. **Add missing constraints** — CHECK, UNIQUE on financial/academic tables
3. **Fix CORS** — Restrict origins, remove credentials from wildcard
4. **Move JWT to httpOnly cookies** — Remove from localStorage
5. **Fix Socket.IO CORS** — Restrict origins, remove credentials from wildcard
6. **Add transaction support** — Wrap finance, attendance, quiz, AI commit

### Short-term (P1 — Hardening)
1. **Add Redis adapter for Socket.IO** — Enable horizontal scaling
2. **Add PostgreSQL as primary** — Enable concurrent writers, RLS
3. **Add Redis for sessions/cache** — Replace in-memory state
4. **Add job queue (BullMQ)** — AI, emails, backups, notifications
5. **Add structured logging** — JSON, request IDs, correlation
5. **Add health endpoint with dependency checks** — DB, external services
6. **Add per-file ACL on uploads** — Check ownership before serving
7. **Add virus scanning on uploads** — ClamAV or cloud API
8. **Add CSP headers** — Mitigate XSS
9. **Add rate limiting on finance/Socket.IO** — Prevent abuse

### Medium-term (P2 — Maturity)
1. **Add PostgreSQL RLS policies** — Database-level tenant isolation
2. **Add grade history table** — Immutable audit trail
3. **Add Prometheus metrics + Grafana** — Monitoring
4. **Add OpenTelemetry tracing** — Distributed tracing
5. **Add structured logging (JSON)** — Loki/ELK compatible
5. **Add distributed tracing** — Jaeger/Zipkin
6. **Add distributed locking** — For critical sections
6. **Add automated backup verification** — integrity_check + SHA256
7. **Add off-site backup replication** — S3/GCS
7. **Add DR runbook + quarterly drills** — Documented, tested
8. **Add OpenAPI/Swagger docs** — API documentation
8. **Add contract testing** — Consumer-driven contracts
9. **Add chaos engineering** — Failure injection testing

---

## Architecture Decision Log (Proposed)

| ADR | Title | Status |
|---|---|---|
| ADR-001 | Use PostgreSQL as primary database | Proposed |
| ADR-002 | Add Redis for Socket.IO adapter + sessions | Proposed |
| ADR-003 | Implement database transactions for all multi-write operations | Proposed |
| ADR-004 | Move JWT to httpOnly cookies | Proposed |
| ADR-005 | Add Redis adapter for Socket.IO horizontal scaling | Proposed |
| ADR-006 | Implement background job queue (BullMQ) | Proposed |
| ADR-007 | Add structured JSON logging + request correlation IDs | Proposed |
| ADR-008 | Implement database-level tenant isolation (RLS) | Proposed |
| ADR-009 | Add grade history / immutable audit trail | Proposed |
| ADR-010 | Add automated backup verification + off-site replication | Proposed |

---

*Architecture assessment based on static code review of commit `838b5b2`. No runtime profiling performed.*