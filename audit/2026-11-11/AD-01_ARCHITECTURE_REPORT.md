# Architecture Report — EduConnect, independent assessment @ 838b5b2 (2026-11-11)

Independent read-only architectural assessment. This pass re-read the implementation
first-hand (only line numbers/structure are shared with earlier audits); every claim below names
its evidence. The report deliberately separates **architectural defects** (shape problems needing
design decisions, not just cleanup) from **ordinary technical debt** (local improvement, no
structural change).

---

## 1. System at a glance

```
                     ┌────────────────────────────────────────────┐
                     │                 CLIENTS                    │
                     │  Next.js SPA-ish dashboard  (port 3000)   │
                     │  ~30 dashboard domains, ~50k LOC of JS   │
                     │   + thin Capacitor Android wrapper (3 src) │
                     │   + HTTP JSON API + Socket.IO realtime    │
                     └───────┬─────────────────────┬──────────────┘
                             │ HTTP/JSON           │ WS (+polling)
                             ▼                     ▼
              ┌──────────────────────────────────────────────────┐
              │  Express app (single process, src/app.js)       │
              │  helmet, cors(open), rate-limit(2 zones),       │
              │  morgan(dev-only), errorHandler,                │
              │  21 domain modules (routes[+services])          │
              │  Socket.IO server (in-memory rooms)             │
              └───────┬──────────────────────────────┬───────────┘
                      │ knex (better-sqlite3 normally,│ pg if DB_CLIENT=pg
                      │ env-blind fallbacks)          ▼
                      │                     ┌──────────────────────┐
                      │                     │ SQLite file (WAL) in │
                      │                     │ dev AND default      │
                      │                     │ production           │
                      │                     │ All schools share    │
                      │                     │ the one schema/file  │
                      │                     └──────────────────────┘
                      └──── uploads/ (fs, multer+sharp) ──► db_backups/ (file copies)
```

- **Monorepo, 2 workspaces + Android skin**: `backend/` (Express), `frontend/` (Next 15 App
  Router, React 19), `frontend/android` (Capacitor bridge: `BridgeActivity` + the two "Example"
  scaffbol tests only — the native layer is scaffolding, effectively a webview wrapper).
- **Single deployable unit**: one Node process runs API + realtime + scheduler + socket
  rooms. The realtime and the API share a process, auth, and data access.
- **Four execution environments collapse into one distribution**: dev (`dev-server.js`,
  seeds, tunnel scripts), CI (backend-tests.yml), the Docker image, and any real server are the
  same bundle — differences are environment variables.
- **Docs drift** (already flagged in prior audits, re-confirmed): README claims PostgreSQL/
  Redis prerequisites; the shipped default runtime is *SQLite everywhere* unless
  `DB_CLIENT=pg` happens to be set (`knexfile.js:46`, `config/index.js:22`), the config has an
  **unused `redis` block** (`config/index.js:29–32`), and the README's much-cited
  `expectFailure` ratchet test design does not exist in the tree ([R8 from REC-03]).

---

## 2. Backend architecture and module dependencies

### 2.1 Shape

- `src/app.js` mounts every domain router + the Socket.IO server; **no application shell**,
  no composition root beyond `module.exports`-style wiring. Middleware is thin and honest
  (helmet, open CORS, per-zone rate limits at `app.js:123–152`, JWT, global error handler).
- 24 modules under `src/modules/*/`. The distribution: **10 modules have no service file at
  all** (logic lives entirely inside `*.routes.js`) and the services that exist are
  domain-named but sometimes tiny (analytics = aggregations inline). The largest single
  backend file is the *route file* `videos.routes.js` (773 lines) and the two biggest
  "services" are `auth.service.js` (1175) and `message.service.js` (1030). The finance
  "domain" has **zero service files** — everything is in `finance.routes.js` (530 lines).
- **Cross-module calls bypass any boundary.** `ai` imports `sida.service` and
  `quiz.service` directly (paper→digital commits into Sida and quiz domains);
  `announcement.service` fires notification fan-outs inside the announcement call path;
  `quiz.service` inserts announcements while creating a quiz; `socket.js` imports
  `classroomPersistence` and auth helpers; `videos.routes` reaches into the shared
  upload directory hardcoded at `backend/uploads`. Deleting or renaming a module's public
  function is free for every other module — there is no declared public-API surface.

**Classification:** part defect, part debt. Cross-module imports were *chosen* per feature
and are few (see AD-03); the defect is the *absence of a declared boundary* (no domain-service
interfaces, no port/host discipline), which is what makes every future refactor dangerous.

**Smallest reasonable improvement:** introduce a 1-page "module public API" convention
(each module exports only through its `*.routes.js` + named service entry points; a lint/CI
check for unauthorized `modules/*` cross-imports outside an explicit allow-list — same pattern
class as the existing `lint-unscoped-queries` ratchet, which already pays for itself).

### 2.2 Auth/authorization design

- **Session model:** JWT access (15 min) + refresh (7 d) — modern, stateless,
  per-request verification (`middleware/auth.js:166–242`). Roles are coarse
  (`admin/manager/school_admin/principal/headmaster` admin family; counselor; teacher; student;
  parent; financial_officer…). Mechanisms worth keeping: `token_version` session revocation,
  `revoked_tokens` jti table, `is_active` soft-delete, school-scoped role grants
  (`assertOwnsClass`, `assertSameSchool` in the middleware — a *central* ownership idiom that
  has been applied consistently across ~rest of the codebase).
- **AuthZ idiom (strength):** the *verified classroom* model — teacher/student/parent each get
  scoped read/write rather than role-wide grants (`finance.routes.js:19–90` is the cleanest
  example: counselor excluded, student self-only, parent own-children only, all rows
  school-checked). Asymmetric to read-vs-write (defense-in-depth per read and write) — good.
- **AuthZ gaps that are architectural (see AD-04 for consequences):**
  1. **No per-request revalidation of revocation on socket connections** after handshake
     (SEC-SOCKET-004) — architectural because the realtime plane reuses REST auth but
     assumes state is fixed at connect time.
  2. **Parent identity custody is weak-by-design**: unauthenticated `parent-login` mints
     verified parent accounts purely from a student code (SEC-AUTH-001 + FW-AUTH-001 mismatch);
     the schema has no parent-proof data (`parent_student_links.is_verified` is set true
     without any verification step). The *design* lacks the custody verification primitive.
  3. **Financial write path has no authorization gate at all** (SEC-FIN-001) — the settle
     endpoint trusts a client-side status flag. (Functional bug above, but as design: no
     "role→settle" mapping exists anywhere in the authz table; financial officer role isn't
     even consulted.)
  4. **Attribute granularity of roles is duplicated** in ~40+ literal arrays across routes
     (`['admin','manager','school_admin']` typosquat-prone style); a helper exists
     (`authorize(...)`) but no canonical role registry. (Debt → defect at ~50 sites.)

**Smallest reasonable improvement:** (a) a tiny RBAC module (role→operation map) used by
`authorize`/route guards and consulted by the settle endpoint; (b) revoke-on-write hook:
`revoked_tokens`/`token_version` delta → close matching sockets; (c) patch the socket
handshake onto the same session pipeline (already shares `config.jwt.secret` — small diff).

### 2.3 Finance ledger & transaction design

(existence: `tuition_ledgers` 1 row per `(student_id, academic_year)`, status enum of three
strings; `tuition_installments` child rows; `pay-installment` receipt rows; `callback-verify`
settlement; SMS receipt dispatch.)

- **Ledger is a denormalized projection:** `paid_amount`/`balance` are recomputed by
  read-modify-write in the settlement handler (`finance.routes.js:456–471`) — they store their
  own truth rather than being derivable from installments.
- **No DB-level invariant enforces consistency:** no `CHECK (balance >= 0)`, no
  `(ledger_id, installment_number)` uniqueness (duplicate installments are expressible —
  the "one dedupe" lives in handler logic only), no FK from balance to installments list,
  no unique constraint on `(ledger_id, tracking_number)` for replay protection.
- **No transactions anywhere in the codebase.** Confirmed: **zero**
  `db.transaction(` call sites across `backend/src`. Settlement writes are ≥3 sequential
  statements (verify installment → update ledger → maybe dispatch receipt) with a plain
  `Math.max(0, …)` clamp but no atomicity. A concurrent HTTP interval doubles between those
  steps → double-charge / lost update (write skew), and the only defense claimed in-process.
- **Two payment paths exist**: student-submitted receipts (`pay-installment`) vs IPG-style
  callback (`callback-verify`) — with no shared abstraction for "a confirmed payment event",
  so replay/idempotency logic is duplicated implicitly and (for the callback) absent entirely.

**Classification:** DEFECT (data integrity of financial records), not debt. The projections
exist for UX (one ledger read), but nothing rebuilds/validates them — a teacher with two roles
could legitimately double-settle concurrently today. Requires: (i) `BEGIN/COMMIT` around
settle; (ii) idempotency key on `(ledger_id, authority)`; (iii) DB CHECKs.
Estimated small (0.5–1 d) because knex transactions are trivially usable (`db.transaction(async trx => …)`).

### 2.4 Multi-tenant architecture

- **Single schema, shared tables, runtime `school_id` scoping everywhere.** Every model
  carries `school_id` (users, classes, ledgers, …); the auth middleware attaches
  `req.user.school_id`; the ownership helpers enforce it at the bus level.
- **The boundary is enforced 100% in code, per route, manually.** The `lint-unscoped-queries`
  ratchet (`backend/scripts/`, baseline = exactly 1 known case) is the *only* structural
  guard — it catches one syntactic pattern (`db('…').where({id: req.params.x})`) only in
  route files. It cannot see a missed scope in a service, a skip-ahead `await db('users')
  .where({id})` in a socket handler, or a `select` that forgets the join.
- **Single-file storage (defect when SaaS ambitions are real):** in the shipped default
  (SQLite), *every* school's data cohabitates in one file (`knexfile.js:40` → dev file used in
  prod unless `DB_CLIENT=pg`), and the whole file is what backups copy
  (`dbMaintenance.js:14–16,51–84`). Tenant separation exists *logically*, never *physically* —
  tenant N's `school_admin` reads every other tenant along backup/pull paths that skip school
  checks (SEC-DATA-001, SEC-SOCKET-003 become one story). Classroom/realtime state is
  additionally process-local — scaling horizontally multiplies rooms and invalidations with no
  sticky routing.
- **Schema evolution discipline is genuinely two-polar:** migrations use idempotent
  `hasTable/hasColumn` guards (016 and 017), so they're re-runnable across SQLite/PG; but
  schema semantics differ per engine (e.g., 016 replaced global unique indexes with
  school-scoped ones *in place* — data-loss-free on SQLite today, data-migration-critical on
  PG later: indexes, not just tables). There is no alembic-like audit of what a
  downgrade means; `down()` bodies drop tables.

**Classification:** scoping-in-code = debt-turned-discipline (works at current scale, with a
single ratchet); **single-file tenant co-tenancy** = defect (insecure *backup surface* and
unsound scaling assumption — one write to it is all tenants' problem).

### 2.5 Real-time architecture

Deep-dive is `SOCK-01`; architecture-level summary:

- **Room model is in-memory** (`activeClassrooms` Map), `socket.join('class:…')`,
  snapshots debounced to `live_classroom_sessions` (1.5 s). Design choice is coherent for
  1–2 schools/class: no message bus, no Redis adapter — which is *the right size* for the team.
- The coherent choices are undercut by (a) unauthenticated media injection (frames, signalling),
  (b) silent-denied-by-`return` events that make abuse indistinguishable from a dead feature,
  (c) `isLive` latching (room never GC'd after teacher disconnect while live),
  (d) CORS-open handshake ((b)+(c) above + SEC-SOCKET-003)).
- **Consequence:** realtime is real but fragile at the edges of *space* (rooms don't cross
  process boundaries: no Redis adapter, no sticky strategy — explicitly unneeded at school
  scale, but an invisible property of "everything fits one process").

**Classification:** correct-for-scale core with a few sanctioned hard edges → debt for most,
**defect** for the media injection (data-integrity + DoS shape class).

### 2.6 AI integration & data integrity

- The "dual-engine" architecture is *de facto* single-engine: Gemini behind
  `require('@google/genai')` guarded + `GEMINI_API_KEY`-gated, deterministic fallback by design
  ([SEC-AI-002] LATENT; the deterministic fallback itself fabricates rows when OCR is empty —
  [SEC-AI-001]). The *system* cannot currently distinguish "OCR OCR poor" from "no rows" —
  empty input yields high-confidence fake students. Integrity is not carried through an explicit
  `needs_review` decision; the pipeline claims `mandatory_human_in_the_loop: true` while the
  commit endpoint accepts items unverified (server-side: `ai.routes.js:45–56`, commit at
  `paperToDigital.service.js:461–598`).
- **The AI module writes to three other domains directly** (Sida roster, gradebook, quiz).
  There is no circuit, no signature, no replay protection; items are client-passed, echoed to
  storage verbatim.
- Data lineage: `imported_from` (`source_system`) exists — good instinct, but it does not
  survive *within* gradebook (scores largely re-affirmed) and no audit records the *review*
  event that supposedly happened.

**Classification:** DEFECT (integrity contract promised by docs/ui is not implemented —
`needs_review` is theatre), plus cross-domain mutation without a boundary (2.1).

### 2.7 File storage & upload

- One storage engine: multer → `uploads/` (filesystem), max 50 MB × 30 files per request,
  sharp in-process for thumbnails (SSSE3 CPU guard), `videos` module streams from the same
  directory via its own hardcoded path. Downloads are exposed statically under an
  authenticated mount with aggressive per-type CSP/nosniff headers (`app.js:109–121`) — the
  *serving* story is unusually careful.
- **Path literalism**: video streaming reads from `backend/uploads` directly
  (not `config.upload.dir`) — config/env drift will silently break streaming; two code paths
  own the same dir.
- Bounds: 200-chat / 2000-stroke memory caps exist (good instincts), no size cap on `docState`
  beyond socket buffer, no content scanning, no antivirus; `busboy` filename decode branch is
  dead code (`upload.routes.js:127–134`, REC-02).
- Backup/store split: media live next to the DB file in the same repo tree; the Docker image
  *copies* the source tree — a copied `uploads/` and `db_backups/` are baked into the image if
  git-lfs/cache reuse, which `Docker` context excludes only if they aren't committed
  (they are git-ignored for content; the `.gitkeep` is the only thing kept).

### 2.8 Deployment & infrastructure

- Backend image: single-stage `node:20-bookworm-slim`, native build deps installed at layer 2,
  runs `npm ci --omit=dev` — **which fails on this repo today** because there is no committed
  `package-lock.json` (`backend/Dockerfile:16` × CI's own admission, `backend-tests.yml:42–44`).
  Small-but-sharp deployment trap: the prod image can't build from a fresh checkout.
- No `docker-compose`, no frontend image/CI build gate, no frontend tests, no e2e — CI =
  backend tests + ratchet lint only.
- Dev tunnel scripts (Pinggy/Cloudflare `tunnel_keeper.js`, `start_permanent_tunnel.*`)
  ship in the repo root — production-grade-era tooling under `scripts/` with no guard rails
  beyond env switches; `CHECK - tunnel_keeper` runs unattended in some deployments.
- Process supervision handled informally (SIGTERM→WAL flush `app.js:505–512` exists and is
  good; PM2/ecosystem, systemd units absent; single Node process = single point of failure for
  API + realtime + rooms + scheduler).
- PG support exists in the code (`DB_CLIENT=pg`, pg pool `min 2 max 20`, SSL off-by-default
  `ssl.rejectUnauthorized:false` — ignores TA validation), while shipped defaults run SQLite
  — deployment config understands PG, the shipped env doesn't use it. `.env.example` lists
  Redis though nothing consumes it (dead config).

### 2.9 Observability, reliability, backup & recovery

- **Observability floor is console.** 28 `console.*` sites, zero structured logging, no
  request IDs/tracing, no metrics client; `morgan('dev')` dev-only. **Audit trail exists
  as table+logger but is written at 9 call sites** (5 gradebook + 2 finance + health/login)
  — the privileged ops that matter most (settles, parent-login minting, backups) mostly
  bypass it (`auditLogs` grows only where a dev remembered). There is no watcher on the
  `audit_logs` table (index `[module,action]` is decoration until something reads it).
- **Health is a static JSON string** (`app.js:176–184`): always `"ok"` — it says nothing
  about DB reachability, WAL lock, disk, or realtime liveness. Zero monitoring contract for
  whatever probes it.
- **Backups are whole-file copies** with 14-day pruning (`dbMaintenance.js:51–84`), env-blind
  (fixed `DB_PATH`), *single file for all tenants* → restore = restore every tenant or
  none. WAL checkpoint on SIGTERM (good); no crash-consistent restore instructions, no backup
  verification step (checksum/read-back) — an operator wouldn't know a corrupt backup exists.
- **Reliability claims have real mechanisms** (WAL, `busy_timeout`, foreign keys ON,
  SIGTERM checkpoint) — the DB engine chapter is honestly done; it's the *procedures around
  it* (verification, drill, alerting) that are absent.

### 2.10 Performance & scalability

- Fine at intended scale (a school; a few hundred concurrent): SQLite WAL one file,
  express router + socket in one process, 45-s opt-in in-process cache for 4 routes
  (announcements/video-folder patterns; school-scoped keys — correctly isolated by default
  (`cache.js:91`)); pagination *mostly* everywhere.
- The analyst-boundaries: **analytics `overview` is textbook N+1** — for each class ≥4
  sequential queries (`analytics.routes.js:41–70`), with count → pluck → avg → count loops;
  at 200 classes = ~800 sequential roundtrips/response. Also: dashboard pages are *huge
  client bundles* (~50k lines of JS in `frontend/src`, no evidence of route-level code
  splitting for the per-section "pages" — every client page ships its own module graph in an
  already-fat dashboard bundle; first-load pain).
- Rate limits are coarse (global 600/15 min per IP; auth 30/15 min) — plenty for humans,
  but no per-socket throttling on realtime (frames/signals unlimited — see SOCK-01).
- Socket authorization and board state are in RAM; recoveries replay from SQLite snapshot —
  consistent-enough, but there's no dedup of pending debounce writes across PM restarts
  (commented risk: two procs sharing a file → the `busy_timeout` pragma is the only guard).

### 2.11 Maintainability & developer experience

- **Strong:** domain-file naming, sensitive-field sanitizers as conventions (e.g.,
  `sanitizeClassSecrets`), the ratchet lint with a maintained baseline, per-test-file
  disposable harness (the Phase-0 safety harness is genuinely good), 145-test suite and
  readable test names, docstrings usually in Persian (native language DX), eslint config in
  frontend.
- **Weak:** no TypeScript (`jsconfig.json` only) with ~44 client components at dashboard scale —
  its absence is increasingly the tax; no frontend test **at all**; README/workflow comments
  describe test mechanics that don't exist (drift class, see 1/2.1/12); config surface is
  dead (`redis`) and env-blind fallback-heavy (SQLite default prod risk + upload dir +
  DB_BACKUP paths); migrations are *idempotent-style* — a portability win but loses
  downgrade semantics; dev "secrets" committed at `dev-server.js:6–7` (seed loop w/
  `123456` verified live this session).
- File-size distribution: 6 backend files > 500 LOC (fat), tests 19 files for ~50 endpoints
  density — the test-to-surface ratio is healthy, but coverage hides exactly at the risky spots
  (R10 in REC-03: callback-verify, retriever, seeded creds).

---

*(Evidence ledger: every claim maps to read line numbers in AD-02/AD-03/architectural sources;
risk scoring in AD-04; ordering in AD-05.)*
