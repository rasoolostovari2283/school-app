# Remediation Roadmap — EduConnect @ 838b5b2

Priorities by blast radius and remediation cost. It assumes the shipped safety net (145 tests + the
`expectFailure` ratchets) is used as a gate per phase.

---

## Phase 0 — Stop the bleeding (money, identity, parents) — target: 1 sprint

| # | Finding | Action | Effort | Test gate |
|---|---|---|---|---|
| 0.1 | **SEC-FIN-001** | Add real Shaparak/PSP verify call (server→server, by `authority` + amount + `MerchantID`) and only settle onOK; remove `status: 'OK'` trust; move endpoint behind `financial_officer`+; idempotent ledger settle. | Medium | flip `[Iran-EdTech-Shaparak-SMS]` callback section from fake→verifier-mock |
| 0.2 | **SEC-AUTH-002 + FW-AUTH-001** | (a) stop seeding `123456` (random per-account secret, forced reset flag); (b) remove/disable demo buttons; (c) repair the field contract: frontend sends `student_code`+`phone`, backend DTO alias for `student_identifier`. | Small | add a `"parent-login"` suite test (currently absent) |
| 0.3 | **SEC-AUTH-001** | Track parent-login: verification-code step (SMS to student's known number via school gateway) *before* account creation; keep account unverified until phone proved; rate-limit the route; stop cross-tenant student lookup; return identical body for unknown/mismatch. | Medium | contract + 401-uniformity tests |
| 0.4 | **SEC-DATA-001** | Scope backup artifacts per school (or deny `school_admin` downloads), treat `DB_PATH`/`BACKUP_DIR` as config, never build into `db_backups/` under the repo, require `manager`/`admin` for global list. | Medium | cross-tenant backup test |

---

## Phase 1 — Make the AI pipeline honest (the new feature)

| # | Finding | Action | Effort | Test gate |
|---|---|---|---|---|
| 1.1 | **SEC-AI-001** | Server-signed extraction packets (TLId); enforce `needs_review` and `reviewed:true`; audit-log commits; tie roster commit to class ownership. | Medium | rewrite `[Iran-EdTech-PaperToDigital]` as fixed-behaviour assertions |
| 1.2 | **SEC-AI-002 / AR-03** | Schema-validate Gemini output (strict Zod/JSON Schema), cap rows, keep raw OCR, make engine select explicit; or remove cloud path until installed. | Medium | unit tests for schema rejection + prompt-injection fixtures |
| 1.3 | FW-AI-002/3 | Return per-row status; `category_id` explicit or fuzzy-match + no silent category creation; record folds in feasibility. | Small | fixture with non-matching + title-mismatch rows |
| 1.4 | FW-TEST-001 | Convert `expectFailure` wrappers into fixed-behaviour tests for the whole list (they are the safety net once 0.x/1.x land). | small | CI flips those wrappers green |

---

## Phase 2 — Platform hardening (identity, storage, CORS/attachments)

| # | Finding | Action | Effort |
|---|---|---|---|
| 2.1 | **SEC-CORS-001** | Explicit frontend origin allowlist; `credentials` only for the allowlist; SameSite=Strict httpOnly cookie; CSRF token for write APIs; treat Authorization-header mode as default. | Medium |
| 2.2 | **SEC-UPLOAD-001 / SEC-DEP-001** | multer → 2.x (or busboy streaming); per-request file count & size caps; total disk guard; upgrade sharp to patched patchline; wire `osv-scanner` into CI. | Medium |
| 2.3 | **SEC-DEP-001** | Commit lockfile(s); `bun install --frozen-lockfile` or `npm ci` in CI; audit step enabled (`--no-audit` removed); manager dual-manifest drift (upgrade backend majors towards root). | Small-Medium |
| 2.4 | **SEC-CFG-001** | Remove committed JWT defaults; boot-time secret-maturity check; build secrets only in deploy env. | Small |
| 2.5 | **SEC-DIR-001** | Implement `ensureUserHasUsername` (wrap `generateUniqueUsername`) with regression test for username-less users. | Small |

---

## Phase 3 — Multi-tenant architecture & integrity (if the roadmap embraces multi-school)

| # | Item | Action |
|---|---|---|
| 3.1 | AR-01 | Serialize a tenant model: per-school DB or row-level library plus composite unique index maintenance; audits scoped by school. |
| 3.2 | AR-04 | Route-authorization lint (extend the consumer of the unscoped-id ratchet to `school_id`/role completeness checks); every new module test asserts the tenant gate. |
| 3.3 | AR-02 | Payload-signing & review-enforcement as a framework (packet id, reviewer_id, audit link) — shared across roster/gradebook/quiz imports |
| 3.4 | AR-09 | Move session tokens out of `localStorage` (cookie + CSRF) once CORS/CSRF work lands. |
| 3.5 | AR-10/AR-11 | Re-authorize socket-per-room; sign the APK artifact, version-pinned updater. |
| 3.6 | AR-12 | Health metrics (DB size, WAL growth, disk headroom, rate-limit hits) and a backup watchdog. |

---

## Definition of done (per phase)
- New/updated regression tests *fail* against the old code and pass against the fix (`git stash` round-trip).
- The `expectFailure` wrappers that were flipped are renamed (positive) so CI output is honest.
- `npm ci`/lock-drift check green; `osv-scanner` results attached to the PR.
- No application code changes outside the target.

## Suggested sequencing
0.1 → 0.2/0.3 → 0.4 → 1.1 → 1.2 → 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 3.x (as architecture budget allows).

---

*Diffs between this audit's view and the previous security phase's "intended flow" tests are incremental — each
phase lands behind the existing suite, we never fork the compliance surface.*
