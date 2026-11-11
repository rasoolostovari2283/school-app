# Consolidated Security Finding Register — independent reconciliation @ 838b5b2 (2026-11-11, 2nd pass)

Second, fully independent pass over every prior audit deliverable (`audit/2026-11-10/*` and the
same-day reconciliation suite `01…05` + `SOCK-01`). Statuses below were re-derived from the code
this session — not inherited. Legend: **PRESENT** (issue live; dynamically where feasible),
**PRESENT-PARTIAL** (core open; mitigations landed), **PRESENT-STATIC** (code/advisory review only),
**LATENT** (precondition engine absent; path verbatim as described), **PRESENT-SOCK** (added by
today's Socket.IO session), **UPDATED** (prior claim corrected).

## Critical

| ID | Sev | Re-verified location (read this pass) | Status | Live repro / test |
|---|---|---|---|---|
| **SEC-FIN-001** | 9.2 | `backend/src/modules/finance/finance.routes.js:410–527` — `{status='OK'}` default `:413`, check `:420`; counselor-only exclusion `:415–418`; tenant checks `:437–443`; 409 double-settle `:445–450`; settle writes `:456–462`,`:467–471`; SMS `:473–485`; unverified `authority` echoed into receipt `:498`,`:511`; docstring lies `:406–408` | **PRESENT** | Dynamic B1 (student settled installment-a-1, 6,000,000 R; balance 25M→19M; `FAKE-INJECTED-AUTHORITY` echoed); green-locked `extended-findings.test.js:635` (R2) — re-read this pass |
| **SEC-AI-001** | 8.8 | `paperToDigital.service.js:195–225` roster fabrications; `:265–289` gradesheet fabrications; `:335–357` exam fabrications; `:101–186` Gemini path (verbatim prompt `:122`, bare `JSON.parse` `:184`); commit `:461–598` (roster `:471–483`; gradesheet `:486–567` incl. `assertOwnsClass` `:491`, silent skip `:534`, category aut-create `:493–511`); route `ai.routes.js:45–56` passes `req.body` through with `authorize('admin','manager','teacher')` only | **PRESENT** | Dynamic C1–C3 (fabrications extracted; 18→3.0 overwrite; forged pupils committed); green-locked `extended-findings.test.js:555` (R1) — re-read this pass |
| **SEC-SOCKET-001** | High-E (new) | `backend/src/socket.js:561–564` (`screen_frame`), `:678–681` (`live_video_frame`) — no participant/share/teacher check at all | **PRESENT** (added today) | N-STREAM-06: student relays forged frames to every member |
| **SEC-SOCKET-002** | High-E (new) | `socket.js:662–676` (`webrtc_signal`) — blind global `io.to(targetSocketId)` relay, spoofable `senderData` | **PRESENT** (added today) | N-WEBRTC-08: cross-room forged signal received with spoofed teacher senderData |

## High

| ID | Sev | Re-verified location (read this pass) | Status | Live repro / test |
|---|---|---|---|---|
| **SEC-AUTH-001** | 7.7 | `auth.controller.js:107–121` raw destructure `:109`; `auth.service.js:465–575`: cross-tenant student lookup `:477–483`; **verified** parent auto-create `:529–560` (`is_verified:true` `:547/558`); PII return `:565–573`; no rate limit (mounts `app.js:149–152` exclude `/parent-login`) | **PRESENT-PARTIAL** | Dynamic A1–A3; green-locked oracle `auth.test.js:319–344`, `smoke/auth.test.js:84–91` (R3) — re-read this pass |
| **SEC-AUTH-002** | 8.5 | Seed hash `001_school_data.js:4` (shared `:33–285`; sequential codes `:177/193/209/225` = STD-40301…04 — all seen verbatim); `frontend/src/stores/authStore.js:27–71` (`DEMO_ACCOUNTS`, all `password:'123456'`); `demoLogin` `:205–223`; demo buttons `login/page.js`; seeds re-run every fresh env `dev-server.js:10–23` | **PRESENT — UPGRADED from PRESENT-STATIC to dynamic this pass.** Live fresh-seed login: admin/student/parent authenticate with `123456`; wrong password 401s | New: `.tmp/verify/seeded-login-123456-2026-11-11.cjs` (disposable seeds, live AUTHENTICATED×3 roles); shipped suite still never covers it |
| **SEC-DATA-001** | 8.4 | `app.js:240–246` list (guard `:241`), `:248–266` create (guard `:249`), `:268–279` download (guard `:269`, only `basename` filter `:272`); `dbMaintenance.js:14–16` env-blind constants, whole-file copy `:51–84` | **PRESENT-PARTIAL** | Dynamic F1; role-rejection tested status-only `extended-findings.test.js:77–88` (R4), re-read this pass |
| **SEC-DEP-001** | 7.1 | Installed tree: `multer@1.4.5-lts.2` (11 HIGH), `sharp@0.33.5` (3 HIGH), `minimatch@10.2.6`, `uuid@10.0.0`; manifests `multer ^1.4.5-lts.1`, `sharp ^0.33.5`; no committed npm lockfile (`bun.lock` only); CI **`npm install --no-audit --no-fund`** `backend-tests.yml:42–44` — all re-read this pass | **PRESENT-STATIC** | Preserved OSV snapshot (deliberately not re-fetched; fresh advisories can only raise counts) |
| **SEC-SOCKET-003** | Med-High-E (new) | `socket.js:91–97` `cors` hand­shake accepts/reflects **any origin** with `credentials:true` | **PRESENT** (added today) | N-CORS-15 |
| **SEC-AI-002** | 7.4 LATENT | Gemini block `paperToDigital.service.js:24–30` optional require (absent from `package.json` — grep done this pass), prompt engine selection only when key+pkg present `:66`; blind parse; hard-coded fallback confidences | **LATENT** (static this pass) | no shipped test |

## Medium / Low / Informational

| ID | Sev | Location (re-verified this pass) | Status | Note |
|---|---|---|---|---|
| **SEC-CORS-001** | 6.8 | `app.js:92–98` `cors({origin:true,credentials:true})` reflects any origin; `middleware/auth.js:11–29` cookie-fallback tokens | **PRESENT** | Dynamic E1 |
| **SEC-UPLOAD-001** | 6.4 | `middleware/upload.js:107–114` multer `limits` 50MB/file × 30, consumed as `upload.any()` `upload.routes.js:107`; sharp lazy-load SSSE3 guard `:6–26` | **PRESENT-STATIC** | no quota-stress test shipped |
| **SEC-DIR-001** | 6.0 | `message.service.js:4` imports unexported `ensureUserHasUsername`; exports only `generateBaseUsername/Unique` `usernameHelper.js:82–85`; 8 call sites `:89,115,160,208,225,453,476,670` | **PRESENT** | Dynamic D1 |
| **SEC-SOCKET-004** | Med (new) | `socket.js:105–145` validates `jti`/`token_version` at handshake **only**; events never re-check | **PRESENT** (added today) | N-SESSION-03 |
| **SEC-CFG-001** | 5.4 | Committed default secrets `dev-server.js:6–7` (ROOT-level file — prior docs omitted the working-directory; cosmetic path drift), seeds every fresh env `:10–23` | **PRESENT-STATIC** | path correction logged |
| **SEC-CFG-002** | 4.7 | `app.js:227–237` unauthenticated signed-in-less APK download (no signature/pin check) | **PRESENT-STATIC** | |
| **FW-AUTH-001** | blocker | Frontend posts `student_identifier`+`parent_phone` (`authStore.js:184–192`); server reads `student_code`,`phone` (`auth.controller.js:109`) → 400 universally | **PRESENT** | Dynamic A2; verbatim re-read this pass |
| **FW-AI-002** | Med | Silent skip `paperToDigital.service.js:534` (`continue`, no counter); category auto-create `:493–511` hard-codes `weight:1.0,max_score:20,term:'term1'` | **PRESENT** | observed in C2; code re-read this pass |
| **FW-AI-003** | Med | Normalization-before-parse `:188`,`:294` (`normalizePersianDigits(...).replace(/[/٫]/g,'.')`) | **PRESENT-STATIC** | code re-read this pass |
| **FW-DIR-002** | Low-avail | Frontend twin of SEC-DIR-001 | **PRESENT** | D1 |
| **FW-TEST-001** | Med | **UPDATED last pass → re-verified:** `expectFailure(` has **0 call sites** in tests (grep this pass; only the dead polyfill remains at `env.js:36`); R1/R2/R3 are plain green tests | **UPDATED** | R8 |
| **FW-API-004** | Low | `auth.controller.js:109` accepts arbitrary extra keys | **PRESENT** | A2 |
| **FW-UPLOAD-002** | Low | **was UNCHANGED-UNVERIFIED → NOW VERIFIED-PARTIAL:** dead decode branch `upload.routes.js:127–134` re-read bitwise: `Buffer.from(f.originalname,'latin1').toString('utf8')` then `if (!decoded.includes(''))` — empty-string literal ⇒ branch never true ⇒ `cleanName` never assigned. Half claim (stale-name/rename metadata) not evidenced in current code | **PRESENT** (dead-branch half) / indeterminate (stale-name half) | bitwise re-read this pass |
| **FW-DB-005** | Info | Header-skip regex `:229`,`:293`; missing header ⇒ header row parsed as data; `total_extracted` vs `committed_count` divergence unexposable | **PRESENT-STATIC** | code re-read this pass |

## Architecture & design debt (context register — re-spot-checked, unchanged)

AR-01 single-file multi-tenant SQLite; AR-02 AI dual trust-boundary; AR-03 "dual engine" in practice one (no `@google/genai` in manifest — grep); AR-04 scattered authz + regex-lint ratchet `backend/scripts/lint-unscoped-queries.js` + `tests/ci/lint-unscoped-queries.test.js` (lint header names phantom helper `assertPaymentScope` — zero matches in `backend/src` as of this pass); AR-05 env-blind backup paths; AR-06 no lockfile; AR-07 secret hygiene split; AR-08 error-handler robustness; AR-09 localStorage tokens; AR-10 **superseded by SOCK-01's measured reality** — prior register's generic "socket per-room auth gaps" is now itemized in `SOCK-01`; AR-11 unsigned APK updater; AR-12 no metrics/health. Nothing moved; none is a shipped-test finding.

**Closed prior-phase findings (A1–A4, F11 core, Arch-P1):** all green again this session (suite run) and no tree change reopens them.
