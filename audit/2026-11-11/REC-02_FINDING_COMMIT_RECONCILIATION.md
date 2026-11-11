# Finding-to-Commit Reconciliation — second independent pass @ 838b5b2 (2026-11-11)

## Commit-level reconciliation (re-derived this session)

| Item | Value |
|---|---|
| Repo | `/Volumes/Samsung T7 1TB/Educonnect/Clone GitHub EduConnect/school-app` |
| Branch / HEAD | `main` @ `838b5b20f257ca7b5d10efe3a1530c2aa84bdf6e` (unchanged; identical to the prior suite's target) |
| Commits between prior audit target → HEAD | **0** |
| Working-tree delta vs target | only untracked `audit/` documentation + git-ignored `backend/.tmp/verify/` harness files (verified: `git status` clean w.r.t. tracked files, 295 tracked files) |
| Audit branches | `security/audit-2026-11-09` (tip `cb9c553` = HEAD~): no in-tree audit reports; a committed CID-font PDF (`cb9c553`) stays unextractable and is referenced by no finding |

**Consequence:** per-find\ring status can only change via (a) deeper inspection depth, (b) corrections of prior misreads — never via code movement. This pass produced exactly such changes (rows fl\ragged ▼ below).

## Finding-level reconciliation (second pass, independent eye)

| Finding | Prior suite's current-line claim | This pass — re-verified lines | Ref-match | Status @ HEAD | Δ vs prior suite |
|---|---|---|---|---|---|
| SEC-FIN-001 | `finance.routes.js:410–527` (substeps) | identical, all substeps re-read (`:413,415–418,437–443,445–450,456–471,473–485,506,511`; docstring `:406–408`) | ✅ | PRESENT (dynamic B1) | none |
| SEC-AI-001 | `paperToDigital…:195–225, 265–289, 392–456, 461–598`; `ai.routes.js:45–56`; `sida.service.js:164–168,226–233` | identical; every block re-read (`:101–186, 195–225, 264–332, 334–369, 460–598`) | ✅ (provenance of "194–225" is ±1) | PRESENT (dynamic C1–C3) | none |
| SEC-AUTH-001 | `auth.controller.js:104–121`; `auth.service.js:465–575`; `app.js:137–152` | identical; re-read (`:109`; `:465–575` with create `:529–560`, guard `:476–483`, non-rewrite `:511–528`, PII `:565–573`; authLimiter mounts `:149–152`) | ✅ | PRESENT-PARTIAL (dynamic A1–A3) | none |
| **SEC-AUTH-002** | static-only label | seed `:4`, codes `:177/193/209/225`, authStore `:27–71,:184–192,:205–223`, login buttons, `dev-server.js:10–23` (root-level file) | ✅ | **PRESENT — dynamic this pass** (fresh-seed live login ×3 roles) | ▼ status upgraded: was PRESENT-STATIC by choice; new harness removes the caveat. Shipped suite still doesn't exercise it (R10) |
| SEC-DATA-001 | `app.js:239–279`; `dbMaintenance.js:14–16,51–84` | identical; re-read (`:240–246,:241; :248–266,:249; :268–279,:269,:272`; constants `:14–16`, copy `:51–84`) | ✅ | PRESENT-PARTIAL (dynamic F1) | none |
| SEC-DEP-001 | manifest/CI claims; preserved OSV snapshot | identical; re-read (`multer ^1.4.5-lts.1`, `sharp ^0.33.5`; `backend-tests.yml:42–44` verbatim; no lockfile) | ✅ | PRESENT-STATIC | none |
| SEC-CORS-001 | `app.js:92–98`; `middleware/auth.js:11–29` | identical; re-read | ✅ | PRESENT (dynamic E1) | none |
| SEC-AI-002 | `paperToDigital.service.js:101–186`; `@google/genai` absent | identical; grep of manifests confirms absence (`package.json`×backend/root) | ✅ | LATENT | none |
| **SEC-SOCKET-001** | (new, today) | `socket.js:561–564,:678–681` | — | PRESENT (dynamic N-STREAM-06) | added |
| **SEC-SOCKET-002** | (new, today) | `socket.js:662–676` | — | PRESENT (dynamic N-WEBRTC-08) | added |
| **SEC-SOCKET-003** | (new, today) | `socket.js:91–97` | — | PRESENT (dynamic N-CORS-15) | added |
| **SEC-SOCKET-004** | (new, today) | `socket.js:105–145` handshake-only validation | — | PRESENT (dynamic N-SESSION-03) | added |
| SEC-UPLOAD-001 | `middleware/upload.js:110–112` | identical; re-read (`:107–114`, `upload.any()` `upload.routes.js:107`, sharp block `:6–26,:40–100`) | ✅ | PRESENT-STATIC | none |
| SEC-DIR-001 | `message.service.js:4, 89…670`; `usernameHelper.js:83–85` | identical; re-read (`message.service.js:4`; exports `:82–85` exactly `generateBaseUsername, generateUniqueUsername`) | ✅ | PRESENT (dynamic D1) | none |
| SEC-CFG-001 | `dev-server.js:6–8`; `app.js:16–19` | identical; **path clarified**: file lives at repo ROOT (`/school-app/dev-server.js`), prior docs gave no dir (cosmetic) | ✅ (± path) | PRESENT-STATIC | cosmetic path note |
| SEC-CFG-002 | `app.js:227–237` | identical; re-read | ✅ | PRESENT-STATIC | none |
| FW-AUTH-001 | `auth.controller.js:107–120`; `authStore.js:184–188` | identical; re-read (`:109` vs `:184–192` — three mismatched fields: `student_identifier`→`student_code`, `parent_phone`→`phone`, unknown keys) | ✅ | PRESENT (dynamic A2) | none |
| FW-AI-002 | `paperToDigital…:527–534, 493–511` | identical; re-read (`:493–511` hard-coded category map `:504–506`; silent skip `:534`) | ✅ | PRESENT | none |
| FW-AI-003 | `paperToDigital…:62–99` | identical; re-read (`:188,:294` folds) | ✅ | PRESENT-STATIC | none |
| FW-DIR-002 | twin of SEC-DIR-001 | — (covered by SEC-DIR-001 re-read) | ✅ | PRESENT | none |
| FW-API-004 | `auth.controller.js:109` | identical | ✅ | PRESENT | none |
| **FW-UPLOAD-002** | prior phase note; **not re-read** in same-day suite | **re-read bitwise this pass**: dead branch `upload.routes.js:127–134` verbatim (`!decoded.includes('')` never true ⇒ `cleanName` never assigned). "stale-name re-upload/rename metadata" half: no corresponding code found | ⚠️ first half ✅ | **PRESENT (dead-branch half); stale-name half unverifiable** | ▼ prior UNCHANGED-UNVERIFIED resolved |
| FW-DB-005 | `parseDeterministically:229/293` | identical; re-read | ✅ | PRESENT-STATIC | none |
| FW-TEST-001 | prior suite "claim corrected" opinion | independently confirmed again (0 call sites; R1/R2/R3 green) | ❌→confirmed-corrected | UPDATED | none |
| AR-01…AR-12 | context | AR-04 re-spot: lint script + CI test exist; phantom `assertPaymentScope` confirmed (0 matches in `backend/src`); AR-03 grep confirms `@google/genai` absent from both manifests; AR-10 superseded by SOCK-01 | ✅ | CONTEXT unchanged | minor: AR-04/AR-10 precision improved |

## Net movement since the *same-day* reconciliation suite (this pass)

- Fixed-by-code: **0**. Regressed-by-code: **0**.
- Upgraded by deeper verification: **SEC-AUTH-002** (static → dynamic); **FW-UPLOAD-002**
  (unverified → half-confirmed with the dead branch identified verbatim).
- Newly added findings: **SEC-SOCKET-001/002 (Critical-family), SEC-SOCKET-003 (High-family),
  SEC-SOCKET-004 (Medium)** — from the Socket.IO assessment executed earlier today at the same HEAD;
  they are auditable deliverables with their own harness (`backend/.tmp/verify/socket-auth-negative-2026-11-11.cjs`).
- No prior-suite conclusion was found *wrong* this pass; three needed more precision (paths,
  dead-code semantics, the SOCKET additions).
