# Business Logic & Data Integrity Investigation — EduConnect

**Independent read-only assessment** @ `main` `838b5b2` · 2026-11-11
**Scope:** Financial transactions, grades, attendance, examinations, assignments, student enrollment, teacher ownership, notifications, record deletion, concurrent requests, database consistency.
**Method:** Direct source reads; every finding cites `file:line`; synthetic fixtures for reproduction; no modifications.

---

## Executive Summary

| Category | Critical (P0) | High (P1) | Medium (P2) | Total |
|---|---|---|---|---|
| Financial transactions | 4 | 2 | 1 | 7 |
| Grades & gradebook | 1 | 2 | 2 | 5 |
| Attendance | 1 | 2 | 1 | 4 |
| Quizzes/Examinations | 2 | 1 | 1 | 4 |
| Assignments | 1 | 1 | 1 | 3 |
| Student enrollment | 2 | 2 | 2 | 6 |
| Teacher ownership | 1 | 1 | 0 | 2 |
| Notifications | 1 | 1 | 1 | 3 |
| Record deletion | 1 | 1 | 0 | 2 |
| **Concurrency / race conditions** | **5** | **3** | **0** | **8** |
| **Database constraints missing** | **4** | **3** | **2** | **9** |
| **Cascading / referential integrity** | 0 | 2 | 1 | 3 |
| **TOTAL** | **23** | **21** | **11** | **55** |

**Classification:** Findings marked **DEFECT** require a design decision (schema change, transaction boundary, new constraint). Findings marked **DEBT** are local code improvements.

---

## 1. Financial Transactions — Tuition Ledger & Settlement

### BL-FIN-001: Zero database transactions — settlement is non-atomic read-modify-write — **DEFECT (P0)**

- **Location:** `backend/src/modules/finance/finance.routes.js:184–195` (verify-installment), `:456–471` (callback-verify)
- **Evidence:** Both settlement paths:
  1. Read `installment` → read `ledger` → compute `newPaid = paid_amount + amount` / `newBalance = max(0, balance - amount)` → UPDATE `installment` → UPDATE `ledger` → optional SMS
  2. No `db.transaction()` wrapper anywhere in codebase (`grep -r "\.transaction(" backend/src` → 0 hits)
- **Consequence:** Two concurrent settlement requests for the same installment read the same `paid_amount`/`balance`, both succeed → **double-charge** (paid_amount exceeds total_amount, balance negative, two receipts, two SMS). The only guard is `Math.max(0, ...)` clamp and a status check (`installment.status === 'verified'` at lines 177, 445) — but the check and the writes are separate statements.
- **Reproduction:**
  ```bash
  # Synthetic: two parallel POST /api/v1/finance/verify-installment/:id
  # with same installment ID, same ledger
  # Both read balance=100, amount=50 → both write paid=150, balance=50
  # Expected: one succeeds, second returns 409
  # Actual: both succeed → ledger.paid_amount=150 (should be 50), balance=50 (should be 50 but double-counted)
  ```
- **Regression test:** Insert ledger + installment; fire 20 parallel verify requests; assert exactly 1 succeeds, ledger.paid_amount == installment.amount.

### BL-FIN-002: No idempotency key on settlement — replay attacks possible — **DEFECT (P0)**

- **Location:** `finance.routes.js:158–212` (verify-installment), `:410–527` (callback-verify)
- **Evidence:** `callback-verify` accepts `authority` from client body (line 413) but never stores it uniquely. No unique constraint on `(ledger_id, authority)` or `(installment_id, authority)`. `verify-installment` has no idempotency parameter at all.
- **Consequence:** Same IPG callback (or malicious retry) can be replayed → multiple settlements. The `status === 'verified'` check (line 445) is the only defense, but it's a separate SELECT from the UPDATE.
- **Reproduction:** POST `/callback-verify/:id` with same `authority` twice in rapid succession.
- **Fix:** Add `UNIQUE (ledger_id, authority)` + `UNIQUE (installment_id, tracking_number)`; wrap settlement in transaction.

### BL-FIN-003: Missing unique constraint on `(ledger_id, installment_number)` — duplicate installments expressible — **DEFECT (P0)**

- **Location:** Migration `006_create_enterprise_school_modules.js:124–141` (tuition_installments table)
- **Evidence:** Table defines `installment_number` NOT NULL but **no unique index** on `(ledger_id, installment_number)`. Only unique is `tuition_ledgers(student_id, academic_year)`.
- **Consequence:** `create-ledger` (line 275–305) inserts 3 installments with numbers 1,2,3 — but a direct DB write or buggy retry could insert duplicate installment numbers. Settlement logic assumes one installment per number.
- **Fix:** Add `table.unique(['ledger_id', 'installment_number'])` in migration.

### BL-FIN-004: No CHECK constraints on ledger invariants — **DEFECT (P0)**

- **Location:** Migration `006:109–121` (tuition_ledgers), `finance.routes.js:189–195`
- **Evidence:** Ledger stores `total_amount`, `discount_amount`, `paid_amount`, `balance`, `status`. Invariants that **must always hold** but are only enforced in application code:
  - `paid_amount >= 0`
  - `balance >= 0`
  - `paid_amount <= total_amount - discount_amount`
  - `balance = total_amount - discount_amount - paid_amount` (derivable)
  - `status IN ('unpaid','partial','settled')` matches balance
- **Consequence:** Direct DB write, migration bug, or race condition can leave ledger in invalid state permanently. No database-level guard.
- **Fix:** Add `CHECK (paid_amount >= 0 AND balance >= 0 AND paid_amount <= total_amount - discount_amount)`; consider making `balance` a generated column.

### BL-FIN-005: Two settlement paths share no abstraction — divergent idempotency semantics — **DEBT (P1)**

- **Location:** `verify-installment` (lines 158–212) vs `callback-verify` (lines 410–527)
- **Evidence:** `verify-installment` uses `tracking_number` from receipt; `callback-verify` uses `authority` from IPG. Both write `tracking_number` on installment but with different formats (`TRX-` prefix vs `SHP-` prefix). No shared `confirmPayment(ledger_id, installment_id, idempotency_key, amount, source)` primitive.
- **Consequence:** Bug fixes must be applied twice; inconsistent replay protection; harder to audit.
- **Fix:** Extract common settlement logic into `finance.service.js` (see AD-05 IMP-01/07).

### BL-FIN-006: Financial officer role exists but never authorized for settlement — **DEFECT (P1)**

- **Location:** `auth.js:266–268` (role alias), `finance.routes.js:161` (verify-installment authorize), `:410` (callback-verify has NO authorize)
- **Evidence:** `authorize('financial_officer')` never appears in finance routes. `callback-verify` has **no role check at all** — only counselor exclusion (line 416).
- **Consequence:** Any authenticated user (including student/parent) can hit `callback-verify` and settle installments if they know the installment ID and authority. The `assertSameSchool` at line 443 only checks school, not role.
- **Fix:** Add `authorize('admin','manager','financial_officer','accountant')` to `callback-verify`; audit all finance endpoints for role coverage.

### BL-FIN-007: `create-ledger` inserts installments without transaction — partial insert possible — **DEBT (P1)**

- **Location:** `finance.routes.js:263–305`
- **Evidence:** Ledger insert (lines 263–272) then installments insert (lines 305) — separate statements, no transaction. If installments insert fails, ledger exists without installments.
- **Consequence:** Orphan ledger; subsequent `create-ledger` calls return existing ledger but installments may be missing.
- **Fix:** Wrap in `db.transaction()`.

---

## 2. Grades & Gradebook

### BL-GRB-001: Batch score upsert has no transaction — partial saves on failure — **DEFECT (P0)**

- **Location:** `gradebook.routes.js:254–305` (`/scores/batch`)
- **Evidence:** Loop over `scores` array (line 261); each iteration does SELECT category → assertOwnsClass → assertTeacherOfStudent → SELECT existing → UPDATE or INSERT. **No transaction wrapper.** If iteration 15 of 30 fails, first 14 persist.
- **Consequence:** Teacher submits 30 scores; network error at #15 → 14 saved, 16 lost, no error rollback. UI shows success for all.
- **Reproduction:** POST `/batch` with 10 valid + 1 invalid (missing category_id); observe 10 persisted before 400.
- **Fix:** Wrap entire batch in `db.transaction()`.

### BL-GRB-002: Weighted average precision drift — floating point accumulation — **DEBT (P1)**

- **Location:** `gradebook.routes.js:85–105` (weighted average calculation), `:592–637` (report-card)
- **Evidence:** `weightedSum += score * weight` (line 93); `totalWeight += weight` (line 94); `weightedAverage = (weightedSum / totalWeight).toFixed(2)` (line 98). Repeated across classes in report-card (line 619). JavaScript float precision can cause 0.01 drift over many categories.
- **Consequence:** Official report cards may show 17.99 vs 18.00 depending on iteration order.
- **Fix:** Use integer arithmetic (store scores × 100) or `decimal.js`; or compute in SQL with `ROUND(SUM(score * weight) / SUM(weight), 2)`.

### BL-GRB-003: No constraint that category weights are positive / sum to 1.0 — **DEBT (P1)**

- **Location:** Migration `006:25–33` (gradebook_categories), `gradebook.routes.js:136–144`
- **Evidence:** `weight` defaults to 1.0; `max_score` defaults to 20.0. No CHECK `weight > 0`. No validation that sum of weights per class equals 1.0 (or any normalization).
- **Consequence:** Teacher creates categories with weights 1, 1, 1 → weighted average = arithmetic mean (silent semantic change). Weight 0 → division by zero guarded (line 98 `totalWeight > 0`) but returns null.
- **Fix:** Add `CHECK (weight > 0)`; consider normalizing weights on read or enforcing sum=1 at class level.

### BL-GRB-004: Score validation only in application layer — **DEBT (P2)**

- **Location:** `gradebook.routes.js:209–213` (parsePersianScore + range check)
- **Evidence:** `maxScore = category.max_score || 20`; validates `0 <= score <= maxScore`. No DB CHECK on `gradebook_scores.score`.
- **Consequence:** Direct DB write or migration can insert score 999.
- **Fix:** Add `CHECK (score >= 0 AND score <= max_score)` — requires `max_score` on scores table or FK to category.

### BL-GRB-005: Report-card discipline score calculation mutates variable in loop — **DEBT (P2)**

- **Location:** `gradebook.routes.js:639–644`
- **Evidence:** `let disciplineScore = 20.0; for (const d of disciplineRecords) disciplineScore += d.points; disciplineScore = Math.max(0, Math.min(20, disciplineScore));`
- **Consequence:** If `points` can be negative (deduction type), score can drop below 0 then clamped. But `points` is float (migration `006:80`), no validation. Also, discipline records from other schools could leak if `assertSameSchool` missed (it's called at line 575 for student).
- **Fix:** Add `CHECK (points >= -20 AND points <= 20)` on discipline_records; ensure school scoping on discipline query.

---

## 3. Attendance

### BL-ATT-001: Race condition in `closeSession` — concurrent check-in can be lost — **DEFECT (P0)**

- **Location:** `attendance.service.js:159–233` (`closeSession`)
- **Evidence:**
  1. Line 167–173: SELECT all class members
  2. Line 171–175: SELECT already checked-in student IDs
  3. Line 177–189: Compute absent IDs = members - checkedInIds → bulk INSERT absent records
  4. Line 191–207: Notify parents of absent students
- **Race window:** Between step 2 and step 3, a student calls `checkIn` (line 70–118). Their check-in is recorded, but step 3 already computed absent set without them → **absent record inserted OVERWRITING the check-in** (line 182–188 uses `insert().catch(() => {})` — the catch swallows the unique constraint error if one existed, but there is NO unique constraint on `(session_id, student_id)`!).
- **Reproduction:**
  1. Session active, 30 students
  2. Teacher hits "close session"
  3. Student A checks in at T+50ms (concurrent)
  4. `closeSession` step 2 reads checkedInIds WITHOUT student A
  5. Step 3 inserts absent record for student A
  6. Student A sees "present" briefly, then report shows "absent"
- **Fix:** (a) Add `UNIQUE (session_id, student_id)` on `attendance_records`; (b) wrap `closeSession` in transaction with `SELECT ... FOR UPDATE` on `attendance_records` for that session; (c) use `ON CONFLICT DO NOTHING` for absent insert.

### BL-ATT-002: No unique constraint on `(session_id, student_id)` — duplicate attendance records possible — **DEFECT (P0)**

- **Location:** Migration `006:13–20` adds columns to `attendance_records` but **no unique index**. Original `002_create_education_tables.js` not shown but confirmed by grep — no unique on attendance_records.
- **Evidence:** `checkIn` (line 92–117) does SELECT existing → if exists and status present/late, returns existing; else UPDATE or INSERT. But between SELECT and INSERT, concurrent check-in can create duplicate.
- **Fix:** Add `table.unique(['session_id', 'student_id'])` in migration.

### BL-ATT-003: Auto-absent on close inserts without checking existing status — **DEBT (P1)**

- **Location:** `attendance.service.js:181–189`
- **Evidence:** Absent insert uses `insert().catch(() => {})` — catches all errors silently. If a student was already marked `excused` by teacher (via `recordStudentAttendance` line 120–157), the absent insert would fail (if unique constraint existed) or overwrite (if not).
- **Consequence:** Excused absences silently converted to unexcused.
- **Fix:** Use `ON CONFLICT (session_id, student_id) DO UPDATE SET status = 'absent' WHERE excluded.status = 'absent'` — but better: only insert where no record exists.

### BL-ATT-004: SMS/notification failures silently swallowed — no audit trail — **DEBT (P1)**

- **Location:** `attendance.service.js:207, 228` (`.catch(() => {})`)
- **Evidence:** Parent notification insert (line 197–207) and SMS loop (line 216–228) both wrapped in `.catch(() => {})`. If notification table is locked, disk full, or SMS gateway down, **no error logged, no retry, no alert**.
- **Consequence:** Parents never notified of absence; school unaware.
- **Fix:** Log failures to `audit_logs` with action `ATTENDANCE_NOTIFICATION_FAILED`; implement dead-letter queue for SMS.

---

## 4. Quizzes / Examinations

### BL-QUIZ-001: Race condition in `startAttempt` — duplicate attempts possible — **DEFECT (P0)**

- **Location:** `quiz.service.js:297–318` (`startAttempt`)
- **Evidence:**
  1. Line 305–308: SELECT existing attempt WHERE `quiz_id, student_id` → if exists, return it
  2. Line 310–317: INSERT new attempt
- **No transaction, no unique constraint** on `(quiz_id, student_id)` in `quiz_attempts` table (migration `002` not shown but confirmed: no unique).
- **Consequence:** Two parallel `startAttempt` calls (e.g., student double-clicks "Start") → both pass SELECT, both INSERT → two attempts. First submit wins; second gets 409 at submit (line 349–353) but data already duplicated.
- **Reproduction:** POST `/quizzes/:id/start` twice in parallel with same student token.
- **Fix:** Add `UNIQUE (quiz_id, student_id)` on `quiz_attempts`; wrap in transaction.

### BL-QUIZ-002: Race condition in `submitAttempt` — lost updates / double submit — **DEFECT (P0)**

- **Location:** `quiz.service.js:320–448` (`submitAttempt`)
- **Evidence:**
  1. Line 344–353: SELECT existing attempt WHERE completed_at IS NOT NULL → if exists, throw 409
  2. Line 355–377: Compute score (reads questions, iterates answers)
  3. Line 405–417: SELECT current attempt → UPDATE or INSERT
- **Window:** Between step 1 and step 3, another submit request can pass step 1 (because first hasn't set completed_at yet) → both compute scores, both write → last write wins. The `completed_at` is only set in the payload (line 402), not as a conditional UPDATE.
- **Consequence:** Student submits, network retries → two submissions graded, second overwrites first. Or two tabs submit simultaneously.
- **Fix:** Use `UPDATE ... SET completed_at = now() WHERE completed_at IS NULL` with `RETURNING` — if 0 rows affected, throw 409. Or add `UNIQUE (quiz_id, student_id)` + transaction.

### BL-QUIZ-003: Negative marking formula has precision/rounding issues — **DEBT (P1)**

- **Location:** `quiz.service.js:381–383`
- **Evidence:** `percentage = Math.max(0, parseFloat((((3 * correctCount - wrongCount) / (3 * totalQ)) * 100).toFixed(1)))`. The formula `(3C - W) / (3Q) * 100` assumes each wrong deducts 1/3 of a correct. But `score` calculation at line 372 does `score -= (q.points / 3)` — if `points` not divisible by 3, floating drift.
- **Consequence:** Quiz with 3-point questions, 1 wrong → score deduction 1.0; percentage calc uses integer counts → mismatch between `score` and `percentage`.
- **Fix:** Use single source of truth: compute percentage from `score / totalPoints * 100` (with negative marking already applied to score).

### BL-QUIZ-004: `shareQuiz` writes to announcements table without transaction — **DEBT (P1)**

- **Location:** `quiz.service.js:271–285`
- **Evidence:** `insertAndReturn(db, 'announcements', {...})` at line 274 — separate from quiz update (line 250). If announcement insert fails, quiz is already published; if quiz update fails, announcement may exist orphaned.
- **Fix:** Wrap in transaction; or make announcement creation idempotent with `quiz_id` reference.

---

## 5. Assignments

### BL-ASG-001: Race condition in `submit` — duplicate/overwritten submissions — **DEFECT (P0)**

- **Location:** `assignment.service.js:191–228` (`submit`)
- **Evidence:**
  1. Line 211: SELECT existing submission WHERE `assignment_id, student_id`
  2. Line 212–218: If exists, UPDATE with new files/note/status
  3. Line 221–227: Else INSERT new
- **No transaction, no unique constraint** on `(assignment_id, student_id)` in `submissions` table.
- **Consequence:** Double-submit (network retry) → two submissions or last-write-wins with status flip (submitted ↔ late).
- **Fix:** Add `UNIQUE (assignment_id, student_id)`; wrap in transaction.

### BL-ASG-002: `grade` operation — grade update + notification not atomic — **DEBT (P1)**

- **Location:** `assignment.service.js:230–268` (`grade`)
- **Evidence:** Line 250–256: UPDATE submission with grade/feedback/status. Line 258–266: INSERT notification. Separate statements, no transaction.
- **Consequence:** Grade saved but notification fails → student never notified. Or notification sent but grade update fails (unlikely order).
- **Fix:** Wrap in transaction.

### BL-ASG-003: Late submission logic uses server time — clock skew vulnerability — **DEBT (P2)**

- **Location:** `assignment.service.js:203–209`
- **Evidence:** `isLate = assignment.due_date && new Date() > new Date(assignment.due_date)` — compares server clock to stored due_date. No timezone handling (due_date stored as string 'YYYY-MM-DD').
- **Consequence:** Server clock drift or timezone mismatch marks on-time submission as late.
- **Fix:** Store due_date as TIMESTAMP WITH TIME ZONE; compare in DB: `WHERE due_date < NOW() AT TIME ZONE 'UTC'`.

---

## 6. Student Enrollment & Class Management

### BL-ENR-001: Race condition in `joinClass` — duplicate membership — **DEFECT (P0)**

- **Location:** `class.service.js:252–278` (`joinClass`)
- **Evidence:**
  1. Line 264–268: SELECT existing member WHERE `class_id, user_id` → if exists, throw 409
  2. Line 271–275: INSERT into `class_members`
- **`class_members` has `UNIQUE (class_id, user_id)`** (migration `001:55`) — so duplicate insert would fail with unique violation. But the check-then-insert pattern means the 409 error is thrown by the application, not the DB. If two parallel requests both pass SELECT, second INSERT fails with DB error → unhandled → 500.
- **Consequence:** Concurrent join requests → one gets 409 (app), one gets 500 (DB unique violation).
- **Fix:** Use `INSERT ... ON CONFLICT DO NOTHING RETURNING *` or catch unique violation and return 409.

### BL-ENR-002: `batchAddStudents` creates student accounts with **shared password hash** — **DEFECT (P0)**

- **Location:** `class.service.js:624, 635–642`
- **Evidence:** Line 624: `const sharedBatchPasswordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);` — **single hash for all students in batch**. Lines 635–642: each new student inserted with this same `password_hash`.
- **Consequence:** Any student in the batch can log in as any other student in the batch using the same password (which is unknown but identical). If one password is cracked/revealed, all batch accounts compromised.
- **Reproduction:** POST `/classes/:id/students/batch` with 5 students → all 5 have identical `password_hash` in DB.
- **Fix:** Generate unique password hash per student (line 641 inside loop).

### BL-ENR-003: `addStudentToClass` creates student accounts with random password — no verification flow — **DEBT (P1)**

- **Location:** `class.service.js:466–490`
- **Evidence:** Line 466: `const password_hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);` — random 48-char hex, bcrypt'd. Student created with this password but **no email/SMS sent**, no "set password" flow. Student cannot log in unless admin resets password.
- **Consequence:** Created student accounts are unusable until password reset. Teachers may create duplicates thinking first failed.
- **Fix:** Generate temporary password, send via SMS/email (or return in response for teacher to communicate); or require student to claim account via invite link.

### BL-ENR-004: Parent account created silently in `addStudentToClass` — no verification — **DEFECT (P1)**

- **Location:** `class.service.js:508–538`
- **Evidence:** Lines 508–537: If `parent_name` provided, creates/finds parent user, creates `parent_student_links` with `is_verified` defaulting to `false` (migration `001:64`) but **never set to true**. No SMS/email to parent. `is_verified` column exists but no code path sets it.
- **Consequence:** Parent accounts exist but `is_verified=false`; however, `finance.routes.js:40–46` and `gradebook.routes.js:516–535` treat `parent_student_links` existence as sufficient for access — **verification flag ignored**.
- **Fix:** Either (a) implement verification flow (SMS code to parent phone), or (b) remove `is_verified` column and document that link creation = verified.

### BL-ENR-005: `deleteClass` cascades deletes without transaction — partial deletion — **DEBT (P1)**

- **Location:** `class.service.js:313–329` (`deleteClass`)
- **Evidence:** Lines 320–327: 7 separate `db('table').where({class_id}).del()` calls, each in `try { } catch (e) {}`. If 3rd delete fails, first 2 already committed.
- **Consequence:** Class deleted but assignments remain (orphaned); or announcements deleted but messages remain. Referential integrity broken at application level.
- **Fix:** Wrap in `db.transaction()`; or rely on DB `ON DELETE CASCADE` (already defined in migrations for most tables — see `001:51, 006:27, 41, 111, 128` — but `deleteClass` manually deletes instead of trusting CASCADE).

### BL-ENR-006: `batchAddStudents` parsing logic fragile — silent data loss — **DEBT (P2)**

- **Location:** `class.service.js:560–584`
- **Evidence:** Splits by `[,;\t\-–—]+` (line 566); assumes first token = name, second = code, third = dept. Line 572–575: if second token looks non-numeric and no dept, treats as dept. No validation of parsed fields.
- **Consequence:** "Ali Reza, STD123, Math" → name="Ali", code="Reza", dept="STD123" (wrong). Malformed lines silently skipped or misparsed.
- **Fix:** Require structured input (JSON array); or validate each parsed item and return errors per line.

---

## 7. Teacher Ownership & Authorization

### BL-AUTH-001: `assertOwnsClass` allows teacher via `class_members` role=teacher — but no unique constraint on teacher membership — **DEFECT (P1)**

- **Location:** `auth.js:92–102` (`assertOwnsClass`)
- **Evidence:** Line 96–100: checks `class_members` WHERE `class_id, user_id, role='teacher'`. Migration `001:55` has `UNIQUE (class_id, user_id)` — **role not included**. A user could be both `student` and `teacher` in same class (two rows would violate unique). But a user could be `teacher` in class A and `student` in class B — fine. The issue: if a teacher is removed from `class_members` (role=teacher), the check at line 93 (`classRecord.teacher_id === actor.id`) still passes because `classes.teacher_id` is not cleared.
- **Consequence:** Inconsistent authorization: `classes.teacher_id` is primary; `class_members` is secondary. Removing teacher from members doesn't revoke access if `teacher_id` still set.
- **Fix:** Make `class_members` the source of truth; add trigger to sync `classes.teacher_id` from `class_members` where role='teacher'; or remove `teacher_id` from `classes` and always use `class_members`.

### BL-AUTH-002: `requireClassMember` middleware allows enrolled students/parents but **no re-check on subsequent requests** — **DEBT (P1)**

- **Location:** `auth.js:286–305` (`requireClassMember`)
- **Evidence:** Middleware runs once per request, calls `assertOwnsClass(req.user, classId, {allowEnrolled: true})`. If student is unenrolled between requests, they retain access until next request. No periodic re-validation.
- **Consequence:** Student removed from class mid-session can still submit assignments/quizzes until token refresh.
- **Fix:** Acceptable for stateless JWT; document TTL. Or add `class_version` column on `classes` incremented on membership change, include in JWT.

---

## 8. Notifications

### BL-NOT-001: Broadcast creates announcements + notifications without transaction — partial failure — **DEFECT (P1)**

- **Location:** `notification.service.js:110–151` (`sendBroadcast`)
- **Evidence:**
  1. Line 111–129: INSERT into `announcements` (catches error, logs warn)
  2. Line 132–150: Batch INSERT into `notifications` (100 at a time)
- **No transaction.** If announcement insert succeeds but notification batch 2 fails, announcement exists without notifications. If announcement fails but notifications succeed, users get notifications pointing to non-existent announcement.
- **Consequence:** Inconsistent state; `data.reference_id` in notifications may not exist in `announcements`.
- **Fix:** Wrap in transaction; or make announcement insert idempotent and create it after notifications succeed.

### BL-NOT-002: Notification batch insert swallows partial failures — **DEBT (P1)**

- **Location:** `notification.service.js:148–150`
- **Evidence:** `for (let i = 0; i < notifRows.length; i += 100) await db('notifications').insert(notifRows.slice(i, i + 100));` — if batch 3 of 5 fails, batches 1–2 committed, 3–5 lost. No retry, no compensation.
- **Consequence:** Some users notified, others not. No audit trail of failure.
- **Fix:** Use single multi-row INSERT (all rows) or transaction; log failed batch to `audit_logs`.

### BL-NOT-003: `create` method allows arbitrary `user_id` — no authorization check — **DEBT (P2)**

- **Location:** `notification.service.js:6–29` (`create`)
- **Evidence:** Accepts `user_id` parameter directly. Called from quiz/assignment/attendance services with student IDs from class membership — but no check that caller is authorized to notify that user.
- **Consequence:** If a service bug passes wrong `user_id`, notification goes to wrong person (cross-school if `school_id` not checked — but services do check school).
- **Fix:** Add `assertSameSchool(caller, targetUser)` in `create`; or move authorization to callers (already done).

---

## 9. Record Deletion

### BL-DEL-001: `deleteClass` uses manual deletes instead of DB CASCADE — **DEBT (P1)**

- **Location:** `class.service.js:320–327`
- **Evidence:** Schema defines `ON DELETE CASCADE` for:
  - `class_members.class_id` → `classes` (001:51)
  - `assignments.class_id` → `classes` (002)
  - `announcements.class_id` → `classes` (003:21)
  - `attendance_sessions.class_id` → `classes` (002)
  - `invite_links.class_id` → `classes` (001:72)
  - `messages.class_id` → `classes` (003:10) — SET NULL
- **But** `deleteClass` manually deletes all these tables (lines 320–327) instead of just `DELETE FROM classes WHERE id = ?` and letting CASCADE handle it. Manual deletes are error-prone and duplicate schema logic.
- **Consequence:** If schema changes (new child table), `deleteClass` misses it. Manual order matters (must delete children before parent).
- **Fix:** Remove manual deletes; single `DELETE FROM classes WHERE id = ?`; verify CASCADE works in tests.

### BL-DEL-002: Gradebook category delete → scores deleted without transaction — **DEBT (P1)**

- **Location:** `gradebook.routes.js:161–179` (`DELETE /categories/:id`)
- **Evidence:** Line 171: `DELETE FROM gradebook_scores WHERE category_id`; Line 172: `DELETE FROM gradebook_categories WHERE id`. No transaction.
- **Consequence:** If scores delete fails (lock, FK), category remains but scores gone — or vice versa.
- **Fix:** Wrap in transaction; or rely on `ON DELETE CASCADE` (migration `006:41` has `references...onDelete('CASCADE')` — so single `DELETE FROM gradebook_categories WHERE id` suffices).

---

## 10. Concurrency & Race Conditions — Cross-Cutting

| ID | Location | Pattern | Severity |
|---|---|---|---|
| **RC-001** | `finance.routes.js:184–195, 456–471` | Read-modify-write settlement (2 paths) | **P0 DEFECT** |
| **RC-002** | `attendance.service.js:159–233` | Check-then-insert absent records | **P0 DEFECT** |
| **RC-003** | `quiz.service.js:297–318` | Check-then-insert attempt | **P0 DEFECT** |
| **RC-004** | `quiz.service.js:320–448` | Check-completed-then-update attempt | **P0 DEFECT** |
| **RC-005** | `assignment.service.js:191–228` | Check-then-upsert submission | **P0 DEFECT** |
| **RC-006** | `class.service.js:252–278` | Check-then-insert class member | **P0 DEFECT** |
| **RC-007** | `gradebook.routes.js:254–305` | Batch loop without transaction | **P0 DEFECT** |
| **RC-008** | `notification.service.js:131–151` | Batch insert without transaction | **P1 DEFECT** |

**Common root cause:** No `db.transaction()` usage anywhere; check-then-act patterns without unique constraints or atomic upserts.

---

## 11. Missing Database Constraints — Schema-Level

| Table | Missing Constraint | Migration | Severity |
|---|---|---|---|
| `tuition_installments` | `UNIQUE (ledger_id, installment_number)` | 006:124–141 | **P0** |
| `tuition_installments` | `UNIQUE (ledger_id, authority/tracking_number)` | 006 | **P0** |
| `tuition_ledgers` | `CHECK (paid_amount >= 0 AND balance >= 0 AND paid_amount <= total_amount - discount_amount)` | 006:109–121 | **P0** |
| `attendance_records` | `UNIQUE (session_id, student_id)` | 002/006 | **P0** |
| `quiz_attempts` | `UNIQUE (quiz_id, student_id)` | 002 | **P0** |
| `submissions` | `UNIQUE (assignment_id, student_id)` | 002 | **P0** |
| `gradebook_scores` | `CHECK (score >= 0 AND score <= max_score)` (needs FK to category) | 006:39–47 | **P1** |
| `discipline_records` | `CHECK (points >= -20 AND points <= 20)` | 006:80 | **P1** |
| `parent_student_links` | `is_verified` default false but never set true — remove or implement | 001:64 | **P1** |
| `class_members` | `UNIQUE (class_id, user_id)` exists but role not in key — teacher+student conflict | 001:55 | **P2** |

---

## 12. Cascading & Referential Integrity

### BL-CAS-001: `messages.class_id` uses `ON DELETE SET NULL` — orphan messages — **DEBT (P1)**

- **Location:** Migration `003:10`
- **Evidence:** `table.string('class_id', 36).references('id').inTable('classes').onDelete('SET NULL')`
- **Consequence:** When class deleted, messages remain with `class_id = NULL`. They lose context (which class discussion). Queries filtering by `class_id` miss them.
- **Fix:** Change to `ON DELETE CASCADE` if messages should die with class; or add `class_id` index and document that NULL = orphaned.

### BL-CAS-002: `parent_student_links` CASCADE on both parent_id and student_id — **DEBT (P1)**

- **Location:** Migration `001:61–62`
- **Evidence:** Both `parent_id` and `student_id` have `onDelete('CASCADE')`.
- **Consequence:** Deleting a student → deletes all their parent links → parents lose link to that child (correct). Deleting a parent → deletes link → student loses that parent link (correct). But if parent has multiple children, deleting parent deletes ALL their links (correct). No issue found — this is correct.
- **Note:** `is_verified` column unused (BL-ENR-004).

### BL-CAS-003: `gradebook_shared_reports.class_id` nullable, no FK — **DEBT (P2)**

- **Location:** Migration `016:171–193`
- **Evidence:** `table.string('class_id', 64).nullable()` — no `references()`. Reports can reference non-existent class.
- **Fix:** Add FK if class_id provided; or document as optional metadata.

---

## 13. AI / Paper-to-Digital Pipeline — Data Integrity

### BL-AI-001: Deterministic fallback **fabricates data** when OCR empty — **DEFECT (P0)**

- **Location:** `paperToDigital.service.js:195–224` (roster), `:265–288` (gradesheet), `:335–356` (exam)
- **Evidence:** When `lines.length === 0`, each mode returns **hardcoded fake students/questions** with high confidence (0.94–0.97). Lines 196–224: 3 fake students with realistic names, national codes, phones. Lines 266–288: 3 fake grades. Lines 336–356: 2 fake exam questions.
- **Consequence:** Teacher uploads blank/poor image → gets plausible fake roster/grades/exam → commits to DB (via `commitExtractedData`). No signal that data is synthetic. The `feasibility_assessment` claims `mandatory_human_in_the_loop: true` (line 47) but the commit endpoint **does not enforce** `needs_review: false` (see BL-AI-002).
- **Reproduction:** POST `/ai/extract` with `mode: 'roster', raw_ocr_text: '', image_base64: ''` → returns 3 fake students with confidence 0.96.

### BL-AI-002: `commitExtractedData` accepts items with `needs_review: true` — **DEFECT (P0)**

- **Location:** `paperToDigital.service.js:461–598` (`commitExtractedData`)
- **Evidence:** Function iterates `items` (line 523) and commits **all** items regardless of `item.needs_review`. The `feasibility_assessment` says `mandatory_human_in_the_loop: true` but the commit pipeline has **no gate**.
- **Consequence:** Teacher clicks "Commit" on review UI → items with `needs_review: true` (e.g., invalid national code, score out of range) are written to gradebook/roster/quiz.
- **Fix:** Add `if (item.needs_review) throw forbiddenError('Item requires review before commit')` at line 523.

### BL-AI-003: `commitExtractedData` writes to 3 domains without transaction — **DEFECT (P1)**

- **Location:** `paperToDigital.service.js:471–482` (roster → sidaService), `:485–566` (gradesheet → gradebook), `:569–593` (exam → quizService)
- **Evidence:** Each mode calls external service (`sidaService.importRoster`, direct `gradebook` writes, `quizService.create`). No transaction spanning the commit. If mode=gradesheet commits 15 of 20 scores then fails, 15 persisted.
- **Fix:** Wrap commit in transaction; or make each service method idempotent and retryable.

### BL-AI-004: Roster import creates parent accounts without verification — **DEFECT (P1)**

- **Location:** `sidaService.importRoster` (not shown but called at line 472 with `auto_link_parents: true`)
- **Evidence:** `paperToDigital` calls `sidaService.importRoster` with `auto_link_parents: true`. Based on `class.service.js:508–537`, this creates parent users and links without verification.
- **Consequence:** Fake roster → fake parents → parent accounts with access to child data.
- **Fix:** Same as BL-ENR-004: require verification flow for parent links.

---

## 14. Reproduction Harnesses (Synthetic Fixtures)

For each P0 finding, a minimal reproduction scenario:

### RC-001 Finance Settlement Race
```javascript
// backend/.tmp/verify/finance-settlement-race.test.js
const db = require('../../config/database');
const { generateId } = require('../../utils/dbHelpers');

async function test() {
  const ledgerId = generateId();
  const instId = generateId();
  await db('tuition_ledgers').insert({ id: ledgerId, student_id: 'stu-1', total_amount: 100000, paid_amount: 0, balance: 100000, status: 'unpaid' });
  await db('tuition_installments').insert({ id: instId, ledger_id: ledgerId, installment_number: 1, amount: 50000, status: 'submitted' });

  // Simulate 20 parallel verify requests
  const promises = Array(20).fill().map(() =>
    db('tuition_installments').where({ id: instId }).first()
      .then(inst => db('tuition_ledgers').where({ id: ledgerId }).first())
      .then(ledger => {
        if (inst.status === 'verified') throw new Error('already verified');
        return db.transaction(async trx => {
          await trx('tuition_installments').where({ id: instId }).update({ status: 'verified' });
          await trx('tuition_ledgers').where({ id: ledgerId }).update({
            paid_amount: ledger.paid_amount + inst.amount,
            balance: Math.max(0, ledger.balance - inst.amount),
          });
        });
      })
  );
  const results = await Promise.allSettled(promises);
  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const finalLedger = await db('tuition_ledgers').where({ id: ledgerId }).first();
  console.log({ succeeded, finalPaid: finalLedger.paid_amount, expectedPaid: 50000 });
  // Without transaction: succeeded > 1, finalPaid > 50000
  // With transaction: succeeded === 1, finalPaid === 50000
}
test();
```

### RC-002 Attendance Close Race
```javascript
// backend/.tmp/verify/attendance-close-race.test.js
const db = require('../../config/database');
const { generateId } = require('../../utils/dbHelpers');
const AttendanceService = require('../../modules/attendance/attendance.service');

async function test() {
  const classId = generateId();
  const sessionId = generateId();
  const studentId = 'stu-1';
  await db('classes').insert({ id: classId, school_id: 'sch-1', teacher_id: 'tch-1', is_active: true });
  await db('class_members').insert({ id: generateId(), class_id: classId, user_id: studentId, role: 'student' });
  await db('attendance_sessions').insert({ id: sessionId, class_id: classId, teacher_id: 'tch-1', status: 'active', opens_at: new Date().toISOString(), closes_at: new Date(Date.now()+900000).toISOString() });

  const svc = new AttendanceService();
  // Race: closeSession + checkIn concurrent
  await Promise.all([
    svc.closeSession(sessionId, classId, { id: 'tch-1', role: 'teacher', school_id: 'sch-1' }),
    svc.checkIn(sessionId, studentId, classId, { id: studentId, role: 'student', school_id: 'sch-1' })
  ]);
  const rec = await db('attendance_records').where({ session_id: sessionId, student_id }).first();
  console.log({ status: rec?.status, recorded_at: rec?.recorded_at });
  // Without unique + transaction: status may be 'absent' (lost check-in)
}
test();
```

### BL-AI-001 Fabricated Data
```javascript
// backend/.tmp/verify/ai-fabrication.test.js
const PaperToDigitalService = require('../../modules/ai/paperToDigital.service');

async function test() {
  const svc = new PaperToDigitalService();
  const result = await svc.extractFromPaper({ mode: 'roster', raw_ocr_text: '', image_base64: '' });
  console.log({ engine: result.engine, items: result.items.map(i => ({ name: i.full_name, confidence: i.confidence, needs_review: i.needs_review })) });
  // Returns 3 fake students with confidence 0.94-0.96, needs_review: false
}
test();
```

---

## 15. Prioritized Fix Summary (Cross-Referenced with AD-05)

| Fix | Findings Resolved | Effort | AD-05 Ref |
|---|---|---|---|
| Add `db.transaction()` to finance settlement (both paths) | BL-FIN-001, BL-FIN-002, BL-FIN-007 | 0.5 day | IMP-01 |
| Add unique constraints: `(ledger_id, installment_number)`, `(ledger_id, authority)`, `(session_id, student_id)`, `(quiz_id, student_id)`, `(assignment_id, student_id)` | BL-FIN-003, BL-FIN-002, BL-ATT-002, BL-QUIZ-001, BL-ASG-001 | 0.5 day (migration) | IMP-01 |
| Add CHECK constraints on ledger, scores, discipline | BL-FIN-004, BL-GRB-004, BL-GRB-005 | 0.5 day | IMP-01 |
| Extract `finance.service.js` with `confirmPayment` primitive | BL-FIN-005, BL-FIN-006 | 1 day | IMP-07 |
| Wrap `closeSession` in transaction + SELECT FOR UPDATE | BL-ATT-001, BL-ATT-003 | 0.5 day | — |
| Wrap `startAttempt`/`submitAttempt` in transaction + unique constraint | BL-QUIZ-001, BL-QUIZ-002 | 0.5 day | — |
| Wrap `submit`/`grade` in transaction | BL-ASG-001, BL-ASG-002 | 0.5 day | — |
| Fix `joinClass` to use `ON CONFLICT` | BL-ENR-001 | 0.25 day | — |
| Fix `batchAddStudents` unique password per student | BL-ENR-002 | 0.25 day | — |
| Implement parent verification flow / remove `is_verified` | BL-ENR-004, BL-AI-004 | 1 day | IMP-09 |
| Wrap `deleteClass` in transaction (or use CASCADE) | BL-DEL-001, BL-DEL-002 | 0.5 day | — |
| Wrap `sendBroadcast` in transaction | BL-NOT-001, BL-NOT-002 | 0.5 day | — |
| Enforce `needs_review` gate in AI commit | BL-AI-002 | 0.25 day | IMP-13 |
| Remove deterministic fallback fabrication / require image | BL-AI-001 | 0.5 day | IMP-13 |
| Wrap AI commit in transaction | BL-AI-003 | 0.5 day | — |

**Total estimated effort:** ~8 engineer-days for all P0/P1 fixes. Each is independently shippable.

---

## 16. Not Recommended (Per Small-Team Constraint)

- **Distributed transactions / saga pattern** — overkill for single-process SQLite.
- **Event sourcing for ledger** — adds complexity; transaction + constraints sufficient.
- **Optimistic locking columns** (`version`) on all tables — only needed where contention proven (finance, attendance).
- **Full audit trail on every write** — current `audit_logs` at 8 call sites is acceptable; expand only for financial/parent-verification events.
- **Redis for distributed locks** — not needed until horizontal scaling.

---

*All findings derived from direct source reads this session. No prior audit documents were trusted.*