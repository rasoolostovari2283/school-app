/**
 * Migration 016: Production Schema Hardening
 * - Replaces global unique indexes on users(email) and users(phone) with composite
 *   school-scoped unique indexes (school_id, email) and (school_id, phone) to support
 *   teachers and parents working across multiple schools.
 * - Adds users.is_active (boolean, default true) for soft-deactivation and immediate
 *   access revocation without breaking historical foreign keys.
 * - Moves all runtime DDL (columns & tables) into formal migrations:
 *   users.bio, message_groups.invite_code, videos.target_audience,
 *   audit_logs, live_classroom_sessions, teacher_lesson_plans,
 *   teacher_documents, student_study_notes, gradebook_shared_reports.
 */
exports.up = async function (knex) {
  // 1. Harden users table columns & school-scoped composite unique indexes
  const hasUsers = await knex.schema.hasTable('users');
  if (hasUsers) {
    const hasIsActive = await knex.schema.hasColumn('users', 'is_active');
    const hasBio = await knex.schema.hasColumn('users', 'bio');

    if (!hasIsActive || !hasBio) {
      await knex.schema.alterTable('users', (table) => {
        if (!hasIsActive) {
          table.boolean('is_active').notNullable().defaultTo(true);
        }
        if (!hasBio) {
          table.text('bio').nullable();
        }
      });
    }

    // Replace global unique indexes on email/phone with school-scoped composite unique indexes
    await knex.raw('DROP INDEX IF EXISTS users_email_unique');
    await knex.raw('DROP INDEX IF EXISTS users_phone_unique');
    await knex.raw(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_school_email ON users (school_id, email)'
    );
    await knex.raw(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_school_phone ON users (school_id, phone)'
    );
  }

  // 2. Ensure message_groups.invite_code column exists
  const hasMessageGroups = await knex.schema.hasTable('message_groups');
  if (hasMessageGroups) {
    const hasInviteCode = await knex.schema.hasColumn('message_groups', 'invite_code');
    if (!hasInviteCode) {
      await knex.schema.alterTable('message_groups', (table) => {
        table.string('invite_code').nullable();
      });
    }
  }

  // 3. Ensure videos.target_audience column exists
  const hasVideos = await knex.schema.hasTable('videos');
  if (hasVideos) {
    const hasTargetAudience = await knex.schema.hasColumn('videos', 'target_audience');
    if (!hasTargetAudience) {
      await knex.schema.alterTable('videos', (table) => {
        table.string('target_audience').defaultTo('all');
      });
    }
  }

  // 4. Create audit_logs table if not exists
  const hasAuditLogs = await knex.schema.hasTable('audit_logs');
  if (!hasAuditLogs) {
    await knex.schema.createTable('audit_logs', (t) => {
      t.string('id').primary();
      t.string('user_id').nullable();
      t.string('user_name').nullable();
      t.string('user_role').nullable();
      t.string('action').notNullable();
      t.string('module').notNullable();
      t.string('target_id').nullable();
      t.text('details').nullable();
      t.string('ip_address').nullable();
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.index(['module', 'action']);
      t.index(['created_at']);
    });
  }

  // 5. Create live_classroom_sessions table if not exists
  const hasLiveSessions = await knex.schema.hasTable('live_classroom_sessions');
  if (!hasLiveSessions) {
    await knex.schema.createTable('live_classroom_sessions', (t) => {
      t.string('class_id').primary();
      t.string('teacher_id').nullable();
      t.string('teacher_name').nullable();
      t.string('board_type').defaultTo('white');
      t.integer('current_page').defaultTo(1);
      t.text('board_pages').nullable();
      t.text('doc_state').nullable();
      t.text('strokes').nullable();
      t.text('chat_messages').nullable();
      t.boolean('is_live').defaultTo(false);
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  // 6. Create teacher_lesson_plans table if not exists
  const hasLessonPlans = await knex.schema.hasTable('teacher_lesson_plans');
  if (!hasLessonPlans) {
    await knex.schema.createTable('teacher_lesson_plans', (t) => {
      t.string('id', 36).primary();
      t.string('teacher_id', 36).notNullable();
      t.string('grade').defaultTo('پایه دهم');
      t.integer('day_of_week').defaultTo(0);
      t.integer('period_number').defaultTo(1);
      t.string('start_time').defaultTo('08:00');
      t.string('end_time').defaultTo('09:30');
      t.string('subject').notNullable();
      t.string('class_name').defaultTo('');
      t.string('topic').defaultTo('');
      t.string('session_type').defaultTo('teaching');
      t.string('room').defaultTo('کلاس اصلی');
      t.string('status').defaultTo('upcoming');
      t.text('notes').defaultTo('');
      t.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  // 7. Create teacher_documents table if not exists
  const hasTeacherDocs = await knex.schema.hasTable('teacher_documents');
  if (!hasTeacherDocs) {
    await knex.schema.createTable('teacher_documents', (t) => {
      t.string('id', 36).primary();
      t.string('teacher_id', 36).notNullable();
      t.string('title').notNullable();
      t.string('category').defaultTo('lesson_plan');
      t.string('grade').defaultTo('عمومی');
      t.string('subject').defaultTo('');
      t.text('file_url').notNullable();
      t.string('file_name').defaultTo('');
      t.string('original_name').defaultTo('');
      t.integer('file_size').defaultTo(0);
      t.string('file_type').defaultTo('pdf');
      t.string('academic_term').defaultTo('سال تحصیلی ۱۴۰۵-۱۴۰۴');
      t.text('description').defaultTo('');
      t.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  // 8. Create student_study_notes table if not exists
  const hasStudentNotes = await knex.schema.hasTable('student_study_notes');
  if (!hasStudentNotes) {
    await knex.schema.createTable('student_study_notes', (t) => {
      t.string('id', 36).primary();
      t.string('student_id', 36).notNullable();
      t.string('title').defaultTo('');
      t.text('content').notNullable();
      t.string('color', 20).defaultTo('yellow');
      t.boolean('is_pinned').defaultTo(false);
      t.boolean('is_completed').defaultTo(false);
      t.string('category', 50).defaultTo('general');
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  } else {
    const hasCompletedCol = await knex.schema.hasColumn('student_study_notes', 'is_completed');
    if (!hasCompletedCol) {
      await knex.schema.alterTable('student_study_notes', (t) => {
        t.boolean('is_completed').defaultTo(false);
      });
    }
  }

  // 9. Create gradebook_shared_reports table if not exists
  const hasSharedReports = await knex.schema.hasTable('gradebook_shared_reports');
  if (!hasSharedReports) {
    await knex.schema.createTable('gradebook_shared_reports', (table) => {
      table.string('id', 64).primary();
      table.string('class_id', 64).nullable();
      table.string('teacher_id', 64).nullable();
      table.string('teacher_name', 255).nullable();
      table.string('teacher_code', 64).nullable();
      table.string('class_name', 255).nullable();
      table.string('subject', 255).nullable();
      table.string('grade', 100).nullable();
      table.string('date', 50).nullable();
      table.string('time', 50).nullable();
      table.integer('students_count').defaultTo(0);
      table.float('class_average').defaultTo(0);
      table.float('top_score').defaultTo(0);
      table.float('pass_rate').defaultTo(0);
      table.text('categories').nullable();
      table.text('failing_students').nullable();
      table.text('students').nullable();
      table.text('teacher_note').nullable();
      table.string('status', 50).defaultTo('submitted');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('acknowledged_at').nullable();
    });
  }

  // 10. Ensure quizzes.description and quizzes.attachments columns exist
  const hasQuizzes = await knex.schema.hasTable('quizzes');
  if (hasQuizzes) {
    const hasQuizDesc = await knex.schema.hasColumn('quizzes', 'description');
    const hasQuizAttach = await knex.schema.hasColumn('quizzes', 'attachments');
    if (!hasQuizDesc || !hasQuizAttach) {
      await knex.schema.alterTable('quizzes', (t) => {
        if (!hasQuizDesc) t.text('description').nullable();
        if (!hasQuizAttach) t.text('attachments').defaultTo('[]');
      });
    }
  }
};

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_users_school_email');
  await knex.raw('DROP INDEX IF EXISTS idx_users_school_phone');
};

