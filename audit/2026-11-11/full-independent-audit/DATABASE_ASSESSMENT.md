# EduConnect Database Assessment — Independent Investigation

**Audit Date:** 2026-11-11  
**Commit:** `838b5b2` (main)  
**Scope:** Schema design, constraints, relationships, indexes, migrations, transactions, data lifecycle, tenant isolation

---

## Executive Summary

**Database Integrity:** **CRITICAL RISK** — Fundamental gaps in constraint enforcement, transaction discipline, tenant isolation  
**Schema Quality:** **MODERATE** — Well-structured but missing critical constraints  
**Migration Safety:** **MODERATE** — Idempotent up migrations, destructive down migrations, PG untested  
**Transaction Discipline:** **NONE** — Zero transactions, 8+ race conditions  
**Tenant Isolation:** **APPLICATION-ONLY** — No database-level enforcement, nullable school_id columns

---

## Schema Inventory (44 Tables)

| Domain | Tables | Count |
|---|---|---|
| **Identity & Tenancy** | `users`, `schools` | 2 |
| **Classroom** | `classes`, `class_members`, `invite_links` | 3 |
| **Family** | `parent_student_links` | 1 |
| **Academic Core** | `assignments`, `submissions`, `quizzes`, `quiz_questions`, `quiz_attempts`, `gradebook_categories`, `gradebook_scores`, `gradebook_shared_reports` | 8 |
| **Attendance** | `attendance_sessions`, `attendance_records` | 2 |
| **Communication** | `messages`, `announcements`, `announcement_acknowledgements`, `message_groups`, `message_group_members`, `message_group_messages`, `call_sessions`, `notifications` | 8 |
| **Media & Content** | `videos`, `courses`, `course_enrollments`, `academic_events`, `feedback` | 5 |
| **Administrative** | `weekly_schedules`, `discipline_records`, `counseling_cases`, `school_tickets`, `school_ticket_messages`, `study_logs`, `gradebook_shared_reports` | 7 |
| **Financial** | `tuition_ledgers`, `tuition_installments` | 2 |
| **System & Audit** | `audit_logs`, `live_classroom_sessions`, `revoked_tokens`, `system_settings`, `teacher_lesson_plans`, `teacher_documents`, `student_study_notes` | 7 |
| **TOTAL** | | **44** |

---

## Constraint Analysis

### Present Constraints (✅)

| Table | Constraint Type | Columns | Migration |
|---|---|---|---|
| `users` | PRIMARY KEY | `id` | 001 |
| `users` | UNIQUE | `email` (global, replaced by 016) | 001/016 |
| `users` | UNIQUE | `phone` (global, replaced by 016) | 001/016 |
| `users` | UNIQUE | `username` | 011 |
| `schools` | PRIMARY KEY | `id` | 001 |
| `schools` | UNIQUE | `code` | 001 |
| `classes` | PRIMARY KEY | `id` | 001 |
| `classes` | UNIQUE | `join_code` | 001 |
| `class_members` | PRIMARY KEY | `id` | 001 |
| `class_members` | UNIQUE | `(class_id, user_id)` | 001 |
| `parent_student_links` | PRIMARY KEY | `id` | 001 |
| `parent_student_links` | UNIQUE | `(parent_id, student_id)` | 001 |
| `invite_links` | PRIMARY KEY | `id` | 001 |
| `invite_links` | UNIQUE | `token` | 001 |
| `assignments` | PRIMARY KEY | `id` | 002 |
| `submissions` | PRIMARY KEY | `id` | 002 |
| `submissions` | UNIQUE | `(assignment_id, student_id)` | 002 |
| `quizzes` | PRIMARY KEY | `id` | 002 |
| `quiz_questions` | PRIMARY KEY | `id` | 002 |
| `quiz_attempts` | PRIMARY KEY | `id` | 002 |
| `quiz_attempts` | UNIQUE | `(quiz_id, student_id)` | 002 |
| `attendance_sessions` | PRIMARY KEY | `id` | 002 |
| `attendance_records` | PRIMARY KEY | `id` | 002 |
| `attendance_records` | UNIQUE | `(session_id, student_id)` | 002 (added in 006) |
| `messages` | PRIMARY KEY | `id` | 003 |
| `announcements` | PRIMARY KEY | `id` | 003 |
| `videos` | PRIMARY KEY | `id` | 003 |
| `notifications` | PRIMARY KEY | `id` | 003 |
| `message_groups` | PRIMARY KEY | `id` | 004 |
| `message_group_members` | PRIMARY KEY | `id` | 004 |
| `message_group_members` | UNIQUE | `(group_id, user_id)` | 004 |
| `message_group_messages` | PRIMARY KEY | `id` | 004 |
| `call_sessions` | PRIMARY KEY | `id` | 004 |
| `gradebook_categories` | PRIMARY KEY | `id` | 006 |
| `gradebook_scores` | PRIMARY KEY | `id` | 006 |
| `gradebook_scores` | UNIQUE | `(category_id, student_id)` | 006 |
| `weekly_schedules` | PRIMARY KEY | `id` | 006 |
| `weekly_schedules` | UNIQUE | `(class_id, day_of_week, period_number)` | 006 |
| `discipline_records` | PRIMARY KEY | `id` | 006 |
| `counseling_cases` | PRIMARY KEY | `id` | 006 |
| `tuition_ledgers` | PRIMARY KEY | `id` | 006 |
| `tuition_ledgers` | UNIQUE | `(student_id, academic_year)` | 006 |
| `tuition_installments` | PRIMARY KEY | `id` | 006 |
| `school_tickets` | PRIMARY KEY | `id` | 006 |
| `school_tickets` | UNIQUE | `ticket_number` | 006 |
| `school_ticket_messages` | PRIMARY KEY | `id` | 006 |
| `courses` | PRIMARY KEY | `id` | 005 |
| `courses` | UNIQUE | `code` | 005 |
| `course_enrollments` | PRIMARY KEY | `id` | 005 |
| `course_enrollments` | UNIQUE | `(course_id, student_id)` | 005 |
| `academic_events` | PRIMARY KEY | `id` | 005 |
| `feedback` | PRIMARY KEY | `id` | 005 |
| `announcement_acknowledgements` | PRIMARY KEY | `id` | 009 |
| `announcement_acknowledgements` | UNIQUE | `(announcement_id, user_id)` | 009 |
| `audit_logs` | PRIMARY KEY | `id` | 016 |
| `live_classroom_sessions` | PRIMARY KEY | `class_id` | 016 |
| `revoked_tokens` | PRIMARY KEY | `jti` | 017 |
| `teacher_lesson_plans` | PRIMARY KEY | `id` | 016 |
| `teacher_documents` | PRIMARY KEY | `id` | 016 |
| `student_study_notes` | PRIMARY KEY | `id` | 016 |
| `gradebook_shared_reports` | PRIMARY KEY | `id` | 016 |

---

### Missing Critical Constraints (❌ CRITICAL)

| Table | Missing Constraint | Risk | Severity |
|---|---|---|---|
| `tuition_ledgers` | `CHECK (paid_amount >= 0 AND balance >= 0 AND paid_amount <= total_amount - discount_amount)` | Negative balance, overpayment, invariant drift | **P0** |
| `tuition_ledgers` | `UNIQUE (ledger_id, installment_number)` | Duplicate installments | **P0** |
| `tuition_installments` | `UNIQUE (ledger_id, authority)` or `(ledger_id, tracking_number)` | Replay attacks, double settlement | **P0** |
| `tuition_installments` | `CHECK (amount > 0)` | Zero/negative amounts | **P1** |
| `gradebook_scores` | `CHECK (score >= 0 AND score <= max_score)` | Invalid grades (negative, >max) | **P1** |
| `gradebook_categories` | `CHECK (weight > 0)` | Division by zero, inverted logic | **P1** |
| `discipline_records` | `CHECK (points BETWEEN -20 AND 20)` | Point manipulation, score corruption | **P1** |
| `parent_student_links` | `is_verified` default false, never set true — remove or implement | Unverified parents access data | **P0** |
| `tuition_installments` | `UNIQUE (ledger_id, installment_number)` | Duplicate installments | **P0** |
| `quiz_attempts` | `UNIQUE (quiz_id, student_id)` — **EXISTS** ✅ | — | — |
| `submissions` | `UNIQUE (assignment_id, student_id)` — **EXISTS** ✅ | — | — |
| `attendance_records` | `UNIQUE (session_id, student_id)` — **EXISTS** ✅ (006) | — | — |
| `class_members` | `UNIQUE (class_id, user_id)` — **EXISTS** ✅ | — | — |
| `parent_student_links` | `UNIQUE (parent_id, student_id)` — **EXISTS** ✅ | — | — |
| `gradebook_scores` | `UNIQUE (category_id, student_id)` — **EXISTS** ✅ | — | — |

---

### Foreign Key Cascading Behavior

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
| `classes` | `courses` | `class_id` | **CASCADE** | ✅ Correct |
| `classes` | `invite_links` | `class_id` | **CASCADE** | ✅ Correct |
| `gradebook_categories` | `gradebook_scores` | `category_id` | **CASCADE** | ✅ Correct |
| `quizzes` | `quiz_questions` | `quiz_id` | **CASCADE** | ✅ Correct |
| `quizzes` | `quiz_attempts` | `quiz_id` | **CASCADE** | ✅ Correct |
| `assignments` | `submissions` | `assignment_id` | **CASCADE** | ✅ Correct |
| `attendance_sessions` | `attendance_records` | `session_id` | **CASCADE** | ✅ Correct |
| `message_groups` | `message_group_members` | `group_id` | **CASCADE** | ✅ Correct |
| `message_groups` | `message_group_messages` | `group_id` | **CASCADE** | ✅ Correct |
| `school_tickets` | `school_ticket_messages` | `ticket_id` | **CASCADE** | ✅ Correct |
| `announcements` | `announcement_acknowledgements` | `announcement_id` | **CASCADE** | ✅ Correct |
| `users` | `parent_student_links` | `parent_id` | **CASCADE** | ✅ Correct |
| `users` | `parent_student_links` | `student_id` | **CASCADE** | ✅ Correct |

**Issues:**
1. `messages.class_id` SET NULL → orphaned messages lose class context
2. `schools → classes` SET NULL → classes lose tenant association on school delete

---

## Index Coverage

### Performance Indexes (Migration 014: 21 indexes + Migration 015: 10 indexes)

| Table | Indexes | Coverage |
|---|---|---|
| `users` | `idx_users_role`, `idx_users_phone` | ✅ |
| `messages` | `idx_messages_sender_receiver_date`, `idx_messages_receiver_read`, `idx_messages_class` | ✅ |
| `message_group_messages` | `idx_mgm_group_sent`, `idx_mgm_sender` | ✅ |
| `message_group_members` | `idx_mgm_group_user`, `idx_mgm_user` | ✅ |
| `notifications` | `idx_notifications_user_read`, `idx_notifications_user_created` | ✅ |
| `assignments` | `idx_assignments_class_due`, `idx_assignments_teacher` | ✅ |
| `submissions` | `idx_submissions_assign_student`, `idx_submissions_student` | ✅ |
| `attendance_sessions` | `idx_att_sess_class`, `idx_att_sess_teacher` | ✅ |
| `attendance_records` | `idx_att_rec_sess_student`, `idx_att_rec_student` | ✅ |
| `gradebook_categories` | `idx_gb_cat_class` | ✅ |
| `gradebook_scores` | `idx_gb_scores_cat_student`, `idx_gb_scores_student` | ✅ |
| `weekly_schedules` | `idx_ws_class_day`, `idx_ws_teacher_day` | ✅ |
| `classes` | `idx_classes_school_teacher`, `idx_classes_teacher` | ✅ |
| `course_enrollments` | `idx_enroll_student_course` | ✅ |
| `parent_student_links` | `idx_psl_parent`, `idx_psl_student` | ✅ |
| `school_tickets` | `idx_tickets_user_status`, `idx_tickets_assigned` | ✅ |
| `school_ticket_messages` | `idx_ticket_msgs_ticket` | ✅ |
| `study_logs` | `idx_study_logs_student_date` | ✅ |
| `counseling_cases` | `idx_counseling_student`, `idx_counseling_counselor` | ✅ |
| `discipline_records` | `idx_discipline_student` | ✅ |
| `academic_events` | `idx_events_dates` | ✅ |
| `quizzes` | `idx_quizzes_class_created`, `idx_quizzes_teacher` | ✅ (015) |
| `quiz_questions` | `idx_quiz_questions_quiz_order` | ✅ (015) |
| `quiz_attempts` | `idx_quiz_attempts_quiz_student` | ✅ (015) |
| `class_members` | `idx_class_members_user_class`, `idx_class_members_class` | ✅ (015) |
| `users` | `idx_users_username`, `idx_users_student_code`, `idx_users_email` | ✅ (015) |
| `announcements` | `idx_announcements_class_pinned_created` | ✅ (015) |

**Missing Indexes:**
- `tuition_installments(ledger_id, status)` — for settlement queries
- `tuition_installments(ledger_id, authority)` — for idempotency
- `gradebook_shared_reports(class_id, teacher_id)` — for report queries
- `audit_logs(module, action, created_at)` — exists (016:78)

---

## Transaction Discipline

### Current State: **ZERO TRANSACTIONS**

```bash
grep -r "\.transaction(" backend/src
# 0 hits
```

### Operations Requiring Transactions (Missing)

| Operation | Tables Involved | Current Pattern | Risk |
|---|---|---|---|
| Finance settlement (verify-installment) | `tuition_installments` + `tuition_ledgers` | Read → Compute → UPDATE + UPDATE | Double-charge, balance corruption |
| Finance settlement (callback-verify) | `tuition_installments` + `tuition_ledgers` + `notifications` | Read → Compute → UPDATE + UPDATE + INSERT | Double-charge, partial notify |
| Attendance closeSession | `attendance_records` (bulk insert) | SELECT → Compute → INSERT | Race: check-in lost |
| Quiz startAttempt | `quiz_attempts` | SELECT → INSERT | Duplicate attempts |
| Quiz submitAttempt | `quiz_attempts` | SELECT → Compute → UPDATE/INSERT | Lost update, double submit |
| Assignment submit | `submissions` | SELECT → UPDATE/INSERT | Duplicate submissions |
| Class join | `class_members` | SELECT → INSERT | 500 error on conflict |
| Gradebook batch upsert | `gradebook_scores` (loop) | Loop of SELECT → UPDATE/INSERT | Partial commit |
| Notification broadcast | `announcements` + `notifications` | INSERT + batch INSERT | Partial failure |
| AI commit (roster) | `users` + `class_members` + `parent_student_links` | 3 service calls | Partial commit |
| AI commit (grades) | `gradebook_categories` + `gradebook_scores` | INSERT category + loop INSERT scores | Partial commit |
| AI commit (exam) | `quizzes` + `quiz_questions` | INSERT quiz + loop INSERT questions | Partial commit |
| Class delete | 7 tables | 7 separate DELETEs | Partial delete |
| Gradebook category delete | `gradebook_scores` + `gradebook_categories` | DELETE + DELETE | Partial delete |

**Total: 15+ multi-write operations without transactions**

---

## Migration Safety

### Migration Quality Assessment

| Migration | Up Safety | Down Safety | PG Compatible | Notes |
|---|---|---|---|---|
| 001_core | ✅ Idempotent | ❌ Drops all core tables | ✅ | Foundation |
| 002_education | ✅ Idempotent | ❌ Drops all edu tables | ✅ | |
| 003_communication | ✅ Idempotent | ❌ Drops all comm tables | ✅ | |
| 004_sampad | ✅ Idempotent | ❌ Drops all | ✅ | |
| 005_video_sess | ✅ Idempotent | ❌ Drops tables | ✅ | |
| 006_enterprise | ✅ Idempotent | ❌ Drops all enterprise | ✅ | **Most tables** |
| 007_external_live | ✅ Idempotent | ✅ Drops columns only | ✅ | Low risk |
| 008_message_edit | ✅ Idempotent | ✅ Drops columns only | ✅ | Low risk |
| 009_ann_ack | ✅ Idempotent | ❌ Drops table | ✅ | Medium risk |
| 010_ann_grades | ✅ Idempotent | ✅ Drops columns | ✅ | Low risk |
| 011_username | ✅ Idempotent + backfill | ✅ Drops column | ✅ | Low risk |
| 012_school_id | ✅ Idempotent | ✅ Drops column | ⚠️ PG: UUID type | Retroactive school_id |
| 013_website | ✅ Idempotent | ⚠️ Drops settings table | ✅ | Low risk |
| 014_perf_indexes | ✅ Raw SQL, IF NOT EXISTS | ✅ Drops indexes | ✅ | **Zero data loss** |
| 015_quiz_indexes | ✅ Raw SQL, validates columns | ✅ Drops indexes | ✅ | **Zero data loss** |
| 016_hardening | ⚠️ Raw SQL DROP INDEX + CREATE | ❌ Drops indexes only | ❌ **PG incompatible** | **High risk** |
| 017_revocation | ✅ Idempotent | ❌ Drops table + column | ✅ | Breaks auth |

### Critical Migration Issues

1. **Migration 016** — `DROP INDEX users_email_unique` + `CREATE UNIQUE INDEX idx_users_school_email` — **fails on PG if duplicates exist across schools**. No data migration to resolve conflicts.

2. **All `down()` migrations are destructive** — Drop tables/columns, no data preservation. Rollback = data loss.

3. **No migration locking** — Knex advisory locks only work in PG, not SQLite. Concurrent deploys can corrupt.

4. **PG vs SQLite parity untested** — No CI runs migrations against PostgreSQL. `ssl: { rejectUnauthorized: false }` in knexfile is insecure.

---

## Tenant Isolation at Database Level

### Current Model: Application-Level Only

```sql
-- Every query must include:
WHERE school_id = ?
```

### Gaps

| Layer | Protection | Gap |
|---|---|---|
| **Schema** | Composite unique on `(school_id, email/phone)` (016) | Only on users |
| **Indexes** | Composite indexes include school_id | Partial |
| **Foreign Keys** | `school_id` nullable on many tables | `classes.school_id` nullable, `users.school_id` nullable |
| **Application** | `assertSameSchool()` middleware | Single lint rule (1 baseline entry) |
| **Database** | **No Row-Level Security (RLS)** | PostgreSQL RLS not implemented |

### Vulnerability
```sql
-- Single bug in query → cross-tenant leak
SELECT * FROM gradebook_scores WHERE student_id = ?; -- Missing school_id!
```

**Remediation:** Implement PostgreSQL RLS policies:
```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users 
  USING (school_id = current_setting('app.current_school_id')::uuid);
```

---

## Data Lifecycle & Deletion

### Soft Deletes
| Table | Column | Used By |
|---|---|---|
| `users` | `is_active` (016) | `auth.js:192` blocks login |
| `classes` | `is_active` (001) | `class.service.js:153` filters |
| `school_tickets` | `status` (006) | Soft close |
| `gradebook_shared_reports` | `status` (016) | Workflow |

### Hard Deletes (No Soft Delete)
- `messages` — DELETE only
- `announcements` — DELETE only
- `notifications` — DELETE only
- `messages` — DELETE only
- `quiz_attempts` — DELETE only
- `submissions` — DELETE only
- `attendance_records` — DELETE only

### Deletion Issues

1. **`deleteClass` bypasses CASCADE** — 7 manual DELETEs instead of trusting FK CASCADE (see BL-ENR-005)
2. **No archive tables** — Deleted data gone forever
3. **No point-in-time recovery** — Daily full backup only, no WAL archiving
4. **No fiscal year closure** — Financial records never archived/closed

---

## Backup & Recovery

### Current State
- **Backup:** Daily `fs.copyFileSync()` of entire SQLite file (dbMaintenance.js)
- **Retention:** 14 days (pruneOldBackups)
- **Verification:** **None** — No `PRAGMA integrity_check`, no checksum
- **Location:** Same disk (`./db_backups/`) — **Single point of failure**
- **Restore:** Manual `sqlite3` commands, no automation
- **PITR:** **Not supported** — No WAL archiving

### Risks
| Scenario | Data Loss | Detection | Recovery Time |
|---|---|---|---|
| Disk failure | **All data + backups** | Immediate | Hours (manual) |
| SQLite corruption | **Uncommitted + possibly committed** | Next backup check | Hours |
| Bad migration | **Schema + data** | Deploy failure | Manual fix + restore |
| Accidental DELETE | **Affected rows** | When noticed | Hours (manual) |
| Ransomware | **All data + backups** | Immediate | Impossible |

---

## Query Performance Risks

### N+1 Queries Identified
| Location | Pattern | Impact |
|---|---|---|
| `analytics.routes.js:41-70` | Per-class loop: 4 queries × N classes | 800 queries for 200 classes |
| `gradebook.routes.js:592-637` | Per-class categories + scores | 3 queries × N classes |
| `message.service.js:80-188` | Per-teacher queries in loop | N queries for directory |

### Missing Indexes for Common Queries
- `tuition_installments(ledger_id, status)` — settlement queries
- `gradebook_scores(student_id, category_id)` — covered by unique
- `messages(sender_id, receiver_id, sent_at)` — exists

---

## Recommendations Priority

### P0 (Immediate)
1. Add `db.transaction()` to all 15+ multi-write operations
2. Add missing CHECK/UNIQUE constraints (10+ constraints)
3. Fix `messages.class_id` SET NULL → CASCADE
4. Fix `schools→classes` SET NULL → prevent delete or CASCADE
5. Add `UNIQUE (ledger_id, installment_number)` + `UNIQUE (ledger_id, authority)`
5. Add `CHECK` constraints on financial/academic tables

### P1 (Week 1-2)
1. Wrap all multi-write operations in `db.transaction()`
2. Add `UNIQUE (ledger_id, installment_number)` + authority
3. Add CHECK constraints on financial/academic tables
4. Fix CASCADE on messages/schools
5. Add missing indexes for analytics/finance queries
6. Implement PG RLS policies (when PG adopted)

### P2 (Month 1)
1. Add grade history table + triggers
2. Implement backup integrity_check + SHA256 manifest
3. Add off-site backup replication (S3/GCS)
4. Implement PITR (WAL archiving) for PostgreSQL
5. Add fiscal year closure / archival process
6. Add automated migration validation in CI (PG + SQLite)

---

*Database assessment based on static analysis of 17 migration files, knexfile, and application code. No database modifications performed.*