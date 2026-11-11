# Audit Coverage Matrix — EduConnect @ 838b5b2

Legend: **DEEP** = line-read + behaviour analysed + (where possible) dynamic verification;
**SHALLOW** = pattern-checked/spot-read only; **STATIC** = code-reading; **DYN** = dynamic harness;
**CONFIG** = deployment/CI/config reading; **TEST** = shipped test-suite composition observed.

Legend for verification status used in reports: ✅ = confirmed by re-run (dynamic) · ⚠️ = confirmed by code/const
reading · — = not assessed.

---

## A. Backend source files

| File | Lines | Depth | Notes / findings anchored |
|---|---|---|---|
| `src/app.js` | 529 | DEEP + DYN | CORS SEC-CORS-001 (-); backup/app endpoints SEC-DATA-001 (−); APK AR-11; upload static; rate limit config (B.2) |
| `src/config/index.js` | — | DEEP | JWT/session config; CSRF absent; uploads DIR env (A.2) |
| `src/config/database.js` + `knexfile.js` | — | DEEP | SQLite env-driven paths (TEST_DB_FILE); no creds in tree |
| `src/config/index.js` | — | DEEP | sign/verify present; refresh rotation; revoked tokens |
| `src/middleware/auth.js` | 353 | DEEP | cookie token fallback (SEC-CORS-001); assertOwnsClass/assertSameSchool (AR-04); authorize roles |
| `src/middleware/upload.js` | 116 | DEEP | ext whitelist/blacklist; seeded to SEC-UPLOAD-001 |
| `src/middleware/errorHandler.js` | 81 | SHALLOW | error envelope; SETG error source phrasing |
| `src/middleware/persianNormalizer.js` | 25 | DEEP | normalization folds in FW-AI-003 |
| `src/modules/auth/*` (service 800+, controller 139, validators, routes) | — | DEEP + DYN | SEC-AUTH-001 (A1–A3), FW-AUTH-001, SEC-AUTH-002 link (seed) |
| `src/modules/ai/ai.service.js` | 312 | DEEP | generateContent local engine; config-driven |
| `src/modules/ai/paperToDigital.service.js` | 601 | DEEP + DYN | **SEC-AI-001/2, FW-AI-002/3** (C1–C3) |
| `src/modules/ai/ai.routes.js` | 58 | DEEP | routes + commit endpoint authorization |
| `src/modules/messages/message.service.js` | 1030 | DEEP + DYN | **SEC-DIR-001** (D1); socket call sites; search |
| `src/modules/messages/message.routes.js` | — | DEEP | mount `authenticate`, directory etc. |
| `src/modules/classes/*` (service/routes) | — | SHALLOW–DEEP | class join/ownership checks affirmed (AR-04) |
| `src/modules/finance/finance.routes.js` | 530 | DEEP + DYN | **SEC-FIN-001** (B1); tenant checks partially |
| `src/modules/gradebook/gradebook.routes.js` | — | DEEP | native scores properly scoped (assertOwnsClass+TeacherOfStudent) — contrast to AI path |
| `src/modules/quizzes/*` | — | SHALLOW | preview/submission patterns standard |
| `src/modules/attendance/*` | — | SHALLOW | tenant gating via session class (AR-04 pattern ok) |
| `src/modules/school/sida.service.js` | 448 | DEEP | importRoster data integrity (SEC-AI-001 impact arca) |
| `src/modules/school/school.routes.js` | — | SHALLOW | registration/profile mgmt |
| `src/modules/assignments/*` | — | SHALLOW | due/attach patterns standard |
| `src/modules/studyPlanner/*` | 391 | SHALLOW | planner CRUD per-class |
| `src/modules/videos/video.routes.js` | 773 | SHALLOW | media paths + convert-pptx lock — covered by `[Arch-P0-ConvertPptxLock]` test |
| `src/modules/courses/*` | — | SHALLOW | course CRUD |
| `src/modules/schedules/*` | — | SHALLOW + TEST | `[#40]` cross-tenant covered |
| `src/modules/discipline/*` | — | SHALLOW | issuer/student flows |
| `src/modules/feedback/*` | — | SHALLOW + TEST | `[A27]` covered |
| `src/modules/analytics/*` | — | SHALLOW + TEST | `[A6]` covered |
| `src/modules/announcements/*` | — | SHALLOW + TEST | `A20`/cross-tenant covered |
| `src/modules/notifications/*` | — | SHALLOW | push/in-app |
| `src/modules/tickets/*` | — | SHALLOW + TEST | `[A27]` |
| `src/services/dbMaintenance.js` | 175 | DEEP | SEC-DATA-001, AR-05 (hardcoded path) |
| `src/services/sms.service.js` + `smsGateway.js` | 99 | DEEP | service SMS receipt (finance), no keys → stubbed |
| `src/services/classroomPersistence.js` | 114 | SHALLOW | class snapshot |
| `src/socket.js` | 710 | SHALLOW–DEEP | AR-10 per-room auth absence |
| `src/utils/*` (iranianValidators 238, dbHelpers 69, usernameHelper 86, localCaptcha 110, cache 119, auditLogger 89) | — | DEEP | **SEC-DIR-001** root (usernameHelper export); validators feeds FW-AI-003 |
| `src/database/migrations 001–017` | — | DEEP | schema: composite unique (test `[A28]`), usernames (011), school_id (012), revoked tokens/session (017) |
| `src/database/seeds/001_school_data.js` | — | DEEP | **SEC-AUTH-002** — universal `123456` |
| `src/database/seeds/003_*.js` | — | SHALLOW | sample rosters/more tenants |

## B. Frontend

| File | Depth | Notes |
|---|---|---|
| `src/stores/authStore.js` | DEEP | **SEC-AUTH-002** (DEMO 123456), localStorage tokens (AR-09), parentLogin contract (FW-AUTH-001) |
| `src/lib/api.js` / `socket.js` | DEEP | token storage, credentialed sockets |
| `src/app/login/page.js` | DEEP | demo buttons (SEC-AUTH-002), demoLogin call |
| `src/app/dashboard/*` (class-rosters, management, messages, videos, record, smart-operations, attendance, settings, study-planner, feedback) | SHALLOW | spot-checks; localStorage caching consistent; rosters print uses `escapeXml` (XSS-safety ok) |
| `src/app/layout.js` | SHALLOW | theme via `dangerouslySetInnerHTML` for a script only — acceptable |
| `src/components/**` | SHALLOW | no obviously raw `dangerouslySetInnerHTML` on API strings observed |
| `public/`, `frontend/android/` | CONFIG | gradle folds; no secrets observed in tree |

## C. Deployment & CI (property)

| Artifact | Depth | Notes |
|---|---|---|
| `backend/Dockerfile` (-compose) | CONFIG | Node 20; volumes fine |
| `.github/workflows/backend-tests.yml` | CONFIG | **A.3** no lockfile/audit-step gaps |
| `Deploy-Windows-Server.ps1` | CONFIG | CSPRNG secrets; old pins (B.1) |
| `dev-server.js` | CONFIG | **SEC-CFG-001** |
| `metadata.json`, `.env.example`, `backend/.env.example` | CONFIG | safe defaults; Gemini absence |
| `setup_and_run.bat` | CONFIG | not present at root (README) — noted |

## D. Tests & quality

| Suite | Status | Notes |
|---|---|---|
| `backend/tests/**` | 145/145 | composition + `expectFailure` ratchets (FW-TEST-001) |
| Dynamic harness (this audit) | 10/10 reproduced | `.tmp/verify/findings-dynamic-2026-11-10.cjs` |
| OSV batch over 203 packages | 4 advisories | 05_DEPENDENCY_CONFIG.md A.1 |

## E. Root-cause clusters (how findings map to architecture)

| Root cause | Feeds findings |
|---|---|
| multi-tenant single-SQLite | SEC-DATA-001, AR-01 |
| client-trusted AI packets | SEC-AI-001/2, FW-AI-002/3 |
| scattered per-route guards | SEC-DATA-001 (role-only), callback-verify (SEC-FIN), directory (SEC-DIR-001) |
| seeds/backdoor flows not revisited after security phases | SEC-AUTH-001/2, demo buttons |
| no lockfile + workspace drift | SEC-DEP-001, AR-06 |
| open CORS + cookie fallback | SEC-CORS-001, AR-09 |
| future Gemini engine unvalidated | SEC-AI-002 |

---

*Outstanding items to review in subsequent visits: full frontend dashboard matrix (routing per panel), the
messages page 1-on-1 flows, the appointment/recording features, and the SMS/IVR gateway contract (Starkopay)
with a real gateway key if available.*
