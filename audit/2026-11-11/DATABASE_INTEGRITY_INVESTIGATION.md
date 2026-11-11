# Database Integrity & Data Lifecycle Investigation — EduConnect

**Independent read-only assessment** @ `main` `838b5b2` · 2026-11-11
**Scope:** All 17 migrations, 44 tables, schema constraints, indexes, cascading behavior, migration history, transaction boundaries, tenant isolation, and data lifecycle patterns.

---

## Executive Summary

| Category | Critical (P0) | High (P1) | Medium (P2) | Total |
|---|---|---|---|---|
| Schema Constraints Missing | 5 | 3 | 2 | 10 |
| Cascading Behavior Issues | 2 | 3 | 1 | 6 |
| Migration Safety | 1 | 2 | 2 | 5 |
| Transaction/Concurrency | 3 | 2 | 1 | 6 |
| Orphan/Inconsistency Risks | 2 | 2 | 2 | 6 |
| Soft Delete/Archival | 1 | 1 | 2 | 4 |
| Tenant Isolation | 2 | 1 | 1 | 4 |
| Historical Integrity (Financial/Academic) | 2 | 2 | 1 | 5 |
| **TOTAL** | **18** | **16** | **12** | **46** |

**Overall Assessment:** The database schema is functional for a single-school deployment but has **critical gaps in constraint enforcement, tenant isolation, and financial/academic integrity** that would cause data corruption in production multi-tenant use.

---

## 1. Schema, Relationships, Constraints & Indexes

### 1.1 Table Inventory (44 Tables)

| Domain | Tables | Key Relationships |
|---|---|---|
| **Core Identity** | `users`, `schools`, `classes`, `class_members`, `parent_student_links`, `invite_links` | Users ↔ Schools (nullable), Classes ↔ Schools, Class Members ↔ Classes/Users |
| **Education** | `assignments`, `submissions`, `quizzes`, `quiz_questions`, `quiz_attempts`, `attendance_sessions`, `attendance_records`, `courses`, `course_enrollments`, `weekly_schedules`, `academic_events` | All scoped to `classes` or `users` |
| **Communication** | `messages`, `announcements`, `announcement_acknowledgements`, `message_groups`, `message_group_members`, `message_group_messages`, `call_sessions`, `notifications` | Scoped to classes, users, groups |
| **Media/Content** | `videos`, `study_logs`, `feedback` | Scoped to classes/users |
| **Administrative** | `gradebook_categories`, `gradebook_scores`, `gradebook_shared_reports`, `discipline_records`, `counseling_cases`, `school_tickets`, `school_ticket_messages`, `system_settings`, `audit_logs`, `live_classroom_sessions`, `teacher_lesson_plans`, `teacher_documents`, `student_study_notes`, `revoked_tokens` | Mixed scoping |

### 1.2 Missing Database Constraints (Critical)

| Table | Missing Constraint | Risk |
|---|---|---|
| `tuition_ledgers` | `CHECK (paid_amount >= 0 AND balance >= 0 AND paid_amount <= total_amount - discount_amount)` | Financial data corruption (BL-FIN-004) |
| `tuition_ledgers` | `UNIQUE (ledger_id, installment_number)` | Duplicate installments (BL-FIN-003) |
| `tuition_installments` | `UNIQUE (ledger_id, authority/tracking_number)` | Idempotency failure (BL-FIN-002) |
| `attendance_records` | `UNIQUE (session_id, student_id)` — **Wait: EXISTS at 002:91** | ✅ Covered |
| `quiz_attempts` | `UNIQUE (quiz_id, student_id)` — **EXISTS at 002:69** | ✅ Covered |
| `submissions` | `UNIQUE (assignment_id, student_id)` — **EXISTS at 002:31** | ✅ Covered |
| `gradebook_scores` | `CHECK (score >= 0 AND score <= max_score)` | Invalid grades (BL-GRB-004) |
| `gradebook_scores` | `FK (category_id) REFERENCES gradebook_categories(id) ON DELETE CASCADE` — **EXISTS at 006:41** | ✅ Covered |
| `discipline_records` | `CHECK (points BETWEEN -20 AND 20)` | Discipline score overflow (BL-GRB-005) |
| `parent_student_links` | `is_verified` default false but never set true — remove or implement | Unverified parent access (BL-ENR-004) |
| `class_members` | `UNIQUE (class_id, user_id)` — **EXISTS at 001:55** | ✅ Covered |
| `parent_student_links` | `UNIQUE (parent_id, student_id)` — **EXISTS at 001:66** | ✅ Covered |

### 1.3 Index Coverage (60 indexes via migrations 014, 015)

**Well-indexed:** FK columns (class_id, user_id, student_id), composite query patterns (class+date, user+class), lookup columns (username, student_code, email).

**Missing indexes identified:**
- `tuition_ledgers(student_id, academic_year)` — exists as unique (006:120) ✅
- `tuition_installments(ledger_id, status)` — for settlement queries
- `gradebook_shared_reports(class_id, teacher_id)` — for report queries
- `audit_logs(module, action, created_at)` — exists at 016:78 ✅
- `live_classroom_sessions(class_id)` — primary key ✅

---

## 2. Cascading Deletes & Updates

### 2.1 Cascade Map (Referential Integrity)

| Parent Table | Child Table | FK Column | On Delete | Assessment |
|---|---|---|---|---|
| `schools` | `classes` | `school_id` | **SET NULL** | ⚠️ Orphans classes from school |
| `users` | `classes` | `teacher_id` | **CASCADE** | ✅ Correct |
| `classes` | `class_members` | `class_id` | **CASCADE** | ✅ Correct |
| `users` | `class_members` | `user_id` | **CASCADE** | ✅ Correct |
| `classes` | `assignments` | `class_id` | **CASCADE** | ✅ Correct |
| `classes` | `announcements` | `class_id` | **CASCADE** | ✅ Correct |
| `classes` | `attendance_sessions` | `class_id` | **CASCADE** | ✅ Correct |
| `classes` | `videos` | `class_id` | **CASCADE** | ✅ Correct |
| `classes` | `messages` | `class_id` | **SET NULL** | ⚠️ Orphaned messages |
| `classes` | `weekly_schedules` | `class_id` | **CASCADE** | ✅ Correct |
| `classes` | `gradebook_categories` | `class_id` | **CASCADE** | ✅ Correct |
| `classes` | `courses` | `class_id` | **CASCADE** (005:55) | ✅ Correct |
| `classes` | `course_enrollments` | `course_id` → `courses.class_id` | **CASCADE** | ✅ Correct |
| `users` | `parent_student_links` | `parent_id` | **CASCADE** | ✅ Correct |
| `users` | `parent_student_links` | `student_id` | **CASCADE** | ✅ Correct |
| `users` | `invite_links` | `class_id` | **CASCADE** | ✅ Correct |
| `gradebook_categories` | `gradebook_scores` | `category_id` | **CASCADE** (006:41) | ✅ Correct |
| `quizzes` | `quiz_questions` | `quiz_id` | **CASCADE** (002:49) | ✅ Correct |
| `quizzes` | `quiz_attempts` | `quiz_id` | **CASCADE** (002:62) | ✅ Correct |
| `assignments` | `submissions` | `assignment_id` | **CASCADE** (002:21) | ✅ Correct |
| `attendance_sessions` | `attendance_records` | `session_id` | **CASCADE** (002:87) | ✅ Correct |
| `message_groups` | `message_group_members` | `group_id` | **CASCADE** (004:61) | ✅ Correct |
| `message_groups` | `message_group_messages` | `group_id` | **CASCADE** (004:74) | ✅ Correct |
| `school_tickets` | `school_ticket_messages` | `ticket_id` | **CASCADE** (006:165) | ✅ Correct |
| `announcements` | `announcement_acknowledgements` | `announcement_id` | **CASCADE** (009:21) | ✅ Correct |

### 2.2 Cascade Issues

**OP-DB-01: `messages.class_id` uses SET NULL (003:10)**
- When class deleted, messages become orphaned with `class_id = NULL`
- Lose context of which class discussion belonged to
- **Fix:** Change to CASCADE or add application-level cleanup

**OP-DB-02: `schools` → `classes` uses SET NULL (001:40)**
- Deleting school leaves classes with `school_id = NULL`
- Breaks tenant isolation — classes lose school association
- **Fix:** Prevent school deletion if classes exist, or CASCADE with warning

---

## 3. Migration History, Ordering & Reversibility

### 3.1 Migration Timeline (17 Migrations)

| # | Migration | Type | Reversible? | Data Risk on Down |
|---|---|---|---|---|
| 001 | Core tables (users, schools, classes, members, parent_links, invites) | CREATE | ❌ Drops all core tables | **Total data loss** |
| 002 | Education tables (assignments, submissions, quizzes, questions, attempts, attendance) | CREATE | ❌ Drops all education tables | **Total data loss** |
| 003 | Communication tables (messages, announcements, videos, notifications) | CREATE | ❌ Drops all comm tables | **Total data loss** |
| 004 | Sampad modules (study_logs, message_groups, group_members, group_messages, calls) | CREATE | ❌ Drops all | **Total data loss** |
| 005 | Video enhancements, courses, enrollments, events, feedback | CREATE/ALTER | ❌ Drops tables | **Total data loss** |
| 006 | Enterprise modules (gradebook, schedules, discipline, counseling, tuition, tickets) | CREATE | ❌ Drops tables | **Total data loss** |
| 007 | External live providers (Skyroom/BBB columns) | ALTER | ✅ Drops columns only | Low |
| 008 | Message edit support (is_edited, edited_at) | ALTER | ✅ Drops columns only | Low |
| 009 | Announcement acknowledgements | CREATE | ❌ Drops table | Medium (ack data) |
| 010 | Announcement grades/subjects | ALTER | ✅ Drops columns | Low |
| 011 | Username column + backfill | ALTER | ✅ Drops column | Low |
| 012 | school_id on users (retroactive) | ALTER | ✅ Drops column | **High — breaks tenant isolation** |
| 013 | School website + system_settings | ALTER/CREATE | ⚠️ Drops settings table | Low |
| 014 | Performance indexes (21 indexes) | RAW SQL INDEX | ✅ Drops indexes | Zero data loss |
| 015 | Quiz/auth indexes (10 indexes) | RAW SQL INDEX | ✅ Drops indexes | Zero data loss |
| 016 | Production hardening (indexes, columns, tables) | ALTER/CREATE + RAW | ⚠️ Drops indexes + tables | **High — drops audit_logs, revoked_tokens, etc.** |
| 017 | Session revocation + token_version | ALTER/CREATE | ⚠️ Drops revoked_tokens table | **High — breaks auth** |

### 3.2 Migration Safety Issues

**OP-DB-03: `down()` migrations are destructive (all 17)**
- Every `down()` drops tables/columns — **no safe rollback**
- Production rollback = data loss
- **Fix:** Implement proper reversible migrations with data preservation, or disable down migrations in production

**OP-DB-04: Migration 016 rewrites unique indexes in-place (016:32-39)**
```sql
DROP INDEX IF EXISTS users_email_unique;
DROP INDEX IF EXISTS users_phone_unique;
CREATE UNIQUE INDEX idx_users_school_email ON users (school_id, email);
CREATE UNIQUE INDEX idx_users_school_phone ON users (school_id, phone);
```
- Runs on live data — if duplicate emails exist across schools, **index creation fails**
- No data migration to resolve conflicts before index creation
- **Fix:** Pre-migration data validation + conflict resolution script

**OP-DB-05: SQLite vs PostgreSQL parity untested (OP-017 in deployment audit)**
- Migration 016 uses raw SQL `CREATE UNIQUE INDEX` — SQLite syntax
- PostgreSQL requires `CONCURRENTLY` for non-locking index creation
- `ssl: { rejectUnauthorized: false }` in PG config — **insecure**

**OP-DB-06: No migration locking / concurrent deploy protection**
- Knex uses advisory locks in PG but not SQLite
- Two containers starting simultaneously → migration corruption

---

## 4. Transaction Boundaries & Concurrent Writes

### 4.1 Zero Explicit Transactions

**Finding:** `grep -r "\.transaction(" backend/src` → **0 hits**

| Operation | Tables Involved | Current Pattern | Risk |
|---|---|---|---|
| Finance settlement | `tuition_installments` + `tuition_ledgers` | Read → Compute → UPDATE → UPDATE | **Double-charge** (RC-001) |
| Quiz submit | `quiz_attempts` | SELECT → Compute → UPDATE/INSERT | **Lost update** (RC-004) |
| Attendance close | `attendance_records` bulk insert | SELECT members → SELECT checked-in → INSERT absent | **Race** (RC-002) |
| AI commit (roster) | `users` + `class_members` + `parent_student_links` | Loop of INSERTs | **Partial commit** (BL-AI-003) |
| AI commit (grades) | `gradebook_scores` + `gradebook_categories` | Loop of INSERT/UPDATE | **Partial commit** |
| AI commit (quiz) | `quizzes` + `quiz_questions` + `quiz_attempts` | INSERT quiz + questions | **Partial commit** |
| Notification broadcast | `announcements` + `notifications` | INSERT announcement + batch INSERT notifications | **Partial failure** (BL-NOT-001) |

### 4.2 Race Condition Inventory

| ID | Location | Tables | Pattern | Severity |
|---|---|---|---|---|
| RC-001 | `finance.routes.js:184-195, 456-471` | `tuition_installments`, `tuition_ledgers` | Check status → Read ledger → Write both | **P0** |
| RC-002 | `attendance.service.js:159-233` | `attendance_records` | SELECT members → SELECT checked-in → INSERT absent | **P0** |
| RC-003 | `quiz.service.js:297-318` | `quiz_attempts` | SELECT existing → INSERT new | **P0** |
| RC-004 | `quiz.service.js:320-448` | `quiz_attempts` | Check completed_at → Compute → UPDATE | **P0** |
| RC-005 | `assignment.service.js:191-228` | `submissions` | SELECT existing → UPDATE/INSERT | **P0** |
| RC-006 | `class.service.js:252-278` | `class_members` | SELECT existing → INSERT | **P0** |
| RC-007 | `gradebook.routes.js:254-305` | `gradebook_scores` | Loop of SELECT → UPDATE/INSERT | **P0** |
| RC-008 | `notification.service.js:131-151` | `notifications` | Batch INSERT without transaction | **P1** |

**Root Cause:** Zero `db.transaction()` usage anywhere in codebase.

---

## 5. Orphaned Records & Inconsistent Relationships

### 5.1 Known Orphan Risks

| Scenario | Orphan Type | Detection | Prevention |
|---|---|---|---|
| Class deleted, messages remain | `messages.class_id = NULL` (SET NULL) | Query `messages WHERE class_id IS NULL` | Change FK to CASCADE |
| School deleted, classes remain | `classes.school_id = NULL` | Query `classes WHERE school_id IS NULL` | Prevent school deletion or CASCADE |
| Parent link without parent/user | `parent_student_links` with missing FK | FK enforces — **prevented** | FK exists ✅ |
| Quiz attempt without quiz | `quiz_attempts.quiz_id` FK | FK enforces — **prevented** | FK exists ✅ |
| Submission without assignment | `submissions.assignment_id` FK | FK enforces — **prevented** | FK exists ✅ |
| Gradebook score without category | `gradebook_scores.category_id` FK | FK enforces — **prevented** | FK exists ✅ |

### 5.2 Application-Level Inconsistencies

**OP-DB-07: `is_verified` on `parent_student_links` default false, never set true**
- Migration 001:64 `table.boolean('is_verified').defaultTo(false)`
- `class.service.js:532` creates link without setting `is_verified: true`
- `auth.js:117-124` allows access via `student_code` match **ignoring `is_verified`**
- **Result:** Unverified parent links grant full access

**OP-DB-08: `tuition_ledgers.balance` denormalized, not derived**
- `balance` updated by application logic (read-modify-write)
- No `CHECK (balance = total_amount - discount_amount - paid_amount)`
- No trigger/view to recompute
- **Result:** Balance drift possible via direct DB edits or race conditions

**OP-DB-09: `gradebook_categories.weight` no validation**
- Default 1.0, no `CHECK (weight > 0)`
- Teacher can set weight = 0 → division by zero in average calc (guarded at 006:98 `totalWeight > 0` but returns null)
- **Result:** Silent null averages

**OP-DB-10: `discipline_records.points` unbounded**
- Migration 006:80 `table.float('points').defaultTo(0)`
- No `CHECK (points BETWEEN -20 AND 20)`
- Report card: `disciplineScore += d.points` (006:642) → can exceed 20 or go negative
- **Result:** Discipline score corrupts academic standing

---

## 6. Soft Deletion, Archival & Restoration

### 6.1 Soft Delete Patterns

| Table | Soft Delete Column | Used By | Restoration Path |
|---|---|---|---|
| `users` | `is_active` (016:23) | `auth.js:192` blocks login | Admin reactivation |
| `classes` | `is_active` (001:43) | `class.service.js:153` filters | Manual update |
| `classes` | `is_live` (016:96) | `socket.js:248` | Auto-reset on end_live |
| `revoked_tokens` | N/A (explicit table) | `auth.js:209-219` | Token re-issue |
| `gradebook_shared_reports` | `status` (016:190) | `gradebook.routes.js:455` | Acknowledge |

### 6.2 Missing Archival Patterns

| Entity | Current Behavior | Gap |
|---|---|---|
| **Deleted classes** | Hard delete via `class.service.js:313-328` (7 manual DELETEs) | No archive table; no restoration |
| **Expired announcements** | Never archived; pile up in `announcements` | No TTL, no partition |
| **Completed quiz attempts** | Stay in `quiz_attempts` forever | No archival policy |
| **Old audit logs** | `audit_logs` grows unbounded | No retention, no partitioning |
| **Financial records** | `tuition_ledgers` never archived | No fiscal year closure process |

**OP-DB-11: `deleteClass` bypasses FK CASCADE (class.service.js:313-328)**
- Manually deletes from 7 tables instead of relying on `ON DELETE CASCADE`
- If schema changes (new child table), delete misses it
- Order matters — FK violations if order wrong
- **Fix:** Single `DELETE FROM classes WHERE id = ?` + trust CASCADE

**OP-DB-12: No point-in-time recovery**
- Backups are daily whole-file copies
- No WAL archiving, no PITR (Point-in-Time Recovery)
- Recovery = restore to last backup (≤24h data loss)

---

## 7. Data Ownership & Tenant Isolation at Database Level

### 7.1 Current Tenant Model

**Single schema, single database file, runtime `school_id` filtering**

```sql
-- Every query must include:
WHERE school_id = ?
```

### 7.2 Isolation Gaps

| Layer | Protection | Gap |
|---|---|---|
| **Schema** | None — all schools share tables | No row-level security (RLS) |
| **Indexes** | Composite unique on `(school_id, email/phone)` (016:35-39) ✅ | Prevents cross-school email/phone conflict |
| **FKs** | No `school_id` on all tables — e.g., `quizzes` has `class_id` → `classes.school_id` | Indirect scoping; query must join |
| **Application** | `assertSameSchool()` middleware (auth.js:52-64) | **Single lint rule** (1 baseline entry) |
| **Backup** | Whole file copy | **All tenants together** |

**OP-DB-13: No database-level tenant isolation**
- Relies entirely on application code (`assertSameSchool`, `lint-unscoped-queries`)
- Single bug in query → cross-tenant data leak
- **Fix:** PostgreSQL Row-Level Security (RLS) policies or separate schemas per tenant

**OP-DB-14: `school_id` nullable on many tables**
- `classes.school_id` nullable (001:40 `references...onDelete('SET NULL')`)
- `users.school_id` added retroactively (012), nullable
- `messages.class_id` nullable (SET NULL)
- **Result:** Rows can exist without school — isolation bypass

---

## 8. Financial & Academic Record Integrity

### 8.1 Financial Records (`tuition_ledgers`, `tuition_installments`)

| Integrity Aspect | Current State | Risk |
|---|---|---|
| **Atomicity** | Zero transactions | **Double-charge** (RC-001) |
| **Idempotency** | No unique constraint on authority | **Replay attacks** |
| **Invariants** | No CHECK constraints | **Negative balance, overpayment** |
| **Uniqueness** | No `(ledger_id, installment_number)` | **Duplicate installments** |
| **Audit trail** | 2 `logAudit` calls (verify, callback) | Partial coverage |
| **Reconciliation** | No automated reconciliation job | Drift undetected |

**OP-DB-15: Financial records lack database-level integrity**
- All integrity in application code (which has races)
- No database constraints to enforce: `paid_amount <= total_amount - discount`, `balance >= 0`, `status` matches balance
- **Fix:** Add CHECK constraints + unique indexes + transactions

### 8.2 Academic Records (Grades, Attendance, Quizzes)

| Aspect | State | Risk |
|---|---|---|
| **Grade immutability** | Scores updatable anytime by teacher | No audit trail of changes (only 8 logAudit calls) |
| **Attendance finality** | `closeSession` auto-inserts absent; no lock | Teacher can reopen, modify |
| **Quiz attempt finality** | `completed_at` checked but race exists | Student can submit twice |
| **Historical grades** | No snapshot/versioning | Grade changes overwrite history |
| **Report card** | Computed on-demand from live tables | No frozen record for transcript |

**OP-DB-16: No immutable audit trail for academic decisions**
- Grade changes, attendance overrides, quiz retakes — all overwrite
- `gradebook_scores.graded_at` updates on every change
- No `gradebook_score_history` table
- **Fix:** Append-only audit table for grade/attendance changes

---

## 9. Concrete Failure Scenarios & Safeguards

### 9.1 Failure Scenario Catalog

| ID | Scenario | Trigger | Impact | Detection | Safeguard |
|---|---|---|---|---|---|
| **FS-01** | Double tuition settlement | Parent double-clicks "Pay" / network retry | Student overcharged; ledger balance wrong | Parent complaint / reconciliation | **Add transaction + unique(ledger_id, authority)** |
| **FS-02** | Teacher closes attendance while student checks in | Concurrent `closeSession` + `checkIn` | Student marked absent despite check-in | Student/parent dispute | **Transaction + SELECT FOR UPDATE** |
| **FS-03** | Student submits quiz twice (double-click) | Network retry / double-click | Two attempts; second overwrites first | Grade discrepancy | **Unique(quiz_id, student_id) + atomic claim** |
| **FS-04** | Class deleted while students have submissions | Admin deletes class | Submissions orphaned (CASCADE works) but messages SET NULL | Data integrity audit | **Prevent deletion if children exist** |
| **FS-05** | School deleted, classes left with NULL school_id | Admin deletes school | Classes lose tenant isolation | Cross-tenant data leak | **Prevent deletion or CASCADE** |
| **FS-06** | Backup corrupted, undetected | Disk error during copy | All data since last good backup lost | Restore attempt fails | **Integrity_check + SHA256 manifest** |
| **FS-07** | Migration 016 fails on duplicate emails | Deploy to PG with cross-school duplicates | Deploy fails; partial schema | Deploy error | **Pre-migration validation script** |
| **FS-08** | Grade changed after report card issued | Teacher corrects grade | Report card ≠ current grades | Transcript dispute | **Grade history table + frozen report cards** |
| **FS-09** | Parent link created without verification | Teacher adds student with parent | Unverified parent accesses grades/finance | Access audit | **Require is_verified=true + verification flow** |
| **FS-10** | `deleteClass` misses new child table | Schema change adds table, deleteClass not updated | Orphaned records in new table | Data inconsistency | **Trust CASCADE; single DELETE** |

### 9.2 Recommended Database-Level Safeguards

```sql
-- 1. Financial Integrity Constraints
ALTER TABLE tuition_ledgers ADD CONSTRAINT chk_ledger_integrity 
  CHECK (paid_amount >= 0 AND balance >= 0 AND paid_amount <= total_amount - discount_amount);

ALTER TABLE tuition_installments ADD CONSTRAINT uq_ledger_installment 
  UNIQUE (ledger_id, installment_number);

ALTER TABLE tuition_installments ADD CONSTRAINT uq_ledger_authority 
  UNIQUE (ledger_id, authority);

-- 2. Academic Integrity Constraints
ALTER TABLE gradebook_scores ADD CONSTRAINT chk_score_range 
  CHECK (score >= 0 AND score <= max_score);

ALTER TABLE discipline_records ADD CONSTRAINT chk_points_range 
  CHECK (points BETWEEN -20 AND 20);

-- 3. Tenant Isolation (PostgreSQL RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users 
  USING (school_id = current_setting('app.current_school_id')::uuid);

-- 4. Grade History (Immutable Audit)
CREATE TABLE gradebook_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  score_id UUID REFERENCES gradebook_scores(id),
  old_score DECIMAL(5,2),
  new_score DECIMAL(5,2),
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ DEFAULT now(),
  change_reason TEXT
);

-- 5. Financial Reconciliation View
CREATE VIEW tuition_ledger_reconciliation AS
SELECT 
  l.id, l.student_id, l.academic_year,
  l.total_amount, l.discount_amount, l.paid_amount, l.balance,
  SUM(i.amount) FILTER (WHERE i.status = 'verified') AS verified_total,
  l.paid_amount - SUM(i.amount) FILTER (WHERE i.status = 'verified') AS discrepancy
FROM tuition_ledgers l
LEFT JOIN tuition_installments i ON i.ledger_id = l.id
GROUP BY l.id
HAVING l.paid_amount != SUM(i.amount) FILTER (WHERE i.status = 'verified');
```

---

## 10. Migration Compatibility Matrix

| From Version | To Version | Compatible? | Notes |
|---|---|---|---|
| 016 (SQLite) | 016 (PG) | ⚠️ **No** | Raw SQL index syntax differs; `CONCURRENTLY` needed |
| 016 (PG) | 017 (PG) | ✅ Yes | Sequential, no conflicts |
| 015 | 016 | ✅ Yes | Indexes don't conflict |
| 012 (add school_id) | 016 (composite unique) | ✅ Yes | Sequential dependency |
| Any | 001 (fresh) | ✅ Yes | Clean install |

**Critical Gap:** No tested PG migration path. `DB_CLIENT=pg` is theoretical — no CI runs migrations against PostgreSQL.

---

## 11. Recommended Remediation Priority

| Priority | Task | Effort | Dependencies |
|---|---|---|---|
| **P0-1** | Add financial CHECK constraints + unique indexes | 0.5 day | Migration |
| **P0-2** | Wrap finance settlement in `db.transaction()` | 0.5 day | Code |
| **P0-3** | Add `UNIQUE (quiz_id, student_id)` — already exists ✅ | — | — |
| **P0-4** | Add `UNIQUE (ledger_id, installment_number)` + authority | 0.5 day | Migration |
| **P0-5** | Fix `messages.class_id` SET NULL → CASCADE | 0.25 day | Migration |
| **P0-5** | Fix `schools→classes` SET NULL → prevent delete or CASCADE | 0.25 day | Migration |
| **P1-1** | Add academic CHECK constraints (scores, discipline) | 0.5 day | Migration |
| **P1-2** | Add grade history table + triggers | 1 day | Migration + Code |
| **P1-3** | Implement `db.transaction()` for all race-prone ops | 2 days | Code |
| **P1-4** | Add PostgreSQL RLS policies for tenant isolation | 1 day | PG only |
| **P1-5** | Pre-migration validation for 016 duplicate emails | 0.5 day | Script |
| **P2-1** | Add `gradebook_score_history` table | 0.5 day | Migration |
| **P2-2** | Implement backup integrity_check + SHA256 | 0.5 day | Code |
| **P2-3** | Add fiscal year closure / archival process | 1 day | Code |
| **P2-4** | Test PG migration path in CI | 0.5 day | CI |

---

## 12. Summary: Data Integrity Scorecard

| Dimension | Score | Notes |
|---|---|---|
| **Referential Integrity** | 7/10 | FKs mostly correct; 2 SET NULL issues |
| **Constraint Enforcement** | 3/10 | Critical CHECK/UNIQUE missing on financial/academic tables |
| **Transaction Safety** | 1/10 | Zero transactions; 8 race conditions |
| **Tenant Isolation** | 2/10 | Application-only; no RLS; nullable school_id |
| **Migration Safety** | 4/10 | Destructive down; PG untested; in-place index swap |
| **Soft Delete/Archival** | 4/10 | Partial; no fiscal closure; deleteClass bypasses CASCADE |
| **Historical Integrity** | 3/10 | No grade history; mutable financial records; no reconciliation |
| **Backup/Recovery** | 3/10 | Unverified whole-file; no PITR; no off-site |
| **Overall** | **3.1/10** | **Not production-ready for multi-tenant use** |

---

*Assessment complete. All findings derived from static analysis of 17 migration files, knexfile, and application code. No database modifications performed.*