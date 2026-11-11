# Functional & Data-Integrity Defects — EduConnect @ 838b5b2

Severity = business impact (not security). Every entry: ID · severity · location · evidence · reproduction ·
impact · verification · remediation.

---

## FW-AUTH-001 — Parent portal permanently broken: frontend/backend field-name contract mismatch
**Severity: High (feature is 100% non-functional for parents)**

### Location
- `backend/src/modules/auth/auth.controller.js` 107–120: reads `req.body.student_code`, `req.body.parent_name`,
  `req.body.phone`.
- `frontend/src/stores/authStore.js` 184–188: sends `student_identifier`, `parent_name`, `parent_phone`
  (+ `relation`, `password`, `school_name`).

### Evidence
- The two sides **never match on the essential keys**: the backend's `student_code` is `undefined` whenever the
  frontend submits (the frontend field name is `student_identifier`). Backend therefore throws
  `400 'لطفاً کد دانش‌آموزی فرزند خود را وارد کنید'`.
- Reproduction (dynamic **A2** second half): the frontend-shaped payload produced exactly that 400.

### Impact
- The entire parent experience (grades, tuition pay link, chat, announcements) is unreachable. A parent hitting
  "ورود با کد دانش‌آموز" can never log in; the only alternative is the (broken-elsewhere) password flow.

### Verification status
**Confirmed (dynamic).**

### Remediation
- Agree a single contract: rename the frontend payload to `student_code` (and `phone`) or add a DTO mapping on the
  backend that accepts `student_identifier` aliases; add a contract test that POSTs the exact frontend shape.

---

## FW-AI-002 — AI gradesheet commit silently drops non-matching students and silently creates a category
**Severity: Medium (silent data loss / fragmented gradebook)**

### Location
- `backend/src/modules/ai/paperToDigital.service.js`:
  - silent skip: line 527–534 (`if (!matchedStudent) continue;` — no record, no warning count);
  - silent category creation: lines 493–511 (if `category_title` differs even by one Persian character, a **new**
    `gradebook_categories` row is inserted with `weight:1.0, max:20, term:'term1'` and the grades land there).

### Evidence
- The deterministic inspection: name matching uses exact equality on the normalized name (`normalizePersianText`);
  nicknames, reversed/first-new tokens, honorifics, Latin-only transliterations, double-spaces — no fuzzy match,
  no `near_match` reporting.
- During replication of SEC-AI-001 (C2 earlier), I committed against a category title that differed by one
  character and the API responded 201 with a **second** category invisible to the teacher's usual category list;
  the rows were "lost". (Commit C2 that overwrote 18 → 3.0 succeeded after pinning `category_id`.)

### Impact
- Teachers who faithfully paste scanned rows can have students/sessions silently dropped or filed under a
  duplicate category — reported totals, GPA, and archived report cards become misleading without any error.

### Verification status
**Static + observed in the dynamic repro (category-duplication behavior).**

### Remediation
- Return a per-row `status: matched | skipped | created` array from commit; require explicit
  `category_id` (or fuzzy-match with a review modal) and reject mismatched titles instead of silently creating;
  surface skipped rows in the UI.

---

## FW-AI-003 — OCR text gets mutated by `normalizePersianText` (substitution fuzz) before grading, with no override
**Severity: Medium (scan accuracy)**
**Location:** `backend/src/modules/ai/paperToDigital.service.js` 62–99 — `extractFromPaper` runs
`normalizePersianText` (homoglyph folding in `iranianValidators`) *before* row division. Digit folding
(`normalizePersianDigits`) may change the score it parses (`normalizePersianDigits(e.g. '۱۲٫۵').replace`) and the
national code.
- **Impact:** subtle but systematic misreads on Persian fonts — scores like `5٫5` vs `5,5` collide; names are
  folded for matching (see FW-AI-002). The honest-feasibility object does not disclose these folds, which could
  be resolved by one `rawPreserving` flag on extraction.

### Verification status
Static (no scanning test harness images present in the repo to exercise).

### Remediation
- Keep the raw OCR alongside the normalized text and allow a per-deployment `preserveDigits` policy; document in
  `feasibility_assessment.limits`.

---

## FW-DIR-002 — Directory (and sibling chat flows) crash when a user lacks a `username`
**Severity: Low (availability) — technical twin of SEC-DIR-001**
**Location:** `backend/src/modules/messages/message.service.js` 4, 87–91, 113–117, 160, 208, 225, 453, 476, 670;
`backend/src/utils/usernameHelper.js` 83–85.
- The front-end directory page renders `username` directly; crash ⇒ blank/dead directory; group creation and
  search share the same undefined-symbol call path, so the failure propagates beyond the directory page.
### Verification
**Confirmed (dynamic D1).**

---

## FW-UPLOAD-002 — The "/uploads" listing persists stale metadata after file replace/rename; mimetype-first CLI rejects nothing
**Severity: Low**
**Location:** `backend/src/modules/upload/upload.routes.js` (the line-131 dead decode observed earlier in the
phase review) and `backend/src/middleware/upload.js` (B/W logic) — a stale `file.name` is used for the storage
key on re-upload, so the old URL keeps serving while `uploads/` accumulates orphan files; the CLI
`decode` at line 131 is dead code that should not be there.

### Verification
Static (from earlier phase reading; retained here for the bug runbook, not re-verified bitwise).

---

## FW-TEST-001 — The test suite documents the vulnerabilities as regression-protected but never asserts them fixed
**Severity: Medium (continuous quality gap)**
**Location:** `backend/tests/…` (all `[FRAUD-FAIL]`-style expected-failing tests, e.g.
`extended-findings.test.js:555` `[Iran-EdTech-PaperToDigital]`, `:635` `[Iran-EdTech-Shaparak-SMS]`).
- The suite's *expected-failing* tests lock in the exact vulnerable behavior (e.g. callback verification works
  with a fake bank status, paper-to-digital commits happen without review). They are the right conversion target
  for the next remediation phase: flip them from `expectFailure` to normal assertions once fixed. Keep them as
  regression gates for the fixes.

### Verification
Static (ran the suite: 145/145, which includes the ratcheting wrappers).

---

## FW-API-004 — `POST /auth/parent-login` accepts arbitrary extra fields with no validation at all
**Severity: Low (robustness)**
Same root as SEC-AUTH-001/FW-AUTH-001: the controller destructures three fields and ignores everything else,
including any future `role:` a client sends — there is no Joi schema, so the surface grows whenever the service
reads more of `req.body`. Mild today; re-flagged here for the contract-repair task.

### Verification
Dynamic (A2 payload contained extra keys, computed status 400 for the contract shape; other extra fields are
ignored).

---

## FW-DB-005 — `parseDeterministically` block that skips nothing when the Persian header row is absent
**Severity: Informational**
When a scanned sheet lacks the exact header tokens (`ردیف|نام|کد\s*ملی`), every physical row counts — including
the header itself; coupled with FW-AI-002 silent skips, row accounting between extraction (`total_extracted`) and
commit (`savedScoresCount`) can diverge with no explanation in the responses.

### Remediation
Normalize row bookkeeping: include `skipped`/`no_match` counts in every `commitExtractedData` response.
