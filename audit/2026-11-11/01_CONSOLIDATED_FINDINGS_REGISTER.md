# Consolidated Security Finding Register — EduConnect @ 838b5b2 (re-verified 2026-11-11)

Each row: ID · severity/CVSS (prior audit, unadjusted) · area · re-verified location ·
this reconciliation's status · reproducing test(s) · notes.

Status legend: **PRESENT** = still live, evidence re-verified (dynamically where feasible);
**PRESENT-PARTIAL** = core issue open, some mitigations landed since; **PRESENT-STATIC**
= confirmed by code/advisory review only; **LATENT** = precondition absent in this tree
(package/engine not installed) but the code path is as described; **CONFIRM-BY-GARBAGE-NONE** —
not applicable. All line refs below were re-read against HEAD and match the prior
suite within the cosmetic drifts logged in `00_SESSION_LEDGER.md`.

## Critical

| ID | Severity | Location (re-verified) | Status | Reproduced by |
|---|---|---|---|---|
| **SEC-AI-001** | Critical (8.8) | `backend/src/modules/ai/paperToDigital.service.js:195–225` (roster fabrication), `:265–289` (gradesheet), `:335–357` (exam), `:392–456` (`postProcessExtractedItems`, `needs_review` only cosmetic), `:461–598` (`commitExtractedData`; roster pass-through 471–483; gradesheet 485–567 with `assertOwnsClass` at 491 and silent `continue` on no-match at 534; category auto-create 493–511); route `backend/src/modules/ai/ai.routes.js:45–56` (commits `req.body` verbatim, `authorize('admin','manager','teacher')` only). Roster side (not in prior line list, re-read this session): `sida.service.js:164–168` gates on `school_id` only; existing students' identity fields overwritten at `:226–233`. | **PRESENT** | Dynamic C1/C2/C3 (harness, 10/10 run); locked-in as green at `tests/security/extended-findings.test.js:555` (R1) |
| **SEC-FIN-001** | Critical (9.2) | `backend/src/modules/finance/finance.routes.js:410–527` — handler trusts `status='OK'` default (`:413`, check `:420`), counselor-only role exclusion (`:415–418`), tenant checks (`:437–443`), 409 double-settle (`:445–450`), pure DB-settle writes (`:456–462`, `:467–471`), SMS receipt (`:473–485`), `authority` echoed unverified into receipt (`:498`, `:511`), docstring claims bank verification (`:406–408`). | **PRESENT** | Dynamic B1 (student self-settled installment-a-1 `6,000,000`, balance → 19,000,000, injected authority echoed); locked-in as green at `extended-findings.test.js:635` (R2) |

## High

| ID | Severity | Location (re-verified) | Status | Reproduced by |
|---|---|---|---|---|
| **SEC-AUTH-002** | High (8.5) | `backend/src/database/seeds/001_school_data.js:4` (`bcrypt.hash('123456',10)` shared by staff 33–146, students 167–249 with sequential codes `STD-40301…40304`, parents…); `frontend/src/stores/authStore.js:27–71` (`DEMO_ACCOUNTS`, six roles, all `password:'123456'`); one-click demo buttons calling `demoLogin` (`authStore.js:205–223` posts `password: account.password` `:210`); `frontend/src/app/login/page.js:~430–507` demo role cards + `handleSelectDemoRole` `:493–507`; seeds re-run by `dev-server.js:10–23`. Prior-phase commits removed the *login-side* universal password but not the seed/demo loop. | **PRESENT-STATIC** (code-char-verified; never exercised against a seeded DB by any shipped test — fixture isolation; unchanged from prior audit's own caveat) | none shipped; login-side not re-run |
| **SEC-DATA-001** | High (8.4) | `backend/src/app.js:239–246` (list, role-only guard `:241`), `:248–266` (`backup-now`, guard `:249`), `:268–279` (`download-backup/:filename`, guard `:269`, only `path.basename` filter `:272`); `backend/src/services/dbMaintenance.js:14–16` hardcoded `DB_PATH`/`BACKUP_DIR` (env-blind), `:51–84` whole-file copy; single-file multi-tenant SQLite ⇒ any `school_admin` downloads *every* school's PII. | **PRESENT-PARTIAL** (role rejection of teachers is tested; cross-tenant scope still absent everywhere) | Dynamic F1 (admin@school-a lists backups → 200); negative half tested status-only at `extended-findings.test.js:77–88` (R4) |
| **SEC-AUTH-001** | High (7.7) | `backend/src/modules/auth/auth.controller.js:107–121` (`parentLogin`, raw destructure `:109`, no Joi); `auth.service.js:465–575` (cross-tenant student lookup `:477–483`, auto-creates **verified** parent 529–560 with `is_verified:true` `:547/558`; returns student identity `:565–573`); **not** rate-limited: `app.js:149–152` covers login/quick-entry/register(-school) only. Sequential seed codes (`001_school_data.js:177–233`) make enumeration practical. Partially mitigated by the merged phases: partial codes rejected (`:476–483` + test `[A3]`), existing parent identity never rewritten (`:511–528`). Core issue (anonymous custody-free verified account + PII oracle, unthrottled) fully intact. | **PRESENT-PARTIAL** | Dynamic A1–A3; green-locked oracle tests `auth.test.js:319,333,346–367` (R3) and `smoke/auth.test.js:84–91` |
| **SEC-AI-002** | High (7.4) | `paperToDigital.service.js:101–186` `callGeminiVisionExtractor` — `raw_ocr_text`/image inlined verbatim into the prompt (indirect prompt injection), result trusted past bare `JSON.parse` (`:184`) with no post-parse schema enforcement; engine dormant because `@google/genai` is absent (`require` guard `:24–30`) → deterministic fallback with hard-coded confidences (`:204–286`) that never computes `needs_review` honestly. | **LATENT** (engine not installed in this tree; code path exactly as described if the package is installed or GEMINI_API_KEY appears) | static only; no shipped test |
| **SEC-DEP-001** | High/Med-High (7.1) | installed tree (203 pkgs, `backend/.tmp/verify/pkglist.json`): `multer@1.4.5-lts.2` (11 HIGH DoS advisories), `sharp@0.33.5` (3 HIGH native-lib), `minimatch@10.2.6` (moderate), `uuid@10.0.0` (moderate) per preserved `osv-report.json` (OSV batch 2026-11-11; advisories not re-fetched to avoid drift). Commits/workflows: no committed npm lockfile (`bun.lock` only; `npm audit` → ENOLOCK); CI installs without lock or audit — `.github/workflows/backend-tests.yml:44` `npm install --no-audit --no-fund`. Manifest drift backend vs root workspace majors. | **PRESENT-STATIC** | preserved OSV snapshot only |

## Medium / Low / Informational

| ID | Severity | Location (re-verified) | Status | Reproduced by |
|---|---|---|---|---|
| **SEC-CORS-001** | Med-High (6.8) | `backend/src/app.js:92–98` `cors({origin:true, credentials:true})` reflects *any* origin; `backend/src/middleware/auth.js:11–29` accepts token from cookie `accessToken=` fallback → credentialed cross-origin reads/mutations without CSRF defense. | **PRESENT** | Dynamic E1 (ACAO reflects evil origin + `allow-credentials`) |
| **SEC-UPLOAD-001** | Medium (6.4) | `backend/src/middleware/upload.js:110–112` (multer `limits`: 30 files × 50 MB/request; `config.upload.maxFileSize` default); consumes the multer-1.x DoS class + sharp native parsers (`upload.routes.js:40–45` sharp lazy-load with SSSE3 guard `:6–26`). | **PRESENT-STATIC** | no quota-stress test; MIME/role tests only (`uploads.test.js`) |
| **SEC-DIR-001** | Medium-avail (6.0) | `backend/src/modules/messages/message.service.js:4` imports `ensureUserHasUsername` which **does not exist** in exports — `backend/src/utils/usernameHelper.js:83–85` exports only `generateBaseUsername`, `generateUniqueUsername`. Eight call sites at `message.service.js:89,115,160,208,225,453,476,670` ⇒ directory/group/search 500 whenever any participant lacks `username`. | **PRESENT** | Dynamic D1 (500 `ensureUserHasUsername is not a function`); triggerable by SEC-AI-001 roster commits |
| **SEC-CFG-001** | Low-Med (5.4) | `dev-server.js:6–7` commits default JWT signing secrets; `app.js:16–19` refuses boot only when `NODE_ENV` unset — no equivalent secret-maturity check; `.env` untracked (`dev-server.js:5` sets `NODE_ENV=development` silently). | **PRESENT-STATIC** | — |
| **SEC-CFG-002** | Low (4.7) | `app.js:227–237` (`download-apk` serves any `EduConnect.apk` found in repo; no signature/pin); download-backup leakage folded into SEC-DATA-001 `:268–279`. | **PRESENT-STATIC** | — |
| **FW-AUTH-001** | High (functional blocker) | contract mismatch: backend reads `student_code` (`auth.controller.js:109`) vs frontend sends `student_identifier` (+ `parent_phone`) (`authStore.js:184–192`) ⇒ 400 for every real browser parent login (`لطفاً کد دانش‌آموزی فرزند خود را وارد کنید`, `auth.service.js:467`). | **PRESENT** | Dynamic A2 second half |
| **FW-AI-002** | Medium | silent student skips `paperToDigital.service.js:534` (`continue`, no counter/warning); silent duplicate category insert on one-char title mismatch `:493–511` (`weight:1.0, max_score:20, term:'term1'`). | **PRESENT** | observed live during C2 (category title drift); static otherwise |
| **FW-AI-003** | Medium | normalization-before-parse at `:188`, `:294` (`normalizePersianDigits(...).replace(/[/٫]/g,'.')`), folding digits/separators pre-scoring, no `rawPreserving` override; disclosed nowhere. | **PRESENT-STATIC** | — |
| **FW-DIR-002** | Low-avail | technical twin of SEC-DIR-001 (frontend directory page + group/search call paths, same undefined symbol). | **PRESENT** | D1 |
| **FW-TEST-001** | Medium | prior suite's premise (expectFailure ratchets) was measured from the merged security branches' *intention*; the shipped tree instead uses plain green tests asserting the vulnerable flows — see R8 for the correction. The underlying risk (fixes will flip tests red, not turn wrappers green) remains valid. | **UPDATED-CLAIM** | — |
| **FW-API-004** | Low | `parentLogin` accepts arbitrary extra body fields (`auth.controller.js:109`), no schema; extra keys ignored today. | **PRESENT** | A2 |
| **FW-UPLOAD-002** | Low | retained from the earlier phase as a runbook note — stale-name re-upload/rename metadata + dead decode branch in `upload.routes.js`; **not re-read bitwise this session** (flagged in ledger). | **UNCHANGED-UNREVERIFIED** | prior phase claim |
| **FW-DB-005** | Informational | `parseDeterministically` header skip depends on literal regex `:229`/`:293`; missing header ⇒ header row counted as data; `total_extracted` vs `committed_count` divergence unexposable. | **PRESENT-STATIC** | — |

## Architecture & technical debt (register-level, design context — not regressions)

AR-01 single-file multi-tenant SQLite (`config/database.js`, migrations, `docker-compose.yml`);
AR-02 AI pipeline double trust-boundary crossing (commit accepts anything from client);
AR-03 "dual engine" is effectively one deterministic one (`@google/genai` missing);
AR-04 scattered per-route/ad-hoc authorization; only the `lint-unscoped-query` ratchet CI exists;
AR-05 backup/maintenance env-blindness; AR-06 no committed lockfile, workspace manifest drift;
AR-07 secret hygiene split across committed constants vs env; AR-08 error-handler/normalizer robustness;
AR-09 tokens in `localStorage` (`authStore.js:194–195`, `api.js` interceptor); AR-10 socket per-room
auth gaps; AR-11 unsigned APK updater path (`app.js:227–237`, `AutoUpdateChecker.js`);
AR-12 no metrics/health signals. — All re-confirmed present-to-degree at HEAD; no AR item was ever
a shipped-test finding, so no drift to reconcile.

*Prior-phase closed findings (A1–A4, F11 core, Arch-P1 checks) remain closed; their regression
tests are green and nothing in this tree reopens them.*
