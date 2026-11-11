# EduConnect Business Logic Assessment — Independent Investigation

**Audit Date:** 2026-11-11  
**Commit:** `838b5b2` (main)  
**Scope:** Complete workflow correctness — finance, grades, attendance, exams, assignments, enrollment, notifications, AI, deletion, concurrency

---

## Executive Summary

**Business Logic Integrity:** **LOW** — Multiple critical workflow failures, race conditions, missing validations  
**Financial Integrity:** **CRITICAL** — No transactions, double-charge possible, no reconciliation  
**Academic Integrity:** **HIGH RISK** — Grade tampering possible, no audit trail, AI bypasses review  
**Enrollment Integrity:** **HIGH RISK** — Race conditions, unverified parent links, shared passwords  
**Workflow Completeness:** **PARTIAL** — Several features appear implemented but don't function end-to-end

---

## 1. Financial Transactions & Tuition Management

### Critical Failures

#### BL-FIN-001: Finance Settlement — No Transactions (Race Condition)
**Location:** `backend/src/modules/finance/finance.routes.js:184-195` (verify-installment), `:456-471` (callback-verify)  
**Code Pattern:**
```javascript
const installment = await db('tuition_installments').where('id', id).first();
const ledger = await db('tuition_ledgers').where('id', installment.ledger_id).first();
// ... compute newPaid, newBalance ...
await db('tuition_installments').where('id', id).update({ status: 'verified', ... });
await db('tuition_ledgers').where('id', ledger.id).update({ paid_amount: newPaid, balance: newBalance });
```
**Failure Mode:** Two concurrent requests for same installment:
1. Both read `ledger.paid_amount = 0`, `balance = 1000000`, `amount = 500000`
2. Both compute `newPaid = 500000`, `newBalance = 500000`
3. Both write → ledger shows `paid_amount = 500000` (should be 1000000), `balance = 500000` (should be 0)
4. Two receipts sent, two SMS sent, parent charged twice

**Evidence:** Zero `db.transaction()` calls in entire codebase (`grep -r "\.transaction(" backend/src` → 0).  
**Consequence:** Financial loss, parent disputes, audit failure.  
**Remediation:** Wrap in `db.transaction(async trx => { ... })`.

#### BL-FIN-002: Missing Idempotency Keys on Settlement
**Location:** `finance.routes.js:184-195` (verify-installment), `:410-471` (callback-verify)  
**Issue:** No unique constraint on `(ledger_id, authority)` or `(ledger_id, tracking_number)`.  
**Failure Mode:** Retry (network glitch, user double-click) → duplicate settlement. Status check (`installment.status === 'verified'`) is separate from write → race window.  
**Remediation:** Add `UNIQUE (ledger_id, authority)` + `UNIQUE (ledger_id, tracking_number)` + transaction.

#### BL-FIN-003: Missing Financial Constraints
**Location:** Migration `006_create_enterprise_school_modules.js:109-141`  
**Missing:**
- `CHECK (paid_amount >= 0 AND balance >= 0 AND paid_amount <= total_amount - discount_amount)`
- `UNIQUE (ledger_id, installment_number)` — duplicate installments possible
- `UNIQUE (ledger_id, authority)` — replay protection
- `CHECK (status IN ('unpaid','partial','settled'))`

**Consequence:** Direct DB edits or bugs can leave ledger in invalid state (negative balance, overpaid).  
**Remediation:** Add constraints in migration.

#### BL-FIN-004: Teacher Access to Student Financial Data
**Location:** `finance.routes.js:19-90` (`GET /finance/ledger`)  
**Code:** `assertTeacherOfStudent(req.user, studentId)` allows teacher to view any student's ledger in their class.  
**Issue:** Teachers (not financial officers) can view full financial details — total amount, discounts, balance, installment details, receipt URLs.  
**Violation:** Segregation of duties — teachers should not access financial data.  
**Remediation:** Restrict to `financial_officer`, `accountant`, `admin`, `manager`.

#### BL-FIN-005: Receipt URLs Exposed Without Expiration
**Location:** `finance.routes.js:134` (`receipt_url` stored), `finance/page.js:793-892` (Shaparak modal)  
**Issue:** Receipt URLs stored permanently, no expiration, accessible by anyone with URL.  
**Risk:** Sensitive banking info (tracking numbers, bank names) exposed.  
**Remediation:** Signed URLs with expiration, per-file ACL.

#### BL-FIN-006: Sheba (IBAN) Validation Logs Full IBAN
**Location:** `finance.routes.js:219-238` (`POST /finance/validate-sheba`)  
**Issue:** Full IBAN in request/response, may appear in logs.  
**Remediation:** Mask in logs, validate client-side, don't store.

---

## 2. Academic Records & Grading

### Critical Failures

#### BL-GRD-001: Gradebook Batch Upsert — No Transaction
**Location:** `backend/src/modules/gradebook/gradebook.routes.js:254-305` (`POST /scores/batch`)  
**Code Pattern:**
```javascript
for (const item of scores) {
  const category = await db('gradebook_categories').where({ id: category_id }).first();
  await assertOwnsClass(req.user, category.class_id);
  await assertTeacherOfStudent(req.user, student_id);
  // ... UPDATE or INSERT gradebook_scores ...
}
```
**Failure Mode:** 30 scores submitted, item 15 fails (network, validation) → first 14 committed, 16-30 lost. Teacher sees "success" for all.  
**Remediation:** Wrap in `db.transaction()`.

#### BL-GRD-002: Grade Overwrites Without History
**Location:** `gradebook.routes.js:219-235` (`POST /scores`)  
**Code:** `UPDATE gradebook_scores SET score=..., graded_at=NOW()` — overwrites previous score.  
**Audit:** Only `previous_score` logged in `audit_logs` (8 call sites total).  
**Risk:** Grade tampering undetectable if audit log purged. No immutable transcript.  
**Remediation:** `gradebook_score_history` table with immutable inserts.

#### BL-GRD-003: Weighted Average Float Precision Drift
**Location:** `gradebook.routes.js:85-105`, `gradebook.routes.js:592-637` (report card)  
**Code:**
```javascript
weightedSum += score * (cat.weight || 1.0);
totalWeight += (cat.weight || 1.0);
weightedAverage = (weightedSum / totalWeight).toFixed(2);
```
**Issue:** Float arithmetic → 17.999999 vs 18.00. Different iteration order = different result.  
**Remediation:** Integer arithmetic (score × 100) or `decimal.js`.

#### BL-GRD-004: No Weight Validation
**Location:** Migration `006:29` — `weight` default 1.0, no `CHECK (weight > 0)`.  
**Risk:** Weight = 0 → division by zero (guarded at line 98 but returns null). Weight negative → inverted logic.  
**Remediation:** `CHECK (weight > 0)`.

#### BL-GRD-005: Discipline Points Unbounded
**Location:** Migration `006:80` — `points` float, no bounds.  
**Code:** `gradebook.routes.js:639-644` — `disciplineScore += d.points`, clamped 0-20 at end.  
**Risk:** Single record with `points = -1000` → negative discipline score.  
**Remediation:** `CHECK (points BETWEEN -20 AND 20)`.

#### BL-GRD-006: Report Card Includes Discipline Without Consent
**Location:** `gradebook.routes.js:639-644`  
**Issue:** Discipline records (warnings, deductions) included in academic report without separate consent.  
**Risk:** Sensitive behavioral data exposed to parents without context.  
**Remediation:** Separate discipline report, explicit inclusion opt-in.

#### BL-GRD-007: No Grade Freeze / Term Closure
**Issue:** Teachers can modify grades indefinitely. No "term closed" flag.  
**Risk:** Retroactive grade changes after report cards issued.  
**Remediation:** Term lock flag, grade freeze workflow.

---

## 3. Attendance Management

### Critical Failures

#### BL-ATT-001: Close Session Race Condition
**Location:** `backend/src/modules/attendance/attendance.service.js:159-233` (`closeSession`)  
**Code Pattern:**
```javascript
const classMembers = await db('class_members').where({ class_id, role: 'student' });
const checkedIn = await db('attendance_records').where({ session_id }).select('student_id');
// ... compute absentStudentIds = classMembers - checkedIn ...
await db('attendance_records').insert(absentRecords);
```
**Race Window:** Student checks in between `checkedIn` SELECT and `absentRecords` INSERT → marked absent despite check-in.  
**Missing:** `UNIQUE (session_id, student_id)` — duplicate records possible.  
**Remediation:** Transaction + `SELECT ... FOR UPDATE` + `ON CONFLICT DO NOTHING`.

#### BL-ATT-002: Auto-Absent Overwrites Excused Status
**Location:** `attendance.service.js:181-189`  
**Code:** `absentRecords` inserted with `status: 'absent'` via `.catch(() => {})` — silent failure.  
**Risk:** Teacher marks student `excused` before close → auto-absent overwrites (no unique constraint).  
**Remediation:** `ON CONFLICT (session_id, student_id) DO UPDATE SET status='absent' WHERE excluded.status='absent'`.

#### BL-ATT-003: Silent SMS/Notification Failures
**Location:** `attendance.service.js:191-229` — `.catch(() => {})` on notifications and SMS.  
**Impact:** Parents never notified of absence. School unaware of failure.  
**Remediation:** Log failures to `audit_logs`, implement dead-letter queue.

#### BL-ATT-004: Session Duration Not Enforced Server-Side on Check-In
**Location:** `attendance.service.js:75-82`  
**Code:** Checks `session.closes_at` but only if `status === 'active'`.  
**Gap:** If teacher extends session, student can check in after original close time.  
**Remediation:** Always enforce `closes_at` boundary.

---

## 4. Quizzes & Examinations

### Critical Failures

#### BL-QUIZ-001: Start Attempt Race Condition
**Location:** `backend/src/modules/quizzes/quiz.service.js:297-318` (`startAttempt`)  
**Code Pattern:**
```javascript
const existing = await db('quiz_attempts').where({ quiz_id, student_id }).first();
if (existing) return existing;
return insertAndReturn(db, 'quiz_attempts', { ... });
```
**Missing:** `UNIQUE (quiz_id, student_id)` — duplicate attempts possible.  
**Race:** Double-click "Start" → two attempts created. First submit wins, second gets 409 but data already duplicated.  
**Remediation:** Add unique constraint + transaction.

#### BL-QUIZ-002: Submit Attempt Race Condition
**Location:** `quiz.service.js:320-448` (`submitAttempt`)  
**Code Pattern:**
```javascript
const existing = await db('quiz_attempts').where({ quiz_id, student_id }).whereNotNull('completed_at').first();
if (existing) throw 409;
// ... compute score ...
await db('quiz_attempts').where({ id: currentAttempt.id }).update({ completed_at: now(), ... });
```
**Race Window:** Two parallel submits → both pass `existing` check → both compute score → last write wins.  
**Missing:** Atomic claim (`UPDATE ... SET completed_at=now() WHERE completed_at IS NULL RETURNING *`).  
**Remediation:** Atomic claim + transaction.

#### BL-QUIZ-003: Quiz Timer Enforced Only in Frontend
**Location:** `frontend/src/app/dashboard/quizzes/page.js:197-221`  
**Code:** `useEffect` countdown → auto-submit at 0.  
**Backend:** `quiz.service.js:300-318` (`startAttempt`) records `started_at` but **submit does not validate elapsed time**.  
**Exploit:** Student disables JS, takes 3 hours on 30-min quiz → backend accepts.  
**Remediation:** Server-side validation: `NOW() > started_at + duration_minutes * 60`.

#### BL-QUIZ-004: Quiz Share Creates Announcement Without Transaction
**Location:** `quiz.service.js:237-295` (`shareQuiz`)  
**Code:** Updates quiz + inserts notifications + inserts announcement — **no transaction**.  
**Failure Mode:** Quiz published, notification sent, announcement insert fails → inconsistent state.  
**Remediation:** Wrap in transaction.

#### BL-QUIZ-005: Negative Marking Formula Mismatch
**Location:** `quiz.service.js:381-383`  
**Code:**
```javascript
percentage = Math.max(0, parseFloat((((3 * correctCount - wrongCount) / (3 * totalQ)) * 100).toFixed(1)));
```
**But:** Score calc at line 372: `score -= (q.points / 3)` — if points not divisible by 3, float drift.  
**Remediation:** Single source of truth — compute percentage from final score.

---

## 5. Assignments

### Critical Failures

#### BL-ASG-001: Submission Race Condition
**Location:** `backend/src/modules/assignments/assignment.service.js:191-228` (`submit`)  
**Code Pattern:**
```javascript
const existing = await db('submissions').where({ assignment_id, student_id }).first();
if (existing) return updateAndReturn(...);
return insertAndReturn(...);
```
**Missing:** `UNIQUE (assignment_id, student_id)` — duplicate submissions possible.  
**Race:** Double-click submit → two submissions or last-write-wins.  
**Remediation:** Unique constraint + transaction.

#### BL-ASG-002: Grade + Notification Not Atomic
**Location:** `assignment.service.js:230-268` (`grade`)  
**Code:** UPDATE submission → INSERT notification — separate statements.  
**Risk:** Grade saved, notification fails → student never notified.  
**Remediation:** Transaction.

#### BL-ASG-003: Late Submission Logic Uses Server Clock
**Location:** `assignment.service.js:203-209`  
**Code:** `isLate = assignment.due_date && new Date() > new Date(assignment.due_date)`  
**Issue:** Server clock drift, no timezone handling (due_date stored as string).  
**Remediation:** Store due_date as TIMESTAMP WITH TIME ZONE, compare in DB.

---

## 6. Student Enrollment & Class Management

### Critical Failures

#### BL-ENR-001: Join Class Race Condition
**Location:** `backend/src/modules/classes/class.service.js:252-278` (`joinClass`)  
**Code Pattern:**
```javascript
const existingMember = await db('class_members').where({ class_id, user_id }).first();
if (existingMember) throw 409;
await insertAndReturn(db, 'class_members', { class_id, user_id, role });
```
**Missing:** `UNIQUE (class_id, user_id)` — exists at migration 001:55 ✅  
**But:** Check-then-insert → second request gets DB unique violation → 500 error (not caught).  
**Remediation:** `INSERT ... ON CONFLICT DO NOTHING RETURNING *` or catch unique violation → 409.

#### BL-ENR-002: Batch Add Students — Shared Password Hash
**Location:** `class.service.js:624, 635-642` (`batchAddStudents`)  
**Code:**
```javascript
const sharedBatchPasswordHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
// ... inside loop ...
studentUser = await insertAndReturn(db, 'users', { ..., password_hash: sharedBatchPasswordHash });
```
**Critical:** **All students in batch get IDENTICAL password hash.**  
**Impact:** Any student in batch can log in as any other student in batch.  
**Remediation:** Generate unique hash per student (move inside loop).

#### BL-ENR-003: Add Student Creates Account with Random Password — No Verification
**Location:** `class.service.js:466-490` (`addStudentToClass`)  
**Code:** Generates random 48-char hex password, hashes with bcrypt. Student created but **no email/SMS sent**, no "set password" flow.  
**Consequence:** Student account unusable until admin resets password. Teacher may create duplicates.  
**Remediation:** Generate temporary password, send via SMS/email, or require student to claim via invite link.

#### BL-ENR-004: Parent Account Created Without Verification
**Location:** `class.service.js:508-538`  
**Code:** Creates parent user, inserts `parent_student_links` with `is_verified: false` (default).  
**Gap:** `is_verified` never set to true. `auth.js:117-124` allows access via `student_code` match ignoring `is_verified`.  
**Remediation:** Implement verification flow (SMS code to parent phone), require `is_verified=true`.

#### BL-ENR-005: Delete Class Bypasses CASCADE
**Location:** `class.service.js:313-329` (`deleteClass`)  
**Code:** 7 manual `DELETE` statements in `try/catch` — **not in transaction**.  
**Schema:** Most FKs have `ON DELETE CASCADE` (migrations 001, 002, 003, 006).  
**Issue:** Manual deletes bypass CASCADE, order-dependent, error-prone. If 3rd delete fails, first 2 committed.  
**Remediation:** Single `DELETE FROM classes WHERE id = ?` + trust CASCADE.

#### BL-ENR-006: Batch Add Parsing Fragile
**Location:** `class.service.js:560-584`  
**Code:** Splits by `[,;\t\-–—]+`, assumes first token=name, second=code, third=dept.  
**Failure:** "Ali Reza, STD123, Math" → name="Ali", code="Reza", dept="STD123".  
**Remediation:** Require structured JSON input, validate per-line, return per-line errors.

---

## 7. Notifications & Communication

### Critical Failures

#### BL-NOT-001: Broadcast Creates Announcement + Notifications Without Transaction
**Location:** `backend/src/modules/notifications/notification.service.js:110-151` (`sendBroadcast`)  
**Code:**
```javascript
await db('announcements').insert({ ... }); // line 111-129
// ... batch insert notifications (lines 131-150)
```
**Failure Mode:** Announcement succeeds, notification batch 3/5 fails → announcement without notifications.  
**Remediation:** Transaction.

#### BL-NOT-002: Notification Batch Insert Swallows Partial Failures
**Location:** `notification.service.js:148-150`  
**Code:** `for (let i = 0; i < notifRows.length; i += 100) await db('notifications').insert(...)`  
**Issue:** Batch 3 of 5 fails → batches 1-2 committed, 3-5 lost. No retry, no compensation.  
**Remediation:** Single multi-row INSERT or transaction with compensation.

#### BL-NOT-003: `create` Allows Arbitrary `user_id`
**Location:** `notification.service.js:6-29` (`create`)  
**Issue:** Accepts `user_id` parameter directly. Called from services with student IDs from class membership — but no check that caller authorized to notify that user.  
**Risk:** If bug passes wrong `user_id`, notification goes to wrong person (cross-school if school_id not checked).  
**Mitigation:** Services already check school, but `create` should enforce.

---

## 8. Record Deletion

### Critical Failures

#### BL-DEL-001: Delete Class Bypasses CASCADE (see BL-ENR-005)
**Location:** `class.service.js:313-329`  
**Issue:** 7 manual DELETEs instead of trusting CASCADE.

#### BL-DEL-002: Gradebook Category Delete Without Transaction
**Location:** `gradebook.routes.js:161-179` (`DELETE /categories/:id`)  
**Code:**
```javascript
await db('gradebook_scores').where('category_id', id).del();
await db('gradebook_categories').where('id', id).del();
```
**Migration 006:41** has `ON DELETE CASCADE` on `gradebook_scores.category_id` — single DELETE sufficient.  
**Risk:** If scores DELETE fails (lock, FK), category remains but scores gone.

---

## 9. Concurrency & Race Conditions (Cross-Cutting)

| ID | Location | Pattern | Severity |
|---|---|---|---|
| **RC-001** | `finance.routes.js:184-195, 456-471` | Read-modify-write settlement (2 paths) | **P0** |
| **RC-002** | `attendance.service.js:159-233` | Check-then-insert absent records | **P0** |
| **RC-003** | `quiz.service.js:297-318` | Check-then-insert attempt | **P0** |
| **RC-004** | `quiz.service.js:320-448` | Check-completed-then-update attempt | **P0** |
| **RC-005** | `assignment.service.js:191-228` | Check-then-upsert submission | **P0** |
| **RC-006** | `class.service.js:252-278` | Check-then-insert class member | **P0** |
| **RC-007** | `gradebook.routes.js:254-305` | Batch loop without transaction | **P0** |
| **RC-008** | `notification.service.js:131-151` | Batch insert without transaction | **P1** |

**Root Cause:** Zero `db.transaction()` usage. Check-then-act without unique constraints or atomic operations.

---

## 10. AI / Paper-to-Digital Pipeline

### Critical Failures

#### BL-AI-001: Deterministic Fallback Fabricates Data
**Location:** `paperToDigital.service.js:195-224` (roster), `:265-288` (gradesheet), `:335-356` (exam)  
**Code:** `if (lines.length === 0) return [FAKE_DATA]` — returns 3 hardcoded students with realistic names, national codes, phones, high confidence (0.94-0.97).  
**Impact:** Teacher uploads blank/poor image → gets plausible fake roster → commits to DB.  
**Evidence:** `feasibility_assessment.mandatory_human_in_the_loop: true` (line 47) but commit ignores it.

#### BL-AI-002: Commit Accepts `needs_review: true` Items
**Location:** `paperToDigital.service.js:461-598` (`commitExtractedData`)  
**Code:** Line 523: `for (const item of items)` — **no check for `item.needs_review`**.  
**Impact:** Items flagged "needs review" (invalid national code, score out of range) committed to gradebook/roster/quiz.  
**Fix:** `if (item.needs_review) throw forbiddenError('Item requires review before commit')`.

#### BL-AI-003: AI Commit Writes to 3 Domains Without Transaction
**Location:** `paperToDigital.service.js:471-482` (roster), `:485-566` (gradesheet), `:569-593` (exam)  
**Code:** Calls `sidaService.importRoster()`, direct `gradebook` writes, `quizService.create()` — **no transaction**.  
**Failure Mode:** 15 of 20 scores committed, then quiz creation fails → partial commit.  
**Remediation:** Wrap in transaction or make each service idempotent with compensation.

#### BL-AI-004: Roster Import Creates Unverified Parents
**Location:** `paperToDigital.service.js:471-482` → `sidaService.importRoster(..., auto_link_parents: true)`  
**Evidence:** `class.service.js:508-537` creates parent with `is_verified: true` but **no verification flow**.  
**Impact:** Fake roster → fake parents → parent accounts with access to child data.

---

## Summary: Business Logic Integrity Scorecard

| Domain | Score | Critical Issues |
|---|---|---|
| **Finance** | 2/10 | No transactions, no idempotency, missing constraints, teacher access |
| **Grades** | 3/10 | No transactions, no history, float drift, no weight validation |
| **Attendance** | 4/10 | Race condition, excused overwrite, silent failures |
| **Quizzes** | 3/10 | Race conditions, frontend-only timer, share without transaction |
| **Assignments** | 4/10 | Race condition, non-atomic grade+notify, timezone issues |
| **Enrollment** | 3/10 | Race, shared passwords, unverified parents, bypasses CASCADE |
| **Notifications** | 4/10 | No transaction, partial failures, arbitrary user_id |
| **Deletion** | 4/10 | Manual deletes bypass CASCADE, no transaction |
| **Concurrency** | 1/10 | 8 race conditions, zero transactions |
| **AI Pipeline** | 2/10 | Fabricates data, ignores review gate, no transaction, unverified parents |

**Overall Business Logic Integrity: 2.9/10 — NOT PRODUCTION READY**

---

*Assessment based on static code analysis of commit `838b5b2`. No runtime testing performed. All findings traced to source lines.*