# AD-02 — System Diagrams (ASCII)

Independent architectural assessment @ `main` 838b5b2 · 2026-11-11
All diagrams derived from direct source reads this session; numbers match AD-03 dependency analysis.

---

## 1. System Context (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            EDUCONNECT ECOSYSTEM                             │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐     HTTPS/JSON + WS      ┌──────────────────────────────┐
  │   USERS      │ ◄──────────────────────► │       BACKEND (Express)      │
  │              │   REST API + Socket.IO   │  Single Node.js process      │
  │  • Teachers  │                          │  Port 5000                   │
  │  • Students  │                          │  API + Realtime + Scheduler  │
  │  • Parents   │                          └──────────────┬───────────────┘
  │  • Admins    │                                         │
  └──────┬───────┘                                         │
         │                                                 │
         │ HTTPS                                           │ knex
         ▼                                                 ▼
  ┌──────────────┐                              ┌─────────────────────┐
  │   FRONTEND   │                              │    DATABASE         │
  │  (Next.js 15)│                              │  SQLite (default)   │
  │  Port 3000   │                              │  WAL mode           │
  │  ~50k LOC    │                              │  44 tables          │
  │  27 sections │                              │  (PG opt-in)        │
  └──────────────┘                              └─────────────────────┘
         │                                                 │
         │                    ┌────────────────────────────┘
         │                    │
         ▼                    ▼
  ┌─────────────────────────────────────┐
  │         FILE STORAGE                │
  │   ./backend/uploads/ (multer)       │
  │   ./backend/db_backups/ (cron)      │
  └─────────────────────────────────────┘
```

**External dependencies (opt-in / not shipped):** PostgreSQL (`DB_CLIENT=pg`), Redis (config block exists, **zero consumers**), Gemini AI (`GEMINI_API_KEY`), SMS gateway (stubbed).

---

## 2. Container Diagram — Backend Process (C4 Level 2)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND NODE PROCESS (PID 1)                             │
│  src/app.js  →  helmet • cors(open) • rate-limit(2 zones) • morgan(dev)        │
│  Socket.IO server (in-memory rooms)  +  Scheduler (WAL flush on SIGTERM)       │
└─────────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
  │  HTTP ROUTER     │     │  SOCKET.IO       │     │  SCHEDULER       │
  │  (Express)       │     │  (ws + polling)  │     │  (setInterval)   │
  └────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
           │                        │                        │
           ▼                        ▼                        ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                      MIDDLEWARE CHAIN                                   │
  │  authenticate(JWT) → authorize(roles) → assertSameSchool/assertOwns*   │
  └─────────────────────────────────────────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                    21 DOMAIN MODULES (flat star)                        │
  │                                                                         │
  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
  │  │ auth    │ │ classes │ │messages │ │ school  │ │ ai      │  ...     │
  │  │ 1635L   │ │ 1313L   │ │ 1293L   │ │ 1179L   │ │ 788L    │  16 more │
  │  │ S+C+R   │ │ S+C+R   │ │ S+C+R   │ │ R+S     │ │ S+R     │          │
  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘          │
  └───────┼───────────┼───────────┼───────────┼───────────┼────────────────┘
          │           │           │           │           │
          ▼           ▼           ▼           ▼           ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                      SHARED SINGLETONS (radial coupling)                │
  │                                                                         │
  │  config/database (knex)  ← 20 modules                                 │
  │  middleware/auth         ← 21 modules                                 │
  │  utils/dbHelpers         ← 13 modules                                 │
  │  utils/cache             ← 2 modules (announcements, videos)          │
  │  utils/iranianValidators ← 3 modules (ai, finance, school)            │
  │  services/smsGateway     ← 3 modules (attendance, finance, school)    │
  │  services/classroomPersistence ← socket.js + classes                  │
  └─────────────────────────────────────────────────────────────────────────┘
```

**Key finding:** Module graph has **0 cross-module edges** (verified by regex scan). All coupling is radial into shared singletons. No cycles possible.

---

## 3. Module Dependency Graph (exact — from AD-03 scan)

```
MODULES (21) — zero inter-module requires

     ┌────────────────────────────────────────────────────────────┐
     │                    RADIAL COUPLING ONLY                    │
     │  Each module → middleware/auth, config/database, utils/*  │
     │  No module → another module's routes/service/controller   │
     └────────────────────────────────────────────────────────────┘

EXCEPTIONS (5 verified cross-module requires, one-directional):

  classes/routes.js  ───► messages/controller.js      (line 4)
  ai/paperToDigital.service.js ──► school/sida.service.js  (line 21)
  ai/paperToDigital.service.js ──► quizzes/quiz.service.js  (line 22)
  app.js (4× inline require) ──► quizzes/quiz.service.js   (lines 403–438)
  quiz.service.js  ──► writes announcements table directly (line 274)

No other cross-module edges exist. No cycles (0 edges → 0 cycles).
```

---

## 4. Module Shape Summary (LOC by layer)

```
┌──────────────┬────────┬────────┬───────────┬────────┬────────┐
│ Module       │ Routes │ Service│ Controller│ Other  │ Total  │
├──────────────┼────────┼────────┼───────────┼────────┼────────┤
│ auth         │ 37     │ 1176   │ 367       │ 55     │ 1635   │
│ classes      │ 37     │ 934*   │ 342       │ 0      │ 1313   │
│ messages     │ 38     │ 1031   │ 224       │ 0      │ 1293   │
│ school       │ 730    │ 449    │ 0         │ 0      │ 1179   │
│ ai           │ 59     │ 729    │ 0         │ 0      │ 788    │
│ videos       │ 774    │ 0      │ 0         │ 0      │ 774    │
│ gradebook    │ 683    │ 0      │ 0         │ 0      │ 683    │
│ studyPlanner │ 33     │ 392    │ 166       │ 0      │ 591    │
│ quizzes      │ 17     │ 453    │ 68        │ 0      │ 538    │
│ finance      │ 531    │ 0      │ 0         │ 0      │ 531    │
│ attendance   │ 18     │ 425    │ 85        │ 0      │ 528    │
│ announcements│ 38     │ 374    │ 92        │ 0      │ 504    │
│ assignments  │ 16     │ 272    │ 109       │ 0      │ 397    │
│ notifications│ 20     │ 193    │ 87        │ 0      │ 300    │
│ schedules    │ 212    │ 0      │ 0         │ 0      │ 212    │
│ courses      │ 190    │ 0      │ 0         │ 0      │ 190    │
│ discipline   │ 180    │ 0      │ 0         │ 0      │ 180    │
│ tickets      │ 173    │ 0      │ 0         │ 0      │ 173    │
│ upload       │ 169    │ 0      │ 0         │ 0      │ 169    │
│ analytics    │ 165    │ 0      │ 0         │ 0      │ 165    │
│ feedback     │ 87     │ 0      │ 0         │ 0      │ 87     │
├──────────────┼────────┼────────┼───────────┼────────┼────────┤
│ TOTAL        │ 4126   │ 5648   │ 1540      │ 55     │ 12230  │
└──────────────┴────────┴────────┴───────────┴────────┴────────┘

* classes includes externalLive.service.js (219 LOC)

Routes-only modules (10): analytics, courses, discipline, feedback, finance,
gradebook, schedules, tickets, upload, videos
```

---

## 5. Frontend Architecture (Next.js 15 App Router)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 15, React 19)                      │
│  ~/frontend/src — 50,733 JS LOC, 22,110 CSS LOC, 0 tests                   │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │  APP ROUTER — 27 dashboard sections + root                              │
  │  29 page.js files (3 under classes/)  →  42,363 JS LOC                 │
  │  44 "use client" files  •  0 "use server"  •  2 zustand stores         │
  └─────────────────────────────────────────────────────────────────────────┘

  Largest pages (JS LOC):
    record          4,415    messages        3,179    study-planner   3,825
    quizzes         2,528    videos          2,762    attendance      2,415
    announcements   1,266    assignments     1,735    report-card     3,266

  State management:
    ┌─────────────────┐     ┌─────────────────┐
    │  authStore.js   │     │  classStore.js  │
    │  (token, user,  │     │  (class cache,  │
    │   role guards)  │     │   roster cache) │
    └────────┬────────┘     └────────┬────────┘
             │                       │
             ▼                       ▼
    35 files import authStore (28 under dashboard/)
    2 section pages lack authStore guard: gradebook (7 LOC), notifications (152)

  API layer: src/lib/api.js (axios wrapper, origin whitelist, legacy URL purge)
  Socket:    src/lib/socket.js (token from localStorage, polling→ws upgrade)

  Components (src/components/*): 18 files / 6,238 LOC
    layout(6), teacher(2), student(2), communication(2), announcements(2),
    school(2), system(2)

  Android: frontend/android/ — 3 Java sources (Capacitor wrapper + 2 scaffold tests)
```

---

## 6. Data Flow — Multi-Tenant Request

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REQUEST LIFECYCLE (tenant-scoped)                        │
└─────────────────────────────────────────────────────────────────────────────┘

  CLIENT                          BACKEND (single process)
  ──────                          ──────────────────────

  1. HTTPS + JWT (access + refresh cookies)
         │
         ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  MIDDLEWARE CHAIN (app.js → auth.js)                                    │
  │  • helmet/cors/rate-limit                                               │
  │  • authenticate: verifies JWT, attaches req.user {id, role, school_id} │
  │  • authorize([...roles]) — literal arrays at ~40 call sites            │
  │  • assertSameSchool(req, targetSchoolId) — runtime check               │
  │  • assertOwnsClass / assertTeacherOfStudent — ownership checks         │
  └─────────────────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  DOMAIN ROUTE HANDLER (one of 179 router.METHOD sites)                 │
  │  • Reads req.user.school_id for every query                            │
  │  • Uses db('table').where({school_id: req.user.school_id, ...})        │
  │  • lint-unscoped-queries ratchet catches 1 known baseline miss         │
  └─────────────────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  KNEX → SQLite (WAL) / PG                                               │
  │  • Single schema, 44 tables, all rows carry school_id                  │
  │  • users.email/phone: school-scoped unique (016 migration)             │
  │  • tuition_ledgers: 1 row per (student_id, academic_year)              │
  │  • No transactions anywhere (0 db.transaction calls)                   │
  └─────────────────────────────────────────────────────────────────────────┘
         │
         ▼
  JSON response + optional Socket.IO event (room = class:school_id:class_id)
```

**Tenant boundary:** Entirely in application code + 1 syntactic lint. Single SQLite file holds all schools. Backup = whole file copy.

---

## 7. Realtime Plane — Socket.IO Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SOCKET.IO SERVER (in-process)                          │
│  src/socket.js  —  mounted at app.js:51, shares Express session secret     │
└─────────────────────────────────────────────────────────────────────────────┘

  HANDSHAKE
  ─────────
  Client (src/lib/socket.js)          Server (socket.js)
  ─────────────────────               ──────────────────
  io(backendUrl, {                    io.on('connection', socket => {
    auth: (cb) => {                       const token = socket.handshake.auth.token;
      cb({ token:                        // verify once, attach socket.user
        localStorage.getItem(                // NO revocation re-check after connect
          'accessToken') })               socket.join('class:' + classId);
    }                                   });
  })

  ROOM MODEL (in-memory Map)
  ──────────────────────────
  activeClassrooms = new Map()  // key: classId
  // value: { teacherId, students: Set<socketId>, isLive, boardState, ... }

  EVENT MATRIX (25 events, per SOCK-01)
  ────────────────────────────────────
  Teacher-only emit:  start_live_class, end_live_class, screen_frame,
                      live_video_frame, whiteboard_stroke, whiteboard_clear
  Student emit:       webrtc_signal (relayed blind cross-room), chat_message
  Server broadcast:   room_state, participant_list, live_status, ...
  
  PERSISTENCE
  ───────────
  classroomPersistence.js — debounced 1.5s snapshot → live_classroom_sessions
  On teacher disconnect while isLive=true: room NEVER GC'd (latch leak)

  VULNERABILITIES (SOCK-01, 4× reproduced)
  ───────────────────────────────────────
  SEC-SOCKET-001: unauthenticated media injection (screen_frame, live_video_frame)
  SEC-SOCKET-002: blind cross-room webrtc_signal relay (spoofed senderData)
  SEC-SOCKET-003: CORS reflects any Origin + credentials (cross-origin takeover)
  SEC-SOCKET-004: post-revocation sockets keep full room rights
```

---

## 8. Deployment & Runtime Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DEPLOYMENT REALITY                                │
└─────────────────────────────────────────────────────────────────────────────┘

  SOURCE                          BUILT ARTIFACT
  ──────                          ──────────────

  backend/
  ├─ Dockerfile                   FROM node:20-bookworm-slim
  │  RUN npm ci --omit=dev  ◄───  FAILS: no committed package-lock.json
  │  CMD node src/app.js
  │
  ├─ package.json                 scripts: dev, start, test, migrate, seed
  │
  ├─ .github/workflows/           backend-tests.yml:
  │  backend-tests.yml            • npm install --no-audit --no-fund (no lock)
  │                               • npm test (lint + 145 unit tests)
  │
  ├─ scripts/                     tunnel_keeper.js, start_permanent_tunnel.*
  │  tunnel_keeper.js             (dev-only, ship in release artifact)
  │
  └─ dev-server.js                COMMITTED JWT secrets + seed loop (123456)

  frontend/                       NO Dockerfile, NO CI build gate, NO tests
  ├─ next.config.mjs
  ├─ package.json                 scripts: dev, build, start, lint
  └─ android/                     3 Java files (Capacitor scaffold)

  DATABASE                        BACKUP
  ────────                        ──────
  ./backend/educonnect.db         dbMaintenance.js copies whole file
  (SQLite WAL, default)           to ./backend/db_backups/ every N hours
  PG opt-in via DB_CLIENT=pg      14-day prune, NO verification, NO per-tenant
  knexfile.js: better-sqlite3     export possible
```

---

## 9. Observability & Reliability

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OBSERVABILITY FLOOR                                 │
└─────────────────────────────────────────────────────────────────────────────┘

  LOGGING                    METRICS                    HEALTH
  ──────                    ──────                    ──────
  28 console.* sites        0 structured metrics      GET /api/health (5 aliases)
  0 request IDs             0 prometheus client       Returns static {"status":"ok"}
  0 tracing                 0 custom counters         NO DB reachability check
  morgan('dev') dev-only    0 histograms              NO WAL lock check
  8 logAudit call sites     0 gauges                  NO disk space check
  (5 gradebook, 2 finance,  0 alerts                  NO realtime liveness check
   login, health)          

  BACKUP/RECOVERY
  ───────────────
  • Whole-file SQLite copy (single file = all tenants)
  • SIGTERM → WAL checkpoint (app.js:505) — good
  • 14-day prune, env-blind paths
  • NO integrity_check on backup
  • NO restore drill documented
  • NO per-tenant export (trigger: school #2)
```

---

*All diagrams and numbers trace to direct source reads this session and the AD-03
dependency analysis. No prior audit documents were trusted.*