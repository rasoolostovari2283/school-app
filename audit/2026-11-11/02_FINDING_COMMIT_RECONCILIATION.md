# Finding-to-Commit Reconciliation — EduConnect @ 838b5b2

## Commit-level reconciliation (what drifted, or didn't)

| Item | Value (re-derived this session) |
|---|---|
| Repo | `/Volumes/Samsung T7 1TB/Educonnect/Clone GitHub Educonnect/school-app` |
| Branch / HEAD | `main` @ `838b5b20f257ca7b5d10efe3a1530c2aa84bdf6e` (2026-11-10) |
| Prior suite target | commit `838b5b2` (named in every `audit/2026-11-10/*.md` header) |
| Commits in audit-target → HEAD | **0** (same commit) |
| Working-tree delta vs target | only untracked audit docs (`audit/2026-11-10/`; this session's `audit/2026-11-11/`) |
| Other branches referencing "audit" | `security/audit-2026-11-09` (tip `cb9c553` = HEAD~, pre-AI-pipeline): no audit reports in tree; ended as a working-name branch |
| Committed "verification" artifact | `cb9c553` adds `public/assets/aistudio/EduConnect_Security_Baseline_Verification_2f7e79a1.pdf` — content unextractable (CID-keyed fonts, verified by decompression attempt); no finding references it ⇒ not content-reconciled |
| Prior-phase closed findings | A1–A4, F11 core, Arch-P1 session/is-active — their ratchet tests pass in this tree; no reopening observed |

**Consequence:** none of the 16 security+functional findings can have *regressed-or-fixed*
by way of code movement since the audit; every status below is `PRESENT`-family unless
noted. Re-verification hinged on re-reading code + re-running the harness, not on a diff.

## Finding-level reconciliation

| Finding | Audit docs (where) | Audit's ref lines | Re-verified current lines | Ref-match? | Status @ HEAD |
|---|---|---|---|---|---|
| SEC-AI-001 | `02` | `paperToDigital.service.js:195–225, 265–289, 392–456, 461–598`; `ai.routes.js:45–56` | identical ✓ | ✅ (audit text line "194–225" starts the block ±1) | PRESENT (dynamic C1–C3 again 10/10) |
| SEC-FIN-001 | `02` | `finance.routes.js:410–527` (all substeps) | identical ✓ (`:413` default OK, `:415–418`, `:437–443`, `:445–450`, `:456–471`, `:473–485`, `:487–503`, `:498/511`, docstring `:406–408`) | ✅ | PRESENT (dynamic B1 again) |
| SEC-AUTH-002 | `02` | seed `:4`, `:33–146/167–249/252–285`; `authStore.js:27–71`; `login/page.js:458–507`; `dev-server.js:prepareDatabase` | identical ✓ (`:4`, students `:167–249` incl. `STD-40301…40304` at 177/193/209/225; `DEMO_ACCOUNTS` `:27–71` all `123456`; demo `login/page.js` cards/modal ≈455–507; seeds via `dev-server.js:16–18`) | ✅ | PRESENT-STATIC (explicitly not exercised live, as before) |
| SEC-DATA-001 | `02` | `app.js:239–279`; `dbMaintenance.js:14–16,51–84,145–166` | identical ✓ (`240–246 / :241`, `248–266 / :249`, `268–279 / :269/:272`; constants `:14–16`, copy `:51–84`) | ✅ | PRESENT-PARTIAL (dynamic F1 again; positive role-gate tested, cross-tenant scope absent) |
| SEC-AUTH-001 | `02` | `auth.controller.js:104–121`; `auth.service.js:465–575`; `app.js:137–152` | identical ✓ (`:107–121 / :109`; `:465–575` incl. verified-create 529–560, is_verified `:547/558`, identity return `:565–573`, partial-code guard `:473–483`; limiter mounts `:149–152` only) | ✅ | PRESENT-PARTIAL (dynamic A1–A3 again) |
| SEC-AI-002 | `02` | `paperToDigital.service.js:101–186`; `@google/genai` absent | identical ✓ (`:101–186`; prompt-verbatim `:122`; bare `JSON.parse` `:184`; optional require `:24–30`) | ✅ | LATENT (static as before) |
| SEC-DEP-001 | `02`, `05` | 203 pkgs, 4 advisory hits; no lockfile; CI `npm install --no-audit` | identical ✓ (`backend-tests.yml:44` verbatim `--no-audit --no-fund`; `bun.lock`-only; preserved `pkglist.json`/`osv-report.json`) | ✅ | PRESENT-STATIC (advisory snapshot of 2026-11-11, deliberately not re-fetched) |
| SEC-CORS-001 | `02` | `app.js:92–98`; `middleware/auth.js:11–29` | identical ✓ | ✅ | PRESENT (dynamic E1 again) |
| SEC-UPLOAD-001 | `02` | `upload.routes.js` + multer budget; `.env.example` MAX_FILE_SIZE | budget at `middleware/upload.js:110–112` (30 files, `50*1024*1024`) ✓ | ✅ | PRESENT-STATIC |
| SEC-CFG-001 | `02` | `dev-server.js:7–8`; app.js NODE_ENV check | identical ✓ (`:6–7` quoted src; startup guard `app.js:16–19`) | ✅ | PRESENT-STATIC |
| SEC-DIR-001 | `02` | `message.service.js:4, 87–91, 113–117, 160, 208, 225, 453, 476, 670`; `usernameHelper.js:83–85` | identical modulo ±2 on the first two ranges: actually `:4, 89, 115, 160, 208, 225, 453, 476, 670`; exports `:83–85` confirmed | ✅ (±2 cosmetic, logged) | PRESENT (dynamic D1 again) |
| SEC-CFG-002 | `02` | `app.js:227–237`, `268–278` | identical ✓ | ✅ | PRESENT-STATIC |
| FW-AUTH-001 | `03` | `auth.controller.js:107–120`; `authStore.js:184–188` | identical ✓ (`:109`; `:184–192`) | ✅ | PRESENT (dynamic A2) |
| FW-AI-002 | `03` | `paperToDigital.service.js:527–534, 493–511` | identical ✓ (`continue` `:534`; category auto-create `:493–511`, insert `:500–509`) | ✅ | PRESENT (seen in C2 category drift) |
| FW-AI-003 | `03` | `paperToDigital.service.js:62–99` | identical ✓ (`:62–99`; folds at `:188`, `:294`) | ✅ | PRESENT-STATIC |
| FW-DIR-002 | `03` | same as SEC-DIR-001 | identical ✓ | ✅ | PRESENT |
| FW-UPLOAD-002 | `03` | `upload.routes.js:131` dead decode; `middleware/upload.js` | **not re-read bitwise this session** | ⚠️ unrescued prior-phase claim | UNCHANGED-UNVERIFIED |
| FW-TEST-001 | `03`, `06`, `07` | `expectFailure` wrappers at `extended-findings.test.js:555,635` | **no such wrappers exist** (`grep 'expectFailure('`: 0 call sites; polyfill dead on Node 24; `:555`/`:635` are plain `test(...)`) | ❌ claim corrected — see `00_SESSION_LEDGER` + R8 | UPDATED-CLAIM |
| FW-API-004 | `03` | `auth.controller.js` three-field destructure | identical ✓ (`:109`) | ✅ | PRESENT (A2) |
| FW-DB-005 | `03` | `parseDeterministically` header handling | identical ✓ (`:229`, `:293` regex skips) | ✅ | PRESENT-STATIC |
| AR-01…AR-12 | `04` | various | all points re-spot-checked | ✅ | CONTEXT / unchanged |

## Net movement since prior audit

- Fixed-by-code: **none**.
- Regressed-by-code: **none**.
- Requires code fix but previously *claimed* handled by tests: **no change** — but the
  *description* of the test safety net was wrong (R8) and is corrected here for the
  remediation phase that will build on it.
