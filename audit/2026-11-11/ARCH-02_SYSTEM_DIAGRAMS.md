# System Diagrams — EduConnect @ 838b5b2

ASCII diagrams (code blocks) for print/markup. Targets: `audit/2026-11-11` companion to `ARCH-01`.

---

## D1. System Context

```
                        Iran national intranet / Internet
                                  │
    ┌─────────────────────────────┼──────────────────────────────┐
    │                             │                              │
┌───▼─────────┐             ┌─────▼──────┐              ┌───────▼────────┐
│ Parents /   │   HTTPS/WSS │            │              │ Capacitor      │
│ Teachers /  │◄───────────►│ NEXT.JS    │   rewrites   │ Android (.apk) │
│ Students /  │             │ frontend   │  /api,/uploads,│ (static export │
│ Admins      │             │ (Next 15,  │  /socket.io ─►────────────────┼──┐
│ (browsers)  │             │ SPA shell, │               out/ (11 MB)   │  │
└─────────────┘             │ static out)│              └─────────────────┘  │
                            └─────┬──────┘                                   │
                                  │ BACKEND_INTERNAL_URL                       │
                                  ▼                                             │
                       ┌─────────────────────┐                                 │
                       │ Express 4.22.3      │                                 │
                       │ + Socket.IO 4       │                                 │
                       └───────┬─────────────┘                                 │
                    routes/api│  ws                                        │
          ┌────────────────┼───┼──────────────────────────────┐              │
          ▼                ▼   ▼                              ▼              ▼
   ┌────────────┐   ┌────────────┐   ┌──────────────┐   ┌─────────────┐  ┌─────────────┐
   │ knex       │   │ better-    │   │ git-sync     │   │ in-process  │  │ express.    │
   │ (client)   │   │ sqlite3    │   │ auto_reset--- ┼──►│ scheduler   │  │ static      │
   └─────┬──────┘   │ educonnect │   │ origin/main  │   │ maintenance │  │ /uploads    │
         │          └────┬───────┘   │ (15 s poll)  │   │ daily backup│  └─────────────┘
         │               │          └──────────────┘   └─────────────┘
         ▼
   file: backend/educonnect.db (+-wal/-shm siblings)
   backups: backend/db_backups/educonnect_<ts>_<auto|daily|manual>.db  (env-blind, §ARCH-01:11/12)
```

Legend notes:
- Frontend proxies files/uploads/socket through Next rewrites (`next.config.mjs:8–24`), so the browser never addresses the backend origin directly — **except** via tunnel/cloudflared in the Windows-server model.
- No reverse proxy / LB / queue / external logger anywhere in the tree (subagent deployment inventory).

---

## D2. HTTP/Socket Processing Pipeline (backend)

```
CLI entry: node backend/src/app.js                      (or tests/*.test.js boot)
   │ dotenv                    app.js:1
   │ NODE_ENV hard-exit        app.js:15-21          (refuses without NODE_ENV)
   ▼
socket initSocket(http.Server)    app.js:55-61 | socket.js:89-151
   ├─ socket origins: any + credentials   (SES: socket CORS open)
   └─ handshake JWT verify + blocklist+tv (auth.js:166-242 equivalent)
   ▼
app.use sequence (express 4 order):
 1 compression                app.js:68-74
 2 helmet (frameguard:false)  app.js:76-90
 3 cors {origin:true}         app.js:92-98        ← SEC-CORS-001 surface
 4 morgan dev                 app.js:100-102      (off in NODE_ENV=test)
 5 express.json/urlencoded 10MB
                              app.js:103-104
 6 persianNormalizer          app.js:105-106      (whole-body normalize per request)
 7 /uploads authenticate+static
                              app.js:109-121      ← before rate limiter (!), authenticated files
 8 global limiter 600/15 IP   app.js:123-135
 9 auth limiter 30/15 (4 auth POSTs only)
                              app.js:137-152      ← parent-login NOT covered (SEC-AUTH-001)
10 health/app-version/apk/sync
                              app.js:195-237      ← apk: unauthenticated (§ARCH-01:11)
11 backup & audit APIs        app.js:240-279/282-303  role-only school-..., no school scoping
12 global /assignments + /quizzes inline routers
                              app.js:306-451
13 23 module routers         app.js:445-467  (list per ARCH-01 §2 witness table)
   notFound → errorHandler    app.js:470-492      (Joi→400, pg23505→409, FK→400, scrub prod)
   listen + in-proc scheduler app.js:474-519      (WAL ckpt 5min, SIGTERM ckpt, daily backup)
```

---

## D3. Module / Service Dependency Graph (DAG — cycle-free, all edges verified by require-head reads)

```
app.js ─┬─► socket.js ──► classroomPersistence.js ──► db
        ├─► dbMaintenance.js ──► dbMaintenance(daily backup, env-blind)
        ├─► auditLogger ──► db
        ├─► utils: cache | localCaptcha | iranianValidators | usernameHelper | dbHelpers
        └─► modules
            ├─ auth ──► utils (localCaptcha, usernameHelper, dbHelpers); validators(Joi)
            ├─ classes ──► db; ─lazy─► externalLive.service
            ├─ assignments ──► db                    (child routes of /classes/:id)
            ├─ quizzes ──► db                        (child of /classes/:id)
            ├─ attendance ──► db ─lazy─► smsGateway
            ├─ messages ──► db  (+messages.controller for class-children)
            ├─ notifications ──► db
            ├─ ai ──► paperToDigital.service ──cross-module──► school/sida.service   ◄── vertical hop
            │         │                                    └──► quizzes/quiz.service   ◄── vertical hop
            │         └─► ai.service (Gemini call; dynamic require @google/genai)
            ├─ upload ──► middleware/upload (multer 1.4.5-lts, 30×50MB), sharp opt
            ├─ gradebook ──► db + auditLogger
            ├─ studyPlanner / schedules / feedback / tickets / analytics / courses
            │      / discipline ──► db (+auth asserts; feedback isSchoolAdmin-scoped)
            ├─ finance ──► db + auditLogger + smsGateway + validators(Sheba)
            ├─ videos ──► db + cache
            └─ school ──► db + sida.service + smsGateway + bcrypt + validators
   cross-cutting consumers: finance→smsGateway, attendance→smsGateway, school→smsGateway
   DEAD: services/sms.service.js (89 ln, zero requires anywhere)
```

Key cross-module edges (only non-horizontal ones): AI→sida import roster; AI→quiz create; class→externalLive (lazy); finance/attendance/school→shared SMS gateway (in-memory ring buffer).

---

## D4. Frontend Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Next.js 15 App Router (44/50 files 'use client' — SPA in an SSR shell)        │
│ frontend/out  (static export, 11 MB) ──► Capacitor webDir → Android APK flow  │
└───────┬──────────────────────────────────────────────────────────────────────┘
        │ rewrites (server-side, dev+prod): /api → backend:5000,               │
        │   /uploads → backend static, /socket.io → backend                     │
┌───────▼──────────────────────────────────────────────────────────────────────┐
│ LayoutComponent (dashboard shell: tab bar, back button, login gate)          │
│   │                                                                          │
│   ├─ useAuthStore (zustand; localStorage keys: accessToken/refreshToken/     │
│   │    user_profile/locale) ──► login(), refresh(), parentLogin(),           │
│   │    demoLogin() (six roles, '123456' literals: DEMO_ACCOUNTS)             │
│   │                                                                          │
│   ├─ lib/api.js (axios ~207 ln): allow-list origins, Bearer attach,          │
│   │    401→/auth/refresh→retry→/login/ redirect                              │
│   ├─ lib/socket.js (singleton; withCredentials; reconnect 15×1.5 s)          │
│   │    token auth callback read: localStorage['accessToken']                │
│   └─ per-page useState + inline socket listeners (10+ pages)                 │
└──────────────────────────────────────────────────────────────────────────────┘

max-citizen page sizes: record 4414 · live 4173 · login 1792 · messages 3178 ·
quizzes 2527 · attendance 2414 · assignments 1734 · management 1590 …
no middleware.js (no server-side gating) · no frontend tests · no TS (jsconfig)
vendored pdf.js trio: 3.5 MB public (pdf.js 556K, worker 1.9M, worker.min 1.0M)
```

---

## D5. Data Model (ER-style; ▲ = carries school_id, ◆ = composite unique)

```
schools ◆code ──1:N── classes ◆join_code, ▲school_id ──N:M── users
 │                                             ▲school_id (unique per 016: (school_id,email/phone))
 │                                             ├ role (plain string), token_version, is_active
 │                                             ├ students STD-codes (INDEX, global collide-able)
 │                                             └ validated via assertSameSchool at guard layer
 │
├── users ──N:M── users        parent_student_links ◆(parent,student)
├── classes ──1:N── assignments ◆(assignment,student) submissions
├── classes ──1:N── quizzes, quiz_attempts ◆(quiz,student)
├── classes ──1:N── attendance_sessions, attendance_records ◆(session,student)
├── classes ──1:N── announcements ➕acknowledgements ◆(announcement,user) ├─ weekly_schedules
├── classes ──1:N── gradebook_categories ◄─ gradebook_scores ◆(category,student) (shared_reports copy)
├── users  ──1:N── tuition_ledgers ◆(student,year) ──1:N── tuition_installments
│                                     → statuses: pending|submitted|verified; dates Persian strings
├── GLOBAL tables (no school column — tenant-bound by convention, not schema):
│     messages / message_groups+members / notifications / course_enrollments /
│     feedback / call_sessions / study_logs / tickets+school_ticket_messages /
│     discipline_records / counseling_cases / academic_events / teacher_* /
│     gradebook_shared_reports / audit_logs (joined to users at read) /
│     revoked_tokens / system_settings / live_classroom_sessions
│
└── files: none — multer → filesystem uploads/ (+videos ∈ videos.* soft metadata)
   sms log: none — in-memory ring buffer smsDispatchLog (500, smsGateway.js:12)
```

Notable constraint facts:
- Migration 016 swapped **global** email/phone UNIQUEs for composite school-scoped ones ✔.
- `users.username` UNIQUE global (011), `ticket_number` global (006), `join_code` global (001), `courses.code` global (005), `feedback.tracking_code` global (005) → cross-school code collisions by construction (§ARCH-01:5).
- FKs: declared ON DELETE CASCADE for child rows, SET NULL for school/class→users → school deletion orphans second-tier tables (§ARCH-01:4).

---

## D6. Live Classroom (Socket) Flow

```
 browser page (live/page.js)                                   classroomPersistence.js
  getSocket(): polling+websocket, reconnect 15×1.5s,                                          upsert live_classroom_sessions
  token in handshake auth (~=spec)/server verify+blocklist                                       (1.5s debounce)
        │
 join_class{classId, user} ──► assertOwnsClass({allowEnrolled})          ┌─ video: frame relay (5MB/skt)
        │ admit/room='class:<id>'                                           ├─ screen_frame (unguarded except classId)
        │ isTeacher = owner || school-admin                                  ├─ audio_chunk (canMic-gated)
 start/end_live ── teacher-only │ teacher verbs: wb_{draw,clear,undo,      ├─ chat new_chat_message (cap 100)
 bg,sync_all,doc_change,page_change}                                         └─ whiteboard strokes (cap 2000)
 rbac: set_student_permission/lower_hand, toggle_mic,                      persistence: whiteboard+chat
                 wb access grant/revoke/all + request                       ONLY — REST messages/announcements
 webrtc_signal(⟵room-UNVALIDATED targetSocketId ⟶ global) ◄─ defect D-08    have their own tables
 authz denials: emitted as SILENCE (except join emits error_message) ◄── UX defect
```

---

## D7. Settlement & AI Commit Data Flows

```
[A] PSP-style settle (current)                      CURRENT
 student 'try pay' ─► initiate-payment ─► {authority:'A000…',…}
      logout? rapid-fire: callback-verify POST (any role ≠ counselor, tenant-ok)
        {status:'OK',authority,?card_pan} ──no verify──► installment.verified=true
                                                     ledger.paid += amount; balance -= amount
                                                     receipt JSON (authority echoed verbatim back)
                                                     audit_logs SHAPARAK_ONLINE_SETTLEMENT
                                                     smsGateway (in-memory) 'delivered'
      ⇒ SEC-FIN-001: settlement = DB write        TARGET (route-phase)
        verify-installment (manual queue) is separate staff path

[B] Paper-to-digital (current)
 scan/OCR ─► POST /ai/paper-to-digital {raw_ocr_text}
        ├► Gemini (if key+package — absent here) OR deterministic parser
        │      (empty OCR ⇒ HARD-CODED fabricated rows, SEC-AI-001:195-357)
        └► commit/etExtractedData(req.body.items verbatim)
                ├ roster ─► sida.importRoster (school-gated; overwrite identities)
                ├ grades ─► assertOwnsClass; silent skip no-match; silent new category
                └ exam ─► quizService.create
        needs_review computed at postProcess … NOT enforced at commit
        ⇒ TARGET: packet store (extract server-side) → commit by packetId+reviewer
```

---

## D8. Deployment Topology (as-shipped)

```
   GitHub origin/main
        ▲
        │ git fetch every 15s — git reset --hard origin/main (auto_sync.js:21-39)
        │ in $HOME/school-app-repo (NOT the runtime tree)  ── sync_status.json health
   ┌────┴───────────────────────────────────────────────┐
   │  WINDOWS SERVER (Deploy-Windows-Server.ps1)        │      DOCKER (docker-compose.yml)
   │  Node 20.18 · Git 2.47 · npm ci (no lockfile!)    │      backend/Dockerfile: node20-slim
   │  C:\EduConnect clone · knex migrate · PM2         │      no migrate step; bind-mount file
   │  cloudflared → localhost:3000 (raw)               │      educonnect.db + uploads dir only
   │                                                   │      restart: unless-stopped; no health
   ├───────────────────────────────────────────────────┤
   │  NODE_B (backend, PORT 3000 via ps1 / :5000)      │
   │  └─ SQLite file (default ./educonnect.db dev)     │
   │  NODE_F (next dev/start PORT 3000 / 3000) ─frontend/out (Capacitor Android source)
   └───────────────────────────────────────────────────┘
   DEV (dev-server.js): spawns backend(:5000)+frontend(:3000)
   TEST: node --test boots real app, per-pid disposable sqlite + ephemeral port+secrets
```

and `scripts/tunnel_keeper.*` keeps a Cloudflare Tunnel to the Windows box (background keeper).

---

*All line anchors verified this session against the working tree; see `00_SESSION_LEDGER.md` + `ARCH-01` for legend cross-refs.*
