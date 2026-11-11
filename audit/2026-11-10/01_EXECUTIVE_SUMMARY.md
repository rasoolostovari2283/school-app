# EduConnect Security & Quality Audit — Executive Summary

**Scope:** `/Volumes/Samsung T7 1TB/Educonnect/Clone GitHub EduConnect/school-app` — commit `838b5b2` on `main`
("feat: implement paper-to-digital AI extraction and security enhancements") — read-only audit, 2026-11-10/11.

**Overall posture.** EduConnect is a multi-tenant SaaS monolith (React/Next.js + Express + SQLite) for schools.
The code is well-structured and largely free of the classes of bug fixed in the merged `security/phase-0` and
`security/phase-1a` branches (which are ancestors of this commit). The **new** attack surface introduced by this
commit — the paper-to-digital AI extraction pipeline — is, however, broken in three compounding ways, and two
long-standing architectural weaknesses (financial settlement without bank confirmation, and tenant-unaware backup
artifacts) are still open and are **actively exploitable end-to-end**.

## Findings at a glance

| Card | ID | Severity (CVSS 4.0) | Reproduced? | One-line summary |
|---|---|---|---|---|
| 🔴 | SEC-AI-001 | **Critical — 8.8** | ✅ dynamic | Empty/forged OCR yields *hard-coded fabricated students*, committed to rosters/gradebook with no provenance and no `needs_review` enforcement. |
| 🔴 | SEC-FIN-001 | **Critical — 9.2** | ✅ dynamic | `POST /finance/callback-verify` marks tuition **paid** with **no bank verification**; a signed-in student can self-settle instalments and zero their own balance. |
| 🟠 | SEC-AUTH-002 | **High — 8.5** | ⚠️ static+demo | Production seeds hash the literal password `123456` for every account, and the frontend ships one-click **demo buttons** using exactly those credentials (admin/teacher/parent). |
| 🟠 | SEC-DATA-001 | **High — 8.4** | ⚠️ code + role gate | The whole multi-tenant SQLite DB is backed up as one file; backup **list/download/create are guarded by role only** — any `school_admin`/`admin` can download every school's PII. |
| 🟠 | SEC-AUTH-001 | **High — 7.7** | ✅ dynamic | `parent-login` is unauthenticated, un-rate-limited, cross-tenant-scoped-out, and creates a fully-verified parent account on supply of any student code — then discloses that student's identity. Student codes are sequential (`STD-40301…`) so they are enumerable. |
| 🟠 | SEC-AI-002 | **High — 7.4** | ⚠️ static | The Gemini extractor is inert in this tree (`@google/genai` not installed) — but if installed, scanned-paper content goes straight into the LLM prompt with **no schema validation** (`JSON.parse` only) → classic indirect prompt injection. |
| 🟠 | SEC-DEP-001 | **High — 7.1** | ✅ OSV batch | 203 packages inventoried; OSV matches: `multer@1.4.5-lts.2` (11 HIGH DoS), `sharp@0.33.5` (3 HIGH image-parser), `minimatch` (1 moderate), `uuid@10` (1 moderate). No committed lockfile → no reproducible builds; CI runs `npm install --no-audit`. |
| 🟡 | SEC-CORS-001 | **Medium-High — 6.8** | ✅ dynamic | `cors({origin:true, credentials:true})` reflects *any* origin; auth middleware also accepts the access token from a **cookie** ⇒ malicious sites can drive credentialed API calls from a victim's browser. |
| 🟡 | SEC-UPLOAD-001 | **Medium — 6.4** | ⚠️ static | Upload budget `30 × 50 MB`; the multer advisories above let unauthenticated streams consume memory/files on this path. |
| 🟡 | SEC-DIR-001 | **Medium — 6.0** *(availability)* | ✅ dynamic | `/messages/directory` (and 8 sibling call sites) **500-crash** whenever any user lacks a `username` — `ensureUserHasUsername` is imported but never exported. Any roster mutation (e.g. via SEC-AI-001) can trigger it. |
| 🟡 | SEC-CFG-001 | **Low-Medium — 5.4** | ⚠️ static | `dev-server.js` commits JWT secrets; `@google/genai` absent means the AI "dual engine" silently runs the *deterministic* parser in production with fixed confidences — operator may believe Gemini is running. |
| ⚪ | FW-AUTH-001 | functional (blocker) | ✅ dynamic | Parent-login **frontend and backend disagree on field names** — the parent portal can never log in. |
| ⚪ | FW-AI-002 | functional | ⚠️ static | AI commit **silently skips** students whose names don't exactly match, and silently **creates a new gradebook category** on `category_title` mismatch → silent data loss/fragmentation. |

## Impact for stakeholders

1. **Parents** are locked out of the portal (contract break) while the same endpoint *issues verified accounts to
   anonymous callers* in the same codebase — a paradox that must be fixed as one unit (SEC-AUTH-001 + FW-AUTH-001).
2. **School finance** is not safe: any student (or staff, or any token-holder of the school) can mark instalments
   paid; the current "SMS receipt" step does not change the money path (SEC-FIN-001). This breaks the revenue
   model as well as the audit trail (SEP: the settlement writes `bank_name: شاپرک آنلاین` with a fake PAN).
3. **Data integrity of academic records is untrustworthy as shipped.** The "human-in-the-loop" promise in the new
   AI module is decorative: `needs_review` is computed but never enforced at commit, and the commit endpoint
   accepts any items the browser sends (SEC-AI-001, SEC-AI-002, FW-AI-002).
4. **Multi-tenant isolation is not a boundary on the disk.** One SQLite file contains all schools; the backup
   subsystem is role-gated only (SEC-DATA-001). In the current single-school-per-deployment operations this is a
   latent risk, but with the app registered for multi-schools (metadata.json says multi-tenant), it is a breach
   waiting for a second tenant.
5. **Default credentials are back.** Seed `001_school_data.js` (line 4) hashes the literal `123456` for *every*
   seeded account, and the frontend "try a demo" buttons log in as `principal@school.ir` / financial officer /
   parent with that literal — on any environment that executed the seeds (SEC-AUTH-002). The previous phase
   removed the *login-side* bypass but the *seeded accounts* were missed.

## What the audits ran

- Read most of the backend (app, middleware, services, migrations/seeds) and critical frontend surfaces.
- Full test suite: **145/145 passing** (offline; `node --test`). The suite intentionally contains
  *expected-failing* regression tests that encode known-vulnerable behaviours (e.g. shaparak callback,
  paper-to-digital commits) — the audit did not modify them.
- Bespoke dynamic harness (`backend/.tmp/verify/...`) against the two-school throwaway fixture: **10/10** candidate
  behaviours reproduced live (parent-login, callback-verify, fabricated-OCR commits, directory crash, CORS, backup role gate).
- Dependency exposure via OSV.dev batch query on the actual installed tree (203 packages).
- `npm audit` itself is unusable — no committed lockfile (ENOLOCK), which is itself a finding (SEC-DEP-001).

## Top-5 by remediation priority (see `07_REMEDIATION_ROADMAP.md`)

1. **SEC-FIN-001** — money. Verify Shaparak response over the PSP verify API (server→server), bind by
   `MerchantID`+`authority`, settle only then; move the endpoint off public routes; add idempotency.
2. **SEC-AUTH-002 + FW-AUTH-001** — parents and first-login hygiene: remove default password from seeds,
   delete the demo buttons (or gate behind an install-only flag with forced reset), and re-point the frontend
   to the API's actual field names.
3. **SEC-AI-001 / SEC-AI-002 / FW-AI-002** — re-architect the commit pipeline: sign extraction packets
   server-side, enforce `needs_review`, require a per-item review flag at commit time, log audit entries, and
   install/validate a JSON schema before trusting Gemini output.
4. **SEC-DATA-001** — scope backups by `school_id` (or per-school DB files), keep backups out of the download
   tree for `school_admin`, and confirm `BACKUP_DIR`/`DB_PATH` respect `NODE_ENV`.
5. **SEC-DEP-001** — `multer` 1.4.5-lts → 2.x, bump `sharp` to the patched line, add and commit a lockfile,
   run `npm ci` + `npm audit` in CI.

## Caveats

- Findings from the *merged* security branches (A1–A4, F11 core fixes, Arch-P?/Iran-Education checks present in
  `backend/tests/security/extended-findings.test.js`) are treated as closed and are not re-listed.
- The SMS gateway and Gemini paths require un-set env keys in this environment; those were code-reviewed only.
- This audit is read-only: no application code, config, or lockfiles were changed.

*Full evidence per finding lives in the dedicated documents; a consolidated verification & coverage table is in
`08_AUDIT_COVERAGE_MATRIX.md`.*
