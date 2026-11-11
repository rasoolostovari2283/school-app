# Security Findings (detail) — EduConnect @ 838b5b2

Scoring: CVSS 4.0 vectors where stated; severity bands per OWASP. Every finding: ID · severity · location ·
evidence · reproduction · impact · verification status · remediation.

---

## SEC-AI-001 — Paper-to-digital commits fabricated/empty-extra data without provenance or review
**Severity: Critical (CVSS 4.0 ≈ 8.8)** — `AV:N/AC:L/AT:N/PR:H/UI:N/VC:N/VI:H/VA:N/SC:N/SI:H/SA:N`

### Location
- `backend/src/modules/ai/paperToDigital.service.js`
  - empty-OCR fabrication: lines 195–225 (roster), 265–289 (gradesheet);
  - `postProcessExtractedItems` (392–456) — confidence defaults & `needs_review` flags that are *never enforced*;
  - `commitExtractedData` — lines 461–598 (roster 471–483, gradesheet 485–567, exam 569–593);
- `backend/src/modules/ai/ai.routes.js` 45–56 (`POST /api/v1/ai/paper-to-digital/commit`,
  `authorize('admin','manager','teacher')`).

### Evidence
1. An empty/blank OCR text produces *hard-coded* fabricated rows with 0.94–0.97 default confidence
   (`parseDeterministically` returns literal `امیرحسین رضایی`, `سارا محمدی`, `کیانوش کریمی`, national codes
   `0024567893`, `0012345679`, `1234567890`, phones `09123456789`, …). Line 194–225 & 265–289 ship this data
   regardless of input — a scan of a blank sheet "extracts" three children **that do not exist**.
2. `commitExtractedData` accepts `items` wholly from the client; the route does not compare them to anything stored
   server-side; `needs_review` is computed at extraction but **never filtered at commit** (gradesheet loop 523–559,
   `continue`s only the no-match case).
3. The gradesheet path enforces *class ownership* (`assertOwnsClass`, line 491) but **no per-student teacher
   check** (no `assertTeacherOfStudent`), no audit log (`logAudit` absent), and matches on name or student code
   only (lines 523–532).
4. The roster path has **no class/ownership scope at all**: `sidaService.importRoster(currentUser, …)` only requires
   `currentUser.school_id` (sida.service.js 164–168). It will create classes bound to your school and
   **overwrite any same-school student's** `display_name`, `department`, `settings` (sida.service.js 226–233) —
   or insert completely fabricated pupils, linked parents included (267–299). No audit log.

### Reproduction (dynamic, harness `backend/.tmp/verify/findings-dynamic-2026-11-10.cjs`)
- **C1** `POST /api/v1/ai/paper-to-digital {mode:'gradesheet', raw_ocr_text:' \n '}` → 200 with fabricated high-confidence rows.
- **C2** `commit `{class_id:'class-a', category_id:'gb-category-a', items:[{student_name:'A STUDENT', student_code:'STD-A-1001', score:3.0}, …]}` → 201,
  `gradebook_scores.score-a-1` changed 18 → **3.0**; an item marked `needs_review:true` was still committed.
- **C3** empty roster OCR → commit mode `roster` → 2 new users created; `settings` contains forged national code
  `0024567893`, parent-phone and auto-created parent accounts.

### Impact
- Academic/formal data integrity: arbitrary compliant administrative "teachers" can secretly rewrite grades and
  enrolment records; the school's own audit trail (`audit_logs`) is never written, so the tampering is
  undiscoverable via the audit UI.
- Fabricated pupil records with fabricated national IDs and phone numbers flow into the permanent student registry
  (and downstream SMS).
- In the intended deployment (Gemini path), an attacker with admin/manager/teacher role needs **no** scan at all —
  the extraction step can be skipped and arbitrary items committed directly.

### Verification status
**Confirmed** (dynamic C1–C3 on a disposable two-school SQLite + ephemeral port; no production data).

### Remediation
- Make commit payloads end-to-end signed: extract server-side, persist a short-lived *packet id*, and only accept a
  commit referencing that id (eliminates the "skip extraction" attack).
- Enforce `needs_review` server-side: either reject items flagged for review or require an explicit human
  `reviewed:true` per item in the commit body with a recorded `reviewer_id`.
- In `sidaService.importRoster`: require `assertTeacherOfClass`/explicit authority for the *target class*;
  never overwrite an existing student's identity fields without a history event; add `logAudit` entries.
- Do not fabricate rows when OCR is empty/whitespace — return 422 with `usable_rows:0`.

---

## SEC-FIN-001 — Tuition settlement without bank/IPP verification (financial fraud, self-settlement)
**Severity: Critical (CVSS 4.0 ≈ 9.2)** — `AV:N/AC:L/AT:N/PR:L/UI:N/VC:N/VI:H/VA:H/SC:N/SI:H/SA:N`

### Location
- `backend/src/modules/finance/finance.routes.js` — `POST /api/v1/finance/callback-verify/:id`, lines 410–527.
- `assert` tenant checks present (437–443) but **nothing else** gates settlement.

### Evidence (code)
- The handler trusts `{status}` from the request body (line 413 `status = 'OK'` default, 420), never calls the
  Shaparak/PSP verify API, never validates `authority` against a bank session, never compares amounts, and skips
  any `MerchantID` secret check. `authority` from the body is echoed straight into the receipt (lines 498, 511).
- `bank_name` is written as `شاپرک آنلاین (${maskedPan})` and `paid_at` set to *today* from the local date
  (453–462) — i.e. settlement is a pure database write.
- Only `counselor` is excluded (415–418) — **teacher, admin, manager, financial_officer (the role least pruned),
  student, and parent all pass**.
- No idempotency beyond a 409 on already-verified instalments (445–450); every *other* pending instalment of the
  same ledger can be "settled" one by one, draining the balance to 0.
- The module docstring lies about the route (line 408): "Verifies Shaparak IPG callback".

### Reproduction (dynamic B1)
As fixture student `a-student` (`Fixture#2026!`):
`POST /api/v1/finance/callback-verify/installment-a-1` with `{status:'OK', authority:'FAKE-INJECTED-AUTHORITY', card_pan:'6037997500000000'}`
→ **200**; instalment marked `verified`; `tuition_ledgers`: `paid_amount 0→6,000,000`, `balance 25,000,000→19,000,000`;
token holder role was `student`; replicated the exact authority string FAKE-INJECTED-AUTHORITY in the receipt.

### Impact
- Students settle their own tuition for free; staff of one school can settle other students of the same school;
  grading of receivables ceases to mean anything; the SMS receipt step (473–485) just spreads the lie.
- Financial reporting and school payments (درگاه modific) reconciled per ledger are corrupted at the source.

### Verification status
**Confirmed** (dynamic).

### Remediation
- Implement the bank's **verify API** (server-to-server call with `MerchantID`, `authority`, amount) and only then
  settle; keep the callback endpoint but treat its status as untrusted until verified, and revalidate
  `installment.amount === payment amount`.
- Restrict settlement to `financial_officer`/`manager`/`admin` (require role beyond counselor check) and bind to
  the merchant handoff.
- Add idempotent `authority`-based dedupe, sign/replay-protect the callback (`hash` per bank field set), and
  write an audit log entry (already present) *before* or *transactionally with* the DB settle.

---

## SEC-AUTH-002 — Production seeds reintroduce universal default credentials; demo login ships those credentials
**Severity: High (CVSS 4.0 ≈ 8.5)** — `AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N` (login-rate-limit caveat)

### Location
- `backend/src/database/seeds/001_school_data.js` line 4 (`password_hash = bcrypt.hash('123456',10)`),
  lines 33–146 (all staff), 167–249 (students), 252–285 (parents).
- `frontend/src/stores/authStore.js` lines 27–71 `DEMO_ACCOUNTS` (password `'123456'` for admin/teacher/counselor/
  financial_officer/student/parent); `frontend/src/app/login/page.js` 458–507 (one-click *Try the demo* buttons,
  e.g. `demoLogin('admin')` hitting `/auth/login` with `phone: 09121110001`).

### Evidence
- Seed rows literally hash the literal `123456`; the demo table then authenticates with the *same* phone numbers
  (`09121110001` = principal, `09121110007` = financial officer, `09122220001` = parent) and `123456`.
- `authStore.demoLogin` performs the normal login flow (line 205+), so the only gate is the 30-min global login
  rate limiter (`app.js` 137–152) — nothing per-account, nothing that forces a password change on first sign-in.
- Seeds run in every fresh environment by `dev-server.js: prepareDatabase()` and by the Dockerfile/compose
  documented path; the *fix* applied in the merged security phase (commits `d28383c`, `9541ac9`, `d352f20`) removed
  the **login-side** bypass but never changed the seed hashes, so the reintroduction completes the loop.

### Impact
- Any freshly-seeded deployment (a teacher laptop, a class demo, CI) is immediately reachable as the principal /
  financial officer / parent with `123456`. Databases upgraded/migrated into production retain those accounts.

### Verification status
**Confirmed (code/static)**; login-side not re-exercised against a seeded DB because the harness uses the
fixture password, but the hash literal and client field values were verified character-for-character.

### Remediation
- Stop hashing a constant in seeds; generate per-account random passwords and print/record a one-time secret
  (or force password change on next login).
- Delete the demo buttons from the public login page (or gate them behind an install flag and an immediate
  mandatory-reset modal).
- Add a data migration that nullifies any account whose `password_hash` equals the legacy `123456` bcrypt hash.

---

## SEC-DATA-001 — Multi-tenant database export via backup endpoints (role only; one file for all schools)
**Severity: High (CVSS 4.0 ≈ 8.4)** — `AV:N/AC:L/AT:N/PR:H/UI:N/VC:H/VI:N/VA:N/SC:N/SI:H/SA:N`

### Location
- `backend/src/app.js` 239–279 (`/api/v1/system/backups`, `…/backup-now`, `…/download-backup/:filename`),
  guards: `['admin','manager','school_admin'].includes(req.user.role)` only.
- `backend/src/services/dbMaintenance.js` 14–16 (hardcoded `DB_PATH`/`BACKUP_DIR`),
  51–84 (`createBackup` copies the single SQLite file), 145–166 (scheduled backups).
- Multi-tenancy is a convention on `users.school_id` (migrations 001/012); **one SQLite file is the whole system**.
- `backend/docker-compose.yml` volume-mounts `./educonnect.db` into the container.

### Evidence
- Same guard triple exists on each of list/download/create, but **no `school_id` comparison** anywhere.
- A `school_admin` — a role designed to run *one school* — receives download URLs for files that contain *every*
  school's tables (school, users, parent links, messages, tickets, discipline…, audit).
- `BACKUP_DIR = backend/db_backups` and **`DB_PATH = backend/educonnect.db` are hardcoded**:
  - In staging/test the maintenance job happily checkpoints-and-copies the `educonnect.db` that happens to be
    present there (env-blind), and `backup-now` can be used to snapshot the file regardless of `NODE_ENV`.
  - `listBackups()`/`createBackup()` create `backend/db_backups/` if missing — a write that happens in *every*
    process that touches the admin route.
- The only test for these routes (`extended-findings.test.js:77` `[A23]`) asserts **non-admin rejection**, not
  cross-tenant scoping.

### Reproduction (dynamic F1)
`GET /api/v1/system/backups` with a fixture `admin` of school-a → 200 (role-only guard passes). Download was not
invoked to avoid creating artifacts, but `download-backup` uses the identical guard (line 269).

### Impact
- Whole-tenant PII & message history exfiltration by any school-admin; backups stored on the server (and synced by
  whatever picks up `db_backups/`) spread that blast radius further.
- Env-blind copy path can leak a *production* db into a staging bucket/container.

### Verification status
**Confirmed via code inspection + role-gate reproduction.**

### Remediation
- Back up per-school (separate dB files or a `school_id`-scoped dump writer); give `school_admin` downloads only
  for its own school's artifact; move admin-only for `manager`/`admin` global backup ops.
- Resolve `DB_PATH`/`BACKUP_DIR` from config (they currently ignore the `TEST_DB_FILE`/`UPLOAD_DIR` env already
  respected by `config/database.js`).
- Keep backups out of the authenticated-static download tree and add a whitelist of characters for `:filename`.

---

## SEC-AUTH-001 — Parent login creates verified accounts + discloses student identity, no verification, no rate limit
**Severity: High (CVSS 4.0 ≈ 7.7)** — `AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:L/VA:N/SC:N/SI:L/SA:N` (student-code oracle)

### Location
- `backend/src/modules/auth/auth.controller.js` 104–121 (`parentLogin`, no Joi validation, passthrough of
  `student_code`, `parent_name`, `phone`).
- `backend/src/modules/auth/auth.service.js` 465–575 (`parentLoginByStudentCode`);
- `backend/src/app.js` 137–152 — `/auth/parent-login` is **not** in the auth limiter; never rate-limited.

### Evidence
- Unauthenticated `POST /auth/parent-login {student_code}`:
  - returns 200 with the student's **real `display_name`, `student_code`, `department`** for *any* school (the
    query has no `school_id` scope) — a cross-tenant identity oracle;
  - **creates and verifies a parent account** instantly if none exists for that code, with a random password the
    caller never sees, `is_verified: true`, matching `student_code`, and a guaranteed `parent_student_links`
    row (is_verified:true);
  - duplicates/leaks: repeated calls with the same code return *the same* parent account; any name/phone the
    caller supplies becomes that account's display name and phone number (attacker-defined identity).
- Codes in the seed are **sequential** (`STD-40301` … `STD-40304`, `001_school_data.js` 177–242) — trivially
  enumerable, no rate limit, so the oracle is practical.
- No verification of custody: no SMS/OTP to the real parent phone, no nonce from the school, no role elevation gate.
- Only counselor-exclusion exists. Because creation flow is silent, this also violates intent: legitimate parents
  already have accounts (seed creates them), so this path mostly *surrenders* them.

### Reproduction (dynamic A1–A3)
- A1: unauth `{student_code:'STD-A-1002'}` → 200; parents 2→3 in DB; created parent `is_verified=1`;
  body contains `student.display_name = "A student2"`.
- A2: wrong `STD-99999` → 401 with "not found" (oracle); frontend-shaped body → 400 (see FW-AUTH-001).
- A3: three codes across both schools all return student names.

### Impact
- Identity theft into a school system: attacker becomes a verified "parent" of arbitrary students, sees the
  student's name/class, and can read that student's chats/grades annook if the API honour the parent role.
- Aids social engineering (real student name + school visible to anyone).
- DoS-adjacent: mass-creates verified parent accounts (unbounded row growth).

### Verification status
**Confirmed (dynamic A1–A3).**

### Remediation
- Require custody proof: short-lived OTP (localCaptcha/SMS) to the student's known phone, sent via a mediated
  channel the school controls; only then mint the parent account (and never mark it `is_verified` until custody
  proof).
- Add `/auth/parent-login` to the auth limiter; respond the same text for unknown *and* known-but-mismatched.
- Remove the cross-tenant query (scope student by caller context) and never return student PII to an unauthenticated caller.
- Enforce a server-side `parent_name`/`phone` validation and sanitize the display name derived from them.

---

## SEC-CORS-001 — Reflected-any-origin CORS with credentials (CSRF-read / login-swipe via cookie)
**Severity: Medium-High (CVSS 4.0 ≈ 6.8)** — `AV:N/AC:L/AT:N/PR:L/UI:R/VC:L/VI:L/VA:N/SC:N/SI:N/SA:N`

### Location
- `backend/src/app.js` 92–98: `cors({ origin: true, credentials: true, … })`.
- `backend/src/middleware/auth.js` 11–29: token accepted from `Authorization: Bearer` **or** cookie `accessToken=…`.

### Evidence
- `origin: true` mirrors any `Origin` header; `credentials: true` allows the browser to attach the attacker
  site's... no — the *root's credentials* including the `accessToken` cookie. Reproduction below confirmed
  `Access-Control-Allow-Origin: https://evil.example.com` on plain `/api/health` and on the auth preflight, with
  `Access-Control-Allow-Credentials: true`.
- A crafted page on any domain can therefore drive authenticated mutations using the victim's API session (loan
  settlement! grade writes! message send/privacy loss), and *read* responses when the token rides the cookie.
- The danger scales with any XSS primitive (see SEC-DIR-001-style availability, localStorage tokens) — but even
  without XSS, credentialed mutations are possible because the API accepts the cookie fallback and has no CSRF
  token checks.

### Reproduction (dynamic E1)
`GET /api/health` + `Origin: https://evil.example.com` → `ACAO: https://evil.example.com`; preflight `OPTIONS
/api/v1/auth/login` from the same origin → ACAO reflected, `allow-credentials: true`.

### Impact
- Cross-origin state-changing actions on behalf of victims (settlement, roster/commit, backup download,
  password change) plus cross-origin reads wherever the cookie carries the token.

### Verification status
**Confirmed (dynamic E1).**

### Remediation
- `origin` should be the explicit frontend allowlist (`FRONTEND_URL`); remove `credentials: true` or bind the
  cookie to `SameSite=Strict` (cookie `httpOnly`, never `SameSite=None`), and add an anti-CSRF double-submit token
  for cookie-riding sessions.

---

## SEC-AI-002 — Blind JSON.parse on Gemini output + indirect prompt injection on scanned content
**Severity: High (CVSS 4.0 ≈ 7.4)** — `AV:N/AC:L/AT:N/PR:H/UI:N/VC:N/VI:H/VA:N/SC:N/SI:H/SA:N`

### Location
- `backend/src/modules/ai/paperToDigital.service.js` 101–186 (`callGeminiVisionExtractor`): places
  `raw_ocr_text` and image base64 into the prompt verbatim.
- Same file ~168+: Gemini result is trusted past a plain `JSON.parse` — no schema enforcement, no bounds on rows,
  no confidence gating beyond `>=0`; `postProcessExtractedItems` sanitizes only presentation.

### Evidence
- The OCR text / image is **attacker-controlled content inside the prompt** (indirect prompt injection). A scanned
  paper can contain instructions (in Persian) that steer extraction; the output JSON is not schema-validated.
- `@google/genai` is **not installed** in this tree (not in backend nor root node_modules) — so the engine value
  `gemini-3.8-flash` never runs here and the deterministic path (#1 in default mode) is what executes; if an
  operator later installs `@google/genai`, all of the above becomes live with the same parser.
- Confidence values in the deterministic mode are hard-coded (0.93/0.79) — not computed — so `needs_review` is
  theatre (see SEC-AI-001).

### Impact
- Prompt-injection → altered grades/rosters with the *appearance* of an authoritative engine; data (PII + national
  codes) is uploaded to a third-party LLM endpoint with no contract/processing agreement or user consent visible
  (`engine_used` switch is automatic).

### Verification status
**Static/code inspection** (engine not installed, so no live Gemini repro).

### Remediation
- Add a strict JSON Schema validator for LLM results; cap row count; quarantine suspicious rows.
- Put OCR text through a fixed template with per-field length/validation and never let the engine alter the
  *schema*; record an outsourcing/processing notice; make the engine selection explicit per organization.
- Deactivate the cloud path in deployments without the package; log engine failures loudly.

---

## SEC-UPLOAD-001 — Upload budget: 30 files × 50 MB per privileged user; multer DoS advisories on the same path
**Severity: Medium (CVSS 4.0 ≈ 6.4)** — `AV:N/AC:L/AT:N/PR:L/UI:N/VC:N/VI:L/VA:H/SC:N/SI:N/SA:N`

### Location
- `backend/src/modules/upload/upload.routes.js` (multer limits: 30 files × 50MB per request) — from the earlier
  phase's review; `backend/.env.example` `MAX_FILE_SIZE=52428800` (50 MB).
- `backend/src/config/index.js` upload budget; `backend/src/middleware/upload.js` extension whitelist/blacklist.

### Evidence
- Per-role quota (`admin`/`manager`) allows up to 30 files at the cap in **one request** and, combined with the
  class of multer 1.4.5-lts advisories below, lets a small number of authenticated upload requests exhaust worker
  memory or disk (DoS), compounded by each upload passing through a single-node SQLite writes.
- `sharp@0.33.5` and `multer@1.4.5-lts.2` share this surface; DoS-from-malformed-image via sharp is plausible
  (see SEC-DEP-001 for the advisory list).
- The current test suite (`uploads.test.js`) covers role rejection + MIME checks but does **not** measure disk/memory
  budget at quota edges.

### Verification status
**Static + existing tests; dynamic quota loop not run** (would create 1.5 GB of scratch uploads on the host).

### Remediation
- Cut per-request file count and per-file size for storage-hungry formats, add a global disk-usage guard,
  stream-multipart with backpressure (multer 2.x / busboy), and move heavy re-sizing through sharp with timeouts.

---

## SEC-DEP-001 — Dependency exposure: 4 packages match OSV advisories; no committed lockfile; drifting manifests
**Severity: Medium-High (CVSS 4.0 ≈ 7.1 (max across advisories))**

### Evidence (dynamic, OSV.dev batch on the installed tree, 2026-11-11)
203 unique npm packages inventoried from `backend/node_modules`, `node_modules`, `frontend/node_modules`
(`backend/.tmp/verify/pkglist.json`). Batch `api.osv.dev/v1/query` returned matches:

| Package | Installed | Advisory severity | Notes |
|---|---|---|---|
| `multer` | 1.4.5-lts.2 | **HIGH (11 advisories)** | DoS via unclosed streams / memory leak / gigantic array-index in field names |
| `sharp` | 0.33.5 | **HIGH (3)** | libvips `CVE-2026-33327/33328/35590`, libheif `GHSA-g89c-p67h-r497`, librsvg `CVE-2026-96889` |
| `minimatch` | 10.2.6 | moderate | glob amplification DoS |
| `uuid` | 10.0.0 | moderate | bounds check on provided `buf` (v3/v5/v6) |

### Additional facts
- **No committed lockfile** (`bun.lock` at root only, npm cannot `npm audit` — ENOLOCK). CI (`.github/workflows/backend-tests.yml`)
  runs `npm install --no-audit --no-fund` on only stated ranges.
- `backend/package.json` pins older majors (`express ^4.21, multer ^1.4.5-lts, helmet ^7.1, joi ^17.13, ...`)
  while root workspaces use newer (`^5.3, ^2.5.0, ^8.3.0, ^18.3.2`) — a skew between workspaces and the only
  lockfile.
- `@google/genai` not installed anywhere (see SEC-AI-002).

### Impact
- Remote DoS on upload and media pipelines; supply-chain drift between the intended versions and what runs.

### Verification status
**Confirmed (OSV batch).**

### Remediation
- Adopt a committed lockfile (or `bun.lock` per workspace) and move CI to `npm ci`; run `npm audit`/`osv-scanner`
  in CI; upgrade to `multer@2.x` and the latest `sharp` patch line at minimum.

---

## SEC-CFG-001 — Committed development JWT signing secrets; env-blind runtime constants
**Severity: Low-Medium (CVSS 4.0 ≈ 5.4)**

### Location
- `dev-server.js` 7–8:
  ```
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'educonnect-iran-enterprise-jwt-secret-key-2026-secure';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'educonnect-iran-enterprise-jwt-refresh-key-2026-secure';
  ```
- `backend/src/app.js` (startup check) requires `NODE_ENV` — good — but there is no equivalent secret-maturity
  check at production boot; config reads `config/index.js` (see `.env.example` comment), and the `.env` file is
  git-ignored — yet the **defaults are in the repo**, so a process that forgets its env silently signs JWTs with
  the world-known key.
- `dbMaintenance.js` `DB_PATH` constant (see SEC-DATA-001).

### Impact
- Forged sessions in any environment where the env values aren't injected.

### Verification status
**Static.**

### Remediation
- Compile-time guard: refuse to boot with hard defaults; generate per-deploy secrets; never commit constants near
  "secret" names.

---

## SEC-DIR-001 — `/messages/directory` and sibling flows 500 when users lack a `username` (undefined export)
**Severity: Medium (availability, CVSS 4.0 ≈ 6.0)** — `AV:N/AC:L/AT:N/PR:L/UI:N/VC:N/VI:N/VA:L/SC:N/SI:L/SA:N`

### Location
- `backend/src/modules/messages/message.service.js` line 4:
  `const { ensureUserHasUsername } = require('../../utils/usernameHelper');`
- `backend/src/utils/usernameHelper.js` 83–85 exports only `generateBaseUsername`, `generateUniqueUsername`
  (no `ensureUserHasUsername`).
- Call sites: 87–91, 113–117, 160, 208, 225, 453, 476, 670, … — group messages, broadcast, directory, search.

### Evidence (dynamic D1)
In the harness, cleared `username` on all fixture users, then `GET /api/v1/messages/directory` as teacher →
**500** `ensureUserHasUsername is not a function`. The same symbol would abort group-send and search flows.

### Impact
- Any data condition that creates a user without `username` (e.g. the SEC-AI-001 roster path, un-migrated legacy
  rows, external Sida import) bricks the directory and chat surfaces for whole schools.

### Verification status
**Confirmed (dynamic D1).**

### Remediation
- Add `ensureUserHasUsername` to `usernameHelper` (wrap `generateUniqueUsername`), or replace the call sites with
  a lazy generator with a uniquely-named export; add a regression test that builds a username-less user and calls
  `/directory`.

---

## SEC-CFG-002 — Backup/download + APK endpoints ship artifacts unbounded (auxiliary hardening)
**Severity: Low (CVSS 4.0 ≈ 4.7)**

### Location
- `backend/src/app.js` 227–237 (`download-apk`: serves whatever `EduConnect.apk` sits in the repo)
- 268–278 `download-backup/:filename` — `path.basename` guard exists, still role-only (folded into SEC-DATA-001).

### Evidence
- An APK build uploaded to the repo (CI artifact merge) would be served to anyone with `admin/manager/
  school_admin` (no integrity/signature check). The APK is the *installer of the mobile app* — tampering here
  (self-update flow) is a supply-chain vector for the client.

### Verification status
**Static.**

### Remediation
- Add signature/version pinning, checksum verification, and a short allow-list of filenames; keep the update
  endpoint behind `manager`/`admin`.

---

*Findings S-01…S-11 as register in `00_AUDIT_LEDGER.md`; functional defects in `03_FUNCTIONAL_BUGS.md`.*