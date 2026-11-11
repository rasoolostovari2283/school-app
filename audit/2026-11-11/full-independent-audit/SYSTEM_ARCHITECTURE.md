# EduConnect System Architecture — Independent Analysis

**Audit Date:** 2026-11-11  
**Commit:** `838b5b2` (main)  
**Analysis Type:** Zero-Assumption Independent Architecture Mapping

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            EDUCONNECT SYSTEM ARCHITECTURE                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐     HTTPS/WSS      ┌──────────────────────────────────┐
│   FRONTEND       │ ◄─────────────────► │           BACKEND                │
│  (Next.js 15)    │   REST + Socket.IO  │        (Express.js)              │
│                  │                     │                                  │
│  • React 19      │                     │  • Express 4.21                  │
│  • App Router    │                     │  • Socket.IO 4.7                 │
│  • Zustand       │                     │  • Knex.js (SQLite/PG)           │
│  • Tailwind CSS  │                     │  • JWT (access + refresh)        │
│  • ~50k LOC      │                     │  • ~12k LOC (modules)            │
└────────┬─────────┘                     └──────────────┬───────────────────┘
         │                                                │
         │ HTTPS                                        │ knex
         ▼                                                ▼
┌─────────────────────┐                        ┌─────────────────────────┐
│   EXTERNAL AI       │                        │      DATABASE            │
│   (Google Gemini)   │                        │   SQLite (default)       │
│                     │                        │   PostgreSQL (optional)  │
│ • gemini-3.8-flash  │                        │   44 tables              │
│ • Multimodal        │                        │   17 migrations          │
│ • Response schema   │                        │   WAL mode               │
└─────────────────────┘                        └─────────────────────────┘
         │                                                │
         │                                                │
         ▼                                                ▼
┌─────────────────────┐                        ┌─────────────────────────┐
│   FILE STORAGE      │                        │   BACKGROUND JOBS        │
│   (Local FS)        │                        │   (In-process)           │
│                     │                        │                           │
│ • ./backend/uploads │                        │ • dbMaintenance          │
│ • UUID filenames    │                        │   - WAL checkpoint       │
│ • Sharp optimization│                        │   - Daily backups        │
│ • EXIF preserved ⚠  │                        │ • Socket.IO cleanup      │
└─────────────────────┘                        └─────────────────────────┘

         │                                                │
         ▼                                                ▼
┌─────────────────────┐                        ┌─────────────────────────┐
│   MOBILE (Capacitor)│                        │   EXTERNAL SERVICES      │
│                     │                        │                           │
│ • 3 Java files      │                        │ • Google Gemini AI       │
│ • WebView wrapper   │                        │ • SMS Gateway (stub)     │
│ • Scaffold only     │                        │ • Tunnel (Pinggy/Cloudflare)│
└─────────────────────┘                        └─────────────────────────┘
```

---

## Component Responsibility Map

### Backend Subsystems (`backend/src/modules/` — 23 modules)

| Module | Responsibility | Key Files | Dependencies |
|--------|---------------|-----------|--------------|
| **auth** | Authentication, registration, sessions, roles | `auth.routes`, `auth.service`, `auth.controller` | `db`, `jwt`, `bcrypt`, `middleware/auth` |
| **classes** | Class CRUD, roster, invites, live settings | `class.routes`, `class.service`, `class.controller` | `db`, `auth`, `messages` |
| **assignments** | Assignment CRUD, submissions, grading | `assignment.routes`, `assignment.service` | `db`, `auth`, `upload` |
| **quizzes** | Quiz CRUD, questions, attempts, sharing | `quiz.routes`, `quiz.service`, `quiz.controller` | `db`, `auth`, `announcements` |
| **attendance** | Sessions, check-in, reports, history | `attendance.routes`, `attendance.service` | `db`, `auth`, `notifications`, `sms` |
| **messages** | 1:1 chat, groups, calls, directory | `message.routes`, `message.service` | `db`, `auth`, `usernameHelper` |
| **notifications** | User notifications, broadcasts | `notification.routes`, `notification.service` | `db`, `auth`, `announcements` |
| **gradebook** | Categories, scores, reports, transcripts | `gradebook.routes` | `db`, `auth`, `auditLogger` |
| **finance** | Ledgers, installments, payments, receipts | `finance.routes` | `db`, `auth`, `auditLogger`, `sms`, `iranianValidators` |
| **ai** | Paper-to-digital, OCR, commit pipeline | `ai.routes`, `paperToDigital.service`, `ai.service` | `db`, `auth`, `sida`, `quiz`, `gemini` |
| **school** | SIDA roster import, settings | `school.routes`, `sida.service` | `db`, `auth`, `iranianValidators` |
| **videos** | Video library, streaming, external sync | `video.routes` | `db`, `auth`, `cache`, `upload` |
| **announcements** | Class/school announcements | `announcement.routes`, `announcement.service` | `db`, `auth`, `cache` |
| **messages** | 1:1, groups, calls | `message.routes`, `message.service` | `db`, `auth`, `usernameHelper` |
| **notifications** | In-app notifications | `notification.routes`, `notification.service` | `db`, `auth` |
| **courses** | Course catalog, enrollments | `course.routes` | `db`, `auth` |
| **schedules** | Weekly timetables | `schedule.routes` | `db`, `auth` |
| **discipline** | Behavior records | `discipline.routes` | `db`, `auth` |
| **tickets** | Internal ticketing | `ticket.routes` | `db`, `auth` |
| **analytics** | School analytics | `analytics.routes` | `db`, `auth` |
| **feedback** | Feedback/suggestions | `feedback.routes` | `db`, `auth` |
| **studyPlanner** | Study logs, planning | `studyPlanner.routes`, `studyPlanner.service` | `db`, `auth` |
| **discipline** | Discipline records | `discipline.routes` | `db`, `auth` |
| **tickets** | Ticketing system | `ticket.routes` | `db`, `auth` |
| **analytics** | Analytics dashboard | `analytics.routes` | `db`, `auth` |
| **upload** | File upload, optimization | `upload.routes` | `multer`, `sharp`, `auth` |

### Core Infrastructure (`backend/src/`)

| Component | File | Responsibility |
|---|---|---|
| **App Entry** | `app.js` | Express setup, middleware chain, route mounting, Socket.IO init, health checks, backup API |
| **Socket.IO** | `socket.js` | Real-time: whiteboard, chat, screen share, WebRTC, live class, permissions |
| **Auth Middleware** | `middleware/auth.js` | JWT validation, RBAC, class ownership, school isolation |
| **Error Handling** | `middleware/errorHandler.js` | Global error responses, validation, multer errors |
| **Database** | `config/database.js` | Knex instance (SQLite default, PG optional) |
| **Config** | `config/index.js`, `config/knexfile.js` | Environment, DB, JWT, Redis (unused), upload config |
| **Utils** | `utils/` | Audit logger, cache, validators, db helpers, captcha |

### Database Schema (44 Tables)

| Domain | Tables | Key Relationships |
|---|---|---|
| **Identity** | `users`, `schools` | `users.school_id` → `schools` (nullable) |
| **Classroom** | `classes`, `class_members`, `invite_links` | `classes.school_id`→`schools`, `classes.teacher_id`→`users`, `class_members` links users↔classes |
| **Family** | `parent_student_links` | Links parent↔student, `is_verified` default false |
| **Academic** | `assignments`, `submissions`, `quizzes`, `quiz_questions`, `quiz_attempts`, `gradebook_categories`, `gradebook_scores`, `gradebook_shared_reports` | Class-scoped, student-scoped |
| **Attendance** | `attendance_sessions`, `attendance_records` | Session-scoped, student-scoped |
| **Communication** | `messages`, `announcements`, `announcement_acknowledgements`, `message_groups`, `message_group_members`, `message_group_messages`, `call_sessions`, `notifications` | User/class scoped |
| **Media** | `videos`, `courses`, `course_enrollments`, `academic_events`, `feedback` | Class/user scoped |
| **Administrative** | `weekly_schedules`, `discipline_records`, `counseling_cases`, `school_tickets`, `school_ticket_messages`, `study_logs`, `gradebook_shared_reports` | School/class scoped |
| **Financial** | `tuition_ledgers`, `tuition_installments` | Student-scoped, school-scoped |
| **System** | `audit_logs`, `live_classroom_sessions`, `revoked_tokens`, `system_settings`, `teacher_lesson_plans`, `teacher_documents`, `student_study_notes` | System-wide |

### Frontend Architecture (`frontend/src/`)

| Layer | Structure | Technology |
|---|---|---|
| **App Router** | `app/` — 27 dashboard sections, login, root | Next.js 15 App Router |
| **State** | `stores/` — `authStore` (Zustand), `classStore` | Zustand |
| **API Client** | `lib/api.js` | Axios + interceptors, origin allow-list, token refresh |
| **Real-time** | `lib/socket.js` | Socket.IO client, token from localStorage |
| **Components** | `components/` — 7 categories, ~50 components | React 19, Tailwind CSS |
| **Mobile** | `android/` | Capacitor (3 Java files, scaffold) |

---

## Key Execution Paths

### 1. User Authentication Flow
```
POST /api/v1/auth/login
    → auth.service.login()
        → bcrypt.compare()
        → generateTokens() → JWT (access + refresh)
        → returns { user, accessToken, refreshToken }
Frontend: stores tokens in localStorage, sets authStore.user
Subsequent requests: api.js interceptor adds Authorization header
Socket.IO: handshake sends token via auth callback
```

### 2. Class Join & Live Session Flow
```
Frontend: ClassDetailPage → getSocket().emit('join_class', {classId})
Socket.IO: 
  → io.use() handshake: JWT verify + revoked_tokens check
  → join_class: assertOwnsClass() → socket.join(`class:${classId}`)
  → getOrCreateClassroom() → in-memory Map
  → start_live: isRoomTeacher() check → room.isLive=true → broadcast
  → wb_draw/wb_sync_all: canUserDraw() → room.whiteboardStrokes → broadcast
  → screen_frame: NO AUTH CHECK ⚠ → broadcast to room
  → end_live: room.isLive=false, clearSession() → persists to DB
```

### 3. Finance Settlement Flow (CRITICAL - NO TRANSACTION)
```
POST /finance/verify-installment/:id  OR  POST /finance/callback-verify/:id
    → finance.routes.js
    → SELECT installment → SELECT ledger
    → CHECK status !== 'verified'
    → UPDATE installment SET status='verified'
    → READ ledger.paid_amount, ledger.balance
    → COMPUTE newPaid = paid + amount, newBalance = max(0, balance - amount)
    → UPDATE ledger SET paid_amount, balance, status
    → logAudit()
    → (callback-verify) → send SMS receipt
⚠ NO db.transaction() — RACE CONDITION
```

### 4. AI Paper-to-Digital Pipeline
```
POST /ai/extract → paperToDigitalService.extractFromPaper()
    → IF GEMINI_API_KEY: callGeminiVisionExtractor() → structured JSON
    → ELSE: parseDeterministically() — deterministic Persian parser
    → postProcessExtractedItems() → adds needs_review, confidence
    → Returns { mode, engine, items[], feasibility_assessment }

POST /ai/commit → paperToDigitalService.commitExtractedData()
    → mode='roster': sidaService.importRoster() → creates users, classes, parents
    → mode='gradesheet': direct gradebook_scores INSERT/UPSERT
    → mode='exam': quizService.create() → creates quiz + questions
⚠ NO TRANSACTION — writes to 3 domains independently
⚠ IGNORES needs_review flag — commits unreviewed items
```

### 5. File Upload Flow
```
POST /api/v1/upload (multer.any())
    → upload.middleware (multer.diskStorage + fileFilter)
    → processImageOptimization() — sharp: rotate, resize, compress, thumbnail
    → Returns { url, thumb_url, size, mimetype }
    → Served via app.use('/uploads', authenticate, express.static(...))
    ⚠ NO per-file ACL — any authenticated user can access any file
```

---

## Data Flow Summary

```
┌─────────────┐     REST API      ┌─────────────┐     Knex      ┌─────────────┐
│  FRONTEND   │ ◄────────────────► │   BACKEND   │ ◄────────────► │  DATABASE   │
│  (Next.js)  │   JSON + Socket.IO │  (Express)  │   SQL (SQLite) │  (SQLite)   │
└─────────────┘                    └─────────────┘                └─────────────┘
        │                                │                                │
        │ Socket.IO                      │ In-process                     │
        ▼                                ▼                                │
┌─────────────┐                 ┌─────────────────┐                      │
│  REAL-TIME  │                 │  BACKGROUND     │                      │
│  (Socket.IO)│                 │  JOBS           │                      │
└─────────────┘                 └─────────────────┘                      │
        │                                │                                │
        ▼                                ▼                                │
┌─────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL SERVICES                                │
│  • Google Gemini AI (PII sent)    • SMS Gateway (stub)                 │
│  • Tunnel (Pinggy/Cloudflare)     • APK download                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Architectural Patterns Used

| Pattern | Implementation | Assessment |
|---|---|---|
| **Monolithic Single-Process** | Express + Socket.IO in one Node process | ✅ Right-sized for current scale |
| **Module-per-Domain** | 23 modules under `src/modules/` | ✅ Good separation |
| **Controller-Service-Routes** | Most modules follow this | ✅ Consistent |
| **Middleware Chain** | Express middleware for auth, errors, uploads | ✅ Standard |
| **In-Memory State** | Socket.IO rooms in `Map`, no Redis | ⚠️ Limits scaling |
| **File-based Config** | `config/index.js` + `.env` | ✅ Standard |
| **Migrations** | Knex migrations (17) with idempotent guards | ✅ Good practice |
| **Soft Deletes** | `is_active` on users, classes | ✅ Implemented |
| **Soft Deletes (Data)** | `status` fields, `deleted_at` timestamps | Partial |
| **Optimistic Locking** | None — no version columns | ❌ Missing |
| **Transactions** | **Zero** `db.transaction()` calls | ❌ Critical gap |
| **Row-Level Security** | None — app-level only | ❌ Missing |
| **Caching** | In-memory `Map` for 4 routes | ✅ Works at scale |

---

## Integration Points

| Internal | External |
|---|---|
| Auth → All modules (middleware) | Google Gemini API (AI) |
| Classes → Assignments, Quizzes, Attendance, Messages, Videos, Gradebook, Finance | SMS Gateway (stub) |
| Users → All modules (FK) | Tunnel (Pinggy/Cloudflare) |
| Classes → Live (Socket.IO) | APK download |
| Uploads → All modules (attachments) | APK install |
| Notifications → All modules | — |

---

## Architectural Decisions & Trade-offs

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
| **Single-process background jobs** | No job queue needed | Blocks event loop, no persistence |

---

## Scaling Boundaries

| Dimension | Current Limit | Bottleneck |
|---|---|---|
| **Concurrent users** | ~500-1000 | Single Node process, SQLite |
| **Concurrent Socket.IO** | ~200-500 | In-memory rooms, single process |
| **Database size** | ~1-2 GB | SQLite file size, WAL growth |
| **File uploads** | 50 MB/file, 30 files/request | Disk I/O, Sharp CPU |
| **AI processing** | Sequential, no queue | Blocks event loop |
| **Backup** | Daily, full file copy | Disk I/O, blocks writes |

---

## Architectural Recommendations

### Immediate (P0)
1. **Add database transactions** — Wrap all multi-write operations
2. **Add missing constraints** — CHECK, UNIQUE on financial/academic tables
3. **Fix CORS** — Restrict origins, remove credentials from wildcard
4. **Move JWT to httpOnly cookies** — Remove from localStorage
5. **Fix Socket.IO CORS** — Remove `origin: true` with credentials
5. **Remove hardcoded secrets** — Generate at deploy time

### Short-term (P1)
1. **Add per-file ACL** — Check ownership before serving uploads
2. **Add virus scanning** — ClamAV or cloud API on uploads
3. **Add structured logging** — JSON, request IDs, correlation
4. **Add health endpoint with DB check** — For orchestration
5. **Add backup verification** — `PRAGMA integrity_check` + SHA256
6. **Add rate limiting on finance/Socket.IO** — Prevent abuse

### Medium-term (P2)
1. **Add Redis adapter for Socket.IO** — Enable horizontal scaling
2. **Add PostgreSQL as primary** — Enable concurrent writers, RLS
3. **Add grade history table** — Immutable audit trail
4. **Add background job queue** — Bull/BullMQ for AI, emails, backups
4. **Add observability** — Prometheus metrics, structured logs, tracing
5. **Add DR plan + tested restores** — Documented, tested quarterly

---

*Architecture analysis based on static code review of commit `838b5b2`. No runtime profiling performed.*