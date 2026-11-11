# AD-04 — Architectural Risk Register

Independent read-only assessment @ `main` 838b5b2 · 2026-11-11
Companion to AD-01 (report), AD-02 (diagrams), AD-03 (dependency analysis), AD-05 (roadmap).
Every risk below was re-derived from source reads in this session; cross-references to prior
finding IDs are given for traceability, but no verdict was inherited.

## How to read this file

- **Classification** — every concern is either a
  - **DEFECT**: a design-level problem. Local fixes cannot address it; someone must make a
    (usually small but irrevocable-in-spirit) structural decision before any amount of tidy
    code removes the exposure. Defects are the reason AD-05 front-loads certain items.
  - **DEBT**: ordinary technical debt. Crossable at any time by local edits; no design
    decision needed. Many DEBT items are deliberately *kept* in AD-05's "P2/fair-weather"
    buckets, which is a conclusion, not an oversight.
- **Severity** is architectural exposure, not CVSS of a live exploit: `P0` breaks data
  integrity/security for real users, `P1` breaks under realistic growth or single failures,
  `P2` is a maintainability tax.
- `IMP-xx` refs point to the prioritized countermeasures in AD-05.

---

## A1 — Domain boundaries & backend module coupling

### AR-01 · No module public-API surface; cross-module requires are ungoverned · **DEFECT (P1)**

- **Implementation.** 24 modules under `src/modules/*`, wired by `app.js`. Nothing declares
  what another module may call. `ai` reaches into `sida.service.js` and `quiz.service.js`
  (paper-to-digital commits into Sida/quiz domains); `announcement.service` fires
  notification fan-outs mid-request; `quiz.service` writes announcements while creating a
  quiz; `socket.js` pulls in `classroomPersistence` and auth helpers; `videos.routes.js`
  hardcodes `backend/uploads` instead of config. The AI pipeline alone writes into three
  foreign domains (Sida rosters, gradebook, quiz) with a client-supplied item list.
- **Evidence.** Grepped require graph (AD-03): no module is enclosure-complete; the shared
  filesystem (uploads dir) and shared DB connection double as implicit APIs. The only
  *declared* boundary mechanism in the repo is the `lint-unscoped-queries` ratchet — and it
  only guards the *multi-tenant* property, leaving the *coupling* property unguarded
  (compare `backend/scripts/lint-unscoped-queries.js` scope, baseline 1 entry).
- **Consequences.** (1) Any route/service refactor can silently change another domain's
  behaviour — regressions travel along invisible edges, not visible ones; (2) per-domain
  testing is defeated: a test of the AI endpoint also exercises Sida and quiz writes; (3)
  authorization audits (who *may* write gradebook?) become manual archaeology; (4) the
  most integrity-sensitive writes (AI commit, settlement, socket media injection) sit
  exactly on the least-guarded edges.
- **Improvement.** IMP-06.

### AR-02 · 10 of 24 modules have no service layer; finance is routes-only (530 LOC) · **DEBT for 9 modules, DEFECT for finance (P1)**

- **Implementation.** Fat routes are the norm (`videos.routes.js` 773 LOC, `school.routes.js`
  729, `gradebook.routes.js` 682); services that exist vary from real domain objects
  (`class.service.js`) to aggregations inline (analytics). The finance domain has **zero**
  service files — all logic incl. settlement arithmetic lives in `finance.routes.js:456–471`.
- **Evidence.** Module inventory completed this session: 24 modules; 10 without any
  `*.service.js`; the two largest files are services (auth 1175, message 1030) and the
  third is a route (videos 773); finance.routes.js 530 LOC with tangible business logic.
- **Consequences.** For most modules, this is locally fixable — DEBT. For finance it is a
  DEFECT: the settlement path cannot be unit-tested without booting Express, the integrity
  invariants (idempotency, invariants) have no seam to live in, and the security-review
  load (SEC-FIN-001 already found) concentrates where the tooling is thinnest.
- **Improvement.** IMP-07.

---

## A2 — Database schema & data relationships

### AR-03 · `tuition_ledgers` denormalized by write, no integrity invariants · **DEFECT (P0)**

- **Implementation.** `tuition_ledgers` stores `total_amount, discount, paid_amount,
  balance, status` — six dependent projections updated by read-modify-write in the
  settlement handler. `tuition_installments` carries no uniqueness on
  `(ledger_id, installment_number)`; the only dedupe is handler logic. No
  `CHECK (balance >= 0)`, no unique `(ledger_id, authority/tracking)` replay key.
- **Evidence.** `006_create_enterprise_school_modules.js:106–130` (unique
  `(student_id, academic_year)` present, everything else absent); handler at
  `finance.routes.js:456–471` (`Math.max(0, balance - amount)` clamp is the entire
  invariant story).
- **Consequences.** Duplicate-overlapping duplicates are expressible; concurrent settles
  race read-modify-write with no protection anywhere in the stack; balance can go
  negative only by >1 invoice double-apply; a malformed migration or direct DB edit can
  leave projections silently wrong forever (nothing rebuilds them from installments).
- **Improvement.** IMP-01.

### AR-04 · Schema evolution is idempotent-style, engine-parity-blind · **DEBT (P2, defects of schema-migration class)**

- **Implementation.** Migrations guard every object with `hasTable/hasColumn` (017 fully
  idempotent); 016 rewrote global unique indexes *in place* into school-scoped composite
  ones, added `users.is_active`, and moved what used to be runtime DDL into migrations.
  `down()` bodies drop tables; PG vs SQLite semantics (index rebuild vs table rebuild,
  `is_active` NULL edge) are not treated differently.
- **Evidence.** 012 added `users.school_id` long after core tables (retrofit); 016
  in-place index swap; `scripts/` contains no environment parity check; knexfile drives
  better-sqlite3 *by default* and only uses PG when `DB_CLIENT=pg` is set.
- **Consequences.** On SQLite (the shipped engine) these migrations are safe. On PG the
  same files will rebuild indexes over live data with no documented downtime story, and the
  downgrade path (drop-table `down()`) destroys data. The 012-then-016 retrofit also left
  eras of data where `school_id` semantics were patched rather than designed.
- **Improvement.** IMP-11.

---

## A3 — Multi-tenant architecture

### AR-05 · Tenant separation exists in code only; the only structural guard is syntactic · **DEBT turned discipline — call it DEBT with a ratchet, but know its ceiling (P1)**

- **Implementation.** Single schema, single (default) database file, every row
  `school_id`-scoped, `req.user.school_id` attached centrally, `assertSameSchool` /
  `assertOwnsClass` applied everywhere. The ratchet (`lint-unscoped-queries`, baseline
  exactly 1 known exception) blocks one syntactic pattern in route files; services, socket
  handlers, and `dbMaintenance.js` (backups) sit outside its gaze.
- **Evidence.** Full module type graph in AD-03; baseline file with its single entry;
  `dbMaintenance.js:51–84` copying the whole DB file without tenant awareness; PR
  READ paths like `analytics.routes.js:15` scoping each aggregate.
- **Consequences.** Today the discipline is real and the ratchet pays for itself — this is
  *kept*, not flagged. The ceiling: any new file class outside the lint (services, a
  worker, an importer) adds unscoped-query risk with zero mechanical defense, and the
  backup/pull paths are a documented out-of-scope window (SEC-DATA-001 and
  SEC-SOCKET-003 are its two exploited instances — the ratchet passed those files).
- **Improvement.** IMP-12 (extend ratchet scopes), keep.

### AR-06 · Co-tenancy of *all* tenants in one SQLite file, copied whole-file for backup · **DEFECT (P0 for the backup surface, P2 for runtime)**

- **Implementation.** Dev default *is* the production default: one `.db` file serves all
  schools; the backup job copies that file; restore is all-tenants-or-none. Environment
  config (`knexfile.js`, `dbBackup` paths) is env-blind (fixed paths, not env-driven), and
  `config` still carries a `redis` block that nothing consumes.
- **Evidence.** `knexfile.js:4,40` (dev file; pg only if `DB_CLIENT=pg`),
  `dbMaintenance.js:14–16,51–84` (whole-file copy + 14-day prune); unused `redis` block
  (`config/index.js:29–32`); `.env.example` lists Redis keys nothing reads.
- **Consequences.** This is not a scaling problem at one school; it is a *boundary* problem:
  a leaked/stolen/corrupt backup file is **every school's data**, with no way to restore one
  tenant without the rest. As soon as a second school exists, "one file" stops being a
  simplification and starts being an incident multiplier. At today's scale it is the
  correct simple choice — provided the team accepts and documents the boundary.
- **Improvement.** IMP-03 (per-tenant export path + verification), IMP-14 (accept prolong
  single-file with tenant logistics documented — a *decision*, hence defect-class).

---

## A4 — AuthN/AuthZ design

### AR-07 · Parent identity custody is unverified by design; two modules implement the same custody differently · **DEFECT (P0)**

- **Implementation.** Two parent flows coexist: verified-parent login that trusts an
  unauthenticated `parent-login` endpoint minting verified-parent accounts purely from a
  student code (is_verified set without a verification step), and a separate handling in
  the student/parent signup path. Nothing in the schema models "proof" — the
  `parent_student_links.is_verified` flag exists but is set with no verification in
  between, and `is_verified`'s semantics differ between users (self-asserted) and links
  (system-asserted).
- **Evidence.** SEC-AUTH-001 (login) + FW-AUTH-001 (docs/static route versions disagree)
  — both re-verified this session; migration 001 establishing unverifiable boolean flags.
- **Consequences.** Parent-identity is the **authorization floor for every financial, grade,
  and messaging read in the product**; a GI\u200b-type takeover reads and (via accepted
  invoices) spends money. The two divergent implementations mean no single place to fix,
  and no audit event records when a parent linkage was *established* as opposed to
  refreshed.
- **Improvement.** IMP-09.

### AR-08 · Realtime plane diverges from REST auth: no revocation re-check, pad-denied no-pads, silent-drop events · **DEFECT (P0 on the realtime plane)**

- **Implementation.** Socket.IO handshake verifies JWT once at connect (shares
  `config.jwt.secret`); after that the connection is trusted for its lifetime — no
  `revoked_tokens`/`token_version` re-validation on subsequent frames, no event-level
  re-check on media injection or signalling, and forbidden actions are silent (`return;`)
  rather than padded/nonce-denied — functionally indistinguishable from a dropped feature
  and, worse, indistinguishable from abuse in logs.
- **Evidence.** Full read of `backend/src/socket.js` (SOCK-01): four negative
  reproductions — unauthenticated media injection, silent-denied by `return`, `isLive`
  latch preventing room GC, CORS-open handshake letting any origin attach.
- **Consequences.** A revoked/suspended user keeps a working realtime channel; a probing
  script maps every event exactly by silence; one compromised client can inject frames that
  the bus then distributes. This is the second architecture (after REST) that authorizes —
  and it does the job worse in exactly the places where concurrent access happens.
- **Improvement.** IMP-08.

### AR-09 · Role-to-operation granting is inlined as ~40+ literal arrays; the financial write path has no operation mapping at all · **DEBT → DEFECT at the finance write path (P1)**

- **Implementation.** `authorize('admin','manager','school_admin')`-style literals repeated
  across routes; no canonical role registry. The settle endpoint consults **no role** —
  only a client-supplied status flag (SEC-FIN-001). The `financial_officer` role exists in
  the role family but is never wired to a permission (nothing calls `authorize(...,
  'financial_officer')` for money movement).
- **Evidence.** Grep census this session — all `authorize(` call sites enumerable;
  base role `financial_officer` appears only in authz constant lists, never in a
  finance-authorization literal; settle path at `finance.routes.js:440–471`.
- **Consequences.** New roles/operations are typed by hand and typo-squat-prone today;
  tomorrow, an admin-class fix (a new account-type) will silently widen or fail to widen
  money operations — a class of bug already seen in SEC-AUTH-002's neighbor (docs/role
  drift). The missing operation mapping is what made SEC-FIN-001 *easy*.
- **Improvement.** IMP-10.

---

## A5 — Financial ledger & transaction design

### AR-10 · Zero transactions in the entire backend; settlement is 3+ non-atomic writes · **DEFECT (P0)**

- **Implementation.** Settling an installment performs sequential non-transactional writes
  (verify installment → update ledger balance → maybe dispatch receipt/SMS), each a
  separate statement with no isolation. Read the code: `grep ".transaction(" backend/src`
  returns **0 hits**. The receipts/callback path duplicates the settlement arithmetic
  implicitly rather than reusing a "confirmed payment" primitive.
- **Evidence.** `finance.routes.js:456–471` (settle); `finance.routes.js:487` (logAudit on
  the same path); global grep this session: no `db.transaction(` anywhere; two parallel
  payment paths (`pay-installment` student-submitted receipt vs `callback-verify` IPG-style)
  share no abstraction, so replay/idempotency semantics diverge by construction.
- **Consequences.** Two concurrent settles of the same invoice (HTTP interval, a
  double-tap, an impatient parent) read the same balance and both succeed → double-charge
  applied to ledger, receipt dispatched twice, SMS spam, and `paid_amount` > total with
  **no CHECK** to reject it. Not a future scaling risk: the write skew exists at one user
  and two parallel requests.
- **Improvement.** IMP-01.

### AR-11 · Settlement has no idempotency key and no per-tenant-posted invariant · **DEFECT (P0)** — merge target: IMP-01

- Combined into IMP-01: teach the API "a confirmed payment is `(ledger_id, authority,
  amount)` happened again is no-op" with a unique key, then the two settlement paths share
  it. Estimated small — knex transaction + one unique index; but it *is* the ledger's
  integrity contract, so classified DEFECT.

---

## A6 — Realtime communication

### AR-12 · In-memory rooms + debounced SQLite snapshot: fit-to-scale design with three sharp edges · **DEBT overall; DEFECT for the media path (P1)**

- **Implementation.** `activeClassrooms` Map; teacher creates room, students join by
  code; `live_classroom_sessions` snapshots debounced 1.5 s; no Redis adapter, no sticky
  routing — everything process-local. This is the **right size** for 1–2 schools: one
  process, zero infra.
- **Sharp edges.** (a) the silent `return;` deny pattern (AR-08); (b) `isLive` latch —
  teacher disconnects during "live" and the room is never GC'd (leak + zombie
  participants); (c) media injection uncontrolled (AR-08).
- **Classification.** Correct core + sanctioned edges is debt; the media edge is defect
  because integrity/DoS impact crosses out of the room into all joined clients.
- **Improvement.** IMP-08.

---

## A7 — AI integration & data integrity

### AR-13 · `needs_review` is contract but not enforced; deterministic fallback fabricates rows · **DEFECT (P0)**

- **Implementation.** Import pipeline: upload → OCR (Gemini, opt-in behind
  `require('@google/genai')` + `GEMINI_API_KEY`) → deterministic fallback that invents
  students when OCR yields nothing → preview → item list committed **server-side without
  the `needs_review` gate** that the UI and docs promise. `imported_from` lineage exists
  but the *review event itself* is never audited — there is no schema place for "reviewed
  by X at t" on AI-imported rows.
- **Evidence.** `paperToDigital.service.js:461–598` (commit path accepts unverified items);
  `ai.routes.js:45–56` (no needs_review check); SEC-AI-001 (fabricated rows);
  deterministic fallback `OCR-empty → fake students` with high confidence (SEC-AI-002
  describes the latent class).
- **Consequences.** Garbage flows into rosters/gradebook as if human-reviewed; support
  tickets, re-imports, and (with 007's indexes) poisoned aggregates follow. This is AI
  integrity *by theatre* — the riskiest version: it looks controlled.
- **Improvement.** IMP-13.

### AR-14 · AI pipeline is the largest single cross-domain mutator in the codebase · folded into AR-01
Improvement: IMP-06 shares the boundary machinery.

---

## A8 — File storage & upload

### AR-15 · One storage engine done well (serving/headers/process-limits), with two sharp edges · **DEBT (P2)**

- **Implementation.** Multer → `uploads/`; 50 MB / 30 files per request bounds; sharp
  thumbnails with SSSE3 CPU guard; authenticated static mount with aggressive
  CSP/`nosniff` per type — the *serving* story genuinely careful. Edges: (a) videos
  streaming reads `backend/uploads` **hardcoded**, bypassing `config.upload.dir` — config
  and code can silently diverge (drift class); (b) media lives next to the DB file and the
  backup tree in one repo root — one compromised artifact read = data + media.
- **Evidence.** `app.js:109–121` (mount + headers); `videos.routes.js` hardcoded uploads
  path; `upload.routes.js:127–134` dead `includes('')` branch confirmed this session
  (REC-02); multer 1.4.5-lts.1 (11 HIGH DoS advisories), busboy decode branch dead.
- **Consequences.** Dep-day risk concentrated in CVEs already disclosed (DoS in the
  request body parser); path-literalism breaks streaming if uploads move; co-location with
  DB file widens the blast radius of any file disclosure.
- **Improvement.** IMP-15.

---

## A9 — Deployment & infrastructure

### AR-16 · The production Docker image cannot build from a fresh checkout · **DEFECT (P0-adjacent: every deploy is broken until fixed, but break is at build time)**

- **Implementation.** `Dockerfile` runs `npm ci --omit=dev` — which **fails without a
  committed `package-lock.json`**; CI's own workflow admits there is no lockfile (and
  installs with `npm install --no-audit --no-fund`, i.e. resolution is non-reproducible
  every run). No docker-compose, no frontend image, no frontend build gate.
- **Evidence.** `backend/Dockerfile:16` × `backend-tests.yml:42–44`; `package-lock.json`
  absent at repo root and in both apps (glob this session: zero lockfiles).
- **Consequences.** "Deploy" today means *hand-rolled npm install on the server* — every
  deploy a dice roll on newer dependency majors (express 4.x→5, knex 3.x, all unmanaged).
  The gap is exactly the class this audit exists to close cheaply: commit one lockfile.
- **Improvement.** IMP-02.

### AR-17 · One process = one point of failure, deliberately, with a shim not a plan · **DEBT (accepted constraint, currently undocumented)**

- **Implementation.** Single Node process carries API + Socket.IO + scheduler (WAL-flush
  shim on SIGTERM, `app.js:505–512` — good hygiene) + procurement (SMS). No systemd
  unit, no PM2 ecosystem, no process manager in the image. PG support coded but not the
  shipped config; Redis config exists but nothing consumes it.
- **Evidence.** Dockerfile `CMD ["node","src/app.js"]`; `config/index.js:29–32` dead redis
  block; `config/knexfile.js:46` DB_CLIENT opt-in.
- **Consequences.** At-school-scale this is *fine if stated*: the risk is not existence but
  silence — nobody writing the README knows that a Node crash = whole app down, or that the
  restart loop (if any) replays the seed loop injecting role-users (see AR-18).
- **Improvement.** IMP-16 (document, supervise with one line of systemd — debt bucket by
  choice).

### AR-18 · Dev-only code (seed loop, tunnel keeper, wired secrets) ships in the release artifact · **DEFECT for secrets; DEBT for the rest (P1)**

- **Implementation.** `dev-server.js` commingles JWT secrets and a credential-seed loop
  (`123456` verified live this session — SEC-AUTH-002 reproducing not in theory but in
  practice); tunnel scripts (`start_permanent_tunnel.*`, `tunnel_keeper.js`) run unattended
  outside CI; the artifact does not distinguish dev from release.
- **Evidence.** `dev-server.js:6–7` committed secrets; seeded-login reproduction harness
  (`backend/.tmp/verify/seeded-login-123456-2026-11-11.cjs`); scripts dir listing this
  session.
- **Consequences.** Secret rotation is impossible; any environment with `NODE_ENV` loose
  plus the dev-server loop live gets seeded rol-users. The *design* (one bundle, env
  switches) is fine — the *secret custody* is the defect.
- **Improvement.** IMP-17.

---

## A10 — Observability, reliability, backup & recovery

### AR-19 · Observability floor is `console`; health is static JSON · **DEBT (P1 exposure: invisible failure)**

- **Implementation.** 28 `console.*` sites; no structured logging, no request IDs, no
  metrics client; `morgan('dev')` only in development; `/api/health` returns a static
  string (`app.js:176–184`) that says "ok" regardless of DB reachability, WAL lock, disk,
  or the Socket.IO plane.
- **Evidence.** Severity census this session (28 console sites; 9 `logAudit` call sites:
  5 gradebook, 2 finance, health, login); `app.js:178` literal "ok".
- **Consequences.** Signal-to-noise: you cannot tell postgres-down from disk-full from
  fine. The valuable audit trail exists (table + logger) but is written at 9 sites — the
  privileged ops that matter most (settle, parent-login mint, backups) mostly bypass it,
  and nothing reads `audit_logs`. For a small team the fix is one structured logger and
  one DB-backed health check; that's why it's P2 *effort* but P1 *exposure*.
- **Improvement.** IMP-04.

### AR-20 · Backups are whole-file copies, env-blind, unverified, co-tenant · **DEFECT (P0-adjacent: untested recovery = no recovery)**

- **Implementation.** `dbMaintenance.js` copies the entire SQLite file every N hours with
  14-day pruning; paths fixed at source; no read-back verification, no checksum, no
  restore drill, no per-tenant granularity (see AR-06).
- **Evidence.** `dbMaintenance.js:14–16,51–84`; SIGTERM WAL flush (`app.js:505–512`) which
  is good — it makes the backup window coherent but does not make the backup *correct*.
- **Consequences.** An operator cannot know a corrupt/incomplete backup exists. If the one
  file dies at 2 a.m., the recovery is "restore everything, hope" — with the tenant
  co-tenancy consequence of AR-06, that's a cross-school breach-of-confidentiality vector,
  not just an uptime event.
- **Improvement.** IMP-03.

---

## A11 — Performance & scalability

### AR-21 · Analytics `overview` endpoint is sequential N+1 by design · **DEBT (P1 for UX; the fix is known and local)**

- **Implementation.** For *each* class the overview handler runs ≥4 sequential queries
  (count → pluck → avg → count). At 200 classes that's ~800 sequential roundtrips for one
  response (no caching on this route).
- **Evidence.** `analytics.routes.js:41–70`.
- **Consequences.** Dashboard bloat on real rosters; the fix (group-by aggregates + one
  pass) is a debt-shaped refactor, no redesign.
- **Improvement.** IMP-18.

### AR-22 · Opt-in micro-cache with manual invalidation in 4 call sites · **DEBT (P2; stale-read risk noted)**

- **Implementation.** In-process TTL cache on announcements/video-folder endpoints;
  invalidation hand-wired per route (school-prefixed keys are correctly isolated —
  `cache.js:91` — good). Boundaries: per-process only (useless if a second process
  appears) and hand-maintained — a missed `delByPattern` = silent staleness.
- **Evidence.** `cache.js` (120-line class); usage census this session: 10 matches total,
  4 route sites + 3 invalidation sites.
- **Consequences.** Deletions made elsewhere (DB-level ops in maintenance) can serve stale
  data in the TTL window. Deliberately tiny — it is already near the floor for one process.
- **Improvement.** IMP-17 (dedupe invalidation through one helper; document the
d per-process limit).

### AR-23 · Frontend: ~50.7k LOC dashboard with 2 stores, zero tests, fat client bundles · **DEBT (P2)**

- **Implementation.** Next.js 15 App Router; 32 dashboard pages; only 2 zustand stores
  (`authStore`, `classStore`) with everything else managed by `useState` prop-drilled
  through component trees; 44 "use client" files; axios wrapper + whitelist origins; no
  test setup at all, no route-level code splitting visible; a Capacitor Android wrapper
  (3 source files) serving the same SPA.
- **Evidence.** Repo census this session: `frontend/src` 44 client files, ~50.7k LOC, 32
  `page.js`, stores dir listing, `frontend/android` 3 Java sources; no test dirs anywhere
  in the frontend tree; `frontend/package.json` scripts carry no `test` at all.
- **Consequences.** Every behavior change is a full-bundle regression bet with zero
  frontend guardrail; the Android skin adds a second delivery surface (webview cookies,
  storage, socket reconnect) that the main surface partially forgets — two sizes of the
  same app held in JS only. Not a scaling risk *today*, it's the DX/precarious-core
  debt tier.
- **Improvement.** IMP-19.

---

## A12 — Maintainability & developer experience

### AR-24 · Docs/CI testify mechanics that do not exist (README PG/Redis prereqs, `expectFailure` ratchet fiction) · **DEBT (P2; actively misleads)**

- **Implementation.** README prerequisites list PostgreSQL/Redis + `Node ≥24.14 for tests
  because node:test expectFailure` — no test source uses `expectFailure` (0 call sites,
  verified this session); CI workflow comment repeats the same fiction; `.env.example`
  exports Redis keys nothing reads. Meanwhile tests run fine on the shipped Node.
- **Evidence.** Grep census `expectFailure(` → 0; workflow yml comment; `.env.example`;
  precache in AD-01 §2.1/§2.8.
- **Consequences.** The README is *authoritative* instruction to a new dev, and it now
  describes software that isn't in the tree. Cost: on boarding churn + belief that "the
  ratchet requires Node 24" delays upgrades.
- **Improvement.** IMP-20.

### AR-25 · No TypeScript anywhere near a 50k-LOC client app and 530-LOC financial route · **DEBT (P2; reversible, bounded)**

- **Implementation.** `jsconfig.json` only; zero `.ts/.tsx`; both stores plain JS.
- **Evidence.** Repo census; `frontend/jsconfig.json` present, no `tsconfig`.
- **Consequences.** Naming-contract bugs (the route-shape refactor family, API field
  renames) are caught only at runtime — at exactly the finance/auth boundary where
  refactors are riskiest.
- **Improvement.** IMP-20 (opportunistic typing of stores + api client only; full
  codebase conversion is explicitly OUT of AD-05 scope).

---

## Classification recap

| ID | Area | Class | Priority |
|----|------|-------|----------|
| AR-01, AR-14 | Domain boundaries | DEFECT | P1 |
| AR-02 | Module shape | DEBT (9) / DEFECT (finance) | P1 |
| AR-03 | Ledger invariants | DEFECT | P0 |
| AR-04 | Schema migration parity | DEBT | P2 |
| AR-05 | Code-scoped tenancy ratchet | DEBT (ceiling noted) | P1 |
| AR-06 | Co-tenant single file + backup | DEFECT | P0 (backup surface) |
| AR-07 | Parent custody | DEFECT | P0 |
| AR-08 | Realtime auth divergence | DEFECT | P0 |
| AR-09 | Role registry gap | DEBT → DEFECT (finance write) | P1 |
| AR-10/11 | Zero transactions, no idempotency | DEFECT | P0 |
| AR-12 | Room lifecycle edges | DEBT (+media edge = AR-08) | P1 |
| AR-13 | AI `needs_review` theatre | DEFECT | P0 |
| AR-15 | Upload edges | DEBT | P2 |
| AR-16 | Prod image unbuildable | DEFECT | P0 (build-time) |
| AR-17 | Single-process SPOF | DEBT (accepted) | P2 |
| AR-18 | Dev secrets in artifact | DEFECT (secrets) / DEBT (rest) | P1 |
| AR-19 | Observability floor | DEBT (P1 exposure) | P1 |
| AR-20 | Untested whole-file backups | DEFECT | P0 |
| AR-21 | Analytics N+1 | DEBT | P1 |
| AR-22 | Manual cache invalidation | DEBT | P2 |
| AR-23 | Frontend DX | DEBT | P2 |
| AR-24 | Docs/CI drift | DEBT | P2 |
| AR-25 | No TS | DEBT | P2 |

**Deliberately out of scope (not recommended):** microservices, DB-per-tenant, Redis
adapter for one-process rooms, full TypeScript conversion, foreign observability suites —
all displaced a maintainable single-process design for no current-school gain. Low-priority
and cheap-to-keep: the in-process cache (AR-22), the route discipline (AR-23 context), the
opt-in `DB_CLIENT=pg` path.

*(IMP refs resolved in AD-05.)*
