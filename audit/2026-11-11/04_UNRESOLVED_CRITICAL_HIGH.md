# Unresolved Critical & High Findings — EduConnect @ 838b5b2

All 7 items below are **unresolved** at HEAD `838b5b2` and were re-confirmed by this
reconciliation (dynamic re-run where applicable, or code re-read at the cited lines).

## Critical

### 1. SEC-FIN-001 — Tuition settlement without bank/IPP verification (CVSS 4.0 ≈ 9.2)
`backend/src/modules/finance/finance.routes.js:410–527`
- Trusts client-supplied `{status = 'OK'}` (`:413, :420`), never contacts the PSP;
  `authority` from the body echoed unverified into the receipt (`:498, :511`);
  only `counselor` excluded (`:415–418`) — **students, parents, teachers, admins,
  managers, financial officers all can settle**; balance drains to 0 instalment by
  instalment (only same-instalment dedupe, `:445–450`).
  Docstring claims "Verifies Shaparak IPG callback" (`:406–408`) — false.
- **Re-confirmed dynamically (B1):** authenticated fixture *student* settled
  `installment-a-1` (6,000,000 R paid; balance 25M→19M) with injected authority
  `FAKE-INJECTED-AUTHORITY`, echoed in the receipt. Lock-in: `extended-findings.test.js:635` (green, R2).
- Fix gate for next phase: require PSP verify-call; role gate `financial_officer/+`;
  `authority`-based idempotency & replay protection; rewrite R2 test.

### 2. SEC-AI-001 — AI pipeline commits fabricated/unreviewed data (CVSS 4.0 ≈ 8.8)
`backend/src/modules/ai/paperToDigital.service.js:195–225 / :265–289 / :392–456 /
:461–598` + `ai.routes.js:45–56`
- Empty/whitespace OCR returns *hard-coded fabricated pupils* at 0.96/0.94/0.78
  (roster) and 0.97/0.95/0.81 (gradesheet) confidences; commit accepts **any client
  items** (`ai.routes.js:47` passes `req.body` through), `needs_review` never enforced
  at commit (473 ff.), roster path gated only by `school_id` via
  `sida.service.js:164–168` and overwrites existing students' identity fields
  (`:226–233`).
- **Re-confirmed dynamically (C1–C3):** fabricated rows extracted; gradebook score
  overwritten 18 → 3.0 incl. `needs_review:true` items; roster created fake students
  + forged national codes + auto-created parent accounts. Lock-in: `extended-findings.test.js:555` (green, R1).
- Fix gate: server-signed extraction packets; enforce review per item (`reviewed:true`
  + `reviewer_id`); per-class teacher authority; audit-log commits.

## High

### 3. SEC-AUTH-002 — Universal default credentials `123456` in seeds + demo buttons (≈ 8.5)
`backend/src/database/seeds/001_school_data.js:4` (hash of `'123456'` shared by every
seeded account, `:33–285`); `frontend/src/stores/authStore.js:27–71` (`DEMO_ACCOUNTS`,
password `'123456'` per role) + demo-login buttons (`authStore.js:205–223`, `login/page.js:~455–507`).
- The earlier security phase *removed* login-side universal-password acceptance, but
  seeds + demo buttons re-anchor the same credentials; `dev-server.js:16–18` seeds on
  every fresh environment.
- **Re-confirmed statically** (identical literals, phones, and flow as the prior
  audit's character-by-char read). Not exercised live: shipped tests use the fixture
  password (`Fixture#2026!`, `fixtures/twoSchools.js:18`); the harness isolates them —
  flagged as a coverage gap (R10), not a changed status.
- Fix gate: random per-account seed passwords / forced reset; delete or install-gate
  demo buttons; migration nullifying legacy `123456` hashes.

### 4. SEC-DATA-001 — Cross-tenant DB exfiltration via role-only backup endpoints (≈ 8.4)
`backend/src/app.js:239–279` (list/download/create with `['admin','manager','school_admin']` role-only guards, zero `school_id` scoping); `backend/src/services/dbMaintenance.js:14–16, 51–84` (env-blind single-file whole-DB copy).
- **Re-confirmed dynamically (F1):** `school_admin`-eligible roles list backups → 200;
  tenant scope absent everywhere. Role *rejection* (for teachers) tested status-only
  (R4) but the cross-tenant scope gap has no test (R10).
- Fix gate: per-school backup scoping; downloads not served from the authenticated
  static tree; `DB_PATH`/`BACKUP_DIR` via config; `manager/admin` only for global ops.

### 5. SEC-AUTH-001 — Unauthenticated parent-login mints verified accounts & leaks student identity (≈ 7.7)
`backend/src/modules/auth/auth.controller.js:107–121`,
`auth.service.js:465–575`, **not rate-limited** (`app.js:149–152` skip it).
- Cross-tenant student lookup (`:477–483`); creates verified parent with attacker-chosen
  name/phone, random password caller never hears (`:529–560`); returns the student's
  `display_name/code/department` (`:565–573`); sequential seed codes (`STD-40301…`) make
  oracle enumeration practical.
- Partially mitigated post-phase: partial codes rejected (`:476–483`); existing parent
  identity never rewritten (`:511–528`). **Core issues (custody, rate limit, tenant
  scope, PII oracle) remain open.**
- **Re-confirmed dynamically (A1–A3)** — incl. cross-school enumeration `STD-A-1001/1002`, `STD-B-2002`.

### 6. SEC-AI-002 — Blind `JSON.parse` of Gemini output + indirect prompt injection (≈ 7.4) — LATENT
`paperToDigital.service.js:101–186`
- `raw_ocr_text` inlined verbatim into the prompt (`:122`); model output trusted past
  bare `JSON.parse` (`:184`), no schema/row-cap enforcement post-parse; confidences in
  the fallback are hard-coded, not measured.
- **Precondition absent:** `@google/genai` not installed (`:24–30` require guard) and
  no `GEMINI_API_KEY` in this environment → the deterministic parser (and its fake
  confidences) is what runs. If the package/key appears, this is live at the same code.
- Fix gate: strict schema for LLM output, row caps, quarantine, keep raw OCR, engine
  selection explicit & loud-failing.

### 7. SEC-DEP-001 — Advisories on install set; un-pinned, un-audited dependency supply (≈ 7.1)
- Installed-tree OSV batch (preserved snapshot 2026-11-11, `backend/.tmp/verify/`):
  `multer@1.4.5-lts.2` — 11 HIGH DoS advisories (exactly the express upload middleware
  consumed at `upload.js`, server memory/stream); `sharp@0.33.5` — 3 HIGH native-parser
  advisories (consumed by `upload.routes.js:40–45`); `minimatch@10.2.6`, `uuid@10.0.0`
  moderate.
- No committed npm lockfile; CI installs `npm install --no-audit --no-fund`
  (`.github/workflows/backend-tests.yml:44`); workspace manifests drifted between root
  (`^5.3` express, `^2.5.0` multer…) and backend (`^4.21.0`, `^1.4.5-lts…`).
- Re-confirmed from the preserved OSV artifact; deliberately not re-fetched (fresh
  advisories could only raise match counts).

## Watch list (Medium, present, not on the Critical/High list)
SEC-CORS-001 (6.8 — live, E1 again), SEC-UPLOAD-001 (6.4), SEC-DIR-001 (6.0 — D1 again),
SEC-CFG-001 (5.4), SEC-CFG-002 (4.7). All still open; not repeated above to keep this
list at the requested severity.

## Combined statement
**0 Critical and 0 High findings have been fixed or otherwise resolved between the
prior audit's target (== HEAD) and now.** The applied mitigations visible in the tree
(phase-0/1a: partial-code rejection, identity non-rewrite, role-rejection tests)
address *earlier phase findings* (A1–A4/F11) and trim the edges of #5; none touches the
seven items above.
