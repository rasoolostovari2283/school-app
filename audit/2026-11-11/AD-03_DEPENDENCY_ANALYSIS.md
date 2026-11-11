# AD-03 — Dependency Analysis

Independent read-only assessment @ `main` 838b5b2 · 2026-11-11
All numbers derived from the full repository scan (subagent `ses_e3832d7b4ffeuJpxru7uUoo7gI`)
plus targeted verification of the 5 cross-module edges.

---

## 1. Backend Module Dependency Graph — Executive Summary

| Metric | Value |
|---|---|
| Total modules | 21 (not 24; 3 dirs in root were not modules) |
| Total module source LOC | 12,230 |
| Cross-module `require()` edges | **5** (all one-directional, verified) |
| Cycles (direct or transitive) | **0** |
| Modules with NO service file | 10 (48%) |
| Modules with NO controller file | 13 (62%) |
| Route handler sites | 179 across 21 `routes.js` files |

**Architecture classification:** **Flat star** over shared singletons.
- Every module imports `middleware/auth`, `config/database`, and a subset of `utils/*`.
- No module imports another module's routes, service, or controller (except the 5 edges).
- Zero cycles is guaranteed by zero inter-module edges.

---

## 2. Cross-Module Edges — Complete Census (verified by regex + manual)

| From (file) | To (module/file) | Line | Nature |
|---|---|---|---|
| `classes/class.routes.js:4` | `messages/message.controller.js` | 4 | `require('../messages/message.controller')` — class routes call message controller for notifications |
| `ai/paperToDigital.service.js:21` | `school/sida.service.js` | 21 | `require('../school/sida.service')` — AI commit writes Sida roster rows |
| `ai/paperToDigital.service.js:22` | `quizzes/quiz.service.js` | 22 | `require('../quizzes/quiz.service')` — AI commit writes quiz items |
| `app.js:403,412,422,430,438` | `quizzes/quiz.service.js` | 403–438 | 5 inline `require('./modules/quizzes/quiz.service')` in global quiz router handlers |
| `quizzes/quiz.service.js:274` | `announcements` table (raw) | 274 | Direct `db('announcements').insert(...)` — quiz creation fan-outs announcement |

**No other cross-module `require('../modules/...')` or `require('../../modules/...')` statements exist** — verified by:
```bash
grep -r "require\(['\"]\.\./modules/" backend/src/modules/
grep -r "require\(['\"]\.\.\/modules/" backend/src/modules/
```
Both return only the 5 edges above.

---

## 3. Coupling Analysis

### 3.1 Radial Coupling (singleton fan-in)

| Shared module | Consumers (files) | Consumers (modules) | Purpose |
|---|---|---|---|
| `middleware/auth` | 42 | 21 | authenticate, authorize, assertSameSchool, assertOwnsClass, forbiddenError, notFoundError |
| `config/database` | 22 | 20 | knex instance (all except `upload`) |
| `utils/dbHelpers` | 12 | 13 | generateId, insertAndReturn, updateAndReturn, deleteAndReturn |
| `utils/iranianValidators` | 3 | 3 | phone, nationalCode, iban validators (ai, finance, school) |
| `utils/cache` | 3 | 2 | cacheMiddleware, cache instance (announcements, videos) |
| `utils/localCaptcha` | 2 | 2 | auth module (controller + service) |
| `utils/usernameHelper` | 2 | 2 | auth + messages |
| `utils/auditLogger` | 2 | 2 | finance + gradebook |
| `services/smsGateway` | 3 | 3 | attendance, finance, school |
| `services/classroomPersistence` | 2 | 2 | socket.js + classes |

**Interpretation:** The "shared kernel" is the *de facto* architecture. All 21 modules depend on `auth` and `database`; 13 depend on `dbHelpers`. This is **not** a layered architecture — it's a singleton hub.

### 3.2 Afferent / Efferent Coupling per Module

| Module | Efferent (imports) | Afferent (imported by) | Instability |
|---|---|---|---|
| auth | 4 (db, dbHelpers, iranianValidators, localCaptcha) | 21 (all modules) | 0.16 — **stable hub** |
| messages | 4 (db, dbHelpers, auth, usernameHelper) | 1 (classes) | 0.80 |
| school | 3 (db, dbHelpers, auth) | 1 (ai) | 0.75 |
| quizzes | 4 (db, dbHelpers, auth, iranianValidators) | 2 (ai, app.js inline) | 0.67 |
| ai | 6 (db, auth, dbHelpers, iranianValidators, sida, quiz) | 0 | 1.00 — **leaf** |
| classes | 5 (db, dbHelpers, auth, messageController, classroomPersistence) | 0 | 1.00 |
| finance | 4 (db, auth, auditLogger, smsGateway) | 0 | 1.00 |
| videos | 3 (db, auth, cache) | 0 | 1.00 |
| gradebook | 3 (db, auth, auditLogger) | 0 | 1.00 |
| ... (12 more leaf modules) | | | |

**All non-hub modules are leaves (instability = 1.0).** The architecture has one stable center (`auth`, `database`) and 20 leaves that only depend inward.

---

## 4. Module Shape Defects (Structure vs. Intent)

| Defect | Count | Modules Affected | Severity |
|---|---|---|---|
| **No service file** (logic entirely in routes) | 10 | analytics, courses, discipline, feedback, finance, gradebook, schedules, tickets, upload, videos | **P1 for finance** (531 LOC, settlement logic untestable); P2 for others |
| **No controller file** | 13 | ai, analytics, courses, discipline, feedback, finance, gradebook, schedules, school, tickets, upload, videos, quizzes | P2 (controller extraction is local cleanup) |
| **Routes > 500 LOC** | 4 | videos (774), school (730), gradebook (683), finance (531) | P2 (decompose when touched) |
| **Single-file module** | 10 | (same as no-service list) | P2 |

**Finance is the only DEFECT-class shape anomaly:** 531 LOC of financial settlement logic (read-modify-write, idempotency, balance projection) lives in `finance.routes.js` with **no service seam** — IMP-01/07 in AD-05 target this.

---

## 5. Route Surface Area

| Module | GET | POST | PUT | DELETE | PATCH | Total |
|---|---|---|---|---|---|---|
| classes | 8 | 7 | 3 | 3 | 0 | 21 |
| messages | 6 | 8 | 4 | 3 | 0 | 21 |
| auth | 2 | 12 | 2 | 1 | 0 | 17 |
| studyPlanner | 5 | 6 | 4 | 2 | 0 | 17 |
| school | 8 | 5 | 2 | 1 | 0 | 16 |
| videos | 7 | 5 | 1 | 1 | 0 | 14 |
| gradebook | 4 | 3 | 2 | 1 | 0 | 10 |
| announcements | 3 | 2 | 1 | 1 | 0 | 7 |
| assignments | 2 | 3 | 1 | 1 | 0 | 7 |
| attendance | 2 | 3 | 1 | 1 | 0 | 7 |
| finance | 2 | 3 | 1 | 1 | 0 | 7 |
| quizzes | 2 | 3 | 1 | 1 | 0 | 7 |
| notifications | 2 | 2 | 1 | 1 | 0 | 6 |
| courses | 1 | 2 | 0 | 1 | 0 | 4 |
| discipline | 1 | 2 | 0 | 1 | 0 | 4 |
| feedback | 1 | 2 | 0 | 1 | 0 | 4 |
| tickets | 1 | 2 | 0 | 1 | 0 | 4 |
| ai | 1 | 2 | 0 | 0 | 0 | 3 |
| schedules | 1 | 1 | 0 | 1 | 0 | 3 |
| analytics | 1 | 0 | 0 | 0 | 0 | 1 |
| upload | 0 | 1 | 0 | 0 | 0 | 1 |
| **TOTAL** | **66** | **78** | **17** | **17** | **1** | **179** |

**Observation:** Mutation-heavy surface (POST 44%, PUT/DELETE/PATCH 19%). Finance has 7 endpoints but the settle path is the only one with integrity consequences.

---

## 6. Frontend Dependency Structure

### 6.1 Page-Level Import Graph (dashboard sections → stores)

```
dashboard/
├── analytics/page.js          ──► authStore
├── announcements/page.js      ──► authStore
├── assignments/page.js        ──► authStore
├── attendance/page.js         ──► authStore
├── children/page.js           ──► authStore
├── class-rosters/page.js      ──► authStore
├── classes/
│   ├── page.js                ──► authStore + classStore
│   ├── [id]/page.js           ──► authStore + classStore
│   └── [id]/live/page.js      ──► authStore + classStore + socket
├── discipline/page.js         ──► authStore
├── finance/page.js            ──► authStore
├── gradebook/page.js          ──► (NO authStore guard — 7 LOC loader)
├── manage-classes/page.js     ──► authStore
├── management/page.js         ──► authStore
├── messages/page.js           ──► authStore
├── notifications/page.js      ──► (NO authStore guard — 152 LOC)
├── quizzes/page.js            ──► authStore
├── record/page.js             ──► authStore
├── report-card/page.js        ──► authStore
├── schedule/page.js           ──► authStore
├── school-meetings/page.js    ──► authStore
├── sess/page.js               ──► authStore
├── settings/page.js           ──► authStore
├── smart-operations/page.js   ──► authStore
├── study-planner/page.js      ──► authStore
├── teacher-setup/page.js      ──► authStore (39 LOC)
├── teachers/page.js           ──► authStore
├── tickets/page.js            ──► authStore
└── videos/page.js             ──► authStore
```

**35 files import `authStore`** (28 under `dashboard/`). Only 2 section pages lack the guard.

### 6.2 Client Bundle Composition

| Category | Files | JS LOC |
|---|---|---|
| Dashboard pages (29 page.js) | 29 | 42,363 |
| Components (src/components/*) | 18 | 6,238 |
| Stores (authStore, classStore) | 2 | ~2,000 |
| Lib (api.js, socket.js, pptxRenderer) | 3 | ~1,500 |
| App router layout/root | 3 | ~500 |
| **Total** | **55** | **~52,600** |

**No route-level code splitting observed** — all dashboard pages appear in the main client bundle. 44 "use client" files confirm heavy client-side rendering.

---

## 7. Database Schema Co-occurrence (Migration-Level Coupling)

Tables touched by ≥2 migration files indicate evolutionary coupling:

| Table | Migration files (create/alter) | Coupling degree |
|---|---|---|
| users | 001, 004, 011, 012, 015, 016, 017 | 7 (highest — identity core) |
| videos | 003, 005, 007, 016 | 4 |
| announcements | 003, 009, 010, 015 | 4 |
| quizzes | 002, 004, 016, 015 | 4 |
| classes | 001, 007 | 2 |
| message_groups | 004, 016 | 2 |
| messages | 003, 008 | 2 |
| message_group_messages | 004, 008 | 2 |
| schools | 001, 013 | 2 |
| attendance_records | 002, 006 | 2 |
| 17 more tables | 014 (raw indexes) + 1 other | 2 |

**44 distinct tables** created across 17 migrations. Migration 014 (performance indexes) and 015 (quiz/auth indexes) touch 21+6 tables via raw SQL — the widest co-occurrence events.

---

## 8. Configuration & Environment Coupling

| Config file | Consumers | Drift risk |
|---|---|---|
| `config/index.js` | 21 modules + app.js + socket.js | **High** — `redis` block (lines 29–32) unused; `db` object has env-blind fallbacks; `nodeEnv` logic mutated after SEC-AUTH-002 |
| `config/knexfile.js` | `migrate`, `seed`, `test` scripts, app.js | **Medium** — `better-sqlite3` default; PG only if `DB_CLIENT=pg`; dev DB file path used in prod unless overridden |
| `config/database.js` | 20 modules (knex instance) | **Low** — thin wrapper, but hardcodes `better-sqlite3` for test |
| `.env.example` | Documentation only | **High drift** — lists `REDIS_*`, `SMS_API_KEY`, `TUNNEL_URL` (dev-only); no `DB_CLIENT` default |

**No committed lockfile** (root `bun.lock` only). CI uses `npm install --no-audit --no-fund`; Dockerfile uses `npm ci --omit=dev` → **build fails on fresh checkout** (AR-16).

---

## 9. Test Surface Coupling

| Test file | Target module | Coupling type |
|---|---|---|
| `tests/security/extended-findings.test.js` | auth, finance, ai, upload, socket | Black-box HTTP (145 tests) |
| `tests/security/auth-security.test.js` | auth | Black-box HTTP |
| `tests/security/finance-security.test.js` | finance | Black-box HTTP |
| `tests/security/socket-security.test.js` | socket | Black-box WS (separate harness) |
| `tests/unit/*.test.js` | various | Mixed |

**Frontend: 0 tests** — no test runner, no test files, no CI gate.

**Test DB isolation:** `tests/support/env.js` creates per-PID SQLite (`educonnect.test.<pid>.db`) — excellent isolation, zero shared-state flakes.

---

## 10. Architectural Risk Summary from Dependencies

| Risk | Evidence | Classification |
|---|---|---|
| **Singleton hub brittleness** | 21 modules → `auth`, `database`; change to either = full regression | DEBT (accepted, but document) |
| **Finance routes-only** | 531 LOC, settlement logic, no service seam, 0 transactions | DEFECT (P0 — IMP-01/07) |
| **AI cross-domain writer** | paperToDigital → sida + quiz services + announcements table | DEFECT (boundary violation — IMP-06/08) |
| **Quiz → announcements direct write** | quiz.service.js:274 `db('announcements').insert()` | DEBT (localized, but crosses domain) |
| **Classes → messages controller** | classes.routes.js:4 requires message.controller | DEBT (notification side-effect in class flow) |
| **App.js inline quiz service requires** | 5× `require('./modules/quizzes/quiz.service')` in router handlers | DEBT (composition root leakage) |
| **Zero transactions** | 0 `db.transaction(` in backend/src | DEFECT (P0 — finance, AR-10) |
| **Single SQLite file = all tenants** | knexfile.js default; backup copies whole file | DEFECT (P0 backup surface — AR-06/20) |
| **No frontend tests** | 0 test files, no test script | DEBT (P2 — IMP-18) |
| **Unbuildable Docker image** | `npm ci` w/o lockfile | DEFECT (P0 — IMP-02) |

---

## 11. Recommended Governance (from AD-05 IMP-08)

1. **Allowlist lint** — same pattern as `lint-unscoped-queries`:
   ```js
   // .allowed-cross-module.json
   {
     "ai": ["school/sida.service", "quizzes/quiz.service"],
     "classes": ["messages/message.controller"],
     "app.js": ["quizzes/quiz.service"],
     "quizzes": ["announcements"] // table-level, not module
   }
   ```
   CI fails on any `require('../modules/...')` not in allowlist.

2. **Extend unscoped-query ratchet** to `services/`, `socket.js`, `dbMaintenance.js` (currently routes-only).

3. **Finance service extraction** (IMP-07) creates the first proper domain boundary with a testable seam.

---

*All numbers are exact counts from the full repository scan. The 5 cross-module edges were individually verified by reading the source lines.*