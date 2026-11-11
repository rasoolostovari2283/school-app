# Audit Ledger — EduConnect (school-app @ 838b5b2, main)

Date: 2026-11-10 → 2026-11-11
Baseline verified: HEAD = 838b5b20f257ca7b5d10efe3a1530c2aa84bdf6e, branch `main`, remote origin up to date,
tree clean except this untracked `audit/` directory (pre-existing ledger from an earlier session; preserved).

> NOTE: audit/ must remain read-only artifacts; no app code changes. All findings were independently
> re-read against the working tree and dynamically reproduced where feasible (details below).

Repo under test: `/Volumes/Samsung T7 1TB/Educonnect/Clone GitHub EduConnect/school-app`

## Stack discovered
- Monorepo: root package.json (workspaces `frontend` + `backend`), single `bun.lock` (lockfileVersion 2, root only).
- Backend (backend/node_modules): Express 4.22.3 (not 5 — auth middleware and routes confirm the installed major is 4),
  multer 1.4.5-lts.2, helmet 7.2.0, joi 17.13.9, express-rate-limit 7.5.1, bcryptjs 2.4.3, jsonwebtoken 9.0.3,
  knex 3.3.0, better-sqlite3 13.0.3, socket.io 4.8.4, sharp 0.33.5, pg 8.23.1, uuid 10.0.0.
  `@google/genai` is NOT installed (missing from backend, root, and frontend node_modules) → the Gemini cloud engine
  in `paperToDigital.service.js` can never activate in this tree; the deterministic fallback always runs.
- Frontend: Next.js 15 (App Router), React 19, Zustand, axios, socket.io-client; tokens in `localStorage`.
- DB: better-sqlite3 + knex; `backend/src/database/migrations/001–017`, `seeds/001_school_data.js`, `seeds/003`.
  `backend/educonnect.db` (4096B, schema-only) present in the working tree; SQLite WAL.
- Tests: `node --test` suite under `backend/tests/{security,smoke,ci,support,fixtures}`.

## Work completed
- [x] Baseline verification (HEAD, branch, remote, tree cleanliness, audit-dir provenance)
- [x] Top-level structure map; app.js read (middleware order, CORS, rate limits, backup + APK + uploads routes)
- [x] config/index.js, config/database.js, knexfile (SQLite via TEST_DB_FILE/DEV env; no credentials in tree)
- [x] middleware/auth.js (JWT+refresh+token_version+revoked_tokens, cookie fallback), upload.js, errorHandler, persianNormalizer
- [x] auth controller/service/calculators (quick-entry, login, register, parent-login, register-school)
- [x] AI module: ai.routes, ai.service, paperToDigital.service (601 lines — the new paper-to-digital feature)
- [x] upload module + multer config + security tests (uploads.test.js + extended-findings)
- [x] messages (service 1030 lines incl. the `ensureUserHasUsername` undefined-symbol paths), socket.js
- [x] gradebook/class/quizzes/attendance routes + portfolio of ownership checks (native gradebook properly scoped)
- [x] finance (callback-verify 406–527), school/sida.service (importRoster), externalLive, classroomPersistence
- [x] announcements, notifications, studyPlanner, feedback, tickets, videos, courses, schedules (spot)
- [x] utils: auditLogger, cache, dbHelpers, iranianValidators, localCaptcha, usernameHelper, sms.service, smsGateway, dbMaintenance
- [x] migrations 001–017 + seeds 001/003 (seed 001 hashes the literal `123456` for ALL staff/students/parents)
- [x] frontend: lib/api.js (localStorage tokens), lib/socket.js (credentialed socket with localStorage token),
      stores/authStore.js (DEMO_ACCOUNTS `123456` matching seed 001), app/login/page.js (demo role picker)
- [x] Dockerfile / docker-compose / Deploy-Windows-Server.ps1 / GitHub workflow (no root Dockerfile; compose uses
      `backend/Dockerfile` via `build: .`; workflow runs `npm install` w/o lockfile, `--no-audit`)
- [x] dev-server.js (committed dev-only JWT secrets), metadata.json, .env.example files (.env gitignored; no committed secrets)
- [x] Test suite run: 145/145 pass (node --test, security+smoke+ci = 145 across 11 security files, offline, over bash).
- [x] Dependency inventory: 203 unique npm packages inventoried from node_modules; OSV.dev batch query on 2026-11-11:
      4 packages match advisories (multer 11 HIGH DoS, sharp 3 HIGH, minimatch 1 MODERATE, uuid 1 MODERATE).
- [x] Dynamic verification harness: `backend/.tmp/verify/findings-dynamic-2026-11-10.cjs`
      runs the real app on a disposable SQLite DB (two-school fixture) + ephemeral port.
      Result: 10/10 candidate behaviours reproduced (A1–A3 parent-login, B1 callback-verify, C1–C3 AI commit,
      D1 directory 500, E1 CORS, F1 backup role guard). Output preserved in `.tmp/verify/out.txt`.
- [x] Drafted 9 deliverable reports under audit/2026-11-10/.

## Key dynamic-verification evidence (all reproduced live against the throwaway harness)
| Check | Result |
|---|---|
| A1 parent-login unauth + `STD-A-1002` → parent row created, verified, student PII returned | Reproduced (200, parents 2→3, is_verified=1, display_name in body) |
| A2 unknown-code 401 oracle + frontend `{student_identifier,...}` → 400 | Reproduced |
| A3 3 sequential/enumerable codes across BOTH schools → student names | Reproduced |
| B1 student `a-student` posts `{status:'OK', authority:'FAKE-INJECTED-AUTHORITY'}` to `/finance/callback-verify/installment-a-1` | Reproduced (installment `verified`, ledger paid 6,000,000, balance 19,000,000, meritless authority echoed) |
| C1 empty gradesheet OCR → fabricated rows (امیرحسین رضایی 0.97 / سارا محمدی 0.95) | Reproduced |
| C2 commit fabricated items to class-a → score-a-1 18→3.0, needs_review item committed too | Reproduced |
| C3 empty roster OCR → 2 fabricated pupils committed as real users (003→5 students; settings contains forged national code) | Reproduced |
| D1 `/messages/directory` with username-less users → 500 `ensureUserHasUsername is not a function` | Reproduced |
| E1 `Origin: https://evil.example.com` → ACAO reflected on GET /api/health + preflight, allow-credentials=true | Reproduced |
| F1 `GET /api/v1/system/backups` as admin@school-a passes (role-only guard; backups list empty in harness) | Reproduced |

## Findings register (full detail in the numbered sections)
- S-01 SEC-AI-001 (Critical) Paper-to-digital committed fabricated data; empty OCR; commit ignores need_review + provenance. Verified dynamically (C1–C3).
- S-02 SEC-AI-002 (High) Gemini blind JSON.parse + indirect prompt injection via scanned/OCR input; no schema validation. Static.
- S-03 SEC-AUTH-001 (High) Parent-login: unauthenticated verified parent creation + student PII disclosure + cross-tenant code scope + sequential/enumerable codes + no rate limit. Verified (A1–A3).
- S-04 SEC-AUTH-002 (High) Seed-reintroduced universal default credential `123456` for every seeded staff/student/parent + frontend demo buttons that use exactly these credentials. Static (seed + authStore + login page).
- S-05 SEC-FIN-001 (Critical) `/finance/callback-verify` settles tuition with no bank/IPP verification; any authenticated tenant user (even a student) self-settles; injected authority echoed. Verified (B1).
- S-06 SEC-DATA-001 (High) Cross-tenant backup exposure: single-SQLite multi-tenant DB; backup list/download/backup-now guarded by role only; hardcoded DB path in dbMaintenance. Role guard verified (F1); scope defect via code.
- S-07 SEC-CORS-001 (Medium/High) `cors({origin:true,credentials:true})` reflects arbitrary origins; credentialed-cookie auth alternative on the backend. Verified (E1).
- S-08 SEC-UPLOAD-001 (Medium) Upload=30×50MB per admin/manager; disk-exhaustion DoS; multer 1.4.5-lts advisories (DoSing memory leaks). Partially covered by uploads tests; depth findings static.
- S-09 SEC-DEP-001 (Medium/High) multer(HIGH×11), sharp(HIGH×3), minimatch, uuid advisory matches; no lockfile; npm install in CI; zero reproducible builds. OSV evidence.
- S-10 SEC-CFG-001 (Low/Medium) Committed dev-only JWT secrets in dev-server.js; JWT 1h/refresh 7d; @google/genai absent (Gemini path can never run — changes the AI threat model to deterministic pipeline). Static.
- S-11 SEC-DIR-001 (Low) `/messages/directory` + 8 related call sites 500 when users lack usernames (undefined export drift). Verified (D1).
- F-01 FW-AUTH-001 (High functional) Parent-login frontend/backend field-name contract break → all parent logins blocked (frontend sends `student_identifier`/`parent_phone`; backend expects `student_code`/`phone`). Verified (A2 second half).
- F-02 FW-AI-002 (Medium) commit silently skips non-matching students (`if (!matchedStudent) continue;`) and silently creates a category on title mismatch → silent data loss / fragmented gradebooks.
- F-03 FW-DIR-002 (Low-functional) Directory crash is user-triggerable (any user w/o username) — availability.

All other prior-phase findings (A1–A4, F11 core, Arch-/Iran-EdTech- checks) are treated as closed per the merged security branch history; this ledger does NOT re-report them.

## Methodology/limitations
- Files read directly + full `node --test` suite + bespoke dynamic harness; no production data touched; scratch only under `backend/.tmp/`.
- `npm audit` unusable: no committed lockfile (ENOLOCK) — used OSV.dev batch queries instead; advisory list is as of 2026-11-11.
- Network was available, but only for documentation registrars; SIM was not exercised (SMS/Gateway paths are stubbed without env keys).
- No changes were made to application code, config, or lockfiles.
