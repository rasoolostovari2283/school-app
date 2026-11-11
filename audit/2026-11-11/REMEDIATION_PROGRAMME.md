# Remediation Programme — EduConnect

**For:** 3-person development team (1 tech lead + 2 engineers)
**Based on:** Verified findings from Socket.IO assessment, architectural assessment, business logic investigation, and prior security audits
**Total findings synthesized:** 95+ unique issues across security, architecture, data integrity, and operations
**Date:** 2026-11-11 · Commit `838b5b2`

---

## Prioritization Framework

| Factor | Weight | Rationale |
|---|---|---|
| Security severity (CVSS) | 30% | Exploitable vulnerabilities first |
| Exploitability (remote, unauthenticated, low complexity) | 25% | Real-world attack likelihood |
| Data exposure (PII, financial, academic records) | 20% | Regulatory / trust impact |
| Financial/academic integrity (ledger corruption, grade tampering) | 15% | Core product value |
| Architectural dependencies (must fix X before Y) | 10% | Sequencing efficiency |

---

## Programme Structure

```
PHASE 0: Emergency Security Fixes (Week 1)          → 4 tasks, 8-10 eng-days
PHASE 1: Data Integrity Foundations (Week 2-3)      → 5 tasks, 12-15 eng-days
PHASE 2: Architectural Hardening (Week 3-4)         → 4 tasks, 10-12 eng-days
PHASE 3: Operational Excellence (Week 5-6)          → 4 tasks, 8-10 eng-days
PHASE 4: Product Quality & Scale Prep (Week 7+)     → 5 tasks, 15-20 eng-days
```

**Total: ~53-67 engineering days** (≈ 3-4 sprints for 3-person team)

---

## PHASE 0: Emergency Security Fixes (Week 1)

*All P0 vulnerabilities with remote exploitability. Must ship before any other work.*

### TASK-001: Socket.IO Critical Vulnerabilities Patch
**Scope:** Fix 4 P0 Socket.IO vulnerabilities (SEC-SOCKET-001, 002, 003, 004)

**Files:**
- `backend/src/socket.js` (handshake, event handlers)
- `backend/src/middleware/auth.js` (revocation check helper)
- `backend/src/config/index.js` (frontend URL for CORS)

**Changes:**
1. **CORS restriction** (`socket.js:91-97`): Replace `callback(null, true)` with allowlist from `config.frontendUrl`
2. **Media injection auth** (`socket.js:561-564, 678-681`): Add `canScreenShare` / `canUserDraw` checks + payload size limit (100KB)
3. **WebRTC senderData fix** (`socket.js:662-676`): Server-constructs `senderData` from `room.participants.get(socket.id)`
4. **Per-event revocation check**: Add middleware `assertSessionValid(socket)` that re-validates `token_version` and `revoked_tokens` every 5 min or on sensitive events

**Regression Tests:**
- `backend/.tmp/verify/socket-auth-negative-2026-11-11.cjs` — all 9 P0 tests must pass
- New test: revoked token disconnects within 5 min of revocation
- New test: CORS rejects `https://evil.com` with credentials

**Dependencies:** None (independent)

**Acceptance Criteria:**
- [ ] `npm run test` passes (existing 145 tests)
- [ ] Negative test suite: 0 VULN-REPRODUCED
- [ ] CORS: `curl -H "Origin: https://evil.com" -v` → no `Access-Control-Allow-Credentials: true`
- [ ] Revocation: POST `/auth/logout-all` → teacher socket receives `force_disconnect` within 5 min

**Order:** Day 1-2 (Tech Lead + Engineer 1)

**Verification:** Independent run of negative test suite by Engineer 2

---

### TASK-002: Finance Settlement Atomicity & Idempotency
**Scope:** Fix BL-FIN-001, BL-FIN-002, BL-FIN-003, BL-FIN-004 (P0 financial integrity)

**Files:**
- `backend/src/modules/finance/finance.routes.js` (both settlement paths)
- `backend/src/database/migrations/XXX_add_finance_constraints.js` (new migration)
- `backend/src/modules/finance/finance.service.js` (new — extracted service)

**Changes:**
1. **New migration**: Add `UNIQUE (ledger_id, installment_number)`, `UNIQUE (ledger_id, authority)`, `CHECK (paid_amount >= 0 AND balance >= 0 AND paid_amount <= total_amount - discount_amount)`
2. **Extract `finance.service.js`** with `confirmPayment(ledgerId, installmentId, idempotencyKey, amount, source)` using `db.transaction()`
3. **Refactor both endpoints** (`verify-installment`, `callback-verify`) to call shared primitive
4. **Add `financial_officer` role to `authorize()`** on `callback-verify`

**Regression Tests:**
- New: `backend/.tmp/verify/finance-settlement-race.test.js` — 20 parallel settlements → exactly 1 succeeds, ledger correct
- New: Replay test — same `authority` twice → second returns 409
- Existing: `tests/security/finance-security.test.js` passes

**Dependencies:** TASK-001 (none, but same sprint)

**Acceptance Criteria:**
- [ ] Migration applies cleanly to SQLite and PG
- [ ] Race test: 20 concurrent → 1 success, `paid_amount === installment.amount`
- [ ] Idempotency: duplicate callback → 409, no double-charge
- [ ] `financial_officer` can settle; student/parent cannot

**Order:** Day 2-3 (Engineer 2 + Engineer 3 pair)

**Verification:** Tech Lead code review + independent race test run

---

### TASK-003: Attendance Close Race + Unique Constraints
**Scope:** Fix BL-ATT-001, BL-ATT-002 (P0 attendance integrity)

**Files:**
- `backend/src/modules/attendance/attendance.service.js` (`closeSession`)
- `backend/src/database/migrations/XXX_add_attendance_constraints.js` (new)
- `backend/src/modules/attendance/attendance.routes.js` (if needed)

**Changes:**
1. **Migration**: `UNIQUE (session_id, student_id)` on `attendance_records`
2. **Wrap `closeSession` in `db.transaction()`** with `SELECT ... FOR UPDATE` on `attendance_records` for that session
3. **Absent insert**: Use `ON CONFLICT (session_id, student_id) DO NOTHING` (or `DO UPDATE` only if not `excused`)

**Regression Tests:**
- New: `backend/.tmp/verify/attendance-close-race.test.js` — concurrent check-in + close → check-in preserved
- New: Duplicate check-in attempt → 409 (not 500)

**Dependencies:** TASK-002 (uses same transaction pattern)

**Acceptance Criteria:**
- [ ] Race test: concurrent check-in during close → student stays `present`
- [ ] Unique constraint: duplicate insert → 409 handled gracefully
- [ ] Excused status preserved on close

**Order:** Day 3-4 (Engineer 1)

**Verification:** Engineer 2 runs race test independently

---

### TASK-004: AI Pipeline Fabrication & Commit Gate
**Scope:** Fix BL-AI-001, BL-AI-002 (P0 academic integrity)

**Files:**
- `backend/src/modules/ai/paperToDigital.service.js` (deterministic fallback, commit gate)
- `backend/src/modules/ai/ai.routes.js` (commit endpoint)
- `backend/src/modules/school/sida.service.js` (roster import verification)

**Changes:**
1. **Remove hardcoded fabrication** (`paperToDigital.service.js:195-224, 265-288, 335-356`): Return empty items + `feasibility_assessment.overall_confidence: 0` when OCR empty
2. **Enforce `needs_review` gate** in `commitExtractedData` (line 523): `if (item.needs_review) throw forbiddenError('Item requires review before commit')`
3. **Require `human_reviewed: true`** on each committed item
4. **Add `ai_import_reviews` table** (migration) to audit review events

**Regression Tests:**
- New: `backend/.tmp/verify/ai-fabrication.test.js` — empty OCR → 0 items, not 3 fake students
- New: Commit with `needs_review: true` → 403
- Existing: AI extraction tests pass with valid input

**Dependencies:** None (independent)

**Acceptance Criteria:**
- [ ] Empty OCR returns `items: []`, `overall_confidence: 0`
- [ ] Commit endpoint rejects any `needs_review: true` item
- [ ] Review event logged to `ai_import_reviews`

**Order:** Day 4-5 (Tech Lead + Engineer 3)

**Verification:** Engineer 1 runs fabrication test; Tech Lead reviews commit gate logic

---

## PHASE 1: Data Integrity Foundations (Week 2-3)

*Systemic fixes for race conditions, missing constraints, and integrity gaps across domains.*

### TASK-101: Universal Race Condition Fixes (Quiz, Assignment, Enrollment)
**Scope:** Fix RC-003, RC-004, RC-005, RC-006, BL-QUIZ-001, BL-QUIZ-002, BL-ASG-001, BL-ENR-001

**Files:**
- `backend/src/modules/quizzes/quiz.service.js` (`startAttempt`, `submitAttempt`)
- `backend/src/modules/assignments/assignment.service.js` (`submit`, `grade`)
- `backend/src/modules/classes/class.service.js` (`joinClass`, `batchAddStudents`)
- `backend/src/database/migrations/XXX_add_unique_constraints.js` (new)

**Changes:**
1. **Migration**: Add unique constraints:
   - `quiz_attempts (quiz_id, student_id)`
   - `submissions (assignment_id, student_id)`
   - `class_members (class_id, user_id)` — already exists, verify
2. **Wrap in transactions**:
   - `startAttempt`: `db.transaction()` + `ON CONFLICT DO NOTHING RETURNING`
   - `submitAttempt`: `UPDATE ... SET completed_at=now() WHERE completed_at IS NULL RETURNING *` (atomic claim)
   - `assignment submit`: transaction + unique constraint
   - `joinClass`: `INSERT ... ON CONFLICT (class_id, user_id) DO NOTHING RETURNING *`

**Regression Tests:**
- New: Parallel `startAttempt` (20) → 1 attempt created
- New: Parallel `submitAttempt` → 1 graded, second 409
- New: Parallel `joinClass` → 1 membership, second 409 (not 500)

**Dependencies:** TASK-002 (transaction pattern established)

**Acceptance Criteria:**
- [ ] All 4 race conditions eliminated (verified by parallel test harness)
- [ ] Unique constraints prevent DB-level duplicates
- [ ] No 500 errors on contention — all return 409 with clear message

**Order:** Week 2, Days 1-3 (Engineer 1 + Engineer 2)

**Verification:** Tech Lead runs combined race test suite

---

### TASK-102: Schema Constraint Hardening (All Domains)
**Scope:** Fix 9 missing DB constraints (BL-FIN-003/004, BL-GRB-004, BL-GRB-005, BL-ATT-002, BL-QUIZ-001, BL-ASG-001, plus discipline, parent links)

**Files:**
- `backend/src/database/migrations/018_schema_hardening_constraints.js` (new consolidated migration)
- Affected tables: `tuition_installments`, `tuition_ledgers`, `attendance_records`, `quiz_attempts`, `submissions`, `gradebook_scores`, `discipline_records`, `parent_student_links`

**Constraints to Add:**
```sql
-- tuition_installments
ALTER TABLE tuition_installments ADD CONSTRAINT uq_ledger_installment UNIQUE (ledger_id, installment_number);
ALTER TABLE tuition_installments ADD CONSTRAINT uq_ledger_authority UNIQUE (ledger_id, authority);

-- tuition_ledgers
ALTER TABLE tuition_ledgers ADD CONSTRAINT chk_ledger_integrity CHECK (
  paid_amount >= 0 AND balance >= 0 AND paid_amount <= total_amount - discount_amount
);

-- attendance_records
ALTER TABLE attendance_records ADD CONSTRAINT uq_session_student UNIQUE (session_id, student_id);

-- quiz_attempts
ALTER TABLE quiz_attempts ADD CONSTRAINT uq_quiz_student UNIQUE (quiz_id, student_id);

-- submissions
ALTER TABLE submissions ADD CONSTRAINT uq_assignment_student UNIQUE (assignment_id, student_id);

-- gradebook_scores (requires FK to category for max_score)
ALTER TABLE gradebook_scores ADD COLUMN category_max_score NUMERIC DEFAULT 20;
ALTER TABLE gradebook_scores ADD CONSTRAINT chk_score_range CHECK (score >= 0 AND score <= category_max_score);

-- discipline_records
ALTER TABLE discipline_records ADD CONSTRAINT chk_points_range CHECK (points >= -20 AND points <= 20);

-- parent_student_links (remove unused is_verified or implement)
ALTER TABLE parent_student_links DROP COLUMN is_verified;  -- or add verification flow
```

**Regression Tests:**
- Migration applies cleanly (SQLite + PG)
- Insert violating rows → constraint violation
- Existing data passes all constraints (verify with `SELECT * FROM table WHERE NOT (constraint)`)

**Dependencies:** TASK-002, TASK-003, TASK-101 (some constraints overlap)

**Acceptance Criteria:**
- [ ] Single migration file, idempotent (`IF NOT EXISTS`)
- [ ] All 9 constraints enforced at DB level
- [ ] Zero existing data violations
- [ ] Rollback (`down`) documented (drops constraints only)

**Order:** Week 2, Days 2-4 (Engineer 3 — can parallelize with TASK-101)

**Verification:** Tech Lead reviews migration; Engineer 1 runs data validation script

---

### TASK-103: Parent Verification Flow Implementation
**Scope:** Fix BL-ENR-004, SEC-SOCKET-011, BL-AI-004 (parent identity unverified)

**Files:**
- `backend/src/database/migrations/019_parent_verification.js` (new)
- `backend/src/modules/classes/class.service.js` (`addStudentToClass` parent creation)
- `backend/src/modules/school/sida.service.js` (`importRoster` parent linking)
- `backend/src/middleware/auth.js` (`assertOwnsClass` parent branch)
- New: `backend/src/modules/auth/parentVerification.service.js`
- New: `backend/src/modules/auth/parentVerification.routes.js`

**Changes:**
1. **Migration**: Replace `is_verified` boolean with `verification_status ENUM ('pending', 'verified', 'rejected')`, `verification_code`, `verification_expires_at`
2. **Parent creation flow**: On link creation → generate 6-digit code → send SMS to parent phone → parent submits code via `/api/v1/auth/verify-parent-link` → status → `verified`
3. **Authorization**: `assertOwnsClass` parent branch requires `verification_status = 'verified'`
4. **SIDA import**: `auto_link_parents` creates `pending` links only; no access until verified

**Regression Tests:**
- New: Parent link created → status `pending` → cannot access child data
- New: SMS code submitted → status `verified` → access granted
- New: Invalid/expired code → rejected

**Dependencies:** TASK-004 (AI roster import uses same flow)

**Acceptance Criteria:**
- [ ] Zero parent links with `verified` status on creation
- [ ] Verified parent can access finance/grades/attendance
- [ ] Unverified parent gets 403 with clear message
- [ ] SMS integration tested with mock gateway

**Order:** Week 2, Days 3-5 (Tech Lead + Engineer 3)

**Verification:** Engineer 1 tests end-to-end flow

---

### TASK-104: Batch Operations Transaction Wrapper
**Scope:** Fix BL-GRB-001 (gradebook batch), BL-NOT-001/002 (notifications), BL-AI-003 (AI commit)

**Files:**
- `backend/src/modules/gradebook/gradebook.routes.js` (`/scores/batch`)
- `backend/src/modules/notifications/notification.service.js` (`sendBroadcast`)
- `backend/src/modules/ai/paperToDigital.service.js` (`commitExtractedData`)

**Changes:**
1. **Gradebook batch**: Wrap entire loop in `db.transaction()`; collect errors, rollback on any failure
2. **Notifications broadcast**: Single multi-row INSERT for all recipients (or transaction); log failed batch to `audit_logs`
3. **AI commit**: Wrap multi-domain writes (sida + gradebook + quiz) in single transaction; or make each service call idempotent with compensation

**Regression Tests:**
- Gradebook: 10 valid + 1 invalid → 0 persisted (not 10)
- Notifications: Partial failure → 0 notifications, audit log entry
- AI commit: Mid-commit failure → full rollback

**Dependencies:** TASK-101 (transaction pattern)

**Acceptance Criteria:**
- [ ] All-or-nothing semantics for batch operations
- [ ] Audit log captures failure details for notifications
- [ ] No partial state after failure

**Order:** Week 3, Days 1-2 (Engineer 2)

**Verification:** Engineer 3 runs failure injection tests

---

### TASK-105: Gradebook Precision & Discipline Score Fixes
**Scope:** Fix BL-GRB-002, BL-GRB-003, BL-GRB-005 (academic calculation integrity)

**Files:**
- `backend/src/modules/gradebook/gradebook.routes.js` (weighted average, report card)
- `backend/src/modules/gradebook/gradebook.service.js` (new — extract calculation logic)
- `backend/src/database/migrations/020_gradebook_precision.js` (new — integer arithmetic)

**Changes:**
1. **Migration**: Store scores × 100 as integers (`score_cents INTEGER`), weights × 100 as integers
2. **Calculation**: Use integer arithmetic: `weightedSum = Σ(score_cents * weight_cents) / 10000`, `totalWeight = Σ(weight_cents) / 100`
3. **Discipline score**: Clamp per-record (`CHECK points BETWEEN -20 AND 20` from TASK-102); compute in SQL not JS loop
4. **Extract to service**: Move calculation logic to `gradebook.service.js` for testability

**Regression Tests:**
- Precision: 100 categories with weights 0.33/0.33/0.34 → exact 100.00 total weight
- Report card: Known dataset → exact GPA match (golden master)
- Discipline: Negative points → clamped correctly

**Dependencies:** TASK-102 (constraints)

**Acceptance Criteria:**
- [ ] Zero floating-point drift in weighted averages
- [ ] Report card GPA matches golden master to 0.01
- [ ] Discipline score computed in single query

**Order:** Week 3, Days 2-3 (Engineer 1)

**Verification:** Tech Lead compares report card output against golden master

---

## PHASE 2: Architectural Hardening (Week 3-4)

*Cross-cutting improvements that reduce systemic risk and enable future velocity.*

### TASK-201: Module Boundary Enforcement (Lint Rule)
**Scope:** Fix AR-01, AR-14 (ungoverned cross-module imports), AR-08 (shared kernel brittleness)

**Files:**
- `backend/scripts/lint-module-boundaries.js` (new)
- `backend/.allowed-cross-module.json` (new config)
- `package.json` (add script)
- `.github/workflows/backend-tests.yml` (add to CI)

**Changes:**
1. **Allowlist config**:
   ```json
   {
     "ai/paperToDigital.service": ["school/sida.service", "quizzes/quiz.service"],
     "classes/class.routes": ["messages/message.controller"],
     "app.js": ["quizzes/quiz.service"],
     "quizzes/quiz.service": ["announcements"]  // table-level
   }
   ```
2. **Lint script**: Scan all `require('../modules/...')` → fail if not in allowlist
3. **Extend unscoped-query lint** to `services/`, `socket.js`, `dbMaintenance.js`

**Regression Tests:**
- CI fails on new unauthorized cross-module import
- Existing 5 allowed edges pass

**Dependencies:** AD-03 dependency analysis complete (done)

**Acceptance Criteria:**
- [ ] `npm run lint:boundaries` passes on current codebase
- [ ] CI runs it on every PR
- [ ] Adding `require('../modules/xyz')` in random file → CI fails

**Order:** Week 3, Day 4 (Engineer 3 — low risk, high leverage)

**Verification:** Tech Lead adds test violation in PR → CI catches it

---

### TASK-202: Lockfile + Reproducible Build + Docker Fix
**Scope:** Fix AR-16 (unbuildable Docker), AR-18 (dev secrets in artifact)

**Files:**
- `package-lock.json` (commit — root and/or per-workspace)
- `backend/Dockerfile` (verify `npm ci` works)
- `backend/.dockerignore` (exclude `dev-server.js`, `scripts/tunnel_*`, `*.log`)
- `backend/src/dev-server.js` (remove committed JWT secrets, guard seed loop with `NODE_ENV=development`)
- `.github/workflows/backend-tests.yml` (use `npm ci`)

**Changes:**
1. **Generate lockfiles**: `npm install --package-lock-only` in root, frontend, backend
2. **Dockerfile**: `npm ci --omit=dev` now works
3. **Dev server**: Move secrets to `.env.development`; seed loop only runs if `NODE_ENV === 'development'`
4. **CI**: Use `npm ci` everywhere

**Regression Tests:**
- Fresh checkout → `docker build -t test .` succeeds
- `docker run` → API responds on port 5000
- `npm test` passes in CI with lockfile

**Dependencies:** None (do early if possible)

**Acceptance Criteria:**
- [ ] `docker build` succeeds on clean machine
- [ ] No `dev-server.js` secrets in image (`docker run --rm test grep -r "jwt.*secret" /app`)
- [ ] CI uses `npm ci` and passes

**Order:** Week 3, Day 5 (Tech Lead — blocks all future deployments)

**Verification:** Engineer 1 builds image from scratch on separate machine

---

### TASK-203: Observability Floor (Structured Logging + Living Health)
**Scope:** Fix AR-19, AR-20 (console-only logging, static health, unverified backups)

**Files:**
- `backend/src/utils/logger.js` (new — JSON logger)
- `backend/src/app.js` (replace 28 `console.*`, enhance `/api/health`)
- `backend/src/services/dbMaintenance.js` (backup verification)
- `backend/src/middleware/requestId.js` (new — request ID middleware)

**Changes:**
1. **Logger**: 3-level (info/warn/error) JSON with `requestId`, `timestamp`, `module`, `action`
2. **Health endpoint**: `GET /api/health` → `SELECT 1` + `PRAGMA integrity_check` (SQLite) / `pg_isready` (PG) → 200/503
3. **Backup verification**: After copy, `PRAGMA integrity_check` + checksum; log result
4. **Request ID**: Generate UUID per request, propagate to logger, Socket.IO handshake

**Regression Tests:**
- Health: DB down → 503; DB up → 200 with `{status: 'ok', db: 'connected'}`
- Backup: Corrupt backup file → verification fails, alert logged
- Logs: Structured JSON, parseable by `jq`

**Dependencies:** TASK-202 (Docker health check can use `/api/health`)

**Acceptance Criteria:**
- [ ] Zero `console.*` in production code paths
- [ ] Health endpoint used by Docker `HEALTHCHECK`
- [ ] Backup verification runs and logs pass/fail
- [ ] Request ID appears in all log lines for a request

**Order:** Week 4, Days 1-3 (Engineer 1 + Engineer 2 pair)

**Verification:** Engineer 3 tails logs during load test; verifies structure

---

### TASK-204: Backup & Recovery Drill Automation
**Scope:** Fix AR-06, AR-20 (co-tenant backup, no restore drill)

**Files:**
- `backend/src/services/dbMaintenance.js` (per-tenant export)
- `backend/scripts/restore-drill.js` (new — automated drill)
- `docs/RECOVERY_DRILL.md` (new — runbook)

**Changes:**
1. **Per-tenant export**: `sqlite3 educonnect.db ".dump" | grep "school_id = 'SCH-1'" > school_sch1_$(date).sql` (scheduled weekly)
2. **Restore drill script**: Restores single school to temp DB, runs integrity checks, verifies row counts
3. **Runbook**: Step-by-step for on-call engineer

**Regression Tests:**
- Drill script runs weekly in CI (or cron), reports success/fail
- Restored single-school DB passes `PRAGMA integrity_check`
- Row counts match source within tolerance

**Dependencies:** TASK-203 (backup verification)

**Acceptance Criteria:**
- [ ] Per-tenant export produces valid SQL for any school_id
- [ ] Drill script runs unattended, exits 0 on success
- [ ] Runbook tested by engineer not on core team

**Order:** Week 4, Days 3-4 (Engineer 3)

**Verification:** Tech Lead runs drill manually; verifies restored data

---

## PHASE 3: Operational Excellence (Week 5-6)

*Developer experience, test coverage, and deployment hygiene.*

### TASK-301: Frontend Guardrails (Tests + TypeScript Boundary)
**Scope:** Fix AR-23, AR-25 (no frontend tests, no TS at critical boundary)

**Files:**
- `frontend/package.json` (add `test` script, vitest)
- `frontend/vitest.config.ts` (new)
- `frontend/src/stores/authStore.ts` (convert)
- `frontend/src/lib/api.ts` (convert)
- `frontend/src/app/dashboard/finance/` pages (convert)
- `frontend/src/tests/` (new — smoke tests)

**Changes:**
1. **Test setup**: Vitest + React Testing Library; CI runs on PR
2. **TypeScript boundary**: Convert `authStore`, `api`, finance pages to TS first (highest risk)
3. **Smoke tests**: Auth flow, API origin whitelist, socket init, finance ledger fetch

**Regression Tests:**
- `npm run test` in frontend → passes
- Type errors caught at build for converted files
- CI fails on type errors

**Dependencies:** TASK-201 (module boundaries help frontend too)

**Acceptance Criteria:**
- [ ] Frontend CI runs tests + typecheck
- [ ] Auth/API/finance boundary fully typed
- [ ] 5+ smoke tests covering critical paths

**Order:** Week 5, Days 1-3 (Engineer 1)

**Verification:** Engineer 2 adds intentional type error → CI catches

---

### TASK-302: Documentation & CI Truth Alignment
**Scope:** Fix AR-24 (README/CI drift), AR-18 (dev scripts in prod)

**Files:**
- `README.md` (fix prerequisites, remove `expectFailure`/Node 24 claims)
- `.github/workflows/backend-tests.yml` (remove fiction comments)
- `.env.example` (remove unused `REDIS_*`, `TUNNEL_URL`)
- `backend/scripts/` (move dev-only scripts to `dev-scripts/` or document)

**Changes:**
1. **README**: "PostgreSQL optional (`DB_CLIENT=pg`); Redis unused; SQLite default"
2. **CI comments**: Remove "Node 24.14 for expectFailure" — Node 20+ works
3. **Env example**: Only document actually-used variables
4. **Scripts**: `tunnel_keeper.js`, `start_permanent_tunnel.*` → `dev-scripts/` with `README.md` "DEV ONLY"

**Regression Tests:**
- Fresh developer follows README → succeeds on Node 20
- `grep -r "expectFailure" README.md .github/` → 0 hits

**Dependencies:** None

**Acceptance Criteria:**
- [ ] README matches actual runtime requirements
- [ ] No dead config in `.env.example`
- [ ] Dev scripts clearly separated

**Order:** Week 5, Day 4 (Tech Lead — quick win)

**Verification:** New team member (or Engineer 3) follows README end-to-end

---

### TASK-303: Deployment Honesty (Systemd + Process Supervision)
**Scope:** Fix AR-17 (single-process SPOF undocumented), AR-18 (dev secrets)

**Files:**
- `deploy/systemd/educonnect.service` (new)
- `backend/Dockerfile` (add `HEALTHCHECK`)
- `backend/src/app.js` (SIGTERM WAL flush already good)
- `docs/DEPLOYMENT.md` (new — architecture decisions)

**Changes:**
1. **Systemd unit**: `Restart=on-failure`, `RestartSec=5`, `EnvironmentFile=/etc/educonnect/env`
2. **Docker HEALTHCHECK**: `CMD curl -f http://localhost:5000/api/health || exit 1`
3. **Decision doc**: "Single SQLite file = all schools today; trigger for split: school #2 / compliance / restore need. One process = API + realtime + scheduler. Room model in-memory, no Redis adapter."

**Regression Tests:**
- `systemctl start educonnect` → service up, health check passes
- `docker run` → health check passes
- Kill process → systemd restarts, WAL flushed, data intact

**Dependencies:** TASK-203 (health endpoint)

**Acceptance Criteria:**
- [ ] Systemd unit works on Ubuntu 22.04+
- [ ] Docker health check integrates with orchestrator
- [ ] Decision doc signed off by team

**Order:** Week 5, Day 5 (Engineer 2)

**Verification:** Tech Lead reviews decision doc; Engineer 1 tests systemd on VM

---

### TASK-304: Rate Limiting & DoS Hardening (Socket + REST)
**Scope:** Fix SEC-SOCKET-007, SEC-FIN-006 (missing rate limits), BL-FIN-006

**Files:**
- `backend/src/socket.js` (per-socket rate limiter)
- `backend/src/middleware/rateLimit.js` (enhance existing)
- `backend/src/modules/finance/finance.routes.js` (settle endpoint specific limit)

**Changes:**
1. **Socket rate limiter**: Token bucket per socket — `wb_draw` 30/s, `screen_frame` 5/s, `chat` 10/min, `webrtc_signal` 20/s
2. **Finance settle**: `authorize('financial_officer')` + `rateLimit(10/min per user)` on `verify-installment` and `callback-verify`
3. **Global**: Increase auth limiter strictness

**Regression Tests:**
- Socket: 100 rapid `wb_draw` → >70 rejected with `error_message`
- Finance: 20 rapid settle attempts → >10 rejected 429
- Normal usage unaffected

**Dependencies:** TASK-001 (socket middleware pattern)

**Acceptance Criteria:**
- [ ] Per-socket limits enforced, legitimate traffic passes
- [ ] Finance settle has dedicated rate limit
- [ ] Metrics: rejected requests logged

**Order:** Week 6, Days 1-2 (Engineer 3)

**Verification:** Engineer 1 runs load test with `wrk`/`k6`

---

## PHASE 4: Product Quality & Scale Prep (Week 7+)

*Features that improve product quality but aren't security/integrity blockers.*

### TASK-401: Analytics N+1 Elimination
**Scope:** Fix AR-21 (analytics overview 800 queries)

**Files:**
- `backend/src/modules/analytics/analytics.routes.js` (`/overview`)

**Changes:**
- Replace per-class loop with single query using `GROUP BY` and window functions
- Add 60s cache (existing cache middleware)

**Acceptance Criteria:**
- [ ] `/analytics/overview` < 200ms for 200 classes
- [ ] Single query plan visible in `EXPLAIN`

---

### TASK-402: Cache Invalidation Helper
**Scope:** Fix AR-22 (manual invalidation)

**Files:**
- `backend/src/utils/cache.js` (add `invalidateForWrite(scope, patternFamily)`)
- All 4 cache usage sites

**Changes:**
- Single helper used by all writers; lint rule ensures usage

---

### TASK-403: Upload Path Unification
**Scope:** Fix AR-15 (hardcoded uploads path)

**Files:**
- `backend/src/modules/videos/video.routes.js` (use `config.upload.dir`)
- `backend/src/config/index.js` (ensure `upload.dir` configurable)

---

### TASK-404: Opportunistic TypeScript Expansion
**Scope:** Fix AR-25 (expand TS beyond boundary)

**Files:**
- High-risk modules first: `class.service`, `message.service`, `auth.service`

---

### TASK-405: Parent/Student Portal Polish
**Scope:** Fix BL-ENR-003 (random password), BL-ENR-006 (batch parsing)

**Files:**
- `class.service.js` (password flow, structured batch input)

---

## Dependency Graph (Critical Path)

```
TASK-001 (Socket P0) ──────┐
TASK-002 (Finance P0) ─────┼──► TASK-101 (Race fixes) ──► TASK-104 (Batch TX)
TASK-003 (Attendance P0) ──┤           │
TASK-004 (AI P0) ──────────┘           ▼
                              TASK-102 (Constraints) ◄──┐
                              TASK-103 (Parent Verify)   │
                                                           ▼
TASK-201 (Module Lint) ──────► TASK-202 (Lockfile/Docker) ──► TASK-203 (Observability)
                                                                       │
                                                         TASK-204 (Backup Drill) ◄──┘
                                                                       │
                                                               TASK-301 (Frontend Tests)
                                                               TASK-302 (Docs Truth)
                                                               TASK-303 (Deployment)
                                                               TASK-304 (Rate Limits)
                                                                       │
                                                               TASK-401..405 (Quality)
```

**Critical path:** TASK-001/002/003/004 → TASK-101 → TASK-102/103 → TASK-203 → TASK-204
**Parallelizable:** TASK-101 || TASK-102 || TASK-103; TASK-201 || TASK-202; TASK-301..304

---

## Team Allocation (3 People)

| Week | Tech Lead | Engineer 1 | Engineer 2 | Engineer 3 |
|---|---|---|---|---|
| 1 | TASK-001, TASK-004 | TASK-001, TASK-003 | TASK-002 | TASK-002, TASK-004 |
| 2 | TASK-103, TASK-201 | TASK-101, TASK-105 | TASK-101, TASK-104 | TASK-102, TASK-103 |
| 3 | TASK-202, TASK-203 | TASK-105, TASK-203 | TASK-104, TASK-203 | TASK-201, TASK-204 |
| 4 | TASK-203, TASK-204 | TASK-203 | TASK-304 | TASK-204, TASK-301 |
| 5 | TASK-302, TASK-303 | TASK-301 | TASK-303, TASK-304 | TASK-301, TASK-304 |
| 6 | TASK-401..405 (distributed) | | | |

---

## Independent Verification Requirements

| Phase | Verification Method | Verifier |
|---|---|---|
| Phase 0 | Negative test suite (automated) + manual exploit attempts | Engineer not author |
| Phase 1 | Race test harness + constraint validation script + data integrity audit | Tech Lead |
| Phase 2 | CI pipeline test (lint, build, health) + backup drill run | Engineer not author |
| Phase 3 | Fresh onboarding test (follow README) + load test | New team member or rotated engineer |
| Phase 4 | Performance benchmarks + golden master comparisons | Tech Lead |

**Verification artifacts** (all in `backend/.tmp/verify/` or `frontend/.tmp/verify/`):
- `socket-auth-negative-*.cjs`
- `finance-settlement-race.test.js`
- `attendance-close-race.test.js`
- `ai-fabrication.test.js`
- `race-test-harness.js` (generic)
- `constraint-validator.js` (checks all 9 constraints)
- `restore-drill.js` (backup drill)
- `load-test.yml` (k6/wrk config)

---

## Go/No-Go Gates

| Gate | Criteria | Blocking Tasks |
|---|---|---|
| **End of Week 1** | All 4 P0 Socket vulns fixed; Finance settlement atomic; Attendance race fixed; AI fabrication removed | TASK-001, 002, 003, 004 |
| **End of Week 3** | All race conditions eliminated; All 9 DB constraints enforced; Parent verification flow working; Batch operations transactional | TASK-101, 102, 103, 104 |
| **End of Week 4** | Docker builds from scratch; Health endpoint living; Backup verified; Module boundaries enforced in CI | TASK-201, 202, 203, 204 |
| **End of Week 6** | Frontend has tests + TS boundary; Docs match reality; Systemd deployment works; Rate limits active | TASK-301, 302, 303, 304 |

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PG migration differences (SQLite vs PG constraints) | High | P0 tasks blocked | Test migrations on both engines in CI from Week 1 |
| `better-sqlite3` transaction semantics differ from PG | Medium | TASK-002, 101 | Use `db.transaction()` API (knex abstracts); verify on PG |
| Team capacity (3 people, parallel tracks) | High | Schedule slip | Strict WIP limit: max 2 tasks/person; daily standup sync |
| Legacy data violates new constraints | Medium | TASK-102 blocked | Pre-migration audit script: `SELECT * FROM table WHERE NOT (constraint)` |
| Frontend TS conversion scope creep | Medium | TASK-301 delayed | Strict boundary: only authStore, api, finance pages in Phase 3 |

---

## Success Metrics (Measurable)

| Metric | Baseline | Target (Week 6) |
|---|---|---|
| P0 vulnerabilities | 12 | 0 |
| Race conditions reproducible | 8 | 0 |
| Missing DB constraints | 9 | 0 |
| `console.*` in prod code | 28 | 0 |
| Health endpoint accuracy | 0% (static) | 100% (living) |
| Backup verification | 0% | 100% (automated) |
| Frontend test coverage | 0% | >20% (smoke) |
| CI build reproducibility | Fails (no lock) | Passes (lockfile) |
| Documentation drift | High (README/CI) | Zero |

---

*This programme is a living document. Re-prioritize at each gate based on learned reality. All tasks are designed to be independently verifiable and shippable.*